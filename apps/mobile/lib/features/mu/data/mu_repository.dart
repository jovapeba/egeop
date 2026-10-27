import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final muRepositoryProvider = Provider<MuRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return MuRepository(dio);
});

class MuRepository {
  final Dio _dio;

  MuRepository(this._dio);

  Future<Map<String, dynamic>?> fetchMine() async {
    try {
      final res = await _dio.get('/mu/mine');
      return res.data as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> fetchUnits({String? countryId}) async {
    try {
      final res = await _dio.get('/mu', queryParameters: {
        if (countryId != null) 'countryId': countryId,
      });
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> joinUnit(String muId) async {
    try {
      await _dio.post('/mu/$muId/join');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Join failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<void> leaveUnit() async {
    try {
      await _dio.post('/mu/leave');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Leave failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }
}
