import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final statsRepositoryProvider = Provider<StatsRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return StatsRepository(dio);
});

class StatsRepository {
  final Dio _dio;

  StatsRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchCountries() async {
    final response = await _dio.get('/stats/countries');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> fetchArmies() async {
    final response = await _dio.get('/stats/armies');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> fetchCitizens() async {
    final response = await _dio.get('/stats/citizens');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> fetchDaily(int day) async {
    final response = await _dio.get('/stats/daily', queryParameters: {'day': day});
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }
}
