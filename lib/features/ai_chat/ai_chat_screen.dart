import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/ai_chat_providers.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_text_styles.dart';
import '../../shared/models/macro_target_plan.dart';
import '../../shared/providers/auth_provider.dart';
import '../today/providers/today_providers.dart';

class AiChatScreen extends ConsumerStatefulWidget {
  final String? preloadedMealId;
  const AiChatScreen({super.key, this.preloadedMealId});

  @override
  ConsumerState<AiChatScreen> createState() => _AiChatScreenState();
}

class _AiChatScreenState extends ConsumerState<AiChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  static const _suggestedPrompts = [
    'Plan my remaining macros',
    'Adjust for fat loss',
    'Why are my carbs low?',
    'Help me hit protein target',
  ];

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _sendMessage(String text) async {
    if (text.trim().isEmpty) return;
    _controller.clear();
    final notifier = ref.read(chatMessagesProvider.notifier);
    notifier.addUserMessage(text);
    ref.read(isChatLoadingProvider.notifier).state = true;

    final plan = ref.read(activePlanProvider).valueOrNull ??
        MacroTargetPlan.defaultPlan();
    final today = ref.read(todayMacroSummaryProvider);

    if (!ref.read(geminiConfiguredProvider)) {
      notifier.addAiMessage(
          'The assistant is not configured yet. Provide a Gemini API key with '
          '--dart-define=GEMINI_API_KEY=… to enable live answers.');
      ref.read(isChatLoadingProvider.notifier).state = false;
      return;
    }

    final context = '''
You are Calorix, an in-app nutrition coach. Be concise and practical.
Current daily targets: ${plan.kcal} kcal, ${plan.protein}g protein, ${plan.carbs}g carbs, ${plan.fat}g fat (plan: ${plan.planName}).
Consumed so far today: ${today.kcal.round()} kcal, ${today.protein.round()}g protein, ${today.carbs.round()}g carbs, ${today.fat.round()}g fat.
If you recommend changing a single calorie or macro target, end your reply with exactly one line of JSON:
{"action":{"field":"Protein","macro":"protein","old":${plan.protein},"new":190}}
where "macro" is one of kcal, protein, carbs, fat. Otherwise do not output JSON.''';

    try {
      final raw = await ref
          .read(geminiServiceProvider)
          .sendMessage(text, context: context);
      final parsed = _parseReply(raw, plan);
      notifier.addAiMessage(parsed.text.isEmpty ? 'Done.' : parsed.text,
          action: parsed.action);
    } catch (e) {
      notifier.addAiMessage(
          "Sorry, I couldn't reach the assistant just now. ($e)");
    } finally {
      ref.read(isChatLoadingProvider.notifier).state = false;
    }

    await Future.delayed(const Duration(milliseconds: 100));
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _applyAction(int index, AiAction action) async {
    final notifier = ref.read(chatMessagesProvider.notifier);
    final update = action.targetUpdate;
    if (update == null) {
      notifier.clearActionAt(index);
      return;
    }
    final uid = ref.read(currentUidProvider);
    final repo = ref.read(macroTargetRepositoryProvider);
    final plan = ref.read(activePlanProvider).valueOrNull ??
        MacroTargetPlan.defaultPlan();
    try {
      if (uid == null) throw 'You are not signed in.';
      if (plan.id == 'default') {
        final newPlan = plan.copyWith(
          kcal: update['kcal'],
          protein: update['protein'],
          carbs: update['carbs'],
          fat: update['fat'],
          isActive: true,
        );
        final id = await repo.createPlan(uid, newPlan);
        await repo.setActivePlan(uid, id);
      } else {
        await repo.updatePlan(uid, plan.id, update);
      }
      notifier.clearActionAt(index);
      notifier.addAiMessage(
          'Done — your ${action.field.toLowerCase()} target is now ${action.newValue}.');
    } catch (e) {
      notifier.addAiMessage("I couldn't apply that change: $e");
    }
  }

  void _rejectAction(int index) {
    final notifier = ref.read(chatMessagesProvider.notifier);
    notifier.clearActionAt(index);
    notifier.addAiMessage("No problem — I'll leave your targets unchanged.");
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(chatMessagesProvider);
    final isLoading = ref.watch(isChatLoadingProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight;

    return Scaffold(
      body: Column(
        children: [
          // Header
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  Text('AI', style: AppTextStyles.heading1.copyWith(color: textColor)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.green.withAlpha(20),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppColors.green,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'CAN EDIT YOUR PLAN',
                          style: AppTextStyles.labelMono.copyWith(color: AppColors.green),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Message list
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: messages.length + (isLoading ? 1 : 0),
              itemBuilder: (context, index) {
                if (index == messages.length) {
                  return const _TypingIndicator();
                }
                final msg = messages[index];
                return _MessageBubble(
                  message: msg,
                  isDark: isDark,
                  onApply: msg.action != null
                      ? () => _applyAction(index, msg.action!)
                      : null,
                  onReject:
                      msg.action != null ? () => _rejectAction(index) : null,
                );
              },
            ),
          ),

          // Suggested prompts
          SizedBox(
            height: 44,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _suggestedPrompts.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final prompt = _suggestedPrompts[index];
                return ActionChip(
                  label: Text(prompt),
                  onPressed: () => _sendMessage(prompt),
                  labelStyle: AppTextStyles.labelSmall,
                );
              },
            ),
          ),
          const SizedBox(height: 8),

          // Composer
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: _Composer(
                controller: _controller,
                onSend: () => _sendMessage(_controller.text),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isDark;
  final VoidCallback? onApply;
  final VoidCallback? onReject;
  const _MessageBubble({
    required this.message,
    required this.isDark,
    this.onApply,
    this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == MessageRole.user;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment:
            isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isUser
                  ? (isDark ? AppColors.userBubbleDark : AppColors.userBubbleLight)
                  : (isDark ? AppColors.surfaceDark : AppColors.surfaceLight),
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(18),
                topRight: const Radius.circular(18),
                bottomLeft: Radius.circular(isUser ? 18 : 6),
                bottomRight: Radius.circular(isUser ? 6 : 18),
              ),
              border: isUser
                  ? null
                  : Border.all(
                      color: isDark ? AppColors.borderDark : AppColors.borderLight),
            ),
            child: Text(
              message.content,
              style: AppTextStyles.bodyMedium.copyWith(
                color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight,
              ),
            ),
          ),
          if (message.action != null) ...[
            const SizedBox(height: 8),
            _ConfirmCard(
              action: message.action!,
              isDark: isDark,
              onApply: onApply,
              onReject: onReject,
            ),
          ],
        ],
      ),
    );
  }
}

class _ConfirmCard extends StatelessWidget {
  final AiAction action;
  final bool isDark;
  final VoidCallback? onApply;
  final VoidCallback? onReject;
  const _ConfirmCard({
    required this.action,
    required this.isDark,
    this.onApply,
    this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final isIncrease = action.delta > 0;
    final deltaColor = isIncrease ? AppColors.blue : AppColors.green;

    return Container(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 0.78,
      ),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.blue.withAlpha(60)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(action.title,
                  style: AppTextStyles.labelLarge.copyWith(
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.blue.withAlpha(20),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('AI ACTION',
                    style: AppTextStyles.labelMono.copyWith(color: AppColors.blue)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Old → new table row
          Row(
            children: [
              Container(width: 8, height: 8,
                  decoration: const BoxDecoration(color: AppColors.protein, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text(action.field,
                  style: AppTextStyles.labelLarge.copyWith(
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight)),
              const Spacer(),
              Text(action.oldValue,
                  style: AppTextStyles.bodySmall.copyWith(
                      decoration: TextDecoration.lineThrough,
                      color: AppColors.textSecondaryLight)),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, size: 14),
              const SizedBox(width: 8),
              Text(action.newValue,
                  style: AppTextStyles.labelLarge.copyWith(
                      color: isDark ? AppColors.textPrimaryDark : AppColors.textPrimaryLight)),
              const SizedBox(width: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: deltaColor.withAlpha(20),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '${isIncrease ? '+' : ''}${action.delta}',
                  style: AppTextStyles.labelSmall.copyWith(color: deltaColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onReject,
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.borderLight),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  child: const Text('Reject'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton(
                  onPressed: onApply,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.blue,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  child: const Text('Apply'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.surfaceLight,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(18),
                topRight: Radius.circular(18),
                bottomRight: Radius.circular(18),
                bottomLeft: Radius.circular(6),
              ),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _Dot(delay: 0),
                SizedBox(width: 4),
                _Dot(delay: 200),
                SizedBox(width: 4),
                _Dot(delay: 400),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Dot extends StatefulWidget {
  final int delay;
  const _Dot({required this.delay});

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat(reverse: true);
    _opacity = Tween<double>(begin: 0.3, end: 1.0).animate(_controller);
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _opacity,
        child: Container(
          width: 7,
          height: 7,
          decoration: const BoxDecoration(
            color: AppColors.textSecondaryLight,
            shape: BoxShape.circle,
          ),
        ),
      );
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSend;
  const _Composer({required this.controller, required this.onSend});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.add, size: 20),
            onPressed: () {},
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
          Expanded(
            child: TextField(
              controller: controller,
              decoration: const InputDecoration(
                hintText: 'Ask anything…',
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              ),
              style: AppTextStyles.bodyMedium,
              maxLines: 3,
              minLines: 1,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.mic_outlined, size: 20),
            onPressed: () {},
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
          GestureDetector(
            onTap: onSend,
            child: Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.blue, AppColors.cyan],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.arrow_upward, color: AppColors.cameraOverlayText, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}

int _currentTarget(MacroTargetPlan p, String macro) => switch (macro) {
      'kcal' => p.kcal,
      'protein' => p.protein,
      'carbs' => p.carbs,
      'fat' => p.fat,
      _ => 0,
    };

/// Splits a Gemini reply into display text and an optional applicable
/// macro-target action encoded as a trailing JSON object.
({String text, AiAction? action}) _parseReply(
    String raw, MacroTargetPlan plan) {
  final match =
      RegExp(r'\{[^{}]*"action"[\s\S]*?\}\s*\}').firstMatch(raw) ??
          RegExp(r'\{[\s\S]*"action"[\s\S]*\}').firstMatch(raw);
  if (match == null) return (text: raw.trim(), action: null);

  final cleaned = raw.replaceFirst(match.group(0)!, '').trim();
  try {
    final json = jsonDecode(match.group(0)!) as Map<String, dynamic>;
    final a = json['action'] as Map<String, dynamic>;
    final macro = (a['macro'] as String? ?? '').toLowerCase();
    final newV = (a['new'] as num?)?.toInt();
    if (!const ['kcal', 'protein', 'carbs', 'fat'].contains(macro) ||
        newV == null) {
      return (text: cleaned.isEmpty ? raw.trim() : cleaned, action: null);
    }
    final oldV = (a['old'] as num?)?.toInt() ?? _currentTarget(plan, macro);
    final field = a['field'] as String? ??
        '${macro[0].toUpperCase()}${macro.substring(1)}';
    final unit = macro == 'kcal' ? '' : 'g';
    return (
      text: cleaned.isEmpty ? 'Here is a suggested change.' : cleaned,
      action: AiAction(
        title: 'Update $field target',
        field: field,
        oldValue: '$oldV$unit',
        newValue: '$newV$unit',
        delta: newV - oldV,
        targetUpdate: {macro: newV},
      ),
    );
  } catch (_) {
    return (text: raw.trim(), action: null);
  }
}
