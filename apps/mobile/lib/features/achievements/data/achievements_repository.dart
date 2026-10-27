import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final achievementsRepositoryProvider = Provider<AchievementsRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return AchievementsRepository(dio);
});

class AchievementsRepository {
  final Dio _dio;

  AchievementsRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchAchievements() async {
    final response = await _dio.get('/citizens/me/achievements');
    final data = response.data as Map? ?? {};
    final list = data['subcategories'] as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }
}
