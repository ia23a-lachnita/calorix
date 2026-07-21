import 'package:calorix/features/review/providers/review_providers.dart';
import 'package:calorix/features/review/review_screen.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _Gateway implements ReviewEntryGateway {
  ReviewCandidate? confirmed;

  @override
  Future<void> confirm(String entryId, ReviewCandidate candidate) async {
    confirmed = candidate;
  }
}

FoodEntry _entry() => FoodEntry(
      id: 'e1',
      uid: 'u1',
      timestamp: DateTime(2026),
      date: '2026-01-01',
      imageUrl: null,
      scanMode: 'meal',
      status: FoodEntryStatus.needsReview,
      confidence: 0.62,
      candidates: const [
        ReviewCandidate(
          name: 'Chicken Rice Bowl',
          confidence: 0.62,
          kcal: 620,
          proteinG: 38,
          carbsG: 72,
          fatG: 18,
        ),
        ReviewCandidate(
          name: 'Teriyaki Chicken Bowl',
          confidence: 0.54,
          kcal: 655,
          proteinG: 36,
          carbsG: 81,
          fatG: 19,
        ),
      ],
    );

Future<({GoRouter router, _Gateway gateway})> _pump(WidgetTester tester) async {
  final gateway = _Gateway();
  final router = GoRouter(initialLocation: '/review/e1', routes: [
    GoRoute(
      path: '/review/:id',
      builder: (_, state) => ReviewScreen(entryId: state.pathParameters['id']!),
    ),
    GoRoute(
        path: '/manual',
        name: 'manual',
        builder: (_, __) => const Text('Manual')),
    GoRoute(
        path: '/scan', name: 'scan', builder: (_, __) => const Text('Scan')),
    GoRoute(
        path: '/assistant',
        name: 'aiChatOverlay',
        builder: (_, state) =>
            Text('Assistant ${state.uri.queryParameters['mealId']}')),
    GoRoute(
        path: '/today/food/:id',
        name: 'foodDetail',
        builder: (_, state) => Text('Food ${state.pathParameters['id']}')),
  ]);
  await tester.pumpWidget(ProviderScope(overrides: [
    reviewEntryProvider('e1').overrideWith((ref) => Stream.value(_entry())),
    reviewEntryGatewayProvider.overrideWithValue(gateway),
  ], child: MaterialApp.router(routerConfig: router)));
  await tester.pumpAndSettle();
  return (router: router, gateway: gateway);
}

void main() {
  test('review candidate serializes without losing nutrition fields', () {
    const candidate = ReviewCandidate(
      name: 'Rice bowl',
      confidence: 0.72,
      kcal: 510,
      proteinG: 30,
      carbsG: 64,
      fatG: 14,
    );
    final restored = ReviewCandidate.fromMap(candidate.toMap());
    expect(restored.name, candidate.name);
    expect(restored.confidence, candidate.confidence);
    expect(restored.kcal, candidate.kcal);
    expect(restored.proteinG, candidate.proteinG);
    expect(restored.carbsG, candidate.carbsG);
    expect(restored.fatG, candidate.fatG);
  });

  testWidgets('renders confidence, candidates, and all review actions',
      (tester) async {
    await _pump(tester);
    expect(find.text('62% CONFIDENCE'), findsOneWidget);
    expect(find.text('Chicken Rice Bowl'), findsOneWidget);
    expect(find.text('Teriyaki Chicken Bowl'), findsOneWidget);
    expect(find.text('None of these'), findsOneWidget);
    expect(find.textContaining('Confirm'), findsOneWidget);
    expect(find.text('Retake'), findsOneWidget);
    expect(find.textContaining('Ask'), findsOneWidget);
  });

  testWidgets('confirm applies selected candidate and opens food detail',
      (tester) async {
    final result = await _pump(tester);
    await tester.tap(find.text('Teriyaki Chicken Bowl'));
    await tester.tap(find.textContaining('Confirm'));
    await tester.pumpAndSettle();
    expect(result.gateway.confirmed?.name, 'Teriyaki Chicken Bowl');
    expect(result.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('secondary actions route to manual, scan, and linked assistant',
      (tester) async {
    var result = await _pump(tester);
    await tester.tap(find.text('None of these'));
    await tester.pumpAndSettle();
    expect(result.router.state.uri.path, '/manual');

    result = await _pump(tester);
    await tester.tap(find.text('Retake'));
    await tester.pumpAndSettle();
    expect(result.router.state.uri.path, '/scan');

    result = await _pump(tester);
    await tester.tap(find.textContaining('Ask'));
    await tester.pumpAndSettle();
    expect(result.router.state.uri.queryParameters['mealId'], 'e1');
  });
}
