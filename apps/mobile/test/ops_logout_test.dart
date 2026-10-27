import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nationforge_mobile/core/theme/app_theme.dart';
import 'package:nationforge_mobile/features/operations/presentation/operations_hub_screen.dart';

void main() {
  testWidgets('OperationsHubScreen renders logout buttons and opens confirmation dialog', (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.darkTheme,
          home: const OperationsHubScreen(),
        ),
      ),
    );

    // Verify AppBar logout action icon is present
    expect(find.byTooltip('Log Out Session'), findsOneWidget);

    // Scroll to reveal bottom logout card
    final logoutCardFinder = find.text('Log Out Session');
    await tester.scrollUntilVisible(
      logoutCardFinder,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(logoutCardFinder, findsOneWidget);

    // Tap the logout button to open the confirmation dialog
    await tester.tap(logoutCardFinder);
    await tester.pumpAndSettle();

    // Verify confirmation modal contents
    expect(find.text('Log Out Citizen'), findsOneWidget);
    expect(
      find.text('Are you sure you want to end your active session and log out of this citizen account?'),
      findsOneWidget,
    );
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Log Out'), findsOneWidget);

    // Tap Cancel to dismiss dialog
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(find.text('Log Out Citizen'), findsNothing);
  });
}
