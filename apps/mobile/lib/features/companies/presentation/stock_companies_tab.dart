import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/stock_companies_repository.dart';
import 'stock_company_detail_screen.dart';

final stockCompaniesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(stockCompaniesRepositoryProvider);
  return repo.fetchStockCompanies();
});

final mySharesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(stockCompaniesRepositoryProvider);
  return repo.fetchMyShares();
});

class StockCompaniesTab extends ConsumerStatefulWidget {
  const StockCompaniesTab({super.key});

  @override
  ConsumerState<StockCompaniesTab> createState() => _StockCompaniesTabState();
}

class _StockCompaniesTabState extends ConsumerState<StockCompaniesTab> {
  final _searchCtrl = TextEditingController();
  final _newNameCtrl = TextEditingController();
  final _newSharesCtrl = TextEditingController(text: '1000');
  String _query = '';
  bool _busy = false;

  @override
  void dispose() {
    _searchCtrl.dispose();
    _newNameCtrl.dispose();
    _newSharesCtrl.dispose();
    super.dispose();
  }

  Future<void> _createJsc() async {
    final name = _newNameCtrl.text.trim();
    final shares = int.tryParse(_newSharesCtrl.text.trim()) ?? 1000;
    if (name.isEmpty) {
      showErrorPopup(context, 'Enter a valid corporate entity name.', title: 'Invalid Name');
      return;
    }

    setState(() => _busy = true);
    try {
      final repo = ref.read(stockCompaniesRepositoryProvider);
      await repo.createStockCompany(name: name, sharesTotal: shares);
      ref.invalidate(stockCompaniesProvider);
      ref.invalidate(mySharesProvider);
      ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        Navigator.pop(context);
        showSuccessPopup(
          context,
          '$name founded with $shares total shares issued.',
          title: 'Entity Incorporated',
        );
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'Incorporation Failed');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showCreateDialog() {
    final me = ref.read(citizenNotifierProvider).asData?.value;
    if ((me?.level ?? 1) < 13) {
      showErrorPopup(
        context,
        'You must reach Citizen Level 13 to incorporate a Joint-Stock Company.',
        title: 'Level 13 Required',
      );
      return;
    }

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Incorporate Joint-Stock Company', style: TextStyle(color: AppColors.cyan)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'JSC structures enable public share distribution, dividend payouts, and shareholder-governed CEO elections.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _newNameCtrl,
              decoration: const InputDecoration(labelText: 'Company Name', isDense: true),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _newSharesCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Initial Total Shares', isDense: true),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.cyan, foregroundColor: Colors.black),
            onPressed: _busy ? null : _createJsc,
            child: const Text('Incorporate'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final allAsync = ref.watch(stockCompaniesProvider);
    final mySharesAsync = ref.watch(mySharesProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async {
        ref.invalidate(stockCompaniesProvider);
        ref.invalidate(mySharesProvider);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header action
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'JOINT-STOCK EXCHANGE',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.cyan, letterSpacing: 0.5),
              ),
              OutlinedButton.icon(
                icon: const Icon(Icons.add_business_outlined, size: 16),
                label: const Text('Found JSC', style: TextStyle(fontSize: 12)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.cyan,
                  side: const BorderSide(color: AppColors.cyan),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                ),
                onPressed: _showCreateDialog,
              ),
            ],
          ),
          const SizedBox(height: 12),

          // My Shares section
          mySharesAsync.when(
            data: (shares) {
              if (shares.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('MY HOLDINGS & SHARES', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.amber)),
                  const SizedBox(height: 8),
                  ...shares.map((s) {
                    final jsc = s['jsc'] as Map? ?? {};
                    final jscId = jsc['id'] as String? ?? '';
                    final name = jsc['name'] as String? ?? 'Entity';
                    final qty = s['quantity'] as num? ?? 0;
                    final price = ((jsc['issuePrice'] as num? ?? 0) / 100.0);

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: TacticalCard(
                        padding: const EdgeInsets.all(12),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => StockCompanyDetailScreen(jscId: jscId)),
                          );
                        },
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: AppColors.amber.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(Icons.pie_chart_outline, color: AppColors.amber),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                  const SizedBox(height: 2),
                                  Text('$qty shares held · Par: ${price.toStringAsFixed(2)}g', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right, color: AppColors.cyan),
                          ],
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 16),
                ],
              );
            },
            loading: () => const LinearProgressIndicator(color: AppColors.cyan),
            error: (_, _) => const SizedBox.shrink(),
          ),

          // Search bar
          TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search companies by name or CEO...',
              prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.textMuted),
              suffixIcon: _query.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() => _query = '');
                      },
                    )
                  : null,
              isDense: true,
            ),
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
          const SizedBox(height: 12),

          // All JSC list
          allAsync.when(
            data: (list) {
              final filtered = list.where((item) {
                final name = (item['name'] as String? ?? '').toLowerCase();
                final ceo = ((item['ceo'] as Map?)?['nickname'] as String? ?? '').toLowerCase();
                return name.contains(_query) || ceo.contains(_query);
              }).toList();

              if (filtered.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        const Icon(Icons.business_outlined, size: 40, color: AppColors.textMuted),
                        const SizedBox(height: 8),
                        Text(
                          _query.isEmpty ? 'No Joint-Stock Companies Incorporated Yet' : 'No companies matching "$_query"',
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                );
              }

              return ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: filtered.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final jsc = filtered[index];
                  final jscId = jsc['id'] as String? ?? '';
                  final name = jsc['name'] as String? ?? 'Entity';
                  final ceo = (jsc['ceo'] as Map?)?['nickname'] as String? ?? 'CEO';
                  final totalShares = jsc['sharesTotal'] as num? ?? 0;
                  final treasury = ((jsc['treasuryGold'] as num? ?? 0) / 100.0);
                  final price = ((jsc['issuePrice'] as num? ?? 0) / 100.0);

                  return TacticalCard(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => StockCompanyDetailScreen(jscId: jscId)),
                      );
                    },
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.cyan.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(Icons.corporate_fare, color: AppColors.cyan),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                              const SizedBox(height: 2),
                              Text('CEO: $ceo · Total: $totalShares shares', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: AppColors.amber.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text('${treasury.toStringAsFixed(2)}g in vault', style: const TextStyle(color: AppColors.amber, fontSize: 10, fontWeight: FontWeight.bold)),
                                  ),
                                  const SizedBox(width: 6),
                                  Text('Par: ${price.toStringAsFixed(2)}g', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.textMuted),
                      ],
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
            error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: AppColors.crimson))),
          ),
        ],
      ),
    );
  }
}
