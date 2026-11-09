import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/tier1_cloud.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';
import 'package:calorix/features/tier1/workflow_export.dart';
import '../scan/support/fake_camera_service.dart';
import 'support/portion_fixtures.dart';

class _Store extends Tier1MealStore {
  _Store():super(Directory('.'));
  final records=<Tier1Meal>[];
  bool conflict=false;
  bool failLoadAfterReplace=false;
  Completer<bool>? pendingReplace;
  bool _failLoad=false;
  @override
  Future<List<Tier1Meal>> load() async {
    if(_failLoad)throw const FileSystemException('synthetic refresh failure');
    return List.of(records);
  }
  @override
  Future<void> save(Tier1Meal value) async {
    final index=records.indexWhere((m)=>m.id==value.id);
    final saved=value.withRevision(index<0?1:records[index].revision+1);
    if(index<0){records.add(saved);}else{records[index]=saved;}
  }
  @override
  Future<bool> replaceIfRevision(Tier1Meal value,int expected) async {
    if(pendingReplace!=null)await pendingReplace!.future;
    if(conflict)return false;
    final old=records.where((m)=>m.id==value.id).firstOrNull;
    if(old==null||old.revision!=expected)return false;
    await save(value);_failLoad=failLoadAfterReplace;return true;
  }
}
class _Sink extends WorkflowSink {
  final events=<Map<String,dynamic>>[];
  bool fail=false;
  @override
  Future<void> append(String id,List<Map<String,dynamic>> values) async {
    if(fail)throw const FileSystemException('synthetic measurement failure');
    events.addAll(values);
  }
  @override
  Future<Map<String,dynamic>> export({required DateTime at,String? mealId}) async=>workflowExportData(at:at,meals:[]);
}
class _Cloud extends Tier1Cloud {
  final response=Completer<Map<String,dynamic>>();
  @override
  Future<Map<String,dynamic>> analyze(String path,{required bool consent})=>response.future;
}
Future<void> visible(WidgetTester t,Finder f)async{await t.scrollUntilVisible(f,150,scrollable:find.byType(Scrollable).first);await t.pumpAndSettle();}
Future<void> open(WidgetTester t,_Store store,_Sink sink,int Function() tick,{_Cloud? cloud})async{
  await store.save(portionMeal(photo:cloud!=null).confirmConsumption(.5));
  await t.pumpWidget(Tier1App(store:store,camera:FakeCameraService(),cloud:cloud,workflow:sink,elapsedMilliseconds:tick));
  await t.pumpAndSettle();await t.tap(find.text('History'));await t.pumpAndSettle();
  await t.tap(find.text('Portion meal'));await t.pumpAndSettle();
}

void main(){
  testWidgets('portion save logs before/after and a foreground proxy without changing original analysis',(t)async{
    var tick=0;final store=_Store(),sink=_Sink();await open(t,store,sink,()=>tick);
    final original=store.records.single;
    await visible(t,find.byTooltip('Edit portion for Almonds'));tick=100;
    await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();
    tick=1100;await t.enterText(find.widgetWithText(TextFormField,'Served grams'),'86');
    await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    final saved=sink.events.where((e)=>e['kind']=='portion_saved').single;
    expect(saved['beforeKcal'],original.served!.kcal);expect(saved['afterKcal'],store.records.single.served!.kcal);
    expect(saved['dialogForegroundMs'],1000);expect(saved['beforeFromOriginalAnalysis'],true);expect(saved['priorPortionAdjustmentCount'],0);
    expect(store.records.single.analysis,original.analysis);expect(store.records.single.consumedFraction,isNull);
  });
  testWidgets('cancel and no-change preserve meal bytes and do not record a saved correction',(t)async{
    final store=_Store(),sink=_Sink();await open(t,store,sink,()=>0);final before=store.records.single.toJson();
    await visible(t,find.byTooltip('Edit portion for Almonds'));await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();
    await t.tap(find.text('Cancel'));await t.pumpAndSettle();
    await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    expect(store.records.single.toJson(),before);expect(sink.events.where((e)=>e['kind']=='portion_saved'),isEmpty);
    expect(sink.events.any((e)=>e['kind']=='portion_cancelled'),true);expect(sink.events.any((e)=>e['kind']=='portion_unchanged'),true);
  });
  testWidgets('measurement write failure cannot prevent a portion save',(t)async{
    final store=_Store(),sink=_Sink()..fail=true;await open(t,store,sink,()=>0);
    await visible(t,find.byTooltip('Edit portion for Almonds'));await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();
    await t.enterText(find.widgetWithText(TextFormField,'Served grams'),'86');await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    expect(store.records.single.portionOverrides,{1:86.0});expect(t.takeException(),isNull);
  });
  testWidgets('revision conflict never records a successful portion correction',(t)async{
    final store=_Store(),sink=_Sink();await open(t,store,sink,()=>0);store.conflict=true;
    await visible(t,find.byTooltip('Edit portion for Almonds'));await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();
    await t.enterText(find.widgetWithText(TextFormField,'Served grams'),'86');await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    expect(sink.events.where((e)=>e['kind']=='portion_saved'),isEmpty);expect(sink.events.any((e)=>e['kind']=='portion_conflict'),true);
  });
  testWidgets('analysis wait is excluded and a reopened meal has unknown shutter timing',(t)async{
    var tick=0;final store=_Store(),sink=_Sink(),cloud=_Cloud();await open(t,store,sink,()=>tick,cloud:cloud);
    tick=1000;await t.tap(find.text('Estimate photo'));await t.pumpAndSettle();
    tick=2000;await t.tap(find.text('Send photo'));await t.pump();
    tick=12000;cloud.response.complete(portionAnalysis());await t.pumpAndSettle();
    final saved=sink.events.where((e)=>e['kind']=='analysis_saved').single;
    expect(saved['waitingMs'],10000);expect(saved['foregroundMs']-saved['waitingMs'],2000);
    expect(saved['shutterToSavedMs'],isNull);
    final frame=sink.events.where((e)=>e['kind']=='result_frame').single;expect(frame['shutterToFrameMs'],isNull);
  });
  testWidgets('background time is excluded from a portion-dialog foreground proxy',(t)async{
    var tick=0;final store=_Store(),sink=_Sink();await open(t,store,sink,()=>tick);
    await visible(t,find.byTooltip('Edit portion for Almonds'));await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();
    tick=100;
    for(final state in [AppLifecycleState.inactive,AppLifecycleState.hidden,AppLifecycleState.paused]){t.binding.handleAppLifecycleStateChanged(state);}
    tick=5100;
    for(final state in [AppLifecycleState.hidden,AppLifecycleState.inactive,AppLifecycleState.resumed]){t.binding.handleAppLifecycleStateChanged(state);}
    tick=5300;await t.enterText(find.widgetWithText(TextFormField,'Served grams'),'86');await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    expect(sink.events.where((e)=>e['kind']=='portion_saved').single['dialogForegroundMs'],300);
  });
  testWidgets('unsaved manual cancel produces no measurement journal',(t)async{
    final store=_Store(),sink=_Sink();await t.pumpWidget(Tier1App(store:store,camera:FakeCameraService(),workflow:sink));await t.pumpAndSettle();
    await t.tap(find.text('Manual entry'));await t.pumpAndSettle();await t.tap(find.byTooltip('Back'));await t.pumpAndSettle();
    expect(store.records,isEmpty);expect(sink.events,isEmpty);
  });
  testWidgets('committed analysis with failed refresh stays saved rather than failed',(t)async{
    final store=_Store(),sink=_Sink(),cloud=_Cloud();await open(t,store,sink,()=>0,cloud:cloud);
    store.failLoadAfterReplace=true;
    await t.tap(find.text('Estimate photo'));await t.pumpAndSettle();await t.tap(find.text('Send photo'));await t.pump();
    cloud.response.complete(portionAnalysis());await t.pumpAndSettle();
    expect(sink.events.where((e)=>e['kind']=='analysis_saved'),hasLength(1));
    expect(sink.events.where((e)=>e['kind']=='analysis_failed'),isEmpty);
    expect(sink.events.where((e)=>e['kind']=='analysis_refresh_failed'),hasLength(1));
    expect(store.records.single.source,'A1');expect(t.takeException(),isNull);
  });
  testWidgets('analysis completing after navigation records success without disposed refresh',(t)async{
    final store=_Store(),sink=_Sink(),cloud=_Cloud();await open(t,store,sink,()=>0,cloud:cloud);
    await t.tap(find.text('Estimate photo'));await t.pumpAndSettle();await t.tap(find.text('Send photo'));await t.pump();
    await t.tap(find.byTooltip('Back'));await t.pumpAndSettle();
    cloud.response.complete({...portionAnalysis(),'mealName':'Changed prediction'});await t.pumpAndSettle();
    expect(sink.events.where((e)=>e['kind']=='analysis_saved').single['afterNavigation'],true);
    expect(sink.events.where((e)=>e['kind']=='analysis_failed'||e['kind']=='analysis_refresh_failed'||e['kind']=='result_frame'),isEmpty);
    expect(t.takeException(),isNull);
  });
  testWidgets('portion failure after navigation retains a terminal failure event',(t)async{
    final store=_Store(),sink=_Sink();await open(t,store,sink,()=>0);
    final before=store.records.single.toJson();store.pendingReplace=Completer<bool>();
    await visible(t,find.byTooltip('Edit portion for Almonds'));await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();
    await t.enterText(find.widgetWithText(TextFormField,'Served grams'),'86');await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    await t.tap(find.byTooltip('Back'));await t.pumpAndSettle();
    store.pendingReplace!.completeError(const FileSystemException('synthetic save failure'));await t.pumpAndSettle();
    expect(sink.events.where((e)=>e['kind']=='portion_failed').single['afterNavigation'],true);
    expect(sink.events.where((e)=>e['kind']=='portion_saved'),isEmpty);expect(store.records.single.toJson(),before);expect(t.takeException(),isNull);
  });
  testWidgets('portion dialog timing ends before delayed persistence',(t)async{
    var tick=0;final store=_Store(),sink=_Sink();await open(t,store,sink,()=>tick);
    store.pendingReplace=Completer<bool>();await visible(t,find.byTooltip('Edit portion for Almonds'));
    tick=100;await t.tap(find.byTooltip('Edit portion for Almonds'));await t.pumpAndSettle();
    tick=1100;await t.enterText(find.widgetWithText(TextFormField,'Served grams'),'86');await t.tap(find.text('Apply portion'));await t.pumpAndSettle();
    tick=11100;store.pendingReplace!.complete(true);await t.pumpAndSettle();
    expect(sink.events.where((e)=>e['kind']=='portion_saved').single['dialogForegroundMs'],1000);
  });
  testWidgets('export does not copy until the explicit copy action',(t)async{
    var copied=0;t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,(call)async{if(call.method=='Clipboard.setData'){copied++;}return null;});
    addTearDown(()=>t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,null));
    await t.pumpWidget(MaterialApp(home:Scaffold(body:Builder(builder:(context)=>TextButton(onPressed:()=>showWorkflowExport(context,load:()async=>workflowExportData(at:DateTime.utc(2026),meals:[])),child:const Text('Export'))))));
    await t.tap(find.text('Export'));await t.pumpAndSettle();expect(copied,0);
    await t.tap(find.text('Copy JSON'));await t.pumpAndSettle();expect(copied,1);
  });
  testWidgets('dismissal while export is loading prevents a late clipboard write',(t)async{
    var copied=0;final pending=Completer<Map<String,dynamic>>();
    t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,(call)async{if(call.method=='Clipboard.setData'){copied++;}return null;});
    addTearDown(()=>t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform,null));
    await t.pumpWidget(MaterialApp(home:Scaffold(body:Builder(builder:(context)=>TextButton(onPressed:()=>showWorkflowExport(context,load:()=>pending.future),child:const Text('Export'))))));
    await t.tap(find.text('Export'));await t.pumpAndSettle();await t.tap(find.text('Copy JSON'));await t.pump();
    await t.tap(find.text('Cancel'));await t.pumpAndSettle();pending.complete(workflowExportData(at:DateTime.utc(2026),meals:[]));await t.pumpAndSettle();
    expect(copied,0);expect(t.takeException(),isNull);
  });
}
