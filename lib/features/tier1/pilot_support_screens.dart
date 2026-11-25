import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dart:math' as math;

import '../../core/theme/app_colors.dart';
import 'local_meal.dart';

/// Local-pilot companion to the handoff's AI screen. No model is invoked here.
class PilotAiScreen extends StatelessWidget {
  const PilotAiScreen({
    super.key,
    required this.meals,
    required this.onScan,
    required this.onOpenMeal,
  });
  final List<Tier1Meal> meals;
  final VoidCallback onScan;
  final ValueChanged<Tier1Meal> onOpenMeal;

  @override
  Widget build(BuildContext context) => Material(
        color: Theme.of(context).scaffoldBackgroundColor,
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            children: [
              Row(
                children: [
                  const _Mark(),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Ravlo AI',
                          style:
                              Theme.of(context).textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                        ),
                        const _Eyebrow('YOUR MEAL COMPANION'),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Correction history',
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => PilotCorrectionHistoryScreen(
                          meals: meals,
                          onOpenMeal: onOpenMeal,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.history),
                  ),
                ],
              ),
              const SizedBox(height: 36),
              _Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Review your meals',
                      style:
                          Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Scan a meal, then review its foods and portions. You can edit a saved meal whenever you need to.',
                    ),
                    const SizedBox(height: 12),
                    const Text(
                        'Natural-language corrections are coming later.'),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: onScan,
                      icon: const Icon(Icons.center_focus_weak),
                      label: const Text('Scan a meal'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _Card(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.history),
                  title: const Text('Correction history'),
                  subtitle: const Text('Review changes to your saved meals'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => PilotCorrectionHistoryScreen(
                        meals: meals,
                        onOpenMeal: onOpenMeal,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

class PilotCorrectionHistoryScreen extends StatelessWidget {
  const PilotCorrectionHistoryScreen({
    super.key,
    required this.meals,
    required this.onOpenMeal,
  });
  final List<Tier1Meal> meals;
  final ValueChanged<Tier1Meal> onOpenMeal;

  @override
  Widget build(BuildContext context) {
    final entries = <(Tier1Meal, Map<String, dynamic>)>[];
    for (final meal in meals) {
      for (final event in meal.adjustmentHistory) {
        if (const {
          'portion',
          'food',
          'manual_totals',
          'rename',
          'preparation_answer',
        }.contains(event['kind'])) {
          entries.add((meal, event));
        }
      }
    }
    entries.sort(
      (a, b) =>
          (b.$2['at'] as String? ?? '').compareTo(a.$2['at'] as String? ?? ''),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Correction history')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const _Eyebrow('SAVED ON THIS DEVICE'),
            const SizedBox(height: 12),
            if (entries.isEmpty)
              const _Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'No corrections yet',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text('Changes you make to saved meals will appear here.'),
                  ],
                ),
              )
            else
              ...entries.map((entry) {
                final when = DateTime.tryParse(
                  entry.$2['at'] as String? ?? '',
                )?.toLocal();
                final kind = switch (entry.$2['kind']) {
                  'portion' => 'Portion changed',
                  'food' => 'Food changed',
                  'manual_totals' => 'Totals edited',
                  'rename' => 'Meal renamed',
                  'preparation_answer' => 'Preparation updated',
                  _ => 'Meal changed',
                };
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _Card(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        entry.$1.name,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        when == null
                            ? kind
                            : '$kind · ${DateFormat.yMMMd().add_Hm().format(when)}',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () {
                        Navigator.of(context).pop();
                        onOpenMeal(entry.$1);
                      },
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

class PilotProfileScreen extends StatelessWidget {
  const PilotProfileScreen({
    super.key,
    required this.themeMode,
    required this.onThemeChanged,
    this.onGoals,
    this.meals = const [],
  });
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeChanged;
  final VoidCallback? onGoals;
  final List<Tier1Meal> meals;

  @override
  Widget build(BuildContext context) {
    final days = meals
        .map((m) {
          final local = DateTime.fromMillisecondsSinceEpoch(
              m.capturedAt.millisecondsSinceEpoch);
          return (local.year, local.month, local.day);
        })
        .toSet()
        .length;
    final corrections = meals.fold<int>(
      0,
      (n, m) =>
          n +
          m.adjustmentHistory
              .where(
                (e) => const {
                  'portion',
                  'food',
                  'manual_totals',
                  'rename',
                  'preparation_answer',
                }.contains(e['kind']),
              )
              .length,
    );
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(centerTitle: true, title: const _Eyebrow('ACCOUNT')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            _Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.cyan, width: 3),
                        ),
                        child: const Icon(Icons.person_outline, size: 34),
                      ),
                      const SizedBox(width: 16),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Local profile',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(height: 4),
                            Text('Your meals are stored on this device.'),
                            SizedBox(height: 8),
                            _Eyebrow('LOCAL PILOT'),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: _ProfileMetric(
                          label: 'LOGGED DAYS',
                          value: '$days',
                          color: AppColors.green,
                          dark: dark,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _ProfileMetric(
                          label: 'MEALS',
                          value: '${meals.length}',
                          color: AppColors.cyan,
                          dark: dark,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _ProfileMetric(
                          label: 'CORRECTIONS',
                          value: '$corrections',
                          color: AppColors.blue,
                          dark: dark,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const _Eyebrow('PREFERENCES'),
            const SizedBox(height: 10),
            if (onGoals != null) ...[
              _Card(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.flag_outlined),
                  title: const Text(
                    'Goals & macros',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: onGoals,
                ),
              ),
              const SizedBox(height: 10),
            ],
            _Card(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.brightness_6_outlined),
                      SizedBox(width: 12),
                      Text(
                        'Appearance',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: SegmentedButton<ThemeMode>(
                      showSelectedIcon: false,
                      segments: const [
                        ButtonSegment(
                          value: ThemeMode.system,
                          label: Text('System'),
                        ),
                        ButtonSegment(
                          value: ThemeMode.light,
                          label: Text('Light'),
                        ),
                        ButtonSegment(
                          value: ThemeMode.dark,
                          label: Text('Dark'),
                        ),
                      ],
                      selected: {themeMode},
                      onSelectionChanged: (value) =>
                          onThemeChanged(value.first),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const _Eyebrow('ACCOUNT'),
            const SizedBox(height: 10),
            _Card(
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.person_outline),
                title: const Text(
                  'Account options',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: const Text(
                  'Sign-in and meal sync are not available in this pilot.',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const PilotAccountWelcomeScreen(),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileMetric extends StatelessWidget {
  const _ProfileMetric({
    required this.label,
    required this.value,
    required this.color,
    required this.dark,
  });
  final String label, value;
  final Color color;
  final bool dark;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: dark ? AppColors.backgroundDark : AppColors.backgroundLight,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: dark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration:
                      BoxDecoration(color: color, shape: BoxShape.circle),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'GeistMono',
                      fontSize: 8,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      );
}

/// Account welcome for the local pilot; it never starts authentication.
class PilotAccountWelcomeScreen extends StatelessWidget {
  const PilotAccountWelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Align(alignment: Alignment.centerLeft, child: _Mark()),
              const SizedBox(height: 36),
              const _Eyebrow('WELCOME TO RAVLO'),
              const SizedBox(height: 10),
              Text(
                'Your meals, on this device.',
                style: Theme.of(
                  context,
                )
                    .textTheme
                    .headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 14),
              const Text('Keep tracking locally with no account required.'),
              const SizedBox(height: 28),
              const _Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.person_outline),
                    SizedBox(height: 12),
                    Text(
                      'Account sign-in',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Sign-in is not available in this pilot. Meals do not sync between devices.',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Continue locally'),
                ),
              ),
            ],
          ),
        ),
      );
}

/// Informational only; the native permission request remains owned by Scan.
class PilotPermissionExplanation extends StatelessWidget {
  const PilotPermissionExplanation({super.key, required this.onContinue});
  final VoidCallback onContinue;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Camera access')),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Expanded(
                  child: Center(
                    child: Container(
                      width: 220,
                      height: 220,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(32),
                        border: Border.all(color: AppColors.cyan, width: 2),
                      ),
                      child: const Center(
                        child: Icon(
                          Icons.center_focus_weak,
                          size: 72,
                          color: AppColors.cyan,
                        ),
                      ),
                    ),
                  ),
                ),
                _Card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Camera access is off',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Camera access lets you photograph a meal. You can also choose a photo or enter a meal manually.',
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: onContinue,
                          child: const Text('Continue'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
        text,
        style: TextStyle(
          fontFamily: 'GeistMono',
          fontSize: 10,
          letterSpacing: 1.2,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      );
}

class _Mark extends StatelessWidget {
  const _Mark({this.size = 42});
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: AppColors.brandGradient),
          borderRadius: BorderRadius.circular(size * 0.30),
        ),
        child: Icon(Icons.auto_awesome,
            color: const Color(0xFF0B0D10), size: size * 0.48),
      );
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).brightness == Brightness.dark
              ? AppColors.surfaceRaisedDark
              : AppColors.surfaceRaisedLight,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Theme.of(context).brightness == Brightness.dark
                ? AppColors.borderDark
                : AppColors.borderLight,
          ),
        ),
        child: child,
      );
}

/// Local startup gate. The animated artwork is decorative; the screen remains
/// visible only while the caller's actual local initialization is in progress.
class PilotLoadingScreen extends StatefulWidget {
  const PilotLoadingScreen({super.key});

  @override
  State<PilotLoadingScreen> createState() => _PilotLoadingScreenState();
}

class _PilotLoadingScreenState extends State<PilotLoadingScreen>
    with TickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );
  late final AnimationController _halo = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );
  late final AnimationController _dot = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );
  bool? _reducedMotion;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    if (_reducedMotion == reducedMotion) return;
    _reducedMotion = reducedMotion;
    if (reducedMotion) {
      _spin
        ..stop()
        ..value = 0;
      _halo
        ..stop()
        ..value = 0.5;
      _dot
        ..stop()
        ..value = 1;
    } else {
      _spin.repeat();
      _halo.repeat(reverse: true);
      _dot.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    _halo.dispose();
    _dot.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final text = dark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;
    final muted =
        dark ? AppColors.textTertiaryDark : AppColors.textSecondaryLight;
    final reducedMotion = MediaQuery.disableAnimationsOf(context);

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.center,
                radius: 1.1,
                colors: dark
                    ? const [Color(0xFF0F1319), Color(0xFF0A0D11)]
                    : const [Color(0xFFF7F5F0), Color(0xFFECE9E3)],
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.4, -0.56),
                  radius: 0.9,
                  colors: [
                    AppColors.blue.withValues(alpha: dark ? 0.22 : 0.18),
                    Colors.transparent,
                  ],
                  stops: const [0, 0.65],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0.6, 0.56),
                  radius: 0.9,
                  colors: [
                    (dark ? AppColors.green : AppColors.cyan)
                        .withValues(alpha: dark ? 0.18 : 0.16),
                    Colors.transparent,
                  ],
                  stops: const [0, 0.65],
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: CustomPaint(painter: _LoadingDotMeshPainter(dark: dark)),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.fromLTRB(9, 6, 12, 6),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      color: dark
                          ? Colors.white.withValues(alpha: 0.05)
                          : Colors.white.withValues(alpha: 0.72),
                      border: Border.all(
                        color: dark
                            ? Colors.white.withValues(alpha: 0.10)
                            : const Color(0xFF0B0D10).withValues(alpha: 0.07),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppColors.green,
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.green.withValues(alpha: 0.2),
                                spreadRadius: 3,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            'LOCAL · ON THIS DEVICE',
                            softWrap: true,
                            style: TextStyle(
                              fontFamily: 'GeistMono',
                              fontSize: 10.5,
                              letterSpacing: 1.4,
                              color: muted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(flex: 2),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        key: const ValueKey('pilot-loading-ring'),
                        width: 196,
                        height: 196,
                        child: Stack(
                          children: [
                            AnimatedBuilder(
                              animation: _halo,
                              builder: (context, _) => Transform.scale(
                                scale: 1 + 0.06 * _halo.value,
                                child: Opacity(
                                  opacity: 0.65 + 0.30 * _halo.value,
                                  child: const DecoratedBox(
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      gradient: RadialGradient(
                                        colors: [
                                          Color(0x6619D3D9),
                                          Colors.transparent,
                                        ],
                                        stops: [0, 0.7],
                                      ),
                                    ),
                                    child: SizedBox.expand(),
                                  ),
                                ),
                              ),
                            ),
                            AnimatedBuilder(
                              animation: _spin,
                              builder: (context, _) => CustomPaint(
                                size: const Size.square(196),
                                painter: _LoadingRingPainter(
                                  dark: dark,
                                  rotation: reducedMotion
                                      ? 0
                                      : _spin.value * 2 * math.pi,
                                ),
                              ),
                            ),
                            Positioned.fill(
                              child: Padding(
                                padding: const EdgeInsets.all(30),
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: dark
                                        ? const Color(0xFF0E1217)
                                        : AppColors.surfaceRaisedLight,
                                    border: Border.all(
                                      color: dark
                                          ? Colors.white.withValues(alpha: 0.10)
                                          : const Color(0xFF0B0D10)
                                              .withValues(alpha: 0.06),
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: dark
                                            ? Colors.black
                                                .withValues(alpha: 0.45)
                                            : const Color(0xFF0B0D10)
                                                .withValues(alpha: 0.10),
                                        offset: const Offset(0, 18),
                                        blurRadius: 40,
                                      ),
                                    ],
                                  ),
                                  child: const Center(child: _Mark(size: 68)),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 28),
                      Text(
                        'Ravlo',
                        style: Theme.of(context)
                            .textTheme
                            .headlineMedium
                            ?.copyWith(
                                fontWeight: FontWeight.w700, color: text),
                      ),
                      const SizedBox(height: 10),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          'SNAP · TRACK · STAY ON TARGET',
                          style: TextStyle(
                            fontFamily: 'GeistMono',
                            fontSize: 10.5,
                            letterSpacing: 2.3,
                            color: muted,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const Spacer(flex: 2),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          AnimatedBuilder(
                            animation: _dot,
                            builder: (context, _) => Opacity(
                              opacity: 0.6 + 0.4 * _dot.value,
                              child: Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: AppColors.cyan,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'GETTING READY',
                            style: TextStyle(
                              fontFamily: 'GeistMono',
                              fontSize: 10.5,
                              letterSpacing: 1.7,
                              color: text,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Semantics(
                        label: 'Loading local history',
                        liveRegion: true,
                        child: SizedBox(
                          height: 4,
                          child: _IndeterminateLoadingLine(
                            animation: _spin,
                            reducedMotion: reducedMotion,
                            dark: dark,
                          ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'LOCAL DATA · ON THIS DEVICE',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: 'GeistMono',
                          fontSize: 9.5,
                          letterSpacing: 1.2,
                          color: muted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IndeterminateLoadingLine extends StatelessWidget {
  const _IndeterminateLoadingLine({
    required this.animation,
    required this.reducedMotion,
    required this.dark,
  });
  final Animation<double> animation;
  final bool reducedMotion;
  final bool dark;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final track = dark
              ? Colors.white.withValues(alpha: 0.06)
              : const Color(0xFF0B0D10).withValues(alpha: 0.07);
          return ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: Stack(
              children: [
                Positioned.fill(child: ColoredBox(color: track)),
                AnimatedBuilder(
                  animation: animation,
                  builder: (context, _) {
                    const segmentFraction = 0.28;
                    final left = reducedMotion
                        ? (width - width * segmentFraction) / 2
                        : (width + width * segmentFraction) * animation.value -
                            width * segmentFraction;
                    return Positioned(
                      left: left,
                      width: width * segmentFraction,
                      top: 0,
                      bottom: 0,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: AppColors.brandGradient,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          );
        },
      );
}

class _LoadingDotMeshPainter extends CustomPainter {
  const _LoadingDotMeshPainter({required this.dark});
  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final color = dark ? Colors.white : const Color(0xFF0B0D10);
    final paint = Paint()..color = color;
    for (double y = 0; y < size.height; y += 14) {
      for (double x = 0; x < size.width; x += 14) {
        final dx = (x - size.width / 2) / size.width;
        final dy = (y - size.height / 2) / size.height;
        final distance = math.sqrt(dx * dx + dy * dy);
        final fade = (1 - ((distance - 0.3) / 0.45).clamp(0, 1)) * 0.13;
        paint.color = color.withValues(alpha: fade);
        canvas.drawCircle(Offset(x + 1, y + 1), 1.1, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_LoadingDotMeshPainter oldDelegate) =>
      oldDelegate.dark != dark;
}

class _LoadingRingPainter extends CustomPainter {
  const _LoadingRingPainter({required this.dark, required this.rotation});
  final bool dark;
  final double rotation;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = (dark ? Colors.white : const Color(0xFF0B0D10))
          .withValues(alpha: 0.10);
    canvas.drawCircle(center, 84, track);

    final ticks = Paint()
      ..style = PaintingStyle.stroke
      ..color = (dark ? Colors.white : const Color(0xFF0B0D10))
          .withValues(alpha: 0.18);
    for (var index = 0; index < 60; index++) {
      final angle = index * math.pi * 2 / 60;
      final inner = index % 5 == 0 ? 64.0 : 67.0;
      const outer = 70.0;
      canvas.drawLine(
        center + Offset(math.cos(angle) * inner, math.sin(angle) * inner),
        center + Offset(math.cos(angle) * outer, math.sin(angle) * outer),
        ticks..strokeWidth = index % 5 == 0 ? 1 : 0.5,
      );
    }

    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(rotation);
    final arcRect = Rect.fromCircle(center: Offset.zero, radius: 84);
    final arcPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..shader = const SweepGradient(
        colors: AppColors.brandGradient,
      ).createShader(arcRect);
    canvas.drawArc(arcRect, -math.pi / 2, math.pi * 0.56, false, arcPaint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_LoadingRingPainter oldDelegate) =>
      oldDelegate.dark != dark || oldDelegate.rotation != rotation;
}
