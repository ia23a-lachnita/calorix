# Calorix Design System and Interaction Spec

Source assets:
- Requirements: `requirements.md`
- Mockup spec cards: `docs/mockups/source-code/README.md`
- Visual references: `docs/mockups/images/all_dark.jpg`, `docs/mockups/images/all_light.jpg`

## Product Feel

Calorix must feel premium, serious, smooth, modern, fitness-focused, and minimal. It should feel like a polished AI fitness tool, not a childish diet app. Use Apple-like clarity, strong but soft contrast, gym/fitness restraint, and purposeful AI motion.

The existing mockups are the visual target: glassy dark mode, warm off-white light mode, dense but legible data cards, cyan/blue/green energy, and compact iOS-native feeling.

## Theme Tokens

| Token | Light | Dark |
|---|---:|---:|
| Background | `#FAF8F3` | `#0E1117` |
| Background secondary | `#F1EEE7` | `#14181E` |
| Surface | `rgba(255,255,255,0.92)` | `rgba(255,255,255,0.03)` |
| Surface raised | `#FFFDF7` only if opacity/tonal use avoids pure white appearance | `#171C24` |
| Border | `rgba(18,20,26,0.08)` | `rgba(255,255,255,0.08)` |
| Text primary | `#101318` | `#F4F7FA` |
| Text secondary | `#6B6F77` | `#A8B0BC` |
| Text tertiary | `#9A9EA6` | `#6F7885` |
| Blue / Protein | `#3A5BFF` | `#3A5BFF` |
| Cyan / Carbs | `#19D3D9` | `#19D3D9` |
| Green / Fat / success | `#1FCC74` | `#1FCC74` |
| Amber / review | `#F6A63A` | `#F6A63A` |
| Skeleton base | `#E8E4DC` | `#1B212A` |
| Skeleton shine | `#F0EDE6` | `#252D38` |

Avoid literal `#FFFFFF` and `#000000` in app UI tokens. Use tonal off-white and graphite/charcoal instead.

Gradient direction: blue → cyan → green. Use gradients for scan, AI, progress highlights, and confirmation accents; do not use gradients as huge flat backgrounds.

## Typography and Layout

- Use a clean native-feeling sans font stack. Prioritize tabular numbers for nutrition, dates, and progress.
- Use compact uppercase mono labels for metadata: `AI`, `CONFIDENCE`, `TARGET`, `PLAN`, `SCAN`.
- Use large hero numerals for kcal and time; cards should be dense but not crowded.
- Minimum tap target: 44×44 logical pixels.
- Main cards: 20–28px radius depending on size.
- Bottom sheets: 28–34px top radius.
- Use soft elevation: blur, subtle border, and opacity rather than harsh shadow.

## Navigation

5 tabs exactly: Today · History · **Scan** · Goals · AI.

Rules:
- Scan index is always 2.
- Scan is always central FAB style.
- Scan uses gradient ring and eye/lens icon.
- Scan is the default landing screen.
- Bottom nav remains visible on main screens.
- Food detail can appear as a sheet/route but must preserve fast return to Scan.

## Macro Mapping

- Protein → blue `#3A5BFF`
- Carbs → cyan `#19D3D9`
- Fat → green `#1FCC74`

Use this mapping consistently across rings, bars, pips, chips, labels, and AI correction cards.

## Motion Specs

| Motion | Target duration | Easing |
|---|---:|---|
| Count-up kcal/macros | ~1.4s | easeOutCubic |
| Macro bar fill | ~1.2s | ease-out |
| Scan shimmer pass | ~1.6s | linear/infinite |
| Skeleton shimmer | ~1.4s | linear/infinite |
| Reticle snap | ~200ms | ease-out |
| Processing card entrance | ~240ms | ease-out |
| Sheet slide-up | ~320ms | ease |
| Card expansion to detail | ~320ms | shared-axis / ease |
| Button press | 80–120ms | spring or ease-out |

Motion must be quiet, purposeful, and premium. Avoid gimmicks, bounce-heavy effects, confetti, or cartoon affordances.

## Screen Contracts

### Scan / Camera

- Full-screen camera-first experience.
- Top controls: Flash Auto/On/Off, Meal/Barcode/Label segmented mode, profile/settings.
- Capture button: large, premium, central; rotating gradient ring while capture/processing begins.
- Reticle brackets and subtle scan guide.
- Library upload and Recent shortcuts above bottom nav.
- After capture, transition immediately to processing state with the message: `Processing in cloud… we'll notify you.`

### Processing / Notification

- Show top banner: `You can close the app` with small spinner.
- Show skeleton card with image shimmer, title skeleton, macro bar skeletons, and step counter.
- Notification copy: `Calorix finished your meal scan` and meal summary such as `Chicken rice bowl · 620 kcal`.
- Notification tap opens Today or the new Food Detail, depending on state.

### Today Dashboard

- Hero macro ring card showing kcal eaten, target, and kcal remaining.
- Macro rows or subcards for protein/carbs/fat with grams, target, and percentage.
- Recent scans as compact premium meal cards.
- Low confidence visually marked with amber and a clear correction path.

### Food Detail / Edit

- Large photo/product image header.
- Detected name, confidence, kcal, macros, serving size, quantity, meal type.
- Edit mode uses inline chips/fields, not a boring generic form.
- Actions: Edit, Save, Delete, Duplicate, Not right?, Ask AI to fix this.
- Serving multiplier: 0.25x steps, range 0.25–5.0x; macros scale proportionally.

### History

- Calendar/list hybrid.
- Week strip and month grid support.
- Weekly average, streak, calorie sparkline, day rows.
- Day rows open all foods logged that day.

### Goals

- Body goal modes: Lose fat, Maintain, Lean+, Custom.
- Calorie target, protein, carbs, fat, and future weight tracking.
- Data-driven and motivational, not cheesy.
- AI adjustment requires confirmation before mutating goals.

### AI Chat

- Integrated product assistant, not detached chatbot.
- Can propose entity mutations but only applies them after confirmation.
- Suggested prompts: plan remaining macros, adjust for fat loss, explain low carbs, correct scan.
- Confirmation cards show old → new values and deltas.

## Quality Bar

Reject UI that looks generic, low-contrast, childish, diet-app-like, overbright, purely white/black, or inconsistent with the mockups. Every new UI should pass a visual review against the dark and light reference images.
