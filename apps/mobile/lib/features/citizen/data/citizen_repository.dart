import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../domain/citizen_model.dart';
import '../domain/daily_tasks_model.dart';

final citizenRepositoryProvider = Provider<CitizenRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return CitizenRepository(dio);
});

class CitizenRepository {
  final Dio _dio;

  CitizenRepository(this._dio);

  Future<CitizenModel> fetchMe() async {
    final res = await _dio.get('/auth/me');
    return CitizenModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<DailyTasksModel> fetchDailyTasks() async {
    final res = await _dio.get('/actions/daily-tasks');
    return DailyTasksModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> work() async {
    try {
      final res = await _dio.post('/actions/work');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Work failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>> train() async {
    try {
      final res = await _dio.post('/actions/train');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Train failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>> consume({
    required String kind,
    required int quality,
    required int qty,
  }) async {
    try {
      final res = await _dio.post('/actions/consume', data: {
        'kind': kind,
        'quality': quality,
        'qty': qty,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Consume failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>> watchAd() async {
    final res = await _dio.post('/actions/watch-ad');
    return res.data as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> fetchStorage() async {
    final res = await _dio.get('/citizens/me/storage');
    return (res.data as List).cast<Map<String, dynamic>>();
  }
}
