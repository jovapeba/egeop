import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../data/mu_repository.dart';

final myMuProvider = FutureProvider<Map<String, dynamic>?>((ref) async {
  final repo = ref.watch(muRepositoryProvider);
  return repo.fetchMine();
});

final muListProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(muRepositoryProvider);
  return repo.fetchUnits();
});

class MuScreen extends ConsumerWidget {
  const MuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final myMuAsync = ref.watch(myMuProvider);
    final allUnitsAsync = ref.watch(muListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Military Units // Armed Forces')),
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async {
          ref.invalidate(myMuProvider);
          ref.invalidate(muListProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Current Unit Status
              myMuAsync.when(
                data: (unit) {
                  if (unit == null) {
                    return TacticalCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.shield_outlined, color: AppColors.textMuted, size: 28),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('No Active Military Unit', style: Theme.of(context).textTheme.titleMedium),
                                    const Text('Enlist in an armed forces regiment to receive daily combat supply and orders.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }

                  final name = unit['name'] as String? ?? 'Regiment';
                  final description = unit['description'] as String? ?? 'Armed forces unit';
                  final leader = unit['leader']?['nickname'] as String? ?? 'Commander';
                  final orders = unit['orders'] as Map<String, dynamic>?;

                  return TacticalCard(
                    borderColor: AppColors.cyan.withOpacity(0.5),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.shield_rounded, color: AppColors.cyan, size: 24),
                                const SizedBox(width: 8),
                                Text(name, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 16)),
                              ],
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(color: AppColors.cyan.withOpacity(0.15), borderRadius: BorderRadius.circular(4)),
                              child: const Text('ENLISTED', style: TextStyle(color: AppColors.cyan, fontWeight: FontWeight.bold, fontSize: 10)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text('Commander: $leader • $description', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                        const Divider(color: AppColors.border, height: 20),

                        // Orders
                        Row(
                          children: [
                            const Icon(Icons.track_changes_rounded, color: AppColors.crimson, size: 20),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Regimental Combat Orders', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.crimson)),
                                  Text(
                                    orders != null && orders['battle'] != null
                                        ? 'Priority Front: ${orders['battle']?['region']?['name'] ?? "Assigned"}'
                                        : 'Commander has set free deployment. Fight on any active war front.',
                                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => _leaveUnit(context, ref),
                                style: OutlinedButton.styleFrom(foregroundColor: AppColors.crimson, side: const BorderSide(color: AppColors.crimson)),
                                child: const Text('Leave Unit'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
                error: (e, _) => TacticalErrorCard(error: e, onRetry: () => ref.invalidate(myMuProvider)),
              ),

              const SizedBox(height: 24),
              Text('Available Military Regiments', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),

              // Unit List
              allUnitsAsync.when(
                data: (units) {
                  if (units.isEmpty) {
                    return const TacticalCard(child: Center(child: Padding(padding: EdgeInsets.all(16), child: Text('No other public regiments in country.'))));
                  }
                  final myMu = myMuAsync.asData?.value;
                  final currentUnit = (myMu != null && myMu['mu'] is Map)
                      ? myMu['mu'] as Map<String, dynamic>
                      : myMu;
                  final currentMuId = currentUnit?['id'] as String? ?? myMu?['muId'] as String?;
                  final isEnlistedInAny = currentMuId != null;

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: units.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final u = units[index];
                      final id = u['id'] as String;
                      final name = u['name'] as String? ?? 'Unit';
                      final count = (u['_count']?['members'] as num?)?.toInt() ?? 1;
                      final isThisUnit = currentMuId == id;

                      return TacticalCard(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis),
                                  const SizedBox(height: 2),
                                  Text('$count members enlisted', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            if (isThisUnit)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.emerald.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppColors.emerald.withOpacity(0.4)),
                                ),
                                child: const Text('Enlisted ✓', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.emerald)),
                              )
                            else if (isEnlistedInAny)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceElevated,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppColors.border),
                                ),
                                child: const Text('In Other Unit', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textMuted)),
                              )
                            else
                              ElevatedButton(
                                onPressed: () => _joinUnit(context, ref, id),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.cyan,
                                  foregroundColor: Colors.black,
                                  padding: const EdgeInsets.symmetric(horizontal: 14),
                                ),
                                child: const Text('Enlist', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                              ),
                          ],
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
                error: (e, _) => TacticalErrorCard(error: e, onRetry: () => ref.invalidate(muListProvider)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _joinUnit(BuildContext context, WidgetRef ref, String id) async {
    try {
      await ref.read(muRepositoryProvider).joinUnit(id);
      ref.invalidate(myMuProvider);
      ref.invalidate(muListProvider);
      if (context.mounted) {
        showSuccessPopup(context, 'Enlisted in military unit!', title: 'ENLISTED');
      }
    } catch (e) {
      if (context.mounted) showErrorPopup(context, e, title: 'ENLISTMENT FAILED');
    }
  }

  void _leaveUnit(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(muRepositoryProvider).leaveUnit();
      ref.invalidate(myMuProvider);
      ref.invalidate(muListProvider);
      if (context.mounted) {
        showSuccessPopup(context, 'Left military unit.', title: 'DEPARTED');
      }
    } catch (e) {
      if (context.mounted) showErrorPopup(context, e, title: 'DEFECTION FAILED');
    }
  }
}
