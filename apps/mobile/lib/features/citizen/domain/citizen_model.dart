class CitizenModel {
  final String id;
  final String nickname;
  final int level;
  final int xp;
  final int hp;
  final double strength;
  final double ecoSkill;
  final bool isAdmin;
  final double totalDamage;
  final int firstAidKits;
  final double gold;
  final double walletFiat;
  final String rankName;
  final double rankBonusPct;
  final String countryId;
  final String countryName;
  final String countryCode;
  final String flagColor;
  final String currencySymbol;
  final String locationRegionId;
  final String locationRegionName;
  final int foodLimit;
  final int energyLimit;
  final String avatarColor;
  final String guide;
  final bool enableTutorial;
  final List<String> shortcuts;

  CitizenModel({
    required this.id,
    required this.nickname,
    required this.level,
    required this.xp,
    required this.hp,
    required this.strength,
    required this.ecoSkill,
    required this.isAdmin,
    required this.totalDamage,
    required this.firstAidKits,
    required this.gold,
    required this.walletFiat,
    required this.rankName,
    required this.rankBonusPct,
    required this.countryId,
    required this.countryName,
    required this.countryCode,
    required this.flagColor,
    required this.currencySymbol,
    required this.locationRegionId,
    required this.locationRegionName,
    required this.foodLimit,
    required this.energyLimit,
    required this.avatarColor,
    required this.guide,
    required this.enableTutorial,
    required this.shortcuts,
  });

  factory CitizenModel.fromJson(Map<String, dynamic> json) {
    final rank = json['militaryRank'] as Map<String, dynamic>? ?? {};
    final country = json['citizenshipCountry'] as Map<String, dynamic>? ?? {};
    final location = json['locationRegion'] as Map<String, dynamic>? ?? {};

    return CitizenModel(
      id: json['id'] as String? ?? '',
      nickname: json['nickname'] as String? ?? 'Citizen',
      level: (json['level'] as num?)?.toInt() ?? 1,
      xp: (json['xp'] as num?)?.toInt() ?? 0,
      hp: (json['hp'] as num?)?.toInt() ?? 100,
      strength: (json['strength'] as num?)?.toDouble() ?? 10.0,
      ecoSkill: (json['ecoSkill'] as num?)?.toDouble() ?? 1.0,
      isAdmin: json['isAdmin'] as bool? ?? false,
      totalDamage: (json['totalDamage'] as num?)?.toDouble() ?? 0.0,
      firstAidKits: (json['firstAidKits'] as num?)?.toInt() ?? 0,
      gold: ((json['gold'] as num?)?.toDouble() ?? 0.0) / 100.0,
      walletFiat: ((json['walletFiat'] as num?)?.toDouble() ?? 0.0) / 100.0,
      rankName: rank['name'] as String? ?? 'Recruit',
      rankBonusPct: ((rank['bonusPct'] as num?)?.toDouble() ?? 0.0) <= 1.0
          ? ((rank['bonusPct'] as num?)?.toDouble() ?? 0.0) * 100
          : ((rank['bonusPct'] as num?)?.toDouble() ?? 0.0),
      countryId: country['id'] as String? ?? '',
      countryName: country['name'] as String? ?? 'Nation',
      countryCode: country['code'] as String? ?? 'XX',
      flagColor: country['flagColor'] as String? ?? '#3b82f6',
      currencySymbol: country['currencySymbol'] as String? ?? 'CC',
      locationRegionId: location['id'] as String? ?? '',
      locationRegionName: location['name'] as String? ?? 'Capital',
      foodLimit: (json['foodLimit'] as num?)?.toInt() ?? 20,
      energyLimit: (json['energyLimit'] as num?)?.toInt() ?? 20,
      avatarColor: json['avatarColor'] as String? ?? '#4cc38a',
      guide: json['guide'] as String? ?? 'MAN',
      enableTutorial: json['enableTutorial'] as bool? ?? true,
      shortcuts: (json['shortcuts'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
    );
  }
}
