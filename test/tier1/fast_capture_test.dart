import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:calorix/features/tier1/local_meal.dart';
import 'package:calorix/features/tier1/local_meal_store.dart';
import 'package:calorix/features/tier1/tier1_app.dart';
import 'package:calorix/features/tier1/tier1_cloud.dart';
import '../scan/support/fake_camera_service.dart';
import 'support/portion_fixtures.dart';

class _PhotoStore extends Tier1MealStore {
  _PhotoStore():super(Directory('.'));
  final records=<Tier1Meal>[];
  final photoSaved=Completer<void>(),saveAttempt=Completer<void>();
  bool rejectSave=false;
  int retained=0;
  @override
  Future<String> retainCapture(String id,String source) async {
    retained++;return '/tier1-fast-capture-retained-fixture.jpg';
  }
  @override
  Future<List<Tier1Meal>> load() async=>List.of(records);
  @override
  Future<void> save(Tier1Meal value) async {
    if(!saveAttempt.isCompleted)saveAttempt.complete();
    if(rejectSave)throw const FileSystemException('synthetic parent save failure');
    final index=records.indexWhere((m)=>m.id==value.id);
    final saved=value.withRevision(index<0?1:records[index].revision+1);
    if(index<0){records.add(saved);}else{records[index]=saved;}
    if(!photoSaved.isCompleted)photoSaved.complete();
  }
  @override
  Future<bool> replaceIfRevision(Tier1Meal value,int expected) async {
    final old=records.where((m)=>m.id==value.id).firstOrNull;
    if(old==null||old.revision!=expected)return false;
    await save(value);return true;
  }
}

class _PhotoCamera extends FakeCameraService {
  _PhotoCamera(this.bytes);
  final Uint8List bytes;
  Completer<XFile?>? held;
  XFile get image=>XFile.fromData(bytes,path:'tier1-fast-capture-memory-fixture.jpg',mimeType:'image/jpeg');
  @override
  Future<XFile?> captureStill() async {
    captureCount++;return held==null?image:await held!.future;
  }
}

class _Cloud extends Tier1Cloud {
  int calls=0;
  @override
  Future<Map<String,dynamic>> analyze(String path,{required bool consent}) async {
    if(!consent)throw StateError('Explicit consent required');
    calls++;return portionAnalysis();
  }
}

Future<void> _start(WidgetTester t,_PhotoStore store,_PhotoCamera camera,{Tier1Cloud? cloud,Future<void> Function()? initialize})async{
  await t.pumpWidget(Tier1App(store:store,camera:camera,cloud:cloud,initializeCloud:initialize));
  await t.pumpAndSettle();
}
Future<void> _take(WidgetTester t,_PhotoStore store)async{
  // Real engine JPEG decode must finish outside the fake-async clock. The
  // completer observes parent persistence; no wall-clock sleep guesses timing.
  await t.runAsync(()async{
    await t.tap(find.text('Take photo'));
    await store.photoSaved.future.timeout(const Duration(seconds:10));
  });
}
void _lifecycle(WidgetTester t,bool foreground){
  final states=foreground?[AppLifecycleState.hidden,AppLifecycleState.inactive,AppLifecycleState.resumed]:[AppLifecycleState.inactive,AppLifecycleState.hidden,AppLifecycleState.paused];
  for(final state in states){t.binding.handleAppLifecycleStateChanged(state);}
}

void main(){
  late Uint8List jpeg;
  setUpAll((){jpeg=File('assets/images/coffee-oatmeal.jpg').readAsBytesSync();});

  testWidgets('fresh capture retains its JPEG then offers consent without an Estimate tap',(t)async{
    final store=_PhotoStore(),camera=_PhotoCamera(jpeg),cloud=_Cloud();
    await _start(t,store,camera,cloud:cloud);await _take(t,store);await t.pumpAndSettle();
    // Positive controls distinguish capture/codec failures from the missing offer.
    expect(camera.captureCount,1);expect(store.retained,1);expect(store.records.single.revision,1);
    expect(store.records.single.metadata['width'],greaterThan(0));expect(find.text('Meal estimate'),findsOneWidget);
    expect(find.text('Send this photo for analysis?'),findsOneWidget);
    expect(cloud.calls,0);expect(store.records.single.cloudConsent,false);expect(store.records.single.analysis,isNull);
  });

  testWidgets('declining fresh-capture consent keeps the local photo and lazy cloud fallback',(t)async{
    final store=_PhotoStore(),camera=_PhotoCamera(jpeg);var initializations=0;
    await _start(t,store,camera,initialize:()async{initializations++;});await _take(t,store);await t.pumpAndSettle();
    expect(find.text('Keep local'),findsOneWidget);await t.tap(find.text('Keep local'));await t.pumpAndSettle();
    final saved=store.records.single;expect(saved.photoPath,isNotNull);expect(saved.cloudConsent,false);expect(saved.analysis,isNull);expect(initializations,0);
    expect(t.widget<FilledButton>(find.widgetWithText(FilledButton,'Estimate photo')).onPressed,isNotNull);
    await t.pump();await t.pumpAndSettle();expect(find.text('Send this photo for analysis?'),findsNothing);
    await t.tap(find.text('Estimate photo'));await t.pumpAndSettle();expect(find.text('Keep local'),findsOneWidget);expect(initializations,0);
  });

  testWidgets('dismissing the fresh consent dialog leaves an explicit manual retry',(t)async{
    final store=_PhotoStore(),camera=_PhotoCamera(jpeg),cloud=_Cloud();
    await _start(t,store,camera,cloud:cloud);await _take(t,store);await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'),findsOneWidget);
    t.state<NavigatorState>(find.byType(Navigator).first).pop();await t.pumpAndSettle();
    expect(find.text('Meal estimate'),findsOneWidget);expect(find.text('Estimate photo'),findsOneWidget);expect(cloud.calls,0);expect(store.records.single.cloudConsent,false);
  });

  testWidgets('Send photo explicitly dispatches one mock estimate and leaves editable saved results',(t)async{
    final store=_PhotoStore(),camera=_PhotoCamera(jpeg),cloud=_Cloud();
    await _start(t,store,camera,cloud:cloud);await _take(t,store);await t.pumpAndSettle();
    expect(cloud.calls,0);expect(find.text('Send photo'),findsOneWidget);
    await t.tap(find.text('Send photo'));await t.pumpAndSettle();
    expect(cloud.calls,1);expect(store.records.single.source,'A1');expect(store.records.single.served!.kcal,portionAnalysis()['totals']['kcal']);
    expect(store.records.single.cloudConsent,true);expect(store.records.single.consumedFraction,isNull);expect(store.records.single.photoPath,isNotNull);
    expect(t.widget<TextFormField>(find.widgetWithText(TextFormField,'Meal name')).enabled,true);expect(t.takeException(),isNull);
  });

  testWidgets('opening a saved photo from History does not offer automatic consent',(t)async{
    final store=_PhotoStore(),camera=_PhotoCamera(jpeg),cloud=_Cloud();
    await store.save(Tier1Meal(id:'existing-photo',capturedAt:portionDate,name:'Existing photo',photoPath:'/existing-photo-fixture.jpg',source:'photo'));
    await _start(t,store,camera,cloud:cloud);await t.tap(find.text('History'));await t.pumpAndSettle();await t.tap(find.text('Existing photo'));await t.pumpAndSettle();
    expect(find.text('Send this photo for analysis?'),findsNothing);expect(find.text('Estimate photo'),findsOneWidget);expect(cloud.calls,0);
  });

  testWidgets('background capture completion does not queue consent on resume',(t)async{
    final store=_PhotoStore(),camera=_PhotoCamera(jpeg)..held=Completer<XFile?>(),cloud=_Cloud();
    await _start(t,store,camera,cloud:cloud);await t.tap(find.text('Take photo'));await t.pump();_lifecycle(t,false);
    await t.runAsync(()async{camera.held!.complete(camera.image);await store.photoSaved.future.timeout(const Duration(seconds:10));});
    await t.pumpAndSettle();expect(find.text('Send this photo for analysis?'),findsNothing);
    _lifecycle(t,true);await t.pumpAndSettle();expect(find.text('Send this photo for analysis?'),findsNothing);expect(cloud.calls,0);
    expect(find.text('Estimate photo'),findsOneWidget);
  });

  testWidgets('leaving the fresh editor before its offer callback cannot put consent on History',(t)async{
    final store=_PhotoStore(),camera=_PhotoCamera(jpeg),cloud=_Cloud();
    await _start(t,store,camera,cloud:cloud);await _take(t,store);
    final navigator=t.state<NavigatorState>(find.byType(Navigator).first);
    t.binding.addPostFrameCallback((_){if(navigator.canPop())navigator.pop();});
    await t.pumpAndSettle();expect(find.text('Send this photo for analysis?'),findsNothing);expect(cloud.calls,0);expect(store.records.single.cloudConsent,false);
  });

  testWidgets('failed parent save cannot offer consent or call the cloud',(t)async{
    final store=_PhotoStore()..rejectSave=true,camera=_PhotoCamera(jpeg),cloud=_Cloud();
    await _start(t,store,camera,cloud:cloud);
    await t.runAsync(()async{await t.tap(find.text('Take photo'));await store.saveAttempt.future.timeout(const Duration(seconds:10));});await t.pumpAndSettle();
    expect(store.records,isEmpty);expect(cloud.calls,0);expect(find.text('Send this photo for analysis?'),findsNothing);
  });
}
