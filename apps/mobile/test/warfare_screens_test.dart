import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:nationforge_mobile/features/warfare/domain/battle_model.dart';
import 'package:nationforge_mobile/features/warfare/presentation/battle_list_screen.dart';
import 'package:nationforge_mobile/features/warfare/presentation/battle_arena_screen.dart';
import 'package:nationforge_mobile/core/sockets/socket_service.dart';
import 'package:nationforge_mobile/core/storage/token_storage.dart';

class FakeTokenStorage extends ChangeNotifier implements TokenStorage {
  @override
  Future<String?> getToken() async => null;
  @override
  Future<void> saveToken(String token) async {}
  @override
  Future<void> clearToken() async {}
}

class MockSocketService extends SocketService {
  MockSocketService() : super(FakeTokenStorage());

  @override
  io.Socket getBattleSocket() {
    return io.io(
      'http://127.0.0.1:3001',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .build(),
    );
  }
}

void main() {
  group('Warfare Domain & Model Tests', () {
    test('BattleModel parses correctly from war JSON with warType and topFighters', () {
      final json = {
        'id': 'b1',
        'wall': 54.5,
        'war': {
          'id': 'w1',
          'type': 'RESISTANCE',
          'attackerWins': 2,
          'defenderWins': 1,
          'attackerCountry': {'name': 'Rebel Front', 'code': 'RBL'},
          'defenderCountry': {'name': 'Occupier Nation', 'code': 'OCC'},
        },
        'region': {'name': 'Alsace'},
        'roundNumber': 3,
        'topFighters': [
          {
            'citizen': {'id': 'c1', 'nickname': 'Viper'},
            'side': 'ATTACKER',
            'damage': 15000,
          },
          {
            'citizen': {'id': 'c2', 'nickname': 'Titan'},
            'side': 'DEFENDER',
            'damage': 18000,
          },
        ],
      };

      final battle = BattleModel.fromJson(json);
      expect(battle.id, 'b1');
      expect(battle.regionName, 'Alsace');
      expect(battle.warType, 'RESISTANCE');
      expect(battle.wall, 54.5);
      expect(battle.currentRoundNumber, 3);
      expect(battle.attackerScore, 2);
      expect(battle.defenderScore, 1);
      expect(battle.attackerCountryName, 'Rebel Front');
      expect(battle.defenderCountryName, 'Occupier Nation');
      expect(battle.topFighters.length, 2);
      expect(battle.topFighters.first.nickname, 'Viper');
      expect(battle.topFighters.first.damage, 15000);

      // Test copyWith
      final updated = battle.copyWith(wall: 60.0, currentRoundNumber: 4);
      expect(updated.wall, 60.0);
      expect(updated.currentRoundNumber, 4);
      expect(updated.regionName, 'Alsace');
      expect(updated.warType, 'RESISTANCE');
    });
  });

  group('BattleListScreen Widget Tests', () {
    testWidgets('Renders Frontlines command hub with filters, search, and battle cards', (tester) async {
      final dummyBattle = BattleModel(
        id: 'b-alpha',
        warId: 'w-alpha',
        regionId: 'r-alpha',
        regionName: 'Normandy',
        currentRoundNumber: 2,
        attackerScore: 1,
        defenderScore: 0,
        wall: 52.0,
        endsAt: DateTime.now().add(const Duration(hours: 1)),
        attackerCountryName: 'United Kingdom',
        attackerCountryCode: 'GBR',
        attackerFlagColor: '#ef4444',
        defenderCountryName: 'France',
        defenderCountryCode: 'FRA',
        defenderFlagColor: '#3b82f6',
        warType: 'DIRECT',
      );

      final dummyTraining = BattleModel(
        id: 'b-train',
        warId: 'w-train',
        regionId: 'r-train',
        regionName: 'Team Alpha Yard',
        currentRoundNumber: 1,
        attackerScore: 0,
        defenderScore: 0,
        wall: 50.0,
        endsAt: DateTime.now().add(const Duration(hours: 1)),
        attackerCountryName: 'Team Beta',
        attackerCountryCode: 'TMB',
        attackerFlagColor: '#ef4444',
        defenderCountryName: 'Team Alpha',
        defenderCountryCode: 'TMA',
        defenderFlagColor: '#3b82f6',
        isTraining: true,
        warType: 'TRAINING',
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            battlesProvider.overrideWith((ref) async => [dummyBattle]),
            trainingYardProvider.overrideWith((ref) async => dummyTraining),
            buffsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: BattleListScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Header & Telemetry
      expect(find.text('Battles & Frontlines'), findsOneWidget);
      expect(find.text('Frontlines'), findsOneWidget);
      expect(find.text('Training Yard'), findsWidgets);

      // Verify Filter Chips
      expect(find.text('All Fronts'), findsOneWidget);
      expect(find.text('⚔️ Direct Wars'), findsOneWidget);
      expect(find.text('🔥 Resistance (RW)'), findsOneWidget);

      // Verify Training Yard card
      expect(find.text('TRAINING YARD // SAFE COMBAT'), findsOneWidget);
      expect(find.text('ENTER TRAINING BATTLE ➔'), findsOneWidget);

      // Verify International front battle card
      expect(find.text('Battle for Normandy'), findsOneWidget);
      expect(find.text('United Kingdom'), findsOneWidget);
      expect(find.text('France'), findsOneWidget);
      expect(find.text('ENTER BATTLE ➔'), findsOneWidget);
    });

    testWidgets('Stimulants bottom sheet disables active and debuffed buffs', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            battlesProvider.overrideWith((ref) async => []),
            trainingYardProvider.overrideWith((ref) async => null),
            buffsProvider.overrideWith((ref) async => [
              {
                'type': 'STEROID',
                'buffed': true,
                'debuffed': false,
              },
              {
                'type': 'RAMBO',
                'buffed': false,
                'debuffed': true,
              },
            ]),
          ],
          child: const MaterialApp(
            home: BattleListScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Tap Stimulants button in header
      await tester.tap(find.text('1 Buffs'));
      await tester.pumpAndSettle();

      // Verify sheet opened
      expect(find.text('Combat Stimulants (1 Gold)'), findsOneWidget);

      // Verify STEROID is marked ACTIVE with Active disabled button
      expect(find.text('ACTIVE'), findsOneWidget);
      expect(find.text('Active'), findsOneWidget);

      // Verify RAMBO is marked DEBUFF with Debuff disabled button
      expect(find.text('DEBUFF'), findsOneWidget);
      expect(find.text('Debuff'), findsOneWidget);

      // Verify PATRIOT and REBEL are still available
      expect(find.text('1g Inject'), findsNWidgets(2));
    });
  });

  group('BattleArenaScreen Widget Tests', () {
    testWidgets('Renders single battle arena with dominance wall, side selection, and strike controls', (tester) async {
      final dummyBattle = BattleModel(
        id: 'b-london',
        warId: 'w-london',
        regionId: 'r-london',
        regionName: 'Greater London',
        currentRoundNumber: 4,
        attackerScore: 3,
        defenderScore: 2,
        wall: 48.0,
        endsAt: DateTime.now().add(const Duration(hours: 1)),
        attackerCountryName: 'Germany',
        attackerCountryCode: 'DEU',
        attackerFlagColor: '#ef4444',
        defenderCountryName: 'United Kingdom',
        defenderCountryCode: 'GBR',
        defenderFlagColor: '#3b82f6',
        warType: 'DIRECT',
        topFighters: [
          TopFighter(
            citizenId: 'c1',
            nickname: 'Valkyrie',
            side: 'ATTACKER',
            damage: 22000,
            countryCode: 'DEU',
          ),
        ],
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            socketServiceProvider.overrideWithValue(MockSocketService()),
          ],
          child: MaterialApp(
            home: BattleArenaScreen(
              battleId: 'b-london',
              initialBattle: dummyBattle,
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      // Verify Arena Header
      expect(find.text('Greater London'), findsOneWidget);
      expect(find.text('+ HEAL'), findsOneWidget);

      // Verify Dominance Wall & scores
      expect(find.text('Germany'), findsOneWidget);
      expect(find.text('United Kingdom'), findsOneWidget);
      expect(find.text('Wins: 3 🏆'), findsOneWidget);
      expect(find.text('Wins: 2 🏆'), findsOneWidget);

      // Verify Side Alignments
      expect(find.text('ATTACK'), findsOneWidget);
      expect(find.text('DEFEND'), findsOneWidget);

      // Verify Weapon Tiers
      expect(find.text('Unarmed'), findsOneWidget);
      expect(find.text('Q1 Ammo'), findsOneWidget);

      // Verify Action Buttons
      expect(find.text('SINGLE (-10 HP)'), findsOneWidget);
      expect(find.text('BERSERK ×5 (-50 HP)'), findsOneWidget);

      // Verify Battle Hero Race
      expect(find.text('Battle Hero Race'), findsOneWidget);
      expect(find.text('Valkyrie'), findsOneWidget);
      expect(find.text('22000 DMG'), findsOneWidget);
    });
  });
}
