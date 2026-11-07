# Inventory contract repair and single-pass HIGH accuracy candidate

Continue the original accuracy roadmap; no routine user plan approval. Two-passV1 is sealed failed16/24, including7request/validator defects and1HTTP5xx. Corrected actual-results MCP recommends fixing the contract offline and measuring HIGH single-pass rather than immediately repeating48two-pass calls. This is an empirical hypothesis, not a claim that stronger thinking is automatically more accurate.

## Offline contract repair

Only `accuracy-two-pass.ts` and its focused test change. Emit alternatives maxItems3, components minItems1/maxItems20, uncertainties maxItems8 and estimatedMassG minimum0/maximum5000 in responseJsonSchema. Descriptions/prompt explicitly carry existing local limits: name1..120chars, preparation<=200, visualEvidence1..400, alternatives0..3names1..120, scaleEvidence<=400, uncertainties0..8strings1..200, componentmass strictly positive<=5000. Minimum0 is inclusive wire guidance; strict-positive Zod remains authoritative. No validator relaxation, truncation of a four-alternative response, oracle identity, hidden retry or relabelled success.

TDD must capture the actual observed missing-wire-bound defect and ensure invalid4alternative outputs still fail and skip nutrition. Native two-passV1 still refuses its existing root; zero new live two-pass requests. Old source/runtime6files were snapshotted before repair, versioned implementationb690718; root bytes/mode/times remain sealed.

Primary references: [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [cloud schema fields](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output). These document array bounds and numeric range fields; semantic nutrition correctness still requires evaluation.

## HIGH single-pass candidate

New `accuracy-high-thinking.ts` exports `runHighThinkingAccuracyDevelopment(cases:readonly NutritionEvalCase[],deps:AccuracyDevelopmentDeps,identity:AccuracyDevelopmentIdentity):Promise<AccuracyDevelopmentResult>`. It delegates the unchanged original accuracy-development core, injected with a 1:1 SDK facade. The only actual wire configuration change from candidate1 is thinkingConfig.thinkingLevel=ThinkingLevel.HIGH. The final prompt stays byte-exact candidate1 SHA05398a83b74cb5198d01e2c16a2e5017836ed79577fa9d056752a53bf3d9bd06. Keep Vertex/calorix-xurschnell/us/gemini-3.8-flash/APIv1/PNG/30000ms/finalschema unchanged. No temperature or other sampling parameter.

Count underlying method dispatches independently before the actual SDK method; require24actual=24delegatedcalls on a complete attempt, no extra calls. Ordinary provider/parse failures stay full24 outcomes; existing pre-reservation, fatal/metadata/clock/image loading/normalization/scorer/retention behavior remains. The shim does not inspect response fields before the original snapshotting core. Global LOW/MEDIUM resolver and sealed calibration APIs stay unchanged; HIGH is opt-in in this new route only. Original211Functionsfiles stay exact; the new two-pass contract files change only as specified above.

New `accuracy-high-thinking-cli.ts` exports `runNativeHighThinkingAccuracyDevelopment(repositoryRoot,env)` as trusted test seam; guarded main computes root, accepts no argv, opt-in RUN_NUTRITION_HIGH_DEV=1. New fixed exclusive root `.nutrition-eval/accuracy-development/single-pass-high-v1`, experiment calorix-accuracy-single-pass-high-v1. Refuse any existing root, no reset/resume/replay. Native clean source/HEAD/manifest/cache/SDK checks, module/source/tree/prompt/schema hashes, durable24reserved/24outcome journal and last completion bindings follow the existing small native CLI. Completion binds report/markdown/diagnostics/events. Sidecar route records actual requested HIGH/30s; internal adapter assembles MEDIUM before the 1:1 shim. Do not mislabel the actual SDK request as MEDIUM, or claim returned metadata proves server reasoning allocation.

Model support was verified in the [official thinking table](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking):3.8Flash supportsLOW/MEDIUM/HIGH, defaultMEDIUM. SDK2.19.0 enumHIGH exists. Native API acceptance, latency, failures and accuracy remain measurement questions. No thought text/rawHTTPpayload/error message or credentials retained.

## Once-only development measurement

Same24FINAL development cases/order/image/truth pins, manifestSHA59231d1cfda7e8a795901086f379f0bdb331dbf082ff51b37e3758e381bebd4e. One sample, max24newimageSDKcalls,0newtoken-count/warmup/retry/fallback. Actual prior164images=100sealedV1/V2+24candidate1+40two-pass; newmax24 gives188, unused8fromtwo-pass are not replay credit. No2.5request, heldout access, deployment or production data mutation.

Before actual: all relevant old321controls plus meaningful new regressions/HIGH/nativefilesystem tests, build/lint; one fresh whole-feature review for this combined new feature and mandatory MCP source/hermetic-results agreement; clean isolated commit/push. Reuse current continuous nutrition-work exact editing-route failures under standing native fallback, not permanent quota or availability assumptions. Record the ruling and costs; TDD/reviews retained.

Fresh scoped account/project/ADC/API/billing9checks plus source/runtime/SDK/cache24/oldrun/snapshot pins before spending. Freeze one executionHEAD throughout, no source/docs mutation or partial-root restart. Independently audit all24 outcomes/raw final JSON if retained/model metadata/counters/hash bindings and stage-attributed errors. Full24coverage primary; common-success secondary. All24candidate1successes and original22successes required for progress; unsafe0,severe<=2,calmedian<=.18440896769339005,p90<=.45463187086065293,zero-safe macro<1.5064710070741663. Absolute goal<=.50andmacro medians<=.35 remains separate from progress. One sample noncontemporaneous does not establish causal thinking effects.

Mandatory actual-results MCP review, result/status/plan commit/push; preserve failure and continue another concrete repair, or freeze an advancing candidate before separately reviewed untouched16validation×3/final20public×3 budgets. Current references differ from the saved2.5benchmark, so no superiority claim from development.

## Review checkpoint and session boundary

Corrected primary3.8/serverHigh research/design/implementation-plan/MAX24newSDKbudget review agrees/MUST_FIX none, scope HIGH_DESIGN_PLAN_AND_24_CALL_BUDGET_ONLY, conversation calorix-accuracy-high-thinking-design-20261107,2026-11-07T22:29:36.834Z. Completed result recovered from persisted MCP conversation after user interruption. Initial22/24criterion/OpenAPI terminology/HTTPattestation/zero-mass-domain overclaims were explicitly corrected. No new application code, test or HIGH inference has started. Continue with Task1 TDD after reading the fresh-session handoff; do not request another plan approval.
