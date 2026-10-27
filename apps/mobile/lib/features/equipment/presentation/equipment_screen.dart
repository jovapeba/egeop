import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/equipment_repository.dart';

final equipmentProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final repo = ref.watch(equipmentRepositoryProvider);
  return repo.fetchMine();
});

class EquipmentScreen extends ConsumerStatefulWidget {
  const EquipmentScreen({super.key});

  @override
  ConsumerState<EquipmentScreen> createState() => _EquipmentScreenState();
}

class _EquipmentScreenState extends ConsumerState<EquipmentScreen> {
  static const _slots = [
    'MUZZLE', 'LASER', 'OPTIC', 'STOCK',
    'REAR_GRIP', 'MAGAZINE', 'BARREL', 'UNDERBARREL'
  ];

  final List<String> _selectedMergeIds = [];

  @override
  Widget build(BuildContext context) {
    final eqAsync = ref.watch(equipmentProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Equipment & Weapon Attachments')),
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async => ref.invalidate(equipmentProvider),
        child: eqAsync.when(
          data: (data) {
            final itemsRaw = data['items'];
            final List<Map<String, dynamic>> allItems = itemsRaw is List
                ? itemsRaw.map((e) => (e as Map).cast<String, dynamic>()).toList()
                : [];

            final Map<dynamic, dynamic> equippedRaw = (data['equipped'] is Map)
                ? (data['equipped'] as Map)
                : {};
            final equippedItemIds = equippedRaw.values.map((v) => v.toString()).toSet();

            final equippedBySlot = <String, Map<String, dynamic>>{};
            final backpackList = <Map<String, dynamic>>[];

            for (final it in allItems) {
              final id = it['id']?.toString() ?? '';
              final slot = it['slot'] as String? ?? '';
              if (equippedRaw[slot]?.toString() == id || equippedItemIds.contains(id)) {
                equippedBySlot[slot] = it;
              } else {
                backpackList.add(it);
              }
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              physics: const AlwaysScrollableScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Active 8-Slot Loadout', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 10),

                  // 8-Slot Grid
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                      childAspectRatio: 1.8,
                    ),
                    itemCount: _slots.length,
                    itemBuilder: (context, index) {
                      final slot = _slots[index];
                      final item = equippedBySlot[slot];
                      final isEquipped = item != null;
                      final quality = item != null ? (item['quality'] as num?)?.toInt() ?? 1 : 0;

                      return TacticalCard(
                        padding: const EdgeInsets.all(10),
                        borderColor: isEquipped ? AppColors.cyan.withOpacity(0.5) : AppColors.border,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(slot.replaceAll('_', ' '), style: const TextStyle(fontSize: 10, color: AppColors.textSecondary, fontWeight: FontWeight.bold)),
                                if (isEquipped)
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                    decoration: BoxDecoration(color: AppColors.cyan, borderRadius: BorderRadius.circular(4)),
                                    child: Text('Q$quality', style: const TextStyle(color: Colors.black, fontSize: 9, fontWeight: FontWeight.bold)),
                                  )
                                else
                                  const Text('EMPTY', style: TextStyle(color: AppColors.textMuted, fontSize: 9)),
                              ],
                            ),
                            if (isEquipped) ...[
                              Text(item['name'] as String? ?? 'Attachment', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12), overflow: TextOverflow.ellipsis),
                              Align(
                                alignment: Alignment.bottomRight,
                                child: InkWell(
                                  onTap: () => _unequipItem(item['id'] as String),
                                  child: const Text('Unequip', style: TextStyle(color: AppColors.crimson, fontSize: 10, fontWeight: FontWeight.bold)),
                                ),
                              ),
                            ] else
                              const Center(child: Icon(Icons.add_circle_outline_rounded, color: AppColors.textMuted, size: 20)),
                          ],
                        ),
                      );
                    },
                  ),

                  const SizedBox(height: 24),
                  // WA Merge 3->1 Workbench Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          'WA Merge 3→1 Workbench',
                          style: Theme.of(context).textTheme.titleLarge,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (_selectedMergeIds.length == 3)
                        ElevatedButton(
                          onPressed: _executeMerge,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.amber,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          ),
                          child: const Text('Merge to Q+1', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _selectedMergeIds.isEmpty
                        ? 'Tap 3 attachments of the same quality in your backpack to merge them into Q+1.'
                        : 'Selected ${_selectedMergeIds.length}/3 items for merging.',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                  ),

                  const SizedBox(height: 16),
                  Text('Backpack Gear (${backpackList.length})', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 10),

                  if (backpackList.isEmpty)
                    TacticalCard(
                      child: const Center(
                        child: Padding(
                          padding: EdgeInsets.all(20),
                          child: Text('Backpack is empty. Win battles or bid in the Auction House to find gear.', style: TextStyle(color: AppColors.textSecondary, fontSize: 12), textAlign: TextAlign.center),
                        ),
                      ),
                    )
                  else
                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: backpackList.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final it = backpackList[index];
                        final id = it['id'] as String;
                        final slot = it['slot'] as String? ?? 'ATTACHMENT';
                        final quality = (it['quality'] as num?)?.toInt() ?? 1;
                        final isSelectedForMerge = _selectedMergeIds.contains(id);

                        return TacticalCard(
                          padding: const EdgeInsets.all(12),
                          borderColor: isSelectedForMerge ? AppColors.amber : AppColors.border,
                          child: Row(
                            children: [
                              Checkbox(
                                value: isSelectedForMerge,
                                activeColor: AppColors.amber,
                                onChanged: (val) {
                                  setState(() {
                                    if (val == true) {
                                      if (_selectedMergeIds.length < 3) _selectedMergeIds.add(id);
                                    } else {
                                      _selectedMergeIds.remove(id);
                                    }
                                  });
                                },
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                decoration: BoxDecoration(color: AppColors.cyan.withOpacity(0.15), borderRadius: BorderRadius.circular(4)),
                                child: Text('Q$quality', style: const TextStyle(color: AppColors.cyan, fontWeight: FontWeight.bold, fontSize: 11)),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(it['name'] as String? ?? 'Weapon Attachment',
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                        overflow: TextOverflow.ellipsis),
                                    Text(slot.replaceAll('_', ' '),
                                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                                        overflow: TextOverflow.ellipsis),
                                  ],
                                ),
                              ),
                              Row(
                                children: [
                                  TextButton(
                                    onPressed: () => _equipItem(id),
                                    child: const Text('Equip', style: TextStyle(color: AppColors.emerald, fontWeight: FontWeight.bold, fontSize: 12)),
                                  ),
                                  TextButton(
                                    onPressed: () => _showUpgradeParamSheet(it),
                                    child: const Text('Upgrade', style: TextStyle(color: AppColors.cyan, fontSize: 12)),
                                  ),
                                  if (quality > 1)
                                    TextButton(
                                      onPressed: () => _splitItem(id),
                                      child: const Text('Split', style: TextStyle(color: AppColors.amber, fontSize: 12)),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                ],
              ),
            );
          },
          loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
          error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(equipmentProvider))),
        ),
      ),
    );
  }

  void _equipItem(String id) async {
    try {
      await ref.read(equipmentRepositoryProvider).equip(id);
      ref.invalidate(equipmentProvider);
      if (mounted) {
        showSuccessPopup(context, 'Item equipped successfully!', title: 'GEAR EQUIPPED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e);
    }
  }

  void _unequipItem(String id) async {
    try {
      await ref.read(equipmentRepositoryProvider).unequip(id);
      ref.invalidate(equipmentProvider);
      if (mounted) {
        showSuccessPopup(context, 'Item unequipped to backpack.', title: 'GEAR UNEQUIPPED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e);
    }
  }

  void _splitItem(String id) async {
    try {
      await ref.read(equipmentRepositoryProvider).split(id);
      ref.invalidate(equipmentProvider);
      if (mounted) {
        showSuccessPopup(context, 'Item split into 2 lower-tier attachments!', title: 'DISASSEMBLED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e);
    }
  }

  void _executeMerge() async {
    if (_selectedMergeIds.length != 3) return;
    try {
      await ref.read(equipmentRepositoryProvider).merge(List.from(_selectedMergeIds));
      setState(() => _selectedMergeIds.clear());
      ref.invalidate(equipmentProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'WA Merge successful! Quality +1 created.', title: 'MERGE COMPLETE');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e);
    }
  }

  void _showUpgradeParamSheet(Map<String, dynamic> item) {
    final id = item['id'] as String? ?? '';
    final name = item['name'] as String? ?? 'Attachment';
    final quality = item['quality'] as int? ?? 1;
    final paramsRaw = item['params'];
    final List<Map<String, dynamic>> params = paramsRaw is List
        ? paramsRaw.map((e) => (e as Map).cast<String, dynamic>()).toList()
        : [];

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        const SizedBox(height: 2),
                        Text('Quality Q$quality Attachment · Upgrade Parameter', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.cyan.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: AppColors.cyan),
                    ),
                    child: const Text('1 UPGRADE ITEM', style: TextStyle(color: AppColors.cyan, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Consuming 1 Upgrade item permanently increases the chosen parameter by +10% of total quality range.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
              const SizedBox(height: 16),
              if (params.isEmpty)
                const Center(child: Padding(padding: EdgeInsets.all(12), child: Text('No parameters on this attachment', style: TextStyle(color: AppColors.textMuted))))
              else
                ...params.map((p) {
                  final type = p['type'] as String? ?? '';
                  final val = p['value'] as num? ?? 0;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceElevated,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(type.replaceAll('_', ' '), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.cyan)),
                            Text('Current: $val', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                          ],
                        ),
                        ElevatedButton.icon(
                          icon: const Icon(Icons.arrow_upward, size: 14),
                          label: const Text('Upgrade +10%'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.cyan,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          ),
                          onPressed: () async {
                            Navigator.pop(ctx);
                            try {
                              final res = await ref.read(equipmentRepositoryProvider).upgradeParam(id, type);
                              ref.invalidate(equipmentProvider);
                              if (mounted) {
                                final delta = res['delta'] ?? 0.1;
                                showSuccessPopup(
                                  context,
                                  'Upgraded $type by +$delta successfully!',
                                  title: 'PARAMETER BOOSTED',
                                );
                              }
                            } catch (e) {
                              if (mounted) showErrorPopup(context, e, title: 'Upgrade Failed');
                            }
                          },
                        ),
                      ],
                    ),
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }
}
