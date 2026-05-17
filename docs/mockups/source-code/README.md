# Calorix Spec Cards

Developer spec annotation cards — one per screen section. Each card lists non-obvious UI elements with behavior spec.

## Scan / Camera

### Chrome / Controls

- **TOP-L — Flash · Auto chip**: Taps cycle Auto → On → Off. Icon and label update. Auto = system decides; On = torch always; Off = no flash. Only relevant for Meal mode.
- **TOP-R — Profile chip**: Opens user profile / account settings sheet. Consistent across all main screens.
- **MODE-SEG — Meal / Barcode / Label selector**: Switches the AI recognition pipeline. Meal = photo-to-nutrition AI model. Barcode = UPC/EAN database lookup. Label = OCR reads the printed nutrition facts table. Active mode is the white pill.

### Viewfinder

- **RETICLE — Corner bracket guides**: Visual framing guide only — no functional behavior. After successful detection, brackets animate to hug the food bounding box (4-corner snap animation, ~200ms ease-out).
- **HINT-TXT — "Center your meal" label**: Static helper text. Hidden during capturing state.
- **SHIMMER — Scan-line shimmer (capturing only)**: Cyan gradient bar sweeps top-to-bottom over reticle area. Infinite loop, 1.6 s per pass. Indicates frame upload/processing. Dismisses when app returns to idle or navigates to processing screen.

### Capture Button

- **BTN-IDLE — Capture button (idle)**: Outer ring 3px translucent border (dark) or dark border (light). Inner circle white (dark) or black (light) with small AI gradient dot. Single tap triggers capture.
- **BTN-CAP — Capture button (capturing)**: Outer ring becomes rotating conic gradient (blue→cyan→green→blue). Inner circle contains a square (video-stop affordance). Tap cancels scan and returns to idle.

### Bottom Row (Above Nav)

- **LIB — Library button**: Opens system photo picker. Selected image treated like live capture; uploaded for AI analysis, transitions to processing screen.
- **RECENT — Recent button**: Horizontal peek strip of last 3 scanned meal thumbnails. Tap a thumbnail to jump directly to that Food Detail screen.

### Bottom Navigation FAB

- **FAB — Scan FAB in bottom nav**: AI gradient outer ring (blue→cyan→green). Inner circle: dark bg + eye icon in dark mode; light bg + dark eye icon in light mode. Always center (3rd) tab. Green active-dot always visible below "Scan" label on this screen. States: dark: dark inner + white eye; light: white inner + dark eye.

## Processing State

### Top Banner

- **BANNER — "You can close the app"**: Appears immediately after capture is submitted. Glass-morphism card at top (iOS notification position). Contains Calorix gradient icon, headline, subtitle, and spinning arc indicator. Tap navigates to Today screen. Dark mode: dark glass. Light mode: white glass.
- **SPIN-ARC — Spinning arc indicator**: 16×16 circle with partial cyan border rotating at 0.9 s/rev. Indicates active cloud processing. Disappears once notification fires.

### Processing Card (Skeleton)

- **IMG-SKEL — Image skeleton**: 4:3 box with shimmer gradient moving left to right at 1.4 s/pass. Small "AI" badge top-left. Replaced by actual food photo once analysis completes.
- **TITLE-SKEL — Name + meal type skeletons**: Two pill-shaped skeleton lines (60% and 40% width) for food name and meal type. Same shimmer timing.
- **MACRO-BARS — Macro bar skeletons**: Three rows (Protein / Carbs / Fat) with label, partially-filled shimmer bar, and "—g" placeholder. Bar shimmer independently timed. Replaced by real values on notification arrival.
- **STEP-CTR — 3 / 4 step counter**: Indicates pipeline progress (upload → detect → estimate → log). Informational only.

### Colors in Light Mode

- **LIGHT — Skeleton colors**: Skeleton base #E8E4DC. Skeleton shine #F0EDE6. Card background rgba(255,255,255,0.92). Ensures visibility on light surfaces.

## Today Dashboard

### Entry Animation

- **ANIM — Count-up entry animation**: On every mount, kcal + macro values count up from 0 to current over ~1.4 s (easeOutCubic via requestAnimationFrame). Ring fill driven by animated values (strokeDasharray updates each frame). Bars use CSS transition width 1.2 s.

### Hero Macro Card

- **RING — Concentric macro ring**: Three concentric SVG circles: outer = Protein (blue #3A5BFF), middle = Carbs (cyan #19D3D9), inner = Fat (green #1FCC74). Fill = current / target. strokeLinecap round. Track ring low opacity.
- **RING-TXT — Ring center text**: "kcal eaten" label (9.5px mono, uppercase). Large kcal number (36px, tabular). "of TARGET" line (11px). Green "X kcal left" pill (10px mono, rgba(31,204,116,0.10) bg). Vertically centered, padding 18px.
- **SUB-CARDS — Macro sub-cards (x3)**: One card each for Protein / Carbs / Fat. Full width of outer hero card. Shows colored dot + macro name (left), current g / target g + % badge (right), filled progress bar (bottom). Bar fill driven by count-up animation. Background #FAF8F3 light / rgba(255,255,255,0.03) dark.

### Meal Cards

- **MEAL-CARD — Recent scan card**: Tap opens Food Detail (sheet slide-up, ~320ms ease). Long-press opens action menu: Delete, Duplicate, Move meal type. Contains food thumbnail (gradient placeholder), name, kcal, time + meal type, macro pips (5×5 dot + g value), confidence badge.
- **CONF-BADGE — Confidence badge**: >=80 → green dot + "X% · Confirmed". <80 → amber dot + "X% · Review" + "Needs review →" link. Tapping "Needs review →" opens Food Detail in edit mode.

## Food Detail / Edit

### States

- **ORIG — Original (read-only) state**: Edit chip shows pencil + "Edit" text. No Undo. No Save to Today. All fields static text. Default when opening from confirmed scan.
- **EDIT — Edit state**: Edit chip becomes pressed (filled ink bg, pencil icon only). Undo button appears bottom-left. Save to Today appears bottom-right. Field value chips tappable → inline numeric keyboard. Changes not persisted until Save tapped. States: foodEdit: false → original; foodEdit: true → editing.

### Header Chrome (Hero Image Area)

- **CONF-PILL — AI confidence pill**: Bottom-left of hero. Green pulsing dot + "AI · XX% CONFIDENCE". Positioned bottom: 40px to sit above bottom sheet rounded-corner drag area.
- **BACK — Back chip**: Top-left. Chevron + "Back". Dismisses Food Detail sheet (slide-down).
- **COPY-DEL — Copy / Delete chips**: Copy duplicates entry in same day log, then navigates to new entry. Delete shows confirmation alert before removing. Persist across original and edit states.

### Sheet Body

- **KCAL-BANNER — Calorie banner**: Large kcal number + x-multiplier stepper. Stepper changes serving multiplier (0.25x increments). Macro values scale proportionally. Range 0.25x–5.0x.
- **MACRO-ROWS — Macro edit rows**: Three rows: Protein / Carbs / Fat. Each row shows colored dot, label, editable g chip, and track showing % of daily target. In edit mode chip is tappable and opens numeric input.
- **DET-ITEMS — Detected items chips**: Horizontal wrapping chip list. Each chip = ingredient name + weight. Tap to edit weight inline. "Add item" dashed chip appends new ingredient.
- **AI-FIX — "Not right? Ask AI to fix this" CTA**: Opens AI chat pre-loaded with this meal as context. AI can re-estimate macros based on free-text description. Always visible in both states.

### Bottom Action Bar (Edit Only)

- **UNDO — Undo button**: Reverts pending in-session edits to last persisted state. Does not undo previously saved changes. Stays in edit mode after undo.
- **SAVE — Save to Today button**: Commits changes to today log and closes sheet. Shown only in edit state.

## History

### Calendar Card

- **DRAG-BAR — Draggable expand bar**: Horizontal pill at bottom of calendar card. Drag up to collapse to week strip; drag down to expand to full month grid. In mockup toggled via History view Tweak selector (W / M).
- **WEEK-VIEW — Week strip**: Seven DayPill columns. Each pill shows day letter (Mon–Sun), date number, 24px ring (fill = kcal%). Today highlighted with cyan border and cyan bg tint. Tap a day with data to open that day’s food log.
- **MONTH-VIEW — Month grid**: 7-column grid (Mon–Sun header). Each cell shows date number + 4px colored dot (green = on-target, amber = under). Future dates dimmed (opacity 0.45). Today highlighted with cyan border + green active dot.
- **DAY-RING — Day progress ring**: Same ring for both views. Fill = kcal consumed / kcal target. Green if >=85%, amber if below. No fill/transparent ring = no data for that day.

### Weekly Stats Card

- **AVG — Weekly average**: Mean kcal/day across logged days in selected week. "95% target" badge = average / daily target.
- **SPARKLINE — Calorie sparkline**: 7-point line chart (Mon–Sun). Cyan line with area fill. Dashed horizontal target line. Today’s dot larger (r=4).
- **STREAK — Streak badge**: Consecutive logged days. Displayed as green fire-icon pill. Resets to 0 if a day passes with no entries.

### Day Rows

- **DAY-ROW — Day log row**: Date label, kcal total, meal count, macro pips, completion ring. Amber ring = under target. Right chevron opens drill-in view for all meals on that day.

## Goals / Macro Setup

### Period Selector

- **PERIOD-PILL — Period selector chip**: "Plan · Cut phase · Week 4 ▾" pill. Tap opens dropdown below. Dot + "Plan · Cut phase ·" is plan name (set by user or AI). "Week 4 ▾" is selected period with chevron.
- **PERIOD-DD — Period dropdown**: Weeks listed newest-first (Week 6 → Week 2), then Months. Current period checkmarked. Future weeks not dimmed. Past periods beyond 4 weeks dimmed (opacity 0.7). Tap a period updates stats cards.

### Body Goal Segmented

- **BODY-SEG — Lose fat / Maintain / Lean+ / Custom**: Active mode has white card background with shadow. Selecting a mode auto-computes calorie target and macro split using AI TDEE model. "Custom" disables auto-computation and allows manual values.

### Calorie Card

- **KCAL-DIAL — Calorie target + slider**: Drag thumb to set daily kcal. Range 1 500–3 500. Landmark labels: BMR and TDEE. "AI · TDEE − 420" badge shows computed target. Editing triggers macro split recalculation.
- **ADJUST — "Adjust" button**: Re-runs TDEE using latest weight, activity level, and training frequency. Shows confirmation card before applying.

### Macro Split Card

- **MACRO-SPLIT — Stacked macro bar + tiles**: Stacked bar (blue/cyan/green) shows %. Three tiles (Protein / Carbs / Fat) show target g + g/kg ratio. Editing one tile auto-adjusts others to keep total calories constant.

### Weight Card

- **WEIGHT — Weight tracker**: 30-day declining line chart (green). Latest weight + delta badge. "Log weight" button opens numeric input sheet. "On pace" green confirmation shows estimated completion date and body-fat %. Displayed only when weight data exists.

## Calorix AI Chat

### Header

- **STATUS — "CAN EDIT YOUR PLAN" indicator**: Green dot + mono label. Means AI has write-permission to propose mutations to meals, macro targets, and goals. Not a chatbot; confirmations update real app entities.

### Confirm Cards

- **CONF-CARD — AI action confirm card**: Generated after AI proposes a change. Contains "AI ACTION" badge (top-right), change title, table of affected values (old → new + delta), and reject/apply buttons. Applying calls mutation API. Delta blue for increases, green for decreases on calories.
- **CONF-TABLE — Old → new table**: Each row has colored dot + field name, old value (strikethrough), right-chevron, new value + delta badge. Delta formats: "-12" (decrease, green), "+6" (increase, blue), "0" (no change, muted).

### Input Area

- **COMPOSER — Message composer**: Pill-shaped bar. Left: + icon (attach meal photo or today’s log as context). Middle: placeholder "Ask anything…". Right: mic icon (voice input) + gradient send arrow (submits message).
- **PROMPTS — Suggested prompts strip**: Horizontal scroll row of pre-built query chips. Tapping fills composer and sends immediately. Examples: "Plan my remaining macros", "Adjust for fat loss", "Why are my carbs low?"

### Bubbles

- **USER-BUBBLE — User message bubble**: Right-aligned. Background rgba(58,91,255,0.10) light / rgba(58,91,255,0.18) dark. Border radius 18/18/6/18 (sharp bottom-right = sent corner).
- **AI-BUBBLE — AI message bubble**: Left-aligned. Background card color (white light / #14181E dark). Border radius 18/18/18/6 (sharp bottom-left = received corner). Can contain <b> tags for emphasis.
