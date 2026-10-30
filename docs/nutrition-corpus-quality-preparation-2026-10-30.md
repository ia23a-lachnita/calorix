# Offline corpus quality preparation

The preparation tool has passed its focused tests and full local backend verification. Actual candidate photo review is in progress. This checkpoint does not qualify nutrition accuracy, activate a calibration protocol, or change the deployed model.

The tool selects a separate 24-development/16-validation candidate set from pinned Nutrition5k sources. It excludes the 52 quarantined IDs, deprecated or unknown ingredients, and existing semantic exclusions before ranking. Public downloads require explicit opt-in. Image review binds each decision to the case, image hash, checklist and append-only correction history. Finalization requires 40 selected passes; verification reproduces source, image, selection and consideration history without downloads or writes.

Candidate artifacts cannot be consumed as existing calibration manifests. No provider client, calibration ledger or inference budget is constructed by the command.

## Verification evidence

Run `task2-parent-test-verify-02-20261029` executed the literal `cd functions && npm run test:verify`:

| Population | Passed | Existing skip | Physical test files |
| --- | ---: | ---: | ---: |
| Default | 4,541 | 1 | 68 |
| Firestore rules | 125 | 0 | 1 |
| Backend emulator | 1 | 0 | 1 |
| Total | 4,667 | 1 | 70 |

The parent and all three test processes exited 0. The run started on October 29 at 18:18:30.744 UTC and finished at 19:46:55.651 UTC, taking 5,304.906 seconds. Exact comparison preserves all 4,467 previous default case/status entries and adds 75 passing cases: 34 policy, 21 audit and 20 CLI cases. The raw case status for the existing skip is `skipped`; Vitest reports it in `numPendingTests`.

The final focused run passed 197 cases, including the unchanged 122 corpus tests. Final standalone build and lint also exited 0. All 162 Functions source/input files, four root verifier inputs, three protected configuration files and 11 frozen calibration evidence files matched their recorded fingerprints.

| Receipt | SHA-256 |
| --- | --- |
| Default | `df5b04cb721f785e080553ba1818d8e15323b7b8b1093cdb6302b4dec4c663d7` |
| Rules | `f262be8b4c7208ac628f0ad0d513646e75c28d72276401919f631429dafd7290` |
| Emulator | `4f59df31960810abb22c64f62c2b4e3802669eac4e8fda6d5cc793b70edfecbb` |
| Parent log | `56538450535882eaad782d3f9f51c8aa27810307da16558d87609741e11ed647` |

The task recorder added only six serial/reporting flags. It changed no test selectors, assertions, retries or product timeouts. Temporary files, Java temporary storage and caches used disk-backed locations.

## Independent review and fixes

One fresh native reviewer inspected the whole feature. Two important findings were reproduced with failing tests and fixed:

- Consideration history now replays the exact next selected slot across photos, skips and QC decision prefixes. It rejects invented same-stratum slots and never-reached skips while preserving legitimate rejection, replacement and correction histories.
- Publication synchronizes file contents before rename and the containing directory afterward. Newly created artifact directories and their parents are synchronized. Fault tests verify ordering and failure reporting.

The corrected focused tests and full parent passed. Antigravity MCP, using `gemini-3.8-flash` with server-supplied High effort, agreed with no must-fix findings for source-only review in conversation `calorix-offline-corpus-quality-implementation-20261029`. The corrected final review of actual source and parent receipts also returned `AGREEMENT_STATUS: agree` and `MUST_FIX: none`, scoped to the offline tool and hermetic verification. It explicitly withdrew an earlier overclaim that the file inventory proved Git cleanliness: the inspected task-owned edits were still pending commit. Reviewer source inspection is distinct from the host's executed tests.

One minor finding is deferred: several semantic errors share the sanitized `operation_failed` category. These commands fail closed, but more specific categories would improve operator diagnostics.

## Limits and next work

Both backend emulator phases used `demo-no-project`. Four function definitions loaded; the function-only phase did not execute Firestore triggers. The host used Node 22 despite the requested Node 20, and retained the outdated SDK and ADC warnings. This is local verification, not production runtime, security, deployment or end-to-end trigger approval.

Path checks address accidental existing symlinks rather than hostile same-user filesystem races. Header inspection verifies image metadata; actual pixel readability and scene quality require viewing every considered photo. Operator QC and source hashes do not certify physical food mass, hidden ingredients or nutrient truth.

The initial public preparation produced 40 photos and 30 HTTP 404 skips. All 40 photos were individually viewed by the main agent, yielding 33 pass observations and seven rejections. Native CLI commands are recording those decisions; replacement review and final corpus qualification remain pending. The first outer terminal ended with code 143 without a native wait receipt; a fresh cache-only preparation command reproduced the retained inventory and exited 0 in 49.126 seconds, without replacing bytes or downloading again. The next steps are replacement QC, mutable draft inventory review, finalization and read-only verification. No candidate corpus has yet been finalized. The rejected protocol v1 evidence remains frozen, and this tool creates no permission for another model run.
