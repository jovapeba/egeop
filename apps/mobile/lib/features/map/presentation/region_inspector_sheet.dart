import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../domain/region_model.dart';
import 'travel_modal.dart';

class RegionInspectorSheet extends ConsumerWidget {
  final RegionModel region;

  const RegionInspectorSheet({super.key, required this.region});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final citizen = ref.watch(citizenNotifierProvider).value;
    final isCurrentLocation = citizen?.locationRegionId == region.id;

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
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.location_city_rounded, color: AppColors.cyan),
                    const SizedBox(width: 8),
                    Text(region.name, style: Theme.of(context).textTheme.titleLarge),
                    if (region.isCapital) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.amber.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: AppColors.amber.withValues(alpha: 0.4)),
                        ),
                        child: const Text('CAPITAL', style: TextStyle(color: AppColors.amber, fontSize: 10, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Region Specs Card
            TacticalCard(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Sovereignty', style: TextStyle(color: AppColors.textSecondary)),
                      Text(region.countryName, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.cyan)),
                    ],
                  ),
                  const Divider(color: AppColors.border, height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Raw Natural Resource', style: TextStyle(color: AppColors.textSecondary)),
                      Text(
                        region.resource != null ? region.resource!.toUpperCase() : 'None',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: region.resource != null ? AppColors.emerald : AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                  const Divider(color: AppColors.border, height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Resource Density', style: TextStyle(color: AppColors.textSecondary)),
                      Text(region.density, style: const TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),
            // Battles list in this region
            if (region.battleIds.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.crimson.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.crimson.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.military_tech_rounded, color: AppColors.crimson),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Active Warfare Front (${region.battleIds.length} battle rounds)',
                        style: const TextStyle(color: AppColors.crimson, fontWeight: FontWeight.bold),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.pop(context);
                        context.push('/battle/${region.battleIds.first}');
                      },
                      child: const Text('Join Front', style: TextStyle(color: AppColors.crimson, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Travel action
            PulseButton(
              label: isCurrentLocation ? 'You are currently located here' : 'Travel to ${region.name}',
              icon: Icons.flight_takeoff_rounded,
              backgroundColor: isCurrentLocation ? AppColors.surfaceElevated : AppColors.cyan,
              foregroundColor: isCurrentLocation ? AppColors.textMuted : Colors.black,
              onPressed: isCurrentLocation
                  ? null
                  : () {
                      showModalBottomSheet(
                        context: context,
                        backgroundColor: Colors.transparent,
                        isScrollControlled: true,
                        builder: (_) => TravelModal(region: region),
                      );
                    },
            ),
          ],
        ),
      ),
    );
  }
}
