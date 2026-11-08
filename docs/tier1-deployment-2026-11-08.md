# Selected Tier1 deployment — 2026-11-08

The user explicitly approved deploying **only `analyzeTier1Meal`** to **`calorix-xurschnell`**. Deployment completed successfully with exit0 using:

```bash
firebase deploy --only functions:analyzeTier1Meal --project calorix-xurschnell --non-interactive
```

## Live result

| Field | Verified value |
|---|---|
| Function | `projects/calorix-xurschnell/locations/us-central1/functions/analyzeTier1Meal` |
| State/runtime | `ACTIVE`, `nodejs22` |
| Revision | `analyzetier1meal-00001-puf` |
| Update time | `2026-11-08T10:25:33.835545384Z` |
| Memory/timeout | `512Mi`,60 seconds |
| Limits | max2 instances, concurrency1 |
| Source commit | `daf3e430ab4b8ae3330cd4857ebdb2c20e4d51a5` |
| Functions source tree | `99ffa446d8b59508f690d46d67b5500c3bea30d7` |
| Model | Existing pinned Vertex `gemini-3.8-flash`; prompt/schema/catalog unchanged |
| Callable URL | `https://us-central1-calorix-xurschnell.cloudfunctions.net/analyzeTier1Meal` |

Read-only before/after comparisons confirmed **identical runtime, revision, updateTime and limits** for `aiChat`, `processEntry` and `aggregateDailyLogs`. They remain on their original Node20 deployments. Both deployed Firestore/Storage rule releases and content hashes are unchanged. No project-level runtime permission grant was needed: the existing default runtime account already has Vertex access. No meal/photo database migration or legacy function redeploy was performed.

## Necessary runtime correction and checks

The first selected deployment stopped before function creation with: `Runtime Node.js 20 was decommissioned on 2026-10-30. To deploy you must first upgrade your runtime version.` The [official runtime schedule](https://docs.cloud.google.com/functions/docs/runtime-support) confirms the retirement and Node22 support; [Firebase's deployment documentation](https://firebase.google.com/docs/functions/manage-functions) describes runtime selection and function-specific deployment.

Changed only package engine/root lock metadata and CI from20→22; updated the existing exact-version CI contract after actual RED (`Expected20, Actual22`). All setup-node, working-directory, install/build/lint/test assertions and canonical workflow triggers remain. No dependency, model, nutrient or application logic changed. The CLI warned that existing `firebase-functions@5.1.1` is outdated; no unrelated SDK upgrade was performed.

[CI42470126908](https://github.com/ia23a-lachnita/calorix/actions/runs/42470126908) at `daf3e43` passed:

- Node22 Functions build/lint and95 files,5331 passed tests,1 historical skip (job128698718627).
- Python evaluator11/11.
- Flutter960 passed,1 historical skip, focused analyzerNoissues (job128698718861).
- Signed test APK build (job128701748011).

The fresh artifact's source SHA, checksum sidecar and trusted V2 signer were verified. APK SHA256 `221f25756481e680f0ed7d41a85468e8be885e645cafe9ba9e9cf7e25d4dff60` and signer `38815fd37711f170e534cf3c8767de7f0f7ca5f958e755d8a47b03fe2b764b7c` match the previous inspected build exactly. Direct `sha256sum` of the phone's installed `base.apk` matched too. A redundant reinstall was unnecessary; the current-source CI produced the same installed bytes and native privacy controls.

Fresh preflight build/lint/19 focused tests also passed. The Rules API initially returned403 because the ADC request lacked a quota project; supplying the explicit target quota-project header fixed the read without changing credentials/configuration. Live anonymous sign-in is enabled. Antigravity MCP `gemini-3.8-flash`, conversation `calorix-tier1-node22-deploy-20261108`, returned exact agree/none for pre-plan, implementation/contract correction and final result/report reviews. No fallback review model or editing worker was substituted; the recorded native-edit exception remains applicable.

## Actual deployed smoke and limits

1. An unauthenticated request returned **HTTP401 / UNAUTHENTICATED**, with the handler's exact sign-in message, before image inference.
2. On SamsungSM-G780G/Android13/R58R61161NA, one **owned generated256×256 gray non-food JPEG** was staged with explicit diagnostic/non-weighed metadata. All existing local record IDs were preserved. This was not a physical meal or a capture-accuracy reference.
3. The app displayed its US/provider-retention consent dialog; **Send photo** was explicitly chosen for that owned fixture. Server logs at10:29:01Z confirmed **Firebase Auth VALID**, the deployed revision and **HTTP400**. The UI exposed a generic failure, so the exact backend error category was **not** established from the client. Do not report this as a verified real-food recognition/calorie happy path or assert an exact `no_food` result.
4. The app retained the unchanged JPEG, persisted consent, left served calories and analysis **null**, and offered manual entry. Screenshot02 was visually inspected. No zero-calorie success was invented, and no automatic retry or second image was requested.
5. The server logged **App Check INVALID**. Enforcement remains disabled for this personal prototype; the deployed SDK's default permits that request with a warning. App Check, public-distribution hardening and security readiness are not claimed. This setting was not silently changed.
6. The fixture record/photo and previous backup were deleted through the app; assertions confirmed removal and preservation of other record IDs. The device XML was removed, and the app was left on Camera. No app clearing, uninstall, account deletion or unrelated cleanup occurred.

The smoke made one consented non-food phone request; the unauthenticated check had no photo. It validates authenticated transport/error handling, not food accuracy, benchmark latency, coverage, generalization or cost. Provider-managed retention can apply. Raw photos, credentials, private diagnostic logs and generated APKs are not committed.

**Physical weighed Android meals remain0/30.** Deployment approval is resolved. The next experiment is one independently weighed mixed meal with original paired A0/A1 outputs frozen before correction. Follow [the phone runbook](tier1-phone-runbook.md) and [reference SOP](../reference_sop.md).
