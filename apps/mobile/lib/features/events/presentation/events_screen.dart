import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../data/events_repository.dart';

final tournamentsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(eventsRepositoryProvider);
  return repo.fetchTournaments();
});

class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> {
  final _teamNameCtrl = TextEditingController();
  bool _busy = false;

  static const _cupLabels = {
    'GUNPOWDER_CUP': 'Gunpowder Cup',
    'GLOBAL_WAR': 'Global War Tournament',
    'ARMY_CUP': 'Regimental Army Cup',
    'COUNTRY_CUP': 'National Country Cup',
    'QUICKDROP_CUP': 'Quickdrop Blitz Cup',
    'ONE_VS_ONE': '1v1 Duel Championship',
    'FIRST_AID': 'First Aid Resilience Cup',
  };

  @override
  void dispose() {
    _teamNameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tournamentsAsync = ref.watch(tournamentsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tournaments & Events'),
      ),
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async => ref.invalidate(tournamentsProvider),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Banner Card
              TacticalCard(
                borderColor: AppColors.amber.withOpacity(0.4),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: AppColors.amber.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
                      child: const Icon(Icons.emoji_events_rounded, color: AppColors.amber, size: 28),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Global Competitions', style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: 2),
                          const Text('7 major tournament formats for citizens, regiments, and nations.', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),
              Text('Active & Upcoming Tournaments', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),

              tournamentsAsync.when(
                data: (tournaments) {
                  if (tournaments.isEmpty) {
                    return TacticalCard(
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            children: const [
                              Icon(Icons.military_tech_outlined, size: 36, color: AppColors.textMuted),
                              SizedBox(height: 8),
                              Text('No Tournaments Currently Scheduled', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.textSecondary)),
                              SizedBox(height: 4),
                              Text('Tournaments are scheduled periodically. Check back soon or train your regiment.', style: TextStyle(color: AppColors.textMuted, fontSize: 11), textAlign: TextAlign.center),
                            ],
                          ),
                        ),
                      ),
                    );
                  }

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: tournaments.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final t = tournaments[index];
                      final id = t['id'] as String;
                      final type = t['type'] as String? ?? 'COUNTRY_CUP';
                      final status = t['status'] as String? ?? 'REGISTERING';
                      final teams = (t['teams'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
                      final matches = (t['matches'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
                      final cupTitle = _cupLabels[type] ?? type;

                      return TacticalCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(cupTitle, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: status == 'REGISTERING' ? AppColors.cyan.withOpacity(0.15) : AppColors.emerald.withOpacity(0.15),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(status, style: TextStyle(color: status == 'REGISTERING' ? AppColors.cyan : AppColors.emerald, fontWeight: FontWeight.bold, fontSize: 10)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text('${teams.length} Enlisted Teams • ${matches.length} Rounds', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                            if (teams.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: teams.map((team) {
                                  final name = team['name'] as String? ?? 'Squad';
                                  final pts = team['points'] ?? 0;
                                  return Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(color: AppColors.surfaceElevated, borderRadius: BorderRadius.circular(6)),
                                    child: Text('$name • ${pts}p', style: const TextStyle(fontSize: 11, color: AppColors.textPrimary)),
                                  );
                                }).toList(),
                              ),
                            ],
                            if (status == 'REGISTERING') ...[
                              const SizedBox(height: 14),
                              PulseButton(
                                label: 'Enlist Team in $cupTitle',
                                icon: Icons.sports_mma_rounded,
                                backgroundColor: AppColors.cyan,
                                foregroundColor: Colors.black,
                                onPressed: _busy ? null : () => _registerModal(id, cupTitle),
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
                error: (e, _) => TacticalErrorCard(error: e, onRetry: () => ref.invalidate(tournamentsProvider)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _registerModal(String tournamentId, String cupTitle) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Enlist in $cupTitle', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.cyan)),
              const SizedBox(height: 6),
              const Text('Enter team or regimental designation:', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              const SizedBox(height: 12),
              TextField(
                controller: _teamNameCtrl,
                decoration: const InputDecoration(hintText: 'e.g. Iron Vanguard', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 14),
              PulseButton(
                label: 'Confirm Enlistment',
                icon: Icons.check_circle_rounded,
                backgroundColor: AppColors.cyan,
                foregroundColor: Colors.black,
                onPressed: () async {
                  final name = _teamNameCtrl.text.trim();
                  Navigator.pop(context);
                  setState(() => _busy = true);
                  try {
                    await ref.read(eventsRepositoryProvider).registerTeam(tournamentId, teamName: name.isNotEmpty ? name : null);
                    _teamNameCtrl.clear();
                    ref.invalidate(tournamentsProvider);
                    if (mounted) {
                      showSuccessPopup(context, 'Registered for $cupTitle!', title: 'TOURNAMENT REGISTERED');
                    }
                  } catch (e) {
                    if (mounted) {
                      showErrorPopup(context, e, title: 'TOURNAMENT REGISTRATION FAILED');
                    }
                  } finally {
                    if (mounted) setState(() => _busy = false);
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
