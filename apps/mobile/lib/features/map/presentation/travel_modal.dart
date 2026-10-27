import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/map_repository.dart';
import '../domain/region_model.dart';

class TravelModal extends ConsumerStatefulWidget {
  final RegionModel region;

  const TravelModal({super.key, required this.region});

  @override
  ConsumerState<TravelModal> createState() => _TravelModalState();
}

class _TravelModalState extends ConsumerState<TravelModal> {
  int _selectedTicketQuality = 1;
  bool _isTravelling = false;

  // Wiki ticket HP penalty: Q1 -40 HP, Q2 -30 HP, Q3 -20 HP, Q4 -10 HP, Q5 0 HP
  int get _hpPenalty => (5 - _selectedTicketQuality) * 10;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: AppColors.cyan, width: 1)),
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
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.flight_takeoff_rounded, color: AppColors.cyan),
                    const SizedBox(width: 8),
                    Text('Travel to ${widget.region.name}', style: Theme.of(context).textTheme.titleLarge),
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Select Ticket Quality Class',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            // Ticket quality selector
            Row(
              children: List.generate(5, (index) {
                final q = index + 1;
                final isSelected = _selectedTicketQuality == q;
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: index == 0 || index == 4 ? 0 : 3),
                    child: ChoiceChip(
                      label: Text('Q$q', style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                      selected: isSelected,
                      selectedColor: AppColors.cyan,
                      backgroundColor: AppColors.surfaceCard,
                      side: BorderSide(color: isSelected ? AppColors.cyan : AppColors.border),
                      onSelected: (selected) {
                        if (selected) setState(() => _selectedTicketQuality = q);
                      },
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surfaceCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Health Impact:', style: TextStyle(color: AppColors.textSecondary)),
                  Text(
                    _hpPenalty > 0 ? '-$_hpPenalty HP' : '0 HP (First Class)',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: _hpPenalty > 0 ? AppColors.crimson : AppColors.emerald,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            PulseButton(
              label: 'Confirm Flight to ${widget.region.name}',
              icon: Icons.airplane_ticket_rounded,
              isLoading: _isTravelling,
              onPressed: _executeTravel,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _executeTravel() async {
    setState(() => _isTravelling = true);
    final repo = ref.read(mapRepositoryProvider);

    try {
      await repo.travel(
        regionId: widget.region.id,
        ticketQuality: _selectedTicketQuality,
      );
      HapticFeedback.mediumImpact();
      await ref.read(citizenNotifierProvider.notifier).refresh();

      if (mounted) {
        Navigator.pop(context); // Close travel modal
        Navigator.pop(context); // Close inspector sheet
        showSuccessPopup(
          context,
          'Welcome to ${widget.region.name}!',
          title: 'BORDER TRANSIT COMPLETE',
        );
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'TRANSIT PERMIT FAILED');
      }
    } finally {
      if (mounted) setState(() => _isTravelling = false);
    }
  }
}
