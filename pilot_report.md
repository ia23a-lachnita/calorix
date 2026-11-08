# Tier1 pilot report

## Supported

Existing Flutter CameraX still capture, app theme, Firebase project and SDK were reused. The new local-first module implements retained JPEGs and available metadata, explicit per-photo cloud consent, manual estimates, editing/history/deletion, served-only defaults, optional confirmed intake and repeat confirmation. A stateless authenticated callable and CLI share pinned A1 inference and nutrient reconciliation. Six actual USDA SR Legacy records were retrieved; unsupported foods are explicitly unverified. Automated code tests exercise these behaviors; phone/build verification status is recorded below and in `docs/implementation-status.md`.

## Unsupported

No medical, numerical accuracy, interval, unseen-user/device or production-readiness claim. Database nutrient records do not verify visual food matching or portion mass. A1 uses a hosted model ID, not downloadable immutable weights; returned model drift fails closed. The small catalog has limited coverage. A0 shares A1 recognition/preparation and tests serving priors only. No old public-image outcome is a weighed Android reference.

## Unmeasured

**Physical weighed Android meals:0/30.** Served/consumed MAE, bias, P90, mixed-meal accuracy, user correction rate, end-to-end phone latency and inference expense are unmeasured. The empty dataset `docs/tier1-pilot-empty.json` deliberately produces null error/cost metrics. Synthetic recipe tests validate arithmetic only. Missing consumption and missing cost remain unknown. No participant data or physical weighing was fabricated.

## Decision

Ship the code to the dedicated phone for local workflow testing after source/checksum/signing verification; do not deploy cloud code without explicit approval. The single highest-value next experiment is **one weighed mixed meal**: record the recipe and cooked yield independently, take one phone JPEG, freeze the original A0/A1 outputs, answer at most one preparation question, and compare complete served kcal before manual edits. Continue to30 different physical meals without selecting away difficult dishes. Only that evidence can justify additional model complexity.

## Actual verification

- Initial Functions controls117/117 passed. Tier1 focused tests pass; final counts/full-suite status are in the persistent status file.
- Evaluator7/7 synthetic tests passed; empty input yields0 meals and null accuracy.
- Android test-first CI42426878949 at6dfefa1:949 passed,1 historical skip,2 new expected compile failures because Tier1 modules were absent.
- Subsequent/final builds, source checksums, physical runtime evidence and remaining blockers will be appended here after they finish. No current-source phone result is implied by source inspection.
