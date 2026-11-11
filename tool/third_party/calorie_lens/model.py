"""Calorie Lens: a photo of a meal -> the grams of every ingredient -> nutrition, in one network.

Two models fused end to end:
  * stage 1, IngredientNet: an image backbone (ConvNeXt or DINOv2) and a query decoder with one learned
    query per ingredient. Its last layer is K neurons (K = 253): the grams of each Nutrition5k
    ingredient on the plate, rescaled so they add up to the estimated total mass and tilted toward the
    estimated kcal per gram. Mirrored views of the photo can be averaged inside the same forward pass;
  * stage 2a, NutritionLayer: those K neurons are the input layer of a frozen linear layer whose
    weights are per-gram nutrients (kcal / fat / carb / protein exactly as Nutrition5k labels them,
    fiber / sugars / saturated fat / sodium from a reviewed USDA match) -> nutrition per ingredient
    and in total;
  * stage 2b, NutriText: open vocabulary. Any food name -> nutrients per 100 g; a small transformer
    with its own BPE tokenizer, trained from scratch on USDA FoodData Central. It powers `calculate`.

Single source of truth for architecture, preprocessing and inference, used by the Space, the
Inference Endpoint (handler.py), the training code (training/src/) and anyone using this repo:

    import model
    predictor = model.load("path/to/this/repo", device="cpu")
    predictor.predict("meal.jpg")                    # -> {"ingredients": [...], "totals": {...}, ...}
    predictor.predict("meal.jpg", total_grams=350)   # known plate weight -> exact scale
    predictor.calculate([("grilled salmon", 150), ("white rice", 200)])
"""
from __future__ import annotations

import base64
import binascii
import io
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from huggingface_hub import PyTorchModelHubMixin
from PIL import Image
from torch import nn

REPO_ID = "shalev396/calorie-lens"
FRAMEWORK = "pytorch"
WEIGHTS_FILE = "model.safetensors"
TOKENIZER_FILE = "nutritext_tokenizer.json"
DINO_BASE = "facebook/dinov2-with-registers-base"
DINO_ATTENTION_NAMES = (("attention.attention.query.", "attention.q_proj."), ("attention.attention.key.", "attention.k_proj."),
                        ("attention.attention.value.", "attention.v_proj."), ("attention.output.dense.", "attention.o_proj."))

IMAGE_SIZE = (378, 504)            # (H, W): 4:3, and 27 x 36 patches of 14 px for DINOv2
MEAN = (0.485, 0.456, 0.406)       # ImageNet statistics (both backbones were pretrained with them)
STD = (0.229, 0.224, 0.225)
NUTRIENTS = ("kcal", "fat", "carb", "protein", "fiber", "sugars", "sat_fat", "sodium")   # NutritionLayer columns
NUTRIENT_KEYS = ("kcal", "fat_g", "carb_g", "protein_g", "fiber_g", "sugars_g", "sat_fat_g", "sodium_mg")
TOTALS = ("kcal", "mass", "fat", "carb", "protein")      # the direct totals head (Nutrition5k's five targets)
MAX_LOG_GRAMS = 8.0                # e^8 ~ 3 kg: no single ingredient on a plate weighs more
TILT_MAX = 0.5                     # |a| of the kcal tilt, per kcal/g: oil vs lettuce moves at most e^4.5 relative


def cuda_available() -> bool:
    return torch.cuda.is_available()


# --------------------------------------------------------------------------- preprocessing
def to_pil(image) -> Image.Image:
    """PIL image, file path, raw bytes, base64 / data-URL string or HxWx3 uint8 array -> RGB PIL."""
    if isinstance(image, Image.Image):
        return image.convert("RGB")
    if isinstance(image, np.ndarray):
        return Image.fromarray(np.asarray(image, dtype=np.uint8)).convert("RGB")
    if isinstance(image, (bytes, bytearray)):
        with Image.open(io.BytesIO(image)) as img:
            return img.convert("RGB")
    if isinstance(image, (str, os.PathLike)):
        text = str(image)
        if len(text) < 1024 and Path(text).is_file():
            with Image.open(text) as img:
                return img.convert("RGB")
        payload = text.split(",", 1)[1] if text.startswith("data:") else text
        try:
            return to_pil(base64.b64decode(payload, validate=True))
        except (binascii.Error, ValueError, OSError) as err:
            raise ValueError("expected an image file path or a base64-encoded image") from err
    raise TypeError(f"unsupported image input: {type(image).__name__}")


def fit_box(w: int, h: int, size=IMAGE_SIZE) -> tuple[int, int, int, int]:
    """(left, top, width, height) of a w x h image fitted inside the canvas, aspect kept, centred."""
    H, W = size
    s = min(W / w, H / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    return (W - nw) // 2, (H - nh) // 2, nw, nh


def preprocess(image, size=IMAGE_SIZE) -> torch.Tensor:
    """Any image -> uint8 (3, H, W): resized to fit the 4:3 canvas (aspect kept), padded with the mean
    colour. Overhead scans (4:3) fill it; side views (16:9) and portrait phone photos get bars.
    The network itself scales to [0, 1] and normalises (see CalorieLens.forward)."""
    img = to_pil(image)
    left, top, nw, nh = fit_box(*img.size, size)
    canvas = Image.new("RGB", (size[1], size[0]), tuple(round(255 * m) for m in MEAN))
    canvas.paste(img.resize((nw, nh), Image.BICUBIC), (left, top))
    return torch.from_numpy(np.asarray(canvas).copy()).permute(2, 0, 1)


# --------------------------------------------------------------------------- stage 1: backbones
def sincos_2d(h: int, w: int, d: int, device=None) -> torch.Tensor:
    """Fixed 2-D sine-cosine position code, (h*w, d)."""
    y, x = torch.meshgrid(torch.arange(h, device=device, dtype=torch.float32),
                          torch.arange(w, device=device, dtype=torch.float32), indexing="ij")
    omega = 1.0 / (10000 ** (torch.arange(d // 4, device=device, dtype=torch.float32) / (d // 4)))
    out = [f(c.flatten()[:, None] * omega[None]) for c in (y, x) for f in (torch.sin, torch.cos)]
    return torch.cat(out, dim=1)


def timm_convnext_state(repo: str) -> dict:
    """ConvNeXt weights published by timm on the Hub (e.g. timm/convnext_base.fb_in22k_ft_in1k_384) ->
    torchvision ConvNeXt names. Same architecture; only the names and the layer-scale shape differ."""
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file

    block = {"conv_dw": "block.0", "norm": "block.2", "mlp.fc1": "block.3", "mlp.fc2": "block.5"}
    out = {}
    for key, v in load_file(hf_hub_download(repo, "model.safetensors")).items():
        p = key.split(".")
        if p[0] == "stem":                                       # stem.{0 conv, 1 norm}.*
            out[f"features.0.{p[1]}.{p[2]}"] = v
        elif p[0] == "stages" and p[2] == "downsample":          # stages.i.downsample.{0 norm, 1 conv}.*
            out[f"features.{2 * int(p[1])}.{p[3]}.{p[4]}"] = v
        elif p[0] == "stages":                                   # stages.i.blocks.j.<part>
            base = f"features.{2 * int(p[1]) + 1}.{p[3]}"
            if p[4] == "gamma":
                out[f"{base}.layer_scale"] = v.reshape(-1, 1, 1)
            else:
                out[f"{base}.{block['.'.join(p[4:-1])]}.{p[-1]}"] = v
        elif p[0] == "head" and p[1] in ("norm", "fc"):
            out[f"classifier.{0 if p[1] == 'norm' else 2}.{p[2]}"] = v
    return out


class ConvNeXtFeatures(nn.Module):
    """torchvision ConvNeXt -> stride-16 token map (stage 3 + upsampled stage 4, both projected to d)
    and a pooled vector: stage 4 (+ stage 3 with multi_pool). Stage 4 alone (stride 32) gives blobby
    ingredient heatmaps. weights: a timm Hub repo to start from instead of torchvision's ImageNet-1k."""

    def __init__(self, arch: str = "convnext_base", d: int = 256, pretrained: bool = False, drop_path: float = 0.1,
                 weights: str | None = None, multi_pool: bool = False):
        super().__init__()
        import torchvision

        # torchvision's convnext_base defaults to drop-path 0.5, far too strong for fine-tuning a regressor
        net = getattr(torchvision.models, arch)(weights="IMAGENET1K_V1" if pretrained and not weights else None,
                                                stochastic_depth_prob=drop_path)
        if pretrained and weights:
            net.load_state_dict(timm_convnext_state(weights), strict=True)
        self.to_stage3 = net.features[:6]          # stem, stage 1, down, stage 2, down, stage 3
        self.to_stage4 = net.features[6:]          # down, stage 4
        c3 = net.features[5][-1].block[0].in_channels
        c4 = net.features[7][-1].block[0].in_channels
        self.proj3, self.proj4 = nn.Conv2d(c3, d, 1), nn.Conv2d(c4, d, 1)
        self.norm = nn.LayerNorm(d)
        self.multi_pool = bool(multi_pool)
        self.pooled_dim = c4 + (c3 if self.multi_pool else 0)

    def stages(self) -> list[nn.Module]:
        """Backbone parts from input to output (layer-wise learning-rate decay groups)."""
        f = list(self.to_stage3) + list(self.to_stage4)
        return [nn.ModuleList(f[0:2]), nn.ModuleList(f[2:4]), nn.ModuleList(f[4:6]), nn.ModuleList(f[6:8])]

    def forward(self, x: torch.Tensor):
        s3 = self.to_stage3(x)
        s4 = self.to_stage4(s3)
        fmap = self.proj3(s3) + F.interpolate(self.proj4(s4), size=s3.shape[-2:], mode="bilinear", align_corners=False)
        h, w = fmap.shape[-2:]
        pooled = s4.mean(dim=(2, 3))
        if self.multi_pool:
            pooled = torch.cat([s3.mean(dim=(2, 3)), pooled], dim=1)
        return self.norm(fmap.flatten(2).transpose(1, 2)), (h, w), pooled


class DinoFeatures(nn.Module):
    """DINOv2 (with registers) ViT from `transformers` -> patch tokens projected to d, and the CLS token
    (+ the mean patch token with multi_pool). Position embeddings are interpolated to the 27 x 36 patch
    grid by the model itself."""

    def __init__(self, backbone_config: dict | None = None, d: int = 256, pretrained: bool = False,
                 drop_path: float = 0.1, base_model: str = DINO_BASE, multi_pool: bool = False):
        super().__init__()
        from transformers import AutoConfig, AutoModel

        if pretrained:
            self.vit = AutoModel.from_pretrained(base_model, drop_path_rate=drop_path)
        else:
            config = AutoConfig.for_model(**backbone_config) if backbone_config else AutoConfig.from_pretrained(base_model)
            self.vit = AutoModel.from_config(config)
        cfg = self.vit.config
        self.patch, self.skip = cfg.patch_size, 1 + getattr(cfg, "num_register_tokens", 0)
        self.proj, self.norm = nn.Linear(cfg.hidden_size, d), nn.LayerNorm(d)
        self.multi_pool = bool(multi_pool)
        self.pooled_dim = cfg.hidden_size * (2 if self.multi_pool else 1)

    def stages(self) -> list[nn.Module]:
        return [self.vit.embeddings, *self.vit.encoder.layer, self.vit.layernorm]

    def _load_from_state_dict(self, state_dict, prefix, *args, **kwargs):
        """transformers 5.18 renamed DINOv2's attention weights (attention.attention.query -> attention.q_proj, ...,
        attention.output.dense -> attention.o_proj): read weights saved with either version."""
        new = hasattr(self.vit.encoder.layer[0].attention, "q_proj")
        for old_name, new_name in DINO_ATTENTION_NAMES:
            src, dst = (old_name, new_name) if new else (new_name, old_name)
            for key in [k for k in state_dict if k.startswith(prefix) and src in k]:
                state_dict[key.replace(src, dst)] = state_dict.pop(key)
        super()._load_from_state_dict(state_dict, prefix, *args, **kwargs)

    def forward(self, x: torch.Tensor):
        hidden = self.vit(pixel_values=x).last_hidden_state
        h, w = x.shape[-2] // self.patch, x.shape[-1] // self.patch
        patches = hidden[:, self.skip:]
        pooled = torch.cat([hidden[:, 0], patches.mean(1)], dim=1) if self.multi_pool else hidden[:, 0]
        return self.norm(self.proj(patches)), (h, w), pooled


class DecoderLayer(nn.Module):
    """Pre-norm cross-attention (queries -> image tokens) + MLP. No query self-attention (ML-Decoder)."""

    def __init__(self, d: int, heads: int, mlp_ratio: int = 4):
        super().__init__()
        self.norm_q, self.norm_kv, self.norm_mlp = nn.LayerNorm(d), nn.LayerNorm(d), nn.LayerNorm(d)
        self.attn = nn.MultiheadAttention(d, heads, batch_first=True)
        self.mlp = nn.Sequential(nn.Linear(d, mlp_ratio * d), nn.GELU(), nn.Linear(mlp_ratio * d, d))

    def forward(self, q, kv, pos, need_weights: bool = False):
        kv = self.norm_kv(kv)
        out, attn = self.attn(self.norm_q(q), kv + pos, kv, need_weights=need_weights, average_attn_weights=True)
        q = q + out
        return q + self.mlp(self.norm_mlp(q)), attn


class QueryDecoder(nn.Module):
    """One learned query per ingredient reads the image tokens; each ingredient then has its own output
    weights: a presence logit and its log-grams given that it is present."""

    def __init__(self, k: int, d: int = 256, layers: int = 2, heads: int = 8):
        super().__init__()
        self.queries = nn.Parameter(torch.randn(k, d) * 0.02)
        self.layers = nn.ModuleList(DecoderLayer(d, heads) for _ in range(layers))
        self.norm = nn.LayerNorm(d)
        self.presence_w, self.presence_b = nn.Parameter(torch.randn(k, d) * 0.02), nn.Parameter(torch.zeros(k))
        self.grams_w, self.grams_b = nn.Parameter(torch.randn(k, d) * 0.02), nn.Parameter(torch.zeros(k))

    def forward(self, tokens: torch.Tensor, grid: tuple[int, int], return_attn: bool = False):
        pos = sincos_2d(*grid, tokens.shape[-1], tokens.device).to(tokens.dtype)[None]
        q, attn = self.queries[None].expand(tokens.shape[0], -1, -1), None
        for i, layer in enumerate(self.layers):
            q, attn = layer(q, tokens, pos, need_weights=return_attn and i == len(self.layers) - 1)
        with torch.autocast(q.device.type, enabled=False):     # outputs in fp32: bf16 would quantise grams by ~1.6 %
            q = self.norm(q.float())
            logits = torch.einsum("nkd,kd->nk", q, self.presence_w) + self.presence_b
            log_grams = (torch.einsum("nkd,kd->nk", q, self.grams_w) + self.grams_b).clamp(-6.0, MAX_LOG_GRAMS)
        return logits, log_grams, attn


def tta_views(x: torch.Tensor, n: int) -> torch.Tensor:
    """(N, 3, H, W) -> (n x N, 3, H, W): the image, its mirror image (n >= 2), then upside down and rotated
    180 degrees (n = 4). Overhead scans trained under any rotation and flip, side views under mirroring."""
    return torch.cat([x, x.flip(-1), x.flip(-2), x.flip(-2, -1)][:n]) if n > 1 else x


# --------------------------------------------------------------------------- stage 2a
class NutritionLayer(nn.Module):
    """K grams -> nutrients: a bias-free linear layer whose (K, D) weights are per-gram nutrient values.
    Frozen (a buffer, not a parameter): Nutrition5k's own labels are exactly grams x this table."""

    def __init__(self, densities):
        super().__init__()
        self.register_buffer("weight", torch.as_tensor(densities, dtype=torch.float32), persistent=False)

    def forward(self, grams: torch.Tensor):
        """(N, K) grams -> (N, K, D) per-ingredient nutrients, (N, D) totals (always fp32)."""
        with torch.autocast(grams.device.type, enabled=False):
            grams, w = grams.float(), self.weight.float()
            return grams[..., None] * w, grams @ w


# --------------------------------------------------------------------------- stage 2b
class NutriText(nn.Module):
    """Food name -> nutrients per 100 g. A small pre-norm transformer encoder over BPE tokens, trained
    from scratch on USDA FoodData Central names. Outputs are physically bounded by construction:
      * grams of protein, fat, available carbohydrate, fiber, alcohol, water and "other" come from a
        softmax x 100 g, so they can never exceed 100 g (carb = available carb + fiber, as USDA reports);
      * sugars = available carb x sigmoid, saturated fat = fat x sigmoid;
      * kcal = Atwater energy of that composition (4/9/4/2/7 kcal/g) x exp(0.3 tanh(r)): the label's
        own factors may differ a little, never wildly;
      * sodium (mg) from log1p space.
    """

    COMPOSITION = ("protein", "fat", "avail_carb", "fiber", "alcohol", "water", "other")
    ATWATER = (4.0, 9.0, 4.0, 2.0, 7.0, 0.0, 0.0)

    def __init__(self, vocab_size: int, d: int = 256, layers: int = 4, heads: int = 4, max_len: int = 48,
                 dropout: float = 0.1):
        super().__init__()
        self.max_len = max_len
        self.tok, self.pos = nn.Embedding(vocab_size, d, padding_idx=0), nn.Embedding(max_len, d)
        block = nn.TransformerEncoderLayer(d, heads, 4 * d, dropout, activation="gelu", batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(block, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d)
        self.head = nn.Sequential(nn.Linear(d, d), nn.GELU(), nn.Linear(d, len(self.COMPOSITION) + 4))
        self.register_buffer("atwater", torch.tensor(self.ATWATER), persistent=False)

    def forward(self, ids: torch.Tensor, mask: torch.Tensor) -> dict[str, torch.Tensor]:
        """(N, T) token ids + attention mask (1 = token) -> dict of (N,) values per 100 g."""
        t = torch.arange(ids.shape[1], device=ids.device)
        h = self.encoder(self.tok(ids) + self.pos(t)[None], src_key_padding_mask=~mask.bool())
        m = mask[..., None].to(h.dtype)
        out = self.head(self.norm((h * m).sum(1) / m.sum(1).clamp_min(1.0)))
        comp = out[:, :len(self.COMPOSITION)].softmax(-1) * 100.0
        r, s, f, na = out[:, len(self.COMPOSITION):].unbind(-1)
        c = dict(zip(self.COMPOSITION, comp.unbind(-1)))
        return {
            "kcal": (comp @ self.atwater.to(comp.dtype)) * torch.exp(0.3 * torch.tanh(r)),
            "protein": c["protein"], "fat": c["fat"], "carb": c["avail_carb"] + c["fiber"], "fiber": c["fiber"],
            "sugars": c["avail_carb"] * torch.sigmoid(s), "sat_fat": c["fat"] * torch.sigmoid(f),
            "sodium": torch.expm1(F.softplus(na).clamp(max=11.0)), "water": c["water"], "alcohol": c["alcohol"],
        }


def tokenize(tokenizer, names: list[str], max_len: int) -> tuple[torch.Tensor, torch.Tensor]:
    """`tokenizers.Tokenizer` + names -> padded (N, T) ids and mask (pad id 0, truncated to max_len)."""
    encs = [tokenizer.encode(n).ids[:max_len] or [0] for n in names]
    T = max(len(e) for e in encs)
    ids = torch.zeros(len(encs), T, dtype=torch.long)
    for i, e in enumerate(encs):
        ids[i, :len(e)] = torch.tensor(e)
    return ids, (ids != 0) | (torch.arange(T)[None] == 0)


# --------------------------------------------------------------------------- the fused model
class CalorieLens(
    nn.Module,
    PyTorchModelHubMixin,
    tags=["ml-lab", "image-classification", "food", "nutrition", "calorie-estimation"],
    repo_url="https://github.com/shalev396/ml-lab",
    pipeline_tag="image-classification",
    license="mit",
):
    """Image -> ingredient grams (stage 1) -> nutrition (stage 2a), plus NutriText (stage 2b).

    Args:
        ingredients / ingredient_ids: the K ingredients, in output-neuron order.
        densities: (K, 8) per-gram values in NUTRIENTS order (sodium in mg); the NutritionLayer weights.
        density_sources: per ingredient, where the four extended columns come from ("usda_match" | "none").
        mean_density: per-gram nutrients of the average training plate, for mass no ingredient explains.
        backbone: "convnext_base" (any torchvision ConvNeXt name) or "dinov2".
        backbone_config: the DINOv2 `transformers` config as a dict, to rebuild it offline.
        image_size: (H, W) of the input canvas.
        mass_blend: weight of the direct mass head vs the sum of the ingredient grams (log space), fitted on val.
        kcal_blend: weight of the direct head's kcal per gram vs the ingredients' own (log space), fitted on val;
            the grams are tilted toward it (see `tilt`). 0 = the ingredients alone.
        kcal_scale: share (0-1, fitted on val) of the kcal the tilt could not reach (e.g. a plate of one
            ingredient) that is closed by rescaling the grams instead; never used with total_grams.
        backbone_weights: where the pretrained backbone came from (a timm ConvNeXt or a DINOv2 Hub repo; None =
            torchvision ImageNet-1k / DINOv2-B with registers). Only read when pretrained=True; kept as a record.
        multi_pool: the totals head also reads ConvNeXt stage 3 (or the DINOv2 mean patch token).
        tta_views: 1, 2 (+ mirror image) or 4 (+ upside down, rotated 180 degrees) views averaged per photo.
        presence_threshold, display_min_grams: which ingredients `predict` lists (the rest is "other").
        nutritext: NutriText kwargs (vocab_size, d, layers, heads, max_len) or None.
        pretrained: start the backbone from its pretrained weights (training only; `load` never does).
    """

    def __init__(self, ingredients: list[str], ingredient_ids: list[int], densities: list[list[float]],
                 density_sources: list[str] | None = None, mean_density: list[float] | None = None,
                 backbone: str = "convnext_base", backbone_config: dict | None = None,
                 image_size: list[int] = IMAGE_SIZE, d_model: int = 256, decoder_layers: int = 2, heads: int = 8,
                 drop_path: float = 0.1, backbone_weights: str | None = None, multi_pool: bool = False,
                 mass_blend: float = 1.0, kcal_blend: float = 0.0, kcal_scale: float = 0.0, tta_views: int = 1,
                 presence_threshold: float = 0.5,
                 display_min_grams: float = 3.0, nutritext: dict | None = None, pretrained: bool = False):
        super().__init__()
        self.ingredients, self.ingredient_ids = list(ingredients), list(ingredient_ids)
        self.density_sources = list(density_sources or ["none"] * len(self.ingredients))
        self.mean_density = list(mean_density or [0.0] * len(NUTRIENTS))
        self.backbone_name, self.backbone_weights, self.image_size = backbone, backbone_weights, tuple(image_size)
        self.mass_blend, self.kcal_blend, self.kcal_scale = float(mass_blend), float(kcal_blend), float(kcal_scale)
        self.tta_views = int(tta_views)
        self.presence_threshold, self.display_min_grams = float(presence_threshold), float(display_min_grams)
        if backbone == "dinov2":
            self.backbone = DinoFeatures(backbone_config, d_model, pretrained, drop_path, backbone_weights or DINO_BASE, multi_pool)
        else:
            self.backbone = ConvNeXtFeatures(backbone, d_model, pretrained, drop_path, backbone_weights, multi_pool)
        self.decoder = QueryDecoder(len(self.ingredients), d_model, decoder_layers, heads)
        self.totals_head = nn.Sequential(nn.LayerNorm(self.backbone.pooled_dim), nn.Linear(self.backbone.pooled_dim, 512),
                                         nn.GELU(), nn.Linear(512, len(TOTALS)))
        self.nutrition = NutritionLayer(densities)
        self.nutritext = NutriText(**nutritext) if nutritext else None
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1), persistent=False)
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1), persistent=False)

    @staticmethod
    def reconcile(soft: torch.Tensor, mass_direct: torch.Tensor, blend: float,
                  total_grams: torch.Tensor | None = None, clamp=(0.2, 5.0)) -> torch.Tensor:
        """Rescale the ingredient grams so they sum to the estimated plate mass.

        M = exp(blend * log1p(direct mass) + (1 - blend) * log1p(sum of grams)) - 1, or the user's
        total_grams (then exact, no clamp). The clamp keeps one bad estimate from blowing the other up.
        """
        items = soft.sum(-1)
        if total_grams is not None:
            return soft * (total_grams / items.clamp_min(1e-6))[..., None]
        log_m = blend * torch.log1p(mass_direct) + (1.0 - blend) * torch.log1p(items)
        scale = (torch.expm1(log_m) / items.clamp_min(1.0)).clamp(*clamp)
        return soft * scale[..., None]

    @staticmethod
    def target_kcal_per_gram(grams: torch.Tensor, log_totals: torch.Tensor, kcal_per_g: torch.Tensor,
                             blend: float) -> torch.Tensor:
        """(N,) kcal per gram the plate should have: the direct head's (its kcal / its mass) and the
        ingredients' own, blended in log space. It does not depend on the mass, so it holds with total_grams."""
        direct = torch.expm1(log_totals[:, :2].float().clamp(0.0, MAX_LOG_GRAMS))
        rho_direct = direct[:, 0] / direct[:, 1].clamp_min(1.0)
        g = grams.float()
        rho_items = (g @ kcal_per_g.float()) / g.sum(-1).clamp_min(1e-6)
        return torch.exp(blend * torch.log(rho_direct.clamp_min(1e-3)) + (1 - blend) * torch.log(rho_items.clamp_min(1e-3)))

    @staticmethod
    def tilt(grams: torch.Tensor, kcal_per_g: torch.Tensor, target: torch.Tensor, max_a: float = TILT_MAX,
             iters: int = 30) -> torch.Tensor:
        """Exponential tilt of the composition: grams_k x exp(a x kcal_per_g_k), rescaled to the same total mass,
        with a per plate (|a| <= max_a, found by bisection) so that the plate's kcal per gram is `target`.
        Of all compositions with this mass and these kcal it is the closest to the original (minimum KL):
        denser ingredients gain a little when the plate should be denser, so rows still add up to the totals."""
        with torch.autocast(grams.device.type, enabled=False):
            g, rho = grams.float(), kcal_per_g.float()
            rho = rho - rho.mean()                        # same tilt, smaller exponents
            mass = g.sum(-1, keepdim=True)
            goal = target.float()[:, None] - kcal_per_g.float().mean()
            lo, hi = torch.full_like(mass, -max_a), torch.full_like(mass, max_a)
            for _ in range(iters):                        # mean kcal per gram rises monotonically with a
                a = (lo + hi) / 2
                w = g * torch.exp(a * rho)
                low = (w @ rho)[:, None] < goal * w.sum(-1, keepdim=True)
                lo, hi = torch.where(low, a, lo), torch.where(low, hi, a)
            w = g * torch.exp((lo + hi) / 2 * rho)
            return w * (mass / w.sum(-1, keepdim=True).clamp_min(1e-12))

    @classmethod
    def read_grams(cls, soft: torch.Tensor, log_totals: torch.Tensor, kcal_per_g: torch.Tensor, mass_blend: float,
                   kcal_blend: float = 0.0, kcal_scale: float = 0.0, total_grams: torch.Tensor | None = None):
        """The K gram neurons from the raw outputs: rescaled to the plate mass (reconcile), tilted toward the
        blended kcal per gram (kcal_blend > 0), then the kcal the tilt could not reach closed by kcal_scale of a
        rescale (not with total_grams). -> grams (N, K), and the mass the reconcile clamp could give to no
        ingredient (N,), rescaled alike (Predictor puts it in "other")."""
        mass_direct = torch.expm1(log_totals[:, 1].float().clamp(0.0, MAX_LOG_GRAMS))
        items = soft.float().sum(-1)
        grams = cls.reconcile(soft, mass_direct, mass_blend, total_grams)
        if total_grams is not None:
            target_mass = total_grams.float()
        else:
            target_mass = torch.expm1(mass_blend * torch.log1p(mass_direct) + (1 - mass_blend) * torch.log1p(items))
        gap = (target_mass - grams.float().sum(-1)).clamp_min(0.0)
        if kcal_blend > 0:
            target = cls.target_kcal_per_gram(grams, log_totals, kcal_per_g, kcal_blend)
            grams = cls.tilt(grams, kcal_per_g, target)
            if kcal_scale > 0 and total_grams is None:
                g = grams.float()
                ratio = (target * g.sum(-1) / (g @ kcal_per_g.float()).clamp_min(1e-6)).clamp(0.5, 2.0) ** kcal_scale
                grams, gap = grams * ratio[:, None], gap * ratio
        return grams, gap

    def forward(self, x: torch.Tensor, total_grams: torch.Tensor | None = None, return_attn: bool = False,
                return_features: bool = False) -> dict[str, torch.Tensor]:
        """(N, 3, H, W) images in [0, 1] -> dict:
        logits, log_grams (N, K): presence and conditional grams; soft (N, K) = sigmoid(logits) x grams;
        log_totals (N, 5): direct head in log1p space (TOTALS); grams (N, K): the reconciled K neurons;
        nutrients (N, K, 8) and totals (N, 8) from the NutritionLayer; optionally attn / tokens.
        With tta_views > 1, presence probabilities, soft grams and log totals are the mean over the views;
        attn / tokens are those of the photo itself."""
        n = x.shape[0]
        tokens, grid, pooled = self.backbone(tta_views((x - self.mean) / self.std, self.tta_views))
        logits, log_grams, attn = self.decoder(tokens, grid, return_attn)
        with torch.autocast(x.device.type, enabled=False):
            log_totals = self.totals_head(pooled.float())
        if self.tta_views > 1:
            per_view = lambda t: t.float().reshape(self.tta_views, n, *t.shape[1:])
            prob = per_view(torch.sigmoid(logits.float())).mean(0)
            soft = per_view(torch.sigmoid(logits.float()) * torch.exp(log_grams.float())).mean(0)
            log_totals = per_view(log_totals).mean(0)
            p = prob.clamp(1e-6, 1 - 1e-6)
            logits = torch.log(p) - torch.log1p(-p)
            log_grams = torch.log(soft.clamp_min(1e-12) / p).clamp(-6.0, MAX_LOG_GRAMS)
            tokens, attn = tokens[:n], None if attn is None else attn[:n]
        else:
            soft = torch.sigmoid(logits.float()) * torch.exp(log_grams.float())
        mass_direct = torch.expm1(log_totals[:, 1].float().clamp(0.0, MAX_LOG_GRAMS))
        grams, mass_gap = self.read_grams(soft, log_totals, self.nutrition.weight[:, 0], self.mass_blend,
                                          self.kcal_blend, self.kcal_scale, total_grams)
        nutrients, totals = self.nutrition(grams)
        out = {"logits": logits, "log_grams": log_grams, "soft": soft, "log_totals": log_totals,
               "mass_direct": mass_direct, "grams": grams, "mass_gap": mass_gap, "nutrients": nutrients, "totals": totals}
        if return_attn:
            out["attn"], out["grid"] = attn, grid
        if return_features:
            out["tokens"], out["grid"] = tokens, grid
        return out


# --------------------------------------------------------------------------- inference
def _heat_overlay(base: Image.Image, heat: np.ndarray, box) -> Image.Image:
    """Attention map (h, w) -> red-yellow overlay on the canvas image, cropped back to the photo."""
    left, top, nw, nh = box
    heat = (heat - heat.min()) / (heat.max() - heat.min() + 1e-8)
    hm = np.asarray(Image.fromarray((heat * 255).astype(np.uint8)).resize(base.size, Image.BICUBIC), dtype=np.float32) / 255
    rgb = np.stack([np.ones_like(hm), np.clip(2 * hm - 0.6, 0, 1), np.zeros_like(hm)], -1) * 255
    alpha = (0.65 * np.clip(hm * 1.4 - 0.2, 0, 1))[..., None]
    out = np.asarray(base, dtype=np.float32) * (1 - alpha) + rgb * alpha
    return Image.fromarray(out.astype(np.uint8)).crop((left, top, left + nw, top + nh))


class Predictor:
    """Loads the weights (+ the NutriText tokenizer) once; analyses photos and food lists."""

    def __init__(self, model_dir: str | Path, device: str = "cpu"):
        model_dir = Path(model_dir)
        if not (model_dir / WEIGHTS_FILE).is_file():
            raise FileNotFoundError(
                f"{WEIGHTS_FILE} not found in {model_dir}: train/export the model first "
                f"or download it with huggingface_hub.snapshot_download('{REPO_ID}').")
        self.device = torch.device(device)
        self.model = CalorieLens.from_pretrained(model_dir, pretrained=False, map_location="cpu", strict=True)
        self.model.to(self.device).eval()
        self.tokenizer = None
        if self.model.nutritext is not None and (model_dir / TOKENIZER_FILE).is_file():
            from tokenizers import Tokenizer

            self.tokenizer = Tokenizer.from_file(str(model_dir / TOKENIZER_FILE))
        self.index = {n.lower(): i for i, n in enumerate(self.model.ingredients)}

    def _row(self, name: str, grams: float, per_gram, **extra) -> dict:
        row = {"name": name, "grams": round(float(grams), 1), **extra}
        row.update({k: round(float(grams) * float(v), 2) for k, v in zip(NUTRIENT_KEYS, per_gram)})
        return row

    def _summarise(self, out: dict, top_k: int, total_grams: float | None) -> dict:
        """Listed ingredients (confident and >= display_min_grams, heaviest first) + one "other" row with
        everything else, so the rows add up to the totals exactly."""
        m = self.model
        grams, prob = out["grams"][0].float().cpu().numpy(), torch.sigmoid(out["logits"][0].float()).cpu().numpy()
        dens = m.nutrition.weight.cpu().numpy()
        shown = [k for k in np.argsort(-grams) if prob[k] >= m.presence_threshold and grams[k] >= m.display_min_grams][:top_k]
        rows = [self._row(m.ingredients[k], grams[k], dens[k], confidence=round(float(prob[k]), 3),
                          extended=m.density_sources[k]) for k in shown]
        rest = np.setdiff1d(np.arange(len(grams)), shown)
        other_g, other_n = float(grams[rest].sum()), grams[rest] @ dens[rest]
        # mass the reconcile clamp could not give to any ingredient (e.g. nothing recognised): average plate
        gap = float(out["mass_gap"][0])
        other_g, other_n = other_g + gap, other_n + gap * np.asarray(m.mean_density)
        other = self._row("other (unidentified)", other_g, other_n / other_g if other_g > 0 else np.zeros(len(NUTRIENTS)))
        totals = np.asarray([sum(r[k] for r in rows) + other[k] for k in NUTRIENT_KEYS])
        direct = torch.expm1(out["log_totals"][0].float().clamp_min(0)).cpu().numpy()
        return {"ingredients": rows, "other": other,
                "totals": {"mass_g": round(float(grams.sum()) + gap, 1), **{k: round(float(v), 2) for k, v in zip(NUTRIENT_KEYS, totals)}},
                "direct_estimate": {"mass_g": round(float(direct[1]), 1),
                                    **{k: round(float(direct[i]), 2) for i, k in ((0, "kcal"), (2, "fat_g"), (3, "carb_g"), (4, "protein_g"))}}}

    @torch.inference_mode()
    def _forward(self, image, total_grams: float | None, return_attn: bool):
        img = to_pil(image)
        x = preprocess(img, self.model.image_size)[None].to(self.device).float() / 255.0
        tg = torch.tensor([float(total_grams)], device=self.device) if total_grams else None
        return img, self.model(x, total_grams=tg, return_attn=return_attn)

    def predict(self, image, total_grams: float | None = None, top_k: int = 12) -> dict:
        """Meal photo -> {"ingredients": [{name, grams, confidence, kcal, fat_g, ...}], "other": {...},
        "totals": {mass_g, kcal, ...}, "direct_estimate": {...}}. Rows add up to the totals exactly.
        total_grams: the plate's food weight if known (kitchen scale) - fixes the scale exactly."""
        _, out = self._forward(image, total_grams, False)
        return self._summarise(out, top_k, total_grams)

    def analyze(self, image, total_grams: float | None = None, top_k: int = 12) -> tuple[dict, dict[str, Image.Image]]:
        """predict() + {ingredient name: heatmap of where its query looked} from the same forward pass."""
        img, out = self._forward(image, total_grams, True)
        result = self._summarise(out, top_k, total_grams)
        h, w = out["grid"]
        box = fit_box(*img.size, self.model.image_size)
        base = Image.fromarray(preprocess(img, self.model.image_size).permute(1, 2, 0).numpy())
        attn = out["attn"][0].float().cpu().numpy()
        maps = {r["name"]: _heat_overlay(base, attn[self.index[r["name"].lower()]].reshape(h, w), box)
                for r in result["ingredients"]}
        return result, maps

    @torch.inference_mode()
    def nutrients_per_100g(self, names: list[str]) -> list[tuple[list[float], str]]:
        """Food names -> (per-100 g values in NUTRIENTS order, source). Names of the K known ingredients
        use their exact table row ("table"); anything else goes through NutriText ("nutritext")."""
        out, unknown = [None] * len(names), []
        for i, n in enumerate(names):
            k = self.index.get(n.strip().lower())
            if k is not None:
                out[i] = ((self.model.nutrition.weight[k].cpu() * 100).tolist(), "table")
            else:
                unknown.append(i)
        if unknown:
            if self.tokenizer is None:
                raise RuntimeError("this model was exported without NutriText; only known ingredient names work")
            nt = self.model.nutritext
            ids, mask = tokenize(self.tokenizer, [names[i] for i in unknown], nt.max_len)
            pred = nt(ids.to(self.device), mask.to(self.device))
            vals = torch.stack([pred[n] for n in NUTRIENTS], -1).float().cpu()
            for j, i in enumerate(unknown):
                out[i] = (vals[j].tolist(), "nutritext")
        return out

    def calculate(self, rows) -> dict:
        """[(food name, grams), ...] (or dicts with "name"/"grams") -> per-row nutrition + totals."""
        rows = [(r["name"], r["grams"]) if isinstance(r, dict) else tuple(r) for r in rows]
        rows = [(str(n).strip(), float(g)) for n, g in rows if str(n).strip() and g is not None and float(g) > 0]
        if not rows:
            return {"items": [], "totals": {"mass_g": 0.0, **{k: 0.0 for k in NUTRIENT_KEYS}}}
        per100 = self.nutrients_per_100g([n for n, _ in rows])
        items = [self._row(n, g, np.asarray(v) / 100.0, source=src) for (n, g), (v, src) in zip(rows, per100)]
        totals = {"mass_g": round(sum(g for _, g in rows), 1),
                  **{k: round(sum(it[k] for it in items), 2) for k in NUTRIENT_KEYS}}
        return {"items": items, "totals": totals}


def load(model_dir: str | Path, device: str = "cpu") -> Predictor:
    return Predictor(model_dir, device)
