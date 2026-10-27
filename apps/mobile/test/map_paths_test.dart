import 'package:flutter_test/flutter_test.dart';
import 'package:path_drawing/path_drawing.dart';
import 'package:nationforge_mobile/features/map/data/world_countries_data.dart';

void main() {
  test('all 225 country SVG paths parse without errors', () {
    expect(worldCountries.length, 225);
    for (final c in worldCountries) {
      final path = parseSvgPathData(c.d);
      expect(path, isNotNull);
    }
  });
}
