import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class TabSwipeShell extends StatefulWidget {
  const TabSwipeShell({
    super.key,
    required this.shell,
    required this.children,
  });

  final StatefulNavigationShell shell;
  final List<Widget> children;

  @override
  State<TabSwipeShell> createState() => _TabSwipeShellState();
}

class _TabSwipeShellState extends State<TabSwipeShell> {
  late final PageController _controller;
  int _currentIndex = 0;
  bool _suppressPageCallback = false;

  @override
  void initState() {
    super.initState();
    assert(widget.children.isNotEmpty);
    _currentIndex = widget.shell.currentIndex;
    assert(_currentIndex >= 0 && _currentIndex < widget.children.length);
    _controller = PageController(initialPage: _currentIndex);
  }

  @override
  void didUpdateWidget(covariant TabSwipeShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    final target = widget.shell.currentIndex;
    if (target == _currentIndex) return;
    if (target < 0 || target >= widget.children.length) return;

    final distance = (target - _currentIndex).abs();
    _suppressPageCallback = true;
    if (distance == 1) {
      _controller
          .animateToPage(
            target,
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOut,
          )
          .whenComplete(_clearSuppression)
          .catchError((_) => _clearSuppression());
    } else {
      _controller.jumpToPage(target);
      _clearSuppression();
    }
    _currentIndex = target;
  }

  void _clearSuppression() {
    if (!mounted) return;
    _suppressPageCallback = false;
  }

  void _onPageChanged(int index) {
    if (_suppressPageCallback) return;
    if (index == _currentIndex) return;
    _currentIndex = index;
    widget.shell.goBranch(index);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PageView.builder(
      controller: _controller,
      physics: const PageScrollPhysics(),
      itemCount: widget.children.length,
      onPageChanged: _onPageChanged,
      itemBuilder: (context, index) => _KeepAliveWrapper(
        key: ValueKey('tab-swipe-keepalive-$index'),
        child: widget.children[index],
      ),
    );
  }
}

class _KeepAliveWrapper extends StatefulWidget {
  const _KeepAliveWrapper({super.key, required this.child});

  final Widget child;

  @override
  State<_KeepAliveWrapper> createState() => _KeepAliveWrapperState();
}

class _KeepAliveWrapperState extends State<_KeepAliveWrapper>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}
