import 'package:flutter_riverpod/flutter_riverpod.dart';

enum ScanMode { meal, barcode, label }

enum CaptureState { idle, capturing, uploading }

final scanModeProvider = StateProvider<ScanMode>((ref) => ScanMode.meal);
final captureStateProvider = StateProvider<CaptureState>((ref) => CaptureState.idle);
final fcmPermissionProvider = StateProvider<bool?>((ref) => null);
