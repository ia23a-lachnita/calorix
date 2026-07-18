import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import '../utils/date_key.dart';
import '../../core/constants/app_constants.dart';
import '../../core/time/clock.dart';

class UploadQueueService {
  UploadQueueService(this._clock);
  final Clock _clock;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  Future<String> enqueueAndUpload({
    required String localPath,
    required String uid,
    required String scanMode,
  }) async {
    final docRef = _firestore
        .collection(AppConstants.usersCollection)
        .doc(uid)
        .collection(AppConstants.entriesSubCollection)
        .doc();
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
    final storagePath = 'scans/$uid/$docId.jpg';
    final storageRef = _storage.ref(storagePath);

    // Upload
    await storageRef.putFile(File(uploadFile.path));
    final imageUrl = await storageRef.getDownloadURL();

    // Write Firestore doc; the analysis function reads storagePath via the
    // Admin SDK, imageUrl stays for in-app display.
    await docRef.set({
      'uid': uid,
      'timestamp': FieldValue.serverTimestamp(),
      'date': localDateKey(_clock.nowTZ()),
      'imageUrl': imageUrl,
      'storagePath': storagePath,
      'scanMode': scanMode,
      'status': 'pending',
    });

    return docId;
  }
}
