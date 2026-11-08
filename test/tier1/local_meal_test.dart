import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';

void main() {
  final date=DateTime.utc(2026,11,8,12);
  Tier1Meal meal(String id) => Tier1Meal(id:id,capturedAt:date,name:'Rice',served:Tier1Nutrients(kcal:260,proteinG:5.38,carbsG:56.34,fatG:0.56));
  test('manual served estimate stays unknown consumption until confirmed; repeat resets it', () {
    final m=meal('a');
    expect(m.consumedKcal,isNull);
    expect(m.consumptionSource,'served_only');
    final confirmed=m.confirmConsumption(0.5);
    expect(confirmed.consumedKcal,130);
    expect(confirmed.served!.kcal,260);
    final repeated=confirmed.repeat('b',date.add(const Duration(days:1)),1.5);
    expect(repeated.served!.kcal,390);
    expect(repeated.repeatOf,'a');
    expect(repeated.consumedKcal,isNull);
    expect(repeated.cloudConsent,isFalse);
    expect(() => m.confirmConsumption(double.nan),throwsArgumentError);
  });
  test('serialized local meals retain capture day, provenance and explicit intake', () {
    final m=meal('a').confirmConsumption(1);
    final copy=Tier1Meal.fromJson(m.toJson());
    expect(copy.capturedAt,date);
    expect(copy.consumedKcal,260);
    expect(copy.consumptionSource,'confirmed_fraction');
  });
  test('store serializes concurrent writes and refuses to overwrite malformed history', () async {
    final root=await Directory.systemTemp.createTemp('calorix-tier1-test-');
    addTearDown(() => root.delete(recursive:true));
    final store=Tier1MealStore(root);
    await Future.wait([store.save(meal('a')),store.save(meal('b'))]);
    expect((await store.load()).map((m)=>m.id).toSet(),{'a','b'});
    await File('${root.path}/meals.json').writeAsString('invalid-json');
    await expectLater(store.save(meal('c')),throwsA(isA<FormatException>()));
    expect(await File('${root.path}/meals.json').readAsString(),'invalid-json');
  });
  test('late cloud result cannot resurrect deleted meal or overwrite user edits', () async {
    final root=await Directory.systemTemp.createTemp('calorix-tier1-test-');
    addTearDown(() => root.delete(recursive:true));
    final store=Tier1MealStore(root);
    await store.save(meal('a'));
    final first=(await store.load()).single;
    await store.save(first.edit('Corrected',Tier1Nutrients(kcal:400,proteinG:1,carbsG:1,fatG:1)));
    expect(await store.replaceIfRevision(first,first.revision),isFalse);
    await store.delete('a');
    expect(await store.replaceIfRevision(first,first.revision),isFalse);
    expect(await store.load(),isEmpty);
  });
  test('unchanged edit preserves confirmed consumption and original provenance', () {
    final confirmed=meal('a').confirmConsumption(1);
    final saved=confirmed.edit('Rice',Tier1Nutrients(kcal:260,proteinG:5.38,carbsG:56.34,fatG:0.56));
    expect(saved.consumedKcal,260);
    expect(saved.source,confirmed.source);
  });
  test('preparation answer retains component arithmetic and source once', () {
    final original=meal('a').withAnalysis({
      'mealName':'Rice','totals':{'kcal':260,'proteinG':5.38,'carbsG':56.34,'fatG':.56},
      'components':[{'name':'Rice','massG':200,'nutrients':{'kcal':260,'proteinG':5.38,'carbsG':56.34,'fatG':.56},'source':{'kind':'database_match','recordId':'usda:168878'}}],
      'ambiguities':[], 'question':{'id':'added-fat','answered':false,'answer':null,'options':[
        {'id':'oil_10g','label':'About 2 tsp oil (10 g)', 'add':{'kcal':88.4,'proteinG':0,'carbsG':0,'fatG':10},
         'component':{'name':'Additional oil','massG':10,'nutrients':{'kcal':88.4,'proteinG':0,'carbsG':0,'fatG':10},'source':{'kind':'database_match','recordId':'usda:171413'}}}
      ]}});
    final answered=original.answerPreparation('oil_10g');
    expect(answered.served!.kcal,closeTo(348.4,.00001));
    final components=answered.analysis!['components'] as List;
    expect(components.length,2);
    expect((components.last as Map)['source']['recordId'],'usda:171413');
    expect(() => answered.answerPreparation('oil_10g'),throwsStateError);
  });
  test('owned camera capture is disposed after retention and delete removes retained copy', () async {
    final root=await Directory.systemTemp.createTemp('calorix-tier1-test-');
    addTearDown(() => root.delete(recursive:true));
    final captured=File('${root.path}/owned-camera-cache.jpg');
    await captured.writeAsBytes([255,216,255,217]);
    final store=Tier1MealStore(Directory('${root.path}/history'));
    final retained=await store.retainCapture('photo',captured.path);
    expect(await captured.exists(),isFalse);
    await store.save(Tier1Meal(id:'photo',capturedAt:date,name:'Photo',photoPath:retained));
    await store.delete('photo');
    expect(await File(retained).exists(),isFalse);
  });

}
