# Review of UI Parity Plan

This review assesses the `ui-parity-plan.md` against the project's requirements, design specifications, and best practices for Flutter/Firebase development.

## BLOCKERS

1.  **Critical Firestore Bug (B-CRITICAL-1)**: The plan correctly identifies the `permission-denied` error as a top-priority blocker. The proposed fix of deploying rules and indexes is the right first step. However, the plan's confidence that the existing index is sufficient might be premature. The suggested rule `allow list: if request.auth != null && request.auth.uid == request.resource.data.uid;` is invalid for list queries as `resource` is not available. The most robust solution involves ensuring the query from the client has `where('uid', '==', request.auth.uid)` and the security rule is `allow list: if request.auth.uid == request.query.resource.data.uid;` or simply `allow list: if request.auth != null;` with the client-side query providing the security. **Action**: Confirm the client-side query is correct and enforce the UID match in security rules for `list` operations correctly. Verification MUST be done on a physical device, as emulator behavior can sometimes differ from production Firebase.

## WARNINGS

1.  **Performant Custom Painting**: The plan suggests using `CustomPainter` for the scanning button's rotating gradient (`S3`) and the history sparkline (`H6`). While `CustomPainter` is the right tool, a continuously animating gradient, if not implemented carefully (e.g., without `repaintBoundaries`), can lead to significant performance issues and battery drain. **Action**: Ensure the implementation of these custom painters is highly performant and isolates repainting to the smallest possible area. Profile the animations on a real device.

2.  **Robust Layout for Overflows (B-CRITICAL-2)**: The proposed fix for the History screen overflow (reducing padding and using `Flexible`) is a good first step, but it may be brittle. Relying on `Flexible` alone can still lead to overflows on smaller devices or with longer text. **Action**: Consider using more robust responsive layout widgets like `FittedBox` or calculating layouts based on screen width if simple fixes fail during testing across different device sizes.

3.  **Missing Component Complexity**: The plan correctly lists many missing UI components (e.g., `_WeeklyStats` card, `_Sparkline`, `_AiActionCard`). It's important to recognize that these are not trivial additions. Each requires careful state management, styling from the design system, and potentially their own set of user interactions. **Action**: Treat each new component as a mini-feature, with its own implementation and testing plan. Do not underestimate the effort required.

## NITS

1.  **Consistent Theming for Text**: The plan suggests using `.toUpperCase()` for labels in the Goals screen (`G1`, `G4`). A better practice would be to define a specific `TextStyle` in the application's theme (e.g., `AppTextStyles.labelMonoUppercase`). This ensures consistency and makes future design changes easier.

2.  **Encapsulate Business Logic**: The logic for streak calculation (`H7`) is described inline. This logic should be encapsulated in a dedicated utility function or, preferably, handled within a state management provider/bloc/riverpod provider to keep the UI code clean and the logic easily testable and reusable.

## TEST GAPS

1.  **Security Rules Unit Tests**: The plan's primary verification method for the critical Firestore bug is manual deployment and testing. This is insufficient. A regression test suite for `firestore.rules` using the Firebase rules unit testing framework should be a mandatory part of the fix to prevent future breaking changes.

2.  **Widget and Logic Unit Tests**: The plan does not explicitly mention adding new tests for the new features. The following are critical to test:
    *   **Widget Tests**: New components like `_Sparkline`, `_AiActionCard`, and the `_DayRingPainter` should have widget tests to verify they render correctly given different states (e.g., with data, without data, error states).
    *   **Unit Tests**: Logic like the streak calculation and the `g/kg` ratio for macros should be covered by unit tests.

## QUESTIONS

1.  **Scan Screen Camera Preview**: The plan notes the camera preview is black with a `❓`. This is a major functionality issue, not just a UI parity problem. Is this a confirmed emulator-only issue, or does it happen on physical devices? The plan needs a concrete investigation step to diagnose and fix this, as it breaks the app's core "camera-first" promise.

2.  **Goals Screen `g/kg` Default Behavior**: In the Goals screen (`G7`), the plan mentions assuming a default weight if the user hasn't provided one. What is the desired UX here? Should the `g/kg` label be hidden until the user logs their weight for the first time? Displaying a calculation based on an arbitrary default could be confusing or misleading. This needs clarification.

3.  **Today Screen Empty State**: The plan notes the `_EmptyMeals` widget "looks functional". Does this state match the design specifications for an empty state (i.e., a user has opened the app for the first time and has no logged meals)? The mockups and specs focus heavily on loading states (skeletons), but a true empty state needs to be visually confirmed against the design vision to ensure it doesn't look like an error.
