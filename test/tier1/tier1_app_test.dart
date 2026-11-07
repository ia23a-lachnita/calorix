import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/shared/services/camera_service.dart';
import '../scan/support/fake_camera_service.dart';

void main() {
  testWidgets('offline manual save and history work without cloud initialization', (tester) async {
    final root=await Directory.systemTemp.createTemp('calorix-tier1-widget-');
    addTearDown(() => root.delete(recursive:true));
    var cloudStarts=0;
    final CameraService camera=FakeCameraService();
    await tester.pumpWidget(Tier1App(store:Tier1MealStore(root),camera:camera,initializeCloud:() async {cloudStarts++;}));
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
    final saved=(await Tier1MealStore(root).load()).single;
    expect(saved.served!.kcal,420);
    expect(saved.consumedKcal,isNull);
  });
}
