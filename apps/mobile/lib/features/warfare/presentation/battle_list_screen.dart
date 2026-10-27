import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/stat_bar.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/warfare_repository.dart';
import '../domain/battle_model.dart';

final battlesProvider = FutureProvider<List<BattleModel>>((ref) async {
  final repo = ref.watch(warfareRepositoryProvider);
  return repo.fetchActiveWars();
});

final trainingYardProvider = FutureProvider<BattleModel?>((ref) async {
  final repo = ref.watch(warfareRepositoryProvider);
  return repo.fetchTrainingYard();
});

final buffsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(warfareRepositoryProvider);
  return repo.fetchBuffs();
});

class BattleListScreen extends ConsumerStatefulWidget {
  const BattleListScreen({super.key});

  @override
  ConsumerState<BattleListScreen> createState() => _BattleListScreenState();
}

class _BattleListScreenState extends ConsumerState<BattleListScreen> {
  String _selectedFilter = 'ALL'; // 'ALL', 'DIRECT', 'RESISTANCE', 'TRAINING'
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  static const _buffsCatalog = [
    {
      'type': 'STEROID',
      'icon': '💉',
      'label': 'Steroid',
      'desc': '+10% Combat DMG across all fronts for 24h',
    },
    {
      'type': 'RAMBO',
      'icon': '🔫',
      'label': 'Rambo',
      'desc': '+10% Q5 Ammo Damage boost for 24h',
    },
    {
      'type': 'PATRIOT',
      'icon': '🛡️',
      'label': 'Patriot',
      'desc': '+10% Defensive Fortress Resistance for 24h',
    },
    {
      'type': 'REBEL',
      'icon': '🔥',
      'label': 'Rebel',
      'desc': '+10% Resistance War Core Damage for 24h',
    },
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final battlesAsync = ref.watch(battlesProvider);
    final trainingAsync = ref.watch(trainingYardProvider);
    final buffsAsync = ref.watch(buffsProvider);

    final activeWars = battlesAsync.value ?? [];
    final trainingYard = trainingAsync.value;
    final activeBuffsCount = (buffsAsync.value ?? [])
        .where((b) => b['buffed'] == true)
        .length;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Battles & Frontlines',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            Text(
              'Active Global Conflicts // Tactical Command',
              style: TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        actions: [
          // Stimulants Button
          TextButton.icon(
            onPressed: () => _showStimulantsSheet(context, buffsAsync),
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Text('💉', style: TextStyle(fontSize: 16)),
                if (activeBuffsCount > 0)
                  Positioned(
                    top: -4,
                    right: -6,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: const BoxDecoration(
                        color: AppColors.emerald,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '$activeBuffsCount',
                        style: const TextStyle(
                          color: Colors.black,
                          fontSize: 8,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            label: Text(
              activeBuffsCount > 0 ? '$activeBuffsCount Buffs' : 'Stimulants (1g)',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: activeBuffsCount > 0 ? AppColors.emerald : AppColors.cyan,
              ),
            ),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async {
          ref.invalidate(battlesProvider);
          ref.invalidate(trainingYardProvider);
          ref.invalidate(buffsProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Tactical Telemetry Strip
              _buildTelemetryStrip(activeWars.length, trainingYard != null, activeBuffsCount),
              const SizedBox(height: 14),

              // Filter Chips Row
              _buildFilterChips(),
              const SizedBox(height: 10),

              // Search Bar
              _buildSearchBar(),
              const SizedBox(height: 14),

              // Training Yard Spotlight Card (when filter includes it)
              if (_selectedFilter == 'ALL' || _selectedFilter == 'TRAINING') ...[
                _buildTrainingYardCard(trainingAsync),
                const SizedBox(height: 16),
              ],

              // Active Sovereign & Resistance Frontlines
              if (_selectedFilter != 'TRAINING') ...[
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: AppColors.crimson,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'International Frontlines',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                      ],
                    ),
                    if (activeWars.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.crimson.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: AppColors.crimson.withOpacity(0.4)),
                        ),
                        child: Text(
                          '${activeWars.length} ACTIVE',
                          style: const TextStyle(
                            color: AppColors.crimson,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                _buildBattlesList(battlesAsync),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTelemetryStrip(int activeCount, bool hasTraining, int buffsCount) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildTelemetryItem(
            icon: Icons.military_tech_rounded,
            color: AppColors.crimson,
            value: '$activeCount',
            label: 'Frontlines',
          ),
          Container(width: 1, height: 26, color: AppColors.border),
          _buildTelemetryItem(
            icon: Icons.shield_rounded,
            color: AppColors.cyan,
            value: hasTraining ? 'Online' : 'Off',
            label: 'Training Yard',
          ),
          Container(width: 1, height: 26, color: AppColors.border),
          _buildTelemetryItem(
            icon: Icons.flash_on_rounded,
            color: buffsCount > 0 ? AppColors.emerald : AppColors.amber,
            value: buffsCount > 0 ? '$buffsCount Active' : '0 Active',
            label: 'Combat Buffs',
          ),
        ],
      ),
    );
  }

  Widget _buildTelemetryItem({
    required IconData icon,
    required Color color,
    required String value,
    required String label,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFilterChips() {
    final filters = [
      {'key': 'ALL', 'label': 'All Fronts'},
      {'key': 'DIRECT', 'label': '⚔️ Direct Wars'},
      {'key': 'RESISTANCE', 'label': '🔥 Resistance (RW)'},
      {'key': 'TRAINING', 'label': '🛡️ Training Yard'},
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: filters.map((f) {
          final isSelected = _selectedFilter == f['key'];
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(
                f['label']!,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  color: isSelected ? Colors.white : AppColors.textSecondary,
                ),
              ),
              selected: isSelected,
              selectedColor: AppColors.crimson,
              backgroundColor: AppColors.surfaceElevated,
              side: BorderSide(
                color: isSelected ? AppColors.crimson : AppColors.border,
              ),
              onSelected: (selected) {
                if (selected) {
                  setState(() => _selectedFilter = f['key']!);
                }
              },
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, size: 18, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _searchController,
              onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
              style: const TextStyle(fontSize: 12, color: AppColors.textPrimary),
              decoration: const InputDecoration(
                hintText: 'Search frontlines by region or country...',
                hintStyle: TextStyle(fontSize: 12, color: AppColors.textMuted),
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          if (_searchQuery.isNotEmpty)
            GestureDetector(
              onTap: () {
                _searchController.clear();
                setState(() => _searchQuery = '');
              },
              child: const Icon(Icons.close_rounded, size: 16, color: AppColors.textMuted),
            ),
        ],
      ),
    );
  }

  Widget _buildTrainingYardCard(AsyncValue<BattleModel?> trainingAsync) {
    return trainingAsync.when(
      data: (training) {
        if (training == null) return const SizedBox.shrink();

        // Search filter check
        if (_searchQuery.isNotEmpty) {
          final match = training.regionName.toLowerCase().contains(_searchQuery) ||
              'training yard'.contains(_searchQuery);
          if (!match) return const SizedBox.shrink();
        }

        return TacticalCard(
          borderColor: AppColors.cyan.withOpacity(0.6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.cyan.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.shield_outlined, color: AppColors.cyan, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'TRAINING YARD // SAFE COMBAT',
                          style: TextStyle(
                            color: AppColors.cyan,
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const Text(
                          '24/7 Practice Drills • No Territory Loss',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.emerald.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: AppColors.emerald.withOpacity(0.4)),
                    ),
                    child: const Text(
                      'ONLINE',
                      style: TextStyle(
                        color: AppColors.emerald,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'Gain daily combat XP, test weapon tiers, and advance Battle Hero medal progress safely.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
              ),
              const SizedBox(height: 12),
              // Wall Meter
              StatBar(
                label: 'Dominance Wall (${training.wall.toStringAsFixed(1)}%)',
                value: training.wall,
                max: 100,
                barColor: AppColors.blue,
                trackColor: AppColors.crimson.withOpacity(0.4),
                height: 8,
                customValueText: 'R${training.currentRoundNumber} • First to 8 wins',
              ),
              const SizedBox(height: 12),
              PulseButton(
                label: 'ENTER TRAINING BATTLE ➔',
                icon: Icons.sports_mma_rounded,
                backgroundColor: AppColors.cyan,
                foregroundColor: Colors.black,
                onPressed: () => context.push('/battle/${training.id}', extra: training),
              ),
            ],
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }

  Widget _buildBattlesList(AsyncValue<List<BattleModel>> battlesAsync) {
    return battlesAsync.when(
      data: (battles) {
        // Exclude training yard from international list
        var list = battles.where((b) => !b.isTraining).toList();

        // Apply war type filter
        if (_selectedFilter == 'DIRECT') {
          list = list.where((b) => b.warType == 'DIRECT').toList();
        } else if (_selectedFilter == 'RESISTANCE') {
          list = list.where((b) => b.warType == 'RESISTANCE').toList();
        }

        // Apply search query
        if (_searchQuery.isNotEmpty) {
          list = list.where((b) {
            return b.regionName.toLowerCase().contains(_searchQuery) ||
                b.attackerCountryName.toLowerCase().contains(_searchQuery) ||
                b.defenderCountryName.toLowerCase().contains(_searchQuery) ||
                b.attackerCountryCode.toLowerCase().contains(_searchQuery) ||
                b.defenderCountryCode.toLowerCase().contains(_searchQuery);
          }).toList();
        }

        if (list.isEmpty) {
          return TacticalCard(
            padding: const EdgeInsets.all(20),
            child: Center(
              child: Column(
                children: [
                  const Icon(Icons.shield_outlined, size: 40, color: AppColors.textMuted),
                  const SizedBox(height: 12),
                  const Text(
                    'No Sovereign Conflicts Found',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Presidents declare official wars from the treasury, or citizens launch Resistance Wars on occupied territories via the World Map (20g, Level 10+).',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: () => context.go('/map'),
                    icon: const Icon(Icons.map_outlined, size: 16),
                    label: const Text('Inspect World Map', style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.cyan,
                      side: const BorderSide(color: AppColors.cyan),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            final b = list[index];
            return _buildBattleCard(b);
          },
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(child: CircularProgressIndicator(color: AppColors.cyan)),
      ),
      error: (e, _) => TacticalErrorCard(
        error: e,
        onRetry: () => ref.invalidate(battlesProvider),
      ),
    );
  }

  Widget _buildBattleCard(BattleModel b) {
    final isRw = b.warType == 'RESISTANCE';
    final isCivil = b.warType == 'CIVIL';
    final typeColor = isRw ? AppColors.amber : (isCivil ? Colors.purpleAccent : AppColors.crimson);
    final typeLabel = isRw ? '🔥 RESISTANCE WAR' : (isCivil ? '⚡ CIVIL WAR' : '⚔️ DIRECT WAR');

    return TacticalCard(
      onTap: () => context.push('/battle/${b.id}', extra: b),
      borderColor: AppColors.border,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top Row: War Type Badge + Round Info
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: typeColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: typeColor.withOpacity(0.4)),
                ),
                child: Text(
                  typeLabel,
                  style: TextStyle(
                    color: typeColor,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.border),
                ),
                child: Text(
                  'Round ${b.currentRoundNumber} / 15',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Region Name
          Row(
            children: [
              const Icon(Icons.location_on_rounded, size: 18, color: AppColors.cyan),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Battle for ${b.regionName}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Attacker vs Defender Score Matchup
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Attacker
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: AppColors.crimson,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              b.attackerCountryName,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppColors.crimson,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              'Wins: ${b.attackerScore}',
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // VS Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'VS',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textMuted,
                    ),
                  ),
                ),

                // Defender
                Expanded(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              b.defenderCountryName,
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppColors.blue,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              'Wins: ${b.defenderScore}',
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: AppColors.blue,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Tug-of-War Wall Dominance Bar
          StatBar(
            label: 'Dominance Wall',
            value: b.wall,
            max: 100,
            barColor: AppColors.blue,
            trackColor: AppColors.crimson,
            height: 8,
            customValueText: '${b.wall.toStringAsFixed(1)}% Wall',
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '⚔️ Atk ${b.wall.toStringAsFixed(1)}%',
                style: const TextStyle(fontSize: 10, color: AppColors.crimson, fontWeight: FontWeight.bold),
              ),
              Text(
                '${(100 - b.wall).toStringAsFixed(1)}% Def 🛡️',
                style: const TextStyle(fontSize: 10, color: AppColors.blue, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // CTA: Enter Battle Button
          PulseButton(
            label: 'ENTER BATTLE ➔',
            icon: Icons.sports_mma_rounded,
            backgroundColor: AppColors.surfaceElevated,
            foregroundColor: AppColors.cyan,
            onPressed: () => context.push('/battle/${b.id}', extra: b),
          ),
        ],
      ),
    );
  }

  void _showStimulantsSheet(BuildContext context, AsyncValue<List<Map<String, dynamic>>> buffsAsync) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        return Consumer(
          builder: (context, ref, _) {
            final activeBuffs = ref.watch(buffsProvider).value ?? [];

            return SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: const [
                            Text('💉', style: TextStyle(fontSize: 20)),
                            SizedBox(width: 8),
                            Text(
                              'Combat Stimulants (1 Gold)',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(sheetContext).pop(),
                        icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                  const Text(
                    'Inject high-grade combat buffs to boost damage and survivability for 24 hours.',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 11),
                  ),
                  const SizedBox(height: 14),

                  ..._buffsCatalog.map((b) {
                    final type = b['type']!;
                    final isActive = activeBuffs.any((x) => x['type'] == type && x['buffed'] == true);
                    final isDebuffed = activeBuffs.any((x) => x['type'] == type && x['debuffed'] == true);
                    final isDisabled = isActive || isDebuffed;

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: isActive
                                ? AppColors.emerald
                                : (isDebuffed ? AppColors.crimson : AppColors.border),
                          ),
                        ),
                        child: Row(
                          children: [
                            Text(b['icon']!, style: const TextStyle(fontSize: 24)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        b['label']!,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                          color: AppColors.textPrimary,
                                        ),
                                      ),
                                      if (isActive) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                          decoration: BoxDecoration(
                                            color: AppColors.emerald,
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: const Text(
                                            'ACTIVE',
                                            style: TextStyle(
                                              color: Colors.black,
                                              fontSize: 9,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ] else if (isDebuffed) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                          decoration: BoxDecoration(
                                            color: AppColors.crimson,
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: const Text(
                                            'DEBUFF',
                                            style: TextStyle(
                                              color: Colors.white,
                                              fontSize: 9,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    b['desc']!,
                                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton(
                              onPressed: isDisabled ? null : () => _activateBuff(sheetContext, ref, type),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: isDisabled ? AppColors.surface : AppColors.cyan,
                                foregroundColor: isDisabled ? AppColors.textMuted : Colors.black,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              ),
                              child: Text(
                                isActive ? 'Active' : (isDebuffed ? 'Debuff' : '1g Inject'),
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
          );
        },
        );
      },
    );
  }

  void _activateBuff(BuildContext context, WidgetRef ref, String type) async {
    try {
      await ref.read(warfareRepositoryProvider).buyBuff(type);
      ref.invalidate(buffsProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (context.mounted) {
        showSuccessPopup(
          context,
          'Combat Stimulant $type activated! +10% Damage applied for 24 hours.',
          title: 'STIMULANT INJECTED',
        );
      }
    } catch (e) {
      if (context.mounted) {
        showErrorPopup(context, e, title: 'BUFF ACTIVATION FAILED');
      }
    }
  }
}
