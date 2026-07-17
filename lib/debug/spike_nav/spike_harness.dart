import 'package:flutter/material.dart';

/// A single tab page in the spike navigation harness.
class SpikeHarnessTab extends StatelessWidget {
  const SpikeHarnessTab({
    super.key,
    required this.index,
    this.tabController,
  });

  final int index;

  /// Optional external [TabController]; if null a local one is created.
  final TabController? tabController;

  @override
  Widget build(BuildContext context) {
    return _TabBody(index: index, tabController: tabController);
  }
}

/// Builds the 5 tabs for the spike harness.
List<Widget> buildSpikeTabs({TabController? controller}) {
  return List.generate(
    5,
    (i) => SpikeHarnessTab(
      key: ValueKey('tab-body-$i'),
      index: i,
      tabController: controller,
    ),
  );
}

class _TabBody extends StatefulWidget {
  const _TabBody({required this.index, this.tabController});

  final int index;
  final TabController? tabController;

  @override
  State<_TabBody> createState() => _TabBodyState();
}

class _TabBodyState extends State<_TabBody> with AutomaticKeepAliveClientMixin {
  // ── keep-alive ──────────────────────────────────────────────────────
  @override
  bool get wantKeepAlive => true;

  // ── controllers (created once, kept alive) ──────────────────────────
  late final SliderController _sliderController;
  late final ScrollController _hScrollController;
  late final ScrollController _vScrollController;
  late final TextEditingController _textController;

  @override
  void initState() {
    super.initState();
    _sliderController = SliderController();
    _hScrollController = ScrollController();
    _vScrollController = ScrollController();
    _textController = TextEditingController();
  }

  @override
  void dispose() {
    _sliderController.dispose();
    _hScrollController.dispose();
    _vScrollController.dispose();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // required by AutomaticKeepAliveClientMixin

    if (widget.index == 0) return _buildInteractiveTab(context);
    return _buildPlainTab();
  }

  // ── Tab 0: interactive controls ─────────────────────────────────────
  Widget _buildInteractiveTab(BuildContext context) {
    return Column(
      children: [
        // Slider
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Slider(
            value: _sliderController.value,
            onChanged: (v) => setState(() => _sliderController.value = v),
          ),
        ),

        // Horizontal scrollable list
        SizedBox(
          height: 120,
          child: ListView.builder(
            key: const Key('h-list'),
            controller: _hScrollController,
            scrollDirection: Axis.horizontal,
            itemCount: 60,
            itemBuilder: (_, i) => SizedBox(
              width: 100,
              child: Center(
                child: Text(
                  'H$i',
                  style: const TextStyle(fontSize: 24),
                ),
              ),
            ),
          ),
        ),

        // Vertical scrollable list (fills remaining space)
        Expanded(
          child: ListView.builder(
            key: const Key('v-list'),
            controller: _vScrollController,
            itemCount: 80,
            itemBuilder: (_, i) => ListTile(
              title: Text('Row $i'),
            ),
          ),
        ),

        // Text field pinned at bottom
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            key: const Key('text-field'),
            controller: _textController,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: 'Type here',
            ),
          ),
        ),
      ],
    );
  }

  // ── Tabs 1-4: plain noninteractive surface ──────────────────────────
  Widget _buildPlainTab() {
    final colors = <Color>[
      Colors.blueGrey.shade100,
      Colors.teal.shade100,
      Colors.amber.shade100,
      Colors.purple.shade100,
    ];

    return Container(
      color: colors[widget.index.clamp(0, colors.length - 1)],
      alignment: Alignment.center,
      child: Text(
        'Tab ${widget.index}',
        style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w500),
      ),
    );
  }
}

/// Simple holder for the slider value so the controller is keep-alive safe.
class SliderController extends ChangeNotifier {
  SliderController({double value = 0.5}) : _value = value;

  double _value;
  double get value => _value;
  set value(double v) {
    if (_value != v) {
      _value = v;
      notifyListeners();
    }
  }
}
