import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';

class MoneyPill extends StatelessWidget {
  final num amount;
  final bool isGold;
  final String? currencySymbol;
  final TextStyle? style;

  const MoneyPill({
    super.key,
    required this.amount,
    this.isGold = true,
    this.currencySymbol,
    this.style,
  });

  @override
  Widget build(BuildContext context) {
    // Financial formatting: handles minor units if passed in as double/int
    final formatted = NumberFormat('#,##0.00').format(amount);
    final color = isGold ? AppColors.amber : AppColors.emerald;
    final icon = isGold ? Icons.monetization_on_rounded : Icons.payments_rounded;
    final suffix = isGold ? ' G' : (currencySymbol != null ? ' $currencySymbol' : ' CC');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.35), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              '$formatted$suffix',
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
              style: style ??
                  Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: color,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.2,
                      ),
            ),
          ),
        ],
      ),
    );
  }
}
