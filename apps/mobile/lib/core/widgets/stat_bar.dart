import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class StatBar extends StatelessWidget {
  final String label;
  final num value;
  final num max;
  final Color barColor;
  final Color? trackColor;
  final double height;
  final String? customValueText;

  const StatBar({
    super.key,
    required this.label,
    required this.value,
    required this.max,
    this.barColor = AppColors.emerald,
    this.trackColor,
    this.height = 8,
    this.customValueText,
  });

  @override
  Widget build(BuildContext context) {
    final progress = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              customValueText ?? '${value.toInt()} / ${max.toInt()}',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.bold,
                  ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Container(
          height: height,
          width: double.infinity,
          decoration: BoxDecoration(
            color: trackColor ?? AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(height / 2),
            border: Border.all(color: AppColors.border, width: 0.5),
          ),
          alignment: Alignment.centerLeft,
          child: AnimatedFractionallySizedBox(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic,
            widthFactor: progress.toDouble(),
            child: Container(
              decoration: BoxDecoration(
                color: barColor,
                borderRadius: BorderRadius.circular(height / 2),
                boxShadow: [
                  BoxShadow(
                    color: barColor.withOpacity(0.4),
                    blurRadius: 4,
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
