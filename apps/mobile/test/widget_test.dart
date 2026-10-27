import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nationforge_mobile/main.dart';

void main() {
  testWidgets('NationForge app boots cleanly', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: NationForgeApp(),
      ),
    );
    expect(find.byType(NationForgeApp), findsOneWidget);
  });
}
