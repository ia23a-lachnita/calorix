import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import '../../core/constants/app_constants.dart';
import '../../core/theme/app_theme.dart';
import '../../core/time/clock.dart';
import '../../shared/services/camera_service.dart';
import 'local_meal.dart';
import 'local_meal_store.dart';
import 'tier1_cloud.dart';
import 'workflow_measurements.dart';
import 'workflow_export.dart';

// Presentation only: the original model doubles remain the saved values.
String _displayNutrient(double? value) {
  if(value==null)return '';
  if(value==0)return '0';
  if(value>0&&value<.01)return value.toStringAsPrecision(2);
  return value.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'),'').replaceFirst(RegExp(r'\.$'),'');
}
double? _numberFromField(TextEditingController controller,double? original) {
  final text=controller.text.trim();
  if(text==_displayNutrient(original))return original;
  return text.isEmpty?null:double.tryParse(text);
}

/// Focused local-first workflow. Legacy Firebase services are never mounted here.
class Tier1App extends StatelessWidget {
  const Tier1App({super.key,this.store,this.camera,this.cloud,this.initializeCloud,this.clock,this.workflow,this.elapsedMilliseconds});
  final Tier1MealStore? store;
  final Clock? clock;
  final CameraService? camera;
  final Tier1Cloud? cloud;
  final Future<void> Function()? initializeCloud;
  final WorkflowSink? workflow;
  final int Function()? elapsedMilliseconds;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title:AppConstants.appDisplayName,debugShowCheckedModeBanner:false,
    theme:AppTheme.light(),darkTheme:AppTheme.dark(),
    home:_Tier1Home(store:store,camera:camera,clock:clock??RealClock(),workflow:workflow,elapsedMilliseconds:elapsedMilliseconds,cloud:cloud??(initializeCloud==null?null:FirebaseTier1Cloud(initializeCloud!))));
}

class _Tier1Home extends StatefulWidget {
  const _Tier1Home({this.store,this.camera,this.cloud,this.workflow,this.elapsedMilliseconds,required this.clock});
  final Tier1MealStore? store;
  final Clock clock;
  final CameraService? camera;
  final Tier1Cloud? cloud;
  final WorkflowSink? workflow;
  final int Function()? elapsedMilliseconds;
  @override
  State<_Tier1Home> createState()=>_Tier1HomeState();
}
class _Tier1HomeState extends State<_Tier1Home> with WidgetsBindingObserver {
  late final CameraService _camera=widget.camera??DeviceCameraService();
  Tier1MealStore? _store;
  WorkflowSink? _workflow;
  late final _elapsed=Stopwatch()..start();
  int _ticks()=>widget.elapsedMilliseconds?.call()??_elapsed.elapsedMilliseconds;
  List<Tier1Meal> _meals=[];
  String? _error,_cameraWarning;
  bool _history=false,_busy=false;
  int _lifecycleEpoch=0;
  @override
  void initState(){super.initState();WidgetsBinding.instance.addObserver(this);unawaited(_initialize());}
  Future<void> _initialize() async {
    try {
      _store=widget.store??Tier1MealStore(Directory('${(await getApplicationDocumentsDirectory()).path}/tier1'));
      // Injected stores opt into a sink; do not write into a fake test root.
      _workflow=widget.workflow??(widget.store==null?StoreWorkflowSink(_store!):const NoopWorkflowSink());
      await _refresh();
    } catch (_) {if(mounted)setState(()=>_error='Could not open local history. Existing files were preserved.');return;}
    try {
      if (_camera is CameraLifecycleService) await (_camera as CameraLifecycleService).resume();
      if (mounted) setState(()=>_cameraWarning=null);
    }catch(_){if(mounted)setState(()=>_cameraWarning='Camera unavailable. Manual entry still works.');}
  }
  Future<void> _refresh() async {
    final records=await _store!.load();
    records.sort((a,b)=>b.capturedAt.compareTo(a.capturedAt));
    if(mounted)setState(()=>_meals=records);
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if(state!=AppLifecycleState.resumed)_lifecycleEpoch++;
    if(_camera is! CameraLifecycleService)return;
    final lifecycle=_camera as CameraLifecycleService;
    if(state==AppLifecycleState.resumed){unawaited(lifecycle.resume().then((_){if(mounted)setState(()=>_cameraWarning=null);}).catchError((_){if(mounted)setState(()=>_cameraWarning='Camera unavailable. Manual entry still works.');}));}
    else {unawaited(lifecycle.pause());}
  }
  @override
  void dispose(){WidgetsBinding.instance.removeObserver(this);if(_camera is CameraLifecycleService)unawaited((_camera as CameraLifecycleService).dispose());super.dispose();}
  Future<void> _open(Tier1Meal meal,{int? captureTick,bool startEstimate=false,bool Function()? allowInitialEstimate}) async {
    if(_store==null||_error!=null)return;
    await Navigator.of(context).push(MaterialPageRoute<void>(builder:(_)=>_MealEditor(meal:meal,store:_store!,cloud:widget.cloud,clock:widget.clock,workflow:_workflow!,elapsedMilliseconds:_ticks,captureTick:captureTick,startEstimate:startEstimate,allowInitialEstimate:allowInitialEstimate)));
    if(!mounted)return;
    try{
      await _refresh();
      if(mounted)setState(()=>_history=true);
    }catch(_){if(mounted)setState(()=>_error='Could not refresh local history. Reopen the app to check saved values.');}
  }
  Future<void> _capture() async {
    if(_busy||_store==null||_error!=null)return;
    setState(()=>_busy=true);
    String? ownedCapture;
    try {
      if(!await _camera.hasPermission()){
        final permission=await _camera.requestPermission();
        if(permission!=CameraPermissionRequestResult.granted)throw StateError('Camera permission needed');
      }
      final shutter=widget.clock.now();
      final shutterTick=_ticks();
      final offerEpoch=_lifecycleEpoch;
      final state=WidgetsBinding.instance.lifecycleState;
      final startedForeground=state==null||state==AppLifecycleState.resumed;
      final file=await _camera.captureStill();
      if(file==null)return;
      ownedCapture=file.path;
      final bytes=await file.readAsBytes();
      if(bytes.length>30*1024*1024 || bytes.length<8 || bytes[0]!=255 || bytes[1]!=216)throw const FormatException('JPEG capture required');
      final codec=await ui.instantiateImageCodec(bytes);
      final frame=await codec.getNextFrame();
      final width=frame.image.width,height=frame.image.height;
      frame.image.dispose();codec.dispose();
      final device=_camera is DeviceCameraService?_camera.previewController:null;
      final id=const Uuid().v4();
      final path=await _store!.retainCapture(id,file.path);
      final meal=Tier1Meal(id:id,capturedAt:shutter,name:'New meal',photoPath:path,source:'photo',metadata:{
        'capturedAt':shutter.toUtc().toIso8601String(),'width':width,'height':height,'jpegBytes':bytes.length,
        'cameraId':device?.description.name,'lensDirection':device?.description.lensDirection.name,
        'sensorOrientation':device?.description.sensorOrientation,'deviceOrientation':device?.value.deviceOrientation.name,
        'focusMode':device?.value.focusMode.name,'exposureMode':device?.value.exposureMode.name,
        'focalLength':null,'intrinsics':null,'zoom':null,'gpsRequested':false,
        'qualityWarnings':width<640||height<640?['Low resolution; consider retaking']:[],
      });
      try {await _store!.save(meal);}catch(_){await File(path).delete();rethrow;}
      final saved=(await _store!.load()).firstWhere((m)=>m.id==id);
      if(mounted){
        await _open(saved,captureTick:shutterTick,startEstimate:true,
          allowInitialEstimate:()=>mounted&&startedForeground&&_lifecycleEpoch==offerEpoch);
      }
    } catch (_) {if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Photo could not be saved. Retake or use manual entry.')));}
    finally {
      if(ownedCapture!=null){try{final temporary=File(ownedCapture);if(await temporary.exists())await temporary.delete();}catch(_){/* No unrelated cache cleanup. */}}
      if(mounted)setState(()=>_busy=false);
    }
  }
  Widget _cameraView() {
    final controller=_camera is DeviceCameraService?_camera.previewController:null;
    return Stack(fit:StackFit.expand,children:[
      if(controller!=null&&controller.value.isInitialized)CameraPreview(controller)
      else Center(child:Text('One photo of your meal',style:Theme.of(context).textTheme.titleLarge)),
      Positioned(left:20,right:20,bottom:24,child:Column(mainAxisSize:MainAxisSize.min,children:[
        const Text('Photos stay on this phone until you choose cloud analysis.',textAlign:TextAlign.center),
        const SizedBox(height:16),
        Semantics(label:'Take meal photo',button:true,child:FilledButton.icon(onPressed:_busy?null:_capture,
          icon:const Icon(Icons.camera_alt_outlined),label:Text(_busy?'Saving photo…':'Take photo'))),
      ])),
    ]);
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar:AppBar(title:const Text(AppConstants.appDisplayName),actions:[
      if(_history)IconButton(tooltip:'Export measurements',onPressed:_store==null||_error!=null?null:()=>showWorkflowExport(context,load:()=>_workflow!.export(at:widget.clock.now())),icon:const Icon(Icons.download_outlined)),
      TextButton(onPressed:()=>setState(()=>_history=!_history),child:Text(_history?'Camera':'History'))]),
    body:Column(children:[
      if(_error!=null)Padding(padding:const EdgeInsets.all(16),child:Text(_error!)),
      if(_cameraWarning!=null)Padding(padding:const EdgeInsets.all(16),child:Text(_cameraWarning!)),
      Expanded(child:_store==null?const Center(child:CircularProgressIndicator()):_history?
        (_meals.isEmpty?const Center(child:Text('No saved meals yet. Take a photo or enter a meal.')):
        ListView.builder(itemCount:_meals.length,itemBuilder:(context,index){final meal=_meals[index];return ListTile(
          leading:meal.photoPath==null?const Icon(Icons.restaurant):Image.file(File(meal.photoPath!),width:56,height:56,fit:BoxFit.cover,errorBuilder:(_,__,___)=>const Icon(Icons.image_not_supported_outlined)),
          title:Text(meal.name),subtitle:Text('${meal.served==null?'No estimate yet':'Approximate served · ${meal.served!.kcal.round()} kcal'}\n${meal.consumedKcal==null?'Consumption not confirmed':'Confirmed consumed · ${meal.consumedKcal!.round()} kcal'}'),
          isThreeLine:true,onTap:_error!=null?null:()=>_open(meal));})):_cameraView()),
      SafeArea(top:false,child:Padding(padding:const EdgeInsets.all(12),child:Row(children:[
        Expanded(child:OutlinedButton.icon(onPressed:_store==null||_error!=null?null:()=>_open(Tier1Meal(id:const Uuid().v4(),capturedAt:widget.clock.now(),name:'New meal')),icon:const Icon(Icons.edit_outlined),label:const Text('Manual entry'))),
      ]))),
    ]));
}

class _MealEditor extends StatefulWidget {
  const _MealEditor({required this.meal,required this.store,this.cloud,required this.clock,required this.workflow,required this.elapsedMilliseconds,this.captureTick,this.startEstimate=false,this.allowInitialEstimate});
  final Tier1Meal meal;
  final Clock clock;
  final Tier1MealStore store;
  final Tier1Cloud? cloud;
  final WorkflowSink workflow;
  final int Function() elapsedMilliseconds;
  final int? captureTick;
  final bool startEstimate;
  final bool Function()? allowInitialEstimate;
  @override
  State<_MealEditor> createState()=>_MealEditorState();
}
class _MealEditorState extends State<_MealEditor> with WidgetsBindingObserver {
  late Tier1Meal _meal=widget.meal;
  final _form=GlobalKey<FormState>();
  late final _name=TextEditingController(text:_meal.name=='New meal'?'':_meal.name);
  late final _kcal=TextEditingController(text:_displayNutrient(_meal.served?.kcal));
  late final _protein=TextEditingController(text:_displayNutrient(_meal.served?.proteinG));
  late final _carbs=TextEditingController(text:_displayNutrient(_meal.served?.carbsG));
  late final _fat=TextEditingController(text:_displayNutrient(_meal.served?.fatG));
  bool _busy=false,_dirty=false;
  String? _message;
  late final _meter=WorkflowMeter(sessionId:const Uuid().v4(),elapsedMilliseconds:widget.elapsedMilliseconds);
  late bool _hasSaved=_meal.revision>0;
  final _pendingEvents=<Map<String,dynamic>>[];
  bool _closed=false,_deleted=false,_exporting=false,_foreground=true,_frameWanted=false,_frameRecorded=false;
  bool _initialOfferConsumed=false;
  @override
  void initState(){
    super.initState();WidgetsBinding.instance.addObserver(this);
    _foreground=WidgetsBinding.instance.lifecycleState==null||WidgetsBinding.instance.lifecycleState==AppLifecycleState.resumed;
    _meter.setForeground(_foreground);_trace('editor_opened');
    if(_meal.hasPendingPreparationQuestion)_trace('preparation_available');
    if(widget.startEstimate){
      WidgetsBinding.instance.addPostFrameCallback((_){
        if(_initialOfferConsumed)return;
        _initialOfferConsumed=true;
        final state=WidgetsBinding.instance.lifecycleState;
        if(!mounted||!_foreground||(state!=null&&state!=AppLifecycleState.resumed)||
            ModalRoute.of(context)?.isCurrent!=true||_busy||_dirty||widget.allowInitialEstimate?.call()!=true){
          return;
        }
        unawaited(_estimate());
      });
    }
  }
  void _send(List<Map<String,dynamic>> events){unawaited(widget.workflow.append(_meal.id,events).catchError((_)=>widget.workflow.recordFailure()));}
  void _trace(String kind,[Map<String,dynamic> fields=const {}]){
    if(_deleted)return;
    try{
      final event=_meter.event(kind,at:widget.clock.now(),fields:{if(_closed)'afterNavigation':true,...fields});
      if(_hasSaved){_send([event]);}else{_pendingEvents.add(event);}
    }catch(_){widget.workflow.recordFailure();}
  }
  int? _duration(int? start){
    if(start==null||!_meter.timingValid)return null;
    final value=widget.elapsedMilliseconds()-start;return value<0||value>365*24*60*60*1000?null:value;
  }
  int? _dialogDuration(int? start){final end=_meter.foregroundExcludingWaitMs;return start==null||end==null||end<start?null:end-start;}
  Map<String,dynamic> _modelFields(Map<String,dynamic>? analysis){
    final p=analysis?['provenance'];if(p is! Map)return {};
    return {
      if(p['model'] is String&&RegExp(r'^gemini-[a-z0-9][a-z0-9.-]{0,79}$').hasMatch(p['model'] as String))'model':p['model'],
      if(p['promptSha256'] is String&&RegExp(r'^[0-9a-f]{64}$').hasMatch(p['promptSha256'] as String))'promptSha256':p['promptSha256'],
    };
  }
  void _scheduleResultFrame(){
    if(!_frameWanted||_frameRecorded||!mounted)return;
    WidgetsBinding.instance.addPostFrameCallback((_){
      if(!mounted||!_foreground||_exporting||_frameRecorded)return;
      _frameRecorded=true;_frameWanted=false;_trace('result_frame',{'shutterToFrameMs':_duration(widget.captureTick)});
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state){
    _foreground=state==AppLifecycleState.resumed;_meter.setForeground(_foreground&&!_exporting);
    if(_foreground)_scheduleResultFrame();
  }
  Future<void> _export() async {
    _trace('export_opened');_exporting=true;_meter.setForeground(false);
    try{await showWorkflowExport(context,load:()=>widget.workflow.export(at:widget.clock.now(),mealId:_meal.id));}
    finally{_exporting=false;_meter.setForeground(_foreground);_trace('export_closed');}
  }
  @override
  void dispose(){WidgetsBinding.instance.removeObserver(this);_meter.setForeground(false);_closed=true;_trace('editor_closed');_pendingEvents.clear();for(final c in [_name,_kcal,_protein,_carbs,_fat]){c.dispose();}super.dispose();}
  void _fill(){_name.text=_meal.name;_kcal.text=_displayNutrient(_meal.served?.kcal);_protein.text=_displayNutrient(_meal.served?.proteinG);_carbs.text=_displayNutrient(_meal.served?.carbsG);_fat.text=_displayNutrient(_meal.served?.fatG);}
  Future<void> _persist(Tier1Meal meal) async {
    await widget.store.save(meal);
    _meal=(await widget.store.load()).firstWhere((m)=>m.id==meal.id);
    _hasSaved=true;
    if(_pendingEvents.isNotEmpty){final events=List<Map<String,dynamic>>.of(_pendingEvents);_pendingEvents.clear();_send(events);}
  }
  Future<void> _save() async {
    if(!_form.currentState!.validate()||_busy)return;
    try {
      final before=_meal.served?.kcal;
      await _persist(_meal.edit(_name.text,Tier1Nutrients(kcal:_numberFromField(_kcal,_meal.served?.kcal)!,proteinG:_numberFromField(_protein,_meal.served?.proteinG),carbsG:_numberFromField(_carbs,_meal.served?.carbsG),fatG:_numberFromField(_fat,_meal.served?.fatG)),at:widget.clock.now()));
      _trace('manual_saved',{'beforeKcal':before,'afterKcal':_meal.served?.kcal});
      if(mounted)Navigator.pop(context);
    }catch(_){if(mounted)setState(()=>_message='Could not save. Existing history was preserved.');}
  }
  Future<void> _estimate() async {
    if(!mounted||_busy||_dirty||_meal.photoPath==null)return;
    final approved=await showDialog<bool>(context:context,builder:(context)=>AlertDialog(
      title:const Text('Send this photo for analysis?'),
      content:const Text('This photo will be sent to Google Cloud in the United States for an approximate food estimate. Photo metadata is removed before sending. Google may cache or retain requests under its service terms. The app keeps your meal and photo on this phone. You can continue with manual entry instead.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Keep local')),
        FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Send photo'))]));
    if(approved!=true||!mounted)return;
    final started=widget.elapsedMilliseconds();_meter.setWaiting(true);_trace('analysis_started');
    setState((){_busy=true;_message=null;});
    var committed=false;
    try {
      await _persist(_meal.withConsent());
      final revision=_meal.revision;
      final cloud=widget.cloud;
      if(cloud==null)throw StateError('Cloud unavailable');
      final result=await cloud.analyze(_meal.photoPath!,consent:true);
      _trace('analysis_returned',{'clientAnalysisMs':_duration(started),'shutterToResponseMs':_duration(widget.captureTick)});
      final applied=await widget.store.replaceIfRevision(_meal.withAnalysis(result,at:widget.clock.now()),revision);
      committed=applied;
      _trace(applied?'analysis_saved':'analysis_discarded',{'clientAnalysisMs':_duration(started),'shutterToSavedMs':applied?_duration(widget.captureTick):null,
        if(applied)'afterKcal':(result['totals'] as Map)['kcal'],
        if(applied)'questionProposed':result['question'] is Map&&(result['question'] as Map)['answered']!=true,..._modelFields(result)});
      if(!mounted)return;
      if(applied){
        _meal=(await widget.store.load()).firstWhere((m)=>m.id==_meal.id);
        if(!mounted)return;
        _fill();
      }
      if(applied){_frameWanted=true;if(_meal.hasPendingPreparationQuestion)_trace('preparation_available');}
      if(mounted)setState(()=>_message=applied?'Approximate estimate saved. Check the foods and portions.':'Your newer changes were kept; this result was discarded.');
    }catch(_){
      _trace(committed?'analysis_refresh_failed':'analysis_failed',{'clientAnalysisMs':_duration(started)});
      if(mounted)setState(()=>_message=committed?'Estimate saved, but could not refresh. Reopen the meal to check saved values.':'Photo analysis is unavailable. Your photo is saved on this phone. Enter or correct the meal below.');
    }
    finally{_meter.setWaiting(false);if(mounted){setState(()=>_busy=false);_scheduleResultFrame();}}
  }
  Future<void> _consume(double? fraction) async {
    try{await _persist(fraction==null?_meal.clearConsumption():_meal.confirmConsumption(fraction));if(mounted)setState((){});}
    catch(_){if(mounted)setState(()=>_message='Consumption could not be saved.');}
  }
  Future<void> _answer(String answer) async {
    if(_busy||_dirty)return;
    try{final before=_meal.served?.kcal;await _persist(_meal.answerPreparation(answer,at:widget.clock.now()));_trace('preparation_answered',{'answerCode':answer,'beforeKcal':before,'afterKcal':_meal.served?.kcal});_fill();if(mounted)setState((){});}
    catch(_){if(mounted)setState(()=>_message='Could not save the preparation answer.');}
  }
  Future<void> _portion(int index) async {
    if(_busy||_dirty||!_meal.canCorrectPortions)return;
    final opening=_meal,current=opening.componentMassG(index);
    final component=(opening.analysis!['components'] as List)[index] as Map;
    final original=(component['massG'] as num).toDouble();
    final dialogStarted=_meter.foregroundExcludingWaitMs;_trace('portion_opened',{'portionIndex':index,'fromG':current});
    var gramsText=_displayNutrient(current),closed=false;
    var committed=false;
    int? dialogElapsed;
    int? measuredDialog()=>_meter.timingValid?dialogElapsed:null;
    final form=GlobalKey<FormState>();
    setState(()=>_busy=true);
    try {
      final route=DialogRoute<double>(context:context,builder:(dialogContext)=>AlertDialog(
        scrollable:true,title:Text('Portion: ${component['name']}'),
        content:Form(key:form,child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('Original estimate: ${_displayNutrient(original)} g. Calories remain approximate and use the existing nutrient estimate. Enter 0 to exclude this food; its original estimate is retained.'),
          if(opening.hasManualNutritionOverride)const Padding(padding:EdgeInsets.symmetric(vertical:8),
            child:Text('Changing this portion replaces manual totals with a calculation from the listed foods.')),
          TextFormField(initialValue:gramsText,onChanged:(text)=>gramsText=text,
            keyboardType:const TextInputType.numberWithOptions(decimal:true),
            decoration:const InputDecoration(labelText:'Served grams',errorMaxLines:3),
            validator:(text){final n=double.tryParse(text?.trim()??'');return n==null||!n.isFinite||n<0||n>100000?'Enter a finite weight from 0 to 100000 g':null;}),
        ])),actions:[
          TextButton(onPressed:(){if(closed)return;closed=true;Navigator.pop(dialogContext);},child:const Text('Cancel')),
          TextButton(onPressed:(){if(closed)return;closed=true;Navigator.pop(dialogContext,original);},child:const Text('Use original')),
          FilledButton(onPressed:(){
            if(closed)return;
            if(!form.currentState!.validate()){
              _trace('portion_rejected',{'portionIndex':index});
              FocusScope.of(dialogContext).unfocus();
              return;
            }
            final grams=gramsText.trim()==_displayNutrient(current)?current:double.parse(gramsText.trim());
            closed=true;Navigator.pop(dialogContext,grams);
          },child:const Text('Apply portion')),
        ]));
      final grams=await Navigator.of(context).push(route);
      // Wait for the form/keyboard overlay to leave before saving or popping.
      await route.completed;
      dialogElapsed=_dialogDuration(dialogStarted);
      if(grams==null){_trace('portion_cancelled',{'portionIndex':index,'dialogForegroundMs':measuredDialog()});return;}
      if(!mounted)return;
      final updated=opening.correctPortion(index,grams,at:widget.clock.now());
      if(identical(updated,opening)){_trace('portion_unchanged',{'portionIndex':index,'fromG':current,'toG':grams,'dialogForegroundMs':measuredDialog()});return;}
      final applied=await widget.store.replaceIfRevision(updated,opening.revision);
      if(applied){
        committed=true;_trace('portion_saved',{'portionIndex':index,'fromG':current,'toG':grams,'beforeKcal':opening.served?.kcal,'afterKcal':updated.served?.kcal,
          'dialogForegroundMs':measuredDialog(),
          'beforeFromOriginalAnalysis':opening.portionOverrides.isEmpty&&!opening.hasManualNutritionOverride&&opening.served?.kcal==(opening.analysis!['totals'] as Map)['kcal'],
          'priorPortionAdjustmentCount':opening.adjustmentHistory.where((e)=>e['kind']=='portion').length,..._modelFields(opening.analysis)});
      }else{_trace('portion_conflict',{'portionIndex':index,'dialogForegroundMs':measuredDialog()});}
      if(!mounted)return;
      if(!applied){
        final messenger=ScaffoldMessenger.of(context);
        Navigator.pop(context);
        messenger.showSnackBar(const SnackBar(content:Text('Meal changed; reopen it to edit.')));
        return;
      }
      _meal=(await widget.store.load()).firstWhere((m)=>m.id==opening.id);
      if(!mounted)return;
      _fill();setState((){_dirty=false;_message='Portion saved. Check the approximate totals; consumption is unconfirmed.';});
    }catch(_){
      if(!committed)_trace('portion_failed',{'portionIndex':index,'dialogForegroundMs':measuredDialog()});
      if(!mounted)return;
      if(committed){
        final messenger=ScaffoldMessenger.of(context);
        Navigator.pop(context);
        messenger.showSnackBar(const SnackBar(content:Text('Portion saved, but could not refresh. Reopen the meal to check saved values.')));
      }else{setState(()=>_message='Could not save this portion. Reopen the meal to check saved values.');}
    }
    finally{if(mounted)setState(()=>_busy=false);}
  }
  Future<void> _repeat() async {
    if(_busy||_dirty)return;
    setState(()=>_busy=true);
    try {
      var multiplierText='1';
      var closed=false;
      final route=DialogRoute<bool>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Log this meal again?'),content:Column(mainAxisSize:MainAxisSize.min,children:[
          const Text('Confirm the foods and recipe are the same. This repeats an estimate, not a weighed reference.'),
          TextFormField(initialValue:'1',onChanged:(value)=>multiplierText=value,
            keyboardType:const TextInputType.numberWithOptions(decimal:true),
            decoration:const InputDecoration(labelText:'Portion multiplier'))]),
        actions:[TextButton(onPressed:(){if(closed)return;closed=true;Navigator.pop(dialogContext,false);},child:const Text('Cancel')),
          FilledButton(onPressed:(){if(closed)return;closed=true;Navigator.pop(dialogContext,true);},child:const Text('Confirm repeat'))]));
      final confirmed=await Navigator.of(context).push(route);
      // A pop result precedes overlay removal. Do not pop the editor during it.
      await route.completed;
      if(confirmed!=true||!mounted)return;
      final amount=double.tryParse(multiplierText);
      if(amount==null||!amount.isFinite||amount<=0||amount>10){
        setState(()=>_message='Choose a portion multiplier above 0 and at most 10.');
        return;
      }
      await widget.store.save(_meal.repeat(const Uuid().v4(),widget.clock.now(),amount));
      _trace('repeat_saved');
      if(mounted)Navigator.pop(context);
    }catch(_){if(mounted)setState(()=>_message='Could not save the repeated meal. Try again.');}
    finally{if(mounted)setState(()=>_busy=false);}
  }
  Future<void> _delete() async {
    final confirmed=await showDialog<bool>(context:context,builder:(context)=>AlertDialog(title:const Text('Delete this meal and photo?'),content:const Text('This removes the saved local record and its photo. It cannot remove provider logs from a past analysis request.'),actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Cancel')),FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Delete'))]));
    if(confirmed!=true)return;
    try{_deleted=true;_pendingEvents.clear();await widget.store.delete(_meal.id);if(mounted)Navigator.pop(context);}
    catch(_){_deleted=false;if(mounted)setState(()=>_message='Deletion could not finish. Check local storage and try again.');}
  }
  Widget _number(String label,TextEditingController controller,{bool isRequired=false}) => TextFormField(
    controller:controller,enabled:!_busy,onChanged:(_)=>setState(()=>_dirty=true),keyboardType:const TextInputType.numberWithOptions(decimal:true),decoration:InputDecoration(labelText:label),
    validator:(text){if(text==null||text.trim().isEmpty)return isRequired?'Enter served calories':null;final n=double.tryParse(text);return n==null||!n.isFinite||n<0||n>1000000?'Enter a finite value from 0 to 1000000':null;});
  @override
  Widget build(BuildContext context) {
    final analysis=_meal.analysis;
    final question=analysis?['question'] is Map?Map<String,dynamic>.from(analysis!['question'] as Map):null;
    final canCorrect=_meal.canCorrectPortions;
    return Scaffold(appBar:AppBar(title:const Text('Meal estimate'),actions:[IconButton(tooltip:'Export measurements',onPressed:_busy||!_hasSaved?null:_export,icon:const Icon(Icons.download_outlined)),IconButton(tooltip:'Delete meal',onPressed:_busy?null:_delete,icon:const Icon(Icons.delete_outline))]),
      body:Form(key:_form,child:ListView(padding:const EdgeInsets.all(20),children:[
        if(_meal.photoPath!=null)ClipRRect(borderRadius:BorderRadius.circular(24),child:Image.file(File(_meal.photoPath!),height:220,fit:BoxFit.cover,errorBuilder:(_,__,___)=>const Text('Saved photo is unavailable'))),
        const SizedBox(height:16),Text('Approximate served calories',style:Theme.of(context).textTheme.headlineSmall),
        Text(_meal.consumedKcal==null?'Consumption not confirmed':'Confirmed consumed · ${_meal.consumedKcal!.round()} kcal'),
        if(_message!=null)Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(_message!,semanticsLabel:_message)),
        if(_meal.photoPath!=null)FilledButton.icon(onPressed:_busy||_dirty?null:_estimate,icon:const Icon(Icons.auto_awesome_outlined),label:Text(_busy?'Estimating…':'Estimate photo')),
        TextFormField(controller:_name,enabled:!_busy,onChanged:(_)=>setState(()=>_dirty=true),decoration:const InputDecoration(labelText:'Meal name'),validator:(v)=>v==null||v.trim().isEmpty||v.trim().length>160?'Enter a meal name (up to 160 characters)':null),
        const SizedBox(height:12),_number('Served kcal',_kcal,isRequired:true),
        const SizedBox(height:12),_number('Protein g (optional)',_protein),
        const SizedBox(height:12),_number('Carbs g (optional)',_carbs),
        const SizedBox(height:12),_number('Fat g (optional)',_fat),
        const SizedBox(height:16),FilledButton(onPressed:_busy?null:_save,child:const Text('Save meal')),
        const Text('Saving corrections resets consumption to unconfirmed. Missing macros stay unknown.'),
        if(analysis!=null)...[
          const Divider(),const Text('Recognized foods and nutrient sources'),
          for(var index=0;index<(analysis['components'] as List? ?? []).length;index++)Builder(builder:(_){
            final c=Map<String,dynamic>.from((analysis['components'] as List)[index] as Map);final source=Map<String,dynamic>.from(c['source'] as Map);
            final current=canCorrect?_meal.componentMassG(index):null;
            final original=c['massG'] is num?(c['massG'] as num).toDouble():null;
            return Padding(padding:const EdgeInsets.symmetric(vertical:8),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('${c['name']} · ${current==null?c['massG']:_displayNutrient(current)} g · ${c['preparation']}\n${source['kind']=='database_match'?'Database nutrient record (food match estimated): ${source['recordId']}':'Unverified model nutrient estimate'}\n${(c['assumptions'] as List? ?? []).join('; ')}'),
              if(_meal.portionOverrides.containsKey(index))Text('Original estimate: ${_displayNutrient(original)} g${current==0?' · Excluded from served totals':''}'),
              if(canCorrect)Tooltip(message:'Edit portion for ${c['name']}',child:TextButton(
                onPressed:_busy||_dirty?null:()=>_portion(index),child:const Text('Edit portion'))),
            ]));
          }),
          for(final ambiguity in (analysis['ambiguities'] as List? ?? []))Text('Unresolved: $ambiguity'),
          if(question!=null&&_meal.hasPendingPreparationQuestion)...[
            Text(question['text'] as String),
            for(final raw in question['options'] as List)TextButton(onPressed:_busy||_dirty?null:()=>_answer((raw as Map)['id'] as String),child:Text((raw as Map)['label'] as String)),
          ],
          if(question?['answered']==true)Text('Preparation: ${analysis['userPreparationAnswer']??question!['answer']}'),
          if(_meal.hasManualNutritionOverride)const Text('Totals were manually corrected. Original recognition is retained for comparison.'),
        ],
        if(_meal.served!=null)...[
          if(_dirty)const Text('Save changes before confirming consumption or repeating this meal.'),
          const Divider(),Wrap(spacing:8,children:[
            OutlinedButton(onPressed:_busy||_dirty?null:()=>_consume(1),child:const Text('Ate all')),
            OutlinedButton(onPressed:_busy||_dirty?null:()=>_consume(.5),child:const Text('Ate half')),
            TextButton(onPressed:_busy||_dirty?null:()=>_consume(null),child:const Text('Leave unconfirmed')),
          ]),
          const Text('A fraction is an approximate shortcut; selective leftovers can have different calories.'),
          OutlinedButton(onPressed:_busy||_dirty?null:_repeat,child:const Text('Repeat meal')),
        ],
      ])));
  }
}
