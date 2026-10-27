import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/sockets/socket_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../../core/network/api_client.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/politics_repository.dart';

final activeLawsProvider = FutureProvider.family<List<Map<String, dynamic>>, String>((ref, countryId) async {
  if (countryId.isEmpty) return [];
  final repo = ref.watch(politicsRepositoryProvider);
  return repo.fetchActiveLaws(countryId);
});

final treasuryProvider = FutureProvider.family<Map<String, dynamic>?, String>((ref, countryId) async {
  if (countryId.isEmpty) return null;
  final repo = ref.watch(politicsRepositoryProvider);
  return repo.fetchTreasury(countryId);
});

final electionsProvider = FutureProvider.family<Map<String, dynamic>?, String>((ref, countryId) async {
  if (countryId.isEmpty) return null;
  final repo = ref.watch(politicsRepositoryProvider);
  return repo.fetchElections(countryId);
});

final partiesProvider = FutureProvider.family<List<Map<String, dynamic>>, String>((ref, countryId) async {
  if (countryId.isEmpty) return [];
  final repo = ref.watch(politicsRepositoryProvider);
  return repo.fetchParties(countryId);
});

class PoliticsScreen extends ConsumerStatefulWidget {
  const PoliticsScreen({super.key});

  @override
  ConsumerState<PoliticsScreen> createState() => _PoliticsScreenState();
}

class _PoliticsScreenState extends ConsumerState<PoliticsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final List<Map<String, dynamic>> _messages = [];
  final TextEditingController _msgController = TextEditingController();
  final ScrollController _chatScrollController = ScrollController();
  final Set<String> _votedElectionIds = {};
  String? _joinedPartyId;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _initChatSocket();
  }

  void _initChatSocket() async {
    final socket = await ref.read(socketServiceProvider).getChatSocket();
    final citizen = ref.read(citizenNotifierProvider).value;
    if (citizen != null) {
      socket.emit('country:join', {'countryId': citizen.countryId});
    }

    socket.on('country:message', (data) {
      if (mounted && data != null) {
        setState(() {
          _messages.add(Map<String, dynamic>.from(data as Map));
        });
        _scrollToBottom();
      }
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.animateTo(
          _chatScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _msgController.dispose();
    _chatScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final citizen = ref.watch(citizenNotifierProvider).value;
    final countryId = citizen?.countryId ?? '';

    final treasuryAsync = ref.watch(treasuryProvider(countryId));
    final electionsAsync = ref.watch(electionsProvider(countryId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Politics & Governance'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: AppColors.cyan,
          labelColor: AppColors.cyan,
          unselectedLabelColor: AppColors.textSecondary,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(icon: Icon(Icons.gavel_rounded, size: 18), text: 'Laws'),
            Tab(icon: Icon(Icons.how_to_vote_rounded, size: 18), text: 'Elections'),
            Tab(icon: Icon(Icons.groups_rounded, size: 18), text: 'Parties'),
            Tab(icon: Icon(Icons.radio_rounded, size: 18), text: 'Radio Comms'),
          ],
        ),
      ),
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) {
          return [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                child: Column(
                  children: [
                    // Overview Governance Metrics Bar
                    _buildOverviewBar(citizen, treasuryAsync, electionsAsync),
                    if (treasuryAsync.value?['presidentId'] == citizen?.id) ...[
                      const SizedBox(height: 8),
                      TacticalCard(
                        borderColor: AppColors.amber,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.campaign_rounded, color: AppColors.amber, size: 20),
                                SizedBox(width: 8),
                                Text(
                                  'PRESIDENTIAL DISPATCH',
                                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: AppColors.amber, letterSpacing: 0.5),
                                ),
                              ],
                            ),
                            OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.amber,
                                side: const BorderSide(color: AppColors.amber),
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              ),
                              onPressed: _showBroadcastDialog,
                              child: const Text('Broadcast', style: TextStyle(fontSize: 11)),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ];
        },
        body: TabBarView(
          controller: _tabController,
          children: [
            _buildLawsTab(countryId),
            _buildElectionsTab(countryId, electionsAsync),
            _buildPartiesTab(countryId),
            _buildChatTab(citizen),
          ],
        ),
      ),
    );
  }

  Widget _buildOverviewBar(
    dynamic citizen,
    AsyncValue<Map<String, dynamic>?> treasuryAsync,
    AsyncValue<Map<String, dynamic>?> electionsAsync,
  ) {
    final treasury = treasuryAsync.value;
    final elections = electionsAsync.value;

    final cycleDay = elections?['cycleDay'] ?? '?';
    final treasuryGold = ((treasury?['treasuryGold'] as num?)?.toDouble() ?? 0) / 100;
    final minSalary = ((treasury?['minSalary'] as num?)?.toDouble() ?? 0) / 100;
    final isPresident = treasury?['presidentId'] == citizen?.id;

    return Row(
      children: [
        // Cycle Day Card
        Expanded(
          child: TacticalCard(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('CYCLE DAY', style: TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.bold)),
                const SizedBox(height: 3),
                Text('$cycleDay / 30', style: const TextStyle(color: AppColors.textPrimary, fontSize: 15, fontWeight: FontWeight.bold)),
                const SizedBox(height: 2),
                const Text('Elections cycle', style: TextStyle(color: AppColors.cyan, fontSize: 10), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ),
        const SizedBox(width: 8),

        // Treasury Card
        Expanded(
          child: TacticalCard(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('TREASURY', style: TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.bold)),
                const SizedBox(height: 3),
                Text('${treasuryGold.toStringAsFixed(1)} G', style: const TextStyle(color: AppColors.amber, fontSize: 15, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text('Min wage: ${minSalary.toStringAsFixed(1)}', style: const TextStyle(color: AppColors.emerald, fontSize: 10), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ),
        const SizedBox(width: 8),

        // Role Card
        Expanded(
          child: TacticalCard(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('ROLE', style: TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.bold)),
                const SizedBox(height: 3),
                Text(
                  isPresident ? '👑 President' : 'Citizen',
                  style: TextStyle(
                    color: isPresident ? AppColors.amber : AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                const Text('Republic voter', style: TextStyle(color: AppColors.textSecondary, fontSize: 10), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ===========================================================================
  // TAB 1: LAWS & PROPOSALS
  // ===========================================================================
  Widget _buildLawsTab(String countryId) {
    final lawsAsync = ref.watch(activeLawsProvider(countryId));

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async {
        ref.invalidate(activeLawsProvider(countryId));
        ref.invalidate(treasuryProvider(countryId));
      },
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Quick Proposal Bar
            Row(
              children: [
                const Icon(Icons.flash_on_rounded, size: 16, color: AppColors.cyan),
                const SizedBox(width: 6),
                Text('Fast Congress Proposals', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: AppColors.cyan)),
              ],
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildQuickLawBtn('Tax Food 5%', 'CHANGE_TAX', {'product': 'FOOD', 'vat': 5, 'importTax': 5}),
                  const SizedBox(width: 8),
                  _buildQuickLawBtn('Min Wage 30', 'SET_MIN_WAGE', {'amount': 30}),
                  const SizedBox(width: 8),
                  _buildQuickLawBtn('Print 50 Gold', 'PRINT_MONEY', {'goldInt': 50}),
                  const SizedBox(width: 8),
                  _buildQuickLawBtn('Deploy Hospital', 'DEPLOY_BUILDING', {'buildingType': 'HOSPITAL', 'quality': 1}),
                ],
              ),
            ),
            const SizedBox(height: 18),

            Text('Active Congressional Laws', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),

            lawsAsync.when(
              data: (laws) {
                if (laws.isEmpty) {
                  return TacticalCard(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Center(
                        child: Column(
                          children: [
                            const Icon(Icons.gavel_rounded, color: AppColors.textMuted, size: 36),
                            const SizedBox(height: 10),
                            Text('No active law proposals', style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 6),
                            const Text(
                              'Congressmen can propose tax reforms, minimum wages, or declarations of war.',
                              style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: laws.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final law = laws[index];
                    final id = law['id'] as String? ?? '';
                    final type = (law['type'] as String? ?? 'LAW').replaceAll('_', ' ');
                    final yesVotes = (law['yes'] as num?)?.toInt() ?? (law['yesVotes'] as num?)?.toInt() ?? 0;
                    final noVotes = (law['no'] as num?)?.toInt() ?? (law['noVotes'] as num?)?.toInt() ?? 0;
                    final total = yesVotes + noVotes;
                    final yesPct = total > 0 ? (yesVotes / total) : 0.5;

                    return TacticalCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  type,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.purple),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Yes: $yesVotes • No: $noVotes',
                                style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          // Consensus Progress Bar
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: SizedBox(
                              height: 6,
                              child: LinearProgressIndicator(
                                value: yesPct,
                                backgroundColor: AppColors.crimson,
                                valueColor: const AlwaysStoppedAnimation<Color>(AppColors.emerald),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () => _voteLaw(id, true),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.emerald,
                                    side: const BorderSide(color: AppColors.emerald),
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                  ),
                                  child: const Text('In Favor', overflow: TextOverflow.ellipsis),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: () => _voteLaw(id, false),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: AppColors.crimson,
                                    side: const BorderSide(color: AppColors.crimson),
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                  ),
                                  child: const Text('Against', overflow: TextOverflow.ellipsis),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: AppColors.cyan))),
              error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(activeLawsProvider(countryId)))),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickLawBtn(String label, String type, Map<String, dynamic> payload) {
    return ActionChip(
      avatar: const Icon(Icons.add_rounded, size: 14, color: AppColors.cyan),
      label: Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textPrimary)),
      backgroundColor: AppColors.surfaceElevated,
      side: const BorderSide(color: AppColors.border),
      onPressed: () async {
        try {
          await ref.read(politicsRepositoryProvider).proposeLaw(type, payload);
          final citizen = ref.read(citizenNotifierProvider).value;
          if (citizen != null) ref.invalidate(activeLawsProvider(citizen.countryId));
          if (mounted) {
            showSuccessPopup(context, 'Law proposal $label dispatched to Congress!');
          }
        } catch (e) {
          if (mounted) showErrorPopup(context, e, title: 'LAW PROPOSAL FAILED');
        }
      },
    );
  }

  // ===========================================================================
  // TAB 2: ELECTIONS
  // ===========================================================================
  Widget _buildElectionsTab(String countryId, AsyncValue<Map<String, dynamic>?> electionsAsync) {
    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(electionsProvider(countryId)),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        child: electionsAsync.when(
          data: (data) {
            final list = (data?['elections'] as List? ?? []).cast<Map<String, dynamic>>();
            final current = list.isNotEmpty ? list.first : null;

            if (current == null) {
              return TacticalCard(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(
                    child: Column(
                      children: [
                        const Icon(Icons.how_to_vote_rounded, color: AppColors.textMuted, size: 40),
                        const SizedBox(height: 10),
                        Text('No active election window open', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 6),
                        const Text(
                          'Candidature windows open on cycle days d2–4 (President), d12–14 (Party), and d21–23 (Congress).',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }

            final electionId = current['id'] as String? ?? '';
            final type = (current['type'] as String? ?? 'ELECTION').replaceAll('_', ' ');
            final status = current['status'] as String? ?? 'OPEN';
            final day = current['day'] ?? '?';
            final candidacies = (current['candidacies'] as List? ?? []).cast<Map<String, dynamic>>();

            final isCandidatureOpen = status == 'CANDIDATURE';
            final hasVoted = (current['hasVoted'] == true) || _votedElectionIds.contains(electionId);
            final votedCandidateId = current['votedCandidateId'] as String?;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TacticalCard(
                  borderColor: AppColors.cyan.withOpacity(0.5),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(type, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.cyan), overflow: TextOverflow.ellipsis),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: status == 'VOTING' ? AppColors.emerald.withOpacity(0.2) : AppColors.surfaceElevated,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: status == 'VOTING' ? AppColors.emerald : AppColors.border),
                            ),
                            child: Text(status, style: TextStyle(color: status == 'VOTING' ? AppColors.emerald : AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text('Election Day $day • Direct democratic ballot', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                      const SizedBox(height: 14),

                      PulseButton(
                        label: isCandidatureOpen ? 'Run For Office' : 'Candidacy Closed',
                        icon: Icons.campaign_rounded,
                        backgroundColor: isCandidatureOpen ? AppColors.cyan : AppColors.surfaceElevated,
                        foregroundColor: isCandidatureOpen ? Colors.black : AppColors.textMuted,
                        onPressed: isCandidatureOpen ? () => _openRunForOfficeDialog(electionId) : null,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),

                Text('Official Candidates', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 10),

                if (candidacies.isEmpty)
                  TacticalCard(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Center(
                        child: Text('No candidacies filed yet for this election.', style: Theme.of(context).textTheme.bodyMedium),
                      ),
                    ),
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: candidacies.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, idx) {
                      final c = candidacies[idx];
                      final cId = c['id'] as String? ?? '';
                      final citizenObj = c['citizen'] as Map<String, dynamic>? ?? {};
                      final nick = citizenObj['nickname'] as String? ?? 'Citizen';
                      final partyObj = c['party'] as Map<String, dynamic>?;
                      final partyName = partyObj != null ? partyObj['name'] as String? : null;
                      final isThisCandidateVoted = hasVoted && votedCandidateId == cId;

                      return TacticalCard(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 16,
                              backgroundColor: AppColors.cyan.withOpacity(0.2),
                              child: Text(nick.isNotEmpty ? nick[0].toUpperCase() : 'C', style: const TextStyle(color: AppColors.cyan, fontWeight: FontWeight.bold)),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(nick, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.textPrimary), overflow: TextOverflow.ellipsis),
                                  if (partyName != null)
                                    Text('Party: $partyName', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11), overflow: TextOverflow.ellipsis),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            if (status != 'VOTING')
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceElevated,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppColors.border),
                                ),
                                child: const Text('Voting Closed', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textMuted)),
                              )
                            else if (isThisCandidateVoted)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.emerald.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppColors.emerald.withOpacity(0.4)),
                                ),
                                child: const Text('Voted ✓', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.emerald)),
                              )
                            else if (hasVoted)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceElevated,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: AppColors.border),
                                ),
                                child: const Text('Ballot Cast', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textMuted)),
                              )
                            else
                              ElevatedButton.icon(
                                onPressed: _busy ? null : () => _voteCandidate(electionId, cId, nick),
                                icon: const Icon(Icons.how_to_vote_rounded, size: 14),
                                label: const Text('Vote', style: TextStyle(fontSize: 12)),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.emerald,
                                  foregroundColor: Colors.black,
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                ),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
              ],
            );
          },
          loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: AppColors.cyan))),
          error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(electionsProvider(countryId)))),
        ),
      ),
    );
  }

  void _openRunForOfficeDialog(String electionId) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceCard,
        title: const Text('Submit Candidacy', style: TextStyle(color: AppColors.textPrimary)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Enter your presidential / congressional presentation or political campaign pledge:', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'e.g. Lower taxes, invest in hospital infrastructure...'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ref.read(politicsRepositoryProvider).submitCandidacy(electionId, presentation: ctrl.text.trim());
                final citizen = ref.read(citizenNotifierProvider).value;
                if (citizen != null) ref.invalidate(electionsProvider(citizen.countryId));
                if (mounted) showSuccessPopup(context, 'Candidacy submitted successfully!');
              } catch (e) {
                if (mounted) showErrorPopup(context, e, title: 'CANDIDACY FAILED');
              }
            },
            child: const Text('Submit Candidacy'),
          ),
        ],
      ),
    );
  }

  void _voteCandidate(String electionId, String candidateId, String nickname) async {
    setState(() => _busy = true);
    try {
      await ref.read(politicsRepositoryProvider).voteElection(electionId, candidateId);
      setState(() => _votedElectionIds.add(electionId));
      final citizen = ref.read(citizenNotifierProvider).value;
      if (citizen != null) ref.invalidate(electionsProvider(citizen.countryId));
      if (mounted) showSuccessPopup(context, 'Vote cast for $nickname!');
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('already voted') || msg.contains('already cast')) {
        setState(() => _votedElectionIds.add(electionId));
      }
      if (mounted) showErrorPopup(context, e, title: 'VOTING FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ===========================================================================
  // TAB 3: PARTIES
  // ===========================================================================
  Widget _buildPartiesTab(String countryId) {
    final partiesAsync = ref.watch(partiesProvider(countryId));

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(partiesProvider(countryId)),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Party Actions
            Builder(
              builder: (context) {
                final partiesList = partiesAsync.asData?.value;
                final isMemberOfAny = (partiesList != null && partiesList.any((p) => p['isMember'] == true || p['hasAnyParty'] == true)) || _joinedPartyId != null;

                return Row(
                  children: [
                    Expanded(
                      child: PulseButton(
                        label: 'Found Party',
                        icon: Icons.add_circle_outline_rounded,
                        backgroundColor: AppColors.purple,
                        foregroundColor: Colors.white,
                        onPressed: _openFoundPartyDialog,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: (_busy || !isMemberOfAny) ? null : _leaveParty,
                        icon: const Icon(Icons.exit_to_app_rounded, size: 16),
                        label: const Text('Leave Party', overflow: TextOverflow.ellipsis),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: isMemberOfAny ? AppColors.crimson : AppColors.textMuted,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 18),

            Text('Registered Political Parties', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),

            partiesAsync.when(
              data: (parties) {
                if (parties.isEmpty) {
                  return TacticalCard(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Center(
                        child: Column(
                          children: [
                            const Icon(Icons.groups_rounded, color: AppColors.textMuted, size: 36),
                            const SizedBox(height: 10),
                            Text('No political parties found', style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 6),
                            const Text('Be the first citizen to found a political movement and contest national congress seats.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12), textAlign: TextAlign.center),
                          ],
                        ),
                      ),
                    ),
                  );
                }

                return ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: parties.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, idx) {
                    final p = parties[idx];
                    final pId = p['id'] as String? ?? '';
                    final pName = p['name'] as String? ?? 'Party';
                    final members = (p['_count'] as Map<String, dynamic>?)?['members'] ?? 0;
                    final leader = (p['leader'] as Map<String, dynamic>?)?['nickname'];
                    final isMember = p['isMember'] == true || _joinedPartyId == pId;
                    final hasAnyParty = p['hasAnyParty'] == true || _joinedPartyId != null;

                    return TacticalCard(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          const Icon(Icons.flag_rounded, color: AppColors.purple, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(pName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.textPrimary), overflow: TextOverflow.ellipsis),
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    Text('$members members', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                                    if (leader != null) ...[
                                      const Text(' • ', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                                      Expanded(
                                        child: Text('👑 $leader', style: const TextStyle(color: AppColors.amber, fontSize: 11), overflow: TextOverflow.ellipsis),
                                      ),
                                    ],
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (isMember)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: AppColors.emerald.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppColors.emerald.withOpacity(0.4)),
                              ),
                              child: const Text('Member ✓', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.emerald)),
                            )
                          else if (hasAnyParty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: const Text('In Other Party', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.textMuted)),
                            )
                          else
                            ElevatedButton(
                              onPressed: _busy ? null : () => _joinParty(pId, pName),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.cyan,
                                foregroundColor: Colors.black,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              ),
                              child: const Text('Join', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            ),
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: AppColors.cyan))),
              error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(partiesProvider(countryId)))),
            ),
          ],
        ),
      ),
    );
  }

  void _openFoundPartyDialog() {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceCard,
        title: const Text('Found Political Party', style: TextStyle(color: AppColors.textPrimary)),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(hintText: 'Party name (e.g. National Democratic Front)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final name = ctrl.text.trim();
              if (name.length < 3) return;
              Navigator.pop(ctx);
              try {
                await ref.read(politicsRepositoryProvider).createParty(name);
                final citizen = ref.read(citizenNotifierProvider).value;
                if (citizen != null) ref.invalidate(partiesProvider(citizen.countryId));
                if (mounted) showSuccessPopup(context, 'Party $name founded successfully!');
              } catch (e) {
                if (mounted) showErrorPopup(context, e, title: 'PARTY FOUNDATION FAILED');
              }
            },
            child: const Text('Create Party'),
          ),
        ],
      ),
    );
  }

  void _joinParty(String partyId, String partyName) async {
    setState(() => _busy = true);
    try {
      await ref.read(politicsRepositoryProvider).joinParty(partyId);
      setState(() => _joinedPartyId = partyId);
      final citizen = ref.read(citizenNotifierProvider).value;
      if (citizen != null) ref.invalidate(partiesProvider(citizen.countryId));
      if (mounted) showSuccessPopup(context, 'Joined $partyName!');
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('already in party')) {
        setState(() => _joinedPartyId = partyId);
      }
      if (mounted) showErrorPopup(context, e, title: 'JOIN PARTY FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _leaveParty() async {
    setState(() => _busy = true);
    try {
      await ref.read(politicsRepositoryProvider).leaveParty();
      setState(() => _joinedPartyId = null);
      final citizen = ref.read(citizenNotifierProvider).value;
      if (citizen != null) ref.invalidate(partiesProvider(citizen.countryId));
      if (mounted) showSuccessPopup(context, 'Resigned from current party.');
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'LEAVE PARTY FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ===========================================================================
  // TAB 4: NATIONAL RADIO CHAT
  // ===========================================================================
  Widget _buildChatTab(dynamic citizen) {
    final countryName = citizen?.countryName ?? "Nation";

    return Column(
      children: [
        // Live radio header bar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              const Icon(Icons.radio_rounded, color: AppColors.cyan, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Encrypted Radio // $countryName',
                  style: const TextStyle(color: AppColors.cyan, fontWeight: FontWeight.bold, fontSize: 13),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.emerald.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.emerald.withOpacity(0.4)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(width: 6, height: 6, decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.emerald)),
                    const SizedBox(width: 4),
                    const Text('LIVE', style: TextStyle(color: AppColors.emerald, fontSize: 9, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ],
          ),
        ),

        // Message stream
        Expanded(
          child: _messages.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.headset_mic_rounded, color: AppColors.textMuted.withOpacity(0.5), size: 48),
                        const SizedBox(height: 12),
                        const Text('National Dispatch Clear', style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        const Text('Send a broadcast dispatch to all active online citizens of your republic.', style: TextStyle(color: AppColors.textMuted, fontSize: 12), textAlign: TextAlign.center),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
                  controller: _chatScrollController,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  itemCount: _messages.length,
                  itemBuilder: (context, index) {
                    final m = _messages[index];
                    final author = m['author'] as Map<String, dynamic>? ?? {};
                    final name = author['nickname'] as String? ?? 'Citizen';
                    final text = m['content'] as String? ?? '';
                    final isMe = name == citizen?.nickname;

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Align(
                        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: isMe ? AppColors.cyan.withOpacity(0.15) : AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: isMe ? AppColors.cyan.withOpacity(0.4) : AppColors.border,
                              width: 1,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 11,
                                  color: isMe ? AppColors.cyan : AppColors.amber,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                text,
                                style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),

        // Send Input Bar
        Container(
          padding: EdgeInsets.only(
            left: 12,
            right: 12,
            top: 8,
            bottom: MediaQuery.of(context).padding.bottom + 8,
          ),
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _msgController,
                  onSubmitted: (_) => _sendMessage(),
                  decoration: const InputDecoration(
                    hintText: 'Broadcast encrypted dispatch...',
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _sendMessage,
                style: IconButton.styleFrom(backgroundColor: AppColors.cyan, foregroundColor: Colors.black),
                icon: const Icon(Icons.send_rounded, size: 18),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _sendMessage() async {
    final text = _msgController.text.trim();
    if (text.isEmpty) return;

    final citizen = ref.read(citizenNotifierProvider).value;
    if (citizen == null) return;

    final socket = await ref.read(socketServiceProvider).getChatSocket();
    socket.emit('country:message', {
      'countryId': citizen.countryId,
      'content': text,
    });

    _msgController.clear();
  }

  Future<void> _voteLaw(String lawId, bool yes) async {
    try {
      await ref.read(politicsRepositoryProvider).voteLaw(lawId, yes);
      final citizen = ref.read(citizenNotifierProvider).value;
      if (citizen != null) ref.invalidate(activeLawsProvider(citizen.countryId));
      if (mounted) {
        showSuccessPopup(context, 'Vote ${yes ? "IN FAVOR" : "AGAINST"} recorded on congressional record.');
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'CONGRESS VOTE FAILED');
      }
    }
  }

  void _showBroadcastDialog() {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Presidential Dispatch (24h)', style: TextStyle(color: AppColors.amber)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Broadcast an urgent executive message directly to all citizens of your nation for the next 24 hours.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              maxLines: 3,
              maxLength: 500,
              decoration: const InputDecoration(
                hintText: 'Enter dispatch text...',
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.amber, foregroundColor: Colors.black),
            onPressed: () async {
              final text = ctrl.text.trim();
              if (text.isEmpty) return;
              Navigator.pop(ctx);
              try {
                final dio = ref.read(dioProvider);
                await dio.post('/politics/broadcast', data: {'message': text});
                if (mounted) {
                  showSuccessPopup(context, 'Presidential dispatch broadcasted to all citizens!', title: 'DISPATCH TRANSMITTED');
                }
              } catch (e) {
                if (mounted) showErrorPopup(context, e, title: 'Broadcast Failed');
              }
            },
            child: const Text('Broadcast'),
          ),
        ],
      ),
    );
  }
}
