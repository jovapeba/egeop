import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../domain/region_model.dart';

final mapRepositoryProvider = Provider<MapRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return MapRepository(dio);
});

class MapRepository {
  final Dio _dio;

  MapRepository(this._dio);

  Future<WorldMapData> fetchWorldMap() async {
    try {
      final res = await _dio.get('/citizens/map');
      final data = res.data;
      final List rawRegions;
      final List rawCountries;
      if (data is Map) {
        rawRegions = data['regions'] is List ? data['regions'] as List : [];
        rawCountries = data['countries'] is List ? data['countries'] as List : [];
      } else if (data is List) {
        rawRegions = data;
        rawCountries = [];
      } else {
        rawRegions = [];
        rawCountries = [];
      }
      return WorldMapData(
        regions: rawRegions.map((m) => RegionModel.fromJson(Map<String, dynamic>.from(m as Map))).toList(),
        countries: rawCountries.map((c) => CountryModel.fromJson(Map<String, dynamic>.from(c as Map))).toList(),
      );
    } catch (_) {
      return WorldMapData(regions: [], countries: []);
    }
  }

  Future<List<RegionModel>> fetchMap() async {
    final world = await fetchWorldMap();
    return world.regions;
  }

  Future<Map<String, dynamic>> travel({
    required String regionId,
    required int ticketQuality,
  }) async {
    try {
      final res = await _dio.post('/citizens/me/travel', data: {
        'regionId': regionId,
        'ticketQuality': ticketQuality,
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Travel failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }
}
