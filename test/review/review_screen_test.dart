import 'dart:async';

import 'package:calorix/features/review/providers/review_providers.dart';
import 'package:calorix/features/review/review_screen.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _Gateway implements ReviewEntryGateway {
  _Gateway({this.completion, this.failuresRemaining = 0});

  final Completer<void>? completion;
  int failuresRemaining;
  final List<String> entryIds = [];
  final List<ReviewConfirmation> confirmations = [];

  @override
  Future<void> confirm(
    String entryId,
    ReviewConfirmation confirmation,
  ) async {
    entryIds.add(entryId);
    confirmations.add(confirmation);
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      throw StateError('simulated confirmation failure');
    }
    await completion?.future;
  }
}

const _candidates = <ReviewCandidate>[
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
];

FoodEntry _entry({
  double? consumedAmount = 250,
  List<ReviewCandidate> candidates = _candidates,
}) =>
    FoodEntry(
      id: 'e1',
      uid: 'u1',
      timestamp: DateTime(2026),
      date: '2026-01-01',
      imageUrl: null,
      scanMode: 'meal',
      status: FoodEntryStatus.needsReview,
      confidence: 0.62,
      candidates: candidates,
      nutritionBasis: 'package',
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      consumedAmount: consumedAmount,
    );

Finder _confirmButton() =>
    find.byKey(const ValueKey<String>('review-confirm-button'));

Future<({GoRouter router, _Gateway gateway})> _pump(
  WidgetTester tester, {
  FoodEntry? entry,
  _Gateway? gateway,
}) async {
  final resolvedGateway = gateway ?? _Gateway();
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
    reviewEntryProvider('e1')
        .overrideWith((ref) => Stream.value(entry ?? _entry())),
    reviewEntryGatewayProvider.overrideWithValue(resolvedGateway),
  ], child: MaterialApp.router(routerConfig: router)));
  await tester.pumpAndSettle();
  return (router: router, gateway: resolvedGateway);
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

  testWidgets(
      'confirm forwards the complete selection and amount then opens food detail',
      (tester) async {
    final result = await _pump(tester);
    await tester.tap(find.text('Teriyaki Chicken Bowl'));
    await tester.tap(find.textContaining('Confirm'));
    await tester.pumpAndSettle();
    expect(result.gateway.entryIds, ['e1']);
    expect(result.gateway.confirmations, hasLength(1));
    expect(result.gateway.confirmations.single.consumedAmount, 250);
    expect(
      result.gateway.confirmations.single.selectedCandidate?.name,
      'Teriyaki Chicken Bowl',
    );
    expect(result.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('valid amount can confirm without selecting a candidate',
      (tester) async {
    final result = await _pump(
      tester,
      entry: _entry(candidates: const <ReviewCandidate>[]),
    );

    await tester.tap(_confirmButton());
    await tester.pumpAndSettle();

    expect(result.gateway.entryIds, ['e1']);
    expect(result.gateway.confirmations, hasLength(1));
    expect(result.gateway.confirmations.single.consumedAmount, 250);
    expect(result.gateway.confirmations.single.selectedCandidate, isNull);
    expect(result.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('confirm is disabled without a finite positive existing amount',
      (tester) async {
    for (final amount in <double?>[
      null,
      0,
      -1,
      double.nan,
      double.infinity,
      double.negativeInfinity,
    ]) {
      await _pump(tester, entry: _entry(consumedAmount: amount));

      final button = tester.widget<FilledButton>(_confirmButton());
      expect(button.onPressed, isNull, reason: 'consumedAmount $amount');
    }
  });

  testWidgets('duplicate confirmation tap while saving forwards only one call',
      (tester) async {
    final completion = Completer<void>();
    final gateway = _Gateway(completion: completion);
    final result = await _pump(tester, gateway: gateway);

    final onPressed = tester.widget<FilledButton>(_confirmButton()).onPressed!;
    onPressed();
    onPressed();
    await tester.pump();

    expect(result.gateway.confirmations, hasLength(1));
    completion.complete();
    await tester.pumpAndSettle();
    expect(result.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('confirmation failure stays on Review and permits retry',
      (tester) async {
    final gateway = _Gateway(failuresRemaining: 1);
    final result = await _pump(tester, gateway: gateway);

    await tester.tap(_confirmButton());
    await tester.pumpAndSettle();

    expect(result.router.state.uri.path, '/review/e1');
    expect(find.text('Could not confirm. Please try again.'), findsOneWidget);
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNotNull);

    await tester.tap(_confirmButton());
    await tester.pumpAndSettle();

    expect(result.gateway.confirmations, hasLength(2));
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
