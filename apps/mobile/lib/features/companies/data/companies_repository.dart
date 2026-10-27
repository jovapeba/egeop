import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final companiesRepositoryProvider = Provider<CompaniesRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return CompaniesRepository(dio);
});

class CompaniesRepository {
  final Dio _dio;

  CompaniesRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchMyCompanies() async {
    final response = await _dio.get('/companies/mine');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> fetchMarketCompanies() async {
    final response = await _dio.get('/companies/market');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> createCompany({required String name, required String product, String? regionId}) async {
    await _dio.post('/companies', data: {
      'name': name,
      'product': product,
      if (regionId != null && regionId.isNotEmpty) 'regionId': regionId,
    });
  }

  Future<void> upgradeCompany(String id) async {
    await _dio.post('/companies/$id/upgrade');
  }

  Future<void> postJob(String id, {required double minEcoSkill, required double salary}) async {
    await _dio.post('/companies/$id/jobs', data: {
      'minEcoSkill': minEcoSkill,
      'salary': salary,
    });
  }

  Future<void> listForSale(String id, {required double price}) async {
    await _dio.post('/companies/$id/sale', data: {
      'price': price,
    });
  }

  Future<void> depositResource(String id, {required String product, required int quality, required int qty}) async {
    await _dio.post('/companies/$id/deposit', data: {
      'product': product,
      'quality': quality,
      'qty': qty,
    });
  }

  Future<void> buyCompany(String id) async {
    await _dio.post('/companies/$id/buy');
  }
}
