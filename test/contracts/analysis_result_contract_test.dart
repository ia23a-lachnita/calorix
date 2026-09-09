import 'package:calorix/shared/models/food_entry.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('backend analysis result deserializes without wire-field loss', () {
    final entry = FoodEntry.fromData(
      id: 'entry-1',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 7, 22),
        'date': '2026-07-22',
        'scanMode': 'label',
        'status': 'needs_review',
        'foodName': 'Greek yogurt',
        'baseKcal': 145,
        'baseProtein': 17.5,
        'baseCarbs': 9.2,
        'baseFat': 4.1,
        'confidence': 0.72,
        'atwaterKcal': 144,
        'candidates': [
          {
            'name': 'Greek yogurt',
            'confidence': 0.72,
            'kcal': 145,
            'proteinG': 17.5,
            'carbsG': 9.2,
            'fatG': 4.1,
          },
        ],
      },
    );

    expect(entry.foodName, 'Greek yogurt');
    expect(entry.status, FoodEntryStatus.needsReview);
    expect(entry.scanMode, 'label');
    expect(entry.atwaterKcal, 144);
    expect(entry.baseKcal, 145);
    expect(entry.baseProtein, 17.5);
    expect(entry.baseCarbs, 9.2);
    expect(entry.baseFat, 4.1);
    expect(entry.candidates, hasLength(1));
    expect(entry.candidates.single.proteinG, 17.5);

    final roundTrip = entry.toMap();
    expect(roundTrip['baseKcal'], 145);
    expect(roundTrip['baseProtein'], 17.5);
    expect(roundTrip['baseCarbs'], 9.2);
    expect(roundTrip['baseFat'], 4.1);
    expect(roundTrip.containsKey('kcal'), isFalse);
    expect(roundTrip.containsKey('protein'), isFalse);
    expect(roundTrip.containsKey('carbs'), isFalse);
    expect(roundTrip.containsKey('fat'), isFalse);
    expect(roundTrip['atwaterKcal'], 144);
    expect(roundTrip['candidates'], [
      {
        'name': 'Greek yogurt',
        'confidence': 0.72,
        'kcal': 145,
        'proteinG': 17.5,
        'carbsG': 9.2,
        'fatG': 4.1,
      },
    ]);
  });

  test('legacy nutrition is read as base data but rewritten canonically', () {
    final entry = FoodEntry.fromData(
      id: 'legacy',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 7, 22),
        'date': '2026-07-22',
        'scanMode': 'meal',
        'status': 'complete',
        'kcal': 100,
        'protein': 10,
        'carbs': 20,
        'fat': 5,
        'servingMultiplier': 2,
      },
    );

    expect(entry.baseKcal, 100);
    expect(entry.scaledKcal, 200);
    expect(entry.toMap(), containsPair('baseKcal', 100));
    expect(entry.toMap().containsKey('kcal'), isFalse);
  });

  test(
      'canonical nutrition references and provenance round trip without wire loss',
      () {
    const per100Reference = {
      'kcal': 17.0,
      'proteinG': 0.0,
      'carbsG': 4.2,
      'fatG': 0.0,
      'amount': 100.0,
      'unit': 'ml',
    };
    const servingReference = {
      'kcal': 42.5,
      'proteinG': 0.0,
      'carbsG': 10.5,
      'fatG': 0.0,
      'amount': 250.0,
      'unit': 'ml',
    };
    final dynamic entry = FoodEntry.fromData(
      id: 'canonical',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'baseProtein': 0.0,
        'baseCarbs': 21.0,
        'baseFat': 0.0,
        'servingMultiplier': 9.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
        'packageUnitCount': 6,
        'unitAmount': 83.3333333333,
        'per100Reference': per100Reference,
        'servingReference': servingReference,
        'reviewReasons': ['barcode_unconfirmed'],
        'rawBarcode': '7350042716380',
        'modelBarcode': '7350042716380',
        'confirmedBarcode': null,
      },
    );

    final wire = (entry.copyWith() as dynamic).toMap() as Map<String, dynamic>;
    expect(entry.nutritionBasis, 'package');
    expect(entry.nutritionAmount, 500.0);
    expect(entry.nutritionUnit, 'ml');
    expect(entry.consumedAmount, 250.0);
    expect(entry.packageUnitCount, 6);
    expect(entry.unitAmount, 83.3333333333);
    expect((entry.per100Reference as dynamic).toMap(), per100Reference);
    expect((entry.servingReference as dynamic).toMap(), servingReference);
    expect(wire['reviewReasons'], ['barcode_unconfirmed']);
    expect(wire['rawBarcode'], '7350042716380');
    expect(wire['modelBarcode'], '7350042716380');
    expect(wire['confirmedBarcode'], isNull);
    expect(FoodEntry.fromData(id: 'canonical', data: wire).toMap(), wire);
  });

  test(
      'canonical entries emit an empty ordered review-reason list when none is supplied',
      () {
    final entry = FoodEntry.fromData(
      id: 'no-reasons',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'label',
        'status': 'complete',
        'baseKcal': 85.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 500.0,
      },
    );

    expect(entry.toMap()['reviewReasons'], <String>[]);
  });

  test(
      'canonical trigger fields fail closed unless the full strict tuple is valid',
      () {
    final valid = FoodEntry.fromData(
      id: 'valid',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
      },
    );
    final partial = FoodEntry.fromData(
      id: 'partial',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'servingMultiplier': 2.0,
        'nutritionBasis': 'package',
      },
    );
    final malformed = FoodEntry.fromData(
      id: 'malformed',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'servingMultiplier': 2.0,
        'nutritionBasis': 'per100g',
        'nutritionAmount': 99.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 99.0,
      },
    );
    final barcodeOnlyLegacy = FoodEntry.fromData(
      id: 'barcode-only-legacy',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'servingMultiplier': 2.0,
        'rawBarcode': '7350042716380',
        'modelBarcode': '7350042716380',
        'confirmedBarcode': '7350042716380',
      },
    );
    final validPortion = FoodEntry.fromData(
      id: 'portion',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'meal',
        'status': 'complete',
        'baseKcal': 100.0,
        'nutritionBasis': 'portion',
        'nutritionAmount': 1.0,
        'nutritionUnit': 'portion',
        'consumedAmount': 1.0,
      },
    );
    final validPer100 = FoodEntry.fromData(
      id: 'per100',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'label',
        'status': 'needs_review',
        'baseKcal': 17.0,
        'nutritionBasis': 'per100g',
        'nutritionAmount': 100.0,
        'nutritionUnit': 'ml',
      },
    );

    expect((valid as dynamic).hasCanonicalNutrition, isTrue);
    expect((valid as dynamic).usesLegacyServingMultiplier, isFalse);
    expect((valid as dynamic).hasResolvedConsumption, isTrue);
    expect((partial as dynamic).hasCanonicalNutrition, isFalse);
    expect((partial as dynamic).usesLegacyServingMultiplier, isFalse);
    expect((partial as dynamic).hasResolvedConsumption, isFalse);
    expect((partial as dynamic).scaledKcal, 0.0);
    expect((malformed as dynamic).hasCanonicalNutrition, isFalse);
    expect((malformed as dynamic).usesLegacyServingMultiplier, isFalse);
    expect((malformed as dynamic).hasResolvedConsumption, isFalse);
    expect((malformed as dynamic).scaledKcal, 0.0);
    expect((barcodeOnlyLegacy as dynamic).usesLegacyServingMultiplier, isTrue);
    expect((barcodeOnlyLegacy as dynamic).hasResolvedConsumption, isTrue);
    expect(barcodeOnlyLegacy.scaledKcal, 170.0);
    expect((validPortion as dynamic).hasCanonicalNutrition, isTrue);
    expect((validPer100 as dynamic).hasCanonicalNutrition, isTrue);
    expect((validPer100 as dynamic).hasResolvedConsumption, isFalse);
  });

  test(
      'present-null canonical triggers remain nonlegacy and serialize only the empty reasons list',
      () {
    final dynamic entry = FoodEntry.fromData(
      id: 'null-canonical',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'needs_review',
        'baseKcal': 100.0,
        'servingMultiplier': 2.0,
        'nutritionBasis': null,
        'nutritionAmount': null,
        'nutritionUnit': null,
        'consumedAmount': null,
        'packageUnitCount': null,
        'unitAmount': null,
        'per100Reference': null,
        'servingReference': null,
        'reviewReasons': null,
        'rawBarcode': null,
        'modelBarcode': null,
        'confirmedBarcode': null,
      },
    );

    final wire = entry.toMap() as Map<String, dynamic>;
    expect(entry.usesLegacyServingMultiplier, isFalse);
    expect(entry.hasCanonicalNutrition, isFalse);
    expect(entry.hasResolvedConsumption, isFalse);
    expect(entry.scaledKcal, 0.0);
    for (final field in [
      'nutritionBasis',
      'nutritionAmount',
      'nutritionUnit',
      'consumedAmount',
      'packageUnitCount',
      'unitAmount',
      'per100Reference',
      'servingReference',
      'rawBarcode',
      'modelBarcode',
      'confirmedBarcode',
    ]) {
      expect(wire.containsKey(field), isFalse);
    }
    expect(wire['reviewReasons'], <String>[]);
    expect(wire['confirmedBarcode'], isNull);
  });

  test(
      'invalid optional metadata parses null without invalidating a resolved canonical ratio',
      () {
    final dynamic invalidReference = FoodEntry.fromData(
      id: 'invalid-reference',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'servingMultiplier': 2.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
        'per100Reference': 'invalid',
      },
    );
    final dynamic fractionalCount = FoodEntry.fromData(
      id: 'fractional-count',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'servingMultiplier': 2.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
        'packageUnitCount': 1.5,
      },
    );

    expect(invalidReference.usesLegacyServingMultiplier, isFalse);
    expect(invalidReference.per100Reference, isNull);
    expect(invalidReference.hasResolvedConsumption, isTrue);
    expect(invalidReference.scaledKcal, 42.5);
    expect(fractionalCount.usesLegacyServingMultiplier, isFalse);
    expect(fractionalCount.packageUnitCount, isNull);
    expect(fractionalCount.hasResolvedConsumption, isTrue);
    expect(fractionalCount.scaledKcal, 42.5);
  });

  test(
      'each canonical wire trigger disables legacy fallback when the core tuple is absent',
      () {
    final triggerValues = <String, Object?>{
      'nutritionBasis': 'package',
      'nutritionAmount': -1.0,
      'nutritionUnit': 'invalid',
      'consumedAmount': 0.0,
      'packageUnitCount': 1.5,
      'unitAmount': -1.0,
      'per100Reference': 'invalid',
      'servingReference': 'invalid',
      'reviewReasons': ['not_allowed'],
    };
    final base = <String, dynamic>{
      'uid': 'user-1',
      'timestamp': DateTime.utc(2026, 9, 8),
      'date': '2026-09-08',
      'scanMode': 'barcode',
      'status': 'complete',
      'baseKcal': 85.0,
      'servingMultiplier': 2.0,
    };

    for (final trigger in triggerValues.entries) {
      final dynamic entry = FoodEntry.fromData(
        id: 'trigger-${trigger.key}',
        data: {...base, trigger.key: trigger.value},
      );
      expect(entry.usesLegacyServingMultiplier, isFalse, reason: trigger.key);
      expect(entry.hasCanonicalNutrition, isFalse, reason: trigger.key);
      expect(entry.hasResolvedConsumption, isFalse, reason: trigger.key);
      expect(entry.scaledKcal, 0.0, reason: trigger.key);
    }
  });

  test(
      'each present-null canonical trigger independently disables legacy fallback',
      () {
    const triggerKeys = [
      'nutritionBasis',
      'nutritionAmount',
      'nutritionUnit',
      'consumedAmount',
      'packageUnitCount',
      'unitAmount',
      'per100Reference',
      'servingReference',
      'reviewReasons',
    ];
    final base = <String, dynamic>{
      'uid': 'user-1',
      'timestamp': DateTime.utc(2026, 9, 8),
      'date': '2026-09-08',
      'scanMode': 'barcode',
      'status': 'complete',
      'baseKcal': 85.0,
      'servingMultiplier': 2.0,
    };

    for (final triggerKey in triggerKeys) {
      final dynamic entry = FoodEntry.fromData(
        id: 'null-trigger-$triggerKey',
        data: {...base, triggerKey: null},
      );
      expect(entry.usesLegacyServingMultiplier, isFalse, reason: triggerKey);
      expect(entry.hasCanonicalNutrition, isFalse, reason: triggerKey);
      expect(entry.hasResolvedConsumption, isFalse, reason: triggerKey);
      expect(entry.scaledKcal, 0.0, reason: triggerKey);
    }
  });

  test(
      'strict basis amount and unit combinations reject unresolved canonical tuples',
      () {
    final invalidTuples = [
      ('package-unit', 'package', 500.0, 'portion'),
      ('portion-amount', 'portion', 2.0, 'portion'),
      ('portion-unit', 'portion', 1.0, 'ml'),
      ('per100-amount', 'per100g', 99.0, 'ml'),
      ('per100-unit', 'per100g', 100.0, 'portion'),
      ('package-infinity', 'package', double.infinity, 'ml'),
      ('package-nan', 'package', double.nan, 'ml'),
    ];
    for (final tuple in invalidTuples) {
      final dynamic entry = FoodEntry.fromData(
        id: tuple.$1,
        data: {
          'uid': 'user-1',
          'timestamp': DateTime.utc(2026, 9, 8),
          'date': '2026-09-08',
          'scanMode': 'barcode',
          'status': 'complete',
          'baseKcal': 85.0,
          'servingMultiplier': 2.0,
          'nutritionBasis': tuple.$2,
          'nutritionAmount': tuple.$3,
          'nutritionUnit': tuple.$4,
          'consumedAmount': 1.0,
        },
      );
      expect(entry.usesLegacyServingMultiplier, isFalse, reason: tuple.$1);
      expect(entry.hasCanonicalNutrition, isFalse, reason: tuple.$1);
      expect(entry.hasResolvedConsumption, isFalse, reason: tuple.$1);
      expect(entry.scaledKcal, 0.0, reason: tuple.$1);
    }
  });

  test('canonical consumption must be finite and positive before any scaling',
      () {
    for (final consumedAmount in [
      0.0,
      -1.0,
      double.infinity,
      double.nan,
    ]) {
      final dynamic entry = FoodEntry.fromData(
        id: 'consumed-$consumedAmount',
        data: {
          'uid': 'user-1',
          'timestamp': DateTime.utc(2026, 9, 8),
          'date': '2026-09-08',
          'scanMode': 'barcode',
          'status': 'complete',
          'baseKcal': 85.0,
          'servingMultiplier': 2.0,
          'nutritionBasis': 'package',
          'nutritionAmount': 500.0,
          'nutritionUnit': 'ml',
          'consumedAmount': consumedAmount,
        },
      );
      expect(entry.usesLegacyServingMultiplier, isFalse);
      expect(entry.hasCanonicalNutrition, isTrue);
      expect(entry.hasResolvedConsumption, isFalse);
      expect(entry.scaledKcal, 0.0);
    }
  });

  test(
      'copyWith patches every canonical and provenance field, while typed clear flags are distinct from omission',
      () {
    NutritionReference reference({
      required double kcal,
      required double proteinG,
      required double carbsG,
      required double fatG,
      required double amount,
      required String unit,
    }) =>
        NutritionReference.tryParse({
          'kcal': kcal,
          'proteinG': proteinG,
          'carbsG': carbsG,
          'fatG': fatG,
          'amount': amount,
          'unit': unit,
        })!;
    final original = FoodEntry.fromData(
      id: 'patchable-canonical',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'baseProtein': 5.0,
        'baseCarbs': 21.0,
        'baseFat': 1.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
        'packageUnitCount': 5,
        'unitAmount': 100.0,
        'per100Reference': reference(
          kcal: 17.0,
          proteinG: 1.0,
          carbsG: 4.2,
          fatG: 0.2,
          amount: 100.0,
          unit: 'ml',
        ).toMap(),
        'servingReference': reference(
          kcal: 34.0,
          proteinG: 2.0,
          carbsG: 8.4,
          fatG: 0.4,
          amount: 200.0,
          unit: 'ml',
        ).toMap(),
        'reviewReasons': ['barcode_unconfirmed'],
        'rawBarcode': 'raw-before',
        'modelBarcode': 'model-before',
        'confirmedBarcode': 'confirmed-before',
      },
    );

    final legacy = FoodEntry.fromData(
      id: 'legacy-to-canonical',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'complete',
        'baseKcal': 85.0,
        'servingMultiplier': 9.0,
      },
    );
    final dynamic canonicalFromLegacy = (legacy as dynamic).copyWith(
      nutritionBasis: 'package',
      nutritionAmount: 500.0,
      nutritionUnit: 'ml',
      consumedAmount: 250.0,
    );

    expect(legacy.usesLegacyServingMultiplier, isTrue);
    expect(canonicalFromLegacy.usesLegacyServingMultiplier, isFalse);
    expect(canonicalFromLegacy.hasCanonicalNutrition, isTrue);
    expect(canonicalFromLegacy.hasResolvedConsumption, isTrue);
    expect(canonicalFromLegacy.scaledKcal, 42.5);

    final dynamic patched = (original as dynamic).copyWith(
      baseKcal: 90.0,
      baseProtein: 6.0,
      baseCarbs: 24.0,
      baseFat: 1.2,
      nutritionBasis: 'package',
      nutritionAmount: 600.0,
      nutritionUnit: 'ml',
      consumedAmount: 300.0,
      packageUnitCount: 6,
      unitAmount: 100.0,
      per100Reference: reference(
        kcal: 15.0,
        proteinG: 1.0,
        carbsG: 4.0,
        fatG: 0.2,
        amount: 100.0,
        unit: 'ml',
      ),
      servingReference: reference(
        kcal: 30.0,
        proteinG: 2.0,
        carbsG: 8.0,
        fatG: 0.4,
        amount: 200.0,
        unit: 'ml',
      ),
      reviewReasons: const ['atwater_mismatch'],
      rawBarcode: 'raw-after',
      modelBarcode: 'model-after',
      confirmedBarcode: 'confirmed-after',
    );

    expect((original as dynamic).copyWith().toMap(), original.toMap());
    expect(patched.nutritionBasis, 'package');
    expect(patched.nutritionAmount, 600.0);
    expect(patched.nutritionUnit, 'ml');
    expect(patched.consumedAmount, 300.0);
    expect(patched.packageUnitCount, 6);
    expect(patched.unitAmount, 100.0);
    expect(
      patched.per100Reference.toMap(),
      reference(
        kcal: 15.0,
        proteinG: 1.0,
        carbsG: 4.0,
        fatG: 0.2,
        amount: 100.0,
        unit: 'ml',
      ).toMap(),
    );
    expect(
      patched.servingReference.toMap(),
      reference(
        kcal: 30.0,
        proteinG: 2.0,
        carbsG: 8.0,
        fatG: 0.4,
        amount: 200.0,
        unit: 'ml',
      ).toMap(),
    );
    expect(patched.reviewReasons, const ['atwater_mismatch']);
    expect(patched.rawBarcode, 'raw-after');
    expect(patched.modelBarcode, 'model-after');
    expect(patched.confirmedBarcode, 'confirmed-after');

    final dynamic cleared = patched.copyWith(
      nutritionBasis: null,
      nutritionAmount: null,
      nutritionUnit: null,
      consumedAmount: null,
      packageUnitCount: null,
      unitAmount: null,
      per100Reference: null,
      servingReference: null,
      reviewReasons: null,
      rawBarcode: null,
      modelBarcode: null,
      confirmedBarcode: null,
      clearNutritionBasis: true,
      clearNutritionAmount: true,
      clearNutritionUnit: true,
      clearConsumedAmount: true,
      clearPackageUnitCount: true,
      clearUnitAmount: true,
      clearPer100Reference: true,
      clearServingReference: true,
      clearReviewReasons: true,
      clearRawBarcode: true,
      clearModelBarcode: true,
      clearConfirmedBarcode: true,
    );

    expect(cleared.nutritionBasis, isNull);
    expect(cleared.nutritionAmount, isNull);
    expect(cleared.nutritionUnit, isNull);
    expect(cleared.consumedAmount, isNull);
    expect(cleared.packageUnitCount, isNull);
    expect(cleared.unitAmount, isNull);
    expect(cleared.per100Reference, isNull);
    expect(cleared.servingReference, isNull);
    expect(cleared.reviewReasons, isNull);
    expect(cleared.rawBarcode, isNull);
    expect(cleared.modelBarcode, isNull);
    expect(cleared.confirmedBarcode, isNull);
    expect(cleared.usesLegacyServingMultiplier, isFalse);
    expect(cleared.hasResolvedConsumption, isFalse);
  });

  test(
      'canonical constructor inputs remain nonlegacy even when the legacy override is supplied',
      () {
    final entry = FoodEntry(
      id: 'constructor-canonical',
      uid: 'user-1',
      timestamp: DateTime.utc(2026, 9, 8),
      date: '2026-09-08',
      scanMode: 'barcode',
      status: FoodEntryStatus.complete,
      baseKcal: 85.0,
      servingMultiplier: 9.0,
      nutritionBasis: 'package',
      nutritionAmount: 500.0,
      nutritionUnit: 'ml',
      consumedAmount: 250.0,
    );

    expect(entry.usesLegacyServingMultiplier, isFalse);
    expect(entry.hasCanonicalNutrition, isTrue);
    expect(entry.hasResolvedConsumption, isTrue);
    expect(entry.scaledKcal, 42.5);
  });

  test(
      'multipack metadata is all-or-none and valid only for an agreeing package amount',
      () {
    Map<String, dynamic> packageWire(Map<String, dynamic> multipack) => {
          'uid': 'user-1',
          'timestamp': DateTime.utc(2026, 9, 8),
          'date': '2026-09-08',
          'scanMode': 'barcode',
          'status': 'complete',
          'baseKcal': 85.0,
          'nutritionBasis': 'package',
          'nutritionAmount': 500.0,
          'nutritionUnit': 'ml',
          'consumedAmount': 250.0,
          ...multipack,
        };

    final withinTolerance = FoodEntry.fromData(
      id: 'within-tolerance',
      data: packageWire(const {
        'packageUnitCount': 5,
        'unitAmount': 100.0018,
      }),
    );
    expect(withinTolerance.packageUnitCount, 5);
    expect(withinTolerance.unitAmount, 100.0018);

    final invalidMultipacks = <String, Map<String, dynamic>>{
      'count-only': const {'packageUnitCount': 5},
      'amount-only': const {'unitAmount': 100.0},
      'zero-count': const {'packageUnitCount': 0, 'unitAmount': 100.0},
      'negative-count': const {'packageUnitCount': -1, 'unitAmount': 100.0},
      'oversized-count': {
        'packageUnitCount': 1000000001,
        'unitAmount': 500.0 / 1000000001,
      },
      'fractional-count': const {'packageUnitCount': 2.5, 'unitAmount': 200.0},
      'zero-unit-amount': const {'packageUnitCount': 5, 'unitAmount': 0.0},
      'negative-unit-amount': const {'packageUnitCount': 5, 'unitAmount': -1.0},
      'oversized-unit-amount': const {
        'packageUnitCount': 5,
        'unitAmount': 1000000001.0,
      },
      'infinite-unit-amount': {
        'packageUnitCount': 5,
        'unitAmount': double.infinity,
      },
      'beyond-tolerance': const {
        'packageUnitCount': 5,
        'unitAmount': 100.0021,
      },
    };
    for (final invalid in invalidMultipacks.entries) {
      final entry = FoodEntry.fromData(
        id: 'invalid-multipack-${invalid.key}',
        data: packageWire(invalid.value),
      );
      expect(entry.packageUnitCount, isNull, reason: invalid.key);
      expect(entry.unitAmount, isNull, reason: invalid.key);
      expect(entry.hasResolvedConsumption, isTrue, reason: invalid.key);
      expect(entry.scaledKcal, 42.5, reason: invalid.key);
    }

    final nonPackage = FoodEntry.fromData(
      id: 'non-package-multipack',
      data: {
        ...packageWire(const {
          'packageUnitCount': 1,
          'unitAmount': 1.0,
        }),
        'nutritionBasis': 'portion',
        'nutritionAmount': 1.0,
        'nutritionUnit': 'portion',
        'consumedAmount': 1.0,
      },
    );
    expect(nonPackage.packageUnitCount, isNull);
    expect(nonPackage.unitAmount, isNull);
    expect(nonPackage.hasResolvedConsumption, isTrue);
    expect(nonPackage.scaledKcal, 85.0);
  });

  test(
      'references require exact keys and a basis-compatible unit without poisoning a resolved core ratio',
      () {
    const reference = {
      'kcal': 17.0,
      'proteinG': 1.0,
      'carbsG': 4.2,
      'fatG': 0.0,
      'amount': 100.0,
      'unit': 'ml',
    };
    Map<String, dynamic> wire({
      Object? per100Reference = reference,
      Object? servingReference = reference,
    }) =>
        {
          'uid': 'user-1',
          'timestamp': DateTime.utc(2026, 9, 8),
          'date': '2026-09-08',
          'scanMode': 'barcode',
          'status': 'complete',
          'baseKcal': 85.0,
          'nutritionBasis': 'package',
          'nutritionAmount': 500.0,
          'nutritionUnit': 'ml',
          'consumedAmount': 250.0,
          'per100Reference': per100Reference,
          'servingReference': servingReference,
        };

    final valid = FoodEntry.fromData(id: 'valid-reference', data: wire());
    expect(valid.per100Reference, isNotNull);
    expect(valid.servingReference, isNotNull);

    final invalidPer100 = <String, Object?>{
      'extra-key': {...reference, 'unexpected': true},
      'missing-key': {
        'kcal': 17.0,
        'proteinG': 1.0,
        'carbsG': 4.2,
        'fatG': 0.0,
        'amount': 100.0,
      },
      'nonfinite-nutrient': {...reference, 'kcal': double.infinity},
      'kcal-over-limit': {...reference, 'kcal': 10000.0001},
      'macro-over-limit': {...reference, 'proteinG': 1000000000.0001},
      'amount-over-limit': {...reference, 'amount': 1000000000.0001},
      'wrong-amount': {...reference, 'amount': 99.0},
      'wrong-unit': {...reference, 'unit': 'g'},
    };
    for (final invalid in invalidPer100.entries) {
      final entry = FoodEntry.fromData(
        id: 'invalid-per100-${invalid.key}',
        data: wire(per100Reference: invalid.value),
      );
      expect(entry.per100Reference, isNull, reason: invalid.key);
      expect(entry.hasResolvedConsumption, isTrue, reason: invalid.key);
      expect(entry.scaledKcal, 42.5, reason: invalid.key);
    }

    final invalidServing = <String, Object?>{
      'extra-key': {...reference, 'unexpected': true},
      'missing-key': {
        'kcal': 17.0,
        'proteinG': 1.0,
        'carbsG': 4.2,
        'fatG': 0.0,
        'amount': 100.0,
      },
      'nonfinite-nutrient': {...reference, 'kcal': double.nan},
      'amount-over-limit': {...reference, 'amount': 1000000000.0001},
      'unit-mismatch': {...reference, 'unit': 'g'},
    };
    for (final invalid in invalidServing.entries) {
      final entry = FoodEntry.fromData(
        id: 'invalid-serving-${invalid.key}',
        data: wire(servingReference: invalid.value),
      );
      expect(entry.servingReference, isNull, reason: invalid.key);
      expect(entry.hasResolvedConsumption, isTrue, reason: invalid.key);
      expect(entry.scaledKcal, 42.5, reason: invalid.key);
    }
  });

  test(
      'review reasons retain only the seven Functions and Firestore values in canonical order',
      () {
    final entry = FoodEntry.fromData(
      id: 'ordered-reasons',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'needs_review',
        'baseKcal': 85.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
        'reviewReasons': [
          'model_schema_invalid',
          'not-a-review-reason',
          'atwater_mismatch',
          'barcode_unconfirmed',
          'package_quantity_missing',
          'nutrition_arithmetic_mismatch',
          'package_unit_unsupported',
          'nutrition_basis_ambiguous',
          'barcode_unconfirmed',
        ],
      },
    );

    const ordered = [
      'package_quantity_missing',
      'package_unit_unsupported',
      'barcode_unconfirmed',
      'nutrition_basis_ambiguous',
      'nutrition_arithmetic_mismatch',
      'atwater_mismatch',
      'model_schema_invalid',
    ];
    expect(entry.reviewReasons, ordered);
    expect(entry.toMap()['reviewReasons'], ordered);

    final sanitizedEmpty = FoodEntry.fromData(
      id: 'sanitized-empty-reasons',
      data: {
        'uid': 'user-1',
        'timestamp': DateTime.utc(2026, 9, 8),
        'date': '2026-09-08',
        'scanMode': 'barcode',
        'status': 'needs_review',
        'baseKcal': 85.0,
        'nutritionBasis': 'package',
        'nutritionAmount': 500.0,
        'nutritionUnit': 'ml',
        'consumedAmount': 250.0,
        'reviewReasons': ['not-a-review-reason'],
      },
    );
    expect(sanitizedEmpty.reviewReasons, isEmpty);
    expect(sanitizedEmpty.usesLegacyServingMultiplier, isFalse);
    expect(sanitizedEmpty.toMap()['reviewReasons'], isEmpty);
  });
}
