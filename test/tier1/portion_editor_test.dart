import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:calorix/core/time/clock.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/tier1_cloud.dart';
import '../scan/support/fake_camera_service.dart';
import 'support/portion_fixtures.dart';

class _Store extends Tier1MealStore {
  _Store():super(Directory('.'));
  final records=<Tier1Meal>[];
  bool conflict=false,fail=false;
  @override
  Future<List<Tier1Meal>> load() async=>List.of(records);
  @override
  Future<void> save(Tier1Meal meal) async {
    final index=records.indexWhere((m)=>m.id==meal.id);
    final saved=meal.withRevision(index<0?1:records[index].revision+1);
    if(index<0){records.add(saved);}else{records[index]=saved;}
  }
  @override
  Future<bool> replaceIfRevision(Tier1Meal meal,int expected) async {
    if(fail){fail=false;throw FileSystemException('fixture write refused');}
    final index=records.indexWhere((m)=>m.id==meal.id);
    if(index<0)return false;
    if(conflict){conflict=false;records[index]=records[index].edit('Concurrent',Tier1Nutrients(kcal:777)).withRevision(records[index].revision+1);return false;}
    if(records[index].revision!=expected)return false;
    await save(meal);return true;
  }
}
class _Cloud extends Tier1Cloud {
  int calls=0;
  @override
  Future<Map<String,dynamic>> analyze(String path,{required bool consent}) async {
    assert(consent);calls++;return portionAnalysis()..['mealName']='Refreshed meal';
  }
}
Finder editAlmond()=>find.byTooltip('Edit portion for Almonds');
Finder grams()=>find.widgetWithText(TextFormField,'Served grams');
Future<void> visible(WidgetTester tester,Finder target,{double delta=160}) async {
  await tester.scrollUntilVisible(target,delta,scrollable:find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}
Future<_Store> open(WidgetTester tester,{_Cloud? cloud}) async {
  final store=_Store();await store.save(portionMeal(photo:cloud!=null).confirmConsumption(.5));
  await tester.pumpWidget(Tier1App(store:store,camera:FakeCameraService(),cloud:cloud,
    clock:FakeClock(tz.TZDateTime.utc(2026,11,8,12))));
  await tester.pumpAndSettle();await tester.tap(find.text('History'));await tester.pumpAndSettle();
  await tester.tap(find.text('Portion meal'));await tester.pumpAndSettle();return store;
}
Future<void> dialog(WidgetTester tester) async {
  await visible(tester,editAlmond());await tester.tap(editAlmond());await tester.pumpAndSettle();
  expect(find.byType(AlertDialog),findsOneWidget);expect(grams(),findsOneWidget);
}
Future<void> apply(WidgetTester tester,String value) async {
  await tester.enterText(grams(),value);await tester.tap(find.text('Apply portion'));await tester.pumpAndSettle();
}

void main(){
  testWidgets('edit grams recalculates totals locally and retains original analysis', (tester) async {
    final cloud=_Cloud(),store=await open(tester,cloud:cloud);final original=store.records.single;
    await dialog(tester);expect(tester.widget<TextFormField>(grams()).controller?.text??tester.widget<TextFormField>(grams()).initialValue,'55');
    await apply(tester,'86');expect(find.byType(AlertDialog),findsNothing);
    final saved=store.records.single;
    expect(saved.served!.kcal,closeTo(613.5,1e-9));expect(saved.consumedFraction,isNull);
    expect(saved.analysis,original.analysis);expect(saved.toJson()['portionOverrides'],{'1':86.0});
    expect(saved.source,'portion_correction');expect(cloud.calls,0);
    expect(find.text('Meal estimate'),findsOneWidget);expect(tester.takeException(),isNull);
    await visible(tester,find.text('Ate half'));await tester.tap(find.text('Ate half'));await tester.pumpAndSettle();
    expect(store.records.single.consumedKcal,closeTo(306.75,1e-9));
  });
  testWidgets('cancel with focused keyboard and unchanged apply preserve intake and history', (tester) async {
    final store=await open(tester);final before=store.records.single.toJson();
    await dialog(tester);await tester.enterText(grams(),'86');await tester.tap(find.text('Cancel'));await tester.pumpAndSettle();
    expect(store.records.single.toJson(),before);expect(tester.takeException(),isNull);
    await dialog(tester);await tester.tap(find.text('Apply portion'));await tester.pumpAndSettle();
    expect(store.records.single.toJson(),before);expect(tester.takeException(),isNull);
  });
  testWidgets('invalid grams stay in dialog without changing the saved meal', (tester) async {
    final store=await open(tester);final before=store.records.single.toJson();await dialog(tester);
    for(final value in ['', '-1','NaN','100001']){
      await apply(tester,value);expect(find.byType(AlertDialog),findsOneWidget);
      expect(find.textContaining('finite weight'),findsOneWidget);expect(store.records.single.toJson(),before);
    }
    await tester.tap(find.text('Cancel'));await tester.pumpAndSettle();expect(tester.takeException(),isNull);
  });
  testWidgets('restore uses exact original totals and survives editor save/reopen', (tester) async {
    final store=await open(tester);final original=store.records.single;
    await dialog(tester);await apply(tester,'86');
    await dialog(tester);await tester.tap(find.text('Use original'));await tester.pumpAndSettle();
    expect(store.records.single.served!.toJson(),original.served!.toJson());
    expect(store.records.single.toJson().containsKey('portionOverrides'),isFalse);
    await visible(tester,find.text('Save meal'),delta:-160);await tester.tap(find.text('Save meal'));await tester.pumpAndSettle();
    expect(find.text('Meal estimate'),findsNothing);
    await tester.tap(find.text('Portion meal'));await tester.pumpAndSettle();
    expect(find.text('Meal estimate'),findsOneWidget);expect(store.records.single.served!.toJson(),original.served!.toJson());
    expect(tester.takeException(),isNull);
  });
  testWidgets('dirty totals disable portion editing and committed manual totals require disclosure', (tester) async {
    final store=await open(tester);
    final kcal=find.widgetWithText(TextFormField,'Served kcal');await tester.enterText(kcal,'999');
    await visible(tester,editAlmond());
    final button=find.descendant(of:editAlmond(),matching:find.byType(TextButton));
    expect(tester.widget<TextButton>(button).onPressed,isNull);
    await visible(tester,find.text('Save meal'),delta:-160);await tester.tap(find.text('Save meal'));await tester.pumpAndSettle();
    expect(store.records.single.served!.kcal,999);
    await tester.tap(find.text('Portion meal'));await tester.pumpAndSettle();await dialog(tester);
    expect(find.textContaining('manual totals'),findsOneWidget);
    await apply(tester,'86');expect(store.records.single.served!.kcal,closeTo(613.5,1e-9));
  });
  testWidgets('stale revision cannot overwrite a newer record', (tester) async {
    final store=await open(tester);await dialog(tester);store.conflict=true;await apply(tester,'86');
    expect(store.records.single.name,'Concurrent');expect(store.records.single.served!.kcal,777);
    expect(store.records.single.toJson().containsKey('portionOverrides'),isFalse);
    expect(find.text('Meal estimate'),findsNothing);expect(tester.takeException(),isNull);
  });
  testWidgets('save error keeps editor usable and tells user to check saved values', (tester) async {
    final store=await open(tester);final before=store.records.single.toJson();
    await dialog(tester);store.fail=true;await apply(tester,'86');
    expect(store.records.single.toJson(),before);expect(find.text('Meal estimate'),findsOneWidget);
    await visible(tester,find.textContaining('Reopen the meal'),delta:-160);
    expect(tester.takeException(),isNull);
  });
  testWidgets('explicit new inference archives corrected baseline without extra portion requests', (tester) async {
    final cloud=_Cloud(),store=await open(tester,cloud:cloud);
    await dialog(tester);await apply(tester,'86');expect(cloud.calls,0);
    await visible(tester,find.text('Estimate photo'),delta:-160);await tester.tap(find.text('Estimate photo'));await tester.pumpAndSettle();
    await tester.tap(find.text('Send photo'));await tester.pumpAndSettle();
    expect(cloud.calls,1);expect(store.records.single.toJson().containsKey('portionOverrides'),isFalse);
    final history=store.records.single.toJson()['adjustmentHistory'] as List;
    final previous=(history.last as Map)['previous'] as Map;
    expect(previous['portionOverrides'],{'1':86.0});expect((previous['served'] as Map)['kcal'],closeTo(613.5,1e-9));
    expect((history.last as Map)['kind'],'new_estimate');expect(tester.takeException(),isNull);
  });
}
