import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/storage/token_storage.dart';
import '../core/theme/app_colors.dart';
import '../core/widgets/tactical_hotlist_bar.dart';
import '../features/citizen/presentation/citizen_controller.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/register_screen.dart';
import '../features/citizen/presentation/citizen_hud.dart';
import '../features/citizen/presentation/dashboard_screen.dart';
import '../features/warfare/domain/battle_model.dart';
import '../features/warfare/presentation/battle_arena_screen.dart';
import '../features/warfare/presentation/battle_list_screen.dart';
import '../features/map/presentation/world_map_screen.dart';
import '../features/economy/presentation/economy_hub_screen.dart';
import '../features/operations/presentation/operations_hub_screen.dart';
import '../features/equipment/presentation/equipment_screen.dart';
import '../features/auctions/presentation/auctions_screen.dart';
import '../features/mu/presentation/mu_screen.dart';
import '../features/politics/presentation/politics_screen.dart';
import '../features/work/presentation/work_screen.dart';
import '../features/companies/presentation/companies_screen.dart';
import '../features/companies/presentation/stock_company_detail_screen.dart';
import '../features/media/presentation/media_screen.dart';
import '../features/achievements/presentation/achievements_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/stats/presentation/stats_screen.dart';
import '../features/contracts/presentation/contracts_screen.dart';
import '../features/events/presentation/events_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final tokenStorage = ref.watch(tokenStorageProvider);

  return GoRouter(
    initialLocation: '/dashboard',
    refreshListenable: tokenStorage,
    redirect: (context, state) async {
      final token = await tokenStorage.getToken();
      final isAuthRoute = state.matchedLocation == '/login' || state.matchedLocation == '/register';

      if (token == null && !isAuthRoute) {
        return '/login';
      }
      if (token != null && isAuthRoute) {
        return '/dashboard';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/battle/:id',
        builder: (context, state) {
          final battleId = state.pathParameters['id']!;
          final battle = state.extra as BattleModel?;
          return BattleArenaScreen(battleId: battleId, initialBattle: battle);
        },
      ),
      GoRoute(
        path: '/equipment',
        builder: (context, state) => const EquipmentScreen(),
      ),
      GoRoute(
        path: '/auctions',
        builder: (context, state) => const AuctionsScreen(),
      ),
      GoRoute(
        path: '/mu',
        builder: (context, state) => const MuScreen(),
      ),
      GoRoute(
        path: '/work',
        builder: (context, state) => const WorkScreen(),
      ),
      GoRoute(
        path: '/companies',
        builder: (context, state) => const CompaniesScreen(),
      ),
      GoRoute(
        path: '/stock/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return StockCompanyDetailScreen(jscId: id);
        },
      ),
      GoRoute(
        path: '/media',
        builder: (context, state) => const MediaScreen(),
      ),
      GoRoute(
        path: '/achievements',
        builder: (context, state) => const AchievementsScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/stats',
        builder: (context, state) => const StatsScreen(),
      ),
      GoRoute(
        path: '/contracts',
        builder: (context, state) => const ContractsScreen(),
      ),
      GoRoute(
        path: '/events',
        builder: (context, state) => const EventsScreen(),
      ),
      GoRoute(
        path: '/politics',
        builder: (context, state) => const PoliticsScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return ScaffoldWithNavBar(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/dashboard',
                builder: (context, state) => const DashboardScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/warfare',
                builder: (context, state) => const BattleListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/map',
                builder: (context, state) => const WorldMapScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/economy',
                builder: (context, state) => const EconomyHubScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/ops',
                builder: (context, state) => const OperationsHubScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class ScaffoldWithNavBar extends ConsumerWidget {
  final StatefulNavigationShell navigationShell;

  const ScaffoldWithNavBar({super.key, required this.navigationShell});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final citizen = ref.watch(citizenNotifierProvider).asData?.value;
    final shortcuts = citizen?.shortcuts ?? const <String>[];

    return Scaffold(
      body: Column(
        children: [
          const CitizenHud(),
          if (shortcuts.isNotEmpty) TacticalHotlistBar(shortcuts: shortcuts),
          Expanded(child: navigationShell),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: navigationShell.currentIndex,
          type: BottomNavigationBarType.fixed,
          onTap: (index) {
            navigationShell.goBranch(
              index,
              initialLocation: index == navigationShell.currentIndex,
            );
          },
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.dashboard_rounded),
              label: 'Command',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.sports_mma_rounded),
              label: 'Battles',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.public_rounded),
              label: 'Map',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.storefront_rounded),
              label: 'Economy',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.hub_rounded),
              label: 'Ops',
            ),
          ],
        ),
      ),
    );
  }
}
