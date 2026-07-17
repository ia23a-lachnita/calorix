import 'package:flutter/material.dart';

import 'spike_harness.dart';

void main() => runApp(
      const MaterialApp(
        debugShowCheckedModeBanner: false,
        home: SpikeShellA(),
      ),
    );

class SpikeShellA extends StatefulWidget {
  const SpikeShellA({super.key});

  @override
  State<SpikeShellA> createState() => _SpikeShellAState();
}

class _SpikeShellAState extends State<SpikeShellA> {
  late final PageController _pageController;
  late final List<Widget> _tabs;
  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _tabs = buildSpikeTabs();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PageView(
        controller: _pageController,
        physics: const PageScrollPhysics(),
        children: _tabs,
      ),
    );
  }
}
