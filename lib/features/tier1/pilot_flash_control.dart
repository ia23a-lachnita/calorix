import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../../shared/services/camera_service.dart';

/// Displays the device controller's actual flash mode. A missing controller
/// remains unavailable and a failed platform operation leaves the mode intact.
class PilotFlashControl extends StatefulWidget {
  const PilotFlashControl({super.key, required this.camera});
  final CameraService camera;
  @override
  State<PilotFlashControl> createState() => _PilotFlashControlState();
}

class _PilotFlashControlState extends State<PilotFlashControl> {
  bool _busy = false;
  CameraFlashService? get _flash => widget.camera is CameraFlashService
      ? widget.camera as CameraFlashService
      : null;
  Future<void> _advance() async {
    final flash = _flash;
    final current = flash?.currentFlashMode;
    if (flash == null || current == null || _busy) return;
    final next = switch (current) {
      FlashMode.off => FlashMode.auto,
      FlashMode.auto => FlashMode.always,
      _ => FlashMode.off,
    };
    setState(() => _busy = true);
    try {
      await flash.setFlashMode(next);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Flash could not be changed.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = _flash?.currentFlashMode;
    final (label, icon) = switch (mode) {
      FlashMode.off => ('Flash off', Icons.flash_off_outlined),
      FlashMode.auto => ('Flash auto', Icons.flash_auto_outlined),
      FlashMode.always || FlashMode.torch => (
          'Flash on',
          Icons.flash_on_outlined
        ),
      _ => ('Flash unavailable', Icons.flash_off_outlined),
    };
    return IconButton.filledTonal(
        tooltip: label,
        onPressed: mode == null || _busy ? null : _advance,
        icon: Icon(icon));
  }
}
