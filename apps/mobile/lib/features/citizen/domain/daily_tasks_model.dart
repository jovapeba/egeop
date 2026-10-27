class DailyTasksModel {
  final int day;
  final bool worked;
  final bool trained;
  final int foodUsed;
  final int foodLimit;
  final int energyUsed;
  final int energyLimit;
  final int pantryDaysLeft;
  final int fridgeDaysLeft;
  final bool adWatchUsed;
  final bool hasJob;
  final bool hiredToday;
  final bool canQuitJob;
  final String? companyName;

  DailyTasksModel({
    required this.day,
    required this.worked,
    required this.trained,
    required this.foodUsed,
    required this.foodLimit,
    required this.energyUsed,
    required this.energyLimit,
    required this.pantryDaysLeft,
    required this.fridgeDaysLeft,
    required this.adWatchUsed,
    this.hasJob = false,
    this.hiredToday = false,
    this.canQuitJob = true,
    this.companyName,
  });

  factory DailyTasksModel.fromJson(Map<String, dynamic> json) {
    final jobMap = json['job'] as Map<String, dynamic>?;
    return DailyTasksModel(
      day: (json['day'] as num?)?.toInt() ?? 1,
      worked: json['worked'] as bool? ?? false,
      trained: json['trained'] as bool? ?? false,
      foodUsed: (json['foodUsed'] as num?)?.toInt() ?? 0,
      foodLimit: (json['foodLimit'] as num?)?.toInt() ?? 20,
      energyUsed: (json['energyUsed'] as num?)?.toInt() ?? 0,
      energyLimit: (json['energyLimit'] as num?)?.toInt() ?? 20,
      pantryDaysLeft: (json['pantryDaysLeft'] as num?)?.toInt() ?? 0,
      fridgeDaysLeft: (json['fridgeDaysLeft'] as num?)?.toInt() ?? 0,
      adWatchUsed: json['adWatchUsed'] as bool? ?? false,
      hasJob: json['hasJob'] as bool? ?? (jobMap != null),
      hiredToday: json['hiredToday'] as bool? ?? false,
      canQuitJob: json['canQuitJob'] as bool? ?? true,
      companyName: jobMap?['companyName'] as String?,
    );
  }
}
