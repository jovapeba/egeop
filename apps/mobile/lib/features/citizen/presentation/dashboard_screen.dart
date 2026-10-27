import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/network/api_client.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../warfare/presentation/battle_list_screen.dart';
import 'citizen_controller.dart';

final presidentialBroadcastProvider = FutureProvider.autoDispose<Map<String, dynamic>?>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/politics/broadcast');
    final b = res.data?['broadcast'];
    if (b != null && b is Map) return Map<String, dynamic>.from(b);
    return null;
  } catch (_) {
    return null;
  }
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final citizenAsync = ref.watch(citizenNotifierProvider);
    final tasksAsync = ref.watch(dailyTasksNotifierProvider);
    final battlesAsync = ref.watch(battlesProvider);

    return Scaffold(
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async {
          await ref.read(citizenNotifierProvider.notifier).refresh();
          await ref.read(dailyTasksNotifierProvider.notifier).refresh();
          ref.invalidate(battlesProvider);
          ref.invalidate(trainingYardProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome Tactical Banner
              citizenAsync.when(
                data: (citizen) {
                  if (citizen == null) return const SizedBox.shrink();
                  return TacticalCard(
                    padding: const EdgeInsets.all(16),
                    borderColor: AppColors.cyan.withValues(alpha: 0.3),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.cyan.withValues(alpha: 0.35),
                                blurRadius: 14,
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
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Command Deck // Day ${citizen.level}',
                                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                      color: AppColors.cyan,
                                      fontWeight: FontWeight.bold,
                                    ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${citizen.rankName} (+${citizen.rankBonusPct.toStringAsFixed(0)}% DMG)',
                                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 16),
                              ),
                              Text(
                                'Strength: ${citizen.strength.toStringAsFixed(1)} • Eco Skill: ${citizen.ecoSkill.toStringAsFixed(2)}',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 14),

              // PRESIDENTIAL DISPATCH (24h POPUP BANNER)
              Consumer(
                builder: (context, ref, _) {
                  final bcastAsync = ref.watch(presidentialBroadcastProvider);
                  return bcastAsync.when(
                    data: (bcast) {
                      if (bcast == null) return const SizedBox.shrink();
                      final msg = bcast['message'] as String? ?? '';
                      final pres = (bcast['president'] as Map?)?['nickname'] as String? ?? 'Executive';

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: TacticalCard(
                          borderColor: AppColors.amber,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: AppColors.amber.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Icon(Icons.star_rounded, color: AppColors.amber, size: 22),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        const Text(
                                          'PRESIDENTIAL DISPATCH',
                                          style: TextStyle(
                                            color: AppColors.amber,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 11,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                        const SizedBox(width: 6),
                                        Text('· $pres', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      msg,
                                      style: const TextStyle(fontSize: 13, color: AppColors.textPrimary, height: 1.3),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  );
                },
              ),

              // LIVE BATTLEFIELD ALERT CARD
              TacticalCard(
                borderColor: AppColors.crimson.withValues(alpha: 0.6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(color: AppColors.crimson.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(6)),
                          child: const Icon(Icons.flash_on_rounded, color: AppColors.crimson, size: 18),
                        ),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Active Battlefield Front',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.crimson),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.crimson, borderRadius: BorderRadius.circular(4)),
                          child: const Text('LIVE COMBAT', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      battlesAsync.maybeWhen(
                        data: (battles) {
                          final active = battles.where((b) => !b.isTraining).toList();
                          if (active.isNotEmpty) {
                            final b = active.first;
                            return 'Frontline: ${b.regionName} (${b.attackerCountryCode} vs ${b.defenderCountryCode}) • Wall: ${b.wall.toStringAsFixed(1)}%';
                          }
                          return 'Training Yard is active 24/7. Drill your strength and damage medals.';
                        },
                        orElse: () => 'Training Yard & Sovereign Wars Active',
                      ),
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    PulseButton(
                      label: 'ENTER BATTLES & FIGHT',
                      icon: Icons.sports_mma_rounded,
                      backgroundColor: AppColors.crimson,
                      foregroundColor: Colors.white,
                      onPressed: () => context.go('/warfare'),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 18),

              // Tactical Headquarters Hub Grid
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text('Tactical Headquarters',
                        style: Theme.of(context).textTheme.titleLarge,
                        overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: () => context.go('/ops'),
                    child: const Text('View All Ops →', style: TextStyle(color: AppColors.cyan, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              GridView.count(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
                childAspectRatio: 1.05,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _hubCard(context, 'Equipment', Icons.shield_rounded, AppColors.cyan, '/equipment'),
                  _hubCard(context, 'Military Units', Icons.security_rounded, AppColors.emerald, '/mu'),
                  _hubCard(context, 'Work & Jobs', Icons.work_rounded, AppColors.amber, '/work'),
                  _hubCard(context, 'Companies', Icons.factory_rounded, AppColors.blue, '/companies'),
                  _hubCard(context, 'Auctions', Icons.gavel_rounded, AppColors.amber, '/auctions'),
                  _hubCard(context, 'Press & Media', Icons.newspaper_rounded, AppColors.cyan, '/media'),
                  _hubCard(context, 'Congress', Icons.account_balance_rounded, AppColors.emerald, '/politics'),
                  _hubCard(context, 'Achievements', Icons.military_tech_outlined, AppColors.amber, '/achievements'),
                  _hubCard(context, 'Leaderboards', Icons.bar_chart_rounded, AppColors.cyan, '/stats'),
                ],
              ),

              const SizedBox(height: 20),
              Text('Daily Operations', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),

              // Daily Tasks Card
              tasksAsync.when(
                data: (tasks) {
                  if (tasks == null) return const SizedBox.shrink();
                  return Column(
                    children: [
                      TacticalCard(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            // Work Action
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: tasks.worked ? AppColors.emerald.withValues(alpha: 0.1) : AppColors.surfaceElevated,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(
                                    tasks.worked ? Icons.check_circle_rounded : Icons.work_rounded,
                                    color: tasks.worked ? AppColors.emerald : AppColors.textMuted,
                                    size: 22,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('Daily Employment Shift', style: Theme.of(context).textTheme.titleMedium),
                                      Text(
                                        tasks.worked ? 'Shift completed for today (-10 HP)' : 'Work to earn daily net wage and eco skill',
                                        style: Theme.of(context).textTheme.bodyMedium,
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                PulseButton(
                                  label: tasks.worked ? 'Done' : 'Work',
                                  isFullWidth: false,
                                  backgroundColor: tasks.worked ? AppColors.surfaceElevated : AppColors.emerald,
                                  foregroundColor: tasks.worked ? AppColors.textMuted : Colors.black,
                                  onPressed: tasks.worked
                                      ? null
                                      : () async {
                                          try {
                                              await ref.read(dailyTasksNotifierProvider.notifier).work();
                                              if (context.mounted) {
                                                showSuccessPopup(
                                                  context,
                                                  'Work completed! Wage and eco skill credited.',
                                                  title: 'DAILY SHIFT COMPLETE',
                                                );
                                              }
                                          } catch (e) {
                                              if (context.mounted) {
                                                showErrorPopup(context, e, title: 'WORK OPERATION FAILED');
                                              }
                                          }
                                        },
                                ),
                              ],
                            ),
                            const Divider(color: AppColors.border, height: 24),
                            // Train Action
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: tasks.trained ? AppColors.emerald.withValues(alpha: 0.1) : AppColors.surfaceElevated,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(
                                    tasks.trained ? Icons.check_circle_rounded : Icons.fitness_center_rounded,
                                    color: tasks.trained ? AppColors.emerald : AppColors.textMuted,
                                    size: 22,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('Military Training', style: Theme.of(context).textTheme.titleMedium),
                                      Text(
                                        tasks.trained ? 'Trained today (+Strength & Rank XP)' : 'Train daily to advance military ranks',
                                        style: Theme.of(context).textTheme.bodyMedium,
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                PulseButton(
                                  label: tasks.trained ? 'Done' : 'Train',
                                  isFullWidth: false,
                                  backgroundColor: tasks.trained ? AppColors.surfaceElevated : AppColors.cyan,
                                  foregroundColor: tasks.trained ? AppColors.textMuted : Colors.black,
                                  onPressed: tasks.trained
                                      ? null
                                      : () async {
                                          try {
                                              await ref.read(dailyTasksNotifierProvider.notifier).train();
                                              if (context.mounted) {
                                                showSuccessPopup(
                                                  context,
                                                  'Training complete! Strength increased.',
                                                  title: 'MILITARY DRILL COMPLETE',
                                                );
                                              }
                                          } catch (e) {
                                              if (context.mounted) {
                                                showErrorPopup(context, e, title: 'TRAINING REGIMEN FAILED');
                                              }
                                          }
                                        },
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      // Bonus Ad Card
                      TacticalCard(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        child: Row(
                          children: [
                            const Icon(Icons.live_tv_rounded, color: AppColors.amber, size: 22),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('Daily Sponsor Boost', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                  Text(
                                    tasks.adWatchUsed ? 'Boost already active (+5 food limit)' : 'Watch short sponsor ad for +5 food limit',
                                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                            if (!tasks.adWatchUsed)
                              TextButton(
                                onPressed: () => ref.read(dailyTasksNotifierProvider.notifier).watchAd(),
                                child: const Text('Claim +5', style: TextStyle(color: AppColors.amber, fontWeight: FontWeight.bold)),
                              ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
                error: (e, _) => TacticalErrorCard(error: e, onRetry: () => ref.read(dailyTasksNotifierProvider.notifier).refresh()),
              ),

              const SizedBox(height: 20),
              Text('Citizen Vital Statistics', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),

              // Stats Grid
              citizenAsync.when(
                data: (citizen) {
                  if (citizen == null) return const SizedBox.shrink();
                  return GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: 1.5,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      TacticalCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('Military Rank', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                            const SizedBox(height: 4),
                            Text(citizen.rankName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.cyan)),
                            Text('+${citizen.rankBonusPct.toStringAsFixed(0)}% Damage Boost', style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
                          ],
                        ),
                      ),
                      TacticalCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('Total War Damage', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                            const SizedBox(height: 4),
                            Text(
                              citizen.totalDamage >= 1000000
                                  ? '${(citizen.totalDamage / 1000000).toStringAsFixed(2)}M'
                                  : citizen.totalDamage >= 1000
                                      ? '${(citizen.totalDamage / 1000).toStringAsFixed(1)}K'
                                      : citizen.totalDamage.toStringAsFixed(0),
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.crimson),
                            ),
                            const Text('Across all rounds', style: TextStyle(color: AppColors.textMuted, fontSize: 10)),
                          ],
                        ),
                      ),
                      TacticalCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('Economy Skill', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                            const SizedBox(height: 4),
                            Text(citizen.ecoSkill.toStringAsFixed(2), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.emerald)),
                            const Text('Productivity multiplier', style: TextStyle(color: AppColors.textMuted, fontSize: 10)),
                          ],
                        ),
                      ),
                      TacticalCard(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('Medkits in Stock', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                            const SizedBox(height: 4),
                            Text('${citizen.firstAidKits}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.amber)),
                            const Text('Emergency heals', style: TextStyle(color: AppColors.textMuted, fontSize: 10)),
                          ],
                        ),
                      ),
                    ],
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, _) => const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _hubCard(BuildContext context, String title, IconData icon, Color color, String route) {
    return TacticalCard(
      padding: const EdgeInsets.all(8),
      onTap: () => context.push(route),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 6),
          Text(title, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
