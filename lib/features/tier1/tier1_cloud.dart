import 'dart:convert';
import 'dart:io';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

abstract class Tier1Cloud {
  Future<Map<String,dynamic>> analyze(String photoPath,{required bool consent});
}

/// Invoked only by an explicit per-photo consent action, never during startup.
class FirebaseTier1Cloud implements Tier1Cloud {
  FirebaseTier1Cloud(this.initialize);
  final Future<void> Function() initialize;
  @override
  Future<Map<String,dynamic>> analyze(String photoPath,{required bool consent}) async {
    if (!consent) throw StateError('Cloud photo consent required');
    final bytes=await FlutterImageCompress.compressWithFile(photoPath,
      minWidth:1600,minHeight:1600,quality:85,format:CompressFormat.jpeg,keepExif:false);
    if (bytes==null || bytes.length>4*1024*1024) throw const FormatException('Photo too large; retake or enter meal manually');
    if (!await File(photoPath).exists()) throw StateError('Photo deleted');
    await initialize();
    final auth=FirebaseAuth.instance;
    if (auth.currentUser==null) await auth.signInAnonymously();
    if (!await File(photoPath).exists()) throw StateError('Photo deleted before dispatch');
    final result=await FirebaseFunctions.instanceFor(region:'us-central1')
      .httpsCallable('analyzeTier1Meal',options:HttpsCallableOptions(timeout:const Duration(seconds:45)))
      .call<Map<String,dynamic>>({'cloudConsent':'tier1-v1','imageBase64':base64Encode(bytes)});
    final data=Map<String,dynamic>.from(result.data);
    if (data['schemaVersion']!=1 || data['totals'] is! Map) throw const FormatException('Invalid photo estimate');
    return data;
  }
}
