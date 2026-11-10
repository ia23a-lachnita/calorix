import 'dart:convert';

const workflowEventLimit=256;
const workflowExportByteLimit=500000;
const _maximumMs=365*24*60*60*1000;
const _legacyWorkflowKinds={'editor_opened','editor_closed','analysis_started','analysis_returned','analysis_saved','analysis_refresh_failed','analysis_failed','analysis_discarded','result_frame','preparation_available','preparation_answered','portion_opened','portion_rejected','portion_cancelled','portion_unchanged','portion_saved','portion_conflict','portion_failed','manual_saved','repeat_saved','export_opened','export_closed'};
const _foodWorkflowKinds={'food_opened','food_cancelled','food_unchanged','food_saved','food_conflict','food_failed'};
const workflowKinds={..._legacyWorkflowKinds,..._foodWorkflowKinds};
const _base={'kind','sessionId','sequence','atUtc','timingValid','elapsedMs','foregroundMs','waitingMs'};
const _times={'dialogForegroundMs','clientAnalysisMs','shutterToResponseMs','shutterToSavedMs','shutterToFrameMs'};
const _numbers={'beforeKcal','afterKcal','fromG','toG'};
const _counts={'portionIndex','priorPortionAdjustmentCount'};
const _booleans={'beforeFromOriginalAnalysis','questionProposed','afterNavigation'};
final _extra={..._times,..._numbers,..._counts,..._booleans,'model','promptSha256','answerCode'};

void _shape(Map<String,dynamic> value,Set<String> allowed,Set<String> required){
  if(!value.keys.toSet().containsAll(required)||value.keys.any((k)=>!allowed.contains(k)))throw const FormatException('Unsupported workflow fields');
}
bool workflowIdIsValid(String id)=>RegExp(r'^[A-Za-z0-9_-]{1,80}$').hasMatch(id);
void _integer(dynamic value,{int maximum=_maximumMs}){
  if(value is! int||value<0||value>maximum)throw const FormatException('Invalid workflow integer');
}
void _utc(dynamic value){
  if(value is! String||!(value.endsWith('Z')||value.endsWith('+00:00')||value.endsWith('-00:00'))||DateTime.tryParse(value)==null)throw const FormatException('UTC workflow timestamp required');
}
Map<String,dynamic> validateWorkflowEvent(Map<String,dynamic> value,{int version=2}){
  if(version!=1&&version!=2)throw const FormatException('Unsupported workflow version');
  _shape(value,{..._base,..._extra},_base);
  if(!(version==1?_legacyWorkflowKinds:workflowKinds).contains(value['kind'])||value['sessionId'] is! String||!workflowIdIsValid(value['sessionId'] as String))throw const FormatException('Invalid workflow event identity');
  _integer(value['sequence'],maximum:9007199254740991);_utc(value['atUtc']);
  if(value['timingValid'] is! bool)throw const FormatException('Unknown timing validity');
  for(final key in ['elapsedMs','foregroundMs','waitingMs']){
    if(value['timingValid']==true){_integer(value[key]);}
    else if(value[key]!=null){throw const FormatException('Invalid timing must stay unknown');}
  }
  if(value['timingValid']==true&&((value['waitingMs'] as int)>(value['foregroundMs'] as int)||(value['foregroundMs'] as int)>(value['elapsedMs'] as int)))throw const FormatException('Inconsistent workflow timing');
  for(final key in _times.where(value.containsKey)){
    if(value[key]!=null){if(value['timingValid']!=true)throw const FormatException('Invalid timing must stay unknown');_integer(value[key]);}
  }
  for(final key in _numbers.where(value.containsKey)){
    final n=value[key],limit=key=='fromG'||key=='toG'?100000:1000000;
    if(n!=null&&(n is! num||!n.isFinite||n<0||n>limit))throw const FormatException('Invalid workflow measurement');
  }
  for(final key in _counts.where(value.containsKey)){_integer(value[key],maximum:key=='portionIndex'?19:9007199254740991);}
  for(final key in _booleans.where(value.containsKey)){if(value[key] is! bool)throw const FormatException('Invalid workflow flag');}
  if(value.containsKey('model')&&(value['model'] is! String||!RegExp(r'^gemini-[a-z0-9][a-z0-9.-]{0,79}$').hasMatch(value['model'] as String)))throw const FormatException('Invalid workflow model ID');
  if(value.containsKey('promptSha256')&&(value['promptSha256'] is! String||!RegExp(r'^[0-9a-f]{64}$').hasMatch(value['promptSha256'] as String)))throw const FormatException('Invalid workflow prompt hash');
  if(value.containsKey('answerCode')&&!{'none','oil_5g','oil_10g','oil_15g'}.contains(value['answerCode']))throw const FormatException('Invalid workflow answer code');
  return Map<String,dynamic>.from(value);
}

List<Map<String,dynamic>> validateWorkflowEvents(List<dynamic> values,{int version=2}){
  if(values.length>workflowEventLimit)throw const FormatException('Workflow journal exceeds event bound');
  final last=<String,int>{},events=<Map<String,dynamic>>[];
  for(final raw in values){
    if(raw is! Map)throw const FormatException('Invalid workflow event');
    final event=validateWorkflowEvent(Map<String,dynamic>.from(raw),version:version),session=event['sessionId'] as String,sequence=event['sequence'] as int;
    if(sequence<=(last[session]??-1))throw const FormatException('Workflow sequence is not increasing');
    last[session]=sequence;events.add(event);
  }
  return events;
}

/// Monotonic foreground duration is a proxy including reading, idle and animation.
class WorkflowMeter {
  WorkflowMeter({required this.sessionId,required int Function() elapsedMilliseconds}):_ticks=elapsedMilliseconds {
    if(!workflowIdIsValid(sessionId))throw ArgumentError('Invalid workflow session');
    _last=_ticks();if(_last<0)_valid=false;
  }
  final String sessionId;
  final int Function() _ticks;
  late int _last;
  int _elapsed=0,_foreground=0,_waiting=0,_sequence=0;
  bool _valid=true,_isForeground=true,_isWaiting=false;
  bool get timingValid{_advance();return _valid;}
  int? get foregroundExcludingWaitMs{_advance();return _valid?_foreground-_waiting:null;}
  void _advance(){
    final now=_ticks(),delta=now-_last;_last=now;
    if(delta<0||_elapsed+delta>_maximumMs){_valid=false;return;}
    if(!_valid)return;
    _elapsed+=delta;
    if(_isForeground){_foreground+=delta;if(_isWaiting)_waiting+=delta;}
  }
  void setForeground(bool value){_advance();_isForeground=value;}
  void setWaiting(bool value){_advance();_isWaiting=value;}
  Map<String,dynamic> event(String kind,{required DateTime at,Map<String,dynamic> fields=const {}}){
    if(fields.keys.any(_base.contains))throw ArgumentError('Cannot replace workflow identity/timing');
    _advance();
    return validateWorkflowEvent({'kind':kind,'sessionId':sessionId,'sequence':_sequence++,'atUtc':at.toUtc().toIso8601String(),
      'timingValid':_valid,'elapsedMs':_valid?_elapsed:null,'foregroundMs':_valid?_foreground:null,'waitingMs':_valid?_waiting:null,...fields});
  }
}

Map<String,dynamic> workflowExportData({required DateTime at,required List<Map<String,dynamic>> meals,bool enabled=true,int writeFailures=0})=>{
  'schemaVersion':2,'scope':'currently_retained_meals','exportedAtUtc':at.toUtc().toIso8601String(),'referenceIsWeighed':false,
  'timingDefinition':'editor_foreground_minus_analysis_wait_proxy_v1','measurementEnabled':enabled,'currentProcessWriteFailures':writeFailures,'meals':meals};

Map<String,dynamic> validateWorkflowExport(Map<String,dynamic> value){
  const keys={'schemaVersion','scope','exportedAtUtc','referenceIsWeighed','timingDefinition','measurementEnabled','currentProcessWriteFailures','meals'};
  _shape(value,keys,keys);
  if(value['schemaVersion'] is! int||!{1,2}.contains(value['schemaVersion'])||value['scope']!='currently_retained_meals'||value['referenceIsWeighed']!=false||value['measurementEnabled'] is! bool||value['timingDefinition']!='editor_foreground_minus_analysis_wait_proxy_v1'||value['meals'] is! List)throw const FormatException('Unsupported workflow export');
  _utc(value['exportedAtUtc']);_integer(value['currentProcessWriteFailures'],maximum:9007199254740991);
  final ids=<String>{};
  for(final raw in value['meals'] as List){
    if(raw is! Map)throw const FormatException('Invalid workflow meal');
    final row=Map<String,dynamic>.from(raw);
    const rowKeys={'mealId','source','currentServedKcal','events','missingMeasurements','readFailure','droppedEvents','truncated'};
    _shape(row,rowKeys,rowKeys);
    if(row['mealId'] is! String||!workflowIdIsValid(row['mealId'] as String)||!ids.add(row['mealId'] as String)||!{'manual','photo','A1','manual_correction','portion_correction','confirmed_repeat','unknown',if(value['schemaVersion']==2)'food_correction'}.contains(row['source']))throw const FormatException('Invalid workflow meal identity/source');
    final kcal=row['currentServedKcal'];if(kcal!=null&&(kcal is! num||!kcal.isFinite||kcal<0||kcal>1000000))throw const FormatException('Invalid workflow kcal');
    if(row['missingMeasurements'] is! bool||row['readFailure'] is! bool||row['events'] is! List)throw const FormatException('Invalid workflow log status');
    if(row['droppedEvents']!=null)_integer(row['droppedEvents'],maximum:9007199254740991);
    if(row['truncated']!=null&&row['truncated'] is! bool)throw const FormatException('Invalid workflow truncation flag');
    if(row['missingMeasurements']==false&&row['readFailure']==false&&(row['droppedEvents']==null||row['truncated']!=((row['droppedEvents'] as int)>0)))throw const FormatException('Inconsistent workflow truncation');
    validateWorkflowEvents(row['events'] as List,version:value['schemaVersion'] as int);
  }
  return value;
}

class WorkflowExportTooLarge implements Exception {}
String encodeWorkflowExport(Map<String,dynamic> value){
  final text=jsonEncode(validateWorkflowExport(value));
  if(utf8.encode(text).length>workflowExportByteLimit)throw WorkflowExportTooLarge();
  return text;
}

abstract class WorkflowSink {
  void recordFailure(){}
  Future<void> append(String mealId,List<Map<String,dynamic>> events);
  Future<Map<String,dynamic>> export({required DateTime at,String? mealId});
}
class NoopWorkflowSink implements WorkflowSink {
  const NoopWorkflowSink();
  @override
  void recordFailure(){}
  @override
  Future<void> append(String mealId,List<Map<String,dynamic>> events) async {}
  @override
  Future<Map<String,dynamic>> export({required DateTime at,String? mealId}) async=>workflowExportData(at:at,meals:[],enabled:false);
}
