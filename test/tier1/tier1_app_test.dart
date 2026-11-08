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

  testWidgets('repeat confirmation closes cleanly and resets consumption', (tester) async {
    final store=_MemoryStore();
    await store.save(Tier1Meal(id:'repeat-source',capturedAt:DateTime.utc(2026,11,8),name:'Repeat source',served:Tier1Nutrients(kcal:420)).confirmConsumption(1));
    await tester.pumpWidget(Tier1App(store:store,camera:FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Repeat source'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Repeat meal'),200,scrollable:find.byType(Scrollable).first);
    await tester.tap(find.text('Repeat meal'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last,'1.5');
    await tester.pump();
    await tester.tap(find.text('Confirm repeat'));
    await tester.pumpAndSettle();
    expect(tester.takeException(),isNull);
    final repeated=(await store.load()).where((m)=>m.repeatOf=='repeat-source').single;
    expect(repeated.served!.kcal,630);
    expect(repeated.consumedKcal,isNull);
    expect(find.text('Camera'),findsOneWidget);
  });

  testWidgets('cancel repeat preserves the source and stays in the editor', (tester) async {
    final store=_MemoryStore();
    await store.save(Tier1Meal(id:'cancel-source',capturedAt:DateTime.utc(2026,11,8),name:'Cancel source',served:Tier1Nutrients(kcal:420)).confirmConsumption(1));
    await tester.pumpWidget(Tier1App(store:store,camera:FakeCameraService()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('History'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel source'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Repeat meal'),200,scrollable:find.byType(Scrollable).first);
    await tester.tap(find.text('Repeat meal'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last,'1.5');
    await tester.pump();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(tester.takeException(),isNull);
    expect(find.text('Meal estimate'),findsOneWidget);
    expect((await store.load()).single.consumedKcal,420);
  });

}
