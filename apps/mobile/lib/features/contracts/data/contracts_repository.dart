import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final contractsRepositoryProvider = Provider<ContractsRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return ContractsRepository(dio);
});

class ContractsRepository {
  final Dio _dio;

  ContractsRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchContracts() async {
    final response = await _dio.get('/contracts');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<List<Map<String, dynamic>>> fetchAudit() async {
    final response = await _dio.get('/contracts/audit');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> createLoan({required double amountGold, required int durationDays, required double interestPct}) async {
    await _dio.post('/contracts/loans', data: {
      'amountGold': amountGold,
      'durationDays': durationDays,
      'interestPct': interestPct,
    });
  }

  Future<void> createPack({required double amountGold, required double priceGold}) async {
    await _dio.post('/contracts/packs', data: {
      'amountGold': amountGold,
      'priceGold': priceGold,
    });
  }

  Future<void> acceptContract(String id) async {
    await _dio.post('/contracts/$id/accept');
  }

  Future<void> repayContract(String id) async {
    await _dio.post('/contracts/$id/repay');
  }
}
