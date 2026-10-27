import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nationforge_mobile/features/map/domain/region_model.dart';
import 'package:nationforge_mobile/features/map/presentation/world_map_screen.dart';

void main() {
  testWidgets('WorldMapScreen renders complete world map with countries and controls', (tester) async {
    final mockData = WorldMapData(
      regions: [
        RegionModel(
          id: 'reg-1',
          name: 'Attica',
          countryId: 'c-1',
          coreCountryId: 'c-1',
          isCapital: true,
          density: 'HIGH',
          x: 1090.0,
          y: 240.0,
          countryName: 'Greece',
          countryCode: 'GR',
          flagColor: '#005BAE',
          battleIds: [],
        ),
      ],
      countries: [
        CountryModel(
          id: 'c-1',
          name: 'Greece',
          code: 'GR',
          flagColor: '#005BAE',
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          worldMapDataProvider.overrideWith((ref) => Future.value(mockData)),
        ],
        child: const MaterialApp(
          home: WorldMapScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Verify Active Nations & Complete World badge
    expect(find.text('1 Active Nations · 225 Complete World'), findsOneWidget);

    // Verify Continent Chips exist
    expect(find.text('World'), findsOneWidget);
    expect(find.text('Europe'), findsOneWidget);
    expect(find.text('Asia'), findsOneWidget);

    // Verify Region Pin exists
    expect(find.text('Attica'), findsOneWidget);

    // Verify CustomPaint with WorldCountriesPainter is present
    expect(find.byType(CustomPaint), findsWidgets);
  });
}
