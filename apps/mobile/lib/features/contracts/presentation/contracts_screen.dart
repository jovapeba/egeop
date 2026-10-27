import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/contracts_repository.dart';

final contractsListProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(contractsRepositoryProvider);
  return repo.fetchContracts();
});

final contractsAuditProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(contractsRepositoryProvider);
  return repo.fetchAudit();
});

class ContractsScreen extends ConsumerStatefulWidget {
  const ContractsScreen({super.key});

  @override
  ConsumerState<ContractsScreen> createState() => _ContractsScreenState();
}

class _ContractsScreenState extends ConsumerState<ContractsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _loanAmountCtrl = TextEditingController(text: '10');
  final _loanDaysCtrl = TextEditingController(text: '7');
  final _loanInterestCtrl = TextEditingController(text: '10');
  final _packAmountCtrl = TextEditingController(text: '50');
  final _packPriceCtrl = TextEditingController(text: '55');
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _loanAmountCtrl.dispose();
    _loanDaysCtrl.dispose();
    _loanInterestCtrl.dispose();
    _packAmountCtrl.dispose();
    _packPriceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Contracts & Loans'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.cyan,
          labelColor: AppColors.cyan,
          unselectedLabelColor: AppColors.textMuted,
          tabs: const [
            Tab(text: 'Open Contracts'),
            Tab(text: 'Create Contract'),
            Tab(text: 'Audit Log'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildOpenContractsTab(),
          _buildCreateContractTab(),
          _buildAuditTab(),
        ],
      ),
    );
  }

  Widget _buildOpenContractsTab() {
    final contractsAsync = ref.watch(contractsListProvider);
    final citizenAsync = ref.watch(citizenNotifierProvider);
    final myId = citizenAsync.value?.id;

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(contractsListProvider),
      child: contractsAsync.when(
        data: (contracts) {
          if (contracts.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('No open contracts currently listed.', style: TextStyle(color: AppColors.textMuted)),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: contracts.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final c = contracts[index];
              final id = c['id'] as String;
              final type = c['type'] as String? ?? 'LOAN';
              final status = c['status'] as String? ?? 'OPEN';
              final creatorId = c['creatorId'] as String? ?? '';
              final counterpartyId = c['counterpartyId'] as String? ?? '';
              final amount = ((c['amountGold'] as num?)?.toDouble() ?? 0) / 100;
              final totalDue = ((c['totalDueGold'] as num?)?.toDouble() ?? 0) / 100;
              final days = c['durationDays'] as int? ?? 7;
              final interest = c['interestPct'] as int? ?? 10;

              final isLoan = type == 'LOAN';
              final canAccept = status == 'OPEN' && creatorId != myId;
              final canRepay = status == 'ACCEPTED' && counterpartyId == myId && isLoan;

              return TacticalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: isLoan ? AppColors.cyan.withOpacity(0.15) : AppColors.amber.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(type, style: TextStyle(color: isLoan ? AppColors.cyan : AppColors.amber, fontWeight: FontWeight.bold, fontSize: 10)),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: status == 'OPEN' ? AppColors.emerald.withOpacity(0.15) : AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(status, style: TextStyle(color: status == 'OPEN' ? AppColors.emerald : AppColors.textSecondary, fontWeight: FontWeight.bold, fontSize: 10)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (isLoan)
                      Text(
                        '${amount.toStringAsFixed(2)}g Loan • $days Days • $interest% Interest\nRepayment Due: ${totalDue.toStringAsFixed(2)}g',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, height: 1.4),
                      )
                    else
                      Text(
                        'Pack Sale: ${amount.toStringAsFixed(2)}g Gold for ${totalDue.toStringAsFixed(2)}g',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    if (canAccept || canRepay) ...[
                      const SizedBox(height: 12),
                      if (canAccept)
                        ElevatedButton.icon(
                          icon: const Icon(Icons.handshake_rounded, size: 16),
                          label: const Text('Accept Contract'),
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.cyan, foregroundColor: Colors.black),
                          onPressed: _busy ? null : () => _acceptContract(id),
                        ),
                      if (canRepay)
                        ElevatedButton.icon(
                          icon: const Icon(Icons.payment_rounded, size: 16),
                          label: Text('Repay ${totalDue.toStringAsFixed(2)}g'),
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald, foregroundColor: Colors.black),
                          onPressed: _busy ? null : () => _repayContract(id),
                        ),
                    ],
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(contractsListProvider))),
      ),
    );
  }

  Widget _buildCreateContractTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Loan Form Card
          TacticalCard(
            borderColor: AppColors.cyan.withOpacity(0.3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: AppColors.cyan.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
                      child: const Icon(Icons.account_balance_wallet_rounded, color: AppColors.cyan, size: 20),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('Offer Money Loan (Escrowed)', style: Theme.of(context).textTheme.titleMedium, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _loanAmountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Loan Principal (Gold)', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _loanDaysCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Duration (Days)', border: OutlineInputBorder()),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _loanInterestCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Interest (%)', border: OutlineInputBorder()),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                PulseButton(
                  label: 'List Escrowed Loan',
                  icon: Icons.check_circle_rounded,
                  backgroundColor: AppColors.cyan,
                  foregroundColor: Colors.black,
                  onPressed: _busy ? null : _createLoan,
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Pack Sale Form Card
          TacticalCard(
            borderColor: AppColors.amber.withOpacity(0.3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: AppColors.amber.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
                      child: const Icon(Icons.card_giftcard_rounded, color: AppColors.amber, size: 20),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('Direct Pack Sale', style: Theme.of(context).textTheme.titleMedium, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _packAmountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Gold in Pack', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _packPriceCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Asking Price (Gold)', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 14),
                PulseButton(
                  label: 'List Pack Sale',
                  icon: Icons.shopping_cart_checkout_rounded,
                  backgroundColor: AppColors.amber,
                  foregroundColor: Colors.black,
                  onPressed: _busy ? null : _createPack,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAuditTab() {
    final auditAsync = ref.watch(contractsAuditProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(contractsAuditProvider),
      child: auditAsync.when(
        data: (logs) {
          if (logs.isEmpty) {
            return const Center(child: Text('No public contract events recorded yet.', style: TextStyle(color: AppColors.textMuted)));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: logs.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final a = logs[index];
              final note = a['note'] as String? ?? '';
              final time = a['at'] as String? ?? '';

              return TacticalCard(
                padding: const EdgeInsets.all(10),
                child: Row(
                  children: [
                    const Icon(Icons.history_edu_rounded, size: 18, color: AppColors.cyan),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(note, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                          Text(time, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
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
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(contractsAuditProvider))),
      ),
    );
  }

  void _createLoan() async {
    final amount = double.tryParse(_loanAmountCtrl.text.trim()) ?? 10.0;
    final days = int.tryParse(_loanDaysCtrl.text.trim()) ?? 7;
    final interest = double.tryParse(_loanInterestCtrl.text.trim()) ?? 10.0;
    setState(() => _busy = true);
    try {
      await ref.read(contractsRepositoryProvider).createLoan(amountGold: amount, durationDays: days, interestPct: interest);
      ref.invalidate(contractsListProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      _tabController.animateTo(0);
      if (mounted) {
        showSuccessPopup(context, 'Loan listed with immediate escrow!', title: 'LOAN LISTED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'LOAN CREATION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _createPack() async {
    final amount = double.tryParse(_packAmountCtrl.text.trim()) ?? 50.0;
    final price = double.tryParse(_packPriceCtrl.text.trim()) ?? 55.0;
    setState(() => _busy = true);
    try {
      await ref.read(contractsRepositoryProvider).createPack(amountGold: amount, priceGold: price);
      ref.invalidate(contractsListProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      _tabController.animateTo(0);
      if (mounted) {
        showSuccessPopup(context, 'Pack listed for sale!', title: 'PACK LISTED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'PACK LISTING FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _acceptContract(String id) async {
    setState(() => _busy = true);
    try {
      await ref.read(contractsRepositoryProvider).acceptContract(id);
      ref.invalidate(contractsListProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Contract accepted!', title: 'CONTRACT ACCEPTED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'ACCEPTANCE FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _repayContract(String id) async {
    setState(() => _busy = true);
    try {
      await ref.read(contractsRepositoryProvider).repayContract(id);
      ref.invalidate(contractsListProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Loan settled and repaid!', title: 'LOAN REPAID');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'REPAYMENT FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
