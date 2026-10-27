import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nationforge_mobile/core/widgets/tactical_hotlist_bar.dart';
import 'package:nationforge_mobile/core/widgets/rating_widget.dart';
import 'package:nationforge_mobile/features/citizen/domain/citizen_model.dart';

void main() {
  group('Specification Parity & Game Features Tests', () {
    test('CitizenModel parses shortcuts, avatarColor, guide, enableTutorial', () {
      final json = {
        'id': 'cit-123',
        'nickname': 'CommanderAlpha',
        'level': 13,
        'xp': 12000,
        'hp': 480,
        'strength': 150.5,
        'ecoSkill': 2.5,
        'isAdmin': false,
        'totalDamage': 150000.0,
        'firstAidKits': 12,
        'gold': 50000,
        'walletFiat': 120000,
        'militaryRank': {'name': 'General', 'bonusPct': 25.0},
        'citizenshipCountry': {'id': 'cou-1', 'name': 'Republic of Liberty', 'code': 'ROL', 'flagColor': '#06b6d4', 'currencySymbol': 'ROL'},
        'locationRegion': {'id': 'reg-1', 'name': 'Metropolis'},
        'foodLimit': 30,
        'energyLimit': 30,
        'avatarColor': '#8b5cf6',
        'guide': 'CHICKEN',
        'enableTutorial': true,
        'shortcuts': ['/warfare', '/equipment', '/companies', '/politics', '/media'],
      };

      final citizen = CitizenModel.fromJson(json);

      expect(citizen.id, 'cit-123');
      expect(citizen.nickname, 'CommanderAlpha');
      expect(citizen.level, 13);
      expect(citizen.avatarColor, '#8b5cf6');
      expect(citizen.guide, 'CHICKEN');
      expect(citizen.enableTutorial, true);
      expect(citizen.shortcuts.length, 5);
      expect(citizen.shortcuts, contains('/warfare'));
      expect(citizen.shortcuts, contains('/equipment'));
      expect(citizen.shortcuts, contains('/companies'));
      expect(citizen.shortcuts, contains('/politics'));
      expect(citizen.shortcuts, contains('/media'));
    });

    testWidgets('TacticalHotlistBar renders up to 5 shortcuts with icons and labels', (tester) async {
      final shortcuts = ['/warfare', '/equipment', '/companies', '/politics', '/media'];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TacticalHotlistBar(shortcuts: shortcuts),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('HOTLIST'), findsOneWidget);
      expect(find.text('Battles'), findsOneWidget);
      expect(find.text('Equip'), findsOneWidget);
      expect(find.text('Companies'), findsOneWidget);
      expect(find.text('Politics'), findsOneWidget);
      expect(find.text('Media'), findsOneWidget);
      expect(find.byIcon(Icons.tune_rounded), findsOneWidget);
    });

    testWidgets('RatingWidget renders thumbs up and thumbs down UI', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ratingFutureProvider(('CITIZEN', 'cit-123')).overrideWith((ref) async => {
                  'likes': 42,
                  'dislikes': 3,
                  'myVote': true,
                }),
          ],
          child: const MaterialApp(
            home: Scaffold(
              body: Center(
                child: RatingWidget(
                  targetType: 'CITIZEN',
                  targetId: 'cit-123',
                ),
              ),
            ),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.thumb_up_rounded), findsOneWidget);
      expect(find.byIcon(Icons.thumb_down_rounded), findsOneWidget);
      expect(find.text('42'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
    });
  });
}
