import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import 'citizen_controller.dart';

class QuickHealModal extends ConsumerStatefulWidget {
  const QuickHealModal({super.key});

  @override
  ConsumerState<QuickHealModal> createState() => _QuickHealModalState();
}

class _QuickHealModalState extends ConsumerState<QuickHealModal> {
  int _selectedQuality = 1;
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    final tasksAsync = ref.watch(dailyTasksNotifierProvider);

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: AppColors.borderGlow, width: 1)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Restore Health & Energy',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Limits info
            tasksAsync.when(
              data: (tasks) {
                if (tasks == null) return const SizedBox.shrink();
                return Row(
                  children: [
                    Expanded(
                      child: TacticalCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Food Used Today', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                            const SizedBox(height: 4),
                            Text('${tasks.foodUsed} / ${tasks.foodLimit}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.emerald)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TacticalCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Energy Drink Limit', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                            const SizedBox(height: 4),
                            Text('${tasks.energyUsed} / ${tasks.energyLimit}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.cyan)),
                          ],
                        ),
                      ),
                    ),
                  ],
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 16),
            Text(
              'Select Quality (Q1 - Q5)',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(5, (index) {
                final q = index + 1;
                final isSelected = _selectedQuality == q;
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: index == 0 || index == 4 ? 0 : 4),
                    child: ChoiceChip(
                      label: Text('Q$q', style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                      selected: isSelected,
                      selectedColor: AppColors.cyan,
                      backgroundColor: AppColors.surfaceCard,
                      side: BorderSide(color: isSelected ? AppColors.cyan : AppColors.border),
                      onSelected: (selected) {
                        if (selected) setState(() => _selectedQuality = q);
                      },
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 20),
            () {
              final citizen = ref.watch(citizenNotifierProvider).value;
              final tasks = tasksAsync.asData?.value;
              final isMaxHp = (citizen?.hp ?? 0) >= 100;
              final isFoodLimit = tasks != null && tasks.foodUsed >= tasks.foodLimit;
              final isEnergyLimit = tasks != null && tasks.energyUsed >= tasks.energyLimit;

              final disableFood = _isLoading || isMaxHp || isFoodLimit;
              final foodLabel = isMaxHp
                  ? 'HP Full (100)'
                  : isFoodLimit
                      ? 'Food Limit Max'
                      : 'Eat Food (+${_selectedQuality * 10} HP)';

              final disableDrink = _isLoading || isMaxHp || isEnergyLimit;
              final drinkLabel = isMaxHp
                  ? 'HP Full (100)'
                  : isEnergyLimit
                      ? 'Drink Limit Max'
                      : 'Drink Energy (+${_selectedQuality * 10} HP)';

              return Row(
                children: [
                  Expanded(
                    child: PulseButton(
                      label: foodLabel,
                      icon: isMaxHp ? Icons.check_circle_rounded : Icons.restaurant_rounded,
                      backgroundColor: disableFood ? AppColors.surfaceElevated : AppColors.emerald,
                      foregroundColor: disableFood ? AppColors.textMuted : Colors.black,
                      isLoading: _isLoading,
                      onPressed: disableFood ? null : () => _consumeItem('FOOD'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: PulseButton(
                      label: drinkLabel,
                      icon: isMaxHp ? Icons.check_circle_rounded : Icons.bolt_rounded,
                      backgroundColor: disableDrink ? AppColors.surfaceElevated : AppColors.cyan,
                      foregroundColor: disableDrink ? AppColors.textMuted : Colors.black,
                      isLoading: _isLoading,
                      onPressed: disableDrink ? null : () => _consumeItem('ENERGY_DRINK'),
                    ),
                  ),
                ],
              );
            }(),
          ],
        ),
      ),
    );
  }

  Future<void> _consumeItem(String kind) async {
    setState(() => _isLoading = true);
    try {
      await ref.read(dailyTasksNotifierProvider.notifier).consume(kind, _selectedQuality, 1);
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.pop(context);
        showSuccessPopup(
          context,
          'Consumed $kind Q$_selectedQuality! Restored +${_selectedQuality * 10} HP',
          title: 'HEALED',
        );
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'CONSUMPTION FAILED');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }
}
