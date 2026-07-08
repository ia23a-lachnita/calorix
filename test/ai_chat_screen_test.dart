import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/core/theme/app_theme.dart';
import 'package:calorix/features/ai_chat/ai_chat_screen.dart';
import 'package:calorix/features/ai_chat/providers/ai_chat_providers.dart';
import 'package:calorix/features/today/providers/today_providers.dart';
import 'package:calorix/shared/providers/auth_provider.dart';
import 'package:calorix/shared/services/ai_chat_service.dart';

class _StubAiChatService implements AiChatService {
  _StubAiChatService(this.handler);
  final Future<String> Function(String message) handler;

  @override
  Future<String> sendMessage({
    required String message,
    required List<AiChatTurn> history,
    required Map<String, Object?> plan,
    required Map<String, Object?> consumed,
  }) =>
      handler(message);
}

Widget _app(AiChatService service) {
  return ProviderScope(
    overrides: [
      aiChatServiceProvider.overrideWithValue(service),
      authStateProvider.overrideWith((ref) => const Stream<User?>.empty()),
      todayMacroSummaryProvider.overrideWithValue(
        (kcal: 845.0, protein: 52.0, carbs: 90.0, fat: 32.0),
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.dark,
      home: const AiChatScreen(),
    ),
  );
}

Future<void> _send(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.tap(find.byIcon(Icons.arrow_upward));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('backend failures surface friendly copy, never raw errors',
      (tester) async {
    await tester.pumpWidget(_app(
      _StubAiChatService((_) async => throw Exception('boom-internal-detail')),
    ));
    await tester.pump();

    await _send(tester, 'hello');

    expect(
      find.textContaining("I couldn't reach the assistant just now"),
      findsOneWidget,
    );
    expect(find.textContaining('boom-internal-detail'), findsNothing);
    expect(find.textContaining('Exception'), findsNothing);
  });

  testWidgets('assistant markdown renders bold instead of leaking asterisks',
      (tester) async {
    await tester.pumpWidget(_app(
      _StubAiChatService(
          (_) async => 'Raise protein to **190 g** today.\n* keep carbs'),
    ));
    await tester.pump();

    await _send(tester, 'bump my protein');

    expect(find.textContaining('**'), findsNothing);
    expect(find.textContaining('190 g'), findsOneWidget);
    // Bullet markers are normalized to a typographic bullet.
    expect(find.textContaining('• keep carbs'), findsOneWidget);
  });

  testWidgets('no api-key placeholder remains in the chat flow',
      (tester) async {
    await tester.pumpWidget(_app(_StubAiChatService((_) async => 'Done.')));
    await tester.pump();

    await _send(tester, 'hello');

    expect(find.textContaining('GEMINI_API_KEY'), findsNothing);
    expect(find.textContaining('not configured'), findsNothing);
    expect(find.text('Done.'), findsOneWidget);
  });
}
