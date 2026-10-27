import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../../core/widgets/rating_widget.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/stock_companies_repository.dart';

final stockDetailProvider = FutureProvider.family.autoDispose<Map<String, dynamic>, String>((ref, id) async {
  final repo = ref.watch(stockCompaniesRepositoryProvider);
  return repo.fetchStockDetail(id);
});

class StockCompanyDetailScreen extends ConsumerStatefulWidget {
  final String jscId;
  const StockCompanyDetailScreen({super.key, required this.jscId});

  @override
  ConsumerState<StockCompanyDetailScreen> createState() => _StockCompanyDetailScreenState();
}

class _StockCompanyDetailScreenState extends ConsumerState<StockCompanyDetailScreen> {
  final _qtyCtrl = TextEditingController(text: '10');
  final _priceCtrl = TextEditingController(text: '1.0');
  final _pollValCtrl = TextEditingController(text: '50');
  final _donateCtrl = TextEditingController(text: '10');
  String _orderSide = 'BUY';
  String _selectedPollKind = 'DIVIDENDS';
  bool _busy = false;

  @override
  void dispose() {
    _qtyCtrl.dispose();
    _priceCtrl.dispose();
    _pollValCtrl.dispose();
    _donateCtrl.dispose();
    super.dispose();
  }

  Future<void> _placeOrder() async {
    final qty = int.tryParse(_qtyCtrl.text.trim()) ?? 0;
    final price = double.tryParse(_priceCtrl.text.trim()) ?? 0.0;
    if (qty <= 0 || price <= 0) {
      showErrorPopup(context, 'Enter a valid quantity and unit price.', title: 'Invalid Order');
      return;
    }

    setState(() => _busy = true);
    try {
      final repo = ref.read(stockCompaniesRepositoryProvider);
      await repo.createOrder(
        jscId: widget.jscId,
        side: _orderSide,
        quantity: qty,
        price: price,
      );
      ref.invalidate(stockDetailProvider(widget.jscId));
      ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(
          context,
          '$_orderSide order for $qty shares @ ${price.toStringAsFixed(2)}g placed successfully.',
          title: 'Order Executed',
        );
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'Order Failed');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelOrder(String orderId) async {
    setState(() => _busy = true);
    try {
      final repo = ref.read(stockCompaniesRepositoryProvider);
      await repo.cancelOrder(orderId);
      ref.invalidate(stockDetailProvider(widget.jscId));
      ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Order was removed from exchange book.', title: 'Cancelled');
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'Error');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _votePoll(String pollId, bool yes) async {
    setState(() => _busy = true);
    try {
      final repo = ref.read(stockCompaniesRepositoryProvider);
      await repo.votePoll(pollId: pollId, yes: yes);
      ref.invalidate(stockDetailProvider(widget.jscId));
      if (mounted) {
        showSuccessPopup(context, 'Voted ${yes ? "YES" : "NO"} using your shares.', title: 'Ballot Cast');
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'Voting Failed');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _proposePoll() async {
    final val = double.tryParse(_pollValCtrl.text.trim()) ?? 0.0;
    if (val <= 0) {
      showErrorPopup(context, 'Enter a positive numeric payload.', title: 'Invalid Value');
      return;
    }

    setState(() => _busy = true);
    try {
      final repo = ref.read(stockCompaniesRepositoryProvider);
      final payload = <String, dynamic>{};
      if (_selectedPollKind == 'DIVIDENDS') payload['totalGold'] = val;
      if (_selectedPollKind == 'ISSUE_SHARES') payload['quantity'] = val.toInt();
      if (_selectedPollKind == 'SET_PRICE') payload['priceGold'] = val;

      await repo.proposePoll(jscId: widget.jscId, kind: _selectedPollKind, payload: payload);
      ref.invalidate(stockDetailProvider(widget.jscId));
      if (mounted) {
        showSuccessPopup(context, 'Shareholder ballot opened for voting.', title: 'Proposal Submitted');
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'Proposal Error');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _donateGold() async {
    final g = double.tryParse(_donateCtrl.text.trim()) ?? 0.0;
    if (g <= 0) return;

    setState(() => _busy = true);
    try {
      final repo = ref.read(stockCompaniesRepositoryProvider);
      await repo.donateGold(jscId: widget.jscId, gold: g);
      ref.invalidate(stockDetailProvider(widget.jscId));
      ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        Navigator.pop(context);
        showSuccessPopup(context, 'Donated ${g.toStringAsFixed(2)}g to company treasury.', title: 'Donation Completed');
      }
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e, title: 'Donation Error');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detailAsync = ref.watch(stockDetailProvider(widget.jscId));
    final me = ref.watch(citizenNotifierProvider).asData?.value;

    return Scaffold(
      appBar: AppBar(
        title: const Text('JSC Terminal'),
        actions: [
          IconButton(
            icon: const Icon(Icons.volunteer_activism_outlined, color: AppColors.amber),
            tooltip: 'Donate Gold',
            onPressed: () => _showDonationDialog(),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(stockDetailProvider(widget.jscId)),
          ),
        ],
      ),
      body: detailAsync.when(
        data: (detail) {
          final name = detail['name'] as String? ?? 'Joint Stock Company';
          final ceoNickname = (detail['ceo'] as Map?)?['nickname'] as String? ?? 'Unknown';
          final ceoId = detail['ceoId'] as String? ?? '';
          final totalShares = detail['sharesTotal'] as num? ?? 0;
          final treasury = ((detail['treasuryGold'] as num? ?? 0) / 100.0);
          final issuePrice = ((detail['issuePrice'] as num? ?? 0) / 100.0);
          final orders = (detail['orders'] as List? ?? []).cast<Map<String, dynamic>>();
          final polls = (detail['polls'] as List? ?? []).cast<Map<String, dynamic>>();
          final sharesList = (detail['shares'] as List? ?? []).cast<Map<String, dynamic>>();

          final myShareEntry = sharesList.firstWhere(
            (s) => s['holder']?['id'] == me?.id,
            orElse: () => <String, dynamic>{},
          );
          final myHolding = (myShareEntry['quantity'] as num?)?.toInt() ?? 0;
          final isCeo = me?.id == ceoId;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Company Header Card
              TacticalCard(
                borderColor: AppColors.cyan,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.account_balance_outlined, color: AppColors.cyan, size: 28),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                              const SizedBox(height: 2),
                              Row(
                                children: [
                                  Text('CEO: $ceoNickname ${isCeo ? "★ (You)" : ""}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                                  const SizedBox(width: 8),
                                  RatingWidget(targetType: 'STOCK_COMPANY', targetId: widget.jscId, compact: true),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.amber.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: AppColors.amber),
                          ),
                          child: Text('${treasury.toStringAsFixed(2)}g', style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _metric('Total Shares', '$totalShares'),
                        _metric('Issue Price', '${issuePrice.toStringAsFixed(2)}g'),
                        _metric('My Holding', '$myHolding shares'),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Trading Terminal Card
              TacticalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('EXCHANGE ORDER BOOK', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.cyan)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: ChoiceChip(
                            label: const Center(child: Text('BUY SHARES')),
                            selected: _orderSide == 'BUY',
                            selectedColor: AppColors.emerald.withValues(alpha: 0.25),
                            labelStyle: TextStyle(
                              color: _orderSide == 'BUY' ? AppColors.emerald : AppColors.textMuted,
                              fontWeight: FontWeight.bold,
                            ),
                            onSelected: (_) => setState(() => _orderSide = 'BUY'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ChoiceChip(
                            label: const Center(child: Text('SELL SHARES')),
                            selected: _orderSide == 'SELL',
                            selectedColor: AppColors.crimson.withValues(alpha: 0.25),
                            labelStyle: TextStyle(
                              color: _orderSide == 'SELL' ? AppColors.crimson : AppColors.textMuted,
                              fontWeight: FontWeight.bold,
                            ),
                            onSelected: (_) => setState(() => _orderSide = 'SELL'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _qtyCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Quantity (Shares)',
                              isDense: true,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: _priceCtrl,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(
                              labelText: 'Unit Price (Gold)',
                              isDense: true,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '⚡ 1% brokerage fee applies when purchasing shares on market.',
                      style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                    ),
                    const SizedBox(height: 12),
                    PulseButton(
                      label: 'PLACE $_orderSide ORDER',
                      backgroundColor: _orderSide == 'BUY' ? AppColors.emerald : AppColors.crimson,
                      foregroundColor: Colors.white,
                      isLoading: _busy,
                      onPressed: _placeOrder,
                    ),
                    const SizedBox(height: 16),
                    const Divider(color: AppColors.border),
                    const SizedBox(height: 8),
                    const Text('ACTIVE ORDERS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.cyan)),
                    const SizedBox(height: 8),
                    if (orders.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No active orders on exchange book.', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                      )
                    else
                      ...orders.map((o) {
                        final isMyOrder = o['ownerId'] == me?.id;
                        final isBuy = o['side'] == 'BUY';
                        final orderPrice = ((o['price'] as num? ?? 0) / 100.0);
                        final remaining = o['remaining'] as num? ?? 0;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: isBuy ? AppColors.emerald.withValues(alpha: 0.3) : AppColors.crimson.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: isBuy ? AppColors.emerald.withValues(alpha: 0.2) : AppColors.crimson.withValues(alpha: 0.2),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      o['side'] ?? 'BUY',
                                      style: TextStyle(
                                        color: isBuy ? AppColors.emerald : AppColors.crimson,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text('$remaining shares @ ${orderPrice.toStringAsFixed(2)}g', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                ],
                              ),
                              if (isMyOrder)
                                SizedBox(
                                  height: 28,
                                  child: OutlinedButton(
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: AppColors.crimson,
                                      padding: const EdgeInsets.symmetric(horizontal: 8),
                                      side: const BorderSide(color: AppColors.crimson),
                                    ),
                                    onPressed: _busy ? null : () => _cancelOrder(o['id']),
                                    child: const Text('Cancel', style: TextStyle(fontSize: 11)),
                                  ),
                                ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Shareholder Governance & Polls Card
              TacticalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('SHAREHOLDER GOVERNANCE (50%+1)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.cyan)),
                    const SizedBox(height: 12),
                    if (isCeo) ...[
                      const Text('CEO BALLOT PROPOSALS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.amber)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              initialValue: _selectedPollKind,
                              decoration: const InputDecoration(isDense: true, labelText: 'Poll Motion'),
                              items: const [
                                DropdownMenuItem(value: 'DIVIDENDS', child: Text('Pay Dividends')),
                                DropdownMenuItem(value: 'ISSUE_SHARES', child: Text('Issue Shares')),
                                DropdownMenuItem(value: 'SET_PRICE', child: Text('Set Share Price')),
                              ],
                              onChanged: (v) {
                                if (v != null) setState(() => _selectedPollKind = v);
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _pollValCtrl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: const InputDecoration(isDense: true, labelText: 'Amount / Qty'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.how_to_vote_outlined, size: 16),
                          label: const Text('Launch 48h Shareholder Poll'),
                          onPressed: _busy ? null : _proposePoll,
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    const Text('OPEN SHAREHOLDER POLLS', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.cyan)),
                    const SizedBox(height: 8),
                    if (polls.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('No active shareholder votes.', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                      )
                    else
                      ...polls.map((p) {
                        final kind = p['kind'] as String? ?? 'PROPOSAL';
                        final yesW = p['yesWeight'] as num? ?? 0;
                        final noW = p['noWeight'] as num? ?? 0;
                        final totalW = yesW + noW;
                        final yesPct = totalW > 0 ? (yesW / totalW) : 0.0;

                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceElevated,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(kind.replaceAll('_', ' '), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.amber)),
                                  Text('Yes ${(yesPct * 100).toStringAsFixed(0)}%', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                                ],
                              ),
                              const SizedBox(height: 6),
                              LinearProgressIndicator(
                                value: yesPct,
                                backgroundColor: AppColors.crimson.withValues(alpha: 0.3),
                                color: AppColors.emerald,
                                minHeight: 6,
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text('YES: $yesW shares', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                                  Text('NO: $noW shares', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                                ],
                              ),
                              const SizedBox(height: 10),
                              if (myHolding > 0)
                                Row(
                                  children: [
                                    Expanded(
                                      child: OutlinedButton(
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: AppColors.emerald,
                                          side: const BorderSide(color: AppColors.emerald),
                                        ),
                                        onPressed: _busy ? null : () => _votePoll(p['id'], true),
                                        child: const Text('VOTE YES'),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: OutlinedButton(
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: AppColors.crimson,
                                          side: const BorderSide(color: AppColors.crimson),
                                        ),
                                        onPressed: _busy ? null : () => _votePoll(p['id'], false),
                                        child: const Text('VOTE NO'),
                                      ),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                        );
                      }),
                  ],
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: Text('Error loading JSC: $e', style: const TextStyle(color: AppColors.crimson))),
      ),
    );
  }

  void _showDonationDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Donate Gold to Company', style: TextStyle(color: AppColors.amber)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Donated gold enters the company treasury for expansion, worker salaries, and shareholder dividends.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _donateCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Gold Amount'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.amber, foregroundColor: Colors.black),
            onPressed: _busy ? null : _donateGold,
            child: const Text('Donate Gold'),
          ),
        ],
      ),
    );
  }

  Widget _metric(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
      ],
    );
  }
}
