import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/clock.dart';
import '../../shared/services/camera_service.dart';
import '../../shared/widgets/macro_ring.dart';
import 'local_meal.dart';
import 'manual_nutrient_catalog.dart';
import 'motion.dart';
import 'food_selection_dialog.dart';
import 'local_meal_store.dart';
import 'targets.dart';
import 'tier1_cloud.dart';
import 'workflow_measurements.dart';
import 'workflow_export.dart';

// Presentation only: the original model doubles remain the saved values.
String _displayNutrient(double? value) {
  if (value == null) return '';
  if (value == 0) return '0';
  if (value > 0 && value < .01) return value.toStringAsPrecision(2);
  return value
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

double? _numberFromField(TextEditingController controller, double? original) {
  final text = controller.text.trim();
  if (text == _displayNutrient(original)) return original;
  return text.isEmpty ? null : double.tryParse(text);
}

/// Focused local-first workflow. Legacy Firebase services are never mounted here.
class Tier1App extends StatelessWidget {
  const Tier1App(
      {super.key,
      this.store,
      this.camera,
      this.cloud,
      this.initializeCloud,
      this.clock,
      this.workflow,
      this.elapsedMilliseconds});
  final Tier1MealStore? store;
  final Clock? clock;
  final CameraService? camera;
  final Tier1Cloud? cloud;
  final Future<void> Function()? initializeCloud;
  final WorkflowSink? workflow;
  final int Function()? elapsedMilliseconds;
  @override
  Widget build(BuildContext context) => MaterialApp(
      title: AppConstants.appDisplayName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: _Tier1Home(
          store: store,
          camera: camera,
          clock: clock ?? RealClock(),
          workflow: workflow,
          elapsedMilliseconds: elapsedMilliseconds,
          cloud: cloud ??
              (initializeCloud == null
                  ? null
                  : FirebaseTier1Cloud(initializeCloud!))));
}

class _Tier1Home extends StatefulWidget {
  const _Tier1Home(
      {this.store,
      this.camera,
      this.cloud,
      this.workflow,
      this.elapsedMilliseconds,
      required this.clock});
  final Tier1MealStore? store;
  final Clock clock;
  final CameraService? camera;
  final Tier1Cloud? cloud;
  final WorkflowSink? workflow;
  final int Function()? elapsedMilliseconds;
  @override
  State<_Tier1Home> createState() => _Tier1HomeState();
}

class _Tier1HomeState extends State<_Tier1Home> with WidgetsBindingObserver {
  late final CameraService _camera = widget.camera ?? DeviceCameraService();
  Tier1MealStore? _store;
  WorkflowSink? _workflow;
  late final _elapsed = Stopwatch()..start();
  int _ticks() =>
      widget.elapsedMilliseconds?.call() ?? _elapsed.elapsedMilliseconds;
  List<Tier1Meal> _meals = [];
  String? _error, _cameraWarning;
  // 0 Today, 1 Scan (the landing screen), 2 History.
  int _tab = 1;
  bool _busy = false;
  bool get _history => _tab == 2;
  Tier1TargetStore _targetStore = Tier1TargetStore();
  Tier1Targets _targets = Tier1Targets.defaults;
  int _lifecycleEpoch = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    try {
      if (widget.store == null) {
        final root = '${(await getApplicationDocumentsDirectory()).path}/tier1';
        _store = Tier1MealStore(Directory(root));
        _targetStore = Tier1TargetStore(File('$root/targets.json'));
      } else {
        _store = widget.store;
      }
      _targets = await _targetStore.load();
      // Injected stores opt into a sink; do not write into a fake test root.
      _workflow = widget.workflow ??
          (widget.store == null
              ? StoreWorkflowSink(_store!)
              : const NoopWorkflowSink());
      await _refresh();
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Could not open local history. Existing files were preserved.');
      }
      return;
    }
    try {
      if (_camera is CameraLifecycleService) {
        await (_camera as CameraLifecycleService).resume();
      }
      if (mounted) setState(() => _cameraWarning = null);
    } catch (_) {
      if (mounted) {
        setState(() =>
            _cameraWarning = 'Camera unavailable. Manual entry still works.');
      }
    }
  }

  Future<void> _refresh() async {
    final records = await _store!.load();
    records.sort((a, b) => b.capturedAt.compareTo(a.capturedAt));
    if (mounted) setState(() => _meals = records);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _lifecycleEpoch++;
    if (_camera is! CameraLifecycleService) return;
    final lifecycle = _camera as CameraLifecycleService;
    if (state == AppLifecycleState.resumed) {
      unawaited(lifecycle.resume().then((_) {
        if (mounted) setState(() => _cameraWarning = null);
      }).catchError((_) {
        if (mounted) {
          setState(() =>
              _cameraWarning = 'Camera unavailable. Manual entry still works.');
        }
      }));
    } else {
      unawaited(lifecycle.pause());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (_camera is CameraLifecycleService) {
      unawaited((_camera as CameraLifecycleService).dispose());
    }
    super.dispose();
  }

  Future<void> _open(Tier1Meal meal,
      {int? captureTick,
      bool startEstimate = false,
      bool Function()? allowInitialEstimate}) async {
    if (_store == null || _error != null) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => _MealEditor(
            meal: meal,
            store: _store!,
            cloud: widget.cloud,
            clock: widget.clock,
            workflow: _workflow!,
            elapsedMilliseconds: _ticks,
            captureTick: captureTick,
            startEstimate: startEstimate,
            allowInitialEstimate: allowInitialEstimate)));
    if (!mounted) return;
    try {
      await _refresh();
      if (mounted) {
        // Back to where the result shows: a meal of today lands on Today,
        // where the ring takes it in; anything else on History. A meal
        // opened from a list returns to that list.
        final today = _todayMeals.any((m) => m.id == meal.id);
        setState(() => _tab = _tab == 1 ? (today ? 0 : 2) : _tab);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Could not refresh local history. Reopen the app to check saved values.');
      }
    }
  }

  Future<void> _capture() async {
    if (_busy || _store == null || _error != null) return;
    setState(() => _busy = true);
    String? ownedCapture;
    try {
      if (!await _camera.hasPermission()) {
        final permission = await _camera.requestPermission();
        if (permission != CameraPermissionRequestResult.granted) {
          throw StateError('Camera permission needed');
        }
      }
      final shutter = widget.clock.now();
      final shutterTick = _ticks();
      final offerEpoch = _lifecycleEpoch;
      final state = WidgetsBinding.instance.lifecycleState;
      final startedForeground =
          state == null || state == AppLifecycleState.resumed;
      final file = await _camera.captureStill();
      if (file == null) return;
      ownedCapture = file.path;
      final bytes = await file.readAsBytes();
      if (bytes.length > 30 * 1024 * 1024 ||
          bytes.length < 8 ||
          bytes[0] != 255 ||
          bytes[1] != 216) {
        throw const FormatException('JPEG capture required');
      }
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      final width = frame.image.width, height = frame.image.height;
      frame.image.dispose();
      codec.dispose();
      final device =
          _camera is DeviceCameraService ? _camera.previewController : null;
      final id = const Uuid().v4();
      final path = await _store!.retainCapture(id, file.path);
      final meal = Tier1Meal(
          id: id,
          capturedAt: shutter,
          name: 'New meal',
          photoPath: path,
          source: 'photo',
          metadata: {
            'capturedAt': shutter.toUtc().toIso8601String(),
            'width': width,
            'height': height,
            'jpegBytes': bytes.length,
            'cameraId': device?.description.name,
            'lensDirection': device?.description.lensDirection.name,
            'sensorOrientation': device?.description.sensorOrientation,
            'deviceOrientation': device?.value.deviceOrientation.name,
            'focusMode': device?.value.focusMode.name,
            'exposureMode': device?.value.exposureMode.name,
            'focalLength': null,
            'intrinsics': null,
            'zoom': null,
            'gpsRequested': false,
            'qualityWarnings': width < 640 || height < 640
                ? ['Low resolution; consider retaking']
                : [],
          });
      try {
        await _store!.save(meal);
      } catch (_) {
        await File(path).delete();
        rethrow;
      }
      final saved = (await _store!.load()).firstWhere((m) => m.id == id);
      if (mounted) {
        await _open(saved,
            captureTick: shutterTick,
            startEstimate: true,
            allowInitialEstimate: () =>
                mounted && startedForeground && _lifecycleEpoch == offerEpoch);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Photo could not be saved. Retake or use manual entry.')));
      }
    } finally {
      if (ownedCapture != null) {
        try {
          final temporary = File(ownedCapture);
          if (await temporary.exists()) await temporary.delete();
        } catch (_) {/* No unrelated cache cleanup. */}
      }
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _cameraView() {
    final controller =
        _camera is DeviceCameraService ? _camera.previewController : null;
    return Stack(fit: StackFit.expand, children: [
      if (controller != null && controller.value.isInitialized)
        CameraPreview(controller)
      else
        Center(
            child: Text('One photo of your meal',
                style: Theme.of(context).textTheme.titleLarge)),
      Positioned(
          left: 20,
          right: 20,
          bottom: 24,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (_todayMeals.isNotEmpty) ...[
              TextButton(
                  onPressed: () => setState(() => _tab = 0),
                  child: Text(
                      'Today · ${_eatenKcal(_todayMeals)} kcal · ${_todayMeals.length} ${_todayMeals.length == 1 ? 'meal' : 'meals'}')),
              const SizedBox(height: 8),
            ],
            const Text(
                'Photos stay on this phone until you choose cloud analysis.',
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            Semantics(
                label: 'Take meal photo',
                button: true,
                // The one primary action of the screen: full width, thumb-sized.
                child: SizedBox(
                    width: double.infinity,
                    child: Pressable(
                        child: FilledButton.icon(
                            style: FilledButton.styleFrom(
                                minimumSize: const Size.fromHeight(56)),
                            onPressed: _busy ? null : _capture,
                            icon: const Icon(Icons.camera_alt_outlined),
                            label: Text(
                                _busy ? 'Saving photo…' : 'Take photo'))))),
          ])),
    ]);
  }

  /// Device-local wall time. Through the epoch, not `toLocal()`: a clock may
  /// hand out a `TZDateTime`, whose `toLocal()` needs the timezone database.
  static DateTime _localTime(DateTime t) =>
      DateTime.fromMillisecondsSinceEpoch(t.millisecondsSinceEpoch);

  static DateTime _dayOf(DateTime t) {
    final local = _localTime(t);
    return DateTime(local.year, local.month, local.day);
  }

  List<Tier1Meal> get _todayMeals {
    final today = _dayOf(widget.clock.now());
    return _meals.where((m) => _dayOf(m.capturedAt) == today).toList();
  }

  String _dayLabel(DateTime day) {
    final days = _dayOf(widget.clock.now()).difference(day).inDays;
    if (days == 0) return 'Today';
    if (days == 1) return 'Yesterday';
    return MaterialLocalizations.of(context).formatMediumDate(day);
  }

  /// The day against its targets: the ring from the design, fed by what was
  /// logged today. Targets are the app defaults until Tier1 has a goals screen.
  Widget _todayView() {
    final theme = Theme.of(context), scheme = theme.colorScheme;
    final meals = _todayMeals;
    double sum(double? Function(Tier1Nutrients n) pick) =>
        meals.fold<double>(0, (total, m) {
          final served = m.served;
          if (served == null) return total;
          // The eaten share of each macro follows the eaten share of the meal.
          return total + (pick(served) ?? 0) * (m.consumedFraction ?? 1);
        });
    final kcal = _eatenKcal(meals);
    final target = _targets.kcal;
    final left = target - kcal;
    final macros = <(String, double, int, Color)>[
      ('Protein', sum((n) => n.proteinG), _targets.proteinG, AppColors.protein),
      ('Carbs', sum((n) => n.carbsG), _targets.carbsG, AppColors.carbs),
      ('Fat', sum((n) => n.fatG), _targets.fatG, AppColors.fat),
    ];
    return ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          Text('Today', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 16),
          Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: scheme.outline)),
              child: Column(children: [
                TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: Motion.of(context, Motion.ring),
                    curve: Motion.curve,
                    builder: (_, t, child) => MacroRing(
                        size: 208,
                        strokeWidth: 12,
                        showGlow: false,
                        proteinFraction: t * macros[0].$2 / macros[0].$3,
                        carbsFraction: t * macros[1].$2 / macros[1].$3,
                        fatFraction: t * macros[2].$2 / macros[2].$3,
                        center: child),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text('KCAL EATEN',
                          style: theme.textTheme.labelSmall?.copyWith(
                              letterSpacing: 1.6,
                              color: scheme.onSurfaceVariant)),
                      CountText(
                          value: kcal,
                          style: theme.textTheme.displaySmall
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      Text('of $target',
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      Text(left >= 0 ? '$left kcal left' : '${-left} kcal over',
                          style: theme.textTheme.labelMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                              color:
                                  left >= 0 ? AppColors.fat : AppColors.amber)),
                    ])),
                const SizedBox(height: 20),
                for (final (name, grams, goal, color) in macros)
                  Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Column(children: [
                        Row(children: [
                          Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                  color: color, shape: BoxShape.circle)),
                          const SizedBox(width: 8),
                          Expanded(
                              child: Text(name,
                                  style: theme.textTheme.titleSmall)),
                          Text('${grams.round()} / $goal g',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                  fontFeatures: const [
                                    ui.FontFeature.tabularFigures()
                                  ])),
                        ]),
                        const SizedBox(height: 6),
                        ClipRRect(
                            borderRadius: BorderRadius.circular(3),
                            child: TweenAnimationBuilder<double>(
                                tween: Tween(
                                    begin: 0,
                                    end: (grams / goal)
                                        .clamp(0.0, 1.0)
                                        .toDouble()),
                                duration: Motion.of(context, Motion.ring),
                                curve: Motion.curve,
                                builder: (_, v, __) => LinearProgressIndicator(
                                    value: v,
                                    minHeight: 6,
                                    color: color,
                                    backgroundColor: scheme.outline))),
                      ])),
              ])),
          Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                  onPressed: _editTargets,
                  icon: const Icon(Icons.tune, size: 18),
                  label: const Text('Change targets'))),
          if (meals.isEmpty)
            Text('Nothing logged today. Take a photo of your next meal.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: scheme.onSurfaceVariant))
          else
            for (final meal in meals)
              ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(meal.name),
                  subtitle: Text(_mealLine(meal)),
                  trailing: Text(
                      MaterialLocalizations.of(context).formatTimeOfDay(
                          TimeOfDay.fromDateTime(_localTime(meal.capturedAt))),
                      style: theme.textTheme.bodySmall),
                  onTap: _error != null ? null : () => _open(meal)),
        ]);
  }

  Future<void> _editTargets() async {
    final form = GlobalKey<FormState>();
    final fields = <String, TextEditingController>{
      'Calories (kcal)': TextEditingController(text: '${_targets.kcal}'),
      'Protein (g)': TextEditingController(text: '${_targets.proteinG}'),
      'Carbs (g)': TextEditingController(text: '${_targets.carbsG}'),
      'Fat (g)': TextEditingController(text: '${_targets.fatG}'),
    };
    final result = await showModalBottomSheet<Tier1Targets>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (sheet) => Padding(
            // the sheet rides above the keyboard
            padding: EdgeInsets.fromLTRB(
                20, 0, 20, 20 + MediaQuery.viewInsetsOf(sheet).bottom),
            child: Form(
                key: form,
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('Daily targets',
                          style: Theme.of(sheet).textTheme.titleLarge),
                      const SizedBox(height: 16),
                      for (final entry in fields.entries) ...[
                        TextFormField(
                            controller: entry.value,
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(labelText: entry.key),
                            validator: (text) {
                              final n = int.tryParse(text?.trim() ?? '');
                              final kcal = entry.key.startsWith('Calories');
                              final ok = n != null &&
                                  (kcal
                                      ? n >= 500 && n <= 10000
                                      : n >= 1 && n <= 2000);
                              return ok
                                  ? null
                                  : kcal
                                      ? 'Enter 500 to 10000'
                                      : 'Enter 1 to 2000';
                            }),
                        const SizedBox(height: 12),
                      ],
                      Pressable(
                          child: FilledButton(
                              onPressed: () {
                                if (!form.currentState!.validate()) {
                                  return;
                                }
                                final v = [
                                  for (final c in fields.values)
                                    int.parse(c.text.trim())
                                ];
                                Navigator.pop(
                                    sheet,
                                    Tier1Targets(
                                        kcal: v[0],
                                        proteinG: v[1],
                                        carbsG: v[2],
                                        fatG: v[3]));
                              },
                              child: const Text('Save targets'))),
                    ]))));
    if (result == null || !mounted) return;
    try {
      await _targetStore.save(result);
      if (mounted) setState(() => _targets = result);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Could not save the targets. Nothing changed.')));
      }
    }
  }

  /// Bottom navigation from the design: two plain tabs around the scan
  /// button with the brand gradient ring.
  Widget _nav() {
    final scheme = Theme.of(context).colorScheme;
    Widget tab(int index, IconData icon, String label) {
      final active = _tab == index;
      final color = active ? scheme.onSurface : scheme.onSurfaceVariant;
      return Expanded(
          child: InkWell(
              onTap: () => setState(() => _tab = index),
              child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(icon, color: color, size: 22),
                    const SizedBox(height: 4),
                    Text(label,
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight:
                                active ? FontWeight.w700 : FontWeight.w500,
                            color: color)),
                    const SizedBox(height: 4),
                    AnimatedContainer(
                        duration: Motion.of(context, Motion.fast),
                        width: 4,
                        height: 4,
                        decoration: BoxDecoration(
                            color:
                                active ? AppColors.carbs : Colors.transparent,
                            shape: BoxShape.circle)),
                  ]))));
    }

    return DecoratedBox(
        decoration: BoxDecoration(
            color: scheme.surface,
            border: Border(top: BorderSide(color: scheme.outline))),
        child: SafeArea(
            top: false,
            child: Row(children: [
              tab(0, Icons.wb_twilight_outlined, 'Today'),
              Pressable(
                  child: Semantics(
                      button: true,
                      label: 'Scan',
                      selected: _tab == 1,
                      child: GestureDetector(
                          // Anticipation: the first tap brings the camera, the
                          // next one on the same spot takes the photo.
                          onTap: () {
                            if (_tab != 1) {
                              setState(() => _tab = 1);
                            } else if (!_busy) {
                              _capture();
                            }
                          },
                          child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                        width: 56,
                                        height: 56,
                                        padding: const EdgeInsets.all(4),
                                        decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            gradient: SweepGradient(
                                                colors:
                                                    AppColors.sweepGradient)),
                                        child: DecoratedBox(
                                            decoration: BoxDecoration(
                                                color: scheme.surface,
                                                shape: BoxShape.circle),
                                            child: Icon(
                                                Icons.camera_alt_outlined,
                                                color: scheme.onSurface))),
                                    const SizedBox(height: 2),
                                    const ExcludeSemantics(
                                        child: Text('SCAN',
                                            style: TextStyle(
                                                fontSize: 9.5,
                                                letterSpacing: 1.6,
                                                fontWeight: FontWeight.w600))),
                                  ]))))),
              tab(2, Icons.history, 'History'),
            ])));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text(AppConstants.appDisplayName), actions: [
        if (_history)
          IconButton(
              tooltip: 'Export measurements',
              onPressed: _store == null || _error != null
                  ? null
                  : () => showWorkflowExport(context,
                      load: () => _workflow!.export(at: widget.clock.now())),
              icon: const Icon(Icons.download_outlined)),
        TextButton.icon(
            onPressed: _store == null || _error != null
                ? null
                : () => _open(Tier1Meal(
                    id: const Uuid().v4(),
                    capturedAt: widget.clock.now(),
                    name: 'New meal')),
            icon: const Icon(Icons.edit_outlined, size: 18),
            label: const Text('Manual entry'))
      ]),
      body: Column(children: [
        if (_error != null)
          Padding(padding: const EdgeInsets.all(16), child: Text(_error!)),
        if (_cameraWarning != null)
          Padding(
              padding: const EdgeInsets.all(16), child: Text(_cameraWarning!)),
        Expanded(
            child: _store == null
                ? const Center(child: CircularProgressIndicator())
                : AnimatedSwitcher(
                    duration: Motion.of(context, Motion.medium),
                    switchInCurve: Motion.curve,
                    child: KeyedSubtree(
                        key: ValueKey(_tab),
                        child: _tab == 0
                            ? _todayView()
                            : _history
                                ? (_meals.isEmpty
                                    ? const Center(
                                        child: Text(
                                            'No saved meals yet. Take a photo or enter a meal.'))
                                    : ListView.builder(
                                        itemCount: _meals.length,
                                        itemBuilder: (context, index) {
                                          final meal = _meals[index];
                                          final day = _dayOf(meal.capturedAt);
                                          final startsDay = index == 0 ||
                                              _dayOf(_meals[index - 1]
                                                      .capturedAt) !=
                                                  day;
                                          final tile = ListTile(
                                              leading: meal.photoPath == null
                                                  ? const Icon(Icons.restaurant)
                                                  : ClipRRect(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              12),
                                                      child: Image.file(
                                                          File(meal.photoPath!),
                                                          width: 56,
                                                          height: 56,
                                                          fit: BoxFit.cover,
                                                          errorBuilder: (_, __,
                                                                  ___) =>
                                                              const Icon(Icons
                                                                  .image_not_supported_outlined))),
                                              title: Text(meal.name),
                                              trailing: Text(
                                                  MaterialLocalizations.of(context)
                                                      .formatTimeOfDay(TimeOfDay.fromDateTime(_localTime(meal.capturedAt))),
                                                  style: Theme.of(context).textTheme.bodySmall),
                                              subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                                Text(_mealLine(meal)),
                                                if (meal.served != null)
                                                  _MacroLine(meal.served!),
                                              ]),
                                              isThreeLine: true,
                                              onTap: _error != null ? null : () => _open(meal));
                                          if (!startsDay) return tile;
                                          return Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.stretch,
                                              children: [
                                                _DayHeader(
                                                    label: _dayLabel(day),
                                                    meals: _meals
                                                        .where((m) =>
                                                            _dayOf(
                                                                m.capturedAt) ==
                                                            day)
                                                        .toList()),
                                                tile
                                              ]);
                                        }))
                                : _cameraView()))),
        _nav(),
      ]));
}

class _MealEditor extends StatefulWidget {
  const _MealEditor(
      {required this.meal,
      required this.store,
      this.cloud,
      required this.clock,
      required this.workflow,
      required this.elapsedMilliseconds,
      this.captureTick,
      this.startEstimate = false,
      this.allowInitialEstimate});
  final Tier1Meal meal;
  final Clock clock;
  final Tier1MealStore store;
  final Tier1Cloud? cloud;
  final WorkflowSink workflow;
  final int Function() elapsedMilliseconds;
  final int? captureTick;
  final bool startEstimate;
  final bool Function()? allowInitialEstimate;
  @override
  State<_MealEditor> createState() => _MealEditorState();
}

class _MealEditorState extends State<_MealEditor> with WidgetsBindingObserver {
  late Tier1Meal _meal = widget.meal;
  final _form = GlobalKey<FormState>();
  late final _name =
      TextEditingController(text: _meal.name == 'New meal' ? '' : _meal.name);
  late final _kcal =
      TextEditingController(text: _displayNutrient(_meal.served?.kcal));
  late final _protein =
      TextEditingController(text: _displayNutrient(_meal.served?.proteinG));
  late final _carbs =
      TextEditingController(text: _displayNutrient(_meal.served?.carbsG));
  late final _fat =
      TextEditingController(text: _displayNutrient(_meal.served?.fatG));
  bool _busy = false, _dirty = false, _editTotals = false;
  String? _message;
  late final _meter = WorkflowMeter(
      sessionId: const Uuid().v4(),
      elapsedMilliseconds: widget.elapsedMilliseconds);
  late bool _hasSaved = _meal.revision > 0;
  final _pendingEvents = <Map<String, dynamic>>[];
  bool _closed = false,
      _deleted = false,
      _exporting = false,
      _foreground = true,
      _frameWanted = false,
      _frameRecorded = false;
  bool _initialOfferConsumed = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _foreground = WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    _meter.setForeground(_foreground);
    _trace('editor_opened');
    if (_meal.hasPendingPreparationQuestion) _trace('preparation_available');
    if (widget.startEstimate) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_initialOfferConsumed) return;
        _initialOfferConsumed = true;
        final state = WidgetsBinding.instance.lifecycleState;
        if (!mounted ||
            !_foreground ||
            (state != null && state != AppLifecycleState.resumed) ||
            ModalRoute.of(context)?.isCurrent != true ||
            _busy ||
            _dirty ||
            widget.allowInitialEstimate?.call() != true) {
          return;
        }
        unawaited(_estimate());
      });
    }
  }

  void _send(List<Map<String, dynamic>> events) {
    unawaited(widget.workflow
        .append(_meal.id, events)
        .catchError((_) => widget.workflow.recordFailure()));
  }

  void _trace(String kind, [Map<String, dynamic> fields = const {}]) {
    if (_deleted) return;
    try {
      final event = _meter.event(kind,
          at: widget.clock.now(),
          fields: {if (_closed) 'afterNavigation': true, ...fields});
      if (_hasSaved) {
        _send([event]);
      } else {
        _pendingEvents.add(event);
      }
    } catch (_) {
      widget.workflow.recordFailure();
    }
  }

  int? _duration(int? start) {
    if (start == null || !_meter.timingValid) return null;
    final value = widget.elapsedMilliseconds() - start;
    return value < 0 || value > 365 * 24 * 60 * 60 * 1000 ? null : value;
  }

  int? _dialogDuration(int? start) {
    final end = _meter.foregroundExcludingWaitMs;
    return start == null || end == null || end < start ? null : end - start;
  }

  Map<String, dynamic> _modelFields(Map<String, dynamic>? analysis) {
    final p = analysis?['provenance'];
    if (p is! Map) return {};
    return {
      if (p['model'] is String &&
          RegExp(r'^gemini-[a-z0-9][a-z0-9.-]{0,79}$')
              .hasMatch(p['model'] as String))
        'model': p['model'],
      if (p['promptSha256'] is String &&
          RegExp(r'^[0-9a-f]{64}$').hasMatch(p['promptSha256'] as String))
        'promptSha256': p['promptSha256'],
    };
  }

  void _scheduleResultFrame() {
    if (!_frameWanted || _frameRecorded || !mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_foreground || _exporting || _frameRecorded) return;
      _frameRecorded = true;
      _frameWanted = false;
      _trace(
          'result_frame', {'shutterToFrameMs': _duration(widget.captureTick)});
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _meter.setForeground(_foreground && !_exporting);
    if (_foreground) _scheduleResultFrame();
  }

  Future<void> _export() async {
    _trace('export_opened');
    _exporting = true;
    _meter.setForeground(false);
    try {
      await showWorkflowExport(context,
          load: () =>
              widget.workflow.export(at: widget.clock.now(), mealId: _meal.id));
    } finally {
      _exporting = false;
      _meter.setForeground(_foreground);
      _trace('export_closed');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _meter.setForeground(false);
    _closed = true;
    _trace('editor_closed');
    _pendingEvents.clear();
    for (final c in [_name, _kcal, _protein, _carbs, _fat]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill() {
    _name.text = _meal.name;
    _kcal.text = _displayNutrient(_meal.served?.kcal);
    _protein.text = _displayNutrient(_meal.served?.proteinG);
    _carbs.text = _displayNutrient(_meal.served?.carbsG);
    _fat.text = _displayNutrient(_meal.served?.fatG);
  }

  Future<void> _persist(Tier1Meal meal) async {
    await widget.store.save(meal);
    _meal = (await widget.store.load()).firstWhere((m) => m.id == meal.id);
    _hasSaved = true;
    if (_pendingEvents.isNotEmpty) {
      final events = List<Map<String, dynamic>>.of(_pendingEvents);
      _pendingEvents.clear();
      _send(events);
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate() || _busy) return;
    try {
      final before = _meal.served?.kcal;
      await _persist(_meal.edit(
          _name.text,
          Tier1Nutrients(
              kcal: _numberFromField(_kcal, _meal.served?.kcal)!,
              proteinG: _numberFromField(_protein, _meal.served?.proteinG),
              carbsG: _numberFromField(_carbs, _meal.served?.carbsG),
              fatG: _numberFromField(_fat, _meal.served?.fatG)),
          at: widget.clock.now()));
      _trace('manual_saved',
          {'beforeKcal': before, 'afterKcal': _meal.served?.kcal});
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) {
        setState(
            () => _message = 'Could not save. Existing history was preserved.');
      }
    }
  }

  Future<void> _estimate() async {
    if (!mounted || _busy || _dirty || _meal.photoPath == null) return;
    final approved = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Send this photo for analysis?'),
                content: const Text(
                    'This photo will be sent to Google Cloud in the United States for an approximate food estimate. Photo metadata is removed before sending. Google may cache or retain requests under its service terms. The app keeps your meal and photo on this phone. You can continue with manual entry instead.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Keep local')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Send photo'))
                ]));
    if (approved != true || !mounted) return;
    final started = widget.elapsedMilliseconds();
    _meter.setWaiting(true);
    _trace('analysis_started');
    setState(() {
      _busy = true;
      _message = null;
    });
    var committed = false;
    try {
      await _persist(_meal.withConsent());
      final revision = _meal.revision;
      final cloud = widget.cloud;
      if (cloud == null) throw StateError('Cloud unavailable');
      final result = await cloud.analyze(_meal.photoPath!, consent: true);
      _trace('analysis_returned', {
        'clientAnalysisMs': _duration(started),
        'shutterToResponseMs': _duration(widget.captureTick)
      });
      final applied = await widget.store.replaceIfRevision(
          _meal.withAnalysis(result, at: widget.clock.now()), revision);
      committed = applied;
      _trace(applied ? 'analysis_saved' : 'analysis_discarded', {
        'clientAnalysisMs': _duration(started),
        'shutterToSavedMs': applied ? _duration(widget.captureTick) : null,
        if (applied) 'afterKcal': (result['totals'] as Map)['kcal'],
        if (applied)
          'questionProposed': result['question'] is Map &&
              (result['question'] as Map)['answered'] != true,
        ..._modelFields(result)
      });
      if (!mounted) return;
      if (applied) {
        _meal = (await widget.store.load()).firstWhere((m) => m.id == _meal.id);
        if (!mounted) return;
        _fill();
      }
      if (applied) {
        _frameWanted = true;
        if (_meal.hasPendingPreparationQuestion) {
          _trace('preparation_available');
        }
      }
      if (mounted) {
        setState(() => _message = applied
            ? 'Approximate estimate saved. Check the foods and portions.'
            : 'Your newer changes were kept; this result was discarded.');
      }
    } catch (_) {
      _trace(committed ? 'analysis_refresh_failed' : 'analysis_failed',
          {'clientAnalysisMs': _duration(started)});
      if (mounted) {
        setState(() => _message = committed
            ? 'Estimate saved, but could not refresh. Reopen the meal to check saved values.'
            : 'Photo analysis is unavailable. Your photo is saved on this phone. Enter or correct the meal below.');
      }
    } finally {
      _meter.setWaiting(false);
      if (mounted) {
        setState(() => _busy = false);
        _scheduleResultFrame();
      }
    }
  }

  Future<void> _consume(double? fraction) async {
    HapticFeedback.selectionClick();
    try {
      await _persist(fraction == null
          ? _meal.clearConsumption()
          : _meal.confirmConsumption(fraction));
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) setState(() => _message = 'Consumption could not be saved.');
    }
  }

  Future<void> _answer(String answer) async {
    if (_busy || _dirty) return;
    try {
      final before = _meal.served?.kcal;
      await _persist(_meal.answerPreparation(answer, at: widget.clock.now()));
      _trace('preparation_answered', {
        'answerCode': answer,
        'beforeKcal': before,
        'afterKcal': _meal.served?.kcal
      });
      _fill();
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'Could not save the preparation answer.');
      }
    }
  }

  Future<void> _portion(int index) async {
    if (_busy || _dirty || !_meal.canCorrectPortions) return;
    final opening = _meal, current = opening.componentMassG(index);
    final component = (opening.analysis!['components'] as List)[index] as Map;
    final original = (component['massG'] as num).toDouble();
    final dialogStarted = _meter.foregroundExcludingWaitMs;
    _trace('portion_opened', {'portionIndex': index, 'fromG': current});
    var gramsText = _displayNutrient(current), closed = false;
    var committed = false;
    int? dialogElapsed;
    int? measuredDialog() => _meter.timingValid ? dialogElapsed : null;
    final form = GlobalKey<FormState>();
    setState(() => _busy = true);
    try {
      final route = DialogRoute<double>(
          context: context,
          builder: (dialogContext) => AlertDialog(
                  scrollable: true,
                  title: Text('Portion: ${opening.componentName(index)}'),
                  content: Form(
                      key: form,
                      child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                'The photo estimate was ${_displayNutrient(original)} g. Enter 0 to leave this food out.'),
                            if (opening.foodOverrides.containsKey(index))
                              Text(
                                  'Original prediction: ${component['name']}. Current food uses your selected nutrient record.'),
                            if (opening.hasManualNutritionOverride)
                              const Padding(
                                  padding: EdgeInsets.symmetric(vertical: 8),
                                  child: Text(
                                      'Changing this portion replaces manual totals with a calculation from the listed foods.')),
                            const SizedBox(height: 16),
                            TextFormField(
                                initialValue: gramsText,
                                onChanged: (text) => gramsText = text,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                        decimal: true),
                                decoration: const InputDecoration(
                                    labelText: 'Portion (g)', errorMaxLines: 3),
                                validator: (text) {
                                  final n = double.tryParse(text?.trim() ?? '');
                                  return n == null ||
                                          !n.isFinite ||
                                          n < 0 ||
                                          n > 100000
                                      ? 'Enter a finite weight from 0 to 100000 g'
                                      : null;
                                }),
                            // In the content, not the action row: three
                            // buttons do not fit there and stack vertically.
                            TextButton.icon(
                                onPressed: () {
                                  if (closed) return;
                                  closed = true;
                                  Navigator.pop(dialogContext, original);
                                },
                                icon: const Icon(Icons.restore, size: 18),
                                label: const Text('Use original')),
                          ])),
                  actions: [
                    TextButton(
                        onPressed: () {
                          if (closed) return;
                          closed = true;
                          Navigator.pop(dialogContext);
                        },
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () {
                          if (closed) return;
                          if (!form.currentState!.validate()) {
                            _trace('portion_rejected', {'portionIndex': index});
                            FocusScope.of(dialogContext).unfocus();
                            return;
                          }
                          final grams =
                              gramsText.trim() == _displayNutrient(current)
                                  ? current
                                  : double.parse(gramsText.trim());
                          closed = true;
                          Navigator.pop(dialogContext, grams);
                        },
                        child: const Text('Apply portion')),
                  ]));
      final grams = await Navigator.of(context).push(route);
      // Wait for the form/keyboard overlay to leave before saving or popping.
      await route.completed;
      dialogElapsed = _dialogDuration(dialogStarted);
      if (grams == null) {
        _trace('portion_cancelled',
            {'portionIndex': index, 'dialogForegroundMs': measuredDialog()});
        return;
      }
      if (!mounted) return;
      final updated =
          opening.correctPortion(index, grams, at: widget.clock.now());
      if (identical(updated, opening)) {
        _trace('portion_unchanged', {
          'portionIndex': index,
          'fromG': current,
          'toG': grams,
          'dialogForegroundMs': measuredDialog()
        });
        return;
      }
      final applied =
          await widget.store.replaceIfRevision(updated, opening.revision);
      if (applied) {
        committed = true;
        _trace('portion_saved', {
          'portionIndex': index,
          'fromG': current,
          'toG': grams,
          'beforeKcal': opening.served?.kcal,
          'afterKcal': updated.served?.kcal,
          'dialogForegroundMs': measuredDialog(),
          'beforeFromOriginalAnalysis': opening.foodOverrides.isEmpty &&
              opening.portionOverrides.isEmpty &&
              !opening.hasManualNutritionOverride &&
              opening.served?.kcal ==
                  (opening.analysis!['totals'] as Map)['kcal'],
          'priorPortionAdjustmentCount': opening.adjustmentHistory
              .where((e) => e['kind'] == 'portion')
              .length,
          ..._modelFields(opening.analysis)
        });
      } else {
        _trace('portion_conflict',
            {'portionIndex': index, 'dialogForegroundMs': measuredDialog()});
      }
      if (!mounted) return;
      if (!applied) {
        final messenger = ScaffoldMessenger.of(context);
        Navigator.pop(context);
        messenger.showSnackBar(
            const SnackBar(content: Text('Meal changed; reopen it to edit.')));
        return;
      }
      _meal = (await widget.store.load()).firstWhere((m) => m.id == opening.id);
      if (!mounted) return;
      _fill();
      setState(() {
        _dirty = false;
        _message =
            'Portion saved. Check the totals; the eaten mark was cleared.';
      });
    } catch (_) {
      if (!committed) {
        _trace('portion_failed',
            {'portionIndex': index, 'dialogForegroundMs': measuredDialog()});
      }
      if (!mounted) return;
      if (committed) {
        final messenger = ScaffoldMessenger.of(context);
        Navigator.pop(context);
        messenger.showSnackBar(const SnackBar(
            content: Text(
                'Portion saved, but could not refresh. Reopen the meal to check saved values.')));
      } else {
        setState(() => _message =
            'Could not save this portion. Reopen the meal to check saved values.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _food(int index) async {
    if (_busy || _dirty || !_meal.canCorrectPortions) return;
    final opening = _meal;
    final dialogStarted = _meter.foregroundExcludingWaitMs;
    _trace('food_opened', {'portionIndex': index});
    int? dialogElapsed;
    int? measuredDialog() => _meter.timingValid ? dialogElapsed : null;
    var committed = false;
    setState(() => _busy = true);
    try {
      final question = opening.analysis?['question'];
      final extraOil = question is Map &&
          question['answered'] == true &&
          {'oil_5g', 'oil_10g', 'oil_15g'}.contains(question['answer']);
      final route = DialogRoute<ManualFoodSelection>(
          context: context,
          builder: (_) => FoodSelectionDialog(
              name: opening.componentName(index),
              grams: _displayNutrient(opening.componentMassG(index)),
              recordId: opening.foodOverrides[index],
              manualTotals: opening.hasManualNutritionOverride,
              extraOil: extraOil));
      final selected = await Navigator.of(context).push(route);
      await route.completed;
      dialogElapsed = _dialogDuration(dialogStarted);
      if (selected == null) {
        _trace('food_cancelled',
            {'portionIndex': index, 'dialogForegroundMs': measuredDialog()});
        return;
      }
      if (!mounted) return;
      final updated =
          opening.correctFood(index, selected.recordId, at: widget.clock.now());
      if (identical(updated, opening)) {
        _trace('food_unchanged',
            {'portionIndex': index, 'dialogForegroundMs': measuredDialog()});
        return;
      }
      final applied =
          await widget.store.replaceIfRevision(updated, opening.revision);
      if (applied) {
        committed = true;
        _trace('food_saved', {
          'portionIndex': index,
          'beforeKcal': opening.served?.kcal,
          'afterKcal': updated.served?.kcal,
          'dialogForegroundMs': measuredDialog()
        });
      } else {
        _trace('food_conflict',
            {'portionIndex': index, 'dialogForegroundMs': measuredDialog()});
      }
      if (!mounted) return;
      if (!applied) {
        final messenger = ScaffoldMessenger.of(context);
        Navigator.pop(context);
        messenger.showSnackBar(
            const SnackBar(content: Text('Meal changed; reopen it to edit.')));
        return;
      }
      _meal = (await widget.store.load()).firstWhere((m) => m.id == opening.id);
      if (!mounted) return;
      _fill();
      setState(() {
        _dirty = false;
        _message =
            'Food saved. Check the totals and portion; the eaten mark was cleared.';
      });
    } catch (_) {
      if (!committed) {
        _trace('food_failed',
            {'portionIndex': index, 'dialogForegroundMs': measuredDialog()});
      }
      if (!mounted) return;
      if (committed) {
        final messenger = ScaffoldMessenger.of(context);
        Navigator.pop(context);
        messenger.showSnackBar(const SnackBar(
            content: Text(
                'Food saved, but could not refresh. Reopen the meal to check saved values.')));
      } else {
        const message =
            'Could not save this food. Reopen the meal to check saved values.';
        setState(() => _message = message);
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _repeat() async {
    if (_busy || _dirty) return;
    setState(() => _busy = true);
    try {
      var multiplierText = '1';
      var closed = false;
      final route = DialogRoute<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
                  title: const Text('Log this meal again?'),
                  content: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text(
                        'Confirm the foods and recipe are the same. This repeats an estimate, not a weighed reference.'),
                    TextFormField(
                        initialValue: '1',
                        onChanged: (value) => multiplierText = value,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                            labelText: 'Portion multiplier'))
                  ]),
                  actions: [
                    TextButton(
                        onPressed: () {
                          if (closed) return;
                          closed = true;
                          Navigator.pop(dialogContext, false);
                        },
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () {
                          if (closed) return;
                          closed = true;
                          Navigator.pop(dialogContext, true);
                        },
                        child: const Text('Confirm repeat'))
                  ]));
      final confirmed = await Navigator.of(context).push(route);
      // A pop result precedes overlay removal. Do not pop the editor during it.
      await route.completed;
      if (confirmed != true || !mounted) return;
      final amount = double.tryParse(multiplierText);
      if (amount == null || !amount.isFinite || amount <= 0 || amount > 10) {
        setState(() =>
            _message = 'Choose a portion multiplier above 0 and at most 10.');
        return;
      }
      await widget.store
          .save(_meal.repeat(const Uuid().v4(), widget.clock.now(), amount));
      _trace('repeat_saved');
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) {
        setState(
            () => _message = 'Could not save the repeated meal. Try again.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Delete this meal and photo?'),
                content: const Text(
                    'This removes the saved local record and its photo. It cannot remove provider logs from a past analysis request.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Delete'))
                ]));
    if (confirmed != true) return;
    try {
      _deleted = true;
      _pendingEvents.clear();
      await widget.store.delete(_meal.id);
      if (mounted) Navigator.pop(context);
    } catch (_) {
      _deleted = false;
      if (mounted) {
        setState(() => _message =
            'Deletion could not finish. Check local storage and try again.');
      }
    }
  }

  // The keyboard's action key walks the form: Next from field to field, and
  // Done on the last one saves, so Save never has to be dug out from under
  // the keyboard. scrollPadding keeps the Save button in view while typing.
  Widget _number(String label, TextEditingController controller,
          {bool isRequired = false, bool last = false}) =>
      TextFormField(
          controller: controller,
          enabled: !_busy,
          onChanged: (_) => setState(() => _dirty = true),
          textInputAction: last ? TextInputAction.done : TextInputAction.next,
          onFieldSubmitted: last ? (_) => _save() : null,
          scrollPadding: const EdgeInsets.only(bottom: 140),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: label),
          validator: (text) {
            if (text == null || text.trim().isEmpty) {
              return isRequired ? 'Enter the calories' : null;
            }
            final n = double.tryParse(text);
            return n == null || !n.isFinite || n < 0 || n > 1000000
                ? 'Enter a finite value from 0 to 1000000'
                : null;
          });
  Widget _amount(String label, double fraction, {required bool selected}) {
    final onPressed = _busy || _dirty ? null : () => _consume(fraction);
    return Pressable(
        child: selected
            ? FilledButton.tonal(onPressed: onPressed, child: Text(label))
            : OutlinedButton(onPressed: onPressed, child: Text(label)));
  }

  Widget _summary(BuildContext context, Tier1Nutrients served, String status) {
    final theme = Theme.of(context), scheme = theme.colorScheme;
    return Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 8, 16),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: scheme.outline)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
                child: Text(_meal.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium)),
            TextButton.icon(
                onPressed:
                    _busy ? null : () => setState(() => _editTotals = true),
                icon: const Icon(Icons.edit_outlined, size: 18),
                label: const Text('Edit totals')),
          ]),
          Semantics(
              label: '${served.kcal.round()} kilocalories',
              excludeSemantics: true,
              child: Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    CountText(
                        value: served.kcal.round(),
                        style: theme.textTheme.displayMedium
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    Text(' kcal', style: theme.textTheme.titleMedium),
                  ])),
          Text('Estimated calories',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 4),
          _MacroLine(served, labelled: true),
          if (status.isNotEmpty)
            Padding(
                padding: const EdgeInsets.only(top: 8, right: 12),
                child: Text(status)),
        ]));
  }

  @override
  Widget build(BuildContext context) {
    final analysis = _meal.analysis;
    final question = analysis?['question'] is Map
        ? Map<String, dynamic>.from(analysis!['question'] as Map)
        : null;
    final canCorrect = _meal.canCorrectPortions;
    final served = _meal.served;
    // An estimate reads as a result first; the form appears on request, and
    // straight away when there is nothing to show yet (manual entry).
    final summary = served != null && !_editTotals;
    // A manual entry that holds nothing yet is not an estimate of anything.
    final blank = served == null && _meal.photoPath == null && !_hasSaved;
    final partly = served != null &&
        _meal.consumedKcal != null &&
        _meal.consumedKcal!.round() != served.kcal.round();
    final status = partly
        ? '${_meal.consumedKcal!.round()} kcal counted · you ate part of it'
        : '';
    return Scaffold(
        appBar:
            AppBar(title: Text(blank ? 'New meal' : 'Meal estimate'), actions: [
          // Nothing to export until the meal has been saved once. Delete stays:
          // a stored record must always be removable, whatever its revision.
          if (_hasSaved)
            IconButton(
                tooltip: 'Export measurements',
                onPressed: _busy ? null : _export,
                icon: const Icon(Icons.download_outlined)),
          IconButton(
              tooltip: 'Delete meal',
              onPressed: _busy ? null : _delete,
              icon: const Icon(Icons.delete_outline))
        ]),
        body: Form(
            key: _form,
            child: ListView(padding: const EdgeInsets.all(20), children: [
              if (_meal.photoPath != null)
                ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: Image.file(File(_meal.photoPath!),
                        height: 220,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) =>
                            const Text('Saved photo is unavailable'))),
              const SizedBox(height: 16),
              if (summary)
                AnimatedSize(
                    duration: Motion.of(context, Motion.medium),
                    curve: Motion.curve,
                    alignment: Alignment.topCenter,
                    child: _summary(context, served, status))
              else ...[
                if (blank)
                  Text('What did you eat?',
                      style: Theme.of(context).textTheme.headlineSmall)
                else ...[
                  Text('Estimated calories',
                      style: Theme.of(context).textTheme.headlineSmall),
                  if (status.isNotEmpty) Text(status),
                ],
              ],
              const SizedBox(height: 16),
              if (_message != null)
                Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(_message!, semanticsLabel: _message)),
              if (_meal.photoPath != null)
                FilledButton.icon(
                    onPressed: _busy || _dirty ? null : _estimate,
                    icon: const Icon(Icons.auto_awesome_outlined),
                    label: Text(_busy ? 'Estimating…' : 'Estimate photo')),
              if (!summary) ...[
                TextFormField(
                    controller: _name,
                    enabled: !_busy,
                    // a blank manual entry starts with the keyboard up
                    autofocus: blank,
                    textInputAction: TextInputAction.next,
                    textCapitalization: TextCapitalization.sentences,
                    scrollPadding: const EdgeInsets.only(bottom: 140),
                    onChanged: (_) => setState(() => _dirty = true),
                    decoration: const InputDecoration(labelText: 'Meal name'),
                    validator: (v) =>
                        v == null || v.trim().isEmpty || v.trim().length > 160
                            ? 'Enter a meal name (up to 160 characters)'
                            : null),
                const SizedBox(height: 12),
                _number('Calories (kcal)', _kcal, isRequired: true),
                const SizedBox(height: 12),
                _number('Protein g (optional)', _protein),
                const SizedBox(height: 12),
                _number('Carbs g (optional)', _carbs),
                const SizedBox(height: 12),
                _number('Fat g (optional)', _fat, last: true),
              ],
              const SizedBox(height: 16),
              // Nothing to save while the summary is showing: the way out is a
              // quiet Done, and Save appears with the form.
              if (summary && !_dirty)
                Pressable(
                    child: OutlinedButton(
                        onPressed: _busy ? null : () => Navigator.pop(context),
                        child: const Text('Done')))
              else ...[
                Pressable(
                    child: FilledButton(
                        onPressed: _busy ? null : _save,
                        child: const Text('Save meal'))),
                const SizedBox(height: 8),
                Text(blank
                    ? 'Protein, carbs and fat are optional.'
                    : 'Saving counts the meal as fully eaten again. Empty macros stay empty.'),
              ],
              if (analysis != null) ...[
                const Divider(height: 32),
                Text('Recognized foods and nutrient sources',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                for (var index = 0;
                    index < (analysis['components'] as List? ?? []).length;
                    index++)
                  Builder(builder: (_) {
                    final c = Map<String, dynamic>.from(
                        (analysis['components'] as List)[index] as Map);
                    final source =
                        Map<String, dynamic>.from(c['source'] as Map);
                    final current =
                        canCorrect ? _meal.componentMassG(index) : null;
                    final original = c['massG'] is num
                        ? (c['massG'] as num).toDouble()
                        : null;
                    final foodId = _meal.foodOverrides[index],
                        record = foodId == null ? null : manualFood(foodId);
                    final foodName = canCorrect
                        ? _meal.componentName(index)
                        : c['name'] as String;
                    final kcal = canCorrect ? _meal.componentKcal(index) : null;
                    final scheme = Theme.of(context).colorScheme;
                    // One card per food: what it is in the ink colour, where
                    // its numbers come from in the secondary colour, and both
                    // corrections side by side under it. The plain text is
                    // unchanged, so it reads the same to tests and readers.
                    return Container(
                        margin: const EdgeInsets.symmetric(vertical: 6),
                        padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
                        decoration: BoxDecoration(
                            color: scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: scheme.outline)),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                        child: Text.rich(TextSpan(children: [
                                      TextSpan(
                                          text:
                                              '$foodName · ${current == null ? c['massG'] : _displayNutrient(current)} g · ${record?.preparation ?? c['preparation']}',
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleSmall),
                                      TextSpan(
                                          text:
                                              '\n${record != null ? 'Your choice from the food database' : source['kind'] == 'database_match' ? 'From the food database' : 'Estimated from the photo'}',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall
                                              ?.copyWith(
                                                  color:
                                                      scheme.onSurfaceVariant)),
                                    ]))),
                                    if (kcal != null)
                                      Padding(
                                          padding: const EdgeInsets.only(
                                              left: 12, right: 8),
                                          child: Text('${kcal.round()} kcal',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .titleSmall)),
                                  ]),
                              if (record != null) ...[
                                Text(
                                    'Original prediction: ${c['name']} · ${c['preparation']}'),
                                if ((c['assumptions'] as List? ?? [])
                                    .isNotEmpty)
                                  Text(
                                      'Original assumptions: ${(c['assumptions'] as List).join('; ')}'),
                                SelectableText(record.sourceUrl),
                              ] else if ((c['assumptions'] as List? ?? [])
                                  .isNotEmpty)
                                Text((c['assumptions'] as List).join('; ')),
                              if (_meal.portionOverrides.containsKey(index))
                                Text(
                                    'Original estimate: ${_displayNutrient(original)} g${current == 0 ? ' · Not counted in the totals' : ''}'),
                              if (canCorrect)
                                Wrap(children: [
                                  Tooltip(
                                      message: 'Edit portion for $foodName',
                                      child: TextButton(
                                          onPressed: _busy || _dirty
                                              ? null
                                              : () => _portion(index),
                                          child: const Text('Edit portion'))),
                                  Tooltip(
                                      message: 'Change food for $foodName',
                                      child: TextButton(
                                          onPressed: _busy || _dirty
                                              ? null
                                              : () => _food(index),
                                          child: const Text('Change food'))),
                                ])
                              else
                                const SizedBox(height: 8),
                            ]));
                  }),
                // What still needs the user: amber, the product's colour for
                // "needs review", and the answers as buttons in a row.
                if ((analysis['ambiguities'] as List? ?? []).isNotEmpty ||
                    (question != null && _meal.hasPendingPreparationQuestion))
                  Container(
                      margin: const EdgeInsets.symmetric(vertical: 6),
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      decoration: BoxDecoration(
                          color: AppColors.needsReview.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                              color: AppColors.needsReview
                                  .withValues(alpha: 0.5))),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (final ambiguity
                                in (analysis['ambiguities'] as List? ?? []))
                              Text('Unresolved: $ambiguity'),
                            if (question != null &&
                                _meal.hasPendingPreparationQuestion) ...[
                              const SizedBox(height: 4),
                              Text(question['text'] as String,
                                  style:
                                      Theme.of(context).textTheme.titleSmall),
                              Wrap(spacing: 4, children: [
                                for (final raw in question['options'] as List)
                                  TextButton(
                                      onPressed: _busy || _dirty
                                          ? null
                                          : () => _answer(
                                              (raw as Map)['id'] as String),
                                      child: Text(
                                          (raw as Map)['label'] as String)),
                              ]),
                            ],
                          ])),
                if (question?['answered'] == true)
                  Text(
                      'Preparation: ${analysis['userPreparationAnswer'] ?? question!['answer']}'),
                if (_meal.hasManualNutritionOverride)
                  const Text(
                      'Totals were manually corrected. Original recognition is retained for comparison.'),
              ],
              if (_meal.served != null) ...[
                if (_dirty)
                  const Text(
                      'Save changes before changing how much you ate or repeating this meal.'),
                const Divider(height: 32),
                Text('How much did you eat?',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  _amount('Ate all', 1, selected: !partly),
                  _amount('Ate half', .5, selected: partly),
                ]),
                const SizedBox(height: 8),
                Text('Meals count in full unless you say otherwise.',
                    style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 8),
                OutlinedButton(
                    onPressed: _busy || _dirty ? null : _repeat,
                    child: const Text('Repeat meal')),
              ],
            ])));
  }
}

/// What a meal counts for: all of it, unless the user said they ate less.
/// A logged meal is an eaten meal; "half" is the exception, not a second step.
double _countedKcal(Tier1Meal meal) =>
    meal.consumedKcal ?? meal.served?.kcal ?? 0;

int _eatenKcal(List<Tier1Meal> meals) =>
    meals.fold<double>(0, (sum, m) => sum + _countedKcal(m)).round();

/// One line per meal in history. Kept short: on a 360dp phone a longer line
/// wraps beside the time.
String _mealLine(Tier1Meal meal) {
  final served = meal.served;
  if (served == null) return 'No estimate yet';
  final kcal = served.kcal.round(), counted = _countedKcal(meal).round();
  return counted == kcal ? '$kcal kcal' : '$counted of $kcal kcal eaten';
}

class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.label, required this.meals});
  final String label;
  final List<Tier1Meal> meals;
  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Row(children: [
          Expanded(child: Text(label, style: text.titleSmall)),
          Text('${_eatenKcal(meals)} kcal', style: text.bodySmall),
        ]));
  }
}

/// Protein, carbs and fat of one meal. The macro colour is a dot beside the
/// number, never the text colour: cyan and green text fail contrast on the
/// light background.
class _MacroLine extends StatelessWidget {
  const _MacroLine(this.nutrients, {this.labelled = false});
  final Tier1Nutrients nutrients;
  final bool labelled;
  @override
  Widget build(BuildContext context) {
    final parts = <(String, double?, Color)>[
      ('Protein', nutrients.proteinG, AppColors.protein),
      ('Carbs', nutrients.carbsG, AppColors.carbs),
      ('Fat', nutrients.fatG, AppColors.fat),
    ].where((p) => p.$2 != null).toList();
    if (parts.isEmpty) return const SizedBox.shrink();
    return Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Wrap(spacing: 12, children: [
          for (final (name, grams, color) in parts)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(
                  width: 8,
                  height: 8,
                  decoration:
                      BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 4),
              if (labelled)
                Text('$name ',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
              Text('${grams!.round()} g',
                  semanticsLabel: '$name ${grams.round()} grams'),
            ])
        ]));
  }
}
