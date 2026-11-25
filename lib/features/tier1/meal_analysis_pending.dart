import 'dart:io';

import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// Local-first pending state for an explicitly requested photo estimate.
/// The photo stays visible while the service is held; no duration is implied.
class MealAnalysisPending extends StatelessWidget {
  const MealAnalysisPending({super.key, required this.photoPath});

  final String photoPath;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    const retainedGuidance =
        'Your meal photo remains saved on this device while we wait for the estimate.';
    final spokenStatus = reduceMotion
        ? 'Analyzing your photo. $retainedGuidance Waiting for the estimate.'
        : 'Analyzing your photo. $retainedGuidance';
    return Stack(
      fit: StackFit.expand,
      children: [
        ExcludeSemantics(
          child: Image.file(
            File(photoPath),
            fit: BoxFit.cover,
            errorBuilder: (context, error, stack) =>
                ColoredBox(color: theme.colorScheme.surfaceContainerHighest),
          ),
        ),
        ExcludeSemantics(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  AppColors.backgroundDark.withValues(alpha: .28),
                  AppColors.backgroundDark.withValues(alpha: .08),
                  AppColors.backgroundDark.withValues(alpha: .68),
                ],
                stops: const [0, .42, 1],
              ),
            ),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: SafeArea(
            top: false,
            child: LayoutBuilder(builder: (context, constraints) {
              final maxPanelHeight =
                  constraints.maxHeight > 76 ? constraints.maxHeight - 76 : 0.0;
              return ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxPanelHeight),
                child: SingleChildScrollView(
                  child: Semantics(
                    container: true,
                    header: true,
                    liveRegion: true,
                    label: spokenStatus,
                    child: ExcludeSemantics(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                        child: Material(
                          color:
                              theme.colorScheme.surface.withValues(alpha: .96),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(28),
                            side: BorderSide(
                              color: theme.colorScheme.outlineVariant
                                  .withValues(alpha: .45),
                            ),
                          ),
                          elevation: 0,
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(
                                  children: [
                                    Icon(Icons.cloud_outlined,
                                        color: theme.colorScheme.primary),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        'Analyzing your photo',
                                        style: theme.textTheme.titleLarge,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  retainedGuidance,
                                  style: theme.textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 22),
                                if (reduceMotion)
                                  Row(
                                    children: [
                                      Icon(Icons.hourglass_empty,
                                          size: 18,
                                          color: theme.colorScheme.primary),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text('Waiting for the estimate',
                                            style: theme.textTheme.bodySmall),
                                      ),
                                    ],
                                  )
                                else
                                  const LinearProgressIndicator(),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ],
    );
  }
}
