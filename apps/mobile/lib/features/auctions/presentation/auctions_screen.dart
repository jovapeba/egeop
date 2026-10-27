import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/money_pill.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/auctions_repository.dart';

final auctionsListProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(auctionsRepositoryProvider);
  return repo.fetchAuctions();
});

class AuctionsScreen extends ConsumerWidget {
  const AuctionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auctionsAsync = ref.watch(auctionsListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Auction House // High-Tier Gear')),
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async => ref.invalidate(auctionsListProvider),
        child: auctionsAsync.when(
          data: (auctions) {
            if (auctions.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.gavel_rounded, color: AppColors.textMuted, size: 48),
                      const SizedBox(height: 12),
                      Text('No Active Auctions', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 6),
                      const Text('List your Weapon Attachments or check back soon.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12), textAlign: TextAlign.center),
                    ],
                  ),
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: auctions.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final a = auctions[index];
                final id = a['id'] as String;
                final itemName = a['item']?['name'] as String? ?? a['itemKey'] as String? ?? 'Auction Lot';
                final quality = (a['item']?['quality'] as num?)?.toInt() ?? 1;
                final currentBid = (a['currentBidGold'] as num?)?.toDouble() ?? (a['startPriceGold'] as num?)?.toDouble() ?? 1.0;
                final bidder = a['highestBidder']?['nickname'] as String? ?? 'No bids yet';
                final minNextBid = (currentBid * 1.03).clamp(currentBid + 0.1, double.infinity);

                return TacticalCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(color: AppColors.amber.withOpacity(0.15), borderRadius: BorderRadius.circular(4)),
                                  child: Text('Q$quality', style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.bold, fontSize: 11)),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(itemName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: AppColors.crimson.withOpacity(0.15), borderRadius: BorderRadius.circular(4)),
                            child: const Text('30s ROLLBACK', style: TextStyle(color: AppColors.crimson, fontSize: 9, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Current Top Bid', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                              const SizedBox(height: 2),
                              MoneyPill(amount: currentBid, isGold: true),
                            ],
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                const Text('Leading Bidder', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                                Text(bidder,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.cyan),
                                    overflow: TextOverflow.ellipsis),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      () {
                        final citizen = ref.watch(citizenNotifierProvider).value;
                        final sellerId = a['sellerId'] as String?;
                        final currentBidderId = a['currentBidderId'] as String? ??
                            (a['bids'] as List?)?.firstOrNull?['bidderId'] as String?;
                        final endsAtStr = a['endsAt'] as String?;
                        final isExpired = endsAtStr != null &&
                            DateTime.tryParse(endsAtStr)?.isBefore(DateTime.now()) == true;

                        final isSeller = citizen != null && sellerId != null && sellerId == citizen.id;
                        final isTopBidder = citizen != null &&
                            currentBidderId != null &&
                            currentBidderId == citizen.id;
                        final notEnoughGold = citizen != null && citizen.gold < minNextBid;
                        final isProhibited = isSeller || isTopBidder || notEnoughGold || isExpired;

                        final label = isSeller
                            ? 'Your Auction Lot'
                            : isTopBidder
                                ? 'Leading Bidder ✓'
                                : isExpired
                                    ? 'Auction Expired'
                                    : notEnoughGold
                                        ? 'Need ${minNextBid.toStringAsFixed(1)} G'
                                        : 'Place Bid (${minNextBid.toStringAsFixed(1)} G min)';

                        return PulseButton(
                          label: label,
                          icon: isTopBidder ? Icons.check_circle_rounded : Icons.gavel_rounded,
                          backgroundColor: AppColors.surfaceElevated,
                          foregroundColor: isTopBidder
                              ? AppColors.emerald
                              : (isProhibited ? AppColors.textMuted : AppColors.amber),
                          onPressed: isProhibited
                              ? null
                              : () => _openBidDialog(context, ref, id, minNextBid),
                        );
                      }(),
                    ],
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
          error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(auctionsListProvider))),
        ),
      ),
    );
  }

  void _openBidDialog(BuildContext context, WidgetRef ref, String auctionId, double minBid) {
    final ctrl = TextEditingController(text: minBid.toStringAsFixed(1));

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Place Auction Bid'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Minimum bid required: ${minBid.toStringAsFixed(1)} Gold', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Bid Amount in Gold',
                suffixText: 'G',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final val = double.tryParse(ctrl.text.trim());
              if (val == null || val < minBid) return;
              Navigator.pop(ctx);

              try {
                await ref.read(auctionsRepositoryProvider).bid(auctionId, val);
                ref.invalidate(auctionsListProvider);
                await ref.read(citizenNotifierProvider.notifier).refresh();
                if (context.mounted) {
                  showSuccessPopup(
                    context,
                    'Bid of ${val.toStringAsFixed(1)} Gold placed!',
                    title: 'AUCTION BID RECORDED',
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  showErrorPopup(context, e, title: 'AUCTION BID FAILED');
                }
              }
            },
            child: const Text('Submit Bid'),
          ),
        ],
      ),
    );
  }
}
