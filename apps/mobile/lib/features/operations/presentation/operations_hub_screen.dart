import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/storage/token_storage.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../citizen/presentation/citizen_controller.dart';

class OperationsHubScreen extends ConsumerWidget {
  const OperationsHubScreen({super.key});

  static const _modules = [
    {
      'title': 'Battles & Fronts',
      'desc': 'Live warzones & drills',
      'icon': Icons.military_tech_rounded,
      'color': AppColors.crimson,
      'route': '/warfare',
      'badge': 'HOT',
    },
    {
      'title': 'Equipment Loadout',
      'desc': '8-slot gear & WA merge',
      'icon': Icons.shield_rounded,
      'color': AppColors.cyan,
      'route': '/equipment',
      'badge': '8 SLOTS',
    },
    {
      'title': 'Military Units',
      'desc': 'Regiments & combat orders',
      'icon': Icons.security_rounded,
      'color': AppColors.emerald,
      'route': '/mu',
      'badge': null,
    },
    {
      'title': 'Work & Jobs',
      'desc': 'Employment shift & gym',
      'icon': Icons.work_rounded,
      'color': AppColors.amber,
      'route': '/work',
      'badge': null,
    },
    {
      'title': 'Companies',
      'desc': 'Industrial factories & jobs',
      'icon': Icons.factory_rounded,
      'color': AppColors.blue,
      'route': '/companies',
      'badge': null,
    },
    {
      'title': 'Auction House',
      'desc': 'Rare lots & 30s sniper lock',
      'icon': Icons.gavel_rounded,
      'color': AppColors.amber,
      'route': '/auctions',
      'badge': null,
    },
    {
      'title': 'Media & Press',
      'desc': 'Editorials & live shouts',
      'icon': Icons.newspaper_rounded,
      'color': AppColors.cyan,
      'route': '/media',
      'badge': null,
    },
    {
      'title': 'State & Politics',
      'desc': 'Congress laws & radio chat',
      'icon': Icons.account_balance_rounded,
      'color': AppColors.emerald,
      'route': '/politics',
      'badge': null,
    },
    {
      'title': 'Contracts & Loans',
      'desc': 'Citizen loans & escrow',
      'icon': Icons.history_edu_rounded,
      'color': AppColors.blue,
      'route': '/contracts',
      'badge': null,
    },
    {
      'title': 'Tournaments',
      'desc': '7 national cups & 1v1',
      'icon': Icons.emoji_events_rounded,
      'color': AppColors.amber,
      'route': '/events',
      'badge': null,
    },
    {
      'title': 'Achievements',
      'desc': '10 tracks & +2g claims',
      'icon': Icons.military_tech_outlined,
      'color': AppColors.emerald,
      'route': '/achievements',
      'badge': '+2g',
    },
    {
      'title': 'Leaderboards',
      'desc': 'Country & damage rankings',
      'icon': Icons.bar_chart_rounded,
      'color': AppColors.cyan,
      'route': '/stats',
      'badge': null,
    },
    {
      'title': 'Citizen Profile',
      'desc': 'Dossier, friends & packs',
      'icon': Icons.person_rounded,
      'color': AppColors.textPrimary,
      'route': '/profile',
      'badge': null,
    },
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Operations Command Deck'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded, color: AppColors.crimson),
            tooltip: 'Log Out Session',
            onPressed: () => _showLogoutDialog(context, ref),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TacticalCard(
              borderColor: AppColors.cyan.withValues(alpha: 0.3),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: AppColors.cyan.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.dashboard_customize_rounded, color: AppColors.cyan, size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('Tactical Headquarters Hub', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                        SizedBox(height: 2),
                        Text('Unified access to all national, economic, and frontline bureaus.', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.4,
              ),
              itemCount: _modules.length,
              itemBuilder: (context, index) {
                final m = _modules[index];
                final color = m['color'] as Color;
                final badge = m['badge'] as String?;

                return TacticalCard(
                  onTap: () => context.push(m['route'] as String),
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(7),
                            decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
                            child: Icon(m['icon'] as IconData, color: color, size: 20),
                          ),
                          if (badge != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(color: color.withValues(alpha: 0.4), width: 0.8),
                              ),
                              child: Text(badge, style: TextStyle(color: color, fontSize: 8, fontWeight: FontWeight.bold)),
                            ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(m['title'] as String, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13), overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 2),
                          Text(m['desc'] as String, style: const TextStyle(color: AppColors.textMuted, fontSize: 10), overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 20),
            // Session / Log Out Section
            TacticalCard(
              onTap: () => _showLogoutDialog(context, ref),
              borderColor: AppColors.crimson.withValues(alpha: 0.4),
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.crimson.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.logout_rounded, color: AppColors.crimson, size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'Log Out Session',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: AppColors.crimson,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'End active citizen session on this device and return to sign in.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: AppColors.crimson, size: 20),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Future<void> _showLogoutDialog(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: AppColors.crimson.withValues(alpha: 0.4)),
        ),
        title: Row(
          children: const [
            Icon(Icons.logout_rounded, color: AppColors.crimson, size: 22),
            SizedBox(width: 10),
            Text('Log Out Citizen', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        content: const Text(
          'Are you sure you want to end your active session and log out of this citizen account?',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.of(ctx).pop(true),
            icon: const Icon(Icons.logout_rounded, size: 16),
            label: const Text('Log Out'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.crimson,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      ref.invalidate(citizenNotifierProvider);
      ref.invalidate(dailyTasksNotifierProvider);
      await ref.read(tokenStorageProvider).clearToken();
      if (context.mounted) {
        context.go('/login');
      }
    }
  }
}
