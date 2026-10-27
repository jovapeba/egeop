import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/money_pill.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/economy_repository.dart';

final productMarketProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(economyRepositoryProvider);
  return repo.fetchProductMarket();
});

final monetaryMarketProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(economyRepositoryProvider);
  return repo.fetchMonetaryOffers();
});

class EconomyHubScreen extends ConsumerStatefulWidget {
  const EconomyHubScreen({super.key});

  @override
  ConsumerState<EconomyHubScreen> createState() => _EconomyHubScreenState();
}

class _EconomyHubScreenState extends ConsumerState<EconomyHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: Container(
          color: AppColors.surface,
          child: TabBar(
            controller: _tabController,
            indicatorColor: AppColors.cyan,
            indicatorWeight: 2,
            labelColor: AppColors.cyan,
            unselectedLabelColor: AppColors.textMuted,
            labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            tabs: const [
              Tab(text: 'Product Market'),
              Tab(text: 'Currency FX'),
              Tab(text: 'My Storage'),
            ],
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildProductMarket(),
          _buildMonetaryMarket(),
          _buildStorageView(),
        ],
      ),
    );
  }

  Widget _buildProductMarket() {
    final marketAsync = ref.watch(productMarketProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(productMarketProvider),
      child: marketAsync.when(
        data: (offers) {
          if (offers.isEmpty) {
            return const Center(child: Text('No active market listings'));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: offers.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final o = offers[index];
              final product = o['product'] as String? ?? 'GOOD';
              final quality = (o['quality'] as num?)?.toInt() ?? 1;
              final stock = (o['stock'] as num?)?.toInt() ?? 0;
              final price = (o['unitPrice'] as num?)?.toDouble() ?? 0.0;

              return TacticalCard(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Q$quality',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.cyan),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(product, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          Text('Available: $stock units', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        MoneyPill(amount: price, isGold: false),
                        const SizedBox(height: 6),
                        () {
                          final citizen = ref.watch(citizenNotifierProvider).value;
                          final canAffordOne = citizen == null || citizen.walletFiat >= price;
                          final isOutOfStock = stock <= 0;
                          final isProhibited = isOutOfStock || !canAffordOne;

                          final btnLabel = isOutOfStock
                              ? 'Sold Out'
                              : !canAffordOne
                                  ? 'Low Funds'
                                  : 'Buy';

                          return SizedBox(
                            height: 32,
                            child: ElevatedButton(
                              onPressed: isProhibited ? null : () => _buyModal(o['id'] as String, product, quality, stock, price),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: isProhibited ? AppColors.surfaceElevated : AppColors.cyan,
                                foregroundColor: isProhibited ? AppColors.textMuted : Colors.black,
                                padding: const EdgeInsets.symmetric(horizontal: 14),
                              ),
                              child: Text(btnLabel, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            ),
                          );
                        }(),
                      ],
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(productMarketProvider))),
      ),
    );
  }

  Widget _buildMonetaryMarket() {
    final fxAsync = ref.watch(monetaryMarketProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(monetaryMarketProvider),
      child: fxAsync.when(
        data: (offers) {
          if (offers.isEmpty) {
            return const Center(child: Text('No active currency exchange orders'));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: offers.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final o = offers[index];
              final sellAsset = o['sellAsset'] as String? ?? 'GOLD';
              final buyAsset = o['buyAsset'] as String? ?? 'FIAT';
              final rate = (o['rate'] as num?)?.toDouble() ?? 1.0;
              final amount = (o['sellAmount'] as num?)?.toDouble() ?? 0.0;

              return TacticalCard(
                padding: const EdgeInsets.all(14),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(sellAsset, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.amber)),
                              const SizedBox(width: 4),
                              const Icon(Icons.arrow_forward_rounded, size: 14, color: AppColors.textMuted),
                              const SizedBox(width: 4),
                              Text(buyAsset, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.emerald)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text('Rate: 1 $sellAsset = ${rate.toStringAsFixed(4)} $buyAsset',
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                              overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${amount.toStringAsFixed(2)} $sellAsset',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(monetaryMarketProvider))),
      ),
    );
  }

  Widget _buildStorageView() {
    final storageAsync = ref.watch(storageProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(storageProvider),
      child: storageAsync.when(
        data: (items) {
          if (items.isEmpty) {
            return const Center(child: Text('Storage is empty. Purchase goods from the market.'));
          }

          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.6,
            ),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final it = items[index];
              final product = it['product'] as String? ?? 'ITEM';
              final quality = (it['quality'] as num?)?.toInt() ?? 1;
              final qty = (it['quantity'] as num?)?.toInt() ?? 0;

              return TacticalCard(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            product,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(color: AppColors.cyan.withOpacity(0.15), borderRadius: BorderRadius.circular(4)),
                          child: Text('Q$quality', style: const TextStyle(color: AppColors.cyan, fontSize: 10, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text('$qty units', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.emerald)),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(storageProvider))),
      ),
    );
  }

  void _buyModal(String id, String product, int quality, int stock, double price) {
    int qty = 1;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setMState) => Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          padding: const EdgeInsets.all(20),
          child: SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Purchase $product Q$quality', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                Text('Price per unit: ${price.toStringAsFixed(2)} CC'),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Quantity:'),
                    Row(
                      children: [
                        IconButton(
                          onPressed: qty > 1 ? () => setMState(() => qty--) : null,
                          icon: const Icon(Icons.remove_circle_outline),
                        ),
                        Text('$qty', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        IconButton(
                          onPressed: qty < stock ? () => setMState(() => qty++) : null,
                          icon: const Icon(Icons.add_circle_outline),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                () {
                  final citizen = ref.watch(citizenNotifierProvider).value;
                  final totalCost = price * qty;
                  final canAfford = citizen == null || citizen.walletFiat >= totalCost;

                  return PulseButton(
                    label: canAfford
                        ? 'Confirm Purchase (${totalCost.toStringAsFixed(2)} CC)'
                        : 'Insufficient Funds (${totalCost.toStringAsFixed(2)} CC)',
                    backgroundColor: canAfford ? AppColors.cyan : AppColors.surfaceElevated,
                    foregroundColor: canAfford ? Colors.black : AppColors.textMuted,
                    onPressed: !canAfford
                        ? null
                        : () async {
                            Navigator.pop(ctx);
                            try {
                              await ref.read(economyRepositoryProvider).buyProduct(id, qty);
                              ref.invalidate(productMarketProvider);
                              ref.invalidate(storageProvider);
                              await ref.read(citizenNotifierProvider.notifier).refresh();
                              if (mounted) {
                                showSuccessPopup(
                                  context,
                                  'Purchase completed! Items added to storage.',
                                  title: 'PURCHASE EXECUTED',
                                );
                              }
                            } catch (e) {
                              if (mounted) {
                                showErrorPopup(context, e, title: 'PURCHASE ORDER FAILED');
                              }
                            }
                          },
                  );
                }(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
