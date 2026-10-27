import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/work_repository.dart';

final jobOffersProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(workRepositoryProvider);
  return repo.fetchJobOffers();
});

class WorkScreen extends ConsumerStatefulWidget {
  const WorkScreen({super.key});

  @override
  ConsumerState<WorkScreen> createState() => _WorkScreenState();
}

class _WorkScreenState extends ConsumerState<WorkScreen> {
  String _selectedProduct = 'ALL';
  String _searchQuery = '';
  bool _busy = false;
  String? _appliedOfferId;

  @override
  Widget build(BuildContext context) {
    final tasksAsync = ref.watch(dailyTasksNotifierProvider);
    final citizenAsync = ref.watch(citizenNotifierProvider);
    final jobsAsync = ref.watch(jobOffersProvider);
    final storageAsync = ref.watch(storageProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Work & Employment'),
      ),
      body: RefreshIndicator(
        color: AppColors.cyan,
        backgroundColor: AppColors.surface,
        onRefresh: () async {
          ref.invalidate(jobOffersProvider);
          ref.invalidate(storageProvider);
          await ref.read(dailyTasksNotifierProvider.notifier).refresh();
          await ref.read(citizenNotifierProvider.notifier).refresh();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Shift Card
              tasksAsync.when(
                data: (tasks) {
                  final worked = tasks?.worked ?? false;
                  final trained = tasks?.trained ?? false;
                  return TacticalCard(
                    borderColor: AppColors.emerald.withOpacity(0.4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: AppColors.emerald.withOpacity(0.15),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: const Icon(Icons.work_rounded, color: AppColors.emerald, size: 20),
                                ),
                                const SizedBox(width: 10),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      tasks?.companyName != null
                                          ? 'Daily Shift — ${tasks!.companyName}'
                                          : 'Daily Shift — Day ${tasks?.day ?? 1}',
                                      style: Theme.of(context).textTheme.titleMedium,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text(
                                      tasks?.hasJob == false
                                          ? 'No active job — Apply on the Job Market below'
                                          : citizenAsync.maybeWhen(
                                              data: (c) => 'Eco Skill ${c?.ecoSkill.toStringAsFixed(2) ?? '1.00'} • Income Tax applies',
                                              orElse: () => 'Earn wage & economy skill',
                                            ),
                                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            Builder(
                              builder: (context) {
                                final hasJob = tasks?.hasJob ?? true;
                                final isHiredToday = (tasks?.hiredToday ?? false) || _appliedOfferId != null;
                                final canQuit = hasJob && !isHiredToday && (tasks?.canQuitJob ?? true);

                                if (!hasJob) return const SizedBox.shrink();

                                return TextButton(
                                  onPressed: (_busy || !canQuit) ? null : _quitJob,
                                  child: Text(
                                    isHiredToday ? 'Hired Today' : 'Quit Job',
                                    style: TextStyle(
                                      color: canQuit ? AppColors.textMuted : AppColors.amber.withOpacity(0.6),
                                      fontSize: 11,
                                      fontWeight: isHiredToday ? FontWeight.bold : FontWeight.normal,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: PulseButton(
                                label: worked ? 'Shift Done ✓' : 'Work (-10 HP)',
                                icon: Icons.business_center_rounded,
                                backgroundColor: worked ? AppColors.surfaceElevated : AppColors.emerald,
                                foregroundColor: worked ? AppColors.textMuted : Colors.black,
                                onPressed: (worked || _busy) ? null : _doWork,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: PulseButton(
                                label: trained ? 'Trained ✓' : 'Train (+5 STR)',
                                icon: Icons.fitness_center_rounded,
                                backgroundColor: trained ? AppColors.surfaceElevated : AppColors.cyan,
                                foregroundColor: trained ? AppColors.textMuted : Colors.black,
                                onPressed: (trained || _busy) ? null : _doTrain,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 20),

              // Rations Quick Consumption
              Text('Consumables & Rations', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),
              storageAsync.when(
                data: (storage) {
                  final foodList = storage.where((s) => s['product'] == 'FOOD' && (s['quantity'] as num) > 0).toList();
                  final drinkList = storage.where((s) => s['product'] == 'ENERGY_DRINK' && (s['quantity'] as num) > 0).toList();

                  if (foodList.isEmpty && drinkList.isEmpty) {
                    return TacticalCard(
                      child: const Center(
                        child: Padding(
                          padding: EdgeInsets.all(12),
                          child: Text('No food rations or energy drinks in storage. Buy them on the Market.', style: TextStyle(color: AppColors.textMuted, fontSize: 12)),
                        ),
                      ),
                    );
                  }

                  return TacticalCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (foodList.isNotEmpty) ...[
                          const Text('Food Rations (+HP):', style: TextStyle(color: AppColors.emerald, fontWeight: FontWeight.bold, fontSize: 12)),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: foodList.map((f) {
                              final q = f['quality'] as int? ?? 1;
                              final qty = f['quantity'] as int? ?? 0;
                              return ActionChip(
                                backgroundColor: AppColors.surfaceElevated,
                                side: const BorderSide(color: AppColors.emerald, width: 0.8),
                                label: Text('🍞 Q$q ×$qty (+${10 * q} HP)', style: const TextStyle(fontSize: 11, color: AppColors.emerald)),
                                onPressed: _busy ? null : () => _consume('FOOD', q),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 12),
                        ],
                        if (drinkList.isNotEmpty) ...[
                          const Text('Energy Drinks (+HP):', style: TextStyle(color: AppColors.cyan, fontWeight: FontWeight.bold, fontSize: 12)),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: drinkList.map((d) {
                              final q = d['quality'] as int? ?? 1;
                              final qty = d['quantity'] as int? ?? 0;
                              return ActionChip(
                                backgroundColor: AppColors.surfaceElevated,
                                side: const BorderSide(color: AppColors.cyan, width: 0.8),
                                label: Text('⚡ Q$q ×$qty (+${10 * q} HP)', style: const TextStyle(fontSize: 11, color: AppColors.cyan)),
                                onPressed: _busy ? null : () => _consume('ENERGY_DRINK', q),
                              );
                            }).toList(),
                          ),
                        ],
                      ],
                    ),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 24),

              // Job Market Header & Filters
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Job Market', style: Theme.of(context).textTheme.titleLarge),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, size: 20, color: AppColors.cyan),
                    onPressed: () => ref.invalidate(jobOffersProvider),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Search & filter
              TextField(
                decoration: InputDecoration(
                  hintText: 'Search company or region...',
                  prefixIcon: const Icon(Icons.search_rounded, size: 20, color: AppColors.textMuted),
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.surfaceCard,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppColors.border)),
                ),
                onChanged: (val) => setState(() => _searchQuery = val.toLowerCase()),
              ),
              const SizedBox(height: 12),

              jobsAsync.when(
                data: (jobs) {
                  final filtered = jobs.where((j) {
                    final company = j['company'] as Map? ?? {};
                    final name = (company['name'] as String? ?? '').toLowerCase();
                    final region = (company['region']?['name'] as String? ?? '').toLowerCase();
                    if (_searchQuery.isNotEmpty && !name.contains(_searchQuery) && !region.contains(_searchQuery)) {
                      return false;
                    }
                    if (_selectedProduct != 'ALL' && company['product'] != _selectedProduct) {
                      return false;
                    }
                    return true;
                  }).toList();

                  if (filtered.isEmpty) {
                    return TacticalCard(
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            children: const [
                              Icon(Icons.business_center_outlined, size: 32, color: AppColors.textMuted),
                              SizedBox(height: 8),
                              Text('No Job Offers Match', style: TextStyle(fontWeight: FontWeight.bold, color: AppColors.textSecondary)),
                              SizedBox(height: 4),
                              Text('Company owners post positions from the Companies deck.', style: TextStyle(color: AppColors.textMuted, fontSize: 11)),
                            ],
                          ),
                        ),
                      ),
                    );
                  }

                  return ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final job = filtered[index];
                      final id = job['id'] as String;
                      final minEco = (job['minEcoSkill'] as num?)?.toDouble() ?? 1.0;
                      final salary = (job['salary'] as num?)?.toDouble() ?? 0.0;
                      final company = job['company'] as Map? ?? {};
                      final compName = company['name'] as String? ?? 'Enterprise';
                      final product = company['product'] as String? ?? 'GOODS';
                      final quality = company['quality'] as int? ?? 1;
                      final regionName = company['region']?['name'] as String? ?? '';

                      return TacticalCard(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(compName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis),
                                  const SizedBox(height: 2),
                                  Text(
                                    '$product Q$quality • $regionName • Eco ${minEco.toStringAsFixed(1)}+',
                                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('${(salary / 100).toStringAsFixed(2)} CC', style: const TextStyle(color: AppColors.emerald, fontWeight: FontWeight.bold, fontSize: 14)),
                                const SizedBox(height: 4),
                                () {
                                  final citizen = citizenAsync.asData?.value;
                                  final tasks = tasksAsync.asData?.value;
                                  final isSkillLow = citizen != null && citizen.ecoSkill < minEco;
                                  final isCurrentJob = (job['isCurrentJob'] == true) || _appliedOfferId == id;
                                  final isHiredToday = (job['hiredToday'] == true) || (tasks?.hiredToday == true) || _appliedOfferId != null;
                                  final isDisabled = _busy || isSkillLow || isCurrentJob || isHiredToday;

                                  final label = isCurrentJob
                                      ? 'Current Job ✓'
                                      : isHiredToday
                                          ? 'Hired Today'
                                          : isSkillLow
                                              ? 'Skill Low'
                                              : 'Apply';

                                  return ElevatedButton(
                                    onPressed: isDisabled ? null : () => _applyJob(id, compName),
                                    style: ElevatedButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                                      backgroundColor: isCurrentJob
                                          ? AppColors.emerald.withOpacity(0.2)
                                          : isHiredToday
                                              ? AppColors.amber.withOpacity(0.15)
                                              : isSkillLow
                                                  ? AppColors.surface
                                                  : AppColors.surfaceElevated,
                                      foregroundColor: isCurrentJob
                                          ? AppColors.emerald
                                          : isHiredToday
                                              ? AppColors.amber
                                              : isSkillLow
                                                  ? AppColors.textMuted
                                                  : AppColors.cyan,
                                    ),
                                    child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
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
                loading: () => const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator(color: AppColors.cyan))),
                error: (e, _) => TacticalErrorCard(error: e, onRetry: () => ref.invalidate(jobOffersProvider)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _doWork() async {
    setState(() => _busy = true);
    try {
      final res = await ref.read(workRepositoryProvider).workShift();
      await ref.read(dailyTasksNotifierProvider.notifier).refresh();
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        final units = res['units'] ?? 1;
        final product = res['product'] ?? '';
        final netSalary = ((res['netSalary'] as num?)?.toDouble() ?? 0) / 100;
        showSuccessPopup(
          context,
          'Shift completed! Produced $units× $product • Net wage: ${netSalary.toStringAsFixed(2)} CC (-10 HP)',
          title: 'SHIFT COMPLETED',
        );
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'WORK SHIFT FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _doTrain() async {
    setState(() => _busy = true);
    try {
      final res = await ref.read(workRepositoryProvider).trainGym();
      await ref.read(dailyTasksNotifierProvider.notifier).refresh();
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        final str = (res['strength'] as num?)?.toDouble() ?? 0;
        showSuccessPopup(
          context,
          'Military drills complete! Strength increased to ${str.toStringAsFixed(1)}',
          title: 'TRAINING COMPLETED',
        );
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'TRAINING REGIMEN FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _quitJob() async {
    setState(() => _busy = true);
    try {
      await ref.read(workRepositoryProvider).quitJob();
      ref.invalidate(jobOffersProvider);
      setState(() => _appliedOfferId = null);
      if (mounted) {
        showSuccessPopup(context, 'Resigned from current company.', title: 'RESIGNED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'RESIGNATION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _applyJob(String offerId, String compName) async {
    setState(() => _busy = true);
    try {
      await ref.read(workRepositoryProvider).applyForJob(offerId);
      ref.invalidate(jobOffersProvider);
      setState(() => _appliedOfferId = offerId);
      if (mounted) {
        showSuccessPopup(context, 'Applied to $compName! You can now work your shift.', title: 'HIRED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'APPLICATION REJECTED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _consume(String kind, int quality) async {
    setState(() => _busy = true);
    try {
      await ref.read(workRepositoryProvider).consume(kind, quality);
      ref.invalidate(storageProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      await ref.read(dailyTasksNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Restored +${10 * quality} HP!', title: 'RATIONS CONSUMED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'CONSUMPTION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
