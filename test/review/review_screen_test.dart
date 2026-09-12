import 'dart:async';

import 'package:calorix/features/review/providers/review_providers.dart';
import 'package:calorix/features/review/review_screen.dart';
import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
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

NutritionReference _reference({
  double amount = 250,
  String unit = 'ml',
  double kcal = 300,
  double proteinG = 12,
  double carbsG = 35,
  double fatG = 9,
}) =>
    NutritionReference(
      amount: amount,
      unit: unit,
      kcal: kcal,
      proteinG: proteinG,
      carbsG: carbsG,
      fatG: fatG,
    );

FoodEntry _entry({
  String id = 'e1',
  double? consumedAmount,
  double? baseKcal,
  double? baseProtein,
  double? baseCarbs,
  double? baseFat,
  List<ReviewCandidate> candidates = _candidates,
  String nutritionBasis = 'package',
  double? nutritionAmount = 500,
  String? nutritionUnit = 'ml',
  int? packageUnitCount,
  double? unitAmount,
  NutritionReference? servingReference,
  List<String>? reviewReasons = const <String>[],
}) =>
    FoodEntry(
      id: id,
      uid: 'u1',
      timestamp: DateTime(2026),
      date: '2026-01-01',
      imageUrl: null,
      scanMode: 'meal',
      status: FoodEntryStatus.needsReview,
      confidence: 0.62,
      candidates: candidates,
      baseKcal: baseKcal,
      baseProtein: baseProtein,
      baseCarbs: baseCarbs,
      baseFat: baseFat,
      nutritionBasis: nutritionBasis,
      nutritionAmount: nutritionAmount,
      nutritionUnit: nutritionUnit,
      consumedAmount: consumedAmount,
      packageUnitCount: packageUnitCount,
      unitAmount: unitAmount,
      servingReference: servingReference,
      reviewReasons: reviewReasons,
    );

Finder _confirmButton() =>
    find.byKey(const ValueKey<String>('review-confirm-button'));

Finder _customInput() =>
    find.byKey(const ValueKey<String>('review-custom-amount-input'));

Finder _amountControl(String source) =>
    find.byKey(ValueKey<String>('review-amount-$source'));

Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pump();
}

void _expectAmountSelection(WidgetTester tester, String? selected) {
  final renderedSources = <String>[];
  final selectedSources = <String>[];
  for (final source in const ['package', 'serving', 'pack', 'custom']) {
    final control = _amountControl(source);
    if (control.evaluate().isEmpty) continue;
    renderedSources.add(source);
    final semantics = tester.getSemantics(_amountControl(source));
    final isSelected = semantics.hasFlag(SemanticsFlag.isSelected) ||
        semantics.hasFlag(SemanticsFlag.isChecked);
    if (isSelected) selectedSources.add(source);
  }
  if (selected == null) {
    expect(selectedSources, isEmpty);
    return;
  }
  expect(renderedSources, contains(selected));
  expect(selectedSources, hasLength(1));
  expect(selectedSources.single, selected);
}

Future<({GoRouter router, _Gateway gateway})> _pump(
  WidgetTester tester, {
  FoodEntry? entry,
  _Gateway? gateway,
  Stream<FoodEntry?>? reviewStream,
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
    reviewEntryProvider('e1').overrideWith(
      (ref) => reviewStream ?? Stream.value(entry ?? _entry()),
    ),
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

  test('typed amount state starts unselected and suggestions are derived only',
      () {
    final state = const CustomAmountState(selected: false);
    expect(state.selected, isFalse);
    expect(state.amount, isNull);

    final suggestions = deriveAmountSuggestions(_entry(
      servingReference: _reference(),
      packageUnitCount: 5,
      unitAmount: 100,
    ));
    expect(suggestions, everyElement(isA<AmountSuggestion>()));
    expect(suggestions.every((choice) => choice.kind == 'derived'), isTrue);
    expect(suggestions.map((choice) => choice.label),
        contains('Whole package · 500 ml'));
  });

  test(
      'derives complete package, serving, and pack metadata with source labels',
      () {
    final suggestions = deriveAmountSuggestions(_entry(
      servingReference: _reference(amount: 250, unit: 'ml'),
      packageUnitCount: 5,
      unitAmount: 100,
    ));

    expect(suggestions.map((choice) => choice.source), [
      AmountSource.packageLabel,
      AmountSource.servingMetadata,
      AmountSource.packMetadata,
    ]);
    expect(suggestions.map((choice) => choice.amount), [500, 250, 100]);
    expect(suggestions.map((choice) => choice.unit), ['ml', 'ml', 'ml']);
  });

  test('omits incompatible and malformed amount sources', () {
    final noPackage = deriveAmountSuggestions(_entry(
      nutritionAmount: null,
      servingReference: _reference(),
      packageUnitCount: 5,
      unitAmount: 100,
    ));
    expect(
        noPackage.where((choice) => choice.source == AmountSource.packageLabel),
        isEmpty);

    final malformedServing = deriveAmountSuggestions(_entry(
      servingReference: _reference(amount: 0),
    ));
    expect(
      malformedServing
          .where((choice) => choice.source == AmountSource.servingMetadata),
      isEmpty,
    );

    final incompatiblePackage = deriveAmountSuggestions(_entry(
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'g',
      servingReference: _reference(),
    ));
    expect(
      incompatiblePackage
          .where((choice) => choice.source == AmountSource.packageLabel),
      isEmpty,
    );

    for (final reasons in const [
      ['package_quantity_missing'],
      ['package_unit_unsupported'],
    ]) {
      final reasonBlocked = deriveAmountSuggestions(
        _entry(reviewReasons: reasons),
      );
      expect(
        reasonBlocked
            .where((choice) => choice.source == AmountSource.packageLabel),
        isEmpty,
        reason: 'package reason $reasons must block package choice',
      );
    }

    final mismatchedServing = deriveAmountSuggestions(
      _entry(servingReference: _reference(amount: 250, unit: 'g')),
    );
    expect(
      mismatchedServing
          .where((choice) => choice.source == AmountSource.servingMetadata),
      isEmpty,
    );

    final malformedPack = deriveAmountSuggestions(_entry(
      packageUnitCount: 0,
      unitAmount: -1,
    ));
    expect(
      malformedPack
          .where((choice) => choice.source == AmountSource.packMetadata),
      isEmpty,
    );

    for (final partialPack in <({int? count, double? amount})>[
      (count: null, amount: 100),
      (count: 5, amount: null),
      (count: 5, amount: 0),
      (count: 5, amount: -1),
    ]) {
      final choices = deriveAmountSuggestions(_entry(
        packageUnitCount: partialPack.count,
        unitAmount: partialPack.amount,
      ));
      expect(
        choices.where((choice) => choice.source == AmountSource.packMetadata),
        isEmpty,
        reason: 'pack metadata $partialPack must be omitted',
      );
    }

    final disagreeingPack = deriveAmountSuggestions(_entry(
      packageUnitCount: 5,
      unitAmount: 90,
    ));
    expect(
      disagreeingPack
          .where((choice) => choice.source == AmountSource.packMetadata),
      isEmpty,
    );

    final nonPackagePack = deriveAmountSuggestions(_entry(
      nutritionBasis: 'per100g',
      nutritionAmount: 100,
      nutritionUnit: 'g',
      packageUnitCount: 5,
      unitAmount: 20,
    ));
    expect(
      nonPackagePack
          .where((choice) => choice.source == AmountSource.packMetadata),
      isEmpty,
    );
  });

  test('deduplicates normalized units within tolerance using source precedence',
      () {
    final suggestions = deriveAmountSuggestions(_entry(
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      servingReference: _reference(amount: 500.00005, unit: ' ML '),
      packageUnitCount: 1,
      unitAmount: 500.00005,
    ));

    expect(suggestions.where((choice) => choice.amount > 499), hasLength(1));
    expect(suggestions.singleWhere((choice) => choice.amount > 499).source,
        AmountSource.packageLabel);

    final outsideTolerance = deriveAmountSuggestions(_entry(
      nutritionAmount: 500,
      nutritionUnit: 'ml',
      servingReference: _reference(amount: 500.0002, unit: ' ml '),
    ));
    expect(
        outsideTolerance.where((choice) => choice.amount > 499), hasLength(2));
  });

  test('deduplicates the inclusive 1e-4 boundary but not just outside it',
      () {
    final atBoundary = deriveAmountSuggestions(_entry(
      nutritionAmount: 0.000001,
      nutritionUnit: 'g',
      servingReference: _reference(amount: 0.000101, unit: ' G '),
    ));
    expect(
      atBoundary.where((choice) => choice.unit == 'g'),
      hasLength(1),
      reason: 'the 1e-4 amount difference is inclusive',
    );
    expect(atBoundary.single.source, AmountSource.packageLabel);

    final outside = deriveAmountSuggestions(_entry(
      nutritionAmount: 0.000001,
      nutritionUnit: 'g',
      servingReference: _reference(amount: 0.0001011, unit: 'g'),
    ));
    expect(outside.where((choice) => choice.unit == 'g'), hasLength(2));
  });

  test('serving suggestion requires bounded finite reference values', () {
    final invalidReferences = <({String field, NutritionReference reference})>[
      (
        field: 'kcal nonfinite',
        reference: _reference(kcal: double.infinity),
      ),
      (
        field: 'protein negative',
        reference: _reference(proteinG: -1),
      ),
      (
        field: 'carbs above ceiling',
        reference: _reference(carbsG: 1000000001),
      ),
      (
        field: 'fat nonfinite',
        reference: _reference(fatG: double.nan),
      ),
      (
        field: 'amount above ceiling',
        reference: _reference(amount: 1000000001),
      ),
    ];
    for (final invalid in invalidReferences) {
      final suggestions = deriveAmountSuggestions(
        _entry(servingReference: invalid.reference),
      );
      expect(
        suggestions.where((choice) =>
            choice.source == AmountSource.servingMetadata),
        isEmpty,
        reason: invalid.field,
      );
    }

    final zeroMacros = deriveAmountSuggestions(_entry(
      servingReference: _reference(
        kcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      ),
    ));
    expect(
      zeroMacros.where((choice) =>
          choice.source == AmountSource.servingMetadata),
      hasLength(1),
    );
  });

  test('pack suggestion requires valid bounded canonical amount', () {
    for (final malformedAmount in const [-0.001, 1000000000.001]) {
      final suggestions = deriveAmountSuggestions(_entry(
        nutritionAmount: malformedAmount,
        packageUnitCount: 1,
        unitAmount: malformedAmount < 0 ? 0.001 : 1000000000,
        reviewReasons: const ['package_quantity_missing'],
      ));
      expect(
        suggestions.where((choice) => choice.source == AmountSource.packMetadata),
        isEmpty,
        reason: 'canonical amount $malformedAmount must fail closed',
      );
    }
  });

  test('count-one pack label includes the unit amount exactly', () {
    final suggestions = deriveAmountSuggestions(_entry(
      reviewReasons: const ['package_quantity_missing'],
      packageUnitCount: 1,
      unitAmount: 500,
    ));
    expect(
      suggestions.singleWhere((choice) =>
          choice.source == AmountSource.packMetadata).label,
      '1 unit · 500 ml',
    );
  });

  test('validates only finite positive custom amounts', () {
    for (final value in <double?>[
      null,
      0,
      -1,
      double.nan,
      double.infinity,
      double.negativeInfinity,
      1000000001,
    ]) {
      expect(() => validateCustomAmount(value), throwsArgumentError,
          reason: 'custom amount $value must fail closed');
    }
    expect(() => validateCustomAmount(0.000001), returnsNormally);
    expect(() => validateCustomAmount(1000000000), returnsNormally);
  });

  testWidgets(
      'renders confidence, candidates, source-labeled choices, and actions',
      (tester) async {
    await _pump(
      tester,
      entry: _entry(
        servingReference: _reference(),
        packageUnitCount: 5,
        unitAmount: 100,
      ),
    );
    expect(find.text('62% CONFIDENCE'), findsOneWidget);
    expect(find.text('Chicken Rice Bowl'), findsOneWidget);
    expect(find.text('Teriyaki Chicken Bowl'), findsOneWidget);
    expect(find.text('Whole package · 500 ml'), findsOneWidget);
    expect(find.text('package label'), findsOneWidget);
    expect(find.text('serving metadata'), findsOneWidget);
    expect(find.text('pack metadata'), findsOneWidget);
    expect(find.text('Custom amount'), findsOneWidget);
    expect(find.text('None of these'), findsOneWidget);
    expect(find.text('Retake'), findsOneWidget);
    expect(find.textContaining('Ask'), findsOneWidget);
    expect(
        tester
            .getSize(find.byKey(const ValueKey('review-confirm-button')))
            .height,
        greaterThanOrEqualTo(48));
    for (final source in const ['package', 'serving', 'pack', 'custom']) {
      final control = _amountControl(source);
      expect(control, findsOneWidget);
      expect(tester.getSize(control).height, greaterThanOrEqualTo(48));
      expect(tester.getSize(control).width, greaterThanOrEqualTo(48));
    }
    _expectAmountSelection(tester, 'package');
  });

  testWidgets(
      'derived amount controls persist package, serving, and pack amounts',
      (tester) async {
    final entry = _entry(
      servingReference: _reference(amount: 250),
      packageUnitCount: 5,
      unitAmount: 100,
    );

    final package = await _pump(tester, entry: entry);
    _expectAmountSelection(tester, 'package');
    await _tapVisible(tester, _amountControl('package'));
    _expectAmountSelection(tester, 'package');
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(package.gateway.entryIds, ['e1']);
    expect(package.gateway.confirmations, hasLength(1));
    expect(package.gateway.confirmations.single.consumedAmount, 500);
    expect(package.router.state.uri.path, '/today/food/e1');

    final serving = await _pump(tester, entry: entry);
    await _tapVisible(tester, _amountControl('serving'));
    _expectAmountSelection(tester, 'serving');
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(serving.gateway.entryIds, ['e1']);
    expect(serving.gateway.confirmations, hasLength(1));
    expect(serving.gateway.confirmations.single.consumedAmount, 250);
    expect(serving.router.state.uri.path, '/today/food/e1');

    final pack = await _pump(tester, entry: entry);
    await _tapVisible(tester, _amountControl('pack'));
    _expectAmountSelection(tester, 'pack');
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(pack.gateway.entryIds, ['e1']);
    expect(pack.gateway.confirmations, hasLength(1));
    expect(pack.gateway.confirmations.single.consumedAmount, 100);
    expect(pack.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('custom and derived amount choices are mutually exclusive',
      (tester) async {
    final entry = _entry(
      servingReference: _reference(amount: 250),
      packageUnitCount: 5,
      unitAmount: 100,
    );
    final result = await _pump(tester, entry: entry);
    await _tapVisible(tester, _amountControl('serving'));
    _expectAmountSelection(tester, 'serving');
    await _tapVisible(tester, _amountControl('custom'));
    _expectAmountSelection(tester, 'custom');
    await tester.enterText(_customInput(), '333.125');
    await tester.pump();
    await _tapVisible(tester, _amountControl('package'));
    _expectAmountSelection(tester, 'package');
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(result.gateway.entryIds, ['e1']);
    expect(result.gateway.confirmations, hasLength(1));
    expect(result.gateway.confirmations.single.consumedAmount, 500);
    expect(result.router.state.uri.path, '/today/food/e1');

    final reverse = await _pump(tester, entry: entry);
    await _tapVisible(tester, _amountControl('custom'));
    _expectAmountSelection(tester, 'custom');
    await tester.enterText(_customInput(), '333.125');
    await tester.pump();
    await _tapVisible(tester, _amountControl('serving'));
    _expectAmountSelection(tester, 'serving');
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(reverse.gateway.entryIds, ['e1']);
    expect(reverse.gateway.confirmations, hasLength(1));
    expect(reverse.gateway.confirmations.single.consumedAmount, 250);
    expect(reverse.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('preselects package only with no reasons or barcode unconfirmed',
      (tester) async {
    final result = await _pump(tester, entry: _entry());
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(result.gateway.confirmations.single.consumedAmount, 500);

    final allowed = await _pump(
      tester,
      entry: _entry(reviewReasons: const ['barcode_unconfirmed']),
    );
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(allowed.gateway.confirmations.single.consumedAmount, 500);
  });

  testWidgets('does not preselect an amount for any other review reason',
      (tester) async {
    for (final reason in const [
      'package_quantity_missing',
      'package_unit_unsupported',
      'nutrition_basis_ambiguous',
      'nutrition_arithmetic_mismatch',
      'atwater_mismatch',
      'model_schema_invalid',
    ]) {
      await _pump(
        tester,
        entry: _entry(reviewReasons: [reason]),
      );
      expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull,
          reason: 'reason $reason must leave amount unresolved');
    }
    await _pump(
      tester,
      entry: _entry(
        reviewReasons: const [
          'barcode_unconfirmed',
          'package_quantity_missing',
        ],
      ),
    );
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull);
  });

  testWidgets('persisted consumed amount cannot override unresolved ambiguity',
      (tester) async {
    await _pump(
      tester,
      entry: _entry(
        consumedAmount: 250,
        reviewReasons: const ['nutrition_basis_ambiguous'],
      ),
    );
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull);
  });

  testWidgets(
      'candidate and amount choices remain independent in both directions',
      (tester) async {
    final first = await _pump(
      tester,
      entry: _entry(reviewReasons: const ['package_quantity_missing']),
    );
    await _tapVisible(tester, find.text('Custom amount'));
    await tester.enterText(_customInput(), '250');
    await tester.pump();
    await _tapVisible(tester, find.text('Teriyaki Chicken Bowl'));
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(first.gateway.entryIds, ['e1']);
    expect(first.gateway.confirmations, hasLength(1));
    expect(first.gateway.confirmations.single.consumedAmount, 250);
    expect(first.gateway.confirmations.single.selectedCandidate?.name,
        'Teriyaki Chicken Bowl');
    expect(first.router.state.uri.path, '/today/food/e1');

    final second = await _pump(
      tester,
      entry: _entry(reviewReasons: const ['package_quantity_missing']),
    );
    await _tapVisible(tester, find.text('Teriyaki Chicken Bowl'));
    await _tapVisible(tester, find.text('Custom amount'));
    await tester.enterText(_customInput(), '125');
    await tester.pump();
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(second.gateway.entryIds, ['e1']);
    expect(second.gateway.confirmations, hasLength(1));
    expect(second.gateway.confirmations.single.consumedAmount, 125);
    expect(second.gateway.confirmations.single.selectedCandidate?.name,
        'Teriyaki Chicken Bowl');
    expect(second.router.state.uri.path, '/today/food/e1');
  });

  testWidgets(
      'empty candidates permit amount-only confirmation after explicit choice',
      (tester) async {
    final result = await _pump(
      tester,
      entry: _entry(
        candidates: const [],
        reviewReasons: const ['package_quantity_missing'],
      ),
    );
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull);
    await _tapVisible(tester, find.text('Custom amount'));
    await tester.enterText(_customInput(), '250');
    await tester.pump();
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(result.gateway.entryIds, ['e1']);
    expect(result.gateway.confirmations, hasLength(1));
    expect(result.gateway.confirmations.single.consumedAmount, 250);
    expect(result.gateway.confirmations.single.selectedCandidate, isNull);
    expect(result.router.state.uri.path, '/today/food/e1');
  });

  testWidgets(
      'invalid custom input cannot confirm and valid input persists exactly',
      (tester) async {
    final result = await _pump(
      tester,
      entry: _entry(reviewReasons: const ['package_quantity_missing']),
    );
    await _tapVisible(tester, find.text('Custom amount'));
    for (final amount in <String>[
      '',
      '0',
      '-1',
      'NaN',
      'Infinity',
      '1000000001'
    ]) {
      await tester.enterText(_customInput(), amount);
      await tester.pump();
      expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull,
          reason: 'custom amount $amount must fail closed');
    }
    await tester.enterText(_customInput(), '123.456789');
    await tester.pump();
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(result.gateway.confirmations.single.consumedAmount, 123.456789);
  });

  testWidgets(
      'invalid canonical amount, unit, or ratio disables derived and custom confirmation',
      (tester) async {
    // These direct-constructor fixtures intentionally exercise fail-closed UI
    // behavior for malformed wire states that FoodEntry.fromData rejects.
    final invalidCanonicalEntries = <({String label, FoodEntry entry})>[
      (label: 'missing amount', entry: _entry(nutritionAmount: null)),
      (label: 'negative amount', entry: _entry(nutritionAmount: -1)),
      (label: 'nonfinite amount', entry: _entry(nutritionAmount: double.nan)),
      (
        label: 'amount above ceiling',
        entry: _entry(nutritionAmount: 1000000001),
      ),
      (label: 'missing unit', entry: _entry(nutritionUnit: null)),
      (label: 'unsupported unit', entry: _entry(nutritionUnit: 'oz')),
      (
        label: 'nonfinite selected ratio',
        entry: _entry(
          nutritionAmount: double.minPositive,
          servingReference: _reference(amount: 1000000000),
          reviewReasons: const ['package_quantity_missing'],
        ),
      ),
    ];
    for (final invalid in invalidCanonicalEntries) {
      await _pump(tester, entry: invalid.entry);
      expect(
        tester.widget<FilledButton>(_confirmButton()).onPressed,
        isNull,
        reason: '${invalid.label} must disable confirmation',
      );
      await _tapVisible(tester, _amountControl('custom'));
      await tester.enterText(_customInput(), '1000000000');
      await tester.pump();
      expect(
        tester.widget<FilledButton>(_confirmButton()).onPressed,
        isNull,
        reason: '${invalid.label} must remain disabled for custom amount',
      );
    }
  });

  testWidgets('custom amount suffix uses the validated canonical unit',
      (tester) async {
    for (final unit in const ['g', 'ml']) {
      await _pump(tester, entry: _entry(nutritionUnit: unit));
      await _tapVisible(tester, _amountControl('custom'));
      final field = tester.widget<TextField>(_customInput());
      final decoration = field.decoration!;
      expect(decoration.suffixText, unit);
      expect(decoration.suffixText, isNot('canonical unit'));
    }
  });

  testWidgets('scales calorie and present macro previews exactly once',
      (tester) async {
    await _pump(
      tester,
      entry: _entry(
        servingReference: _reference(amount: 250),
        candidates: _candidates,
      ),
    );
    await _tapVisible(tester, _amountControl('serving'));
    await tester.pump();
    expect(find.text('310 kcal'), findsOneWidget);
    expect(find.text('19 g protein'), findsOneWidget);
    expect(find.text('36 g carbs'), findsOneWidget);
    expect(find.text('9 g fat'), findsOneWidget);
  });

  testWidgets('omits absent candidate macros instead of filling zeroes',
      (tester) async {
    await _pump(
      tester,
      entry: _entry(
        candidates: const [
          ReviewCandidate(
            name: 'Partial macros',
            confidence: 0.8,
            kcal: 620,
            proteinG: 38,
          ),
        ],
      ),
    );
    await _tapVisible(tester, find.text('Custom amount'));
    await tester.enterText(_customInput(), '250');
    await tester.pump();
    expect(find.text('36 g carbs'), findsNothing);
    expect(find.text('9 g fat'), findsNothing);
    expect(find.text('310 kcal'), findsOneWidget);
    expect(find.text('19 g protein'), findsOneWidget);
    expect(find.text('0 g carbs'), findsNothing);
    expect(find.text('0 g fat'), findsNothing);
  });

  testWidgets(
      'selected candidate null macros do not fall back to entry base macros',
      (tester) async {
    await _pump(
      tester,
      entry: _entry(
        baseKcal: 999,
        baseProtein: 77,
        baseCarbs: 100,
        baseFat: 50,
        candidates: const [
          ReviewCandidate(
            name: 'Partial macros with entry fallback',
            confidence: 0.8,
            kcal: 620,
            proteinG: 38,
          ),
        ],
      ),
    );
    await _tapVisible(tester, _amountControl('custom'));
    await tester.enterText(_customInput(), '250');
    await tester.pump();
    expect(find.text('310 kcal'), findsOneWidget);
    expect(find.text('19 g protein'), findsOneWidget);
    expect(find.text('50 g carbs'), findsNothing);
    expect(find.text('25 g fat'), findsNothing);
  });

  testWidgets(
      'streamed identity and metadata changes reset all transient review state',
      (tester) async {
    const updatedCandidates = [
      ReviewCandidate(
        name: 'Updated first candidate',
        confidence: 0.9,
        kcal: 410,
        proteinG: 20,
        carbsG: 40,
        fatG: 10,
      ),
      ReviewCandidate(
        name: 'Updated second candidate',
        confidence: 0.8,
        kcal: 420,
        proteinG: 21,
        carbsG: 41,
        fatG: 11,
      ),
    ];
    final changes = <({FoodEntry entry, String expectedFirstCandidate})>[
      (
        entry:
            _entry(id: 'e2', reviewReasons: const ['package_quantity_missing']),
        expectedFirstCandidate: 'Chicken Rice Bowl',
      ),
      (
        entry: _entry(
            nutritionAmount: 750,
            reviewReasons: const ['package_quantity_missing']),
        expectedFirstCandidate: 'Chicken Rice Bowl',
      ),
      (
        entry: _entry(
            nutritionUnit: 'g',
            reviewReasons: const ['package_quantity_missing']),
        expectedFirstCandidate: 'Chicken Rice Bowl',
      ),
      (
        entry: _entry(
            candidates: updatedCandidates,
            reviewReasons: const ['package_quantity_missing']),
        expectedFirstCandidate: 'Updated first candidate',
      ),
      (
        entry: _entry(reviewReasons: const ['nutrition_basis_ambiguous']),
        expectedFirstCandidate: 'Chicken Rice Bowl',
      ),
    ];

    for (final change in changes) {
      final stream = StreamController<FoodEntry?>();
      addTearDown(stream.close);
      // Buffer the first value before pumping so the widget does not remain in
      // a loading state while pumpAndSettle waits for the first stream event.
      stream.add(_entry(reviewReasons: const ['package_quantity_missing']));
      final gateway = _Gateway(failuresRemaining: 1);
      await _pump(
        tester,
        gateway: gateway,
        reviewStream: stream.stream,
      );
      await _tapVisible(tester, _amountControl('custom'));
      await tester.enterText(_customInput(), '250');
      await tester.pump();
      await _tapVisible(tester, find.text('Teriyaki Chicken Bowl'));
      await _tapVisible(tester, _confirmButton());
      await tester.pumpAndSettle();
      expect(find.text('Could not confirm. Please try again.'), findsOneWidget);

      stream.add(change.entry);
      await tester.pump();
      expect(_amountControl('custom'), findsOneWidget);
      _expectAmountSelection(tester, null);
      expect(_customInput(), findsNothing);
      expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull);
      expect(find.text('Could not confirm. Please try again.'), findsNothing);
      await _tapVisible(tester, _amountControl('custom'));
      expect(
          tester.widget<TextField>(_customInput()).controller?.text, isEmpty);

      await tester.enterText(_customInput(), '250');
      await tester.pump();
      await _tapVisible(tester, _confirmButton());
      await tester.pumpAndSettle();
      expect(gateway.entryIds, ['e1', 'e1']);
      expect(gateway.confirmations, hasLength(2));
      expect(gateway.confirmations.last.consumedAmount, 250);
      expect(gateway.confirmations.last.selectedCandidate?.name,
          change.expectedFirstCandidate);
    }
  });

  testWidgets(
      'streamed valid package updates reset state and conservatively preselect package',
      (tester) async {
    for (final reasons in const [
      <String>[],
      ['barcode_unconfirmed'],
    ]) {
      final stream = StreamController<FoodEntry?>();
      addTearDown(stream.close);
      stream.add(_entry(
        reviewReasons: const ['package_quantity_missing'],
      ));
      final gateway = _Gateway(failuresRemaining: 1);
      await _pump(
        tester,
        gateway: gateway,
        reviewStream: stream.stream,
      );
      await _tapVisible(tester, _amountControl('custom'));
      await tester.enterText(_customInput(), '250');
      await tester.pump();
      await _tapVisible(tester, find.text('Teriyaki Chicken Bowl'));
      await _tapVisible(tester, _confirmButton());
      await tester.pumpAndSettle();
      expect(find.text('Could not confirm. Please try again.'), findsOneWidget);

      stream.add(_entry(reviewReasons: reasons));
      await tester.pump();
      _expectAmountSelection(tester, 'package');
      expect(_customInput(), findsNothing);
      expect(find.text('Could not confirm. Please try again.'), findsNothing);
      expect(tester.widget<FilledButton>(_confirmButton()).onPressed,
          isNotNull);
      await _tapVisible(tester, _confirmButton());
      await tester.pumpAndSettle();
      expect(gateway.confirmations.last.consumedAmount, 500);
      expect(gateway.confirmations.last.selectedCandidate?.name,
          'Chicken Rice Bowl');
    }
  });

  testWidgets(
      'null and error stream transitions clear state before same-signature recovery',
      (tester) async {
    final stream = StreamController<FoodEntry?>();
    addTearDown(stream.close);
    final entry = _entry(
      reviewReasons: const ['package_quantity_missing'],
    );
    stream.add(entry);
    final gateway = _Gateway(failuresRemaining: 1);
    await _pump(
      tester,
      gateway: gateway,
      reviewStream: stream.stream,
    );
    await _tapVisible(tester, _amountControl('custom'));
    await tester.enterText(_customInput(), '250');
    await tester.pump();
    await _tapVisible(tester, find.text('Teriyaki Chicken Bowl'));
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(find.text('Could not confirm. Please try again.'), findsOneWidget);

    stream.add(null);
    await tester.pump();
    expect(find.text('Food entry no longer exists'), findsOneWidget);
    expect(_customInput(), findsNothing);
    expect(find.text('Could not confirm. Please try again.'), findsNothing);

    stream.addError(StateError('temporary stream failure'));
    await tester.pump();
    expect(find.text('Could not load review'), findsOneWidget);
    expect(_customInput(), findsNothing);
    expect(find.text('Could not confirm. Please try again.'), findsNothing);

    stream.add(entry);
    await tester.pump();
    _expectAmountSelection(tester, null);
    expect(_customInput(), findsNothing);
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull);

    await _tapVisible(tester, _amountControl('custom'));
    await tester.enterText(_customInput(), '250');
    await tester.pump();
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(gateway.confirmations.last.selectedCandidate?.name,
        'Chicken Rice Bowl');
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

  testWidgets(
      'in-flight confirmation remains locked across null transition and same-entry recovery',
      (tester) async {
    final stream = StreamController<FoodEntry?>();
    addTearDown(stream.close);
    final entry = _entry();
    stream.add(entry);
    final completion = Completer<void>();
    final result = await _pump(
      tester,
      gateway: _Gateway(completion: completion),
      reviewStream: stream.stream,
    );
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNotNull);
    await _tapVisible(tester, _confirmButton());
    expect(result.gateway.confirmations, hasLength(1));
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull,
        reason: 'confirmation must lock while saving');

    stream.add(null);
    await tester.pump();
    expect(find.text('Food entry no longer exists'), findsOneWidget);

    stream.add(entry);
    await tester.pump();
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNull,
        reason:
            'in-flight confirmation must remain locked across null recovery');
    await _tapVisible(tester, _confirmButton());
    expect(result.gateway.confirmations, hasLength(1),
        reason: 'no second gateway call may start until the original completes');

    completion.complete();
    await tester.pumpAndSettle();
    expect(result.gateway.confirmations, hasLength(1));
    expect(result.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('confirmation failure stays on Review and permits retry',
      (tester) async {
    final gateway = _Gateway(failuresRemaining: 1);
    final result = await _pump(tester, gateway: gateway);
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(result.router.state.uri.path, '/review/e1');
    expect(find.text('Could not confirm. Please try again.'), findsOneWidget);
    expect(tester.widget<FilledButton>(_confirmButton()).onPressed, isNotNull);
    await _tapVisible(tester, _confirmButton());
    await tester.pumpAndSettle();
    expect(result.gateway.confirmations, hasLength(2));
    expect(result.router.state.uri.path, '/today/food/e1');
  });

  testWidgets('secondary actions route to manual, scan, and linked assistant',
      (tester) async {
    var result = await _pump(tester);
    await _tapVisible(tester, find.text('None of these'));
    await tester.pumpAndSettle();
    expect(result.router.state.uri.path, '/manual');
    result = await _pump(tester);
    await _tapVisible(tester, find.text('Retake'));
    await tester.pumpAndSettle();
    expect(result.router.state.uri.path, '/scan');
    result = await _pump(tester);
    await _tapVisible(tester, find.textContaining('Ask'));
    await tester.pumpAndSettle();
    expect(result.router.state.uri.queryParameters['mealId'], 'e1');
  });
}
