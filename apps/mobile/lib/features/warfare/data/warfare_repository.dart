import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../domain/battle_model.dart';

final warfareRepositoryProvider = Provider<WarfareRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return WarfareRepository(dio);
});

class WarfareRepository {
  final Dio _dio;

  WarfareRepository(this._dio);

  Future<List<BattleModel>> fetchActiveWars() async {
    try {
      final res = await _dio.get('/wars');
      final wars = (res.data as List).cast<Map<String, dynamic>>();
      final battles = <BattleModel>[];

      for (final w in wars) {
        final bList = w['battles'] as List? ?? [];
        for (final b in bList) {
          final bMap = Map<String, dynamic>.from(b as Map);
          bMap['war'] = w;
          battles.add(BattleModel.fromJson(bMap));
        }
      }
      return battles;
    } catch (_) {
      return [];
    }
  }

  Future<BattleModel?> fetchTrainingYard() async {
    try {
      final res = await _dio.get('/wars/training');
      if (res.data == null) return null;
      final data = Map<String, dynamic>.from(res.data as Map);
      return BattleModel.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  Future<BattleModel> fetchBattleDetail(String battleId) async {
    final res = await _dio.get('/wars/battles/$battleId');
    return BattleModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> fight({
    required String battleId,
    required String side,
    required String mode,
    int? weaponQuality,
  }) async {
    try {
      final res = await _dio.post('/wars/battles/$battleId/fight', data: {
        'side': side,
        'mode': mode,
        if (weaponQuality != null && weaponQuality > 0)
          'weaponQuality': weaponQuality,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Fight failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<List<Map<String, dynamic>>> fetchBuffs() async {
    try {
      final res = await _dio.get('/buffs/mine');
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> buyBuff(String type) async {
    try {
      await _dio.post('/buffs', data: {'type': type});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Buff activation failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }
}
