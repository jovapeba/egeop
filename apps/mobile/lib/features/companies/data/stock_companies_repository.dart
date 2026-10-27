import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final stockCompaniesRepositoryProvider = Provider<StockCompaniesRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return StockCompaniesRepository(dio);
});

class StockCompaniesRepository {
  final Dio _dio;

  StockCompaniesRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchStockCompanies() async {
    final response = await _dio.get('/stocks');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> fetchMyShares() async {
    final response = await _dio.get('/stocks/mine');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<Map<String, dynamic>> fetchStockDetail(String id) async {
    final response = await _dio.get('/stocks/$id');
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<void> createStockCompany({required String name, required int sharesTotal}) async {
    await _dio.post('/stocks', data: {
      'name': name,
      'sharesTotal': sharesTotal,
    });
  }

  Future<void> createOrder({
    required String jscId,
    required String side,
    required int quantity,
    required double price,
  }) async {
    await _dio.post('/stocks/$jscId/orders', data: {
      'side': side,
      'quantity': quantity,
      'price': price,
    });
  }

  Future<void> cancelOrder(String orderId) async {
    await _dio.post('/stocks/orders/$orderId/cancel');
  }

  Future<void> proposePoll({
    required String jscId,
    required String kind,
    required Map<String, dynamic> payload,
  }) async {
    await _dio.post('/stocks/$jscId/polls', data: {
      'kind': kind,
      'payload': payload,
    });
  }

  Future<void> votePoll({required String pollId, required bool yes}) async {
    await _dio.post('/stocks/polls/$pollId/vote', data: {
      'yes': yes,
    });
  }

  Future<void> donateGold({required String jscId, required double gold}) async {
    await _dio.post('/stocks/$jscId/donate', data: {
      'gold': gold,
    });
  }

  Future<void> rateStockCompany({required String jscId, required bool like}) async {
    await _dio.post('/ratings', data: {
      'targetType': 'STOCK_COMPANY',
      'targetId': jscId,
      'like': like,
    });
  }
}
