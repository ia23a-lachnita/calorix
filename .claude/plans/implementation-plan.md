# Calorix — Flutter Implementation Plan

**Stack:** Flutter 3.x · Dart · Firebase · Gemini Vision API  
**State management:** Riverpod  
**Navigation:** GoRouter  
**Date written:** 2026-05-17  
**Reviewed by:** Gemini 2.5 Pro — all flags addressed

---

## Architecture Overview

```
lib/
├── main.dart                    # app entry, ProviderScope, theme, GoRouter
├── core/
│   ├── theme/                   # AppTheme (light + dark), AppColors, AppTextStyles
│   ├── router/                  # GoRouter config, route constants
│   ├── firebase/                # Firebase init, FirebaseOptions
│   └── constants/               # sample data, timing constants
├── features/
│   ├── scan/
│   │   ├── providers/           # scanModeProvider, captureStateProvider
│   │   └── ...
│   ├── processing/
│   │   ├── providers/           # processingEntryProvider
│   │   └── ...
│   ├── today/
│   │   ├── providers/           # todayEntriesProvider, todayMacroSummaryProvider
│   │   └── ...
│   ├── food_detail/
│   │   ├── providers/           # foodEditProvider, pendingEditsProvider
│   │   └── ...
│   ├── history/
│   │   ├── providers/           # historyProvider, selectedWeekProvider
│   │   └── ...
│   ├── goals/
│   │   ├── providers/           # macroTargetProvider, bodyGoalProvider
│   │   └── ...
│   ├── ai_chat/
│   │   ├── providers/           # chatMessagesProvider
│   │   └── ...
│   └── profile/                 # User profile / settings sheet (account, theme, notifications)
│       └── ...
├── shared/
│   ├── models/                  # FoodEntry, DailyLog, MacroTargetPlan, WeightLog
│   ├── repositories/            # Firestore CRUD repos
│   ├── providers/               # Cross-feature providers: authStateProvider, uploadQueueProvider
│   ├── widgets/                 # MacroRing, SkeletonShimmer, ConfidenceBadge, MacroBar
│   └── services/                # GeminiService, NotificationService, CameraService, UploadQueueService
└── shell/
    └── app_shell.dart           # Bottom nav + FAB shell (5 tabs)
```

### State management pattern
- **Riverpod** with `@riverpod` code generation
- `AsyncNotifier` for async data (Firestore streams)
- `Notifier` for local UI state (edit mode, serving multiplier)
- Providers co-located with their feature in `features/<feature>/providers/`
- Cross-feature providers (auth, upload queue) live in `shared/providers/`

### Navigation pattern
- **GoRouter** with `ShellRoute` for bottom nav shell
- Named routes via constants
- Deep-link support for push notification → Today screen

---

## Phase 0 — Project Scaffold

### 0.1 Flutter project init
```bash
flutter create --org com.calorix --platforms=ios,android calorix
```

### 0.2 pubspec.yaml dependencies
```yaml
dependencies:
  flutter_riverpod: ^2.x
  riverpod_annotation: ^2.x
  go_router: ^14.x
  camera: ^0.11.x          # native camera access
  image_picker: ^1.x        # library picker
  firebase_core: ^3.x
  firebase_auth: ^5.x
  cloud_firestore: ^5.x
  firebase_storage: ^12.x
  firebase_messaging: ^15.x  # push notifications
  flutter_local_notifications: ^18.x
  google_generative_ai: ^0.4.x   # Gemini SDK
  flutter_image_compress: ^2.x  # image compression before upload
  shimmer: ^3.x             # skeleton shimmer
  cached_network_image: ^3.x
  intl: ^0.19.x

dev_dependencies:
  riverpod_generator: ^2.x
  build_runner: ^2.x
  flutter_lints: ^4.x
```

### 0.3 Firebase setup
1. Create Firebase project `calorix-prod`
2. Add iOS + Android apps via `flutterfire configure`
3. Enable: Auth (Anonymous + Google), Firestore, Storage, FCM, Functions
4. Set Firestore region: `us-central1`

### 0.4 Auth error handling
- `authStateChangesProvider` (StreamProvider) wraps app entry in root widget
- **Error state**: if anonymous sign-in fails on first launch (network issue / Firebase outage), show full-screen error card with "Retry" button — never leave user stuck on a spinner
- Anonymous → Google Sign-In upgrade path via `linkWithCredential`

### 0.4 Design system wiring
- `AppColors` — all palette tokens from `.claude/design.md`
- `AppTheme.light()` / `AppTheme.dark()` — `ThemeData` using `ColorScheme.fromSeed`
- `AppTextStyles` — text scale (9.5px mono labels → 36px hero numbers)
- Register in `MaterialApp.router(theme:, darkTheme:, themeMode: ThemeMode.system)`

---

## Phase 1 — Navigation Shell

### 1.1 `AppShell` widget
- `StatefulShellRoute` via GoRouter — 5 branches: Today, History, Scan, Goals, AI
- Bottom nav with custom `NavigationBar` override:
  - Items 0,1,3,4: standard `NavigationDestination`
  - Item 2 (Scan): oversized FAB with gradient ring (`SweepGradient` blue→cyan→green), eye icon, green active dot
- Default initial location: `/scan`

### 1.2 Route table
| Route | Path | Screen |
|-------|------|--------|
| Scan | `/scan` | `ScanScreen` |
| Processing | `/processing/:id` | `ProcessingScreen` |
| Today | `/today` | `TodayScreen` |
| Food detail | `/food/:id` | `FoodDetailSheet` (sheet over today) |
| History | `/history` | `HistoryScreen` |
| History day | `/history/:date` | `HistoryDayScreen` |
| Goals | `/goals` | `GoalsScreen` |
| AI chat | `/ai` | `AiChatScreen` |
| Profile | `/profile` | `ProfileSheet` (modal sheet from profile chip) |

---

## Phase 2 — Scan / Camera Screen

### 2.1 Camera preview
- Use `camera` package — `CameraController` initialized with back camera, `ResolutionPreset.high`
- Full-screen `CameraPreview` widget — no safe-area padding
- Re-initialize on app foreground (`AppLifecycleListener`)

### 2.2 Mode selector (Meal / Barcode / Label)
- `SegmentedButton<ScanMode>` custom-styled as white active pill on dark overlay
- `ScanMode` enum: `meal`, `barcode`, `label`
- Provider: `scanModeProvider` (StateProvider)

### 2.3 Controls overlay
- Top-left: Flash chip — `FlashMode` cycles: `auto → torch → off`
- Top-right: Profile chip — navigates to profile sheet
- Corner bracket reticle (custom `CustomPainter`) — static; on capture animates to hug bounding box (200ms ease-out)
- Hint text "Center your meal" — hidden in `capturing` state

### 2.4 Capture button states
- **Idle**: outer ring 3px translucent border; inner circle dark/white with AI gradient dot
- **Capturing**: outer ring = rotating `SweepGradient` animation (`AnimationController`, `RotationTransition`); inner = stop square
- Single tap → trigger capture; tap while capturing → cancel

### 2.5 Capture flow
1. `CameraController.takePicture()` → `XFile`
2. Save image to device temp directory immediately (crash-safe)
3. Pre-generate `docId = FirebaseFirestore.instance.collection('entries').doc().id`
4. Compress image to ≤1 MB (`flutter_image_compress`)
5. Enqueue upload via `UploadQueueService` — path: `scans/{uid}/{docId}.jpg`
   - Queue persists to local storage; retries on reconnect
   - If upload fails, entry shows "pending upload" indicator on Today screen
6. On successful upload: write Firestore doc `entries/{docId}` with `status: pending`, `imageUrl`, `timestamp`, `scanMode`, `uid`
   - Using pre-generated `docId` ensures Storage object and Firestore doc share the same key (no orphaned files)
7. Cloud Function `processFood` triggers on Firestore `onCreate` (background trigger — not callable; completes even if user closes app)
8. Navigate to `/processing/{docId}`

**FCM permission handling:**
- Request notification permission at first scan, explain why ("We'll notify you when your scan is ready")
- If denied: Processing screen stays open and uses Firestore `StreamProvider` as the result delivery mechanism
- Store `fcmPermissionGranted` in `shared/providers/` to branch UI text ("we'll notify you" vs "check back here")

### 2.6 Scan shimmer (capturing state)
- `AnimatedBuilder` with `AnimationController` repeat
- Cyan gradient bar sweeps top→bottom over reticle, 1.6s/pass, infinite

### 2.7 Bottom row
- Library button → `ImagePicker.pickImage(source: gallery)` → same upload flow
- Recent strip → `RecentScansProvider` (last 3) → horizontal `ListView` thumbnails → tap navigates to `/food/:id`

---

## Phase 3 — Processing Screen

### 3.1 Skeleton card
- `IMG-SKEL`: shimmer placeholder 4:3 aspect; `shimmer` package with `Shimmer.fromColors`
  - Base: `#E8E4DC`, Shine: `#F0EDE6`
- `TITLE-SKEL`: two `Container` pill shapes (60% / 40% width) with shimmer
- `MACRO-BARS`: three rows, label + shimmer bar + "—g" placeholder
- Step counter "3/4" text indicator

### 3.2 Top banner
- Glass-morphism card: `BackdropFilter(filter: ImageFilter.blur(sigmaX:12, sigmaY:12))` + semi-transparent container
- Spinning arc: `CircularProgressIndicator` with `strokeWidth:2`, `color: #19D3D9`, small size (16px)
- Tap → navigate to `/today`

### 3.3 Firestore listener
- `StreamProvider` on `entries/{docId}`
- When `status` changes to `complete` → replace skeleton with real data + receive `boundingBox` coordinates (from Cloud Function response)
- Trigger `FlutterLocalNotificationsPlugin` to show local notification (fallback if FCM not received while foregrounded)
- If `status` changes to `error` → show error state with retry option

### 3.4 Push notification handling
- FCM `onMessage` (foreground) → show `FlutterLocalNotificationsPlugin` notification
- `onMessageOpenedApp` / `getInitialMessage` → deep-link to `/today` or `/food/:id`
- Notification payload: `{ docId, foodName, kcal, imageUrl }`
- Lock-screen notification: styled title "Calorix finished your meal scan", body "FoodName · Xkcal"
- If FCM permission denied: no push sent; Processing screen Firestore listener handles delivery; Today tab badge shows pending result

---

## Phase 4 — Today Dashboard

### 4.1 Hero macro card
- `CustomPaint` for three concentric SVG-like arcs:
  - Outer: Protein `#3A5BFF`, Middle: Carbs `#19D3D9`, Inner: Fat `#1FCC74`
  - `strokeLinecap: round` (use `Paint()..strokeCap = StrokeCap.round`)
  - Fill fraction = consumed / target
- Ring center text: "kcal eaten" label, large kcal number, "of TARGET", green pill "X kcal left"

### 4.2 Count-up entry animation
- On screen mount: `AnimationController(duration: 1400ms)` with `CurvedAnimation(Curves.easeOutCubic)`
- Tween each value 0 → current; ring fill driven by same animation
- Macro bars: `AnimatedContainer` width 1200ms

### 4.3 Macro sub-cards (x3)
- One per macro: colored dot, name, current g / target g, % badge, progress bar
- Background: `#FAF8F3` light / `rgba(255,255,255,0.03)` dark

### 4.4 Meal cards
- `ListView` of `FoodEntry` items from `todayEntriesProvider` (Firestore stream)
- Card: thumbnail, name, kcal, time + meal type, macro pips (dot + g), confidence badge
- Tap → `showModalBottomSheet` → `FoodDetailSheet` (slide-up 320ms ease)
- Long-press → `ModalBottomSheet` action menu: Delete, Duplicate, Move meal type

### 4.5 Confidence badge
- `entry.confidence >= 0.80` → green dot + "X% · Confirmed"
- `< 0.80` → amber dot + "X% · Review" + "Needs review →" link → opens `FoodDetailSheet` in edit mode

---

## Phase 5 — Food Detail / Edit Sheet

### 5.1 Sheet presentation
- `DraggableScrollableSheet` — snap points: 0.5 (half), 0.92 (full)
- Hero image area at top with `CachedNetworkImage`

### 5.2 States: original (read-only) vs edit
- `foodEditProvider(id)` — `StateProvider<bool>`
- **Original**: all fields static text, "Edit" chip with pencil icon
- **Edit**: fields become tappable chips → inline numeric keyboard (`showModalBottomSheet` with `NumberPicker`); "Undo" button bottom-left; "Save to Today" button bottom-right

### 5.3 Field list
- Kcal banner + serving multiplier stepper (0.25x steps, 0.25–5.0x range; macros scale proportionally)
- Macro rows: Protein / Carbs / Fat — colored dot, label, editable g chip, % of daily target track
- Detected items chip list — horizontal wrap; tap to edit weight; "Add item" dashed chip
- "Not right? Ask AI to fix this" CTA → navigate to `/ai` with meal context pre-loaded

### 5.4 AI confidence pill
- Floating bottom-left of hero image, `positioned bottom: 40px`
- Green pulsing dot (`AnimationController` opacity 0.4→1.0, 1s repeat reverse)

### 5.5 Header chips
- Back (dismiss sheet), Copy (duplicate entry → navigate to new), Delete (confirmation alert)
- Copy and Delete persist across both states

### 5.6 Save logic
- `FoodEntryRepository.update(id, fields)` → Firestore `entries/{id}`
- On save: close sheet, refresh `todayEntriesProvider`
- Undo: reset `pendingEdits` state to last persisted snapshot
- **Offline writes**: Save button shows spinner and remains disabled until server confirms write (`FieldValue` server timestamp set). While Firestore queues the write locally offline, the UI reflects a "saving…" state. Meal card shows a small pending icon until confirmed.

---

## Phase 6 — History Screen

### 6.1 Calendar card
- **Draggable expand/collapse** (key spec element): `GestureDetector` vertical drag on the `DRAG-BAR` pill at the bottom of the calendar card
  - Drag up → collapse to week strip
  - Drag down → expand to full month grid
  - `AnimationController` drives height transition between two snap points
  - `DraggableScrollableSheet` or custom `AnimatedSize` + `GestureDetector` with `onVerticalDragUpdate`
- **Week strip**: 7 `DayPill` columns — day letter, date number, 24px ring (fill = kcal%)
  - Today: cyan border + cyan bg tint
- **Month grid**: 7-col `GridView` — date + 4px dot (green ≥85%, amber below)
  - Future dates: `opacity: 0.45`
  - Today: cyan border + green active dot
- Day ring fill: consumed kcal / target kcal; green ≥85%, amber below

### 6.2 Weekly stats card
- Mean kcal/day across logged days → "95% target" badge
- Sparkline: 7-point `CustomPaint` line chart (Mon–Sun), cyan line + area fill, dashed target line
- Today dot: `radius: 4`
- Streak badge: green "🔥 X days" pill — consecutive logged days, resets on missed day

### 6.3 Day rows
- `ListView` of `DailyLogSummary` from `historyProvider`
- Row: date, kcal total, meal count, macro pips, completion ring, chevron
- Tap → `/history/:date` → all meals for that day (reuses meal card widget)

---

## Phase 7 — Goals / Macro Setup

### 7.1 Period selector
- Chip "Plan · Cut phase · Week 4 ▾" → dropdown `OverlayEntry`
- Weeks newest-first; past >4 weeks dimmed (opacity 0.7)

### 7.2 Body goal segmented
- `SegmentedButton` custom: Lose fat / Maintain / Lean+ / Custom
- On selection (except Custom): auto-compute kcal target + macro split via TDEE model (local formula)
- Custom: disables auto-compute, allows manual values

### 7.3 Calorie card
- Drag slider: `Slider` range 1500–3500 kcal
- Landmark labels: BMR, TDEE (computed from user profile)
- "AI · TDEE − 420" badge
- "Adjust" button → call `GeminiService.adjustTDEE(weight, activity, frequency)` → show confirmation card

### 7.4 Macro split card
- `CustomPaint` stacked bar (blue/cyan/green proportional)
- Three tiles: Protein / Carbs / Fat with target g + g/kg ratio
- Editing one tile → auto-adjusts others to keep kcal constant (constraint: P×4 + C×4 + F×9 = kcal)

### 7.5 Weight card (placeholder-ready)
- 30-day `CustomPaint` line chart (green declining)
- Latest weight + delta badge
- "Log weight" → `showModalBottomSheet` with numeric input
- "On pace" badge with estimated completion date

---

## Phase 8 — AI Chat Screen

### 8.1 Header
- Green dot + "CAN EDIT YOUR PLAN" mono label

### 8.2 Message list
- `ListView.builder` with reverse: true (newest at bottom)
- **User bubble**: right-aligned, `BorderRadius(18,18,6,18)`, bg `rgba(58,91,255,0.10)`
- **AI bubble**: left-aligned, `BorderRadius(18,18,18,6)`, card bg; supports `<b>` emphasis (parse via `RichText`)

### 8.3 Confirm cards
- Embedded in AI bubble when AI proposes a mutation
- "AI ACTION" badge, change title, old→new table (colored dot, field, strikethrough old, new + delta)
- Delta: blue for increases, green for decreases on kcal
- Reject / Apply buttons → Apply calls `FoodEntryRepository` or `MacroTargetRepository` mutation

### 8.4 Composer
- Pill-shaped `TextField` with custom decoration
- Left: + icon (attach meal photo or today's log)
- Right: mic icon + gradient send arrow
- Send → `GeminiService.chat(messages, context)` → streaming response

### 8.5 Suggested prompts strip
- Horizontal `SingleChildScrollView` chip row
- Tap fills and sends immediately
- Chips: "Plan my remaining macros", "Adjust for fat loss", "Why are my carbs low?"

### 8.6 AI service (GeminiService)
- `google_generative_ai` SDK — `GenerativeModel(model: 'gemini-1.5-pro')` (chat-optimized)
- System prompt includes: today's log, macro targets, user goals
- Tool calling support for mutations: `updateMacroTarget`, `correctMealEntry`, `setBodyGoal`
- Parse tool call responses → show confirm card before applying

---

## Phase 9 — Backend: Firebase + Cloud Functions

### 9.1 Firestore schema
```
users/{uid}/
  profile: { name, email, tdee, activityLevel, trainingFreq }
  targets/{targetId}/           # sub-collection — supports historical plans
    { planName, goal, startDate, endDate, kcal, protein, carbs, fat, isActive: bool }
    # "isActive: true" = current plan; period selector queries by startDate desc
  weightLogs/{date}/: { date, weight }

entries/{entryId}/
  uid, date, timestamp, imageUrl, scanMode,
  status: pending | processing | complete | error
  foodName, kcal, protein, carbs, fat
  servingMultiplier, mealType, detectedItems: [{ name, weight }]
  confidence, corrected

dailyLogs/{uid}_{date}/
  kcal, protein, carbs, fat, entryCount
```

### 9.2 Security rules (Firestore)
- `users/{uid}/**` — read/write only if `request.auth.uid == uid`
- `entries/{entryId}` — read/write only if `resource.data.uid == request.auth.uid`
- Cloud Functions service account bypasses rules for writes via Admin SDK

**Data validation rules (add alongside ownership checks):**
```
// entries write validation
request.resource.data.kcal is number &&
request.resource.data.kcal >= 0 &&
request.resource.data.kcal <= 10000 &&
request.resource.data.protein is number &&
request.resource.data.protein >= 0 &&
request.resource.data.foodName is string &&
request.resource.data.foodName.size() < 500 &&
request.resource.data.confidence is number &&
request.resource.data.confidence >= 0.0 &&
request.resource.data.confidence <= 1.0
```

### 9.3 Cloud Function: `processFood`
```
Trigger: Firestore onCreate on entries/{entryId} where status == "pending"
Steps:
  1. Download image from Storage
  2. Call Gemini Vision API (gemini-1.5-flash) with image + prompt
  3. Parse response: { foodName, kcal, protein, carbs, fat, confidence, detectedItems }
  4. Update entry doc: status = "complete", fill nutrition fields
  5. Update/upsert dailyLog doc for that date
  6. Send FCM push to user token: { title, body, data: { docId, entryId } }
```

### 9.4 Gemini Vision prompt (Cloud Function)
```
You are a nutrition estimation AI. Analyze this food image and return JSON only:
{
  "foodName": string,
  "kcal": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "confidence": number (0.0-1.0),
  "detectedItems": [{ "name": string, "weight": number }],
  "boundingBox": { "x": number, "y": number, "width": number, "height": number }
}
Estimate for the portion shown. Use standard nutrition databases. Return ONLY valid JSON.
```
- `boundingBox` values are 0.0–1.0 fractions of image dimensions
- Saved to `entries/{docId}` — used by `ScanScreen` reticle snap animation
- **Model**: `gemini-1.5-flash` (stable multimodal vision model)

### 9.5 Firebase Storage rules
- `scans/{uid}/{file}` — read/write only if `request.auth.uid == uid`

### 9.6 Auth
- Anonymous auth on first launch → upgrade to Google Sign-In later
- `authStateChangesProvider` (StreamProvider) gates app entry

---

## Phase 9b — Profile / Settings Sheet

### 9b.1 Trigger
- Profile chip (top-right of Scan screen and all main screens) → `showModalBottomSheet` → `ProfileSheet`

### 9b.2 Content
- User display name + email (or "Guest" for anonymous users)
- **Link account**: "Sign in with Google" → `linkWithCredential` (upgrades anonymous → Google account)
- Theme selector: System / Light / Dark
- Notification settings: toggle (re-requests permission if denied)
- Legal: Privacy Policy, Terms of Service links
- Version info
- Sign out button (with confirmation alert)

---

## Phase 10 — Shared Widgets

### 10.1 MacroRing
- `CustomPainter` with three `drawArc` calls (outer→inner: protein, carbs, fat)
- `Paint()..style = PaintingStyle.stroke ..strokeCap = StrokeCap.round`
- Center overlay via `Stack` + `Positioned.fill` + `Center`

### 10.2 SkeletonShimmer
- `Shimmer.fromColors(baseColor: #E8E4DC, highlightColor: #F0EDE6, child: ...)`
- Composable: wrap any `Container` shape

### 10.3 ConfidenceBadge
- `confidence >= 0.80` → green `CircleAvatar` dot + "X% · Confirmed" text
- `< 0.80` → amber dot + "X% · Review" + `TextButton("Needs review →")`

### 10.4 MacroProgressBar
- `TweenAnimationBuilder` width from 0 → fraction over 1200ms
- Colored fill using macro color token

### 10.5 GradientFAB
- Center nav button: `Container` with `BoxDecoration(gradient: SweepGradient(colors:[blue,cyan,green,blue]))`
- Inner circle: dark/light bg + eye icon (custom `cx-icons` spec)
- Green active dot below "Scan" label

---

## Phase 11 — Animations

| Animation | Implementation |
|-----------|---------------|
| Scan shimmer | `AnimationController(duration: 1600ms)` + `RepeatMode.restart` + `SlideTransition` cyan bar |
| Capture button ring | `AnimationController` + `RotationTransition` + `SweepGradient` on border |
| Reticle snap | `TweenAnimationBuilder` 200ms ease-out on corner `CustomPainter` offsets; bounding box coordinates sourced from `entries/{docId}.boundingBox` returned by Cloud Function |
| Skeleton shimmer | `shimmer` package — 1.4s/pass, left→right, base `#E8E4DC`, shine `#F0EDE6` |
| Count-up (Today) | `AnimationController(1400ms)` + `CurvedAnimation(Curves.easeOutCubic)` + `IntTween` |
| Macro bars | `AnimatedContainer` width 1200ms |
| Sheet slide-up | GoRouter `CustomTransitionPage` — `SlideTransition` bottom→up 320ms |
| Confidence dot pulse | `AnimationController` opacity 0.4→1.0, 1s, `repeat(reverse:true)` |

---

## Implementation Order

1. **Phase 0** — Project scaffold, pubspec, Firebase init, design system, auth error handling
2. **Phase 1** — Navigation shell + GoRouter (including `/profile` route)
3. **Phase 10** — Shared widgets (MacroRing, SkeletonShimmer, etc.)
4. **Phase 2** — Scan screen (camera, capture button, shimmer, upload queue flow, FCM permission handling)
5. **Phase 3** — Processing screen (skeleton, Firestore listener, FCM + local notification fallback)
6. **Phase 9** — Backend: Firestore schema (targets sub-collection), Cloud Function (bounding box in response), Storage rules, validated security rules
7. **Phase 9b** — Profile / Settings sheet
8. **Phase 4** — Today dashboard (hero ring, count-up, meal cards, offline pending state)
9. **Phase 5** — Food detail sheet (CRUD, edit state, serving multiplier, offline save state)
10. **Phase 6** — History (draggable calendar, sparkline, streak)
11. **Phase 7** — Goals (TDEE slider, macro split, Log Weight sheet, targets sub-collection queries)
12. **Phase 8** — AI Chat (Gemini 1.5 Pro integration, confirm cards, mutations)
13. **Phase 11** — Polish all animations (including reticle snap with bounding box)

---

## Key Constraints (from requirements + design)

- No `#FFFFFF` or `#000000` anywhere
- Scan FAB always center (index 2), never move
- Default landing: `/scan` (not `/today`)
- All food entities: full CRUD
- Confidence ≥80%: Confirmed; <80%: "Needs review →"
- Serving multiplier: 0.25x steps, 0.25–5.0x, macros scale proportionally
- Firebase Auth: always use SDK, never custom auth
- Macro colors: Protein=blue `#3A5BFF`, Carbs=cyan `#19D3D9`, Fat=green `#1FCC74`
