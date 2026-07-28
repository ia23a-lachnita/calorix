import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/food_detail/food_detail_sheet.dart';
import 'package:calorix/shared/models/food_entry.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('review confirmation persists the selected candidate',
      (tester) async {
    final harness = await E2EHarness.create();
    harness.seed(makeFixtureEntry(
      id: 'review-entry',
      foodName: 'Unknown bowl',
      status: FoodEntryStatus.needsReview,
      confidence: 0.62,
      candidates: const [
        ReviewCandidate(
          name: 'Teriyaki Chicken Bowl',
          confidence: 0.91,
          kcal: 655,
          proteinG: 41,
          carbsG: 74,
          fatG: 19,
        ),
      ],
    ));
    await harness.pump(tester, initialLocation: '/review/review-entry');

    expect(find.text('Which one is it?'), findsOneWidget);
    await tester.tap(find.textContaining('Confirm ·'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(FoodDetailSheet), findsOneWidget);
    final saved = harness.foodStore.entry('review-entry');
    expect(saved?.status, FoodEntryStatus.complete);
    expect(saved?.foodName, 'Teriyaki Chicken Bowl');
    expect(find.text('Teriyaki Chicken Bowl'), findsWidgets);
  });

  testWidgets('none of these opens manual entry', (tester) async {
    final harness = await E2EHarness.create();
    harness.seed(_reviewEntry('review-manual'));
    await harness.pump(tester, initialLocation: '/review/review-manual');

    await tester.tap(find.text('None of these'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Add food'), findsOneWidget);
  });

  testWidgets('ask assistant opens chat with meal context', (tester) async {
    final harness = await E2EHarness.create();
    harness.seed(_reviewEntry('review-assistant'));
    await harness.pump(tester, initialLocation: '/review/review-assistant');

    await tester.tap(find.textContaining('Ask Placeholder AI'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(AiChatScreen), findsOneWidget);
  });
}

FoodEntry _reviewEntry(String id) => makeFixtureEntry(
      id: id,
      foodName: 'Unknown meal',
      status: FoodEntryStatus.needsReview,
      confidence: 0.65,
      candidates: const [
        ReviewCandidate(
          name: 'Pasta',
          confidence: 0.4,
          kcal: 520,
          proteinG: 20,
          carbsG: 72,
          fatG: 16,
        ),
        ReviewCandidate(
          name: 'Noodles',
          confidence: 0.35,
          kcal: 480,
          proteinG: 18,
          carbsG: 68,
          fatG: 14,
        ),
      ],
    );
