import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/tier1_cloud.dart';
import '../scan/support/fake_camera_service.dart';

const artifact=6.720000000000001;
Finder field(String label)=>find.widgetWithText(TextFormField,label);
Future<void> visible(WidgetTester tester,Finder target,{double delta=180}) async {
  await tester.scrollUntilVisible(target,delta,scrollable:find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}
Future<Tier1MealStore> store() async {
  final directory=await Directory.systemTemp.createTemp('tier1-display-test-');
  addTearDown(()=>directory.delete(recursive:true));
  return Tier1MealStore(directory);
}
Tier1Nutrients nutrients({double fat=artifact})=>Tier1Nutrients(kcal:232,proteinG:9.28,carbsG:33.6,fatG:fat);
Map<String,dynamic> analysis({double fat=artifact})=>{'schemaVersion':1,'mealName':'Floating meal','totals':nutrients(fat:fat).toJson(),'components':<dynamic>[],'ambiguities':<dynamic>[],'question':null,'provenance':{'model':'pinned-test'}};
Future<void> open(WidgetTester tester,Tier1MealStore data,{Tier1Cloud? cloud}) async {
  await tester.pumpWidget(Tier1App(store:data,camera:FakeCameraService(),cloud:cloud));
  await tester.pumpAndSettle();await tester.tap(find.text('History'));await tester.pumpAndSettle();
  await tester.tap(find.text('Floating meal'));await tester.pumpAndSettle();
}
class _Cloud extends Tier1Cloud {
  int calls=0;
  @override
  Future<Map<String,dynamic>> analyze(String photoPath,{required bool consent}) async {assert(consent);calls++;return analysis();}
}

void main() {
  for(final action in ['untouched','rename','change kcal','clear fat']) {
    testWidgets('readable floating nutrients preserve exact originals on $action', (tester) async {
      final data=await store();final original=Tier1Meal(id:'floating',capturedAt:DateTime.utc(2026,11,8),name:'Floating meal',served:nutrients(),analysis:analysis(),source:'A1',cloudConsent:true,metadata:{'fixture':true}).confirmConsumption(.5);
      await data.save(original);await open(tester,data);
      await visible(tester,field('Fat g (optional)'));
      expect(tester.widget<TextFormField>(field('Fat g (optional)')).controller!.text,'6.72');
      if(action=='rename') {
        await visible(tester,field('Meal name'),delta:-180);
        await tester.enterText(field('Meal name'),'Renamed meal');
      } else if(action=='change kcal') {
        await visible(tester,field('Served kcal'),delta:-180);await tester.enterText(field('Served kcal'),'300');
      } else if(action=='clear fat') {await tester.enterText(field('Fat g (optional)'),'');}
      await visible(tester,find.text('Save meal'));await tester.tap(find.text('Save meal'));await tester.pumpAndSettle();
      expect(tester.takeException(),isNull);
      final saved=(await data.load()).single;
      expect(saved.served!.fatG,action=='clear fat'?isNull:artifact);
      expect(saved.served!.proteinG,9.28);expect(saved.served!.carbsG,33.6);
      expect(saved.analysis,original.analysis);expect(saved.metadata,original.metadata);expect(saved.cloudConsent,isTrue);
      expect(saved.source,action=='untouched'?'A1':'manual_correction');
      expect(saved.consumedFraction,action=='change kcal'||action=='clear fat'?isNull:.5);
      expect(saved.served!.kcal,action=='change kcal'?300:232);
    });
  }
  for(final entry in <double,String>{.0035:'0.0035',1e-10:'1.0e-10'}.entries) {
    testWidgets('tiny positive ${entry.key} retains magnitude and exact saved value', (tester) async {
      final data=await store();await data.save(Tier1Meal(id:'tiny',capturedAt:DateTime.utc(2026,11,8),name:'Floating meal',served:nutrients(fat:entry.key),source:'A1').confirmConsumption(1));
      await open(tester,data);await visible(tester,field('Fat g (optional)'));
      expect(tester.widget<TextFormField>(field('Fat g (optional)')).controller!.text,entry.value);
      await visible(tester,find.text('Save meal'));await tester.tap(find.text('Save meal'));await tester.pumpAndSettle();
      final saved=(await data.load()).single;expect(saved.served!.fatG,entry.key);expect(saved.consumedFraction,1);expect(saved.source,'A1');
    });
  }
  testWidgets('fresh cloud fill is readable and unchanged save keeps original analysis', (tester) async {
    final data=await store();final file=File('${data.root.path}/fixture.png');
    await file.writeAsBytes(base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='));
    await data.save(Tier1Meal(id:'cloud',capturedAt:DateTime.utc(2026,11,8),name:'Floating meal',photoPath:file.path,source:'photo'));
    final cloud=_Cloud();await open(tester,data,cloud:cloud);
    await visible(tester,find.text('Estimate photo'));await tester.tap(find.text('Estimate photo'));await tester.pumpAndSettle();
    await tester.tap(find.text('Send photo'));await tester.pumpAndSettle();expect(cloud.calls,1);
    await visible(tester,field('Fat g (optional)'));expect(tester.widget<TextFormField>(field('Fat g (optional)')).controller!.text,'6.72');
    await visible(tester,find.text('Save meal'));await tester.tap(find.text('Save meal'));await tester.pumpAndSettle();
    final saved=(await data.load()).single;expect(saved.served!.fatG,artifact);expect(saved.source,'A1');expect(saved.analysis,analysis());
  });
}
