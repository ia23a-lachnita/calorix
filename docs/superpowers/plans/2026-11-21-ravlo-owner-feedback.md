# Restore the mockup screens and support real meal inputs

1. In `functions/src/tier1-callable.ts`, record bounded failure causes and a random lookup reference, with the same reference in the error details. Prove redaction and correlation by exercising the callable. Deploy only analyzeTier1Meal.
2. In `lib/features/tier1/tier1_app.dart`, explain an unrecognized serving separately from a service failure. Validate the reference before displaying or exporting it. Preserve the saved photo and existing estimates.
3. On Scan, use the system gallery picker. Copy the chosen food photo into private storage and open the consent-gated editor. Check cancellation, a lost activity and the original file.
4. Support component-level portions in `local_meal.dart` and the editor. Preserve the entered fraction, unit and nutrition basis. Keep older meals and offline export replay readable. Verify one third of four eggs on a mixed plate and a drink labelled per 100 mL.
5. Use `docs/design-handoff/placeholder-app/visual-state-inventory.json` for the active five-tab UI and detail routes. Keep the content shutter, native startup permission, swipe navigation and local meal history. Match the 19 mockup states in both themes and check behavior at 360 and 402 logical pixels.
6. Use the existing comparison tooling and match stable-size Ravlo reference and actual screenshots. The owner assigned standalone ui-diff-mcp development to another session.
7. When the owner shares breakfast photos, keep the plated image distinct from the scale and product references. Record one third of the four-egg batch and preserve unknown quantities.
8. Future natural-language corrections should propose an inspectable component and quantity change that the user can confirm or undo.
