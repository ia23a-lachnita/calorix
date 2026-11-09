import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'local_meal.dart';
import 'workflow_measurements.dart';

/// Private, atomic local history. Corrupt data is never silently reset.
class Tier1MealStore {
  Tier1MealStore(this.root);
  final Directory root;
  Future<void> _tail = Future.value();
  File get _file => File('${root.path}/meals.json');
  Future<T> _serialized<T>(Future<T> Function() action) {
    final result=Completer<T>();
    _tail=_tail.then((_) async {
      try {result.complete(await action());} catch(error,stack) {result.completeError(error,stack);}
    });
    return result.future;
  }
  Future<List<Tier1Meal>> _read() async {
    if (!await _file.exists()) return [];
    final value=jsonDecode(await _file.readAsString());
    if (value is! List) throw const FormatException('Invalid local meal history');
    try {
      final meals=value.map((v)=>Tier1Meal.fromJson(Map<String,dynamic>.from(v as Map))).toList();
      if (meals.map((m)=>m.id).toSet().length != meals.length) throw const FormatException('Duplicate local meal IDs');
      return meals;
    } on FormatException {rethrow;} catch (_) {throw const FormatException('Invalid local meal history; data retained');}
  }
  Future<List<Tier1Meal>> load() => _serialized(_read);
  Future<void> _write(List<Tier1Meal> meals) async {
    await root.create(recursive:true);
    final temporary=File('${root.path}/meals.pending.json');
    await temporary.writeAsString(jsonEncode(meals.map((m)=>m.toJson()).toList()),flush:true);
    if (await _file.exists()) await _file.copy('${root.path}/meals.previous.json');
    await temporary.rename(_file.path);
  }
  Future<void> save(Tier1Meal meal) => _serialized(() async {
    final all=await _read();
    final index=all.indexWhere((m)=>m.id==meal.id);
    if (index<0) {all.add(meal.withRevision(1));} else {all[index]=meal.withRevision(all[index].revision+1);}
    await _write(all);
  });
  Future<bool> replaceIfRevision(Tier1Meal meal,int expectedRevision) => _serialized(() async {
    final all=await _read();
    final index=all.indexWhere((m)=>m.id==meal.id);
    if (index<0 || all[index].revision!=expectedRevision) return false;
    all[index]=meal.withRevision(expectedRevision+1);
    await _write(all);
    return true;
  });
  Future<void> delete(String id) => _serialized(() async {
    _workflowId(id);
    final all=await _read();
    final found=all.where((m)=>m.id==id).firstOrNull;
    all.removeWhere((m)=>m.id==id);
    await _write(all);
    final owned=File('${root.path}/photos/$id.jpg');
    if (found?.photoPath==owned.path && await owned.exists()) await owned.delete();
    // A backup retaining a deleted photo/recipe is not a deletion control.
    final backup=File('${root.path}/meals.previous.json');
    if (await backup.exists()) await backup.delete();
    for(final file in [_workflowFile(id),_workflowPending(id)]){if(await file.exists())await file.delete();}
  });
  void _workflowId(String id){if(!workflowIdIsValid(id))throw ArgumentError('Invalid workflow meal ID');}
  File _workflowFile(String id)=>File('${root.path}/workflows/$id.json');
  File _workflowPending(String id)=>File('${root.path}/workflows/$id.pending.json');
  Future<Map<String,dynamic>?> _readWorkflow(String id) async {
    if(await _workflowPending(id).exists())throw const FormatException('Incomplete workflow write retained');
    final file=_workflowFile(id);if(!await file.exists())return null;
    if(await file.length()>workflowExportByteLimit)throw const FormatException('Workflow journal too large');
    final raw=jsonDecode(await file.readAsString());
    if(raw is! Map)throw const FormatException('Invalid workflow journal');
    final value=Map<String,dynamic>.from(raw);
    if(value.length!=4||value['schemaVersion'] is! int||value['schemaVersion']!=1||value['mealId']!=id||value['events'] is! List||value['droppedEvents'] is! int||(value['droppedEvents'] as int)<0)throw const FormatException('Invalid workflow journal');
    final events=validateWorkflowEvents(value['events'] as List);
    return {'events':events,'droppedEvents':value['droppedEvents']};
  }
  Future<bool> appendWorkflow(String id,List<Map<String,dynamic>> events)=>_serialized(() async {
    _workflowId(id);
    // Same queue as delete/save: late callbacks cannot resurrect a deleted log.
    if(!(await _read()).any((m)=>m.id==id))return false;
    final incoming=events.map(validateWorkflowEvent).toList();
    if(incoming.isEmpty)return true;
    final old=await _readWorkflow(id),prior=(old?['events'] as List?)??const [];
    final all=[...prior,...incoming],kept=validateWorkflowEvents(all.take(workflowEventLimit).toList());
    final dropped=(old?['droppedEvents'] as int? ?? 0)+all.length-kept.length;
    final temporary=_workflowPending(id);await temporary.parent.create(recursive:true);
    await temporary.writeAsString(jsonEncode({'schemaVersion':1,'mealId':id,'events':kept,'droppedEvents':dropped}),flush:true);
    await temporary.rename(_workflowFile(id).path);
    return true;
  });
  Future<Map<String,dynamic>> exportWorkflows({required DateTime at,String? mealId})=>_serialized(() async {
    if(mealId!=null)_workflowId(mealId);
    final meals=(await _read()).where((m)=>mealId==null||m.id==mealId),rows=<Map<String,dynamic>>[];
    for(final meal in meals){
      Map<String,dynamic>? journal;var failed=false;
      try{journal=await _readWorkflow(meal.id);}catch(_){failed=true;}
      const sources={'manual','photo','A1','manual_correction','portion_correction','confirmed_repeat'};
      rows.add({'mealId':meal.id,'source':sources.contains(meal.source)?meal.source:'unknown','currentServedKcal':meal.served?.kcal,
        'events':journal?['events']??[],'missingMeasurements':!failed&&journal==null,'readFailure':failed,
        'droppedEvents':journal?['droppedEvents'],'truncated':journal==null?null:(journal['droppedEvents'] as int)>0});
    }
    return workflowExportData(at:at,meals:rows);
  });
  /// CameraService.captureStill returns an owned temporary capture, never gallery media.
  Future<String> retainCapture(String id,String source) async {
    try {return await retainPhoto(id,source);}
    finally {final captured=File(source);if(await captured.exists())await captured.delete();}
  }
  Future<String> retainPhoto(String id,String source) async {
    if (!RegExp(r'^[a-zA-Z0-9_-]{1,80}$').hasMatch(id)) throw ArgumentError('Invalid photo ID');
    final photos=Directory('${root.path}/photos');
    await photos.create(recursive:true);
    final target=File('${photos.path}/$id.jpg');
    if (await target.exists()) throw StateError('Photo already exists');
    await File(source).copy(target.path);
    return target.path;
  }
}

/// Logging errors are separate from nutrition saves; counts cover this process only.
class StoreWorkflowSink implements WorkflowSink {
  StoreWorkflowSink(this.store);
  final Tier1MealStore store;
  int _writeFailures=0;
  @override
  void recordFailure(){_writeFailures++;}
  @override
  Future<void> append(String mealId,List<Map<String,dynamic>> events) async {
    try{await store.appendWorkflow(mealId,events);}catch(_){recordFailure();}
  }
  @override
  Future<Map<String,dynamic>> export({required DateTime at,String? mealId}) async =>
    {...await store.exportWorkflows(at:at,mealId:mealId),'currentProcessWriteFailures':_writeFailures};
}
