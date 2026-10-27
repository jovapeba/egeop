import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final economyRepositoryProvider = Provider<EconomyRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return EconomyRepository(dio);
});

class EconomyRepository {
  final Dio _dio;

  EconomyRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchProductMarket({String? countryId, String? product}) async {
    try {
      final res = await _dio.get('/markets/product', queryParameters: {
        if (countryId != null) 'countryId': countryId,
        if (product != null) 'product': product,
      });
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> buyProduct(String offerId, int qty) async {
    try {
      await _dio.post('/markets/product/$offerId/buy', data: {'qty': qty});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Purchase failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<List<Map<String, dynamic>>> fetchMonetaryOffers() async {
    try {
      final res = await _dio.get('/markets/monetary');
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> fetchCompanies() async {
    try {
      final res = await _dio.get('/companies/mine');
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }
}
