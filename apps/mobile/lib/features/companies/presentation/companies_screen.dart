import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../../map/presentation/world_map_screen.dart';
import '../data/companies_repository.dart';
import 'stock_companies_tab.dart';

final myCompaniesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(companiesRepositoryProvider);
  return repo.fetchMyCompanies();
});

final marketCompaniesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(companiesRepositoryProvider);
  return repo.fetchMarketCompanies();
});

class CompaniesScreen extends ConsumerStatefulWidget {
  const CompaniesScreen({super.key});

  @override
  ConsumerState<CompaniesScreen> createState() => _CompaniesScreenState();
}

class _CompaniesScreenState extends ConsumerState<CompaniesScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _nameCtrl = TextEditingController();
  final _salaryCtrl = TextEditingController(text: '25');
  final _minEcoCtrl = TextEditingController(text: '1.0');
  final _salePriceCtrl = TextEditingController(text: '15');
  String _selectedProduct = 'FOOD';
  String? _selectedRegionId;
  String? _selectedCompanyId;
  bool _busy = false;

  static const _rawProducts = ['GRAIN', 'SUGAR', 'GUNPOWDER', 'STONE', 'WOOD', 'PETROL'];
  static const _mfgProducts = ['FOOD', 'AMMO', 'ENERGY_DRINK', 'TICKET', 'PANTRY', 'FRIDGE', 'HOSPITAL', 'FORTIFICATION'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _nameCtrl.dispose();
    _salaryCtrl.dispose();
    _minEcoCtrl.dispose();
    _salePriceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Companies & Industry'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: AppColors.cyan,
          labelColor: AppColors.cyan,
          unselectedLabelColor: AppColors.textMuted,
          tabs: const [
            Tab(text: 'My Companies'),
            Tab(text: 'Found (20g)'),
            Tab(text: 'For Sale'),
            Tab(text: 'Stocks (JSC)'),
            Tab(text: 'Production Chain'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildMyCompaniesTab(),
          _buildFoundCompanyTab(),
          _buildForSaleTab(),
          const StockCompaniesTab(),
          _buildProductionChainTab(),
        ],
      ),
    );
  }

  Widget _buildMyCompaniesTab() {
    final companiesAsync = ref.watch(myCompaniesProvider);
    final storageAsync = ref.watch(storageProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(myCompaniesProvider),
      child: companiesAsync.when(
        data: (companies) {
          if (companies.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.factory_outlined, size: 48, color: AppColors.textMuted),
                    const SizedBox(height: 12),
                    Text('No Companies Owned', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 6),
                    const Text('Found an industrial enterprise for 20g in the "Found" tab.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12), textAlign: TextAlign.center),
                  ],
                ),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: companies.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final c = companies[index];
              final id = c['id'] as String;
              final name = c['name'] as String? ?? 'Enterprise';
              final product = c['product'] as String? ?? 'GOODS';
              final quality = c['quality'] as int? ?? 1;
              final region = c['region']?['name'] as String? ?? '';
              final wallet = ((c['fiatWallet'] as num?)?.toDouble() ?? 0) / 100;
              final isExpanded = _selectedCompanyId == id;

              return TacticalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15), overflow: TextOverflow.ellipsis),
                              const SizedBox(height: 2),
                              Text('$product Q$quality • $region', style: const TextStyle(color: AppColors.cyan, fontSize: 12, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(color: AppColors.amber.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
                          child: Text('${wallet.toStringAsFixed(2)} CC', style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.bold, fontSize: 12)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            icon: const Icon(Icons.tune_rounded, size: 16),
                            label: Text(isExpanded ? 'Close' : 'Manage'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.cyan,
                              side: const BorderSide(color: AppColors.cyan, width: 0.8),
                            ),
                            onPressed: () => setState(() => _selectedCompanyId = isExpanded ? null : id),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            icon: const Icon(Icons.arrow_upward_rounded, size: 16),
                            label: const Text('Upgrade'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.surfaceElevated,
                              foregroundColor: AppColors.emerald,
                            ),
                            onPressed: _busy ? null : () => _upgradeCompany(id),
                          ),
                        ),
                      ],
                    ),
                    if (isExpanded) ...[
                      const Divider(color: AppColors.border, height: 24),
                      // Post Job row
                      const Text('Post Employment Job:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.textSecondary)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _minEcoCtrl,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              decoration: const InputDecoration(labelText: 'Min Eco', isDense: true, border: OutlineInputBorder()),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: _salaryCtrl,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(labelText: 'Salary CC', isDense: true, border: OutlineInputBorder()),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            onPressed: _busy ? null : () => _postJob(id),
                            style: ElevatedButton.styleFrom(backgroundColor: AppColors.emerald, foregroundColor: Colors.black),
                            child: const Text('Post', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      // Deposit Raw Material
                      const Text('Deposit Resource to Company:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.textSecondary)),
                      const SizedBox(height: 8),
                      storageAsync.maybeWhen(
                        data: (storage) {
                          if (storage.isEmpty) {
                            return const Text('Storage is empty.', style: TextStyle(color: AppColors.textMuted, fontSize: 11));
                          }
                          return Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: storage.take(6).map((s) {
                              final p = s['product'] as String? ?? '';
                              final q = s['quality'] as int? ?? 1;
                              final qty = s['quantity'] as int? ?? 0;
                              return ActionChip(
                                backgroundColor: AppColors.surfaceElevated,
                                side: const BorderSide(color: AppColors.border),
                                label: Text('📥 $p Q$q ×$qty', style: const TextStyle(fontSize: 10, color: AppColors.textPrimary)),
                                onPressed: _busy ? null : () => _depositResource(id, p, q, qty > 50 ? 50 : qty),
                              );
                            }).toList(),
                          );
                        },
                        orElse: () => const SizedBox.shrink(),
                      ),
                      const SizedBox(height: 16),
                      // Sell Company
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _salePriceCtrl,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(labelText: 'Sale Price (Gold)', isDense: true, border: OutlineInputBorder()),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: _busy ? null : () => _listForSale(id),
                            style: OutlinedButton.styleFrom(foregroundColor: AppColors.amber, side: const BorderSide(color: AppColors.amber)),
                            child: const Text('List for Sale', style: TextStyle(fontSize: 12)),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(myCompaniesProvider))),
      ),
    );
  }

  Widget _buildFoundCompanyTab() {
    final worldMapAsync = ref.watch(worldMapProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: TacticalCard(
        borderColor: AppColors.cyan.withValues(alpha: 0.4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.cyan.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.add_business_rounded, color: AppColors.cyan, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Found Enterprise', style: Theme.of(context).textTheme.titleLarge, overflow: TextOverflow.ellipsis),
                      const Text('Costs 20.00 Gold • Level 5+ Required', style: TextStyle(color: AppColors.textSecondary, fontSize: 11), overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Company Brand Name',
                hintText: 'e.g. Imperial Arms, Metro Bakery...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _selectedProduct,
              decoration: const InputDecoration(labelText: 'Production Goods Type', border: OutlineInputBorder()),
              dropdownColor: AppColors.surfaceCard,
              items: [
                ..._rawProducts.map((p) => DropdownMenuItem(value: p, child: Text('$p (Raw Extraction)', style: const TextStyle(color: AppColors.amber)))),
                ..._mfgProducts.map((p) => DropdownMenuItem(value: p, child: Text('$p (Manufactured)', style: const TextStyle(color: AppColors.cyan)))),
              ],
              onChanged: (val) {
                if (val != null) setState(() => _selectedProduct = val);
              },
            ),
            const SizedBox(height: 14),
            worldMapAsync.maybeWhen(
              data: (regions) {
                return DropdownButtonFormField<String>(
                  initialValue: _selectedRegionId,
                  decoration: const InputDecoration(labelText: 'Factory Region', border: OutlineInputBorder()),
                  dropdownColor: AppColors.surfaceCard,
                  items: [
                    const DropdownMenuItem(value: null, child: Text('📍 Current Citizen Region')),
                    ...regions.map((r) => DropdownMenuItem(
                          value: r.id,
                          child: Text('${r.name} (${r.countryName})', overflow: TextOverflow.ellipsis),
                        )),
                  ],
                  onChanged: (val) => setState(() => _selectedRegionId = val),
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),
            const SizedBox(height: 20),
            PulseButton(
              label: 'Found Company — 20g',
              icon: Icons.check_circle_rounded,
              backgroundColor: AppColors.cyan,
              foregroundColor: Colors.black,
              onPressed: _busy ? null : _foundCompany,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForSaleTab() {
    final marketAsync = ref.watch(marketCompaniesProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(marketCompaniesProvider),
      child: marketAsync.when(
        data: (companies) {
          if (companies.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('No companies currently listed for sale worldwide.', style: TextStyle(color: AppColors.textMuted)),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: companies.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final c = companies[index];
              final id = c['id'] as String;
              final name = c['name'] as String? ?? 'Enterprise';
              final product = c['product'] as String? ?? 'GOODS';
              final quality = c['quality'] as int? ?? 1;
              final price = ((c['salePrice'] as num?)?.toDouble() ?? 0) / 100;

              final citizen = ref.watch(citizenNotifierProvider).value;
              final isMyCompany = citizen != null && c['ownerId'] == citizen.id;

              return TacticalCard(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis),
                          Text('$product Q$quality', style: const TextStyle(color: AppColors.cyan, fontSize: 12), overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${price.toStringAsFixed(2)}g', style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.bold, fontSize: 14)),
                        const SizedBox(width: 12),
                        if (isMyCompany)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: AppColors.amber.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: AppColors.amber.withValues(alpha: 0.4)),
                            ),
                            child: const Text('My Enterprise', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: AppColors.amber)),
                          )
                        else
                          ElevatedButton(
                            onPressed: _busy ? null : () => _buyCompany(id),
                            style: ElevatedButton.styleFrom(backgroundColor: AppColors.cyan, foregroundColor: Colors.black),
                            child: const Text('Buy', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          ),
                      ],
                    ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(marketCompaniesProvider))),
      ),
    );
  }

  Widget _buildProductionChainTab() {
    final chains = [
      {'raw': 'Grain', 'factory': 'Food Factory', 'product': 'Food Rations (+HP)'},
      {'raw': 'Gunpowder', 'factory': 'Munitions Plant', 'product': 'Weapons & Ammo (+DMG)'},
      {'raw': 'Sugar', 'factory': 'Distillery', 'product': 'Energy Drinks (+HP)'},
      {'raw': 'Petrol', 'factory': 'Aviation Facility', 'product': 'Flight Tickets (Travel)'},
      {'raw': 'Stone', 'factory': 'Quarry & Masonry', 'product': 'Hospitals & Fortifications'},
      {'raw': 'Wood', 'factory': 'Lumber Mill', 'product': 'Infrastructure & Storage'},
    ];

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: chains.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final c = chains[index];
        return TacticalCard(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: AppColors.amber.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                child: const Icon(Icons.grain_rounded, color: AppColors.amber, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${c['raw']} → ${c['product']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 2),
                    Text('Processed in: ${c['factory']}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _foundCompany() async {
    final name = _nameCtrl.text.trim();
    if (name.length < 3) {
      showErrorPopup(context, 'Company name must be at least 3 characters', title: 'VALIDATION ERROR');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(companiesRepositoryProvider).createCompany(
            name: name,
            product: _selectedProduct,
            regionId: _selectedRegionId,
          );
      _nameCtrl.clear();
      ref.invalidate(myCompaniesProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      _tabController.animateTo(0);
      if (mounted) {
        showSuccessPopup(context, 'Enterprise founded successfully!', title: 'ENTERPRISE FOUNDED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'FOUND ENTERPRISE FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _upgradeCompany(String id) async {
    setState(() => _busy = true);
    try {
      await ref.read(companiesRepositoryProvider).upgradeCompany(id);
      ref.invalidate(myCompaniesProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Company quality upgraded!', title: 'UPGRADE COMPLETE');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'UPGRADE FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _postJob(String id) async {
    final salary = double.tryParse(_salaryCtrl.text.trim()) ?? 25.0;
    final minEco = double.tryParse(_minEcoCtrl.text.trim()) ?? 1.0;
    setState(() => _busy = true);
    try {
      await ref.read(companiesRepositoryProvider).postJob(id, minEcoSkill: minEco, salary: salary * 100);
      ref.invalidate(myCompaniesProvider);
      if (mounted) {
        showSuccessPopup(context, 'Job offer posted on the market!', title: 'JOB LISTED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'JOB POSTING FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _depositResource(String id, String product, int quality, int qty) async {
    setState(() => _busy = true);
    try {
      await ref.read(companiesRepositoryProvider).depositResource(id, product: product, quality: quality, qty: qty);
      ref.invalidate(myCompaniesProvider);
      ref.invalidate(storageProvider);
      if (mounted) {
        showSuccessPopup(context, 'Deposited $qty× $product into factory inventory!', title: 'DEPOSIT COMPLETE');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'DEPOSIT FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _listForSale(String id) async {
    final price = double.tryParse(_salePriceCtrl.text.trim()) ?? 15.0;
    setState(() => _busy = true);
    try {
      await ref.read(companiesRepositoryProvider).listForSale(id, price: price * 100);
      ref.invalidate(myCompaniesProvider);
      ref.invalidate(marketCompaniesProvider);
      if (mounted) {
        showSuccessPopup(context, 'Company listed on the public market!', title: 'LISTED FOR SALE');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'LISTING FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _buyCompany(String id) async {
    setState(() => _busy = true);
    try {
      await ref.read(companiesRepositoryProvider).buyCompany(id);
      ref.invalidate(myCompaniesProvider);
      ref.invalidate(marketCompaniesProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      _tabController.animateTo(0);
      if (mounted) {
        showSuccessPopup(context, 'Company acquired!', title: 'ACQUISITION COMPLETE');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'ACQUISITION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
