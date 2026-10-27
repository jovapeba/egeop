import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final equipmentRepositoryProvider = Provider<EquipmentRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return EquipmentRepository(dio);
});

class EquipmentRepository {
  final Dio _dio;

  EquipmentRepository(this._dio);

  Future<Map<String, dynamic>> fetchMine() async {
    try {
      final res = await _dio.get('/equipment/mine');
      return res.data as Map<String, dynamic>;
    } catch (_) {
      return {'equipped': [], 'backpack': []};
    }
  }

  Future<void> equip(String id) async {
    try {
      await _dio.post('/equipment/$id/equip');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Equip failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<void> unequip(String id) async {
    try {
      await _dio.delete('/equipment/equipped/$id/unequip');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Unequip failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>> merge(List<String> itemIds) async {
    try {
      final res = await _dio.post('/equipment/merge', data: {'itemIds': itemIds});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Merge failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>> split(String id) async {
    try {
      final res = await _dio.post('/equipment/$id/split');
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Split failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>> upgradeParam(String id, String paramType) async {
    try {
      final res = await _dio.post('/equipment/$id/upgrade-param', data: {'paramType': paramType});
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Upgrade failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }
}
