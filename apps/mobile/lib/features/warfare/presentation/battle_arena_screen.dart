import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/sockets/socket_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/stat_bar.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../../citizen/presentation/quick_heal_modal.dart';
import '../data/warfare_repository.dart';
import '../domain/battle_model.dart';

class BattleArenaScreen extends ConsumerStatefulWidget {
  final String battleId;
  final BattleModel? initialBattle;

  const BattleArenaScreen({
    super.key,
    required this.battleId,
    this.initialBattle,
  });

  @override
  ConsumerState<BattleArenaScreen> createState() => _BattleArenaScreenState();
}

class _BattleArenaScreenState extends ConsumerState<BattleArenaScreen> {
  late BattleModel _battle;
  bool _isLoading = true;
  String _selectedSide = 'DEFENDER';
  int _weaponQuality = 0; // 0 = unarmed, 1-5 = ammo
  bool _isFighting = false;
  String? _lastHitResult;
  bool _isCrit = false;
  double _mySessionDamage = 0;
  String _topFightersSideTab = 'ATTACKER';
  final List<Map<String, dynamic>> _hitLogs = [];

  static const _ammoTiers = [
    {'q': 0, 'label': 'Unarmed', 'mult': '1.0×', 'icon': '✊'},
    {'q': 1, 'label': 'Q1 Ammo', 'mult': '+10%', 'icon': '🔫'},
    {'q': 2, 'label': 'Q2 Ammo', 'mult': '+27.5%', 'icon': '🗡️'},
    {'q': 3, 'label': 'Q3 Ammo', 'mult': '+45%', 'icon': '⚔️'},
    {'q': 4, 'label': 'Q4 Ammo', 'mult': '+62.5%', 'icon': '🎯'},
    {'q': 5, 'label': 'Q5 Ammo', 'mult': '+80%', 'icon': '🚀'},
  ];

  late final SocketService _socketService;

  @override
  void initState() {
    super.initState();
    _socketService = ref.read(socketServiceProvider);
    if (widget.initialBattle != null) {
      _battle = widget.initialBattle!;
      _isLoading = false;
    }
    _loadBattleAndConnectSocket();
  }

  void _loadBattleAndConnectSocket() async {
    final repo = ref.read(warfareRepositoryProvider);
    try {
      final b = await repo.fetchBattleDetail(widget.battleId);
      if (mounted) {
        setState(() {
          _battle = b;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (widget.initialBattle == null && mounted) {
        setState(() => _isLoading = false);
      }
    }

    // Connect to WebSocket room
    final socket = _socketService.getBattleSocket();
    socket.emit('battle:join', {'battleId': widget.battleId});

    // Listen to official backend battle:event
    socket.on('battle:event', (data) {
      if (!mounted || data == null) return;
      final map = Map<String, dynamic>.from(data as Map);
      final newWall = (map['wall'] as num?)?.toDouble();
      final roundNum = (map['roundNumber'] as num?)?.toInt();
      final hits = (map['hits'] as List? ?? []);

      if (mounted) {
        setState(() {
          if (newWall != null) {
            _battle = _battle.copyWith(
              wall: newWall,
              currentRoundNumber: roundNum ?? _battle.currentRoundNumber,
            );
          }

          final now = DateTime.now();
          final timeStr =
              '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';

          for (final h in hits) {
            final hMap = Map<String, dynamic>.from(h as Map);
            _hitLogs.insert(0, {
              'side': map['side'] ?? 'ATTACKER',
              'mode': map['mode'] ?? 'SINGLE',
              'damage': hMap['damage'] ?? 0,
              'crit': hMap['crit'] == true,
              'missed': hMap['missed'] == true,
              'avoided': hMap['avoided'] == true,
              'time': timeStr,
            });
            if (_hitLogs.length > 25) _hitLogs.removeLast();
          }
        });
      }
    });
  }

  Future<void> _reloadBattle() async {
    try {
      final repo = ref.read(warfareRepositoryProvider);
      final b = await repo.fetchBattleDetail(widget.battleId);
      if (mounted) setState(() => _battle = b);
    } catch (_) {}
  }

  @override
  void dispose() {
    final socket = _socketService.getBattleSocket();
    socket.emit('battle:leave', {'battleId': widget.battleId});
    socket.off('battle:event');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppColors.cyan)),
      );
    }

    final citizen = ref.watch(citizenNotifierProvider).value;
    final storage = ref.watch(storageProvider).value ?? [];

    final ammoStock = <int, int>{};
    for (final s in storage) {
      if (s['product'] == 'AMMO') {
        ammoStock[(s['quality'] as num).toInt()] = (s['quantity'] as num).toInt();
      }
    }

    final hp = citizen?.hp ?? 0;
    final isRw = _battle.warType == 'RESISTANCE';
    final isCivil = _battle.warType == 'CIVIL';
    final typeLabel = _battle.isTraining
        ? 'TRAINING DRILLS'
        : (isRw ? 'RESISTANCE WAR' : (isCivil ? 'CIVIL WAR' : 'DIRECT WAR'));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => Navigator.of(context).maybePop(),
          tooltip: 'Return to Battles List',
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _battle.regionName,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              'Round ${_battle.currentRoundNumber} / 15 • $typeLabel',
              style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
            ),
          ],
        ),
        actions: [
          // Quick Heal Action
          TextButton.icon(
            onPressed: () {
              showModalBottomSheet(
                context: context,
                backgroundColor: Colors.transparent,
                isScrollControlled: true,
                builder: (_) => const QuickHealModal(),
              );
            },
            icon: const Icon(Icons.healing_rounded, color: AppColors.emerald, size: 18),
            label: const Text(
              '+ HEAL',
              style: TextStyle(
                color: AppColors.emerald,
                fontSize: 11,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          // Reload
          IconButton(
            onPressed: _reloadBattle,
            icon: const Icon(Icons.refresh_rounded, size: 20),
            tooltip: 'Reload battle stats',
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Citizen Combat HUD (Health + Damage Dealt)
            _buildCitizenHud(citizen, hp),
            const SizedBox(height: 14),

            // Dominance Battle Wall (Tug of War)
            _buildDominanceWall(),
            const SizedBox(height: 14),

            // Floating Hit Result Banner
            if (_lastHitResult != null) ...[
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: _isCrit
                        ? AppColors.amber.withOpacity(0.2)
                        : AppColors.crimson.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _isCrit ? AppColors.amber : AppColors.crimson,
                      width: 1.5,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _isCrit ? Icons.star_rounded : Icons.flash_on_rounded,
                        color: _isCrit ? AppColors.amber : AppColors.crimson,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _lastHitResult!,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: _isCrit ? AppColors.amber : AppColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
            ],

            // Combat Alignment (Side Selector)
            _buildSideSelector(),
            const SizedBox(height: 16),

            // Weapon & Ammo Quality Selector
            _buildWeaponSelector(ammoStock),
            const SizedBox(height: 16),

            // Strike Action Buttons
            _buildStrikeButtons(citizen, hp, ammoStock),
            const SizedBox(height: 18),

            // Top Fighters / Battle Hero Race
            _buildBattleHeroSection(),
            const SizedBox(height: 18),

            // Live Combat Feed (WebSocket)
            _buildLiveCombatFeed(),
          ],
        ),
      ),
    );
  }

  Widget _buildCitizenHud(dynamic citizen, int hp) {
    final hpColor = hp > 50
        ? AppColors.emerald
        : (hp >= 20 ? AppColors.amber : AppColors.crimson);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          // HP Icon & Meter
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.favorite_rounded, color: hpColor, size: 16),
                        const SizedBox(width: 6),
                        Text(
                          'Citizen HP: $hp / 100',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: hpColor,
                          ),
                        ),
                      ],
                    ),
                    InkWell(
                      onTap: () {
                        showModalBottomSheet(
                          context: context,
                          backgroundColor: Colors.transparent,
                          isScrollControlled: true,
                          builder: (_) => const QuickHealModal(),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.emerald.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: AppColors.emerald.withOpacity(0.4)),
                        ),
                        child: const Text(
                          '+ QUICK HEAL',
                          style: TextStyle(
                            color: AppColors.emerald,
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (hp / 100).clamp(0.0, 1.0),
                    backgroundColor: AppColors.background,
                    color: hpColor,
                    minHeight: 6,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Container(width: 1, height: 32, color: AppColors.border),
          const SizedBox(width: 16),
          // Session Damage Dealt
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text(
                'ROUND DAMAGE',
                style: TextStyle(fontSize: 9, color: AppColors.textMuted, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  const Icon(Icons.flash_on_rounded, color: AppColors.amber, size: 14),
                  Text(
                    '${_mySessionDamage.toInt()} DMG',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: AppColors.amber,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDominanceWall() {
    return TacticalCard(
      padding: const EdgeInsets.all(16),
      borderColor: AppColors.cyan.withOpacity(0.4),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Attacker Side
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
                            _battle.attackerCountryName,
                            style: const TextStyle(
                              color: AppColors.crimson,
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            'Wins: ${_battle.attackerScore} 🏆',
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // VS Dominance Badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Text(
                  'DOMINANCE',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textSecondary,
                    letterSpacing: 0.5,
                  ),
                ),
              ),

              // Defender Side
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _battle.defenderCountryName,
                            style: const TextStyle(
                              color: AppColors.blue,
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            'Wins: ${_battle.defenderScore} 🏆',
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
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
          const SizedBox(height: 12),

          // Dual Dominance Tug-of-War Bar
          StatBar(
            label: '',
            value: _battle.wall,
            max: 100,
            barColor: AppColors.blue,
            trackColor: AppColors.crimson,
            height: 10,
            customValueText: '${_battle.wall.toStringAsFixed(1)}% Wall',
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '⚔️ Atk ${_battle.wall.toStringAsFixed(1)}%',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.crimson,
                ),
              ),
              Text(
                '${(100 - _battle.wall).toStringAsFixed(1)}% Def 🛡️',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.blue,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'First to 8 rounds conquers region • ${_battle.wall > 50 ? "Defenders holding the wall" : "Attackers breaching the wall"}',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 10),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildSideSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'COMBAT ALIGNMENT',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: AppColors.textSecondary,
                letterSpacing: 0.5,
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            // Attack Side
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _selectedSide = 'ATTACKER'),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                  decoration: BoxDecoration(
                    color: _selectedSide == 'ATTACKER'
                        ? AppColors.crimson.withOpacity(0.2)
                        : AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _selectedSide == 'ATTACKER'
                          ? AppColors.crimson
                          : AppColors.border,
                      width: _selectedSide == 'ATTACKER' ? 1.5 : 1.0,
                    ),
                  ),
                  child: Column(
                    children: [
                      const Text('⚔️', style: TextStyle(fontSize: 18)),
                      const SizedBox(height: 4),
                      Text(
                        'ATTACK',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: _selectedSide == 'ATTACKER'
                              ? AppColors.crimson
                              : AppColors.textSecondary,
                        ),
                      ),
                      Text(
                        _battle.attackerCountryCode,
                        style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),

            // Defend Side
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _selectedSide = 'DEFENDER'),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                  decoration: BoxDecoration(
                    color: _selectedSide == 'DEFENDER'
                        ? AppColors.blue.withOpacity(0.2)
                        : AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _selectedSide == 'DEFENDER'
                          ? AppColors.blue
                          : AppColors.border,
                      width: _selectedSide == 'DEFENDER' ? 1.5 : 1.0,
                    ),
                  ),
                  child: Column(
                    children: [
                      const Text('🛡️', style: TextStyle(fontSize: 18)),
                      const SizedBox(height: 4),
                      Text(
                        'DEFEND',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: _selectedSide == 'DEFENDER'
                              ? AppColors.blue
                              : AppColors.textSecondary,
                        ),
                      ),
                      Text(
                        _battle.defenderCountryCode,
                        style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildWeaponSelector(Map<int, int> ammoStock) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'WEAPON & AMMUNITION TIER',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.textSecondary,
                    letterSpacing: 0.5,
                    fontWeight: FontWeight.bold,
                  ),
            ),
            Text(
              _weaponQuality == 0
                  ? 'Unarmed (No Ammo)'
                  : 'Q$_weaponQuality Ammo (${ammoStock[_weaponQuality] ?? 0} in warehouse)',
              style: const TextStyle(fontSize: 10, color: AppColors.cyan),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 64,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _ammoTiers.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final t = _ammoTiers[index];
              final q = t['q'] as int;
              final isSelected = _weaponQuality == q;
              final stock = q == 0 ? 9999 : (ammoStock[q] ?? 0);
              final isOutOfStock = q > 0 && stock == 0;

              return GestureDetector(
                onTap: () => setState(() => _weaponQuality = q),
                child: Container(
                  width: 98,
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? AppColors.cyan.withOpacity(0.15)
                        : AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: isSelected
                          ? AppColors.cyan
                          : (isOutOfStock ? AppColors.crimson.withOpacity(0.3) : AppColors.border),
                      width: isSelected ? 1.5 : 1.0,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(t['icon'] as String, style: const TextStyle(fontSize: 14)),
                            const SizedBox(width: 4),
                            Text(
                              t['mult'] as String,
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: isSelected ? AppColors.cyan : AppColors.textPrimary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        t['label'] as String,
                        style: TextStyle(
                          fontSize: 9,
                          color: isSelected ? AppColors.textPrimary : AppColors.textMuted,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        q == 0 ? 'Stock: ∞' : (stock > 0 ? 'Stock: $stock' : '0 Stock'),
                        style: TextStyle(
                          fontSize: 8,
                          color: isOutOfStock ? AppColors.crimson : AppColors.textMuted,
                          fontWeight: isOutOfStock ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildStrikeButtons(dynamic citizen, int hp, Map<int, int> ammoStock) {
    final canSingle = hp >= 10 && (_weaponQuality == 0 || (ammoStock[_weaponQuality] ?? 0) >= 1);
    final canBerserk = hp >= 50 && (_weaponQuality == 0 || (ammoStock[_weaponQuality] ?? 0) >= 1);

    return Column(
      children: [
        Row(
          children: [
            // Single Strike Button
            Expanded(
              child: PulseButton(
                label: 'SINGLE (-10 HP)',
                icon: Icons.sports_mma_rounded,
                backgroundColor: canSingle ? AppColors.surfaceElevated : AppColors.surface,
                foregroundColor: canSingle ? AppColors.textPrimary : AppColors.textMuted,
                isLoading: _isFighting,
                onPressed: canSingle && !_isFighting ? () => _executeFight('SINGLE') : null,
              ),
            ),
            const SizedBox(width: 12),

            // Berserk Strike Button
            Expanded(
              child: PulseButton(
                label: 'BERSERK ×5 (-50 HP)',
                icon: Icons.local_fire_department_rounded,
                backgroundColor: canBerserk ? AppColors.crimson : AppColors.surface,
                foregroundColor: canBerserk ? Colors.white : AppColors.textMuted,
                isLoading: _isFighting,
                onPressed: canBerserk && !_isFighting ? () => _executeFight('BERSERK') : null,
              ),
            ),
          ],
        ),
        if (hp < 10) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.crimson.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: AppColors.crimson.withOpacity(0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  '⚠️ Health too low (<10 HP). Eat food to strike!',
                  style: TextStyle(color: AppColors.crimson, fontSize: 11),
                ),
                InkWell(
                  onTap: () {
                    showModalBottomSheet(
                      context: context,
                      backgroundColor: Colors.transparent,
                      isScrollControlled: true,
                      builder: (_) => const QuickHealModal(),
                    );
                  },
                  child: const Text(
                    'Quick Heal',
                    style: TextStyle(
                      color: AppColors.emerald,
                      fontWeight: FontWeight.bold,
                      fontSize: 11,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildBattleHeroSection() {
    final top = _battle.topFighters;
    final filtered = top.where((f) => f.side == _topFightersSideTab).toList();

    return TacticalCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: const [
                  Text('🎖️', style: TextStyle(fontSize: 16)),
                  SizedBox(width: 6),
                  Text(
                    'Battle Hero Race',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
              const Text(
                'Top Fighters (5g Medal)',
                style: TextStyle(fontSize: 10, color: AppColors.amber),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Tabs for Attacker vs Defender Top Fighters
          Row(
            children: [
              Expanded(
                child: ChoiceChip(
                  label: Center(
                    child: Text(
                      '⚔️ Attacker BH',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: _topFightersSideTab == 'ATTACKER' ? FontWeight.bold : FontWeight.normal,
                        color: _topFightersSideTab == 'ATTACKER' ? Colors.white : AppColors.textSecondary,
                      ),
                    ),
                  ),
                  selected: _topFightersSideTab == 'ATTACKER',
                  selectedColor: AppColors.crimson.withOpacity(0.4),
                  backgroundColor: AppColors.surfaceElevated,
                  side: BorderSide(
                    color: _topFightersSideTab == 'ATTACKER' ? AppColors.crimson : AppColors.border,
                  ),
                  onSelected: (selected) {
                    if (selected) setState(() => _topFightersSideTab = 'ATTACKER');
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  label: Center(
                    child: Text(
                      '🛡️ Defender BH',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: _topFightersSideTab == 'DEFENDER' ? FontWeight.bold : FontWeight.normal,
                        color: _topFightersSideTab == 'DEFENDER' ? Colors.white : AppColors.textSecondary,
                      ),
                    ),
                  ),
                  selected: _topFightersSideTab == 'DEFENDER',
                  selectedColor: AppColors.blue.withOpacity(0.4),
                  backgroundColor: AppColors.surfaceElevated,
                  side: BorderSide(
                    color: _topFightersSideTab == 'DEFENDER' ? AppColors.blue : AppColors.border,
                  ),
                  onSelected: (selected) {
                    if (selected) setState(() => _topFightersSideTab = 'DEFENDER');
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          if (filtered.isEmpty) ...[
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: Text(
                  'No damage recorded for this side yet. Strike to claim #1 Battle Hero!',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ] else ...[
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: filtered.length.clamp(0, 5),
              separatorBuilder: (_, __) => const Divider(color: AppColors.border, height: 8),
              itemBuilder: (context, index) {
                final fighter = filtered[index];
                final medals = ['🥇', '🥈', '🥉', '4.', '5.'];
                final medal = index < medals.length ? medals[index] : '${index + 1}.';

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Text(medal, style: const TextStyle(fontSize: 12)),
                          const SizedBox(width: 8),
                          Text(
                            fighter.nickname,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          if (fighter.countryCode != null) ...[
                            const SizedBox(width: 4),
                            Text(
                              '(${fighter.countryCode})',
                              style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                            ),
                          ],
                        ],
                      ),
                      Text(
                        '${fighter.damage.toString()} DMG',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: _topFightersSideTab == 'ATTACKER' ? AppColors.crimson : AppColors.blue,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLiveCombatFeed() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'LIVE COMBAT STREAM',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.textSecondary,
                    letterSpacing: 0.5,
                    fontWeight: FontWeight.bold,
                  ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.emerald.withOpacity(0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                'LIVE WS',
                style: TextStyle(color: AppColors.emerald, fontSize: 9, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Container(
          height: 160,
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          padding: const EdgeInsets.all(10),
          child: _hitLogs.isEmpty
              ? const Center(
                  child: Text(
                    'Combat radar quiet. Fire a strike to broadcast across the front.',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                    textAlign: TextAlign.center,
                  ),
                )
              : ListView.builder(
                  itemCount: _hitLogs.length,
                  itemBuilder: (context, index) {
                    final log = _hitLogs[index];
                    final side = log['side'] as String;
                    final isAtk = side == 'ATTACKER';
                    final dmg = (log['damage'] as num).toInt();
                    final isCrit = log['crit'] == true;
                    final missed = log['missed'] == true;

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          Text(
                            log['time'] as String,
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 10),
                          ),
                          const SizedBox(width: 8),
                          Icon(
                            isAtk ? Icons.arrow_upward_rounded : Icons.shield_rounded,
                            size: 13,
                            color: isAtk ? AppColors.crimson : AppColors.blue,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              missed
                                  ? '$side MISSED target!'
                                  : '$side hit for $dmg DMG${isCrit ? " 💥 CRIT!" : ""}',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: isCrit ? FontWeight.bold : FontWeight.normal,
                                color: isCrit
                                    ? AppColors.amber
                                    : (isAtk ? AppColors.crimson : AppColors.textPrimary),
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Future<void> _executeFight(String mode) async {
    setState(() => _isFighting = true);
    final repo = ref.read(warfareRepositoryProvider);

    try {
      HapticFeedback.heavyImpact();
      final res = await repo.fight(
        battleId: widget.battleId,
        side: _selectedSide,
        mode: mode,
        weaponQuality: _weaponQuality,
      );

      final hits = (res['hits'] as List? ?? []);
      double totalDmg = 0;
      bool crit = false;

      for (final h in hits) {
        final hMap = h as Map<String, dynamic>;
        totalDmg += (hMap['damage'] as num?)?.toDouble() ?? 0;
        if (hMap['crit'] == true) crit = true;
      }

      final wallVal = (res['wall'] as num?)?.toDouble();

      setState(() {
        _isCrit = crit;
        _mySessionDamage += totalDmg;
        _lastHitResult = '${totalDmg.toStringAsFixed(0)} DMG! ${crit ? "CRITICAL HIT!" : ""}';
        if (wallVal != null) {
          _battle = _battle.copyWith(wall: wallVal);
        }
      });

      // Refresh citizen telemetry (HP, XP, medals) and storage
      if (!mounted) return;
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (!mounted) return;
      ref.invalidate(storageProvider);

      // Also reload battle detail to get updated top fighters
      _reloadBattle();
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'COMBAT ENGAGEMENT FAILED');
      }
    } finally {
      if (mounted) setState(() => _isFighting = false);
    }
  }
}
