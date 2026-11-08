import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'local_meal.dart';

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
    final all=await _read();
    final found=all.where((m)=>m.id==id).firstOrNull;
    all.removeWhere((m)=>m.id==id);
    await _write(all);
    final owned=File('${root.path}/photos/$id.jpg');
    if (found?.photoPath==owned.path && await owned.exists()) await owned.delete();
    // A backup retaining a deleted photo/recipe is not a deletion control.
    final backup=File('${root.path}/meals.previous.json');
    if (await backup.exists()) await backup.delete();
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
