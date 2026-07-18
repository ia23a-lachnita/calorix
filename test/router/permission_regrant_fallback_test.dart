import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/core/router/route_fallback.dart';

void main() {
  testWidgets(
    'popOrGo falls back to the given path when a direct/deep-linked '
    'route has nothing to pop',
    (tester) async {
      final router = GoRouter(
        initialLocation: '/permission',
        routes: [
          GoRoute(
            path: '/permission',
            builder: (context, state) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  key: const Key('fallback-trigger'),
                  onPressed: () => popOrGo(context, '/scan'),
                  child: const Text('Regrant'),
                ),
              ),
            ),
          ),
          GoRoute(
            path: '/scan',
            builder: (context, state) => const Scaffold(
              body: Center(child: Text('Scan', key: Key('scan-fallback-page'))),
            ),
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('fallback-trigger')));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('scan-fallback-page')), findsOneWidget);
    },
  );

  testWidgets(
    'popOrGo pops instead of navigating away when a parent route exists',
    (tester) async {
      final router = GoRouter(
        initialLocation: '/origin',
        routes: [
          GoRoute(
            path: '/origin',
            builder: (context, state) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  key: const Key('push-permission'),
                  onPressed: () => context.push('/permission'),
                  child: const Text('Open permission'),
                ),
              ),
            ),
          ),
          GoRoute(
            path: '/permission',
            builder: (context, state) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  key: const Key('fallback-trigger'),
                  onPressed: () => popOrGo(context, '/scan'),
                  child: const Text('Regrant'),
                ),
              ),
            ),
          ),
          GoRoute(
            path: '/scan',
            builder: (context, state) => const Scaffold(
              body: Center(child: Text('Scan', key: Key('scan-fallback-page'))),
            ),
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('push-permission')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('fallback-trigger')), findsOneWidget);

      await tester.tap(find.byKey(const Key('fallback-trigger')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('push-permission')), findsOneWidget);
      expect(find.byKey(const Key('scan-fallback-page')), findsNothing);
    },
  );
}
