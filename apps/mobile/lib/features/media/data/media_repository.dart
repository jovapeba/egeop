import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final mediaRepositoryProvider = Provider<MediaRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return MediaRepository(dio);
});

class MediaRepository {
  final Dio _dio;

  MediaRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchArticles() async {
    final response = await _dio.get('/media/articles');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> publishArticle({required String title, required String body, required String scope}) async {
    await _dio.post('/media/articles', data: {
      'title': title,
      'body': body,
      'scope': scope,
    });
  }

  Future<void> upvoteArticle(String articleId) async {
    await _dio.post('/media/articles/$articleId/upvote');
  }

  Future<void> tipArticle(String articleId, {int gold = 1}) async {
    await _dio.post('/media/articles/$articleId/tip', data: {'gold': gold});
  }

  Future<Map<String, dynamic>?> fetchMyNewspaper() async {
    final response = await _dio.get('/media/portal');
    if (response.data == null) return null;
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> createNewspaper({required String name, required String avatarColor}) async {
    await _dio.post('/media/portal', data: {
      'name': name,
      'avatarColor': avatarColor,
    });
  }

  Future<List<Map<String, dynamic>>> fetchShouts() async {
    final response = await _dio.get('/media/shouts?take=40');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> postShout(String content, {String scope = 'GLOBAL'}) async {
    await _dio.post('/media/shouts', data: {
      'content': content,
      'scope': scope,
    });
  }

  Future<List<Map<String, dynamic>>> fetchPortals() async {
    final response = await _dio.get('/media/portals');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> subscribeToPortal(String newspaperId) async {
    await _dio.post('/media/portals/$newspaperId/subscribe');
  }
}
