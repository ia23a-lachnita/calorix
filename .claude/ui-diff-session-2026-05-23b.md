# UI Diff Session — 2026-05-23 (Run-011 Blocked)

## What Was Tested
Today screen diff (run-011) was attempted after enabling VLM as required policy.

## Session Goal
Re-enable VLM analysis (disabled in run-010 for reliability), enforce `vlmPolicy: required`,
and run a new Today screen comparison with qualitative semantic region analysis.

## VLM Health Result
**Status: FAILED — run blocked per VLM policy**

| Field | Value |
|---|---|
| Provider | Ollama @ http://localhost:11434 |
| Reachable | yes |
| Selected model | qwen2.5vl:7b (5.97 GB) |
| Installed | yes |
| Running | no |
| Load result | `resource_limited` — model failed to load (OOM) |
| Fallbacks checked | llava:7b, llava:13b, moondream — none installed |
| Usable models | none |

Same OOM failure as runs 007–009. Model is installed but cannot warm due to RAM/VRAM constraints.

## Global Status
Not evaluated — diff was not run.

## Quality Status
Not evaluated — diff was not run.

## Changes Made This Session

### Project instructions updated (`.claude/tools.md`)
Added `mobile-ui-diff` to MCP/Plugin Roles table and added a **mobile-ui-diff VLM Policy** section
documenting the project-wide rules:
- Always call `vlm_health` before using VLM analysis.
- VLM analysis is required; use `vlmPolicy: "required"` + `requireVlmAnalysis: true`.
- Stop and ask user if VLM unavailable; do not accept pixel-only results without explicit approval.
- Do not treat `status: pass` as design parity unless `qualityStatus: pass`.
- Use `regionsOfInterest` / `visualAssertions` for important UI components.

### ui-diff.config.json updated
Re-enabled VLM for the Today screen:
```json
"includeVlmAnalysis": true,
"vlmPolicy": "required",
"requireVlmAnalysis": true
```

## Remaining Issues
1. **VLM OOM** — qwen2.5vl:7b (5.97 GB) cannot warm on current hardware. Blocker for required VLM policy.
2. No smaller VLM model installed (`moondream`, `llava:7b` not present).

## Recommended Fix
Pull `moondream` (~1.7 GB) as a smaller fallback:
```
ollama pull moondream
```
Or pull `llava:7b` (~4.5 GB) if VRAM allows.
Then retry `vlm_health` before re-running the diff.

## Alternative
User can explicitly approve a pixel-only exception run (qualityStatus will be `not_evaluated`).
