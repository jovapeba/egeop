import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/money_pill.dart';
import '../../../core/widgets/stat_bar.dart';
import 'citizen_controller.dart';
import 'quick_heal_modal.dart';

class CitizenHud extends ConsumerWidget {
  const CitizenHud({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final citizenAsync = ref.watch(citizenNotifierProvider);

    return citizenAsync.when(
      data: (citizen) {
        if (citizen == null) return const SizedBox.shrink();

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
          ),
          child: SafeArea(
            bottom: false,
            child: Column(
              children: [
                // Top row: Logo, Avatar, Nickname, Level, and Location
                Row(
                  children: [
                    GestureDetector(
                      onTap: () => context.push('/profile'),
                      child: Container(
                        width: 36,
                        height: 36,
                        margin: const EdgeInsets.only(right: 10),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.cyan.withValues(alpha: 0.35),
                              blurRadius: 10,
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: Image.asset(
                            'assets/images/logo.png',
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: InkWell(
                        onTap: () => context.push('/profile'),
                        borderRadius: BorderRadius.circular(8),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 18,
                              backgroundColor: AppColors.surfaceElevated,
                              child: Text(
                                citizen.nickname.isNotEmpty ? citizen.nickname[0].toUpperCase() : '?',
                                style: const TextStyle(
                                  color: AppColors.cyan,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          citizen.nickname,
                                          overflow: TextOverflow.ellipsis,
                                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                                fontWeight: FontWeight.bold,
                                              ),
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                        decoration: BoxDecoration(
                                          color: AppColors.cyan.withValues(alpha: 0.15),
                                          borderRadius: BorderRadius.circular(4),
                                          border: Border.all(color: AppColors.cyan.withValues(alpha: 0.4), width: 0.5),
                                        ),
                                        child: Text(
                                          'Lv.${citizen.level}',
                                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                                color: AppColors.cyan,
                                                fontWeight: FontWeight.bold,
                                              ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Row(
                                    children: [
                                      const Icon(Icons.location_on_rounded, size: 12, color: AppColors.textMuted),
                                      const SizedBox(width: 3),
                                      Expanded(
                                        child: Text(
                                          '${citizen.locationRegionName}, ${citizen.countryName}',
                                          overflow: TextOverflow.ellipsis,
                                          style: Theme.of(context).textTheme.labelSmall,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Quick Heal button
                    IconButton.filledTonal(
                      onPressed: () {
                        showModalBottomSheet(
                          context: context,
                          backgroundColor: Colors.transparent,
                          isScrollControlled: true,
                          builder: (_) => const QuickHealModal(),
                        );
                      },
                      style: IconButton.styleFrom(
                        backgroundColor: AppColors.emerald.withValues(alpha: 0.15),
                        foregroundColor: AppColors.emerald,
                      ),
                      icon: const Icon(Icons.healing_rounded, size: 20),
                      tooltip: 'Quick Heal',
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                // Middle row: Animated HP Bar
                StatBar(
                  label: 'Health Points',
                  value: citizen.hp,
                  max: 500, // v2 economy cap
                  barColor: citizen.hp < 100 ? AppColors.crimson : AppColors.emerald,
                  height: 6,
                ),
                const SizedBox(height: 8),
                // Bottom row: Currency pills (Gold & Local Fiat CC)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: MoneyPill(amount: citizen.gold, isGold: true),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: MoneyPill(
                          amount: citizen.walletFiat,
                          isGold: false,
                          currencySymbol: citizen.currencySymbol,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
      loading: () => const LinearProgressIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
      ),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}
