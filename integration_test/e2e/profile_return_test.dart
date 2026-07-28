import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/profile/profile_sheet.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/scan/scan_screen.dart';

import 'support/e2e_harness.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('profile_return_test — origin return from profile', () {
    testWidgets(
      'closing profile opened from Today returns to Today, not Scan',
      (tester) async {
        final harness = await E2EHarness.create();
        await harness.pump(tester, initialLocation: '/today');

        expect(find.byType(TodayScreen), findsOneWidget);

        // Open profile via the avatar button on Today.
        await tester.tap(find.byKey(const ValueKey('today-avatar')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byType(ProfileSheet), findsOneWidget);

        // Close profile — must return to Today.
        await tester.tap(find.byKey(const ValueKey('profile-close')));
        await tester.pump();
        // The profile slide-down animation is 320ms; wait for completion.
        await tester.pump(const Duration(milliseconds: 500));

        expect(find.byType(TodayScreen), findsOneWidget);
        expect(find.byType(ProfileSheet), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'closing profile opened from Scan returns to Scan',
      (tester) async {
        final harness = await E2EHarness.create();
        await harness.pump(tester, initialLocation: '/scan');

        expect(find.byType(ScanScreen), findsOneWidget);

        await tester.tap(find.byKey(const ValueKey('scan-profile')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byType(ProfileSheet), findsOneWidget);

        // Close profile — must return to Scan.
        await tester.tap(find.byKey(const ValueKey('profile-close')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        expect(find.byType(ScanScreen), findsOneWidget);
        expect(find.byType(ProfileSheet), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'closing profile pushed from Assistant returns to Assistant',
      (tester) async {
        final harness = await E2EHarness.create();
        await harness.pump(tester, initialLocation: '/ai');
        expect(find.byType(AiChatScreen).hitTestable(), findsOneWidget);

        await harness.push(tester, '/profile');
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byType(ProfileSheet), findsOneWidget);

        await tester.tap(find.byKey(const ValueKey('profile-close')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        expect(find.byType(AiChatScreen).hitTestable(), findsOneWidget);
        expect(find.byType(ProfileSheet), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  });
}
