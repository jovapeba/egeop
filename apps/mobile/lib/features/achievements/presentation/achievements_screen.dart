import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/stat_bar.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../data/achievements_repository.dart';

final achievementsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(achievementsRepositoryProvider);
  return repo.fetchAchievements();
});

class AchievementsScreen extends ConsumerWidget {
  const AchievementsScreen({super.key});

  static const _labels = {
    'MILITARY': 'Military Operations',
    'ECONOMY': 'Economy & Industry',
    'MEDALS': 'Medal Catalog',
    'INVITER': 'Recruiter & Referrals',
    'COMMUNITY': 'Community & Comms',
    'POLITICS': 'State & Congress',
    'GAME_SUPPORT': 'Game Support',
    'EVENTS': 'Tournaments & Cups',
    'GENERAL': 'General Exploits',
    'WEAPON_ATTACHMENTS': 'Weapon Attachments',
  };

  String _humanize(String key) {
    return key
        .toLowerCase()
        .split('_')
        .map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : '')
        .join(' ');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final achievementsAsync = ref.watch(achievementsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Achievements Catalog'),
      ),
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async => ref.invalidate(achievementsProvider),
        child: achievementsAsync.when(
          data: (subs) {
            final completedCount = subs.where((s) => s['complete'] == true).length;

            return SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Overview Banner
                  TacticalCard(
                    borderColor: AppColors.amber.withOpacity(0.4),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: AppColors.amber.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.emoji_events_rounded, color: AppColors.amber, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('$completedCount / ${subs.length} Sets Completed', style: Theme.of(context).textTheme.titleLarge, overflow: TextOverflow.ellipsis),
                              const Text('Earn 2.00 Gold for every completed track', style: TextStyle(color: AppColors.textSecondary, fontSize: 11), overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: AppColors.emerald.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                          child: const Text('+2g Claim', style: TextStyle(color: AppColors.emerald, fontWeight: FontWeight.bold, fontSize: 11)),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),
                  Text('Achievement Tracks', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 12),

                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: subs.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final sub = subs[index];
                      final catKey = sub['subcategory'] as String? ?? '';
                      final catTitle = _labels[catKey] ?? _humanize(catKey);
                      final total = (sub['total'] as num?)?.toInt() ?? 1;
                      final completed = (sub['completed'] as num?)?.toInt() ?? 0;
                      final isComplete = sub['complete'] == true;
                      final items = (sub['items'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
                      final pct = total > 0 ? (completed / total) * 100 : 0.0;

                      return TacticalCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Row(
                                    children: [
                                      Icon(
                                        isComplete ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                                        color: isComplete ? AppColors.amber : AppColors.cyan,
                                        size: 18,
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          catTitle,
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: isComplete ? AppColors.amber.withOpacity(0.15) : AppColors.surfaceElevated,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    isComplete ? 'COMPLETE (+2g)' : '$completed / $total',
                                    style: TextStyle(color: isComplete ? AppColors.amber : AppColors.textSecondary, fontWeight: FontWeight.bold, fontSize: 10),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            StatBar(
                              label: '',
                              value: pct,
                              max: 100,
                              barColor: isComplete ? AppColors.amber : AppColors.cyan,
                              trackColor: AppColors.surfaceElevated,
                              height: 6,
                            ),
                            const SizedBox(height: 12),
                            // Milestones
                            ...items.map((it) {
                              final key = it['key'] as String? ?? '';
                              final target = (it['target'] as num?)?.toDouble() ?? 0.0;
                              final progress = (it['progress'] as num?)?.toDouble() ?? 0.0;
                              final done = it['completedAt'] != null;

                              return Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        Icon(
                                          done ? Icons.check_rounded : Icons.chevron_right_rounded,
                                          size: 14,
                                          color: done ? AppColors.emerald : AppColors.textMuted,
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          _humanize(key),
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: done ? AppColors.textPrimary : AppColors.textSecondary,
                                            fontWeight: done ? FontWeight.bold : FontWeight.normal,
                                          ),
                                        ),
                                      ],
                                    ),
                                    Text(
                                      '${progress > target ? target.toStringAsFixed(0) : progress.toStringAsFixed(0)} / ${target.toStringAsFixed(0)}',
                                      style: TextStyle(fontFamily: 'monospace', fontSize: 11, color: done ? AppColors.emerald : AppColors.textMuted),
                                    ),
                                  ],
                                ),
                              );
                            }),
                          ],
                        ),
                      );
                    },
                  ),
                ],
              ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
          error: (e, _) => Center(
            child: TacticalErrorCard(
              error: e,
              onRetry: () => ref.invalidate(achievementsProvider),
            ),
          ),
        ),
      ),
    );
  }
}
