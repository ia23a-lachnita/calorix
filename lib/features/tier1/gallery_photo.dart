import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter_image_compress/flutter_image_compress.dart';

const _limit = 20 * 1024 * 1024;
typedef GalleryPhoto = ({Uint8List bytes, int width, int height});

Future<(int, int)> _dimensions(Uint8List bytes) async {
  final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
  try {
    final image = await ui.ImageDescriptor.encoded(buffer);
    try {
      if (image.width * image.height > 64000000) {
        throw const FormatException('Image resolution too large');
      }
      // Exercise the decoder before saving. The full-size original is kept.
      final codec =
          await image.instantiateCodec(targetWidth: 1, targetHeight: 1);
      try {
        final frame = await codec.getNextFrame();
        frame.image.dispose();
      } finally {
        codec.dispose();
      }
      return (image.width, image.height);
    } finally {
      image.dispose();
    }
  } finally {
    buffer.dispose();
  }
}

Future<GalleryPhoto> prepareGalleryPhoto(XFile file,
    {Future<Uint8List> Function(Uint8List)? encodePng}) async {
  if (await file.length() > _limit) {
    throw const FormatException('Photo too large');
  }
  var bytes = await file.readAsBytes();
  if (bytes.length < 8 || bytes.length > _limit) {
    throw const FormatException('Invalid image size');
  }
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  final isPng = List.generate(png.length, (i) => bytes[i] == png[i])
      .every((matches) => matches);
  if (isPng) {
    final (width, height) = await _dimensions(bytes);
    bytes = await (encodePng?.call(bytes) ??
        FlutterImageCompress.compressWithList(bytes,
            minWidth: width,
            minHeight: height,
            quality: 95,
            format: CompressFormat.jpeg,
            keepExif: false));
  }
  if (bytes.length < 8 ||
      bytes.length > _limit ||
      bytes[0] != 255 ||
      bytes[1] != 216) {
    throw const FormatException('Select a JPEG or PNG photo');
  }
  final (width, height) = await _dimensions(bytes);
  return (bytes: bytes, width: width, height: height);
}
