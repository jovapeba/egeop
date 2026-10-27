import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/stat_bar.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../data/stats_repository.dart';

final countriesLeaderboardProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(statsRepositoryProvider);
  return repo.fetchCountries();
});

final armiesLeaderboardProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(statsRepositoryProvider);
  return repo.fetchArmies();
});

final citizensLeaderboardProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(statsRepositoryProvider);
  return repo.fetchCitizens();
});

final dailyRollupProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, int>((ref, day) async {
  final repo = ref.watch(statsRepositoryProvider);
  return repo.fetchDaily(day);
});

class StatsScreen extends ConsumerStatefulWidget {
  const StatsScreen({super.key});

  @override
  ConsumerState<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends ConsumerState<StatsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  int _viewDay = 1;

  static const _podium = ['🥇', '🥈', '🥉'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Global Leaderboards'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: AppColors.cyan,
          labelColor: AppColors.cyan,
          unselectedLabelColor: AppColors.textMuted,
          tabs: const [
            Tab(text: 'Countries'),
            Tab(text: 'Armies'),
            Tab(text: 'Citizens'),
            Tab(text: 'Daily Rollup'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildCountriesTab(),
          _buildArmiesTab(),
          _buildCitizensTab(),
          _buildDailyTab(),
        ],
      ),
    );
  }

  Widget _buildCountriesTab() {
    final countriesAsync = ref.watch(countriesLeaderboardProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(countriesLeaderboardProvider),
      child: countriesAsync.when(
        data: (countries) {
          if (countries.isEmpty) {
            return const Center(child: Text('No country damage recorded yet.', style: TextStyle(color: AppColors.textMuted)));
          }

          final maxDmg = countries.fold<double>(1.0, (prev, c) {
            final d = (c['damage'] as num?)?.toDouble() ?? 0.0;
            return d > prev ? d : prev;
          });

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: countries.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final c = countries[index];
              final name = c['name'] as String? ?? 'Nation';
              final dmg = (c['damage'] as num?)?.toDouble() ?? 0.0;
              final isPodium = index < 3;

              return TacticalCard(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    SizedBox(
                      width: 28,
                      child: Text(isPodium ? _podium[index] : '${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                dmg >= 1000000 ? '${(dmg / 1000000).toStringAsFixed(2)}M' : dmg.toStringAsFixed(0),
                                style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, color: AppColors.cyan),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          StatBar(label: '', value: dmg, max: maxDmg, barColor: AppColors.cyan, height: 4),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(countriesLeaderboardProvider))),
      ),
    );
  }

  Widget _buildArmiesTab() {
    final armiesAsync = ref.watch(armiesLeaderboardProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(armiesLeaderboardProvider),
      child: armiesAsync.when(
        data: (armies) {
          if (armies.isEmpty) {
            return const Center(child: Text('No military units founded yet.', style: TextStyle(color: AppColors.textMuted)));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: armies.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final a = armies[index];
              final name = a['name'] as String? ?? 'Unit';
              final lvl = (a['levelIdx'] as int? ?? 0) + 1;
              final members = a['_count']?['members'] as int? ?? 0;
              final slots = a['memberSlots'] as int? ?? 10;
              final gold = ((a['gold'] as num?)?.toDouble() ?? 0) / 100;
              final isPodium = index < 3;

              return TacticalCard(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    SizedBox(
                      width: 28,
                      child: Text(isPodium ? _podium[index] : '${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis),
                          Text('Level $lvl • $members/$slots Personnel', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11), overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    Text('${gold.toStringAsFixed(2)}g', style: const TextStyle(fontFamily: 'monospace', color: AppColors.amber, fontWeight: FontWeight.bold, fontSize: 13)),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(armiesLeaderboardProvider))),
      ),
    );
  }

  Widget _buildCitizensTab() {
    final citizensAsync = ref.watch(citizensLeaderboardProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(citizensLeaderboardProvider),
      child: citizensAsync.when(
        data: (citizens) {
          if (citizens.isEmpty) {
            return const Center(child: Text('No citizen scores recorded.', style: TextStyle(color: AppColors.textMuted)));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: citizens.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final c = citizens[index];
              final nick = c['nickname'] as String? ?? 'Citizen';
              final lvl = c['level'] as int? ?? 1;
              final dmg = (c['totalDamage'] as num?)?.toDouble() ?? 0.0;
              final country = c['citizenshipCountry'] as Map? ?? {};
              final code = country['code'] as String? ?? 'INT';
              final isPodium = index < 3;

              return TacticalCard(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    SizedBox(
                      width: 28,
                      child: Text(isPodium ? _podium[index] : '${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  nick,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(color: AppColors.surfaceElevated, borderRadius: BorderRadius.circular(4)),
                                child: Text(code, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppColors.cyan)),
                              ),
                            ],
                          ),
                          Text('Level $lvl Citizen', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                        ],
                      ),
                    ),
                    Text(
                      dmg >= 1000000 ? '${(dmg / 1000000).toStringAsFixed(2)}M' : dmg.toStringAsFixed(0),
                      style: const TextStyle(fontFamily: 'monospace', color: AppColors.crimson, fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(citizensLeaderboardProvider))),
      ),
    );
  }

  Widget _buildDailyTab() {
    final dailyAsync = ref.watch(dailyRollupProvider(_viewDay));

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: AppColors.surface,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left_rounded),
                onPressed: _viewDay > 1 ? () => setState(() => _viewDay--) : null,
              ),
              Text('Day $_viewDay Combat Rollup', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.cyan)),
              IconButton(
                icon: const Icon(Icons.chevron_right_rounded),
                onPressed: () => setState(() => _viewDay++),
              ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.cyan,
            backgroundColor: AppColors.surface,
            onRefresh: () async => ref.invalidate(dailyRollupProvider(_viewDay)),
            child: dailyAsync.when(
              data: (rows) {
                if (rows.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text('No frontline actions logged for Day $_viewDay.', style: const TextStyle(color: AppColors.textMuted)),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: rows.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final r = rows[index];
                    final name = r['name'] as String? ?? 'Combatant';
                    final type = r['ownerType'] as String? ?? 'CITIZEN';
                    final hits = r['hits'] as int? ?? 0;
                    final dmg = (r['damage'] as num?)?.toDouble() ?? 0.0;

                    return TacticalCard(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: AppColors.surfaceElevated, borderRadius: BorderRadius.circular(4)),
                            child: Text(type, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppColors.cyan)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                Text('$hits tactical strikes', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                              ],
                            ),
                          ),
                          Text(
                            dmg >= 1000000 ? '${(dmg / 1000000).toStringAsFixed(2)}M' : dmg.toStringAsFixed(0),
                            style: const TextStyle(fontFamily: 'monospace', color: AppColors.cyan, fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
              error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(dailyRollupProvider(_viewDay)))),
            ),
          ),
        ),
      ],
    );
  }
}
