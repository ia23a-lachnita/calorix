import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/policy/draft_policy.dart';

void main() {
  group('draftPolicyFor', () {
    test('foodEdit maps to confirmDestructiveExit', () {
      expect(draftPolicyFor(DraftType.foodEdit), DraftPolicy.confirmDestructiveExit);
    });

    test('manualEntry maps to confirmDestructiveExit', () {
      expect(draftPolicyFor(DraftType.manualEntry), DraftPolicy.confirmDestructiveExit);
    });

    test('goalsEdit maps to confirmDestructiveExit', () {
      expect(draftPolicyFor(DraftType.goalsEdit), DraftPolicy.confirmDestructiveExit);
    });

    test('chatComposition maps to discardWithNotice', () {
      expect(draftPolicyFor(DraftType.chatComposition), DraftPolicy.discardWithNotice);
    });

    test('searchFilters maps to discardWithNotice', () {
      expect(draftPolicyFor(DraftType.searchFilters), DraftPolicy.discardWithNotice);
    });
  });
}
