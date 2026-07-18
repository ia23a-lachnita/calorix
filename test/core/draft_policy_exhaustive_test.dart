import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/policy/draft_policy.dart';

void main() {
  group('DraftType exhaustive mapping', () {
    test('every DraftType value is handled by draftPolicyFor', () {
      // This test ensures the exhaustive switch covers all enum values.
      // If a new DraftType is added, the test will fail at compile time
      // (exhaustive switch) or at runtime (coverage check).
      for (final type in DraftType.values) {
        final policy = draftPolicyFor(type);
        expect(policy, isNotNull);
        expect(
          policy == DraftPolicy.confirmDestructiveExit ||
              policy == DraftPolicy.discardWithNotice,
          isTrue,
          reason: 'DraftType.$type should map to a valid DraftPolicy',
        );
      }
    });

    test('destructiveExit types are disjoint from discardWithNotice types', () {
      final exitTypes = DraftType.values
          .where((t) => draftPolicyFor(t) == DraftPolicy.confirmDestructiveExit)
          .toList();
      final discardTypes = DraftType.values
          .where((t) => draftPolicyFor(t) == DraftPolicy.discardWithNotice)
          .toList();

      // Verify no overlap
      for (final type in exitTypes) {
        expect(discardTypes, isNot(contains(type)));
      }
      for (final type in discardTypes) {
        expect(exitTypes, isNot(contains(type)));
      }
    });

    test('all DraftType values are accounted for', () {
      final allTypes = DraftType.values.toSet();
      final exitTypes = DraftType.values
          .where((t) => draftPolicyFor(t) == DraftPolicy.confirmDestructiveExit)
          .toSet();
      final discardTypes = DraftType.values
          .where((t) => draftPolicyFor(t) == DraftPolicy.discardWithNotice)
          .toSet();

      final accountedFor = exitTypes.union(discardTypes);
      expect(accountedFor, equals(allTypes));
    });
  });

  group('DraftPolicy enum', () {
    test('has exactly two values', () {
      expect(DraftPolicy.values.length, 2);
      expect(DraftPolicy.values, contains(DraftPolicy.confirmDestructiveExit));
      expect(DraftPolicy.values, contains(DraftPolicy.discardWithNotice));
    });
  });

  group('DraftType enum', () {
    test('has exactly five values', () {
      expect(DraftType.values.length, 5);
    });
  });
}
