import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';

final at=DateTime.utc(2026,11,9,12);
Map<String,dynamic> event([String kind='editor_opened']) =>
  WorkflowMeter(sessionId:'test-session',elapsedMilliseconds:()=>0).event(kind,at:at);

void main(){
  test('foreground proxy excludes analysis wait and background, not reading time',(){
    var tick=0;final meter=WorkflowMeter(sessionId:'session',elapsedMilliseconds:()=>tick);
    tick=100;meter.setWaiting(true);tick=1100;
    final waited=meter.event('analysis_returned',at:at);
    expect(waited['elapsedMs'],1100);expect(waited['foregroundMs'],1100);expect(waited['waitingMs'],1000);
    meter.setWaiting(false);tick=1400;final opened=meter.foregroundExcludingWaitMs;
    meter.setForeground(false);tick=6400;meter.setForeground(true);tick=6600;
    expect(meter.foregroundExcludingWaitMs!-opened!,200);
    final done=meter.event('portion_saved',at:at,fields:{'beforeKcal':400.0,'afterKcal':500.0});
    expect(done['elapsedMs'],6600);expect(done['foregroundMs'],1600);expect(done['waitingMs'],1000);
  });
  test('wall-clock changes affect timestamps but not monotonic durations',(){
    var tick=0;final meter=WorkflowMeter(sessionId:'session',elapsedMilliseconds:()=>tick);
    tick=500;final first=meter.event('editor_opened',at:at);
    tick=750;final second=meter.event('editor_closed',at:DateTime.utc(2000));
    expect(first['elapsedMs'],500);expect(second['elapsedMs'],750);
    expect(second['atUtc'],'2000-01-01T00:00:00.000Z');expect(second['sequence'],1);
  });
  test('a regressing monotonic source invalidates durations without clamping',(){
    var tick=100;final meter=WorkflowMeter(sessionId:'session',elapsedMilliseconds:()=>tick);
    tick=50;final broken=meter.event('editor_closed',at:at);
    expect(broken['timingValid'],false);
    for(final key in ['elapsedMs','foregroundMs','waitingMs'])expect(broken[key],isNull);
    tick=1000;expect(meter.event('editor_opened',at:at)['timingValid'],false);
  });
  test('event validation rejects free text, unknown fields and nonfinite measurements',(){
    for(final extra in [{'foodName':'private meal'},{'photoPath':'/private/photo.jpg'},
      {'beforeKcal':double.nan},{'toG':-1.0},{'portionIndex':20},{'model':'private meal'}]){
      expect(()=>validateWorkflowEvent({...event(),...extra}),throwsFormatException);
    }
    expect(()=>validateWorkflowEvent({...event(),'timingValid':false}),throwsFormatException);
  });
  test('caller fields cannot replace trusted session timing or identity',(){
    final meter=WorkflowMeter(sessionId:'session',elapsedMilliseconds:()=>0);
    expect(()=>meter.event('editor_opened',at:at,fields:{'sessionId':'other'}),throwsArgumentError);
  });

  late Directory root;late Tier1MealStore store;
  setUp(()async{root=await Directory.systemTemp.createTemp('tier1-workflow-');store=Tier1MealStore(root);});
  tearDown(()async{await root.delete(recursive:true);});
  Future<void> save() => store.save(Tier1Meal(id:'meal',capturedAt:at,name:'Private meal',
    photoPath:'/private/photo.jpg',served:Tier1Nutrients(kcal:420),metadata:{'gps':'private metadata'}));
  File journal() => File('${root.path}/workflows/meal.json');

  test('no sidecar or pending file exists before a meal has committed',()async{
    expect(await store.appendWorkflow('meal',[event()]),false);
    expect(await Directory('${root.path}/workflows').exists(),false);
  });
  test('journal append preserves exact meal bytes, revision and confirmed intake',()async{
    await save();final meal=(await store.load()).single.confirmConsumption(1);await store.save(meal);
    final before=await File('${root.path}/meals.json').readAsString();
    expect(await store.appendWorkflow('meal',[event()]),true);
    expect(await File('${root.path}/meals.json').readAsString(),before);
    expect((await store.load()).single.consumedKcal,420);expect(await journal().exists(),true);
    expect(await File('${root.path}/workflows/meal.pending.json').exists(),false);
  });
  test('bounded journals retain earliest events and explicitly count later drops',()async{
    await save();final meter=WorkflowMeter(sessionId:'session',elapsedMilliseconds:()=>0);
    await store.appendWorkflow('meal',[for(var i=0;i<260;i++)meter.event('editor_opened',at:at)]);
    final exported=await store.exportWorkflows(at:at);final row=(exported['meals'] as List).single as Map;
    expect((row['events'] as List).length,256);expect(row['droppedEvents'],4);expect(row['truncated'],true);
    await store.appendWorkflow('meal',[meter.event('editor_closed',at:at)]);
    expect(((await store.exportWorkflows(at:at))['meals'] as List).single['droppedEvents'],5);
  });
  test('corrupt workflow bytes are preserved and export reports failure without raw contents',()async{
    await save();await journal().parent.create();const broken='private corrupt workflow';await journal().writeAsString(broken);
    await expectLater(store.appendWorkflow('meal',[event()]),throwsFormatException);
    expect(await journal().readAsString(),broken);
    final exported=await store.exportWorkflows(at:at);expect((exported['meals'] as List).single['readFailure'],true);
    expect(jsonEncode(exported),isNot(contains(broken)));
  });
  test('delete purges final and pending journals and late queued appends cannot recreate them',()async{
    await save();await store.appendWorkflow('meal',[event()]);
    await File('${root.path}/workflows/meal.pending.json').writeAsString('owned pending data');
    final deleted=store.delete('meal'),late=store.appendWorkflow('meal',[event('editor_closed')]);
    await deleted;expect(await late,false);expect(await journal().exists(),false);
    expect(await File('${root.path}/workflows/meal.pending.json').exists(),false);
  });
  test('exports contain only retained IDs, estimates and whitelisted events',()async{
    await save();await store.appendWorkflow('meal',[event()]);
    final exported=await store.exportWorkflows(at:at),text=encodeWorkflowExport(exported);
    for(final secret in ['Private meal','/private/photo.jpg','private metadata','photoPath','analysis'])expect(text,isNot(contains('"$secret"')));
    expect(exported['referenceIsWeighed'],false);expect(exported['scope'],'currently_retained_meals');
    expect((exported['meals'] as List).single['currentServedKcal'],420);
    expect((exported['meals'] as List).single['missingMeasurements'],false);
    expect((await store.exportWorkflows(at:at,mealId:'not-retained'))['meals'],isEmpty);
  });
  test('missing logs remain unknown and unsafe IDs are refused',()async{
    await save();final e=await store.exportWorkflows(at:at);
    expect((e['meals'] as List).single['missingMeasurements'],true);
    await expectLater(store.appendWorkflow('../escape',[event()]),throwsArgumentError);
  });
  test('export encoder refuses unknown fields and oversized UTF-8 data without truncation',(){
    final empty=workflowExportData(at:at,meals:[]);
    expect(()=>encodeWorkflowExport({...empty,'photo':'private'}),throwsFormatException);
    final meter=WorkflowMeter(sessionId:'session',elapsedMilliseconds:()=>0);
    final row={'mealId':'meal','source':'A1','currentServedKcal':420.0,'events':[for(var i=0;i<256;i++)meter.event('editor_opened',at:at)],
      'missingMeasurements':false,'readFailure':false,'droppedEvents':0,'truncated':false};
    final large=workflowExportData(at:at,meals:[for(var i=0;i<20;i++){...row,'mealId':'meal-$i'}]);
    expect(()=>encodeWorkflowExport(large),throwsA(isA<WorkflowExportTooLarge>()));
    expect(()=>encodeWorkflowExport(empty),returnsNormally);
  });
}
