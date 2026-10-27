import 'package:flutter_test/flutter_test.dart';
import 'package:nationforge_mobile/core/config/app_config.dart';

void main() {
  group('AppConfig', () {
    test('productionApiBaseUrl is configured to http://96.30.206.199:3001', () {
      expect(AppConfig.productionApiBaseUrl, equals('http://96.30.206.199:3001'));
    });

    test('appTitle is eGEOPOLIS', () {
      expect(AppConfig.appTitle, equals('eGEOPOLIS'));
    });

    test('default apiBaseUrl in test/debug environment returns a valid URL', () {
      final url = AppConfig.apiBaseUrl;
      expect(url.isNotEmpty, isTrue);
      expect(url.startsWith('http://'), isTrue);
    });

    test('default wsBaseUrl in test/debug environment returns a valid URL', () {
      final wsUrl = AppConfig.wsBaseUrl;
      expect(wsUrl.isNotEmpty, isTrue);
      expect(wsUrl.startsWith('http://'), isTrue);
    });
  });
}
