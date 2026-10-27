import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_config.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage();
});

class TokenStorage extends ChangeNotifier {
  static bool hasExplicitlyLoggedOut = false;
  final _storage = const FlutterSecureStorage();
  String? _inMemoryToken;

  Future<void> saveToken(String token) async {
    hasExplicitlyLoggedOut = false;
    _inMemoryToken = token;
    try {
      await _storage.write(key: AppConfig.tokenKey, value: token);
    } catch (_) {
      // Fallback in environments without secure keychain
    }
    notifyListeners();
  }

  Future<String?> getToken() async {
    if (_inMemoryToken != null) return _inMemoryToken;
    try {
      _inMemoryToken = await _storage.read(key: AppConfig.tokenKey);
    } catch (_) {
      _inMemoryToken = null;
    }
    return _inMemoryToken;
  }

  Future<void> clearToken() async {
    hasExplicitlyLoggedOut = true;
    _inMemoryToken = null;
    try {
      await _storage.delete(key: AppConfig.tokenKey);
    } catch (_) {
      // Ignore
    }
    notifyListeners();
  }
}
