import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final eventsRepositoryProvider = Provider<EventsRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return EventsRepository(dio);
});

class EventsRepository {
  final Dio _dio;

  EventsRepository(this._dio);

  Future<List<Map<String, dynamic>>> fetchTournaments() async {
    final response = await _dio.get('/events');
    final list = response.data as List? ?? [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> registerTeam(String tournamentId, {String? teamName}) async {
    await _dio.post('/events/$tournamentId/register', data: {
      if (teamName != null && teamName.isNotEmpty) 'name': teamName,
    });
  }
}
