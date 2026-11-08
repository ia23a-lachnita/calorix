# Run the Tier1 phone pilot

The existing Flutter app now starts in the local Tier1 workflow. The old cloud app remains available only with `--dart-define=CALORIX_LEGACY_CLOUD=true`; that legacy mode is not the V7.1 privacy/served-intake implementation.

Build with the existing intermediate **Test Android APK** workflow (`android-test-apk.yml`) from the desired pushed branch. It runs verification, prepares the existing Firebase config from repository secrets, builds Flutter3.41.9 via FVM and records source SHA, APK SHA256 and signer in `metadata.json`. Download `android-test-apk-<source SHA>`, compare those values, and install only that source-matched artifact. Do not use an old release APK as evidence.

```bash
/home/agent-runner/.local/bin/phone-adb devices -l
/home/agent-runner/.local/bin/phone-adb shell getprop ro.product.model
/home/agent-runner/.local/bin/phone-adb shell getprop ro.build.version.release
/home/agent-runner/.local/bin/phone-adb get-serialno
# After verifying metadata/checksum/signer:
/home/agent-runner/.local/bin/phone-adb install -r /absolute/path/to/verified-test.apk
/home/agent-runner/.local/bin/phone-adb shell monkey -p com.calorix.calorix -c android.intent.category.LAUNCHER 1
```

Local use requires neither sign-in nor a network. Tap **Take photo** (grant camera permission), or **Manual entry**. Enter/correct approximate **served** calories and optional macros, then **Save meal**. History retains the record and private JPEG. Intake stays unconfirmed until **Ate all** or **Ate half**; leave it unconfirmed if unknown. **Repeat meal** asks about recipe identity and portion multiplier and creates a new unconfirmed meal. **Delete meal** removes its local record/photo and backup. Android backup/transfer is excluded for these app data. No public gallery copy or location permission is requested.

**Estimate photo** separately asks whether to send this JPEG to Google Cloud in the US. Declining keeps it local. Before sending, image metadata is stripped; anonymous Firebase authentication happens lazily if needed. There is no app-owned server photo/meal persistence on this route; Google provider caching/abuse retention may apply. No API key belongs in the APK. The callable must first be reviewed and deployed to `calorix-xurschnell`; this task does not silently deploy it. Missing callable, disabled anonymous auth, offline/quota/schema errors leave manual entry and the saved photo available.

For the CLI comparator, first take the single JPEG on the phone and keep it local. The debug test APK permits an owner-controlled USB export. Copy the local meal JSON, find that meal's UUID, then copy only its JPEG (replace the example paths/UUID):

```bash
/home/agent-runner/.local/bin/phone-adb exec-out run-as com.calorix.calorix cat app_flutter/tier1/meals.json > /disk/path/phone-meals.json
/home/agent-runner/.local/bin/phone-adb exec-out run-as com.calorix.calorix cat app_flutter/tier1/photos/MEAL_UUID.jpg > /disk/path/meal.jpg
```

Keep exports private and uncommitted. This USB route is for the dedicated debug pilot, not a public release export feature. Use one CLI inference for the paired comparator below; a separate in-app inference is a separate attempt and must not be substituted into that pair. Record the CLI path explicitly; model latency does not establish in-app shutter-to-estimate latency.

For the comparator on that authorized local JPEG:

```bash
cd functions
npm ci
npm run build
node lib/tier1-cli.js --image /absolute/path/meal.jpg --meal-id meal-001 --output /disk/path/meal-001-predictions.json --cloud-consent tier1-v1
# After inspecting the saved single question, answer with ZERO further inference:
node lib/tier1-cli.js --answer-file /disk/path/meal-001-predictions.json --preparation-answer oil_10g --output /disk/path/meal-001-answered.json
```

The explicit CLI consent flag authorizes sending that photo to the same US Vertex route. Unlike Android, the CLI sends the supplied JPEG unchanged; strip sensitive EXIF before using it. Use configured ADC; never put credentials in files committed to Git. Existing output paths are refused **before** another inference. Each command makes one A1 image request with no model fallback; A0 uses the same predicted identities and nutrients with fixed portions. Unknown foods can make A0 fail. Preserve every failure receipt. Use --answer-file to apply your actual preparation answer after reading the saved question. That route never invokes the model and preserves the original file. A pre-supplied inapplicable answer is ignored with a warning, preserving successful inference. Answers must not be derived from hidden reference weights. In-app answers recalculate locally and make no additional image request.

Follow [the weighing SOP](../reference_sop.md), fill [meal_schema.json](../meal_schema.json) with real observations and the CLI prediction rows, then run `python3 evaluate_meals.py /disk/path/meals.json --output /disk/path/report.json`. Raw pilot data/photos stay private and uncommitted. Unit fixtures and the empty template do not count as measurements.
