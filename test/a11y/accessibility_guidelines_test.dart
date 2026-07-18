import 'package:calorix/shell/app_shell.dart';
import 'package:calorix/shared/widgets/confidence_badge.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

GoRouter _buildShellRouter() => GoRouter(
      initialLocation: '/today',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) =>
              AppShell(navigationShell: navigationShell),
          branches: [
            for (final route in const [
              ('today', 'Today'),
              ('history', 'History'),
              ('scan', 'Scan'),
              ('goals', 'Goals'),
              ('ai', 'AI'),
            ])
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: '/${route.$1}',
                    builder: (_, __) => Scaffold(body: Text(route.$2)),
                  ),
                ],
              ),
          ],
        ),
      ],
    );

void main() {
  testWidgets('five-tab shell meets tap-target and label guidelines',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp.router(routerConfig: _buildShellRouter()),
      ),
    );
    await tester.pumpAndSettle();

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('confidence badge communicates status without color alone',
      (tester) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ConfidenceBadge(confidence: 0.65)),
      ),
    );

    expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
    expect(find.textContaining('65%'), findsOneWidget);
    expect(find.textContaining('Review'), findsWidgets);
    expect(
      tester.getSemantics(find.byType(ConfidenceBadge)).label,
      contains('Review 65%'),
    );
    semantics.dispose();
  });

  testWidgets('confidence review action has a labeled 44px tap target',
      (tester) async {
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ConfidenceBadge(
            confidence: 0.65,
            onReviewTap: () {},
          ),
        ),
      ),
    );

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });
}
