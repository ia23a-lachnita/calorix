import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import '../../core/constants/app_constants.dart';

class UploadQueueService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  Future<String> enqueueAndUpload({
    required String localPath,
    required String uid,
    required String scanMode,
  }) async {
    final docRef = _firestore.collection(AppConstants.entriesCollection).doc();
    final docId = docRef.id;

    // Compress image
    final tempDir = await getTemporaryDirectory();
    final compressedPath = '${tempDir.path}/$docId.jpg';
    final compressed = await FlutterImageCompress.compressAndGetFile(
      localPath,
      compressedPath,
      quality: 85,
      minWidth: 1080,
      minHeight: 1080,
    );

    final uploadFile = compressed ?? XFile(localPath);
    final storageRef = _storage.ref('scans/$uid/$docId.jpg');

    // Upload
    await storageRef.putFile(File(uploadFile.path));
    final imageUrl = await storageRef.getDownloadURL();

    // Write Firestore doc
    await docRef.set({
      'uid': uid,
      'timestamp': FieldValue.serverTimestamp(),
      'imageUrl': imageUrl,
      'scanMode': scanMode,
      'status': 'pending',
    });

    return docId;
  }
}
