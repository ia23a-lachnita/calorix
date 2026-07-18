import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:calorix/shell/tab_swipe_shell.dart';

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------

/// 5-tab router with a real [StatefulShellRoute] and
/// [navigatorContainerBuilder] that instantiates the production [TabSwipeShell].
GoRouter _buildRouter({
  Listenable? refreshListenable,
  List<StatefulShellBranch>? branches,
}) =>
    GoRouter(
      initialLocation: '/tab0',
      refreshListenable: refreshListenable,
      routes: [
        StatefulShellRoute(
          builder: (context, state, navigationShell) => navigationShell,
          navigatorContainerBuilder:
              (context, navigationShell, children) => TabSwipeShell(
            shell: navigationShell,
            children: children,
          ),
          branches: branches ?? _defaultBranches(),
        ),
      ],
    );

/// The five default branch routes /tab0 … /tab4.
List<StatefulShellBranch> _defaultBranches() => List.generate(
      5,
      (i) => StatefulShellBranch(
        routes: [
          GoRoute(
            path: '/tab$i',
            builder: (_, __) =>
                i == 0 ? const _Tab0Page() : _BranchPage(index: i),
          ),
        ],
      ),
    );

/// Minimal labelled branch page used for branches 1-4.
class _BranchPage extends StatelessWidget {
  const _BranchPage({required this.index});
  final int index;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Text(
          'tab-$index-body',
          key: Key('tab-$index-label'),
        ),
      ),
    );
  }
}

/// Tab-0 page with keyed non-interactive swipe surface/body, a [Slider], a
/// horizontal [ListView], vertical scrolling content, a [TextField], and row
/// markers — all hit-testable so offstage / kept-alive widgets cannot satisfy
/// visible assertions.
class _Tab0Page extends StatefulWidget {
  const _Tab0Page({this.onInit});
  final ValueChanged<_Tab0PageState>? onInit;

  @override
  State<_Tab0Page> createState() => _Tab0PageState();
}

class _Tab0PageState extends State<_Tab0Page> {
  double sliderValue = 0.3;
  final textController = TextEditingController();
  final scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onInit?.call(this);
    });
  }

  @override
  void dispose() {
    textController.dispose();
    scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        key: const Key('tab0-swipe-surface'),
        children: [
          Container(
            key: const Key('tab0-body'),
            height: 120,
            color: Colors.grey.shade200,
            alignment: Alignment.center,
            child: const Text('tab-0-body'),
          ),
          SizedBox(
            height: 60,
            child: Slider(
              key: const Key('tab0-slider'),
              value: sliderValue,
              onChanged: (v) => setState(() => sliderValue = v),
            ),
          ),
          SizedBox(
            height: 100,
            child: ListView.builder(
              key: const Key('tab0-h-list'),
              scrollDirection: Axis.horizontal,
              itemCount: 40,
              itemBuilder: (_, i) => SizedBox(
                width: 100,
                child: Center(child: Text('H$i')),
              ),
            ),
          ),
          Expanded(
            child: ListView(
              key: const Key('tab0-v-list'),
              controller: scrollController,
              children: List.generate(
                50,
                (i) => Container(
                  key: Key('row-marker-$i'),
                  height: 48,
                  alignment: Alignment.centerLeft,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text('Row $i'),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: TextField(
              key: const Key('tab0-text-field'),
              controller: textController,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: 'Type here',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Convenience wrapper that pumps the shell into the widget tree.
Future<GoRouter> _pumpShell(
  WidgetTester tester, {
  Listenable? refreshListenable,
}) async {
  final router = _buildRouter(refreshListenable: refreshListenable);
  await tester.pumpWidget(MaterialApp.router(routerConfig: router));
  await tester.pumpAndSettle();
  return router;
}

/// Find the [PageView] managed by [TabSwipeShell].
Finder _pageView() => find.byType(PageView).hitTestable();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  // ── 1. Slider drag does not change active tab ──────────────────────────
  testWidgets('1 – slider drag does not change active tab', (tester) async {
    await _pumpShell(tester);

    expect(_pageView(), findsOneWidget);

    // Drag the slider 200 px right → should not switch tab.
    final slider = find.byKey(const Key('tab0-slider'));
    await tester.drag(slider, const Offset(200, 0));
    await tester.pumpAndSettle();

    // tab0-body must remain visible; tab-1 must not appear.
    expect(find.byKey(const Key('tab0-body')).hitTestable(), findsOneWidget);
    expect(find.byKey(const Key('tab-1-label')).hitTestable(), findsNothing);
  });

  // ── 2. Horizontal list drag does not change active tab ─────────────────
  testWidgets('2 – horizontal list drag does not change active tab',
      (tester) async {
    await _pumpShell(tester);

    final hList = find.byKey(const Key('tab0-h-list'));
    await tester.fling(hList, const Offset(-300, 0), 800);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('tab0-body')).hitTestable(), findsOneWidget);
    expect(find.byKey(const Key('tab-1-label')).hitTestable(), findsNothing);
  });

  // ── 3. Fling on non-interactive body changes to adjacent tab ──────────
  testWidgets('3 – fling on non-interactive body changes to adjacent tab',
      (tester) async {
    await _pumpShell(tester);

    // Fling left on the swipe body → should go to tab 1.
    await tester.fling(
      find.byKey(const Key('tab0-body')),
      const Offset(-400, 0),
      1000,
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('tab0-body')).hitTestable(), findsNothing);
    expect(find.byKey(const Key('tab-1-label')).hitTestable(), findsOneWidget);
  });

  // ── 4. 40px short horizontal drag settles back to origin ───────────────
  testWidgets('4 – 40px short horizontal drag settles back to origin',
      (tester) async {
    await _pumpShell(tester);

    await tester.drag(
      find.byKey(const Key('tab0-body')),
      const Offset(-40, 0),
    );
    await tester.pumpAndSettle();

    // Still on tab 0.
    expect(find.byKey(const Key('tab0-body')).hitTestable(), findsOneWidget);
    expect(find.byKey(const Key('tab-1-label')).hitTestable(), findsNothing);
  });

  // ── 5. Vertical scroll offset and TextField text survive swipe ─────────
  testWidgets(
      '5 – vertical scroll offset and TextField text survive swipe away/back',
      (tester) async {
    _Tab0PageState? state;
    await _pumpShell(tester);

    final page0 = find.byType(_Tab0Page);
    state = tester.state<_Tab0PageState>(page0);

    // Scroll the vertical list to offset ~480.
    final scrollFinder = find.byKey(const Key('tab0-v-list'));
    await tester.drag(scrollFinder, const Offset(0, -480));
    await tester.pumpAndSettle();
    final savedOffset = state.scrollController.offset;
    expect(savedOffset, greaterThan(0));

    // Type into the text field.
    await tester.enterText(find.byKey(const Key('tab0-text-field')), 'hello');
    await tester.pumpAndSettle();
    final savedText = state.textController.text;
    expect(savedText, 'hello');

    // Swipe to tab 1.
    await tester.fling(
      find.byKey(const Key('tab0-body')),
      const Offset(-400, 0),
      1000,
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('tab-1-label')).hitTestable(), findsOneWidget);

    // Swipe back to tab 0.
    await tester.fling(
      find.byKey(const Key('tab-1-label')),
      const Offset(400, 0),
      1000,
    );
    await tester.pumpAndSettle();

    state = tester.state<_Tab0PageState>(page0);
    expect(state.scrollController.offset, closeTo(savedOffset, 1.0));
    expect(state.textController.text, savedText);
  });

  // ── 6. Reverse fling mid-transition returns to origin ──────────────────
  testWidgets('6 – reverse fling mid-transition returns to origin',
      (tester) async {
    await _pumpShell(tester);

    // Start a left fling on the body, then immediately fling right before
    // the first transition settles.
    await tester.fling(
      find.byKey(const Key('tab0-body')),
      const Offset(-400, 0),
      1000,
    );
    // Pump a few frames to begin the transition but not settle.
    await tester.pump();
    await tester.pump();
    await tester.pump();

    // Reverse fling back to the right.
    await tester.flingFrom(
      const Offset(400, 300),
      const Offset(300, 0),
      1000,
    );
    await tester.pumpAndSettle();

    // Should have returned to tab 0.
    expect(find.byKey(const Key('tab0-body')).hitTestable(), findsOneWidget);
    expect(find.byKey(const Key('tab-1-label')).hitTestable(), findsNothing);
  });

  // ── 7. External navigation synchronises PageView to /tab4 ──────────────
  testWidgets(
      '7 – external router.go synchronises PageView to tab4 without feedback loop',
      (tester) async {
    int routeUpdateCount = 0;
    final router = _buildRouter();

    // Listen for route location changes; each unique location push counts as
    // one update.  A feedback loop would inflate this count.
    router.routerDelegate.addListener(() {
      routeUpdateCount++;
    });

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    final initialCount = routeUpdateCount;

    // External navigation via the router API.
    router.go('/tab4');
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('tab-4-label')).hitTestable(), findsOneWidget);
    expect(find.byKey(const Key('tab0-body')).hitTestable(), findsNothing);

    // After the single external go(), only one or two delegate notifications
    // are expected (the initial push + possibly one settle).  A feedback loop
    // would cause many more.
    expect(
      routeUpdateCount - initialCount,
      lessThanOrEqualTo(2),
      reason: 'External navigation should not produce a feedback loop',
    );
  });

  // ── 8. Tab-0 state survives non-adjacent tab0→tab4→tab0 navigation ────
  testWidgets(
      '8 – tab-0 state survives non-adjacent external tab0→tab4→tab0 navigation',
      (tester) async {
    _Tab0PageState? state;
    final router = _buildRouter();

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();

    final page0 = find.byType(_Tab0Page);
    state = tester.state<_Tab0PageState>(page0);

    // Set up state.
    await tester.enterText(find.byKey(const Key('tab0-text-field')), 'persist');
    await tester.drag(
      find.byKey(const Key('tab0-v-list')),
      const Offset(0, -480),
    );
    await tester.pumpAndSettle();

    state = tester.state<_Tab0PageState>(page0);
    final savedText = state.textController.text;
    final savedOffset = state.scrollController.offset;
    expect(savedText, 'persist');
    expect(savedOffset, greaterThan(0));

    // Jump to tab4 (non-adjacent).
    router.go('/tab4');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('tab-4-label')).hitTestable(), findsOneWidget);

    // Jump back to tab0.
    router.go('/tab0');
    await tester.pumpAndSettle();

    state = tester.state<_Tab0PageState>(page0);
    expect(state.textController.text, savedText);
    expect(state.scrollController.offset, closeTo(savedOffset, 1.0));
  });
}
