import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final dio = ref.watch(dioProvider);
  final tokenStorage = ref.watch(tokenStorageProvider);
  return AuthRepository(dio, tokenStorage);
});

class AuthRepository {
  final Dio _dio;
  final TokenStorage _tokenStorage;

  AuthRepository(this._dio, this._tokenStorage);

  Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final res = await _dio.post('/auth/login', data: {
        'email': email,
        'password': password,
      });
      final data = res.data as Map<String, dynamic>;
      final token = (data['accessToken'] ?? data['token']) as String?;
      if (token != null) {
        await _tokenStorage.saveToken(token);
      }
      return data;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Login failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String nickname,
    required String countryId,
    String? referralCode,
    String? sharedIpNickname,
  }) async {
    try {
      final res = await _dio.post('/auth/register', data: {
        'email': email,
        'password': password,
        'nickname': nickname,
        'countryId': countryId,
        if (referralCode != null && referralCode.isNotEmpty)
          'referralCode': referralCode,
        if (sharedIpNickname != null && sharedIpNickname.isNotEmpty)
          'sharedIpNickname': sharedIpNickname,
      });
      final data = res.data as Map<String, dynamic>;
      final token = (data['accessToken'] ?? data['token']) as String?;
      if (token != null) {
        await _tokenStorage.saveToken(token);
      }
      return data;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Registration failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<List<Map<String, dynamic>>> fetchCountries() async {
    try {
      final res = await _dio.get('/auth/countries');
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> logout() async {
    await _tokenStorage.clearToken();
  }

  Future<bool> hasToken() async {
    final token = await _tokenStorage.getToken();
    return token != null && token.isNotEmpty;
  }
}
