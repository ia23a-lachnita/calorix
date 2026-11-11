# Open-source food-model reuse audit

Existing projects provide reusable trained food-mass and nutrition models. We retain Calorix's working capture, edit, save and privacy workflow and test released weights as challengers. We also test their mass estimates with retained A1 food identities and nutrient sources. This audit does not change the production model.

| Project / pinned source | Available assets | Decision and limitations |
|---|---|---|
| [Plate-Vision](https://github.com/simonkundrik/plate-vision/tree/d5690063cc8795497c603aa676f97fd253053bbf) | Android/browser integration, MIT code, released ONNX and decoding metadata; 33,995,501-byte weights | Run a bounded CPU benchmark. Publisher marks weights for research use only; do not distribute them in Calorix. |
| [Dish2Calories](https://github.com/AmirrrezaZ/dish2calories/tree/23858d3a8c7e9a036fc36e4f6ac7e882f61aa950) | MIT repository, 16,754,310-byte ONNX, independent mass head and ingredient nutrient table | Test direct nutrition and mass separately. Its 75-ingredient vocabulary omits pasta and bread. Source expands dishes into photo rows before splitting those rows, permitting dish overlap. Exact checkpoint membership is unknown; our Nutrition5k result cannot establish held-out superiority. |
| [Calorie Lens](https://huggingface.co/shalev396/calorie-lens/tree/f0d34a638b6b572e2df601067881b56fe6848c79) | Complete implementation, configuration and 378,588,160-byte safetensors; 253 ingredient-gram queries feeding a frozen nutrient table; MIT and Apache DINO notices | Closest complete ingredient → grams → nutrient implementation. Candidate for a subsequent bounded CPU run. Trained with Nutrition5k, Flavoria and USDA data; publisher metrics need same-image verification. |
| [NutriConsistNet](https://huggingface.co/arunapb/nutriconsistnet/tree/2a3d367ebc22df93d077c3833a7c92bdf16d6614) | 98.6 MB checkpoint, training means and model card; CC-BY-4.0 | Published package lacks the model class and links no runnable training notebook. Not reproducible from those released files alone. |
| [FoodCNN](https://github.com/FoodCNN/FoodCNN/tree/2c944166f988acff4374d131b8b1fe535a64abf6) | MIT code, ResNet34/WeightCNN checkpoints and inference source | Later inspection of the pinned training notebook found image-row splitting after collecting multiple frames per dish, permitting dish overlap. Exact checkpoint membership remains unverified; its tiny mass head was not benchmarked. “Zero-shot” in its README does not establish absence of Nutrition5k training. |
| [FoodLMM](https://github.com/YuehaoYin/FoodLMM/tree/b1c52d8ea94ef19e4801dbb5a13673732bafce27) | Apache code, specialized multimodal/segmentation framework and linked model | GPU-oriented stack, outside this small CPU comparison. This is not a claim that CPU execution is universally impossible. |
| [ByteBite](https://github.com/Ismail-Abu/ByteBite/tree/03f4d9ab95a5bb895823cb9ad5c6fc05e34f40bf) | Android UI and export-notebook ideas | No license or released TFLite artifact found in the pinned tree. README describes sample-data UI with empty model assets. No code or weight adoption. |

## Reuse and evaluation contract

The two ONNX artifacts total 50,749,811 bytes, below 64 MiB. Plate's published SHA256 and Dish's committed Git blob hash were checked; both SHA256 hashes are recorded in the profile. Weights remain outside Git and app assets. Source-derived preprocessing and decoding retain MIT notices in `docs/third-party-models/`; separate weight restrictions remain explicit.

Plate takes raw uint8 RGB NHWC: its graph performs resizing and normalization. Inverse-transform its standardized log outputs, sort each three-value set, and take the middle value as the publisher does. We ignore interval and conformal adjustments.

Dish takes a PIL bilinear 256-pixel square and ImageNet-normalized float32 NCHW. Its mass uses the published scaler. Empty ingredient selection retains the publisher's raw zero totals but counts as a failed direct nutrition estimate; a positive mass head can still enter the separate A1 fusion route.

Fusion scales A1 components by **model-predicted mass / original A1-estimated mass**. Reference grams never enter inference or fusion. Food identities, proportions and nutrient-source provenance remain attached. Direct model totals are unverified model estimates, never verified database matches. ECUST has mass references only, so we report no ECUST calorie accuracy.

## Evidence and review

The host inspected official repository files, release metadata, model cards, preprocessing, decoding and split code. Publisher aggregate errors are not directly comparable with Calorix's selected ten Nutrition5k images. Pinned released bytes and metadata govern decoding when mutable model cards describe another version.

Antigravity's broad research call timed out after 300 seconds. Canonical fallback models rejected unsupported high reasoning effort. Invalid zero-turn arguments were corrected before those fallback attempts; exact errors are retained. A narrowed consultation of supplied source evidence and an amended plan both returned agreement with no must-fix issues. Antigravity explicitly did not browse independently in that narrower review. Unsupported reviewer claims about legal approval, hardware safety or exact training membership were rejected.

The frozen comparison contains ten Nutrition5k JPEGs and twelve public smartphone ECUST images. We keep all failures in coverage, report direct and mass-fusion routes separately and reuse retained A1 receipts without new VLM calls. Each actual run requires a fresh output directory; interrupted outputs are preserved. The source audit alone establishes no accuracy, Android latency, interval calibration or production-readiness result.
