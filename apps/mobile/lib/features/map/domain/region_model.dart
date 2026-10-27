class RegionModel {
  final String id;
  final String name;
  final String countryId;
  final String coreCountryId;
  final bool isCapital;
  final String? resource;
  final String density;
  final double x;
  final double y;
  final String countryName;
  final String countryCode;
  final String flagColor;
  final List<String> battleIds;

  RegionModel({
    required this.id,
    required this.name,
    required this.countryId,
    required this.coreCountryId,
    required this.isCapital,
    this.resource,
    required this.density,
    required this.x,
    required this.y,
    required this.countryName,
    required this.countryCode,
    required this.flagColor,
    required this.battleIds,
  });

  factory RegionModel.fromJson(Map<String, dynamic> json) {
    final country = json['country'] as Map<String, dynamic>? ?? {};
    final battles = (json['battles'] as List? ?? [])
        .map((b) => (b as Map<String, dynamic>)['id'] as String? ?? '')
        .where((id) => id.isNotEmpty)
        .toList();

    return RegionModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Region',
      countryId: json['countryId'] as String? ?? '',
      coreCountryId: json['coreCountryId'] as String? ?? '',
      isCapital: json['isCapital'] as bool? ?? false,
      resource: json['resource'] as String?,
      density: json['density'] as String? ?? 'MEDIUM',
      x: (json['x'] as num?)?.toDouble() ?? 0.0,
      y: (json['y'] as num?)?.toDouble() ?? 0.0,
      countryName: country['name'] as String? ?? 'Nation',
      countryCode: country['code'] as String? ?? 'XX',
      flagColor: country['flagColor'] as String? ?? '#3b82f6',
      battleIds: battles,
    );
  }
}

class CountryModel {
  final String id;
  final String name;
  final String code;
  final String flagColor;

  CountryModel({
    required this.id,
    required this.name,
    required this.code,
    required this.flagColor,
  });

  factory CountryModel.fromJson(Map<String, dynamic> json) {
    return CountryModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      code: json['code'] as String? ?? '',
      flagColor: json['flagColor'] as String? ?? '#3b82f6',
    );
  }
}

class WorldMapData {
  final List<RegionModel> regions;
  final List<CountryModel> countries;

  WorldMapData({
    required this.regions,
    required this.countries,
  });
}
