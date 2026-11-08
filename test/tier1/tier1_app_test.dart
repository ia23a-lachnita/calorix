import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/shared/services/camera_service.dart';
import '../scan/support/fake_camera_service.dart';

class _MemoryStore extends Tier1MealStore {
  _MemoryStore():super(Directory('.'));
  final List<Tier1Meal> records=[];
  @override
  Future<List<Tier1Meal>> load() async => List.of(records);
  @override
  Future<void> save(Tier1Meal meal) async {
    records.removeWhere((m)=>m.id==meal.id);
    records.add(meal.withRevision(meal.revision+1));
  }
}

class _ThrowingCamera extends FakeCameraService implements CameraLifecycleService {
  @override
  Future<void> resume() async => throw StateError('Camera unavailable');
  @override
  Future<void> pause() async {}
  @override
  Future<void> dispose() async {}
}

void main() {
  testWidgets('offline manual save and history work without cloud initialization', (tester) async {
    final store=_MemoryStore();
    var cloudStarts=0;
    final CameraService camera=FakeCameraService();
    await tester.pumpWidget(Tier1App(store:store,camera:camera,initializeCloud:() async {cloudStarts++;}));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField,'Meal name'),'Weighed test');
    await tester.enterText(find.widgetWithText(TextFormField,'Served kcal'),'420');
    await tester.ensureVisible(find.text('Save meal'));
    await tester.tap(find.text('Save meal'));
    await tester.pumpAndSettle();
    expect(find.text('Weighed test'),findsWidgets);
    expect(find.textContaining('Approximate served'),findsWidgets);
    expect(cloudStarts,0);
    final saved=(await store.load()).single;
    expect(saved.served!.kcal,420);
    expect(saved.consumedKcal,isNull);
  });
  testWidgets('camera initialization failure leaves manual entry available', (tester) async {
    await tester.pumpWidget(Tier1App(store:_MemoryStore(),camera:_ThrowingCamera()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manual entry'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField,'Meal name'),findsOneWidget);
  });

}
