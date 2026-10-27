import 'dart:io';
import 'package:flutter/foundation.dart';

class AppConfig {
  /// Default backend API URL.
  /// Android emulator uses 10.0.2.2 to reach host localhost.
  /// iOS simulator, macOS, and Web use localhost.
  static String get apiBaseUrl {
    if (kIsWeb) return 'http://localhost:3001';
    if (Platform.isAndroid) return 'http://10.0.2.2:3001';
    return 'http://localhost:3001';
  }

  static String get wsBaseUrl {
    if (kIsWeb) return 'http://localhost:3001';
    if (Platform.isAndroid) return 'http://10.0.2.2:3001';
    return 'http://localhost:3001';
  }

  static const String appTitle = 'eGEOPOLIS';
  static const String tokenKey = 'nf_token';
}
