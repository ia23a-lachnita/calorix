import 'dart:io';
import 'package:flutter/material.dart';

const _unavailable = 'Saved photo is unavailable';

/// Read-only photo inspection; the editor and its unsaved fields stay underneath.
class MealPhotoPreview extends StatelessWidget {
  const MealPhotoPreview(
      {super.key,
      required this.photoPath,
      this.heroTag,
      this.flightShuttleBuilder});
  final String photoPath;
  final Object? heroTag;
  final HeroFlightShuttleBuilder? flightShuttleBuilder;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    void open() => Navigator.of(context).push<void>(MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => _MealPhotoViewer(photoPath: photoPath)));
    Widget preview = Material(
        color: colors.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(24),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
            onTap: open,
            child: SizedBox(
                height: 220,
                width: double.infinity,
                child: Stack(fit: StackFit.expand, children: [
                  Image.file(File(photoPath),
                      fit: BoxFit.contain,
                      cacheHeight:
                          (220 * MediaQuery.devicePixelRatioOf(context))
                              .ceil(),
                      excludeFromSemantics: true,
                      errorBuilder: (_, __, ___) =>
                          const Center(child: Text(_unavailable))),
                  Positioned(
                      right: 12,
                      bottom: 12,
                      child: DecoratedBox(
                          decoration: BoxDecoration(
                              color: colors.surface, shape: BoxShape.circle),
                          child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Icon(Icons.fullscreen,
                                  color: colors.onSurface))))
                ]))));
    if (heroTag != null) {
      preview = Hero(
          tag: heroTag!,
          flightShuttleBuilder: flightShuttleBuilder,
          child: preview);
    }
    return Semantics(
        button: true,
        label: 'View full photo',
        child: Tooltip(
            message: 'View full photo',
            excludeFromSemantics: true,
            child: preview));
  }
}

class _MealPhotoViewer extends StatelessWidget {
  const _MealPhotoViewer({required this.photoPath});
  final String photoPath;

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Meal photo')),
      body: SafeArea(
          child: LayoutBuilder(
              builder: (context, constraints) => InteractiveViewer(
                  minScale: 1,
                  maxScale: 5,
                  clipBehavior: Clip.hardEdge,
                  child: SizedBox(
                      width: constraints.maxWidth,
                      height: constraints.maxHeight,
                      child: Image.file(File(photoPath),
                          fit: BoxFit.contain,
                          semanticLabel: 'Meal photo',
                          errorBuilder: (_, __, ___) =>
                              const Center(child: Text(_unavailable))))))));
}
