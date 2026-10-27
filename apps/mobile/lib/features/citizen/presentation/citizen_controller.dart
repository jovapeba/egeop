import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/citizen_repository.dart';
import '../domain/citizen_model.dart';
import '../domain/daily_tasks_model.dart';

final citizenNotifierProvider =
    AsyncNotifierProvider<CitizenNotifier, CitizenModel?>(() {
  return CitizenNotifier();
});

class CitizenNotifier extends AsyncNotifier<CitizenModel?> {
  @override
  Future<CitizenModel?> build() async {
    try {
      final repo = ref.watch(citizenRepositoryProvider);
      return await repo.fetchMe();
    } catch (_) {
      return null;
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final repo = ref.read(citizenRepositoryProvider);
      return await repo.fetchMe();
    });
  }
}

final dailyTasksNotifierProvider =
    AsyncNotifierProvider<DailyTasksNotifier, DailyTasksModel?>(() {
  return DailyTasksNotifier();
});

class DailyTasksNotifier extends AsyncNotifier<DailyTasksModel?> {
  @override
  Future<DailyTasksModel?> build() async {
    try {
      final repo = ref.watch(citizenRepositoryProvider);
      return await repo.fetchDailyTasks();
    } catch (_) {
      return null;
    }
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() async {
      final repo = ref.read(citizenRepositoryProvider);
      return await repo.fetchDailyTasks();
    });
  }

  Future<void> work() async {
    final repo = ref.read(citizenRepositoryProvider);
    await repo.work();
    await refresh();
    await ref.read(citizenNotifierProvider.notifier).refresh();
  }

  Future<void> train() async {
    final repo = ref.read(citizenRepositoryProvider);
    await repo.train();
    await refresh();
    await ref.read(citizenNotifierProvider.notifier).refresh();
  }

  Future<void> consume(String kind, int quality, int qty) async {
    final repo = ref.read(citizenRepositoryProvider);
    await repo.consume(kind: kind, quality: quality, qty: qty);
    await refresh();
    await ref.read(citizenNotifierProvider.notifier).refresh();
  }

  Future<void> watchAd() async {
    final repo = ref.read(citizenRepositoryProvider);
    await repo.watchAd();
    await refresh();
    await ref.read(citizenNotifierProvider.notifier).refresh();
  }
}

final storageProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(citizenRepositoryProvider);
  return repo.fetchStorage();
});
