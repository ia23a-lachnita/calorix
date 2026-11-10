# Fixed same-meal supplementary-view experiment: no overall gain

**Do not add a second-photo step on this evidence.** In the six fixed development cases, adding the side image worsened mean and median calorie error. Three cases improved andthree worsened. This rejects promotion of this particular simple two-image VLM route; it does not establish that every multi-view or calibrated geometry method fails.

These six cases were selected for diagnosis (four largest historical errors +two smallest-error controls), not representative or held-out accuracy validation. Their absolute metrics must not replace or be directly compared with the previous ten-meal benchmark. Both arms made fresh predictions with the same newprompt/model/settings; historical predictions were only selection context.

| Metric, matched6 | One overhead image | Overhead +sideA |
|---|---:|---:|
| Mean absolute kcal error | 313.7189 | 319.7522 |
| Median absolute kcal error | 367.5341 | 415.9841 |
| P90 absolute kcal error | 561.1225 | 506.3225 |
| Signed bias kcal | -312.8789 | -319.5122 |
| Floor200 normalized absolute error | 0.3529 | 0.3681 |
| Valid predictions | 6/6 | 6/6 |

| Meal | Reference kcal | One image | Two images | Change in absolute error (two−one) |
|---|---:|---:|---:|---:|
| Chicken salad | 902.20 | 314.35 | 420.90 | -106.55 |
| Pasta/meat | 950.40 | 416.00 | 419.05 | -3.05 |
| Mixed chicken/sides | 920.12 | 569.65 | 485.75 | +83.90 |
| Eggs/bacon | 837.15 | 452.55 | 439.55 | +13.00 |
| Tomatoes control | 10.98 | 13.50 | 11.70 | -1.80 |
| Meat/cauliflower control | 442.98 | 420.50 | 369.80 | +50.70 |

Negative delta favors two images; all cases remain visible. The four large-error meals were nearly flat: MAE464.33→461.15kcal. Controls worsened12.50→36.95kcal. P90 dropped mainly because the salad improved; the average and median did not. Small-N P90 is descriptive interpolation, not a worst-case bound or statistical conclusion.

Aggregate mass MAE151.67→145.00g, but mass P90281.5→296.5g; no consistent macro recovery. The pasta remained substantially underweight (245/255g estimates versus545g reference). More visible information did not establish dependable physical mass estimates. Do not infer a unique cause or conclude that metric reference objects/3D reconstruction have been tested.

## Frozen design and inputs

Sourcec2f7e0c661f1ed89b84501c5289ddfb12aee4344 was committed/pushed/clean beforelive. One image and two images share prompt45bb12550f3fff55506e4f5b381e6882d184cd57c256de3c0488b18dec232945: original7131…prompt minimally changed to accept photographs plus a same-meal/no-double-count instruction. Both arms use gemini-3.8-flash exactreturnedversion, SDK2.19.0/Node22.23.3, VertexUS, LOW/8192/30s/oneattempt, original six-record nutrient reconciliation/schema4306…. No historical masscalibration applied. The current app/model/default prompt remains unchanged.

Fixed case order and SHA256IDrank gave3single-first/3paired-first; per-casearmorder is in the protocol and registry. Payload order[textprompt,overhead] versus[textprompt,overhead,sideA]. No referenceweights, recipe labels, nutrition targets or datasetIDstrings were deliberately added to the model input. Original pixels can contain background/QR, and foundation pretraining exposure is unknown; no absolute leakage guarantee.

CameraA firstdecodedframe only, no camera/time/meal replacement; source52,707,168B total, perclip24MiB/total72MiB cap. AllsourceMD5/SHA and PNG/JPEG hashes retained; all12inputJPEGs reproduced exactly from verifiedcachedvideos. Overhead640x480 versus side1920x1080 preserves native resolution: this is a supplementary-camera/resolution/context package, not pure view-count isolation or metric geometry. Host inspected10overhead+6sideimages; matching vessels/groups apparent, exact temporal synchrony/marker dimensions/poses unverified. No depth/training/newmandatoryobjectorimage workflow.

## Execution, latency and resources

Canonical Git-common-dir paired-view-v1 closed at exactly13SDKentries: one owned TWO-blank compatibilityprobe plus12foodcalls. All12 foodresponses valid, no retries/model fallback/resume/replacement,0inflight. Initial localpreflight refused because the auxiliary ownedblank was under inputs/ rather than assetsroot; output/registry were absent and0SDKentries occurred. The exact hash-pinned fixture was copied to the required root path before the sole claim/run. This was an asset-layout correction, not an inference retry or budget reset.

FoodSDK model latency medians11.369s single/10.6085s paired, maxima13.183s/14.067s; small sample and model/network variation do not establish that two images are faster. Inputtokens12348→18948 (~53%more); APIreported totaltokens15472→22823. Thought-token fields are known on1/6single and2/6pairedresponses; missing fields are not silently called0. FullrawknownSDKresponse text/usageMetadata saved beforedecode. Dollar cost remainsnull without verified billing. No active user time or Android capture latency was measured.

Only the existing same six public meals were re-estimated:12newfoodpredictions,0newreference meals. Nutrition5k references are weighed masses with recipe/USDA-derived nutrition, not bomb calorimetry. Every unverified VLM nutrient estimate stays explicitly unverified; no new verified database coverage claim. A0is a derived same-recognition prior comparator, not the endpoint of this one-vs-two A1 study.

## Verification and review

99Python/24NodePASS;8newPython methods/3newNode tests had actualREDstub→GREEN. The old fiveTSruntime modules are byte-identical to the f5af422 engine qualified by fullCI42811800401; no newFlutter/device qualification inferred foroffline code. All12SDK texts were independently decoded through that engine: fullcomponentlists byte-equivalent,60nutrient/massfields and childlogicalrunmanifest/model/schema/provenance checked. HostDecimal102metricfields acrossall6/worst4/controls2 and botharms matchedwithin1e-9; allcase delta signs checked.

Main MCPprimarygemini3.8-flash/yolo pre/amend/source/result reviews agree/MUSTnone. One separate fresh-context source audit initially hit300s client timeout; canonical3.7/3.6fallbacks failed because the adapter supplies unsupportedHigh-effort for those models. Their exacterrors/timestamps are published. The original3.8audit completed and its persisted full response was subsequently recovered at2026-11-10T17:24:02.187Z, explicitlyagree/MUSTnone. Timeouts/errors are not counted as approval; the recovered response is the evidence. This was an external fresh-context audit, not a nativechild audit. Invented aliases, byte-guarantees, independence and absolutezero-leakage assurances in review prose were rejected.

No visualdiff/clinical/security/readiness claim. Only the host inspected the16sourcephotos; externalreviews sawsource/text results, notpixels. No automatic approval rejection or production deployment occurred.

## Reproduce and decision

```bash
python3 -m tool.evaluate_paired_views --experiment docs/tier1-paired-view-2026-11-10 --output /absolute/new/result.json
python3 -m unittest discover -s tests -p "test_*.py"
TMPDIR=/absolute/disk-backed/task-tmp node --test tool/frozen_public_eval.test.cjs
```

Output must not exist. Never resume/reset the closed13entry registry. Keep the one-photo product default. The next feasible investigation is verified physical-scale information, not another blanket multiplier or extra-view UI: original-author ECUSTFD documents a25.0mm reference coin and measured object weights. Check source units, portion grouping, edible-vs-gross compatibility, image/annotation mapping and rights first; no newSDKuntila separate frozen protocol/budget. If only mass references are defensible, report grams and do not invent calorie gold labels. A scale-text ablation with a coin visible in both arms would test explicit dimension information, not object-presence removal or a calibrated 3D pipeline.
