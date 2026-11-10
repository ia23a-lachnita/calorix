import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';
import '../scan/support/fake_camera_service.dart';
import 'support/portion_fixtures.dart';

class _Store extends Tier1MealStore {
  _Store():super(Directory('.'));
  final rows=<Tier1Meal>[];
  bool conflict=false,fail=false,refreshFail=false;
  int _badLoads=0;
  @override Future<List<Tier1Meal>> load() async {if(_badLoads>0){_badLoads--;throw const FileSystemException('owned reload failure');}return List.of(rows);}
  @override Future<void> save(Tier1Meal m) async {final i=rows.indexWhere((r)=>r.id==m.id);final saved=m.withRevision(i<0?1:rows[i].revision+1);if(i<0){rows.add(saved);}else{rows[i]=saved;}}
  @override Future<bool> replaceIfRevision(Tier1Meal m,int revision) async {
    if(fail)throw const FileSystemException('owned write failure');
    final i=rows.indexWhere((r)=>r.id==m.id);if(i<0)return false;
    if(conflict){rows[i]=rows[i].edit('Concurrent',Tier1Nutrients(kcal:777)).withRevision(revision+1);return false;}
    if(rows[i].revision!=revision)return false;
    await save(m);if(refreshFail)_badLoads=1;return true;
  }
}
class _Sink extends WorkflowSink {
  final events=<Map<String,dynamic>>[];
  @override Future<void> append(String id,List<Map<String,dynamic>> value) async {events.addAll(value);}
  @override Future<Map<String,dynamic>> export({required DateTime at,String? mealId}) async=>workflowExportData(at:at,meals:[]);
}
Future<(_Store,_Sink)> open(WidgetTester t,{bool question=false,bool equalEnergy=false}) async {
  final store=_Store(),sink=_Sink();var meal=portionMeal(question:question);
  if(equalEnergy){final a=portionAnalysis();(a['components'] as List)[1]['nutrients']['kcal']=71.5;a['totals']['kcal']=169.0;meal=meal.withAnalysis(a);}
  await store.save(meal.confirmConsumption(.5));
  await t.pumpWidget(Tier1App(store:store,camera:FakeCameraService(),workflow:sink));await t.pumpAndSettle();
  await t.tap(find.text('History'));await t.pumpAndSettle();await t.tap(find.text('Portion meal'));await t.pumpAndSettle();return (store,sink);
}
Future<void> visible(WidgetTester t,Finder f) async {await t.scrollUntilVisible(f,150,scrollable:find.byType(Scrollable).first);await t.pumpAndSettle();}
Future<void> dialog(WidgetTester t) async {final f=find.byTooltip('Change food for Almonds');await visible(t,f);await t.tap(f);await t.pumpAndSettle();expect(find.byType(AlertDialog),findsOneWidget);}
Future<void> selectRice(WidgetTester t) async {
  await t.enterText(find.widgetWithText(TextField,'Search nutrient records'),'rice white');await t.pumpAndSettle();
  final choice=find.text('Rice, white, long-grain, regular, enriched, cooked');expect(choice,findsOneWidget);
  await t.tap(choice);await t.pumpAndSettle();await t.tap(find.text('Apply food'));await t.pumpAndSettle();
}
void main(){
  testWidgets('optional local selection preserves estimated grams and original recognition', (t)async{
    final (store,sink)=await open(t);final old=store.rows.single;await dialog(t);
    expect(find.textContaining('55 g'),findsWidgets);await selectRice(t);
    final saved=store.rows.single;expect(saved.served!.kcal,169);expect(saved.analysis,old.analysis);
    expect(saved.componentMassG(1),55);expect(saved.consumedFraction,isNull);expect(saved.revision,old.revision+1);
    expect(find.textContaining('User-selected nutrient record'),findsWidgets);
    expect(sink.events.where((e)=>e['kind']=='food_saved').length,1);
    expect(t.takeException(),isNull);
  });
  testWidgets('cancel and back leave record revision intake untouched', (t)async{
    final (store,sink)=await open(t);final before=store.rows.single.toJson();
    await dialog(t);await t.tap(find.text('Cancel'));await t.pumpAndSettle();expect(store.rows.single.toJson(),before);
    await dialog(t);Navigator.of(t.element(find.byType(AlertDialog))).pop();await t.pumpAndSettle();
    expect(store.rows.single.toJson(),before);expect(sink.events.where((e)=>e['kind']=='food_saved'),isEmpty);
  });
  testWidgets('no-op predicted restore does not reset intake or save', (t)async{
    final (store,sink)=await open(t);final before=store.rows.single.toJson();await dialog(t);
    await t.tap(find.text('Use predicted food'));await t.pumpAndSettle();expect(store.rows.single.toJson(),before);
    expect(sink.events.where((e)=>e['kind']=='food_unchanged').length,1);
  });
  testWidgets('restore shows original exact total and labels', (t)async{
    final (store,_)=await open(t);final baseline=store.rows.single.served!.toJson();await dialog(t);await selectRice(t);
    final f=find.byTooltip('Change food for Rice, white, long-grain, regular, enriched, cooked');await visible(t,f);await t.tap(f);await t.pumpAndSettle();
    await t.tap(find.text('Use predicted food'));await t.pumpAndSettle();expect(store.rows.single.served!.toJson(),baseline);
  });
  testWidgets('concurrent edit rejects stale food selection without overwriting', (t)async{
    final (store,sink)=await open(t);await dialog(t);store.conflict=true;await selectRice(t);
    expect(store.rows.single.served!.kcal,777);expect(find.text('Meal changed; reopen it to edit.'),findsOneWidget);
    expect(sink.events.where((e)=>e['kind']=='food_saved'),isEmpty);expect(sink.events.where((e)=>e['kind']=='food_conflict').length,1);
  });
  testWidgets('write failure leaves original and explains failure', (t)async{
    final (store,sink)=await open(t);final before=store.rows.single.toJson();await dialog(t);store.fail=true;await selectRice(t);
    expect(store.rows.single.toJson(),before);expect(find.descendant(of:find.byType(SnackBar),matching:find.textContaining('Could not save this food')),findsOneWidget);
    expect(sink.events.where((e)=>e['kind']=='food_saved'),isEmpty);expect(sink.events.where((e)=>e['kind']=='food_failed').length,1);
  });
  testWidgets('successful commit followed by failed refresh is still recorded as saved', (t)async{
    final (store,sink)=await open(t);await dialog(t);store.refreshFail=true;await selectRice(t);
    expect(store.rows.single.served!.kcal,169);expect(sink.events.where((e)=>e['kind']=='food_saved').length,1);
    expect(sink.events.where((e)=>e['kind']=='food_failed'),isEmpty);expect(find.textContaining('Food saved, but could not refresh'),findsOneWidget);
  });
  testWidgets('dirty whole-meal edit disables food correction', (t)async{
    await open(t);await t.enterText(find.widgetWithText(TextFormField,'Meal name'),'Changed');
    final f=find.byTooltip('Change food for Almonds');await visible(t,f);
    expect(t.widget<TextButton>(find.descendant(of:f,matching:find.byType(TextButton))).onPressed,isNull);
  });
  testWidgets('food correction excludes later portion from original-analysis metric', (t)async{
    final (_,sink)=await open(t,equalEnergy:true);await dialog(t);await selectRice(t);
    final edit=find.byTooltip('Edit portion for Rice, white, long-grain, regular, enriched, cooked');await visible(t,edit);await t.tap(edit);await t.pumpAndSettle();
    expect(find.text('Portion: Rice, white, long-grain, regular, enriched, cooked'),findsOneWidget);
    expect(find.textContaining('Original prediction: Almonds'),findsWidgets);
    await t.enterText(find.widgetWithText(TextFormField,'Served grams'),'86');await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    final event=sink.events.singleWhere((e)=>e['kind']=='portion_saved');expect(event['beforeFromOriginalAnalysis'],false);
    for(final event in sink.events){expect(event.keys, isNot(contains('recordId')));expect(event.keys,isNot(contains('query')));expect(event.keys,isNot(contains('foodName')));}
  });
}
