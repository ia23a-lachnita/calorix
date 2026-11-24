import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import '../scan/widgets/meal_camera_preview.dart';
import 'viewfinder_guide.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/clock.dart';
import '../../shared/services/camera_service.dart';
import 'dashboard_today.dart';
import 'dashboard_history.dart';
import 'dashboard_goals.dart';
import '../../shell/app_shell.dart';
import 'local_meal.dart';
import 'packaged_drink.dart';
import 'analysis_failure.dart';
import 'manual_nutrient_catalog.dart';
import 'portion_input.dart';
import 'portion_input_dialog.dart';
import 'motion.dart';
import 'tab_motion.dart';
import 'food_selection_dialog.dart';
import 'local_meal_store.dart';
import 'targets.dart';
import 'tier1_cloud.dart';
import 'workflow_measurements.dart';
import 'workflow_export.dart';
import 'meal_export.dart';
import 'meal_photo.dart';
import 'gallery_photo.dart';
import 'pilot_flash_control.dart';
import 'pilot_support_screens.dart';
import 'pilot_theme.dart';

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
  Widget build(BuildContext context) => PilotTheme(
      builder: (context, mode, setMode) => MaterialApp(
          themeMode: mode,
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
                      : FirebaseTier1Cloud(initializeCloud!)))));
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
  static const _cameraAccessOff =
      'Camera access is off. Manual entry still works.';
  late final CameraService _camera = widget.camera ?? DeviceCameraService();
  Tier1MealStore? _store;
  WorkflowSink? _workflow;
  late final _elapsed = Stopwatch()..start();
  int _ticks() =>
      widget.elapsedMilliseconds?.call() ?? _elapsed.elapsedMilliseconds;
  List<Tier1Meal> _meals = [];
  String? _error, _cameraWarning;
  // 0 Today, 1 History, 2 Scan (the landing screen), 3 Goals, 4 AI.
  int _tab = 2;
  bool _busy = false;
  bool _initializing = true;
  bool _startupPermissionChecked = false;
  Future<bool>? _cameraPermission;
  final _pages = PageController(initialPage: 2);
  Tier1TargetStore _targetStore = Tier1TargetStore();
  Tier1Targets _targets = Tier1Targets.defaults;
  int _lifecycleEpoch = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initialize());
  }

  void _selectTab(int index, {bool immediate = false}) {
    if (!mounted) return;
    setState(() => _tab = index);
    if (!_pages.hasClients) return;
    if (immediate || MediaQuery.disableAnimationsOf(context)) {
      _pages.jumpToPage(index);
    } else {
      unawaited(_pages.animateToPage(index,
          duration: Motion.medium, curve: Motion.curve));
    }
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
      if (mounted) {
        setState(() => _initializing = false);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _initializing = false;
          _error =
              'Could not open local history. Existing files were preserved.';
        });
      }
      return;
    }
    if (_camera is GalleryRecovery) {
      await _importGallery(recover: true);
    }
    await _prepareCamera();
  }

  bool get _isForeground {
    final state = WidgetsBinding.instance.lifecycleState;
    return state == null || state == AppLifecycleState.resumed;
  }

  Future<bool> _requestCameraAccess() async {
    final granted = await _camera.hasPermission();
    // The app can lose focus while Android is checking permission. In that
    // case the first foreground resume still needs to handle startup.
    if (!mounted || !_isForeground) return false;
    _startupPermissionChecked = true;
    if (granted) return true;
    final result = await _camera.requestPermission();
    return result == CameraPermissionRequestResult.granted;
  }

  Future<bool> _ensureCameraAccess() =>
      _cameraPermission ??= _requestCameraAccess().whenComplete(() {
        _cameraPermission = null;
      });

  Future<void> _prepareCamera() async {
    // The permission dialog can resume the app before the grant callback.
    // Let the pending startup request or shutter finish on its own.
    if (!mounted ||
        !_isForeground ||
        _workflow == null ||
        _error != null ||
        _cameraPermission != null) {
      return;
    }
    try {
      final granted = _startupPermissionChecked
          ? await _camera.hasPermission()
          : await _ensureCameraAccess();
      if (!mounted || !_isForeground) return;
      if (granted && _camera is CameraLifecycleService) {
        await (_camera as CameraLifecycleService).resume();
      }
      if (mounted) {
        setState(() => _cameraWarning = granted ? null : _cameraAccessOff);
      }
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
    if (state == AppLifecycleState.resumed) {
      unawaited(_prepareCamera());
    } else if (_camera is CameraLifecycleService) {
      unawaited((_camera as CameraLifecycleService).pause());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pages.dispose();
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
    // Coming from the camera, move to Today while the editor covers the
    // screen, so closing it reveals the result instead of the camera.
    final fromScan = _tab == 2;
    final route = MaterialPageRoute<void>(
        builder: (_) => _MealEditor(
            meal: meal,
            store: _store!,
            targets: _targets,
            cloud: widget.cloud,
            clock: widget.clock,
            workflow: _workflow!,
            elapsedMilliseconds: _ticks,
            captureTick: captureTick,
            startEstimate: startEstimate,
            allowInitialEstimate: allowInitialEstimate));
    final closed = Navigator.of(context).push(route);
    if (fromScan) {
      void covered(AnimationStatus status) {
        if (status != AnimationStatus.completed) return;
        route.animation?.removeStatusListener(covered);
        if (mounted && _tab == 2) _selectTab(0, immediate: true);
      }

      route.animation?.addStatusListener(covered);
    }
    await closed;
    if (!mounted) return;
    try {
      await _refresh();
      if (mounted) {
        // Back to where the result shows: a meal of today lands on Today,
        // where the ring takes it in; anything else on History. A discarded
        // capture returns to the camera. A meal opened from a list returns
        // to that list.
        final kept = _meals.any((m) => m.id == meal.id);
        final today = _todayMeals.any((m) => m.id == meal.id);
        if (fromScan) _selectTab(!kept ? 2 : (today ? 0 : 1), immediate: true);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Could not refresh local history. Reopen the app to check saved values.');
      }
    }
  }

  Future<void> _importGallery({bool recover = false}) async {
    if (!mounted || _busy || _store == null || _error != null) return;
    setState(() => _busy = true);
    try {
      final file = recover
          ? await (_camera as GalleryRecovery).recoverGalleryImage()
          : await _camera.pickFromLibrary();
      if (file == null) return;
      final photo = await prepareGalleryPhoto(file);
      final id = const Uuid().v4();
      final path = await _store!.retainGalleryPhoto(id, photo.bytes);
      final now = widget.clock.now();
      final meal = Tier1Meal(
          id: id,
          capturedAt: now,
          name: 'New meal',
          photoPath: path,
          source: 'photo',
          metadata: {
            'photoSource': 'gallery',
            'importedAt': now.toUtc().toIso8601String(),
            'width': photo.width,
            'height': photo.height,
            'jpegBytes': photo.bytes.length,
            'gpsRequested': false,
          });
      try {
        await _store!.save(meal);
      } catch (_) {
        await File(path).delete();
        rethrow;
      }
      await _refresh();
      if (mounted &&
          _isForeground &&
          _tab == 2 &&
          ModalRoute.isCurrentOf(context) == true) {
        await _open(_meals.firstWhere((m) => m.id == id));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
                'Could not import this photo. Choose a JPEG or PNG up to 20 MB and try again.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _capture() async {
    if (_busy || _store == null || _error != null) return;
    setState(() => _busy = true);
    String? ownedCapture;
    try {
      if (!await _ensureCameraAccess()) {
        if (mounted) setState(() => _cameraWarning = _cameraAccessOff);
        return;
      }
      if (!mounted || _tab != 2 || ModalRoute.isCurrentOf(context) != true) {
        return;
      }
      final state = WidgetsBinding.instance.lifecycleState;
      final startedForeground = _isForeground;
      // Android may return the grant before dismissing the permission window.
      // Inactive is safe here, but a backgrounded app should not take a photo.
      if (!startedForeground && state != AppLifecycleState.inactive) return;
      if (_cameraWarning != null) setState(() => _cameraWarning = null);
      final shutter = widget.clock.now();
      final shutterTick = _ticks();
      final offerEpoch = _lifecycleEpoch;
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
    final hasPreview = _camera is DeviceCameraService &&
        _camera.previewController?.value.isInitialized == true;
    final scheme = Theme.of(context).colorScheme;
    final chip = IconButton.styleFrom(
        minimumSize: const Size(48, 48),
        foregroundColor: scheme.onSurface,
        backgroundColor: scheme.surface.withValues(alpha: .85),
        side: BorderSide(color: scheme.outlineVariant));
    return Stack(fit: StackFit.expand, children: [
      Positioned.fill(
          top: _countedToday.isEmpty ? 12 : 92,
          bottom: 160,
          child: Center(
              child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: CustomPaint(
                      key: const ValueKey('meal-framing-guide'),
                      painter: ViewfinderGuide(active: _busy),
                      child: SizedBox(
                          width: 280,
                          height: 280,
                          child: hasPreview
                              ? null
                              : Center(
                                  child: Text('One photo of your meal',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleLarge))))))),
      // Unestimated captures do not invent a zero-calorie meal count.
      if (_countedToday.isNotEmpty)
        Positioned(
            top: 16,
            left: 20,
            right: 20,
            child: TextButton(
                key: const ValueKey('scan-today-summary'),
                onPressed: () => _selectTab(0),
                style: TextButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.onSurface,
                    backgroundColor:
                        Theme.of(context).colorScheme.surfaceContainerHighest,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20))),
                child: Row(children: [
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text('Today’s calories',
                            style: Theme.of(context).textTheme.labelLarge),
                        const SizedBox(height: 2),
                        Text(
                            '${_countedToday.length} ${_countedToday.length == 1 ? 'meal' : 'meals'}',
                            style: Theme.of(context).textTheme.bodySmall)
                      ])),
                  const SizedBox(width: 12),
                  Expanded(
                      child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerRight,
                          child: Row(
                              crossAxisAlignment: CrossAxisAlignment.baseline,
                              textBaseline: TextBaseline.alphabetic,
                              children: [
                                Text('${_eatenKcal(_countedToday)}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall),
                                const SizedBox(width: 5),
                                Text('kcal',
                                    style:
                                        Theme.of(context).textTheme.labelMedium)
                              ])))
                ]))),
      Positioned(
          left: 20,
          right: 20,
          bottom: 24,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text(
                'Photos stay on this phone until you choose cloud analysis.',
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            Stack(alignment: Alignment.topCenter, children: [
              Positioned(
                  left: 0,
                  top: 16,
                  child: IconButton(
                      tooltip: 'Choose from gallery',
                      style: chip,
                      onPressed: _busy || _error != null
                          ? null
                          : () => _importGallery(),
                      icon: const Icon(Icons.photo_library_outlined))),
              if (_meals.isNotEmpty)
                Positioned(
                    right: 0,
                    top: 16,
                    child: IconButton(
                        tooltip: 'Recent meals',
                        style: chip,
                        onPressed: _busy ? null : () => _selectTab(1),
                        icon: const Icon(Icons.history))),
              Align(
                alignment: Alignment.topCenter,
                child: Semantics(
                    container: true,
                    label: _busy ? 'Saving photo' : 'Take meal photo',
                    button: true,
                    enabled: !_busy,
                    onTap: _busy ? null : _capture,
                    excludeSemantics: true,
                    child: Pressable(
                        child: GestureDetector(
                            excludeFromSemantics: true,
                            onTap: _busy ? null : _capture,
                            behavior: HitTestBehavior.opaque,
                            child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  RepaintBoundary(
                                      key: const ValueKey('tier1-capture-ring'),
                                      child: CustomPaint(
                                          size: const Size(80, 80),
                                          painter: _CaptureRingPainter(
                                              disabledColor: _busy
                                                  ? Theme.of(context)
                                                      .disabledColor
                                                  : null))),
                                  const SizedBox(height: 8),
                                  Text(_busy ? 'Saving photo…' : 'Take photo'),
                                ])))),
              )
            ]),
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

  List<Tier1Meal> get _countedToday =>
      _todayMeals.where((m) => m.served != null).toList();

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

  void _openProfile() {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (routeContext) {
      final appearance = PilotTheme.of(routeContext);
      return PilotProfileScreen(
        themeMode: appearance.mode,
        onThemeChanged: appearance.setMode,
        meals: _meals,
        onGoals: () {
          Navigator.of(routeContext).pop();
          _selectTab(3);
        },
      );
    }));
  }

  void _explainCamera() {
    Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (routeContext) => PilotPermissionExplanation(
            onContinue: () => Navigator.of(routeContext).pop())));
  }

  Widget _header(int tab) => AppBar(
          backgroundColor: tab == 2
              ? Theme.of(context).colorScheme.surface.withValues(alpha: .77)
              : null,
          title: tab == 2 && _camera is CameraFlashService
              ? PilotFlashControl(camera: _camera)
              : const Text(AppConstants.appDisplayName),
          actions: [
            IconButton(
                tooltip: 'Profile',
                icon: const Icon(Icons.person_outline),
                onPressed: _openProfile),
            if (tab == 1)
              IconButton(
                  tooltip: 'Export measurements',
                  onPressed: _store == null || _error != null
                      ? null
                      : () => showWorkflowExport(context,
                          load: () =>
                              _workflow!.export(at: widget.clock.now())),
                  icon: const Icon(Icons.download_outlined)),
            if (MediaQuery.textScalerOf(context).scale(1) > 1.2)
              IconButton(
                  tooltip: 'Manual entry',
                  onPressed: _store == null || _error != null
                      ? null
                      : () => _open(Tier1Meal(
                          id: const Uuid().v4(),
                          capturedAt: widget.clock.now(),
                          name: 'New meal')),
                  icon: const Icon(Icons.edit_outlined))
            else
              TextButton.icon(
                  onPressed: _store == null || _error != null
                      ? null
                      : () => _open(Tier1Meal(
                          id: const Uuid().v4(),
                          capturedAt: widget.clock.now(),
                          name: 'New meal')),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Manual entry'))
          ]);

  Widget _tabContent(int tab) {
    if (_store == null) return const Center(child: CircularProgressIndicator());
    if (tab == 0) {
      return DashboardToday(
          meals: _meals,
          now: widget.clock.now(),
          targets: _targets,
          onOpenMeal: _error == null ? _open : null,
          onEditTargets: _editTargets,
          onScan: () => _selectTab(2));
    }
    if (tab == 1) {
      return DashboardHistory(
          meals: _meals,
          now: widget.clock.now(),
          targets: _targets,
          onOpenMeal: _error == null ? _open : null);
    }
    if (tab == 2) return _cameraView();
    if (tab == 3) {
      return DashboardGoals(
          targets: _targets,
          onEdit: _editTargets,
          meals: _meals,
          now: widget.clock.now());
    }
    return PilotAiScreen(
        meals: _meals, onScan: () => _selectTab(2), onOpenMeal: _open);
  }

  @override
  Widget build(BuildContext context) => _initializing
      ? const PilotLoadingScreen()
      : Scaffold(
          bottomNavigationBar: CalorixBottomNav(
              currentIndex: _tab,
              raisedScan: false,
              onTap: _selectTab,
              isDark: Theme.of(context).brightness == Brightness.dark,
              floating: _tab == 2),
          body: PageView(
              controller: _pages,
              pageSnapping: false,
              physics: MediaQuery.disableAnimationsOf(context)
                  ? const ReducedMotionTabPhysics()
                  : const TabPagePhysics(),
              onPageChanged: (tab) => setState(() => _tab = tab),
              children: [
                for (var tab = 0; tab < 5; tab++)
                  Stack(fit: StackFit.expand, children: [
                    if (tab == 2 &&
                        _camera is DeviceCameraService &&
                        _camera.previewController?.value.isInitialized == true)
                      MealCameraPreview(controller: _camera.previewController!),
                    Column(children: [
                      // A header belongs to its page: both travel on the same native
                      // scroll track instead of changing only when a swipe commits.
                      SizedBox(
                          key: ValueKey('tab-header-$tab'),
                          height: kToolbarHeight +
                              MediaQuery.paddingOf(context).top,
                          child: _header(tab)),
                      if (_error != null)
                        Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(_error!)),
                      if (tab == 2 && _cameraWarning != null)
                        Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(children: [
                              Expanded(child: Text(_cameraWarning!)),
                              if (_cameraWarning == _cameraAccessOff)
                                TextButton(
                                    onPressed: _explainCamera,
                                    child: const Text('Why camera?')),
                            ])),
                      Expanded(
                          key: ValueKey('tab-content-$tab'),
                          child: _tabContent(tab)),
                    ]),
                  ]),
              ]));
}

class _CaptureRingPainter extends CustomPainter {
  const _CaptureRingPainter({this.disabledColor});
  final Color? disabledColor;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6;
    if (disabledColor != null) {
      paint.color = disabledColor!;
    } else {
      paint.shader = const SweepGradient(colors: AppColors.sweepGradient)
          .createShader(Offset.zero & size);
    }
    canvas.drawCircle(
        size.center(Offset.zero), size.shortestSide / 2 - 3, paint);
  }

  @override
  bool shouldRepaint(_CaptureRingPainter oldDelegate) =>
      oldDelegate.disabledColor != disabledColor;
}

class _MealEditor extends StatefulWidget {
  const _MealEditor(
      {required this.meal,
      required this.store,
      required this.targets,
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
  final Tier1Targets targets;
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
  bool _catalogServing = false, _estimating = false;
  bool _drinkMode = false;
  final _drinkVolume = TextEditingController();
  final _drinkKcal = TextEditingController();
  final _drinkProtein = TextEditingController();
  final _drinkCarbs = TextEditingController();
  final _drinkFat = TextEditingController();
  String _foodQuery = '';
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
    if (_exporting) return;
    _trace('export_opened');
    _exporting = true;
    _meter.setForeground(false);
    try {
      Future<void> measurements() => showWorkflowExport(context,
          load: () =>
              widget.workflow.export(at: widget.clock.now(), mealId: _meal.id));
      if (_meal.photoPath != null) {
        final snapshot = _meal;
        await showMealCopyExport(context,
            canSave: !_dirty,
            save: () => saveMealCopy(snapshot, exportedAt: widget.clock.now()),
            measurements: measurements);
      } else {
        await measurements();
      }
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
    for (final c in [_name, _kcal, _protein, _carbs, _fat, _drinkVolume, _drinkKcal, _drinkProtein, _drinkCarbs, _drinkFat]) {
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
      if (_drinkMode) {
        final drink = _drinkValue();
        if (drink == null || _name.text.trim().isEmpty || _name.text.trim().length > 160) {
          setState(() => _message = 'Check the drink name, label values and serving total.');
          return;
        }
        await _persist(_meal.withPackagedDrink(_name.text, drink));
      } else {
        await _persist(_meal.edit(
            _name.text,
            Tier1Nutrients(
                kcal: _numberFromField(_kcal, _meal.served?.kcal)!,
                proteinG: _numberFromField(_protein, _meal.served?.proteinG),
                carbsG: _numberFromField(_carbs, _meal.served?.carbsG),
                fatG: _numberFromField(_fat, _meal.served?.fatG)),
            at: widget.clock.now()));
      }
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
      _estimating = true;
      _message = null;
    });
    var committed = false;
    var localWrite = true;
    try {
      await _persist(_meal.withConsent());
      final revision = _meal.revision;
      localWrite = false;
      final cloud = widget.cloud;
      if (cloud == null) throw StateError('Cloud unavailable');
      final result = await cloud.analyze(_meal.photoPath!, consent: true);
      _trace('analysis_returned', {
        'clientAnalysisMs': _duration(started),
        'shutterToResponseMs': _duration(widget.captureTick)
      });
      localWrite = true;
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
    } catch (error) {
      final failure = committed
          ? const AnalysisFailure(EstimateFailure.refresh)
          : localWrite
              ? const AnalysisFailure(EstimateFailure.save)
              : AnalysisFailure.from(error);
      _trace(committed ? 'analysis_refresh_failed' : 'analysis_failed',
          {'clientAnalysisMs': _duration(started), ...failure.fields});
      if (mounted) setState(() => _message = failure.message);
    } finally {
      _meter.setWaiting(false);
      if (mounted) {
        setState(() {
          _busy = false;
          _estimating = false;
        });
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
    PortionInput? input;
    var restore = false;
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
                            TextButton(
                                onPressed: () async {
                                  final choice = await showDialog<PortionInput>(
                                      context: dialogContext,
                                      builder: (_) => PortionInputDialog(
                                          originalGrams: original,
                                          recordId:
                                              opening.componentRecordId(index),
                                          previous:
                                              opening.portionInputs[index]));
                                  if (choice == null ||
                                      closed ||
                                      !dialogContext.mounted) {
                                    return;
                                  }
                                  input = choice;
                                  closed = true;
                                  Navigator.pop(dialogContext, choice.grams);
                                },
                                child: const Text(
                                    'Use pieces, volume or a batch share')),
                            // In the content, not the action row: three
                            // buttons do not fit there and stack vertically.
                            TextButton.icon(
                                onPressed: () {
                                  if (closed) return;
                                  closed = true;
                                  restore = true;
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
      final updated = opening.correctPortion(index, grams,
          at: widget.clock.now(),
          input: input ??
              (!restore && grams == current
                  ? opening.portionInputs[index]
                  : null));
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
          key: ValueKey(label),
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
  PackagedDrink? _drinkValue() {
    double? parse(TextEditingController c) => double.tryParse(c.text.trim());
    final volume = parse(_drinkVolume), kcal = parse(_drinkKcal);
    if (volume == null || kcal == null) return null;
    for (final field in [_drinkProtein, _drinkCarbs, _drinkFat]) {
      if (field.text.trim().isNotEmpty && parse(field) == null) return null;
    }
    try {
      return PackagedDrink(volumeMl: volume, per100Ml: Tier1Nutrients(
          kcal: kcal, proteinG: parse(_drinkProtein),
          carbsG: parse(_drinkCarbs), fatG: parse(_drinkFat)));
    } catch (_) {
      return null;
    }
  }

  Widget _drinkNumber(String label, TextEditingController controller,
      {bool requiredValue = false, bool positive = false, bool last = false}) => TextFormField(
      controller: controller,
      enabled: !_busy,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      textInputAction: last ? TextInputAction.done : TextInputAction.next,
      onFieldSubmitted: last ? (_) => FocusScope.of(context).unfocus() : null,
      scrollPadding: const EdgeInsets.only(bottom: 140),
      decoration: InputDecoration(labelText: label),
      onChanged: (_) => setState(() { _dirty = true; _message = null; }),
      validator: (text) {
        if (text == null || text.trim().isEmpty) return requiredValue ? 'Enter a value' : null;
        final value = double.tryParse(text);
        if (value == null || !value.isFinite || value < 0 || value > 1000000 || (positive && value == 0)) {
          return 'Enter a valid ${positive ? 'positive ' : ''}number';
        }
        return null;
      });

  void _selectManualFood(ManualFoodRecord selected) {
    FocusScope.of(context).unfocus();
    setState(() {
      _name.text = selected.description;
      _kcal.text = _displayNutrient(selected.per100['kcal']);
      _protein.text = _displayNutrient(selected.per100['proteinG']);
      _carbs.text = _displayNutrient(selected.per100['carbsG']);
      _fat.text = _displayNutrient(selected.per100['fatG']);
      _catalogServing = true;
      _dirty = true;
    });
  }

  Widget _amount(String label, double fraction, {required bool selected}) {
    final onPressed = _busy || _dirty ? null : () => _consume(fraction);
    return Pressable(
        child: selected
            ? FilledButton.tonal(onPressed: onPressed, child: Text(label))
            : OutlinedButton(onPressed: onPressed, child: Text(label)));
  }

  Widget _estimateButton({required bool hasEstimate}) => Pressable(
      child: hasEstimate
          ? FilledButton.tonalIcon(
              onPressed: _busy || _dirty ? null : _estimate,
              icon: const Icon(Icons.auto_awesome_outlined),
              label: Text(_busy ? 'Estimating…' : 'Estimate photo'))
          : FilledButton.icon(
              onPressed: _busy || _dirty ? null : _estimate,
              icon: const Icon(Icons.auto_awesome_outlined),
              label: Text(_busy ? 'Estimating…' : 'Estimate photo')));

  Widget _heroAction(
          String label, IconData icon, VoidCallback? action) =>
      DecoratedBox(
          decoration: BoxDecoration(
              color: const Color(0xB0080A0D),
              borderRadius: BorderRadius.circular(24)),
          child: IconButton(
              tooltip: label,
              onPressed: action,
              color: AppColors.cameraOverlayText,
              icon: Icon(icon)));

  Widget _summary(BuildContext context, Tier1Nutrients served, String status) {
    final theme = Theme.of(context), scheme = theme.colorScheme;
    final fraction = _meal.consumedFraction ?? 1;
    final macros = <(String, double?, Color, int)>[
      ('Protein', served.proteinG, AppColors.protein, widget.targets.proteinG),
      ('Carbs', served.carbsG, AppColors.carbs, widget.targets.carbsG),
      ('Fat', served.fatG, AppColors.fat, widget.targets.fatG),
    ];
    final card = BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outline));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Semantics(
          header: true,
          child: Text(
              MaterialLocalizations.of(context)
                  .formatMediumDate(_meal.capturedAt.toLocal()),
              style: theme.textTheme.labelMedium
                  ?.copyWith(color: scheme.onSurfaceVariant))),
      const SizedBox(height: 4),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
            child: Semantics(
                header: true,
                child: Text(_meal.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w600)))),
        TextButton.icon(
            onPressed: _busy ? null : () => setState(() => _editTotals = true),
            icon: const Icon(Icons.edit_outlined, size: 18),
            label: const Text('Edit totals')),
      ]),
      const SizedBox(height: 12),
      Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: card,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Calories in serving', style: theme.textTheme.labelMedium),
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
                          style: theme.textTheme.headlineMedium
                              ?.copyWith(fontWeight: FontWeight.w600)),
                      Text(' kcal', style: theme.textTheme.bodyMedium),
                    ])),
            if (status.isNotEmpty) Text(status),
          ])),
      if (macros.any((macro) => macro.$2 != null)) ...[
        const SizedBox(height: 10),
        Container(
            decoration: card,
            child: Column(children: [
              for (final (name, value, color, target) in macros)
                if (value != null)
                  Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(children: [
                              Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                      color: color, shape: BoxShape.circle)),
                              const SizedBox(width: 8),
                              Expanded(child: Text(name)),
                              Text('${_displayNutrient(value)} g served',
                                  semanticsLabel:
                                      '$name ${_displayNutrient(value)} grams served',
                                  style: theme.textTheme.titleSmall),
                            ]),
                            const SizedBox(height: 8),
                            if (target > 0) ...[
                              Builder(builder: (context) {
                                final percent =
                                    (value * fraction / target * 100).round();
                                return Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(99),
                                          child: LinearProgressIndicator(
                                              minHeight: 4,
                                              value: (percent / 100)
                                                  .clamp(0.0, 1.0),
                                              semanticsLabel:
                                                  '$name contribution to daily target',
                                              semanticsValue: '$percent',
                                              color: color,
                                              backgroundColor:
                                                  scheme.outlineVariant)),
                                      const SizedBox(height: 4),
                                      Text(
                                          '${_displayNutrient(value * fraction)} g eaten · $percent% of ${name.toLowerCase()} target',
                                          style: theme.textTheme.bodySmall),
                                    ]);
                              }),
                            ] else
                              Text('$name target unavailable',
                                  style: theme.textTheme.bodySmall),
                          ])),
            ])),
      ],
    ]);
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
    final foodResults = blank && _foodQuery.trim().isNotEmpty
        ? searchManualFoods(_foodQuery).take(5).toList()
        : <ManualFoodRecord>[];
    final fraction = _meal.consumedFraction ?? 1;
    final partly = served != null && fraction != 1;
    final status = partly
        ? '${_meal.consumedKcal!.round()} kcal counted · you ate part of it'
        : '';
    return Scaffold(
      appBar: _meal.photoPath != null
          ? null
          : AppBar(
              title: Text(blank ? 'New meal' : 'Meal estimate'),
              actions: [
                // Nothing to export until the meal has been saved once. Delete stays:
                // a stored record must always be removable, whatever its revision.
                if (_hasSaved)
                  IconButton(
                    tooltip: _meal.photoPath == null
                        ? 'Export measurements'
                        : 'Export meal',
                    onPressed: _busy || _exporting ? null : _export,
                    icon: const Icon(Icons.download_outlined),
                  ),
                IconButton(
                  tooltip: 'Delete meal',
                  onPressed: _busy ? null : _delete,
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
      body: SafeArea(
        top: _meal.photoPath != null,
        bottom: false,
        child: Stack(
          children: [
            Semantics(
              sortKey: const OrdinalSortKey(1.0),
              container: true,
              child: Form(
                key: _form,
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    if (_meal.photoPath != null)
                      MealPhotoPreview(photoPath: _meal.photoPath!),
                    Container(
                      decoration: BoxDecoration(
                        color: Theme.of(context).scaffoldBackgroundColor,
                        borderRadius: _meal.photoPath == null
                            ? null
                            : const BorderRadius.vertical(
                                top: Radius.circular(28),
                              ),
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_estimating || _message != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: Column(
                                children: [
                                  if (_estimating)
                                    Semantics(
                                      liveRegion: true,
                                      child: Container(
                                        margin: const EdgeInsets.only(
                                          bottom: 16,
                                        ),
                                        padding: const EdgeInsets.all(16),
                                        decoration: BoxDecoration(
                                          color: Theme.of(
                                            context,
                                          ).colorScheme.surfaceContainerHighest,
                                          borderRadius: BorderRadius.circular(
                                            20,
                                          ),
                                        ),
                                        child: Row(
                                          children: [
                                            const Icon(
                                              Icons.cloud_outlined,
                                              color: AppColors.cyan,
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    'Analyzing your photo',
                                                    style: Theme.of(
                                                      context,
                                                    ).textTheme.titleSmall,
                                                  ),
                                                  const Text(
                                                    'Your estimate will appear when it is ready.',
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  if (_message != null)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 12,
                                      ),
                                      child: Text(
                                        _message!,
                                        semanticsLabel: _message,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          if (_meal.photoPath != null && served == null) ...[
                            _estimateButton(hasEstimate: false),
                            const SizedBox(height: 12),
                          ],
                          if (summary) ...[
                            AnimatedSize(
                              duration: Motion.of(context, Motion.medium),
                              curve: Motion.curve,
                              alignment: Alignment.topCenter,
                              child: _summary(context, served, status),
                            ),
                            if (_meal.packagedDrink != null) ...[
                              Text(
                                'Serving: ${_displayNutrient(_meal.packagedDrink!.volumeMl)} mL · '
                                '${_displayNutrient(_meal.packagedDrink!.per100Ml.kcal)} kcal per 100 mL',
                              ),
                              if (_meal.packagedDrink!.per100Ml.proteinG !=
                                      null ||
                                  _meal.packagedDrink!.per100Ml.carbsG !=
                                      null ||
                                  _meal.packagedDrink!.per100Ml.fatG != null)
                                Text(
                                  'Per 100 mL:'
                                  '${_meal.packagedDrink!.per100Ml.proteinG == null ? '' : ' ${_displayNutrient(_meal.packagedDrink!.per100Ml.proteinG)} g protein'}'
                                  '${_meal.packagedDrink!.per100Ml.carbsG == null ? '' : ' ${_displayNutrient(_meal.packagedDrink!.per100Ml.carbsG)} g carbs'}'
                                  '${_meal.packagedDrink!.per100Ml.fatG == null ? '' : ' ${_displayNutrient(_meal.packagedDrink!.per100Ml.fatG)} g fat'}',
                                ),
                            ],
                          ] else ...[
                            if (blank) ...[
                              Text(
                                'Camera-free logging',
                                style: Theme.of(context).textTheme.labelMedium,
                              ),
                              Text(
                                'Add food',
                                style: Theme.of(
                                  context,
                                ).textTheme.headlineSmall,
                              ),
                            ] else ...[
                              // a photo kept on the phone has no estimate to speak of yet
                              Text(
                                served == null
                                    ? 'Your photo'
                                    : 'Estimated calories',
                                style: Theme.of(
                                  context,
                                ).textTheme.headlineSmall,
                              ),
                              if (served == null)
                                const Text(
                                  'Estimate it, or fill in the meal yourself.',
                                ),
                              if (status.isNotEmpty) Text(status),
                            ],
                          ],
                          if (_meal.photoPath != null) ...[
                            Semantics(
                              header: true,
                              child: Text(
                                'Meal estimate',
                                style: Theme.of(context).textTheme.labelMedium,
                              ),
                            ),
                            if (served != null) ...[
                              const SizedBox(height: 12),
                              _estimateButton(hasEstimate: true),
                            ],
                          ],
                          const SizedBox(height: 16),
                          if (!summary) ...[
                            if (blank) ...[
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton(
                                  onPressed: _busy
                                      ? null
                                      : () => setState(() {
                                          _drinkMode = !_drinkMode;
                                          _message = null;
                                        }),
                                  child: Text(
                                    _drinkMode
                                        ? 'Enter food'
                                        : 'Packaged drink',
                                  ),
                                ),
                              ),
                            ],
                            if (blank && !_drinkMode) ...[
                              TextField(
                                enabled: !_busy,
                                onChanged: (value) =>
                                    setState(() => _foodQuery = value),
                                decoration: const InputDecoration(
                                  labelText: 'Search foods',
                                  prefixIcon: Icon(Icons.search),
                                ),
                              ),
                              if (_foodQuery.trim().isNotEmpty)
                                if (foodResults.isEmpty)
                                  const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 12),
                                    child: Text('No matching foods'),
                                  )
                                else
                                  for (final food in foodResults)
                                    ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(food.description),
                                      subtitle: Text(
                                        '${_displayNutrient(food.per100['kcal'])} kcal per 100 g',
                                      ),
                                      trailing: const Icon(
                                        Icons.add_circle_outline,
                                      ),
                                      onTap: _busy
                                          ? null
                                          : () => _selectManualFood(food),
                                    ),
                              const SizedBox(height: 12),
                            ],
                            if (_catalogServing && !_drinkMode)
                              const Text(
                                'Values are for 100 g. Adjust them for your serving.',
                              ),
                            TextFormField(
                              key: const ValueKey('meal-name-input'),
                              controller: _name,
                              enabled: !_busy,
                              // a blank manual entry starts with the keyboard up
                              autofocus: blank,
                              textInputAction: TextInputAction.next,
                              textCapitalization: TextCapitalization.sentences,
                              scrollPadding: const EdgeInsets.only(bottom: 140),
                              onChanged: (_) => setState(() => _dirty = true),
                              decoration: const InputDecoration(
                                labelText: 'Meal name',
                              ),
                              validator: (v) =>
                                  v == null ||
                                      v.trim().isEmpty ||
                                      v.trim().length > 160
                                  ? 'Enter a meal name (up to 160 characters)'
                                  : null,
                            ),
                            const SizedBox(height: 12),
                            if (_drinkMode) ...[
                              _drinkNumber(
                                'Volume (mL)',
                                _drinkVolume,
                                requiredValue: true,
                                positive: true,
                              ),
                              const SizedBox(height: 12),
                              _drinkNumber(
                                'Calories per 100 mL',
                                _drinkKcal,
                                requiredValue: true,
                              ),
                              const SizedBox(height: 12),
                              _drinkNumber(
                                'Protein per 100 mL (g, optional)',
                                _drinkProtein,
                              ),
                              const SizedBox(height: 12),
                              _drinkNumber(
                                'Carbs per 100 mL (g, optional)',
                                _drinkCarbs,
                              ),
                              const SizedBox(height: 12),
                              _drinkNumber(
                                'Fat per 100 mL (g, optional)',
                                _drinkFat,
                                last: true,
                              ),
                              const SizedBox(height: 16),
                              Builder(
                                builder: (context) {
                                  final total = _drinkValue()?.total;
                                  if (total == null) {
                                    return const Text(
                                      'Enter volume and label values to see the total.',
                                    );
                                  }
                                  return Semantics(
                                    liveRegion: true,
                                    child: Text(
                                      'Serving: ${_displayNutrient(total.kcal)} kcal'
                                      '${total.proteinG == null ? '' : ' · ${_displayNutrient(total.proteinG)} g protein'}'
                                      '${total.carbsG == null ? '' : ' · ${_displayNutrient(total.carbsG)} g carbs'}'
                                      '${total.fatG == null ? '' : ' · ${_displayNutrient(total.fatG)} g fat'}',
                                    ),
                                  );
                                },
                              ),
                            ] else ...[
                              Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    width: .5,
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.outline,
                                  ),
                                ),
                                child: _number(
                                  'Calories (kcal)',
                                  _kcal,
                                  isRequired: true,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    width: .5,
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.outline,
                                  ),
                                ),
                                child: Column(
                                  children: [
                                    _number('Protein g (optional)', _protein),
                                    const SizedBox(height: 12),
                                    _number('Carbs g (optional)', _carbs),
                                    const SizedBox(height: 12),
                                    _number(
                                      'Fat g (optional)',
                                      _fat,
                                      last: true,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                          const SizedBox(height: 16),
                          // Nothing to save while the summary is showing: the way out is a
                          // quiet Done, and Save appears with the form.
                          if (summary && !_dirty)
                            Pressable(
                              child: OutlinedButton(
                                onPressed: _busy
                                    ? null
                                    : () => Navigator.pop(context),
                                child: const Text('Done'),
                              ),
                            )
                          else ...[
                            Pressable(
                              child: served == null && _meal.photoPath != null
                                  ? FilledButton.tonal(
                                      onPressed: _busy ? null : _save,
                                      child: const Text('Save meal'),
                                    )
                                  : FilledButton(
                                      onPressed: _busy ? null : _save,
                                      child: const Text('Save meal'),
                                    ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              blank
                                  ? 'Protein, carbs and fat are optional.'
                                  : 'Saving counts the meal as fully eaten again. Empty macros stay empty.',
                            ),
                          ],
                          if (analysis != null) ...[
                            const Divider(height: 32),
                            Text(
                              'Recognized foods and nutrient sources',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            for (
                              var index = 0;
                              index <
                                  (analysis['components'] as List? ?? [])
                                      .length;
                              index++
                            )
                              Builder(
                                builder: (_) {
                                  final c = Map<String, dynamic>.from(
                                    (analysis['components'] as List)[index]
                                        as Map,
                                  );
                                  final source = Map<String, dynamic>.from(
                                    c['source'] as Map,
                                  );
                                  final current = canCorrect
                                      ? _meal.componentMassG(index)
                                      : null;
                                  final original = c['massG'] is num
                                      ? (c['massG'] as num).toDouble()
                                      : null;
                                  final foodId = _meal.foodOverrides[index],
                                      record = foodId == null
                                          ? null
                                          : manualFood(foodId);
                                  final foodName = canCorrect
                                      ? _meal.componentName(index)
                                      : c['name'] as String;
                                  final kcal = canCorrect
                                      ? _meal.componentKcal(index)
                                      : null;
                                  final scheme = Theme.of(context).colorScheme;
                                  // One card per food: what it is in the ink colour, where
                                  // its numbers come from in the secondary colour, and both
                                  // corrections side by side under it. The plain text is
                                  // unchanged, so it reads the same to tests and readers.
                                  return Container(
                                    margin: const EdgeInsets.symmetric(
                                      vertical: 6,
                                    ),
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      12,
                                      8,
                                      4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: scheme.surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(16),
                                      border: Border.all(color: scheme.outline),
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Expanded(
                                              child: Text.rich(
                                                TextSpan(
                                                  children: [
                                                    TextSpan(
                                                      text:
                                                          '$foodName · ${current == null ? c['massG'] : _displayNutrient(current)} g · ${record?.preparation ?? c['preparation']}',
                                                      style: Theme.of(
                                                        context,
                                                      ).textTheme.titleSmall,
                                                    ),
                                                    TextSpan(
                                                      text:
                                                          '\n${record != null
                                                              ? 'Your choice from the food database'
                                                              : source['kind'] == 'database_match'
                                                              ? 'From the food database'
                                                              : 'Estimated from the photo'}',
                                                      style: Theme.of(context)
                                                          .textTheme
                                                          .bodySmall
                                                          ?.copyWith(
                                                            color: scheme
                                                                .onSurfaceVariant,
                                                          ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            ),
                                            if (kcal != null)
                                              Padding(
                                                padding: const EdgeInsets.only(
                                                  left: 12,
                                                  right: 8,
                                                ),
                                                child: Text(
                                                  '${kcal.round()} kcal',
                                                  style: Theme.of(
                                                    context,
                                                  ).textTheme.titleSmall,
                                                ),
                                              ),
                                          ],
                                        ),
                                        if (record != null) ...[
                                          Text(
                                            'Original prediction: ${c['name']} · ${c['preparation']}',
                                          ),
                                          if ((c['assumptions'] as List? ?? [])
                                              .isNotEmpty)
                                            Text(
                                              'Original assumptions: ${(c['assumptions'] as List).join('; ')}',
                                            ),
                                          SelectableText(record.sourceUrl),
                                        ] else if ((c['assumptions'] as List? ??
                                                [])
                                            .isNotEmpty)
                                          Text(
                                            (c['assumptions'] as List).join(
                                              '; ',
                                            ),
                                          ),
                                        if (_meal.portionInputs[index]
                                            case final portion?)
                                          Text(
                                            portion.unit == 'batch'
                                                ? '${portion.numerator}/${portion.denominator} of the photographed food'
                                                : '${portion.numerator}/${portion.denominator} of ${_displayNutrient(portion.amount)} ${portion.unit}',
                                          ),
                                        if (_meal.portionOverrides.containsKey(
                                          index,
                                        ))
                                          Text(
                                            'Original estimate: ${_displayNutrient(original)} g${current == 0 ? ' · Not counted in the totals' : ''}',
                                          ),
                                        if (canCorrect)
                                          Wrap(
                                            children: [
                                              Tooltip(
                                                message:
                                                    'Edit portion for $foodName',
                                                child: TextButton(
                                                  onPressed: _busy || _dirty
                                                      ? null
                                                      : () => _portion(index),
                                                  child: const Text(
                                                    'Edit portion',
                                                  ),
                                                ),
                                              ),
                                              Tooltip(
                                                message:
                                                    'Change food for $foodName',
                                                child: TextButton(
                                                  onPressed: _busy || _dirty
                                                      ? null
                                                      : () => _food(index),
                                                  child: const Text(
                                                    'Change food',
                                                  ),
                                                ),
                                              ),
                                            ],
                                          )
                                        else
                                          const SizedBox(height: 8),
                                      ],
                                    ),
                                  );
                                },
                              ),
                            // What still needs the user: amber, the product's colour for
                            // "needs review", and the answers as buttons in a row.
                            if ((analysis['ambiguities'] as List? ?? [])
                                    .isNotEmpty ||
                                (question != null &&
                                    _meal.hasPendingPreparationQuestion))
                              Container(
                                margin: const EdgeInsets.symmetric(vertical: 6),
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  12,
                                  16,
                                  8,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.needsReview.withValues(
                                    alpha: 0.12,
                                  ),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: AppColors.needsReview.withValues(
                                      alpha: 0.5,
                                    ),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Needs a look',
                                      style: Theme.of(
                                        context,
                                      ).textTheme.labelLarge,
                                    ),
                                    const SizedBox(height: 8),
                                    for (final ambiguity
                                        in (analysis['ambiguities'] as List? ??
                                            []))
                                      Text('Unresolved: $ambiguity'),
                                    if (question != null &&
                                        _meal
                                            .hasPendingPreparationQuestion) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        question['text'] as String,
                                        style: Theme.of(
                                          context,
                                        ).textTheme.titleSmall,
                                      ),
                                      Wrap(
                                        spacing: 4,
                                        children: [
                                          for (final raw
                                              in question['options'] as List)
                                            TextButton(
                                              onPressed: _busy || _dirty
                                                  ? null
                                                  : () => _answer(
                                                      (raw as Map)['id']
                                                          as String,
                                                    ),
                                              child: Text(
                                                (raw as Map)['label'] as String,
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            if (question?['answered'] == true)
                              Text(
                                'Preparation: ${analysis['userPreparationAnswer'] ?? question!['answer']}',
                              ),
                            if (_meal.hasManualNutritionOverride)
                              const Text(
                                'Totals were manually corrected. Original recognition is retained for comparison.',
                              ),
                          ],
                          if (_meal.served != null) ...[
                            if (_dirty)
                              const Text(
                                'Save changes before changing how much you ate or repeating this meal.',
                              ),
                            const Divider(height: 32),
                            Text(
                              'How much did you eat?',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              children: [
                                _amount('Ate all', 1, selected: !partly),
                                _amount(
                                  'Ate half',
                                  .5,
                                  selected: fraction == .5,
                                ),
                                OutlinedButton(
                                  onPressed: _busy || _dirty
                                      ? null
                                      : () async {
                                          var text = '', invalid = false;
                                          final share = await showDialog<double>(
                                            context: context,
                                            builder: (context) => StatefulBuilder(
                                              builder:
                                                  (
                                                    context,
                                                    setDialogState,
                                                  ) => AlertDialog(
                                                    title: const Text(
                                                      'Share of the whole meal',
                                                    ),
                                                    content: TextField(
                                                      autofocus: true,
                                                      onChanged: (v) =>
                                                          text = v,
                                                      decoration: InputDecoration(
                                                        labelText:
                                                            'Fraction eaten (e.g. 1/3)',
                                                        errorText: invalid
                                                            ? 'Enter a share between 0 and 1.'
                                                            : null,
                                                      ),
                                                    ),
                                                    actions: [
                                                      TextButton(
                                                        onPressed: () =>
                                                            Navigator.pop(
                                                              context,
                                                            ),
                                                        child: const Text(
                                                          'Cancel',
                                                        ),
                                                      ),
                                                      FilledButton(
                                                        onPressed: () {
                                                          final part =
                                                              parsePortionShare(
                                                                text,
                                                              );
                                                          if (part == null) {
                                                            setDialogState(
                                                              () => invalid =
                                                                  true,
                                                            );
                                                            return;
                                                          }
                                                          Navigator.pop(
                                                            context,
                                                            part.$1 / part.$2,
                                                          );
                                                        },
                                                        child: const Text(
                                                          'Apply',
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                            ),
                                          );
                                          if (mounted && share != null) {
                                            await _consume(share);
                                          }
                                        },
                                  child: const Text('Other share'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Meals count in full unless you say otherwise.',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 8),
                            OutlinedButton(
                              onPressed: _busy || _dirty ? null : _repeat,
                              child: const Text('Repeat meal'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_meal.photoPath != null)
              Positioned(
                top: 8,
                left: 12,
                right: 12,
                child: Semantics(
                  sortKey: const OrdinalSortKey(0.0),
                  container: true,
                  child: Row(
                    children: [
                      if (Navigator.canPop(context))
                        _heroAction(
                          'Back',
                          Icons.arrow_back,
                          () => Navigator.maybePop(context),
                        ),
                      const Spacer(),
                      if (_hasSaved)
                        _heroAction(
                          'Export meal',
                          Icons.download_outlined,
                          _busy || _exporting ? null : _export,
                        ),
                      const SizedBox(width: 8),
                      _heroAction(
                        'Delete meal',
                        Icons.delete_outline,
                        _busy ? null : _delete,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// What a meal counts for: all of it, unless the user said they ate less.
/// A logged meal is an eaten meal; "half" is the exception, not a second step.
double _countedKcal(Tier1Meal meal) =>
    meal.consumedKcal ?? meal.served?.kcal ?? 0;

int _eatenKcal(List<Tier1Meal> meals) =>
    meals.fold<double>(0, (sum, m) => sum + _countedKcal(m)).round();
