import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import '../theme/app_colors.dart';
import 'tactical_popup.dart';

final ratingFutureProvider = FutureProvider.family.autoDispose<Map<String, dynamic>, (String, String)>((ref, args) async {
  final dio = ref.watch(dioProvider);
  final (targetType, targetId) = args;
  final res = await dio.get('/ratings/$targetType/$targetId');
  return Map<String, dynamic>.from(res.data as Map? ?? {});
});

class RatingWidget extends ConsumerStatefulWidget {
  final String targetType; // 'CITIZEN' | 'STOCK_COMPANY' | 'NEWS_PORTAL'
  final String targetId;
  final bool compact;

  const RatingWidget({
    super.key,
    required this.targetType,
    required this.targetId,
    this.compact = false,
  });

  @override
  ConsumerState<RatingWidget> createState() => _RatingWidgetState();
}

class _RatingWidgetState extends ConsumerState<RatingWidget> {
  bool _busy = false;

  void _vote(bool isLike) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/ratings', data: {
        'targetType': widget.targetType,
        'targetId': widget.targetId,
        'isLike': isLike,
      });
      ref.invalidate(ratingFutureProvider((widget.targetType, widget.targetId)));
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'RATING FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ratingAsync = ref.watch(ratingFutureProvider((widget.targetType, widget.targetId)));

    return ratingAsync.when(
      data: (data) {
        final likes = (data['likes'] as num?)?.toInt() ?? 0;
        final dislikes = (data['dislikes'] as num?)?.toInt() ?? 0;
        final myVote = data['myVote'] as bool?;

        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Thumbs up
            InkWell(
              onTap: _busy ? null : () => _vote(true),
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding: EdgeInsets.symmetric(
                  horizontal: widget.compact ? 6 : 8,
                  vertical: widget.compact ? 2 : 4,
                ),
                decoration: BoxDecoration(
                  color: myVote == true
                      ? AppColors.emerald.withValues(alpha: 0.2)
                      : AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: myVote == true
                        ? AppColors.emerald.withValues(alpha: 0.6)
                        : AppColors.border,
                    width: 0.8,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.thumb_up_rounded,
                      size: widget.compact ? 12 : 14,
                      color: myVote == true ? AppColors.emerald : AppColors.textMuted,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '$likes',
                      style: TextStyle(
                        fontSize: widget.compact ? 11 : 12,
                        fontWeight: FontWeight.bold,
                        color: myVote == true ? AppColors.emerald : AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 6),
            // Thumbs down
            InkWell(
              onTap: _busy ? null : () => _vote(false),
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding: EdgeInsets.symmetric(
                  horizontal: widget.compact ? 6 : 8,
                  vertical: widget.compact ? 2 : 4,
                ),
                decoration: BoxDecoration(
                  color: myVote == false
                      ? AppColors.crimson.withValues(alpha: 0.2)
                      : AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: myVote == false
                        ? AppColors.crimson.withValues(alpha: 0.6)
                        : AppColors.border,
                    width: 0.8,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.thumb_down_rounded,
                      size: widget.compact ? 12 : 14,
                      color: myVote == false ? AppColors.crimson : AppColors.textMuted,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '$dislikes',
                      style: TextStyle(
                        fontSize: widget.compact ? 11 : 12,
                        fontWeight: FontWeight.bold,
                        color: myVote == false ? AppColors.crimson : AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
      loading: () => const SizedBox(
        width: 32,
        height: 14,
        child: LinearProgressIndicator(color: AppColors.cyan),
      ),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}
