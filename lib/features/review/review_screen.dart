import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/route_names.dart';
import '../../core/theme/app_colors.dart';
import 'providers/review_providers.dart';

class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({super.key, required this.entryId});
  final String entryId;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  int _selected = 0;
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final entry = ref.watch(reviewEntryProvider(widget.entryId));
    return Scaffold(
      body: entry.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Could not load review')),
        data: (value) {
          if (value == null) {
            return const Center(child: Text('Food entry no longer exists'));
          }
          final candidates = value.candidates;
          final confidence = ((value.confidence ?? 0) * 100).round();
          if (_selected >= candidates.length) _selected = 0;
          return Stack(
            children: [
              Positioned.fill(
                child: value.imageUrl == null
                    ? const ColoredBox(color: AppColors.backgroundDark)
                    : Image.network(value.imageUrl!, fit: BoxFit.cover),
              ),
              Positioned(
                top: 48,
                left: 18,
                child: IconButton.filledTonal(
                  tooltip: 'Close',
                  onPressed: () => context.goNamed(RouteNames.today),
                  icon: const Icon(Icons.close),
                ),
              ),
              Positioned(
                top: 48,
                right: 18,
                child: TextButton.icon(
                  onPressed: () => context.goNamed(RouteNames.scan),
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Retake'),
                ),
              ),
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 32),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius:
                        const BorderRadius.vertical(top: Radius.circular(28)),
                  ),
                  child: SafeArea(
                    top: false,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        maxHeight: MediaQuery.sizeOf(context).height * 0.72,
                      ),
                      child: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Center(
                              child: Container(
                                width: 40,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: Theme.of(context).dividerColor,
                                  borderRadius: BorderRadius.circular(99),
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            Chip(
                              avatar: const CircleAvatar(
                                radius: 3,
                                backgroundColor: AppColors.needsReview,
                              ),
                              label: Text('$confidence% CONFIDENCE'),
                            ),
                            const SizedBox(height: 10),
                            Text('Which one is it?',
                                style:
                                    Theme.of(context).textTheme.headlineSmall),
                            const SizedBox(height: 4),
                            const Text(
                              'Pick the closest match. You can fine-tune it after.',
                            ),
                            const SizedBox(height: 14),
                            if (candidates.isEmpty)
                              const Text('No confident matches were found.')
                            else
                              RadioGroup<int>(
                                groupValue: _selected,
                                onChanged: (next) =>
                                    setState(() => _selected = next ?? 0),
                                child: Column(
                                  children: [
                                    for (var index = 0;
                                        index < candidates.length;
                                        index++)
                                      Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 8),
                                        child: RadioListTile<int>(
                                          value: index,
                                          title: Text(candidates[index].name),
                                          secondary: Text(
                                              '${candidates[index].kcal} kcal'),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () =>
                                        context.pushNamed(RouteNames.manual),
                                    child: const Text('None of these'),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  flex: 2,
                                  child: FilledButton(
                                    onPressed: candidates.isEmpty || _saving
                                        ? null
                                        : () async {
                                            setState(() => _saving = true);
                                            await ref
                                                .read(
                                                    reviewEntryGatewayProvider)
                                                .confirm(widget.entryId,
                                                    candidates[_selected]);
                                            if (context.mounted) {
                                              context.goNamed(
                                                RouteNames.foodDetail,
                                                pathParameters: {
                                                  'id': widget.entryId
                                                },
                                              );
                                            }
                                          },
                                    child: Text(candidates.isEmpty
                                        ? 'Confirm'
                                        : 'Confirm · ${candidates[_selected].kcal} kcal'),
                                  ),
                                ),
                              ],
                            ),
                            Center(
                              child: TextButton(
                                onPressed: () => context.pushNamed(
                                  RouteNames.aiChatOverlay,
                                  queryParameters: {'mealId': widget.entryId},
                                ),
                                child:
                                    const Text('Ask Placeholder AI instead →'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
