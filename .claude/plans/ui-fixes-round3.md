# UI Fixes Round 3 — Implementation Plan

## Context
- App uses anonymous Firebase Auth (`signInAnonymously`); seed data writes to `dailyLogs`.
- Previous sessions fixed scan layout, goals header, history toggle, and font migration (Inter Tight via GoogleFonts).
- This plan covers 7 areas: Firebase fix, Today rings, History calendar, Scan button, Goals cards, AI Chat, Nav.

---

## 0. Firebase Permission Fix (BLOCKER — must fix first)

**Root cause**: `firestore.rules` has `allow write: if false;` for `dailyLogs`. The seed service in `_AuthGate._ensureSignedIn()` does a batch write to dailyLogs after anonymous sign-in. The write fails with `permission-denied`, which propagates as `_authError`, showing the "Connection error" screen on every cold start.

**File 1 — `firestore.rules`**  
Change the `dailyLogs` write rule from `if false` to uid-scoped:
```
match /dailyLogs/{logId} {
  allow read: if request.auth != null &&
    logId >= request.auth.uid + '_' &&
    logId < request.auth.uid + 'z';
  allow write: if request.auth != null &&
    logId >= request.auth.uid + '_' &&
    logId < request.auth.uid + 'z';
}
```

**File 2 — `lib/main.dart`**  
Wrap the `SeedDataService.seedIfEmpty()` call in its own try-catch so a failed seed never surfaces as an auth error. Auth itself succeeding but seed failing should not block the app.

**Deployment required**: after updating `firestore.rules`, user runs `firebase deploy --only firestore:rules`.

---

## 1. Today Screen — Ring text clipping + Percentage badge

### 1a. MacroRing center text clipping

**Root cause** (`lib/shared/widgets/macro_ring.dart`):
- `strokeWidth = 14` (default), `gap = 14 * 2.2 = 30.8`
- Inner (Fat) ring radius = 100 − 7 − 30.8 − 30.8 = **31.4 px**
- That leaves center free diameter = (31.4 − 7) × 2 = **~49 px**
- But the center text (KCAL EATEN + number + "of X" + pill) needs ~130 px diameter minimum.

**Fix**:  
`lib/shared/widgets/macro_ring.dart` — Change `strokeWidth` default from `14` to `8`.  
`lib/features/today/today_screen.dart` — Pass `size: 220` to `AnimatedMacroRing` (was 200).

With strokeWidth=8, size=220:
- Outer radius: 110 − 4 = 106
- Middle radius: 106 − 17.6 = 88.4
- Inner radius: 88.4 − 17.6 = 70.8
- Center free diameter: (70.8 − 4) × 2 = **133.6 px** ← enough for text

### 1b. Percentage badge (was removed in prior session)

**File**: `lib/shared/widgets/macro_progress_bar.dart`

`_PercentBadge` is currently a bare `Text('$percent%')`. The mockup shows a colored pill chip.  
Replace with:
```dart
Container(
  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
  decoration: BoxDecoration(
    color: color.withAlpha(20),
    borderRadius: BorderRadius.circular(6),
  ),
  child: Text('$percent%', style: AppTextStyles.labelSmall.copyWith(color: color)),
)
```

---

## 2. History Screen — Calendar day pills

**File**: `lib/features/history/history_screen.dart`, class `_DayPill`

**Current state**: Plain `Column(letter, SizedBox(36×36 ring+date))`. No pill-shaped background container. Today has cyan tint on inner 28px circle only.

**Spec**: "Each pill shows day letter (Mon–Sun), date number, 24px ring. Today highlighted with cyan border and cyan bg tint."

**Fix**:
1. Reduce ring SizedBox from 36×36 to 32×32. Inner circle from 28 to 24px.
2. Wrap the entire Column (letter + ring) in an `AnimatedContainer` that forms a pill shape (rounded rectangle) for today/selected:
   ```dart
   AnimatedContainer(
     duration: Duration(milliseconds: 200),
     width: 36,
     padding: EdgeInsets.symmetric(vertical: 6, horizontal: 2),
     decoration: BoxDecoration(
       color: isToday ? AppColors.cyan.withAlpha(18) : Colors.transparent,
       borderRadius: BorderRadius.circular(18),
       border: isToday ? Border.all(color: AppColors.cyan, width: 1.5) : null,
     ),
     child: Column(children: [dayLetter, ring]),
   )
   ```
3. The ring (CustomPaint + date number) shrinks to 32px. The `_DayRingPainter` already uses `size.width/2` for radius, so it adapts automatically.

---

## 3. Scan Screen

**File**: `lib/features/scan/scan_screen.dart`

### 3a. Profile button — anonymous icon

`_ProfileChip` currently shows '?' for anonymous users. For anonymous (`user?.isAnonymous == true` or both displayName and email are null):
```dart
// Show "not signed in" icon instead of initial letter
Icon(Icons.person_off_outlined, size: 18, color: AppColors.cameraOverlayText)
```
When signed in with an account: keep the initial-letter circle as is.

### 3b. Capture button inner circle — dark mode color

**Current**: `color: AppColors.cameraOverlayText` (always white).  
**Fix**: Make it theme-aware. Read `brightness` inside `_CaptureButton.build(context)`:
```dart
final isDark = Theme.of(context).brightness == Brightness.dark;
// inner circle:
color: isDark ? AppColors.backgroundDark : Colors.white,
```
FAB spec ("dark: dark inner + white eye") confirms dark bg in dark mode.

### 3c. Capture button size — increase

**Current**: outer SizedBox 92×92, inner Container 76×76.  
**Fix**: outer → 100×100, inner → 84×84.  
Gap: (100−84)/2 = 8px — ring remains visible. Proportions match mockup expectation.

### 3d. Flash button position

Flash = TOP-L and Profile = TOP-R per spec. Current layout already correct. No change needed.

---

## 4. Goals Screen

**File**: `lib/features/goals/goals_screen.dart`

### 4a. Adjust button styling

**Current**: plain Container with border + "Adjust" text.  
**Fix**: styled capsule with tune icon + text:
```dart
Container(
  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 7),
  decoration: BoxDecoration(
    color: AppColors.blue.withAlpha(15),
    borderRadius: BorderRadius.circular(20),
    border: Border.all(color: AppColors.blue.withAlpha(50), width: 1),
  ),
  child: Row(mainAxisSize: MainAxisSize.min, children: [
    Icon(Icons.tune_rounded, size: 13, color: AppColors.blue),
    SizedBox(width: 5),
    Text('Adjust', style: AppTextStyles.labelSmall.copyWith(color: AppColors.blue)),
  ]),
)
```

### 4b. Period pill — reduce thickness

**Current**: `padding: EdgeInsets.symmetric(horizontal: 16, vertical: 10)` — too tall.  
**Fix**: `padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5)`.

### 4c. Body goal selector — equal height for all items

**Current**: `Column(mainAxisSize: MainAxisSize.min)` inside `AnimatedContainer`. When "Maintain" or "Custom" is selected (no subtitle), the button is shorter than "Lose fat" (has subtitle "-0.5kg/wk").

**Fix**: Wrap the Row of goals in `IntrinsicHeight` and use `CrossAxisAlignment.stretch`, so all buttons match the tallest:
```dart
IntrinsicHeight(
  child: Row(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: goals.map((g) {
      return Expanded(
        child: GestureDetector(
          onTap: ...,
          child: AnimatedContainer(
            // same styling
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,  // center within stretched height
              children: [...],
            ),
          ),
        ),
      );
    }).toList(),
  ),
)
```

### 4d. Calorie slider styling improvement

**Current**: `trackHeight: 4`, plain blue thumb. Styled acceptably but not matching premium feel.  
**Fix**: Increase `trackHeight: 6`. Add `thumbShape: RoundSliderThumbShape(enabledThumbRadius: 8)`. Landmarks ("BMR", "TDEE") use current text which is fine — no major change needed.

### 4e. Macro split bar — thicker + more rounded

**Current**: `ClipRRect(borderRadius: 4)`, height 12.  
**Fix**: `ClipRRect(borderRadius: 12)`, height 16:
```dart
ClipRRect(
  borderRadius: BorderRadius.circular(12),
  child: Row(
    children: [
      Expanded(flex: ..., child: Container(height: 16, color: AppColors.protein)),
      Expanded(flex: ..., child: Container(height: 16, color: AppColors.carbs)),
      Expanded(flex: ..., child: Container(height: 16, color: AppColors.fat)),
    ],
  ),
)
```

### 4f. Quick ±100 kcal stepper in calorie card

Add to `_CalorieCard`: a small stepper (−/+) in the top-right of the header row:
```dart
Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,
  children: [
    Text('DAILY CALORIE TARGET', ...),
    Row(children: [
      _StepButton(icon: Icons.remove, onTap: () => onChanged((kcal - 100).clamp(1500, 3500))),
      Padding(
        padding: EdgeInsets.symmetric(horizontal: 6),
        child: Text('±100', style: AppTextStyles.labelSmall.copyWith(color: subtextColor)),
      ),
      _StepButton(icon: Icons.add, onTap: () => onChanged((kcal + 100).clamp(1500, 3500))),
    ]),
  ],
)
```
`_StepButton`: small 28×28 circular Container with border, icon size 14.

### 4g. Weight card — add period selector + ensure log weight visible

**Current**: Weight card has "Log weight" button but lacks a period selector (e.g. "Last 30 days").

**Fix**: Add a period chip to the weight card header:
```dart
Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,
  children: [
    Text('WEIGHT', style: AppTextStyles.labelMono.copyWith(color: subtextColor)),
    Container(
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isDark ? AppColors.borderDark : AppColors.borderLight),
      ),
      child: Row(children: [
        Text('Last 30 days', style: AppTextStyles.labelSmall.copyWith(color: subtextColor)),
        Icon(Icons.keyboard_arrow_down, size: 14, color: subtextColor),
      ]),
    ),
  ],
)
```
The existing `OutlinedButton.icon(label: Text('Log weight'))` stays — verify it's not cut off.

---

## 5. AI Chat Screen

**File**: `lib/features/ai_chat/ai_chat_screen.dart`

### 5a. Message timestamps

`ChatMessage` already has a `timestamp: DateTime` field. Add timestamp display below each bubble in `_MessageBubble`:
```dart
Column(
  crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
  children: [
    // ... existing bubble container ...
    const SizedBox(height: 2),
    Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text(
        DateFormat('h:mm a').format(message.timestamp),
        style: AppTextStyles.labelSmall.copyWith(
          color: isDark ? AppColors.textTertiaryDark : AppColors.textTertiaryLight,
          fontSize: 9,
        ),
      ),
    ),
  ],
)
```

### 5b. Input area — opaque background for prompt pills + composer

**Current**: prompts `SizedBox(height:44)` and composer float over the chat — chat is visible through them.  
**Fix**: Wrap both in a `Container` with an explicit themed background color:
```dart
Container(
  color: isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
  child: Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      // suggested prompts (existing SizedBox)
      const SizedBox(height: 8),
      // composer SafeArea (existing)
    ],
  ),
)
```

### 5c. Composer — slim down + mic background + reduce gap

**Current**: `_Composer` is a separate widget (not yet read in full). Plan:  
Read `_Composer` implementation and apply:
1. Wrap entire composer row in one Container (pill shape, 50-54px height) with border + themed bg.
2. TextField: `contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)`, `fillColor: transparent`, `isDense: true`, `maxLines: 1`.
3. Mic button: wrap `Icons.mic` in a small 32×32 circular Container with `color: AppColors.blue.withAlpha(15)`.
4. Send arrow: gradient Circle button (blue→cyan), 36×36, immediately adjacent to mic (no gap).
5. Left: `+` icon button.
6. No gaps between mic and send — they are in the same `Row` within the Container.

### 5d. Header — add gradient separator

Add a horizontal gradient divider below the header `Padding`:
```dart
Container(
  height: 1,
  decoration: BoxDecoration(
    gradient: LinearGradient(
      colors: [AppColors.blue.withAlpha(80), AppColors.cyan.withAlpha(80), AppColors.green.withAlpha(80)],
    ),
  ),
)
```

---

## 6. Global Navigation — Active dot for non-scan tabs

**File**: `lib/shell/app_shell.dart`, class `_NavButton`

**Current**: Active non-scan tabs only get colored icon + label (blue). No dot indicator. Only Scan FAB has a green dot.

**Fix**: Add a small 4×4 dot below the label for all active non-scan tabs:
```dart
Column(
  mainAxisAlignment: MainAxisAlignment.center,
  children: [
    Icon(icon, color: color, size: 22),
    const SizedBox(height: 2),
    Text(label, style: AppTextStyles.labelSmall.copyWith(color: color)),
    if (isActive) ...[
      const SizedBox(height: 2),
      Container(
        width: 4,
        height: 4,
        decoration: BoxDecoration(
          color: activeColor,
          shape: BoxShape.circle,
        ),
      ),
    ] else
      const SizedBox(height: 6), // keep consistent height
  ],
)
```

---

## Implementation Order

1. **firestore.rules** (unblock data loading) + `main.dart` try-catch
2. **macro_ring.dart** + **macro_progress_bar.dart** (Today rings fix)
3. **today_screen.dart** (pass new ring size)
4. **history_screen.dart** (day pill redesign)
5. **scan_screen.dart** (profile icon, button color, button size)
6. **goals_screen.dart** (all 7 changes — single file pass)
7. **ai_chat_screen.dart** (all 4 changes — single file pass)
8. **app_shell.dart** (nav dot)
9. Run `fvm flutter analyze` — fix any issues
10. User deploys rules: `firebase deploy --only firestore:rules`

## Files changed

| File | Changes |
|---|---|
| `firestore.rules` | Allow uid-scoped dailyLogs writes |
| `lib/main.dart` | Wrap seed in try-catch |
| `lib/shared/widgets/macro_ring.dart` | strokeWidth default 14→8 |
| `lib/shared/widgets/macro_progress_bar.dart` | Restore _PercentBadge as colored chip |
| `lib/features/today/today_screen.dart` | Pass size:220 to AnimatedMacroRing |
| `lib/features/history/history_screen.dart` | _DayPill pill container + ring resize |
| `lib/features/scan/scan_screen.dart` | Profile icon, button color, button size |
| `lib/features/goals/goals_screen.dart` | Adjust btn, period pill, goal height, slider, bar, stepper, weight period |
| `lib/features/ai_chat/ai_chat_screen.dart` | Timestamps, opaque bg, composer, header separator |
| `lib/shell/app_shell.dart` | Active dot on non-scan tabs |
