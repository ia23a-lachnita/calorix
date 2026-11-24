import 'dart:io';
import 'package:camera/camera.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/shared/services/camera_service.dart';
import 'package:flutter_test/flutter_test.dart';
import '../scan/support/fake_camera_service.dart';

class _Store extends Tier1MealStore {
  _Store() : super(Directory('.'));
  @override
  Future<List<Tier1Meal>> load() async => [];
}

class _FlashCamera extends FakeCameraService implements CameraFlashService {
  FlashMode? mode = FlashMode.off;
  bool fail = false;
  @override
  FlashMode? get currentFlashMode => mode;
  @override
  Future<void> setFlashMode(FlashMode next) async {
    if (fail) throw StateError('unsupported');
    mode = next;
  }
}

void main() {
  testWidgets('flash reflects actual camera mode and recovers from failure',
      (tester) async {
    final camera = _FlashCamera();
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Flash off'));
    await tester.pumpAndSettle();
    expect(camera.mode, FlashMode.auto);
    expect(find.byTooltip('Flash auto'), findsOneWidget);
    camera.fail = true;
    await tester.tap(find.byTooltip('Flash auto'));
    await tester.pumpAndSettle();
    expect(camera.mode, FlashMode.auto);
    expect(find.byTooltip('Flash auto'), findsOneWidget);
    expect(find.text('Flash could not be changed.'), findsOneWidget);
    camera.fail = false;
    await tester.tap(find.byTooltip('Flash auto'));
    await tester.pumpAndSettle();
    expect(camera.mode, FlashMode.always);
    await tester.tap(find.byTooltip('Flash on'));
    await tester.pumpAndSettle();
    expect(camera.mode, FlashMode.off);
  });
  testWidgets('unavailable flash is disabled', (tester) async {
    final camera = _FlashCamera()..mode = null;
    await tester.pumpWidget(Tier1App(store: _Store(), camera: camera));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Flash unavailable'), findsOneWidget);
    await tester.tap(find.byTooltip('Flash unavailable'), warnIfMissed: false);
    expect(camera.mode, isNull);
  });
}
