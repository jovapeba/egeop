import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final politicsRepositoryProvider = Provider<PoliticsRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return PoliticsRepository(dio);
});

class PoliticsRepository {
  final Dio _dio;

  PoliticsRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchActiveLaws(String countryId) async {
    try {
      final res = await _dio.get('/politics/laws', queryParameters: {'countryId': countryId});
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> voteLaw(String lawId, bool yes) async {
    try {
      await _dio.post('/politics/laws/$lawId/vote', data: {'yes': yes});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Vote failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<void> proposeLaw(String type, Map<String, dynamic> payload) async {
    try {
      await _dio.post('/politics/laws', data: {'type': type, 'payload': payload});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Proposal failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<Map<String, dynamic>?> fetchTreasury(String countryId) async {
    try {
      final res = await _dio.get('/politics/treasury', queryParameters: {'countryId': countryId});
      return res.data as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> fetchElections(String countryId) async {
    try {
      final res = await _dio.get('/politics/elections', queryParameters: {'countryId': countryId});
      return res.data as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>> fetchParties(String countryId) async {
    try {
      final res = await _dio.get('/politics/parties', queryParameters: {'countryId': countryId});
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> createParty(String name) async {
    try {
      await _dio.post('/politics/parties', data: {'name': name});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Founding party failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<void> joinParty(String partyId) async {
    try {
      await _dio.post('/politics/parties/$partyId/join');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Join party failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<void> leaveParty() async {
    try {
      await _dio.post('/politics/parties/leave');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Leave party failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<void> submitCandidacy(String electionId, {String? presentation}) async {
    try {
      await _dio.post('/politics/elections/$electionId/candidacy', data: {
        if (presentation != null && presentation.isNotEmpty) 'presentation': presentation,
      });
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Candidacy submission failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }

  Future<void> voteElection(String electionId, String candidateId) async {
    try {
      await _dio.post('/politics/elections/$electionId/vote', data: {'candidateId': candidateId});
    } on DioException catch (e) {
      final msg = e.response?.data?['message'] ?? e.message ?? 'Vote failed';
      throw Exception(msg is List ? msg.join(', ') : msg);
    }
  }
}
