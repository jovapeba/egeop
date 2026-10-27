import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final auctionsRepositoryProvider = Provider<AuctionsRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return AuctionsRepository(dio);
});

class AuctionsRepository {
  final Dio _dio;

  AuctionsRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchAuctions() async {
    try {
      final res = await _dio.get('/auctions');
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> bid(String auctionId, double amountGold) async {
    try {
      await _dio.post('/auctions/$auctionId/bid', data: {'amountGold': amountGold});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Bid failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }
}
