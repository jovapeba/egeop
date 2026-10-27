import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final workRepositoryProvider = Provider<WorkRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return WorkRepository(dio);
});

class WorkRepository {
  final Dio _dio;

  WorkRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchJobOffers() async {
    final response = await _dio.get('/companies/jobs');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> applyForJob(String offerId) async {
    await _dio.post('/companies/jobs/$offerId/apply');
  }

  Future<void> quitJob() async {
    await _dio.post('/companies/jobs/quit');
  }

  Future<Map<String, dynamic>> workShift() async {
    final response = await _dio.post('/actions/work');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<Map<String, dynamic>> trainGym() async {
    final response = await _dio.post('/actions/train');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> consume(String kind, int quality, {int qty = 1}) async {
    await _dio.post('/actions/consume', data: {
      'kind': kind,
      'quality': quality,
      'qty': qty,
    });
  }
}
