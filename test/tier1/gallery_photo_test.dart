import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:calorix/features/tier1/gallery_photo.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final jpg = File('assets/images/coffee-oatmeal.jpg').readAsBytesSync();
  test('a gallery JPEG can be retained without modifying its source', () async {
    final result = await prepareGalleryPhoto(XFile.fromData(jpg));
    expect(result.bytes, jpg);
    expect(result.width, greaterThan(0));
    expect(result.height, greaterThan(0));
  });
  test('a PNG is normalized through the encoder into JPEG storage', () async {
    final png = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC');
    var calls = 0;
    final result = await prepareGalleryPhoto(XFile.fromData(png),
        encodePng: (bytes) async {
      calls++;
      expect(bytes, png);
      return jpg;
    });
    expect(calls, 1);
    expect(result.bytes, jpg);
    expect(png.take(4), [137, 80, 78, 71]);
  });
  test('invalid file and invalid encoded output cannot become a saved JPEG',
      () async {
    await expectLater(
        prepareGalleryPhoto(XFile.fromData(Uint8List.fromList([1, 2, 3]))),
        throwsFormatException);
  });
}
