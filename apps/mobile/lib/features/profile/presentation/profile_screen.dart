import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../../core/widgets/rating_widget.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/profile_repository.dart';

final friendsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final repo = ref.watch(profileRepositoryProvider);
  return repo.fetchFriends();
});

final packsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final repo = ref.watch(profileRepositoryProvider);
  return repo.fetchPacks();
});

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _friendCtrl = TextEditingController();
  final _msgCtrl = TextEditingController();
  String _avatarColor = '#4cc38a';
  String _guide = 'MAN';
  bool _enableTutorial = true;
  List<String> _shortcuts = [];
  bool _initialized = false;
  bool _busy = false;

  static const _colors = ['#4cc38a', '#e8b44a', '#4a7de8', '#c9543f', '#8b5cf6', '#06b6d4'];

  static const _availableShortcuts = [
    ('/warfare', 'Battles', Icons.sports_mma_rounded),
    ('/equipment', 'Equipment', Icons.shield_rounded),
    ('/companies', 'Companies', Icons.factory_rounded),
    ('/work', 'Work', Icons.work_rounded),
    ('/politics', 'Politics', Icons.account_balance_rounded),
    ('/media', 'Media', Icons.newspaper_rounded),
    ('/mu', 'Military Units', Icons.group_work_rounded),
    ('/auctions', 'Auctions', Icons.gavel_rounded),
    ('/contracts', 'Contracts', Icons.description_rounded),
    ('/events', 'Tournaments', Icons.emoji_events_rounded),
    ('/achievements', 'Achievements', Icons.military_tech_rounded),
    ('/stats', 'Statistics', Icons.bar_chart_rounded),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _friendCtrl.dispose();
    _msgCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final citizenAsync = ref.watch(citizenNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Citizen Dossier & Profile'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.cyan,
          labelColor: AppColors.cyan,
          unselectedLabelColor: AppColors.textMuted,
          tabs: const [
            Tab(text: 'Settings'),
            Tab(text: 'Friends & Mail'),
            Tab(text: 'Packs'),
          ],
        ),
      ),
      body: citizenAsync.when(
        data: (citizen) {
          if (citizen == null) return const SizedBox.shrink();

          if (!_initialized) {
            _avatarColor = citizen.avatarColor;
            _guide = citizen.guide;
            _enableTutorial = citizen.enableTutorial;
            _shortcuts = List<String>.from(citizen.shortcuts);
            _initialized = true;
          }

          return Column(
            children: [
              // Profile Header
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border(bottom: BorderSide(color: AppColors.border)),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: AppColors.cyan.withValues(alpha: 0.2),
                      child: Text(
                        citizen.nickname.isNotEmpty ? citizen.nickname[0].toUpperCase() : 'C',
                        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppColors.cyan),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(citizen.nickname, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(color: AppColors.cyan.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(4)),
                                child: Text('L${citizen.level}', style: const TextStyle(color: AppColors.cyan, fontSize: 11, fontWeight: FontWeight.bold)),
                              ),
                              const Spacer(),
                              RatingWidget(targetType: 'CITIZEN', targetId: citizen.id, compact: true),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${citizen.rankName} (+${citizen.rankBonusPct.toStringAsFixed(0)}% DMG) • ${citizen.countryName}',
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                          ),
                          Text(
                            'Location: ${citizen.locationRegionName} • Strength: ${citizen.strength.toStringAsFixed(1)}',
                            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildSettingsTab(),
                    _buildFriendsTab(),
                    _buildPacksTab(),
                  ],
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.read(citizenNotifierProvider.notifier).refresh())),
      ),
    );
  }

  Widget _buildSettingsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: TacticalCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Customization & Interface', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            const Text('Avatar Color Theme:', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            const SizedBox(height: 8),
            Row(
              children: _colors.map((c) {
                final isSelected = _avatarColor == c;
                return GestureDetector(
                  onTap: () => setState(() => _avatarColor = c),
                  child: Container(
                    margin: const EdgeInsets.only(right: 10),
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: Color(int.parse(c.replaceFirst('#', '0xff'))),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: isSelected ? Colors.white : Colors.transparent, width: 2),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: _guide,
              decoration: const InputDecoration(labelText: 'Tactical Guide Voice', border: OutlineInputBorder()),
              dropdownColor: AppColors.surfaceCard,
              items: const [
                DropdownMenuItem(value: 'MAN', child: Text('Commander Ares (Male)')),
                DropdownMenuItem(value: 'WOMAN', child: Text('Advisor Athena (Female)')),
                DropdownMenuItem(value: 'CHICKEN', child: Text('Colonel Rooster (Mascot)')),
              ],
              onChanged: (val) {
                if (val != null) setState(() => _guide = val);
              },
            ),
            const SizedBox(height: 16),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Show Tutorial Hints & Tooltips', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              subtitle: const Text('Display onboarding guidance on first visit', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
              value: _enableTutorial,
              activeThumbColor: AppColors.cyan,
              onChanged: (val) => setState(() => _enableTutorial = val),
            ),
            const SizedBox(height: 16),
            const Divider(color: AppColors.border),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Sidebar Hotlist Shortcuts',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.cyan.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: AppColors.cyan.withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    '${_shortcuts.length}/5 Picked',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.cyan),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Select up to 5 favorite navigation targets to pin on your tactical quick hotlist.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 11),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _availableShortcuts.map((item) {
                final (route, label, icon) = item;
                final isSelected = _shortcuts.contains(route);

                return FilterChip(
                  avatar: Icon(
                    icon,
                    size: 14,
                    color: isSelected ? Colors.black : AppColors.cyan,
                  ),
                  label: Text(label),
                  selected: isSelected,
                  selectedColor: AppColors.cyan,
                  checkmarkColor: Colors.black,
                  labelStyle: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: isSelected ? Colors.black : AppColors.textPrimary,
                  ),
                  backgroundColor: AppColors.surfaceElevated,
                  side: BorderSide(
                    color: isSelected ? AppColors.cyan : AppColors.border,
                    width: isSelected ? 1.2 : 0.8,
                  ),
                  onSelected: (selected) {
                    setState(() {
                      if (selected) {
                        if (_shortcuts.length < 5) {
                          _shortcuts.add(route);
                        } else {
                          showErrorPopup(context, 'Maximum 5 shortcuts allowed on the hotlist.');
                        }
                      } else {
                        _shortcuts.remove(route);
                      }
                    });
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 24),
            PulseButton(
              label: 'Save Profile Settings',
              icon: Icons.save_rounded,
              backgroundColor: AppColors.cyan,
              foregroundColor: Colors.black,
              onPressed: _busy ? null : _saveSettings,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFriendsTab() {
    final friendsAsync = ref.watch(friendsProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(friendsProvider),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Add Friend Bar
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _friendCtrl,
                    decoration: const InputDecoration(
                      hintText: 'Enter citizen nickname...',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _busy ? null : _addFriend,
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.cyan, foregroundColor: Colors.black),
                  child: const Text('Add Friend', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 16),

            friendsAsync.when(
              data: (data) {
                final incoming = (data['incoming'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
                final friends = (data['friends'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (incoming.isNotEmpty) ...[
                      Text('Incoming Requests (${incoming.length})', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.amber)),
                      const SizedBox(height: 8),
                      ...incoming.map((r) {
                        final id = r['id'] as String;
                        final from = r['from'] as Map? ?? {};
                        final nick = from['nickname'] as String? ?? 'Citizen';

                        return TacticalCard(
                          padding: const EdgeInsets.all(10),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('$nick wants to be allies', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                              Row(
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.check_circle_rounded, color: AppColors.emerald),
                                    onPressed: () => _acceptFriend(id),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.cancel_rounded, color: AppColors.crimson),
                                    onPressed: () => _removeFriend(id),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }),
                      const SizedBox(height: 16),
                    ],

                    Text('Allied Citizens (${friends.length})', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),

                    if (friends.isEmpty)
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text('No friends yet — enter a nickname above to connect.', style: TextStyle(color: AppColors.textMuted)),
                        ),
                      )
                    else
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: friends.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final f = friends[index];
                          final id = f['id'] as String;
                          final citizen = f['citizen'] as Map? ?? {};
                          final nick = citizen['nickname'] as String? ?? 'Citizen';
                          final level = citizen['level'] as int? ?? 1;

                          return TacticalCard(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 16,
                                      backgroundColor: AppColors.surfaceElevated,
                                      child: Text(nick.isNotEmpty ? nick[0] : 'C', style: const TextStyle(color: AppColors.cyan, fontWeight: FontWeight.bold)),
                                    ),
                                    const SizedBox(width: 10),
                                    Text(nick, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                    const SizedBox(width: 6),
                                    Text('L$level', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                                  ],
                                ),
                                Row(
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.mail_outline_rounded, color: AppColors.cyan, size: 20),
                                      onPressed: () => _openMailModal(nick),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.person_remove_rounded, color: AppColors.textMuted, size: 18),
                                      onPressed: () => _removeFriend(id),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                  ],
                );
              },
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
              error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(friendsProvider))),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPacksTab() {
    final packsAsync = ref.watch(packsProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(packsProvider),
      child: packsAsync.when(
        data: (data) {
          final packs = data['packs'] as Map? ?? {};

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TacticalCard(
                borderColor: AppColors.amber.withValues(alpha: 0.3),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text('VIP Premium Subscriptions', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.amber)),
                    SizedBox(height: 4),
                    Text('Premium membership halves combat stimulant debuffs (24h cooldown) and grants instant gold & medical supplies.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              ...packs.entries.map((entry) {
                final key = entry.key as String;
                final p = entry.value as Map? ?? {};
                final gold = p['gold'] ?? 0;
                final faks = p['firstAidKits'] ?? 0;
                final days = p['premiumDays'] ?? 0;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TacticalCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(key, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.cyan)),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(color: AppColors.cyan.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(4)),
                              child: Text('+$days Days VIP', style: const TextStyle(color: AppColors.cyan, fontSize: 11, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text('• $gold Gold Treasury Allocation\n• $faks First Aid Emergency Medkits', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, height: 1.5)),
                        const SizedBox(height: 14),
                        PulseButton(
                          label: 'Acquire $key Pack',
                          icon: Icons.card_giftcard_rounded,
                          backgroundColor: AppColors.amber,
                          foregroundColor: Colors.black,
                          onPressed: _busy ? null : () => _buyPack(key),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(packsProvider))),
      ),
    );
  }

  void _saveSettings() async {
    setState(() => _busy = true);
    try {
      await ref.read(profileRepositoryProvider).updateSettings(
            avatarColor: _avatarColor,
            guide: _guide,
            enableTutorial: _enableTutorial,
            shortcuts: _shortcuts,
          );
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Settings updated!', title: 'SETTINGS SAVED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'SETTINGS UPDATE FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _addFriend() async {
    final nick = _friendCtrl.text.trim();
    if (nick.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(profileRepositoryProvider).addFriend(nick);
      _friendCtrl.clear();
      ref.invalidate(friendsProvider);
      if (mounted) {
        showSuccessPopup(context, 'Friend request dispatched to $nick!', title: 'ALLIANCE INVITE SENT');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'FRIEND REQUEST FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _acceptFriend(String id) async {
    try {
      await ref.read(profileRepositoryProvider).acceptFriend(id);
      ref.invalidate(friendsProvider);
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'ACTION FAILED');
    }
  }

  void _removeFriend(String id) async {
    try {
      await ref.read(profileRepositoryProvider).removeFriend(id);
      ref.invalidate(friendsProvider);
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'ACTION FAILED');
    }
  }

  void _buyPack(String key) async {
    setState(() => _busy = true);
    try {
      await ref.read(profileRepositoryProvider).buyPack(key);
      ref.invalidate(packsProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, '$key pack acquired! Gold and items credited.', title: 'SUPPLY PACK ACQUIRED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'PURCHASE FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _openMailModal(String nickname) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (modalCtx) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(modalCtx).viewInsets.bottom, left: 16, right: 16, top: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Encrypted Comms // $nickname', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.cyan)),
              const SizedBox(height: 12),
              TextField(
                controller: _msgCtrl,
                maxLines: 4,
                decoration: const InputDecoration(hintText: 'Compose tactical transmission...', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              PulseButton(
                label: 'Transmit Message',
                icon: Icons.send_rounded,
                backgroundColor: AppColors.cyan,
                foregroundColor: Colors.black,
                onPressed: () async {
                  final text = _msgCtrl.text.trim();
                  if (text.isEmpty) return;
                  Navigator.pop(modalCtx);
                  try {
                    await ref.read(profileRepositoryProvider).sendPm(nickname, text);
                    _msgCtrl.clear();
                    if (!mounted) return;
                    showSuccessPopup(context, 'Message transmitted!', title: 'DISPATCH SENT');
                  } catch (e) {
                    if (!mounted) return;
                    showErrorPopup(context, e, title: 'TRANSMISSION FAILED');
                  }
                },
              ),
              const SizedBox(height: 20),
            ],
          ),
        );
      },
    );
  }
}
