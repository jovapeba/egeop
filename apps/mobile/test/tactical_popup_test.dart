import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nationforge_mobile/core/widgets/tactical_popup.dart';

void main() {
  testWidgets('showErrorPopup displays modal dialog with tactical error styling', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () {
                    showErrorPopup(
                      context,
                      'Exception: Insufficient health points to engage in combat',
                      title: 'COMBAT ENGAGEMENT FAILED',
                    );
                  },
                  child: const Text('Trigger Error'),
                ),
              ),
            );
          },
        ),
      ),
    );

    // Initial state: error popup not shown
    expect(find.text('COMBAT ENGAGEMENT FAILED'), findsNothing);

    // Tap button to trigger popup
    await tester.tap(find.text('Trigger Error'));
    await tester.pumpAndSettle();

    // Verify popup title and stripped exception message are visible
    expect(find.text('COMBAT ENGAGEMENT FAILED'), findsOneWidget);
    expect(find.text('Insufficient health points to engage in combat.'), findsOneWidget);
    expect(find.text('ACKNOWLEDGE'), findsOneWidget);

    // Tap ACKNOWLEDGE to dismiss
    await tester.tap(find.text('ACKNOWLEDGE'));
    await tester.pumpAndSettle();

    // Verify popup is dismissed
    expect(find.text('COMBAT ENGAGEMENT FAILED'), findsNothing);
  });

  testWidgets('cleanErrorMessage cleans raw prefixes accurately', (WidgetTester tester) async {
    expect(cleanErrorMessage('Exception: Unauthorized operation'), 'Unauthorized operation.');
    expect(cleanErrorMessage('Error: Network timeout'), 'Network timeout.');
    expect(cleanErrorMessage('Raw text message'), 'Raw text message.');
    expect(cleanErrorMessage(null), 'An unexpected operational event occurred.');
  });
}
