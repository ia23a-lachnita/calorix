# mobile-ui-diff MCP — Agent Usage Findings

**Date:** 2026-05-21 / 2026-05-22  
**Tested by:** Claude Code agent (S29/S30 sessions)  
**MCP source:** `C:\Users\xursc\projects\mobile-ui-diff-mcp\dist\index.js`  
**Registered in:** `.mcp.json`

---

## Registration

```json
{
  "mobile-ui-diff": {
    "command": "node",
    "args": ["C:\\Users\\xursc\\projects\\mobile-ui-diff-mcp\\dist\\index.js"]
  }
}
```

---

## Tools Available

The MCP exposes three tools:

| Tool | Used? | Notes |
|---|---|---|
| `capture_android_screenshot` | Yes | Worked correctly |
| `run_mobile_ui_diff` | Yes | Worked correctly |
| `compare_images` | No | Available but not invoked |

---

## What Worked

### 1. `capture_android_screenshot`

- Successfully captured the Today screen from the Android emulator `Api35_NoPlay`.
- Output saved to `.ui-diff/today/run-001/actual.png`.
- No issues reported. Call was straightforward — just needed a running emulator.

### 2. `run_mobile_ui_diff`

- Successfully compared mockup (`docs/mockups/image/light/single/Today.png`) against captured screenshot.
- Detected **12.56% pixel variance** (397,261 differing pixels / 3,162,132 total).
- Identified **20 distinct regions** of visual difference.
- Generated complete artifact set per run:
  - `expected.png` — mockup reference
  - `actual.png` — live app screenshot
  - `diff.png` — composite diff image
  - `regions/region-*.png` — 60 crop files (20 regions × 3: expected/actual/diff crop)
- **Ignore regions worked correctly:** status bar `(0,0,1080,80)` and navigation bar `(0,2350,1080,50)` were excluded from diff.
- Two full runs completed (`run-001`, `run-002`) without tool errors.
- Region bounding boxes were reported, enabling the agent to understand *where* diffs were (layout zone, cards, ring, bottom nav).

### 3. Iterative workflow

The agent used the tool in a loop:

1. Boot emulator → run app → capture screenshot → run diff → read regions → fix code → hot reload → re-capture → re-run diff.
2. This workflow worked end-to-end. The output directory naming convention (`run-001`, `run-002`) supported iterative tracking cleanly.

---

## What Did Not Work / Limitations Found

### 1. VLM region analysis not used (`includeVlmAnalysis: false`)

- All 20 region analyses were **skipped** because `includeVlmAnalysis` was false (likely the default or explicitly set to off).
- The agent had to interpret diff regions **manually** by looking at bounding-box coordinates and eyeballing crop images.
- This is the biggest gap: the tool generates the crops but offers no AI interpretation of *what* the difference is in each region.
- **Improvement suggestion:** Either default `includeVlmAnalysis` to `true` if a VLM key is configured, or surface a clearer warning that VLM analysis is disabled and explain how to enable it.

### 2. No automatic variance delta between runs

- After the second run, there was no automatic report showing "variance went from 12.56% → X%".
- The agent had to manually infer improvement by re-reading the diff output.
- **Improvement suggestion:** Add a `--baseline` flag or a comparison mode that diffs two runs and reports percentage delta.

### 3. No named screen support / screen routing

- The agent had to manually specify input paths for both the expected mockup and actual screenshot.
- There was no "screen profile" concept where you could say `--screen Today` and the tool knows where to find the matching mockup and where to save artifacts.
- **Improvement suggestion:** Add a screen config file (e.g., `ui-diff.config.json`) mapping screen names to mockup paths and output directories.

### 4. Region labels are numeric only (`region-001` … `region-020`)

- Regions are identified by sequential number with no semantic label.
- The agent had to cross-reference bounding box coordinates against known UI zones (e.g., "region-006 at y=800 is the meal card area").
- **Improvement suggestion:** If VLM is enabled, embed a short label in the region filename (e.g., `region-006-meal-cards.png`). Even without VLM, allow the caller to pass named zones that get matched to detected regions.

### 5. `compare_images` tool not used

- The tool exists but the agent never invoked it. It's unclear whether it offers a simpler interface than `run_mobile_ui_diff` or is a lower-level primitive. The agent defaulted to `run_mobile_ui_diff` for everything.
- **Improvement suggestion:** Add a brief description distinguishing the two tools in the MCP tool metadata so agents can select the right one.

---

## Configuration Used

```
pixelmatchThreshold: 0.1
maxDiffPercent: 0.01  (1% target)
includeVlmAnalysis: false
ignoreRegions:
  - { x: 0, y: 0, width: 1080, height: 80 }     # status bar
  - { x: 0, y: 2350, width: 1080, height: 50 }   # nav bar
```

The 1% `maxDiffPercent` threshold is strict. The actual starting variance was 12.56%, so the tool correctly flagged this as failing. No issues with threshold application.

---

## Artifact Output Structure

```
.ui-diff/
  today/
    run-001/
      expected.png       # mockup reference
      actual.png         # live app screenshot
      diff.png           # composite diff
      regions/
        region-001.png   # expected crop
        region-002.png
        …
        region-020.png
    run-002/
      (same structure)
```

This structure is clean and worked well for the iterative workflow.

---

## Summary Assessment

The MCP is **functional and useful** for pixel-level regression testing in the Calorix workflow. The core capture → diff → artifact loop worked without errors across two runs. The primary gap is the absence of VLM-assisted region interpretation, which forced the agent to do manual coordinate-to-UI-zone mapping. Secondary gaps are the lack of run-to-run delta reporting and screen profile configuration. These would meaningfully reduce agent effort in future sessions.
