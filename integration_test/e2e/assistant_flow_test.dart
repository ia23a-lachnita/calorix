import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/shared/services/ai_chat_service.dart';
import 'package:calorix/shared/widgets/macro_progress_bar.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'assistant confirmation applies protein target once and Today reflects it',
    (tester) async {
      final harness = await E2EHarness.create(
        aiActionResponder: (_) => const AiChatServiceResponse(
          threadId: 'e2e-thread',
          reply: 'I can raise your protein target to 180g.',
          action: AiChatServiceAction(
            field: 'Protein',
            macro: 'protein',
            oldValue: 170,
            newValue: 180,
          ),
        ),
      );
      await harness.pump(tester, initialLocation: '/ai');

      await tester.enterText(
        find.byType(TextField).hitTestable(),
        'Adjust my protein to 180g',
      );
      await tester.tap(find.byIcon(Icons.arrow_upward).hitTestable());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        find.text('I can raise your protein target to 180g.'),
        findsOneWidget,
      );
      final apply = find.byKey(const ValueKey('ai-action-apply'));
      expect(apply, findsOneWidget);
      await tester.ensureVisible(apply);
      await tester.pumpAndSettle();

      await tester.tap(apply.hitTestable());
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(harness.macroStore.writeCount, 1);
      expect(harness.macroStore.activePlan?.protein, 180);
      expect(
        find.textContaining('protein target is now 180'),
        findsOneWidget,
      );

      await harness.go(tester, '/today');
      await tester.pumpAndSettle();

      expect(find.byType(TodayScreen).hitTestable(), findsOneWidget);
      expect(find.text('Protein'), findsWidgets);
      final proteinTargets = tester
          .widgetList<MacroProgressBar>(find.byType(MacroProgressBar))
          .where((bar) => bar.label == 'Protein')
          .map((bar) => bar.target)
          .toList(growable: false);
      expect(proteinTargets, contains(180));
      final persistedTarget = find.byWidgetPredicate(
        (widget) => widget is MacroProgressBar && widget.target == 180,
        description: 'Today protein target of 180g',
      );
      await tester.ensureVisible(persistedTarget);
      await tester.pumpAndSettle();
      expect(
        find
            .descendant(
              of: persistedTarget,
              matching: find.text(' / 180g'),
            )
            .hitTestable(),
        findsOneWidget,
      );
    },
  );
}
