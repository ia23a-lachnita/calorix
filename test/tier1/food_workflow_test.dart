import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:calorix/features/tier1/workflow_measurements.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'support/portion_fixtures.dart';

Map<String,dynamic> action(String kind)=>WorkflowMeter(sessionId:'food-session',elapsedMilliseconds:()=>0).event(kind,at:portionDate,fields:{'portionIndex':1});
void main(){
  test('version2 exports accept bounded food events without private food fields',(){
    for(final kind in ['food_opened','food_cancelled','food_unchanged','food_saved','food_conflict','food_failed']){
      final e=action(kind);expect(validateWorkflowEvent(e),e);
      for(final key in ['recordId','query','foodName','catalogVersion']){
        expect(()=>validateWorkflowEvent({...e,key:'private'}),throwsFormatException);
      }
    }
    expect(workflowExportData(at:portionDate,meals:[])['schemaVersion'],2);
    expect(validateWorkflowExport({...workflowExportData(at:portionDate,meals:[]),'schemaVersion':1})['schemaVersion'],1);
  });
  test('legacy journals append into version2 and preserve old events',()async{
    final root=await Directory.systemTemp.createTemp('food-journal-');addTearDown(()=>root.delete(recursive:true));
    final store=Tier1MealStore(root);await store.save(portionMeal());
    final file=File('${root.path}/workflows/portion.json');await file.parent.create();
    final old=WorkflowMeter(sessionId:'old',elapsedMilliseconds:()=>0).event('editor_opened',at:portionDate);
    await file.writeAsString(jsonEncode({'schemaVersion':1,'mealId':'portion','events':[old],'droppedEvents':0}));
    await store.appendWorkflow('portion',[action('food_saved')]);
    final raw=jsonDecode(await file.readAsString());expect(raw['schemaVersion'],2);expect(raw['events'][0],old);
    final exported=await store.exportWorkflows(at:portionDate);expect(exported['schemaVersion'],2);
    expect((exported['meals'] as List).single['readFailure'],false);
  });
  test('version1 export cannot silently contain food kinds or food source',(){
    final data=workflowExportData(at:portionDate,meals:[{'mealId':'portion','source':'food_correction','currentServedKcal':169.0,
      'events':[action('food_saved')],'missingMeasurements':false,'readFailure':false,'droppedEvents':0,'truncated':false}]);
    expect(validateWorkflowExport(data),data);
    expect(()=>validateWorkflowExport({...data,'schemaVersion':1}),throwsFormatException);
    final row=(data['meals'] as List).single as Map;row['source']='A1';
    expect(()=>validateWorkflowExport({...data,'schemaVersion':1}),throwsFormatException);
  });
}
