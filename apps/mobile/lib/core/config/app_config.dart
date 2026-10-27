import 'dart:io';
import 'package:flutter/foundation.dart';

class AppConfig {
  /// Production backend API URL on Vultr.
  static const String productionApiBaseUrl = 'http://96.30.206.199:3001';

  /// Optional override passed via `--dart-define=API_BASE_URL=...`
  static const String _envApiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Optional override passed via `--dart-define=WS_BASE_URL=...`
  static const String _envWsBaseUrl = String.fromEnvironment('WS_BASE_URL');

  /// Optional flag to point debug builds to the production server:
  /// `flutter run --dart-define=USE_PROD_API=true`
  static const bool _useProdApi = bool.fromEnvironment('USE_PROD_API', defaultValue: false);

  /// Backend API URL.
  /// - Production release builds (`kReleaseMode`) and builds with `USE_PROD_API=true`
  ///   use `http://96.30.206.199:3001` (or `API_BASE_URL` if provided).
  /// - Development debug builds default to:
  ///   - Android emulator: `http://10.0.2.2:3001`
  ///   - iOS simulator / Web / Desktop: `http://localhost:3001`
  static String get apiBaseUrl {
    if (_envApiBaseUrl.isNotEmpty) return _envApiBaseUrl;
    if (kReleaseMode || _useProdApi) return productionApiBaseUrl;
    if (kIsWeb) return 'http://localhost:3001';
    if (Platform.isAndroid) return 'http://10.0.2.2:3001';
    return 'http://localhost:3001';
  }

  /// Backend WebSocket URL for real-time warfare and chat.
  static String get wsBaseUrl {
    if (_envWsBaseUrl.isNotEmpty) return _envWsBaseUrl;
    if (_envApiBaseUrl.isNotEmpty) return _envApiBaseUrl;
    if (kReleaseMode || _useProdApi) return productionApiBaseUrl;
    if (kIsWeb) return 'http://localhost:3001';
    if (Platform.isAndroid) return 'http://10.0.2.2:3001';
    return 'http://localhost:3001';
  }

  static const String appTitle = 'eGEOPOLIS';
  static const String tokenKey = 'nf_token';
}
