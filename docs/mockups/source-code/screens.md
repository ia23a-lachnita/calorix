# Screen inventory & flow map

All screens are 402×874 logical px (iPhone-class), theme-aware (dark/light) unless noted. Source file given per screen; screenshots as `screenshots/<id>--<mode>.png`.

## Flow map
```
loading → login ──────────────→ scan (default landing, camera on)
              └→ guest ↗          │ tap capture
permission (first run, over scan) │
                                  ▼
                            processing (cloud) → OS push notification
                                  │                    │
                    confidence ≥ 80%            tap → food (detail)
                                  │
                    confidence < 80% → review ─→ food / retake / manual
scan · Library / Recent → manual (also reachable when camera denied)
tab bar: today ⇄ history ⇄ scan ⇄ goals ⇄ ai   ·   avatar → profile
today: meal row → food → edit (food_edit)      ·   ai ⇄ ai_history
```

## Screens
| id | file | states / notes |
|---|---|---|
| loading | cx-screen-loading.jsx | splash: tick ring, staged progress copy, logo placeholder |
| login | cx-screen-login.jsx | email+password, Apple/Google, guest button, trust chips |
| permission | cx-screen-states.jsx | iOS camera alert over blurred viewfinder + "add manually" fallback card (theme-aware) |
| scan_idle / scan_capturing | cx-screen-scan.jsx | camera home. glass chips, Meal/Barcode/Label segments, reticle; capturing = conic spinner + scan-line shimmer |
| processing | cx-screen-processing.jsx | cloud-processing card; user can leave the app |
| (lock notification) | handoff.html (CXLockScreen) | OS surface — mock only, not a Flutter screen; implement as a rich push |
| review | cx-screen-states.jsx | <80% confidence branch: photo hero + bottom sheet, candidate radio list, None-of-these / Confirm, "Ask AI" |
| manual | cx-screen-states.jsx | search fallback: field, filter chips, result rows with +, dashed "create custom food" |
| today / today_empty | cx-screen-today.jsx | hero card (triple macro ring + 3 macro rows w/ fill bars, ~1.4s count-up) + recent scans; empty = zeroed ring + first-run CTA |
| food / food_edit | cx-screen-food.jsx | meal detail; editing state = editable nutrition CRUD |
| history_week / history_month | cx-screen-history.jsx | calendar toggle + long-term progress |
| goals / goals_select | cx-screen-goals.jsx | plan overview; select = period picker open |
| ai | cx-screen-ai.jsx | assistant chat; can edit meals/plan with explicit confirmation |
| ai_history | cx-screen-ai-history.jsx | past threads list |
| profile | cx-screen-profile.jsx | account, units, camera settings, version footer |

## Shared shell (cx-shell.jsx)
- **CXBottomNav** — 5 tabs, centered 60px gradient Scan FAB (−28px overhang, halo), active tab = stroke 2.0 + 4px accent dot. `floating` variant over camera: more translucent, lighter blur.
- **CXTopBar** — eyebrow label + 28px/600 title, trailing slot.
- **CXMacroRing** — 3 concentric rings (protein/carbs/fat), kcal counter core.
- **CXAvatar** — initials circle, hairline border.
