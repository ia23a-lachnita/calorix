# Calorix — Known Issues

## OPEN

### 1. "Error loading meals" on Today screen — Firestore missing composite index

**Symptom:** Today screen shows "Error loading meals" in amber text. Macro ring and targets render correctly (those come from a different provider). Meal list fails.

**Root cause:** `watchTodayEntries` runs a Firestore query combining `uid ==`, `timestamp >=`, `timestamp <`, `status ==`, and `orderBy timestamp DESC`. Firestore requires a composite index for any query that filters on multiple fields with an inequality + equality combination. The index does not exist in `firestore.indexes.json` or in the live project yet.

**Affected file:** `lib/shared/repositories/food_entry_repository.dart:17`

**Fix path (not yet done — large task):**
1. Trigger the query once in the Firebase emulator or on device with debug logging — Firebase will log the exact index creation URL.
2. Add the index to `firestore.indexes.json` and run `firebase deploy --only firestore:indexes`.
3. Alternatively: open the Firebase Console → Firestore → Indexes → Create composite index:
   - Collection: `entries`
   - Fields: `uid ASC`, `status ASC`, `timestamp DESC`
4. Same index is needed for `watchEntriesForDate` (History screen) and `getRecentEntries`.

**Workaround:** None in production. In development, you can temporarily remove the `status == 'complete'` filter to reduce the index requirement (but this shows pending/error entries too).

---

### 2. UI does not fully match mockups

**Symptom:** Screens render and are functional but visual fidelity vs `docs/mockups/images/all_dark.jpg` / `all_light.jpg` is approximate, not pixel-matched.

**Observed gaps (from live screenshots, 2026-05-18):**
- Today screen macro ring: correct layout but ring gradient, glow, and card elevation differ from mockup.
- Macro rows: colour dots and progress bars present but bar fill animation and token colours (blue/cyan/green) not fully matching design spec in `.claude/design.md`.
- Bottom nav: correct tab order (Today · History · Scan · Goals · AI), Scan FAB gradient ring present but size/shadow/ring thickness differs.
- Profile sheet: card borders, spacing, and background depth do not match the glassy dark surface style specified in `.claude/design.md`.
- Typography: BarlowCondensed/Barlow fonts load but weight, size, and letter-spacing hierarchy differs from spec at several points.
- `BOTTOM OVERFLOWED BY 5.5 PIXELS` layout overflow visible on Today screen — needs `SingleChildScrollView` or padding fix.

**Fix path (not yet done — design polish sprint):**
- Run `Skill(frontend-design)` + `Skill(ui-ux-pro-max:ui-ux-pro-max)` + compare against mockup images screen by screen.
- Address overflow first (quick fix), then token/colour alignment, then motion/animation.

---

## FIXED

| Issue | Fixed in commit |
|---|---|
| App stuck on splash (CONFIGURATION_NOT_FOUND) | 787b790 — Anonymous auth enabled via Identity Toolkit API |
| Build failure: core library desugaring missing | baadd5f — `isCoreLibraryDesugaringEnabled = true` in build.gradle.kts |
| Profile X button does not close sheet | (current) — `Navigator.of(context).pop()` instead of `context.pop()` |
