import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return ProfileRepository(dio);
});

class ProfileRepository {
  final Dio _dio;

  ProfileRepository(this._dio);

  Future<Map<String, dynamic>> fetchFriends() async {
    final response = await _dio.get('/friends');
    return Map<String, dynamic>.from(response.data as Map? ?? {});
  }

  Future<void> addFriend(String nickname) async {
    await _dio.post('/friends', data: {'nickname': nickname});
  }

  Future<void> acceptFriend(String id) async {
    await _dio.post('/friends/$id/accept');
  }

  Future<void> removeFriend(String id) async {
    await _dio.delete('/friends/$id');
  }

  Future<Map<String, dynamic>> fetchThread(String nickname) async {
    final response = await _dio.get('/friends/pm/$nickname');
    return Map<String, dynamic>.from(response.data as Map? ?? {});
  }

  Future<void> sendPm(String nickname, String body) async {
    await _dio.post('/friends/pm/$nickname', data: {'body': body});
  }

  Future<Map<String, dynamic>> fetchPacks() async {
    final response = await _dio.get('/citizens/me/packs');
    return Map<String, dynamic>.from(response.data as Map? ?? {});
  }

  Future<void> buyPack(String key) async {
    await _dio.post('/citizens/me/packs/$key');
  }

  Future<void> updateSettings({
    required String avatarColor,
    required String guide,
    required bool enableTutorial,
    List<String>? shortcuts,
  }) async {
    await _dio.patch('/citizens/me/settings', data: {
      'avatarColor': avatarColor,
      'guide': guide,
      'enableTutorial': enableTutorial,
      'shortcuts': ?shortcuts,
    });
  }
}
