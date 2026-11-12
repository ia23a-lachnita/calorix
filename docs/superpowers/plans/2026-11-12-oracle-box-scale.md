# Oracle bounding-box and known-scale diagnostic

> Continue inline under the approved V7.1 roadmap and editing-worker route contract. No renewed user approval; preserve method/source/result review gates and test-first code.

**Goal:** Determine whether explicit box/coin measurements add portion information beyond known food-type priors on the existing six ECUST development portions.

**Architecture:** Author boxes and class labels are oracle inputs. Fit small class-specific median priors on other publisher portion IDs, one hash-ranked top view per ID. Evaluate unchanged class-median, raw-pixel-area, coin-area and coin-area^1.5 predictors against the same original six A1 mass predictions. No automatic recognition, image reconstruction, B0 weight training, new service or calorie prediction.

**Spec:** `docs/superpowers/specs/2026-11-08-v71-binding-addendum.md`, conditional C0 after measured portion errors; existing unexecuted oracle-pixel diagnostic recorded in status. Review `calorix-oracle-box-scale-20261112`, primary3.8/yolo agree/MUST_FIXnone, recovered persistent receipt2026-11-11T23:30:07.065Z.

## Constraints

- Source author repo `Liang-yc/ECUSTFD-resized-` commit59603e70c99807af46df9af3c2c507995fdd0029. Reuse cached XLS/tree/reference manifest. Food weights come only from the matching class XLS sheet and weight(g) column. Ignore volume entirely. Preserve third-party assets privately.
- Same fixed six fully-edible food classes and six prior comparison portion IDs. All other36 portion IDs are fitting candidates. Exclude every view of comparison IDs from fitting; this is a custom group split, not the official image-level split or guaranteed physical-instance independence.
- Freeze selection before fetching feature XML/pixels: all non-comparison source IDs, one SHA256-ranked top view per ID with both JPEG/XML in author tree. No error/food-vocabulary or outcome filters, no replacements. Require at least3 valid fitting groups/class; otherwise fail/report. Bad chosen inputs remain explicit failures.
- Parse at most64KiB XML: exact expected filename/class, image dimensions, exactly one food and one coin, bounded positive boxes. Use explicit published-coordinate span `xmax-xmin`, `ymax-ymin`; reject degenerate spans rather than clamp. Log coin aspect ratio and annotation flags. Do not claim exact VOC inclusive-coordinate geometry or true physical area.
- `pixelArea=wFood*hFood`; `areaProxyMm2=pixelArea/(wCoin*hCoin)*25^2`. This is a box/scale proxy: background, parallax, viewpoint/coin tilt and food height remain uncontrolled. No volume reconstruction or accuracy upper-bound claim.
- Fit class median mass, median(mass/pixelArea), median(mass/areaProxy), median(mass/areaProxy^1.5) ONLY on fitting groups. Fixed exponents1 and1.5; no selection of the best exponent using comparison outcomes.
- Five reported arms: original A1 neutral, class prior, raw area, coin area, coin similarity proxy. Fixed screen: at least10% lower MAE than BOTH A1 and class prior, nonworse median/P90/absolute bias/coverage. Keep all six denominators and explicit failures. Small-N descriptive mass endpoint only; no kcal/macros/Android/mobile claim or promotion.

## Tasks

- [x] **Freeze/qualify source cohort.** Record XLS/tree/old manifest hashes, class-sheet/group joins and selected paths before feature fetch. Verify individual Git blobs, XML/JPEG dimensions and per-file hashes; keep chosen failures. No bulk dataset download.
- [x] **Primitive RED/GREEN.** `tool/oracle_box_scale.py`, `tests/test_oracle_box_scale.py`: strict parser, deterministic view/group selection, train-only priors, fixed four predictions/screens. Tests must cover no-clamp malformed boxes, missing/duplicate coin/food, wrong filename/class/dimensions, bool/nonfinite/invalid grams, duplicate/test-group leakage, insufficient fitting groups, image resizing/coin scale behavior, reference-independent predictions and failure denominators.
- [x] **Freeze/execute.** Source/code/runtime/cohort/protocol pins, method/source review, full appropriate Python/Node tests, commit/push before fitting/comparison. Reuse original A1 predictions; zero SDK calls/local neural forwards. Save fitting priors and all per-case outputs without selecting/retuning on comparison errors.
- [x] **Audit/review/continue.** Independent source/box arithmetic/group checks and Decimal mass metrics; source/result review; public permissible code/opaque receipts/status, private source assets/numerical detail. Commit/push. Only if supported, review automatic localization as a separate component; annotations never become production detections.

## Review focus

One coin and no food, multiple foods, native `fired_dough_twist` naming, repeated views of one fitting/test portion, missing/corrupt chosen source files, source resizing/header mismatch, source-level group reuse and predictor over-credit from a class prior. No alteration of comparison labels or old A1 receipts. A positive oracle result is a diagnostic, not product accuracy.

Completed at sourcec386d43; all36fitting/6comparison groups valid, zero new food model calls, no source failures. All geometry candidates fail the class-prior control; retain baseline/no automatic localization extension from this diagnostic. Host200-field Decimal and fresh whole-feature source/asset/fit/prediction audits pass. Numerical details/assets private, public execution evidence retained. No tuning or promotion.
