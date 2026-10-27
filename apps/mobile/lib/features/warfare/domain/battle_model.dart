class TopFighter {
  final String citizenId;
  final String nickname;
  final String side; // 'ATTACKER' or 'DEFENDER'
  final int damage;
  final String? countryCode;
  final String? flagColor;

  TopFighter({
    required this.citizenId,
    required this.nickname,
    required this.side,
    required this.damage,
    this.countryCode,
    this.flagColor,
  });

  factory TopFighter.fromJson(Map<String, dynamic> json) {
    final citizen = (json['citizen'] is Map)
        ? json['citizen'] as Map<String, dynamic>
        : <String, dynamic>{};
    final country = (citizen['citizenshipCountry'] is Map)
        ? citizen['citizenshipCountry'] as Map<String, dynamic>
        : null;

    return TopFighter(
      citizenId: citizen['id'] as String? ?? json['citizenId'] as String? ?? '',
      nickname: citizen['nickname'] as String? ?? 'Citizen',
      side: json['side'] as String? ?? 'ATTACKER',
      damage: (json['damage'] as num?)?.toInt() ?? 0,
      countryCode: country?['code'] as String?,
      flagColor: country?['flagColor'] as String?,
    );
  }
}

class BattleModel {
  final String id;
  final String warId;
  final String regionId;
  final String regionName;
  final int currentRoundNumber;
  final int attackerScore;
  final int defenderScore;
  final double wall;
  final DateTime endsAt;
  final String attackerCountryName;
  final String attackerCountryCode;
  final String attackerFlagColor;
  final String defenderCountryName;
  final String defenderCountryCode;
  final String defenderFlagColor;
  final bool isTraining;
  final String warType; // 'DIRECT', 'RESISTANCE', 'CIVIL', 'TRAINING'
  final List<TopFighter> topFighters;

  BattleModel({
    required this.id,
    required this.warId,
    required this.regionId,
    required this.regionName,
    required this.currentRoundNumber,
    required this.attackerScore,
    required this.defenderScore,
    required this.wall,
    required this.endsAt,
    required this.attackerCountryName,
    required this.attackerCountryCode,
    required this.attackerFlagColor,
    required this.defenderCountryName,
    required this.defenderCountryCode,
    required this.defenderFlagColor,
    this.isTraining = false,
    this.warType = 'DIRECT',
    this.topFighters = const [],
  });

  BattleModel copyWith({
    String? id,
    String? warId,
    String? regionId,
    String? regionName,
    int? currentRoundNumber,
    int? attackerScore,
    int? defenderScore,
    double? wall,
    DateTime? endsAt,
    String? attackerCountryName,
    String? attackerCountryCode,
    String? attackerFlagColor,
    String? defenderCountryName,
    String? defenderCountryCode,
    String? defenderFlagColor,
    bool? isTraining,
    String? warType,
    List<TopFighter>? topFighters,
  }) {
    return BattleModel(
      id: id ?? this.id,
      warId: warId ?? this.warId,
      regionId: regionId ?? this.regionId,
      regionName: regionName ?? this.regionName,
      currentRoundNumber: currentRoundNumber ?? this.currentRoundNumber,
      attackerScore: attackerScore ?? this.attackerScore,
      defenderScore: defenderScore ?? this.defenderScore,
      wall: wall ?? this.wall,
      endsAt: endsAt ?? this.endsAt,
      attackerCountryName: attackerCountryName ?? this.attackerCountryName,
      attackerCountryCode: attackerCountryCode ?? this.attackerCountryCode,
      attackerFlagColor: attackerFlagColor ?? this.attackerFlagColor,
      defenderCountryName: defenderCountryName ?? this.defenderCountryName,
      defenderCountryCode: defenderCountryCode ?? this.defenderCountryCode,
      defenderFlagColor: defenderFlagColor ?? this.defenderFlagColor,
      isTraining: isTraining ?? this.isTraining,
      warType: warType ?? this.warType,
      topFighters: topFighters ?? this.topFighters,
    );
  }

  factory BattleModel.fromJson(Map<String, dynamic> raw) {
    // Unwraps {"battle": {...}, "wall": 50, ...} or {"war": {...}, "battle": {...}} or flat {...}
    final battleMap = (raw['battle'] is Map)
        ? raw['battle'] as Map<String, dynamic>
        : raw;

    final warMap = (battleMap['war'] is Map)
        ? battleMap['war'] as Map<String, dynamic>
        : (raw['war'] is Map)
            ? raw['war'] as Map<String, dynamic>
            : <String, dynamic>{};

    final regionMap = (battleMap['region'] is Map)
        ? battleMap['region'] as Map<String, dynamic>
        : <String, dynamic>{};

    final rounds = (battleMap['rounds'] as List? ?? []);
    final activeRound = rounds.isNotEmpty && rounds.first is Map
        ? rounds.first as Map<String, dynamic>
        : (battleMap['activeRound'] is Map)
            ? battleMap['activeRound'] as Map<String, dynamic>
            : <String, dynamic>{};

    final attacker = (battleMap['attackerCountry'] is Map)
        ? battleMap['attackerCountry'] as Map<String, dynamic>
        : (warMap['attackerCountry'] is Map)
            ? warMap['attackerCountry'] as Map<String, dynamic>
            : <String, dynamic>{};

    final defender = (battleMap['defenderCountry'] is Map)
        ? battleMap['defenderCountry'] as Map<String, dynamic>
        : (warMap['defenderCountry'] is Map)
            ? warMap['defenderCountry'] as Map<String, dynamic>
            : <String, dynamic>{};

    final wallVal = (raw['wall'] as num?)?.toDouble() ??
        (activeRound['wall'] as num?)?.toDouble() ??
        50.0;

    final roundNum = (battleMap['roundNumber'] as num?)?.toInt() ??
        (activeRound['number'] as num?)?.toInt() ??
        1;

    final attackerScore = (warMap['attackerWins'] as num?)?.toInt() ??
        (warMap['attackerScore'] as num?)?.toInt() ??
        0;

    final defenderScore = (warMap['defenderWins'] as num?)?.toInt() ??
        (warMap['defenderScore'] as num?)?.toInt() ??
        0;

    final isTraining = (warMap['config'] is Map && (warMap['config'] as Map)['training'] == true) ||
        raw['isTraining'] == true ||
        battleMap['isTraining'] == true;

    final warType = isTraining
        ? 'TRAINING'
        : (warMap['type'] as String? ?? raw['warType'] as String? ?? battleMap['warType'] as String? ?? 'DIRECT');

    final rawTop = raw['topFighters'] as List? ?? battleMap['topFighters'] as List? ?? [];
    final topList = <TopFighter>[];
    for (final item in rawTop) {
      if (item is Map<String, dynamic>) {
        topList.add(TopFighter.fromJson(item));
      } else if (item is Map) {
        topList.add(TopFighter.fromJson(Map<String, dynamic>.from(item)));
      }
    }

    return BattleModel(
      id: battleMap['id'] as String? ?? '',
      warId: battleMap['warId'] as String? ?? warMap['id'] as String? ?? '',
      regionId: battleMap['regionId'] as String? ?? '',
      regionName: regionMap['name'] as String? ??
          (isTraining ? 'Training Yard' : 'Active Front'),
      currentRoundNumber: roundNum,
      attackerScore: attackerScore,
      defenderScore: defenderScore,
      wall: wallVal,
      endsAt: DateTime.tryParse(activeRound['endsAt'] as String? ?? '') ??
          DateTime.now().add(const Duration(minutes: 45)),
      attackerCountryName: attacker['name'] as String? ?? (isTraining ? 'Team Beta' : 'Attacker'),
      attackerCountryCode: attacker['code'] as String? ?? (isTraining ? 'TMB' : 'ATK'),
      attackerFlagColor: attacker['flagColor'] as String? ?? '#ef4444',
      defenderCountryName: defender['name'] as String? ?? (isTraining ? 'Team Alpha' : 'Defender'),
      defenderCountryCode: defender['code'] as String? ?? (isTraining ? 'TMA' : 'DEF'),
      defenderFlagColor: defender['flagColor'] as String? ?? '#3b82f6',
      isTraining: isTraining,
      warType: warType,
      topFighters: topList,
    );
  }
}
