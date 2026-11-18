import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'local_meal.dart';

const _photoLimit = 20 * 1024 * 1024;
const _recordLimit = 1024 * 1024;
const _channel = MethodChannel('com.calorix.calorix/meal_export');

class MealCopyException implements Exception {
  const MealCopyException(this.message);
  final String message;
}

/// Snapshot only. Exporting never writes a meal, changes consent, or makes a reference.
Future<Map<String, Object>> prepareMealCopy(Tier1Meal meal,
    {required DateTime exportedAt}) async {
  if (meal.revision < 1 || meal.photoPath == null) {
    throw const MealCopyException('Save a photo meal before exporting a copy.');
  }
  final saved = meal.toJson()..remove('photoPath');
  // Freeze nested maps before awaiting file I/O; later caller edits cannot enter this copy.
  final snapshot = jsonDecode(jsonEncode(saved));
  final photo = File(meal.photoPath!);
  final builder = BytesBuilder(copy: false);
  try {
    if (await photo.length() > _photoLimit) {
      throw const MealCopyException('This photo is too large to export.');
    }
    await for (final chunk in photo.openRead(0, _photoLimit + 1)) {
      builder.add(chunk);
      if (builder.length > _photoLimit) {
        throw const MealCopyException('This photo is too large to export.');
      }
    }
  } on FileSystemException {
    throw const MealCopyException(
        'The saved photo could not be read. Measurements can still be exported.');
  }
  final bytes = builder.takeBytes();
  if (bytes.length < 4 || bytes[0] != 255 || bytes[1] != 216) {
    throw const MealCopyException('The saved photo is not a JPEG.');
  }
  final record = Uint8List.fromList(utf8.encode(jsonEncode({
    'schemaVersion': 1,
    'exportedAtUtc': exportedAt.toUtc().toIso8601String(),
    'referenceMeasurementsIncluded': false,
    'photoFile': 'photo.jpg',
    'photoSha256': sha256.convert(bytes).toString(),
    'meal': snapshot,
  })));
  if (record.length > _recordLimit) {
    throw const MealCopyException('This meal has too much detail to export.');
  }
  return {'fileName': 'ravlo-${meal.id}.zip', 'photo': bytes, 'record': record};
}

Future<bool> saveMealCopy(Tier1Meal meal,
        {required DateTime exportedAt}) async =>
    await _channel.invokeMethod<bool>(
        'saveMealCopy', await prepareMealCopy(meal, exportedAt: exportedAt)) ??
    false;

/// The explicit save action opens Android's file picker; it chooses no destination itself.
Future<void> showMealCopyExport(BuildContext context,
    {required Future<bool> Function() save,
    required Future<void> Function() measurements,
    bool canSave = true}) async {
  var busy = false;
  String? message;
  final messenger = ScaffoldMessenger.of(context);
  final openMeasurements = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
          builder: (context, update) => PopScope(
              canPop: !busy,
              child: AlertDialog(
                title: const Text('Export meal'),
                content: SingleChildScrollView(
                    child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                        'Save the original photo and meal details as a ZIP file. Exported copies are outside Ravlo’s deletion controls. Choose a location on this phone to keep the copy local.'),
                    if (!canSave)
                      const Padding(
                          padding: EdgeInsets.only(top: 12),
                          child: Text(
                              'Save your changes before exporting a meal copy.')),
                    if (message != null)
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(message!)),
                    const SizedBox(height: 8),
                    Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                            onPressed: busy
                                ? null
                                : () => Navigator.pop(dialogContext, true),
                            child: const Text('Measurements only'))),
                  ],
                )),
                actions: [
                  TextButton(
                      onPressed: busy
                          ? null
                          : () => Navigator.pop(dialogContext, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: busy || !canSave
                          ? null
                          : () async {
                              update(() {
                                busy = true;
                                message = null;
                              });
                              try {
                                final saved = await save();
                                if (!dialogContext.mounted) return;
                                if (saved) {
                                  Navigator.pop(dialogContext, false);
                                  messenger.showSnackBar(const SnackBar(
                                      content: Text('Meal copy saved.')));
                                } else {
                                  update(() {
                                    busy = false;
                                    message = 'No copy saved.';
                                  });
                                }
                              } catch (error) {
                                if (!dialogContext.mounted) return;
                                update(() {
                                  busy = false;
                                  message = switch (error) {
                                    MealCopyException(:final message) =>
                                      message,
                                    MissingPluginException() =>
                                      'Saving a meal copy is not available on this device. Measurements can still be exported.',
                                    _ =>
                                      'The copy could not be saved. A partial copy may remain in the chosen location. Your original meal is still in Ravlo.',
                                  };
                                });
                              }
                            },
                      child: Text(busy ? 'Saving…' : 'Save meal copy')),
                ],
              ))));
  if (openMeasurements == true && context.mounted) await measurements();
}
