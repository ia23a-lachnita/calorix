import 'package:calorix/shell/app_shell.dart';
import 'package:calorix/features/onboarding/login_screen.dart';
import 'package:calorix/features/profile/profile_sheet.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/widgets/confidence_badge.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/semantics.dart';
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

List<String> _semanticLabels(WidgetTester tester) {
  final labels = <String>[];
  void collect(SemanticsNode node) {
    if (node.label.isNotEmpty) labels.add(node.label);
    node.visitChildren((child) {
      collect(child);
      return true;
    });
  }

  final renderView = tester.binding.renderViews.single;
  collect(renderView.owner!.semanticsOwner!.rootSemanticsNode!);
  return labels;
}

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
      tester
          .getSemantics(
            find.byKey(const ValueKey('confidence-status-semantics')),
          )
          .label,
      'Review 65% confidence',
    );
    expect(
      _semanticLabels(tester)
          .where((label) => label.contains('Review') || label.contains('65%')),
      ['Review 65% confidence'],
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
    expect(
      tester.getSemantics(find.byType(TextButton)).label,
      'Needs review',
    );
    semantics.dispose();
  });

  testWidgets('login controls meet tap-target and label guidelines',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(_FakeAuth()),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pump();

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('profile controls meet tap-target and label guidelines',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthProvider.overrideWithValue(_FakeAuth()),
        ],
        child: const MaterialApp(home: ProfileSheet()),
      ),
    );
    await tester.pump();

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });
}

class _FakeAuth extends Fake implements FirebaseAuth {
  @override
  User? get currentUser => null;

  @override
  Stream<User?> authStateChanges() => Stream.value(null);
}
