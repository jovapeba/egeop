import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_colors.dart';

class TacticalHotlistBar extends StatelessWidget {
  final List<String> shortcuts;

  const TacticalHotlistBar({super.key, required this.shortcuts});

  static const Map<String, (String, IconData)> _routeMeta = {
    '/warfare': ('Battles', Icons.sports_mma_rounded),
    '/fight': ('Battles', Icons.sports_mma_rounded),
    '/equipment': ('Equip', Icons.shield_rounded),
    '/companies': ('Companies', Icons.factory_rounded),
    '/work': ('Work', Icons.work_rounded),
    '/politics': ('Politics', Icons.account_balance_rounded),
    '/media': ('Media', Icons.newspaper_rounded),
    '/mu': ('Military', Icons.group_work_rounded),
    '/auctions': ('Auctions', Icons.gavel_rounded),
    '/contracts': ('Contracts', Icons.description_rounded),
    '/events': ('Tournaments', Icons.emoji_events_rounded),
    '/achievements': ('Badges', Icons.military_tech_rounded),
    '/stats': ('Stats', Icons.bar_chart_rounded),
    '/market': ('Market', Icons.storefront_rounded),
    '/monetary': ('Monetary', Icons.currency_exchange_rounded),
    '/profile': ('Profile', Icons.person_rounded),
  };

  @override
  Widget build(BuildContext context) {
    if (shortcuts.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 38,
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border, width: 0.8)),
      ),
      child: Row(
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 10, right: 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.bolt_rounded, size: 14, color: AppColors.amber),
                const SizedBox(width: 2),
                Text(
                  'HOTLIST',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.8,
                    color: AppColors.amber.withValues(alpha: 0.9),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              itemCount: shortcuts.length,
              separatorBuilder: (_, _) => const SizedBox(width: 6),
              itemBuilder: (context, index) {
                final route = shortcuts[index];
                final meta = _routeMeta[route] ?? (route.replaceAll('/', ''), Icons.bookmark_border_rounded);
                final (label, icon) = meta;

                return InkWell(
                  onTap: () => context.push(route == '/fight' ? '/warfare' : route),
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: AppColors.cyan.withValues(alpha: 0.35),
                        width: 0.8,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon, size: 12, color: AppColors.cyan),
                        const SizedBox(width: 4),
                        Text(
                          label,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          IconButton(
            icon: const Icon(Icons.tune_rounded, size: 14, color: AppColors.textMuted),
            tooltip: 'Customize Hotlist',
            onPressed: () => context.push('/profile'),
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.symmetric(horizontal: 8),
          ),
        ],
      ),
    );
  }
}
