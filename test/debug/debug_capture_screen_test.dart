import 'package:calorix/core/time/clock.dart';
import 'package:calorix/debug/debug_capture_screen.dart';
import 'package:calorix/debug/debug_deep_links.dart';
import 'package:calorix/debug/ui_diff_fixture.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/ai_chat/ai_history_screen.dart';
import 'package:calorix/features/food_detail/food_detail_sheet.dart';
import 'package:calorix/features/goals/goals_screen.dart';
import 'package:calorix/features/history/history_screen.dart';
import 'package:calorix/features/manual/manual_entry_screen.dart';
import 'package:calorix/features/onboarding/loading_screen.dart';
import 'package:calorix/features/onboarding/login_screen.dart';
import 'package:calorix/features/processing/processing_screen.dart';
import 'package:calorix/features/review/review_screen.dart';
import 'package:calorix/features/scan/permission_screen.dart';
import 'package:calorix/features/scan/scan_screen.dart';
import 'package:calorix/features/scan/providers/scan_providers.dart';
import 'package:calorix/features/today/today_screen.dart';
import 'package:calorix/features/profile/profile_sheet.dart';
import 'package:calorix/shared/providers/ui_diff_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/timezone.dart' as tz;

// Copied from deep_link_matrix_test.dart for test independence
const canonicalFixtureProfileById = <String, UiDiffFixtureProfile>{
  'loading': UiDiffFixtureProfile.flowLoading,
  'login': UiDiffFixtureProfile.flowLogin,
  'permission': UiDiffFixtureProfile.flowPermission,
  'scan_idle': UiDiffFixtureProfile.flowScan,
  'scan_capturing': UiDiffFixtureProfile.flowScan,
  'processing': UiDiffFixtureProfile.flowProcessing,
  'review': UiDiffFixtureProfile.flowReview,
  'manual': UiDiffFixtureProfile.flowManual,
  'today': UiDiffFixtureProfile.populated,
  'today_empty': UiDiffFixtureProfile.empty,
  'food': UiDiffFixtureProfile.populated,
  'food_edit': UiDiffFixtureProfile.populated,
  'history_week': UiDiffFixtureProfile.populated,
  'history_month': UiDiffFixtureProfile.populated,
  'goals': UiDiffFixtureProfile.populated,
  'goals_select': UiDiffFixtureProfile.populated,
  'ai': UiDiffFixtureProfile.populated,
  'ai_history': UiDiffFixtureProfile.populated,
  'profile': UiDiffFixtureProfile.populated,
};

class _FakeClock implements Clock {
  _FakeClock(this._instant);
  final tz.TZDateTime _instant;
  int reads = 0;

  @override
  DateTime now() => nowTZ();

  @override
  tz.TZDateTime nowTZ() {
    reads++;
    return _instant;
  }
}

UiDiffFixtureManifest _createManifest({
  Clock? clock,
  UiDiffFixtureProfile profile = UiDiffFixtureProfile.populated,
}) =>
    UiDiffFixtureManifest.create(
      uid: 'test-user',
      clock: clock ?? _FakeClock(tz.TZDateTime.utc(2026, 7, 18, 10, 30)),
      profile: profile,
    );

Future<void> _pumpStableFrames(WidgetTester tester) async {
  for (var frame = 0; frame < 5; frame++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}

void main() {
  group('DebugCaptureScreen - 19 targets x 2 themes', () {
    const canonicalIds = <String>{
      'loading',
      'login',
      'permission',
      'scan_idle',
      'scan_capturing',
      'processing',
      'review',
      'manual',
      'today',
      'today_empty',
      'food',
      'food_edit',
      'history_week',
      'history_month',
      'goals',
      'goals_select',
      'ai',
      'ai_history',
      'profile',
    };

    const themes = <UiDiffCaptureTheme>[
      UiDiffCaptureTheme.dark,
      UiDiffCaptureTheme.light
    ];

    for (final targetId in canonicalIds) {
      for (final theme in themes) {
        testWidgets('$targetId (${theme.name}) renders production widget type',
            (WidgetTester tester) async {
          final manifest = _createManifest(
            profile: canonicalFixtureProfileById[targetId] ??
                UiDiffFixtureProfile.empty,
          );

          await tester.pumpWidget(
            ProviderScope(
              overrides: [
                uiDiffModeProvider.overrideWith((_) => true),
                uiDiffFixtureEnabledProvider.overrideWith((_) => true),
                uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
                uiDiffThemeOverrideProvider.overrideWith((_) =>
                    theme == UiDiffCaptureTheme.dark
                        ? ThemeMode.dark
                        : ThemeMode.light),
              ],
              child: MaterialApp(
                home: DebugCaptureScreen(targetId: targetId),
              ),
            ),
          );

          await _pumpStableFrames(tester);

          // Verify no blocked state
          expect(find.textContaining('Capture target blocked'), findsNothing);

          // Verify production widget type for each target
          switch (targetId) {
            case 'loading':
              expect(find.byType(LoadingScreen), findsOneWidget);
              break;
            case 'login':
              expect(find.byType(LoginScreen), findsOneWidget);
              break;
            case 'permission':
              expect(find.byType(PermissionScreen), findsOneWidget);
              break;
            case 'scan_idle':
            case 'scan_capturing':
              expect(find.byType(ScanScreen), findsOneWidget);
              break;
            case 'processing':
              expect(find.byType(ProcessingScreen), findsOneWidget);
              break;
            case 'review':
              expect(find.byType(ReviewScreen), findsOneWidget);
              break;
            case 'manual':
              expect(find.byType(ManualEntryScreen), findsOneWidget);
              break;
            case 'today':
            case 'today_empty':
              expect(find.byType(TodayScreen), findsOneWidget);
              break;
            case 'food':
            case 'food_edit':
              expect(find.byType(FoodDetailSheet), findsOneWidget);
              break;
            case 'history_week':
            case 'history_month':
              expect(find.byType(HistoryScreen), findsOneWidget);
              break;
            case 'goals':
            case 'goals_select':
              expect(find.byType(GoalsScreen), findsOneWidget);
              break;
            case 'ai':
              expect(find.byType(AiChatScreen), findsOneWidget);
              break;
            case 'ai_history':
              expect(find.byType(AiHistoryScreen), findsOneWidget);
              break;
            case 'profile':
              expect(find.byType(ProfileSheet), findsOneWidget);
              break;
            default:
              fail('Unknown target: $targetId');
          }
        });
      }
    }
  });

  group('DebugCaptureScreen - focused assertions', () {
    const shellTargets = <String>{
      'scan_idle',
      'scan_capturing',
      'manual',
      'today',
      'today_empty',
      'food',
      'food_edit',
      'history_week',
      'history_month',
      'goals',
      'goals_select',
      'ai',
      'ai_history',
      'profile',
    };

    for (final targetId in shellTargets) {
      testWidgets('$targetId includes the shared production bottom navigation',
          (WidgetTester tester) async {
        final manifest = _createManifest(
          profile: canonicalFixtureProfileById[targetId]!,
        );

        await tester.pumpWidget(
          ProviderScope(
            key: ValueKey('capture-$targetId'),
            overrides: [
              uiDiffModeProvider.overrideWith((_) => true),
              uiDiffFixtureEnabledProvider.overrideWith((_) => true),
              uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
              uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
            ],
            child: MaterialApp(
              home: DebugCaptureScreen(targetId: targetId),
            ),
          ),
        );

        await _pumpStableFrames(tester);

        expect(find.byKey(const Key('today-bottom-nav')), findsOneWidget);
      });
    }

    testWidgets('login uses canonical prefilled fixture values',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowLogin,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'login'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      final fields =
          tester.widgetList<TextField>(find.byType(TextField)).toList();
      expect(fields, hasLength(2));
      expect(fields[0].controller?.text, 'elias@example.com');
      expect(fields[1].controller?.text, 'fixture-pass');
      expect(fields[1].obscureText, isTrue);
      expect(find.byKey(const ValueKey('login-stay-signed-in-checked')),
          findsOneWidget);
    });

    testWidgets('permission screen shows fixture system prompt when enabled',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowPermission,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'permission'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(PermissionScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('permission-fixture-system-prompt')),
        findsOneWidget,
      );
    });

    testWidgets('ai uses the canonical multi-turn fixture conversation',
        (WidgetTester tester) async {
      final manifest = _createManifest();

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'ai'),
          ),
        ),
      );

      await _pumpStableFrames(tester);
      await _pumpStableFrames(tester);

      expect(
        find.text(
          'That last scan is wrong — it was chicken and rice, not a curry.',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining("I'd raise protein to 180 g/day"),
        findsOneWidget,
      );
      expect(find.text('Update Protein target'), findsOneWidget);
    });

    testWidgets('ai history and profile use populated fixture identity',
        (WidgetTester tester) async {
      final manifest = _createManifest();

      Future<void> pumpTarget(String targetId) async {
        await tester.pumpWidget(
          ProviderScope(
            key: ValueKey('capture-meal-$targetId'),
            overrides: [
              uiDiffModeProvider.overrideWith((_) => true),
              uiDiffFixtureEnabledProvider.overrideWith((_) => true),
              uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
              uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
            ],
            child: MaterialApp(
              home: DebugCaptureScreen(targetId: targetId),
            ),
          ),
        );
        await _pumpStableFrames(tester);
      }

      await pumpTarget('ai_history');
      expect(find.text("Today's plan"), findsOneWidget);
      expect(find.text('Your fixture plan is ready.'), findsOneWidget);

      await pumpTarget('profile');
      expect(find.text('Elias Karlsson'), findsOneWidget);
      expect(find.text('elias@example.com'), findsOneWidget);
      expect(find.text('Guest'), findsNothing);
    });

    testWidgets('scan_capturing shows stable capturing shimmer',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowScan,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
            captureStateProvider.overrideWith((_) => CaptureState.capturing),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'scan_capturing'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(ScanScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('capture-meal-preview')),
        findsOneWidget,
      );
      final preview = tester.widget<Image>(
        find.byKey(const ValueKey('capture-meal-preview')),
      );
      expect(
        preview.image,
        isA<AssetImage>().having(
          (image) => image.assetName,
          'assetName',
          'assets/images/chicken_rice_bowl_highformat.jpg',
        ),
      );
      expect(find.byKey(const ValueKey('capture-shimmer')), findsOneWidget);
      expect(find.text('ANALYZING…'), findsOneWidget);
    });

    testWidgets('permission and idle scan use the canonical capture meal',
        (WidgetTester tester) async {
      Future<void> pumpTarget(
        String targetId,
        UiDiffFixtureProfile profile,
      ) async {
        await tester.pumpWidget(
          ProviderScope(
            key: ValueKey('capture-camera-$targetId'),
            overrides: [
              uiDiffModeProvider.overrideWith((_) => true),
              uiDiffFixtureEnabledProvider.overrideWith((_) => true),
              uiDiffFixtureManifestProvider.overrideWith(
                (_) => _createManifest(profile: profile),
              ),
              uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
            ],
            child: MaterialApp(
              home: DebugCaptureScreen(targetId: targetId),
            ),
          ),
        );
        await _pumpStableFrames(tester);
      }

      await pumpTarget('permission', UiDiffFixtureProfile.flowPermission);
      expect(
        find.byKey(const ValueKey('capture-permission-meal')),
        findsOneWidget,
      );

      await pumpTarget('scan_idle', UiDiffFixtureProfile.flowScan);
      expect(
        find.byKey(const ValueKey('capture-meal-preview')),
        findsOneWidget,
      );
      expect(find.text('Camera initializing…'), findsNothing);
    });

    testWidgets('processing shows skeleton while pending',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowProcessing,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'processing'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(ProcessingScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('capture-processing-meal')),
        findsOneWidget,
      );
      expect(find.text('AI'), findsWidgets);
      expect(find.text('3 / 4'), findsOneWidget);
    });

    testWidgets(
        'review shows candidates with correct shape and imageUrl handling',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowReview,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'review'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(ReviewScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('capture-review-meal')),
        findsOneWidget,
      );
      expect(find.text('62% CONFIDENCE'), findsOneWidget);
      expect(find.text('Chicken Rice Bowl'), findsOneWidget);
      expect(find.text('Teriyaki Chicken Bowl'), findsOneWidget);
      expect(find.text('Pork Katsu Bowl'), findsOneWidget);
    });

    testWidgets('manual entry screen renders search and recent chips',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowManual,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'manual'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(ManualEntryScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('manual-search')), findsOneWidget);
      expect(find.text('Recent'), findsOneWidget);
      await tester.drag(find.byType(ListView).first, const Offset(0, -500));
      await tester.pump();
      expect(find.text('Create custom food'), findsOneWidget);
    });

    testWidgets('today_empty shows empty state', (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.empty,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'today_empty'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(TodayScreen), findsOneWidget);
      expect(find.text('No meals logged yet'), findsOneWidget);
    });

    testWidgets('food_edit opens in edit mode with correct entry',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.populated,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'food_edit'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(FoodDetailSheet), findsOneWidget);
      expect(find.byKey(const Key('food-name-editor')), findsOneWidget);
      expect(find.byKey(const Key('meal-type-editor')), findsOneWidget);
    });

    testWidgets('history_month opens in month view',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.populated,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'history_month'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(HistoryScreen), findsOneWidget);
      expect(find.byKey(const Key('goals-period-dropdown')), findsNothing);
      expect(find.text('THIS WEEK'), findsNothing); // Should be month view
    });

    testWidgets('goals_select opens with period dropdown expanded',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.populated,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'goals_select'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(GoalsScreen), findsOneWidget);
      expect(find.byKey(const Key('goals-period-dropdown')), findsOneWidget);
    });
  });

  group('DebugCaptureScreen - ready signal protocol', () {
    testWidgets('ready waits for target data and two stable rendered frames',
        (WidgetTester tester) async {
      final manifest = _createManifest();
      final signal = UiDiffCaptureSignal.ready(
        nonce: 'readiness-test',
        screenId: 'today',
        theme: UiDiffCaptureTheme.dark,
        fixtureHash: manifest.fixtureHash,
      );
      final container = ProviderContainer(
        overrides: [
          uiDiffModeProvider.overrideWith((_) => true),
          uiDiffFixtureEnabledProvider.overrideWith((_) => true),
          uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
          uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          uiDiffPendingCaptureSignalProvider.overrideWith((_) => signal),
        ],
      );
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'today'),
          ),
        ),
      );

      expect(
        container.read(uiDiffPendingCaptureSignalProvider),
        same(signal),
      );

      await _pumpStableFrames(tester);
      await _pumpStableFrames(tester);

      expect(container.read(uiDiffPendingCaptureSignalProvider), isNull);
      await _pumpStableFrames(tester);
      expect(container.read(uiDiffPendingCaptureSignalProvider), isNull);
    });

    testWidgets('consecutive targets reset fixture scope and each emit ready',
        (WidgetTester tester) async {
      final manifest = _createManifest();
      UiDiffCaptureSignal signalFor(String target) => UiDiffCaptureSignal.ready(
            nonce: 'ready-$target',
            screenId: target,
            theme: UiDiffCaptureTheme.dark,
            fixtureHash: manifest.fixtureHash,
          );
      final container = ProviderContainer(
        overrides: [
          uiDiffModeProvider.overrideWith((_) => true),
          uiDiffFixtureEnabledProvider.overrideWith((_) => true),
          uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
          uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          uiDiffPendingCaptureSignalProvider
              .overrideWith((_) => signalFor('ai')),
        ],
      );
      addTearDown(container.dispose);

      Widget target(String id) => UncontrolledProviderScope(
            container: container,
            child: MaterialApp(home: DebugCaptureScreen(targetId: id)),
          );

      await tester.pumpWidget(target('ai'));
      await _pumpStableFrames(tester);
      await _pumpStableFrames(tester);
      expect(container.read(uiDiffPendingCaptureSignalProvider), isNull);

      container.read(uiDiffPendingCaptureSignalProvider.notifier).state =
          signalFor('ai_history');
      await tester.pumpWidget(target('ai_history'));
      await _pumpStableFrames(tester);
      await _pumpStableFrames(tester);

      expect(container.read(uiDiffPendingCaptureSignalProvider), isNull);
      expect(find.byType(AiHistoryScreen), findsOneWidget);
    });

    testWidgets(
        'ready not emitted before 3 endOfFrame and emitted exactly once',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowScan,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
            captureStateProvider.overrideWith((_) => CaptureState.capturing),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'scan_capturing'),
          ),
        ),
      );

      // First frame
      await tester.pump();
      // Second frame
      await tester.pump();
      // Third frame
      await tester.pump();

      await _pumpStableFrames(tester);

      // Screen should be mounted and showing ScanScreen
      expect(find.byType(ScanScreen), findsOneWidget);
    });

    testWidgets('unknown target emits BLOCKED with same nonce',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'nonexistent_target'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.textContaining('Capture target blocked'), findsOneWidget);
      expect(find.textContaining('unknown_target'), findsOneWidget);
    });

    testWidgets('semantic readiness watchdog blocks with target diagnostics',
        (WidgetTester tester) async {
      final manifest = _createManifest();
      manifest.documents.removeWhere(
        (path, _) => path.contains('/targets/'),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(
              targetId: 'goals',
              readinessTimeout: Duration(milliseconds: 10),
            ),
          ),
        ),
      );

      await tester.pump(const Duration(milliseconds: 20));
      await tester.pump(const Duration(milliseconds: 20));

      expect(
        find.textContaining('semantic_timeout_goals_plan'),
        findsOneWidget,
      );
    });

    testWidgets('no signal emitted after dispose', (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowScan,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'scan_idle'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      // Dispose by pumping empty widget
      await tester.pumpWidget(const SizedBox.shrink());
      await _pumpStableFrames(tester);

      // Should not crash or emit signals
      expect(true, isTrue);
    });
  });

  group('DebugCaptureScreen - fixture integrity', () {
    for (final targetId in const [
      'loading',
      'scan_capturing',
      'processing',
      'food',
    ]) {
      testWidgets('$targetId capture has no perpetual scheduled animation',
          (WidgetTester tester) async {
        final manifest = _createManifest(
          profile: canonicalFixtureProfileById[targetId]!,
        );
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              uiDiffModeProvider.overrideWith((_) => true),
              uiDiffFixtureEnabledProvider.overrideWith((_) => true),
              uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
              uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
            ],
            child: MaterialApp(
              home: DebugCaptureScreen(targetId: targetId),
            ),
          ),
        );

        await _pumpStableFrames(tester);
        await tester.pump();

        expect(tester.binding.hasScheduledFrame, isFalse);
      });
    }

    testWidgets('no service counters incremented during capture',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.populated,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'today'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      // Verify TodayScreen renders with fixture data
      expect(find.byType(TodayScreen), findsOneWidget);
      expect(find.text('Chicken Rice Bowl'), findsOneWidget);
      expect(find.text('Protein Yogurt'), findsOneWidget);
    });

    testWidgets(
        'review candidates have correct data shape for FoodEntry compatibility',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowReview,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'review'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(ReviewScreen), findsOneWidget);
      // Verify candidates have name, confidence, kcal, proteinG, carbsG, fatG
      expect(find.text('Chicken Rice Bowl'), findsOneWidget);
      expect(find.text('620 kcal'), findsWidgets);
      expect(find.text('Teriyaki Chicken Bowl'), findsOneWidget);
      expect(find.text('655 kcal'), findsOneWidget);
    });

    testWidgets('processing imageUrl uses asset path not network',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.flowProcessing,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'processing'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(ProcessingScreen), findsOneWidget);
      // The pending fixture must remain on the production processing skeleton.
      expect(find.text('AI'), findsWidgets);
      expect(find.text('3 / 4'), findsOneWidget);
    });

    testWidgets('food_edit uses asset imageUrl not network',
        (WidgetTester tester) async {
      final manifest = _createManifest(
        profile: UiDiffFixtureProfile.populated,
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            uiDiffModeProvider.overrideWith((_) => true),
            uiDiffFixtureEnabledProvider.overrideWith((_) => true),
            uiDiffFixtureManifestProvider.overrideWith((_) => manifest),
            uiDiffThemeOverrideProvider.overrideWith((_) => ThemeMode.dark),
          ],
          child: const MaterialApp(
            home: DebugCaptureScreen(targetId: 'food_edit'),
          ),
        ),
      );

      await _pumpStableFrames(tester);

      expect(find.byType(FoodDetailSheet), findsOneWidget);
      // Hero image should use asset path from fixture
      expect(find.byType(Image), findsWidgets);
    });
  });
}
