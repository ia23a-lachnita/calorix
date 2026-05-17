import 'package:camera/camera.dart';

class CameraService {
  static Future<List<CameraDescription>> getCameras() =>
      availableCameras();

  static CameraController createController(CameraDescription camera) =>
      CameraController(
        camera,
        ResolutionPreset.high,
        enableAudio: false,
      );
}
