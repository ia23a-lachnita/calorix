import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

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
  const _Mark();
  @override
  Widget build(BuildContext context) => Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: AppColors.brandGradient),
          borderRadius: BorderRadius.circular(13),
        ),
        child:
            const Icon(Icons.auto_awesome, color: Color(0xFF0B0D10), size: 20),
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

/// Static loading presentation for a caller that has real work to await.
/// It does not start work, change routes, or imply cloud synchronization.
class PilotLoadingScreen extends StatelessWidget {
  const PilotLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const _Mark(),
              const SizedBox(height: 18),
              Text(
                'Ravlo',
                style: Theme.of(
                  context,
                )
                    .textTheme
                    .headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 16),
              const _Eyebrow('GETTING READY'),
              const SizedBox(height: 18),
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ],
          ),
        ),
      );
}
