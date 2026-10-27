import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_drawing/path_drawing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/map_repository.dart';
import '../data/world_countries_data.dart';
import '../domain/region_model.dart';
import 'region_inspector_sheet.dart';

final worldMapDataProvider = FutureProvider<WorldMapData>((ref) async {
  final repo = ref.watch(mapRepositoryProvider);
  return repo.fetchWorldMap();
});

final worldMapProvider = FutureProvider<List<RegionModel>>((ref) async {
  final repo = ref.watch(mapRepositoryProvider);
  return repo.fetchMap();
});

class WorldMapPathCache {
  static final Map<String, Path> _paths = {};
  static bool _initialized = false;

  static Map<String, Path> get paths {
    if (!_initialized) {
      for (final c in worldCountries) {
        try {
          _paths[c.code] = parseSvgPathData(c.d);
        } catch (_) {}
      }
      _initialized = true;
    }
    return _paths;
  }

  static WorldCountryData? findCountryByTap(Offset tapPoint) {
    final all = paths;
    for (final c in worldCountries) {
      if (tapPoint.dx >= c.bbox[0] - 5 &&
          tapPoint.dx <= c.bbox[2] + 5 &&
          tapPoint.dy >= c.bbox[1] - 5 &&
          tapPoint.dy <= c.bbox[3] + 5) {
        final p = all[c.code];
        if (p != null && p.contains(tapPoint)) {
          return c;
        }
      }
    }
    return null;
  }
}

class WorldMapScreen extends ConsumerStatefulWidget {
  const WorldMapScreen({super.key});

  @override
  ConsumerState<WorldMapScreen> createState() => _WorldMapScreenState();
}

class _WorldMapScreenState extends ConsumerState<WorldMapScreen> {
  final TransformationController _transformController = TransformationController();
  final TextEditingController _searchController = TextEditingController();
  bool _showSearch = false;
  String _searchQuery = '';
  String? _selectedCountryCode;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _jumpTo(0.65, 1000.0, 480.0);
      }
    });
  }

  static const _continents = [
    {'name': 'World', 'scale': 0.65, 'cx': 1000.0, 'cy': 480.0},
    {'name': 'Europe', 'scale': 2.8, 'cx': 1060.0, 'cy': 190.0},
    {'name': 'Asia', 'scale': 1.8, 'cx': 1530.0, 'cy': 320.0},
    {'name': 'N. America', 'scale': 1.8, 'cx': 460.0, 'cy': 220.0},
    {'name': 'S. America', 'scale': 2.0, 'cx': 620.0, 'cy': 620.0},
    {'name': 'Africa', 'scale': 1.9, 'cx': 1100.0, 'cy': 460.0},
    {'name': 'Oceania', 'scale': 2.2, 'cx': 1750.0, 'cy': 550.0},
  ];

  void _jumpTo(double scale, double cx, double cy) {
    final viewportSize = MediaQuery.of(context).size;
    final dx = viewportSize.width / 2 - cx * scale;
    final dy = viewportSize.height / 2 - cy * scale;

    final matrix = Matrix4.identity()
      ..setTranslationRaw(dx, dy, 0.0)
      ..multiply(Matrix4.diagonal3Values(scale, scale, 1.0));
    _transformController.value = matrix;
  }

  void _zoomIn() {
    final matrix = _transformController.value.clone();
    matrix.multiply(Matrix4.diagonal3Values(1.3, 1.3, 1.0));
    _transformController.value = matrix;
  }

  void _zoomOut() {
    final matrix = _transformController.value.clone();
    matrix.multiply(Matrix4.diagonal3Values(0.77, 0.77, 1.0));
    _transformController.value = matrix;
  }

  void _resetView() {
    _jumpTo(1.0, 1000.0, 500.0);
  }

  void _onTapCanvas(Offset localOffset, Map<String, CountryModel> activeMap, List<RegionModel> regions) {
    // 1. Check if a region pin was near the tap
    for (final r in regions) {
      if ((localOffset.dx - r.x).abs() < 24 && (localOffset.dy - r.y).abs() < 24) {
        showModalBottomSheet(
          context: context,
          backgroundColor: Colors.transparent,
          isScrollControlled: true,
          builder: (_) => RegionInspectorSheet(region: r),
        );
        return;
      }
    }

    // 2. Check if a country was tapped
    final country = WorldMapPathCache.findCountryByTap(localOffset);
    if (country != null) {
      setState(() => _selectedCountryCode = country.code);
      final active = activeMap[country.code];
      if (active == null) {
        // Inactive country tapped
        showModalBottomSheet(
          context: context,
          backgroundColor: Colors.transparent,
          builder: (_) => _InactiveTerritorySheet(country: country),
        );
      } else {
        // Active country tapped: find capital or first region
        final countryRegions = regions.where((r) => r.countryCode == country.code).toList();
        final capital = countryRegions.firstWhere((r) => r.isCapital, orElse: () => countryRegions.first);
        showModalBottomSheet(
          context: context,
          backgroundColor: Colors.transparent,
          isScrollControlled: true,
          builder: (_) => RegionInspectorSheet(region: capital),
        );
      }
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _transformController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mapDataAsync = ref.watch(worldMapDataProvider);
    final citizen = ref.watch(citizenNotifierProvider).value;

    return Scaffold(
      backgroundColor: const Color(0xFF070B12),
      body: Stack(
        children: [
          // 1. Interactive Map Viewport with World Countries & Regions
          mapDataAsync.when(
            data: (mapData) {
              final activeMap = {for (final c in mapData.countries) c.code: c};
              final activeFlagColors = {for (final c in mapData.countries) c.code: c.flagColor};
              final battleCountryCodes = <String>{};
              for (final r in mapData.regions) {
                if (r.battleIds.isNotEmpty) {
                  battleCountryCodes.add(r.countryCode);
                }
              }

              return InteractiveViewer(
                transformationController: _transformController,
                minScale: 0.4,
                maxScale: 6.0,
                boundaryMargin: const EdgeInsets.all(600),
                child: SizedBox(
                  width: 2000,
                  height: 1000,
                  child: GestureDetector(
                    onTapUp: (details) => _onTapCanvas(details.localPosition, activeMap, mapData.regions),
                    child: Stack(
                      children: [
                        // Background Ocean Grid + All 68 Countries (Active in Flag Color, Inactive in Tactical Grey)
                        CustomPaint(
                          size: const Size(2000, 1000),
                          painter: WorldCountriesPainter(
                            activeCountryColors: activeFlagColors,
                            selectedCountryCode: _selectedCountryCode,
                            battleCountryCodes: battleCountryCodes,
                          ),
                        ),

                        // Region Markers & Capital Stars
                        ...mapData.regions.map((r) {
                          final isPlayerHere = citizen?.locationRegionId == r.id;
                          final hasBattle = r.battleIds.isNotEmpty;
                          final isCap = r.isCapital;

                          return Positioned(
                            left: r.x > 0 ? r.x - 20 : 500,
                            top: r.y > 0 ? r.y - 20 : 300,
                            child: GestureDetector(
                              onTap: () {
                                setState(() => _selectedCountryCode = r.countryCode);
                                showModalBottomSheet(
                                  context: context,
                                  backgroundColor: Colors.transparent,
                                  isScrollControlled: true,
                                  builder: (_) => RegionInspectorSheet(region: r),
                                );
                              },
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      // Active Battle Ping
                                      if (hasBattle)
                                        Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: AppColors.crimson.withValues(alpha: 0.35),
                                            border: Border.all(color: AppColors.crimson, width: 1.5),
                                          ),
                                        ),
                                      // Player Location Halo
                                      if (isPlayerHere)
                                        Container(
                                          width: 34,
                                          height: 34,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: AppColors.emerald.withValues(alpha: 0.35),
                                            border: Border.all(color: AppColors.emerald, width: 1.5),
                                          ),
                                        ),
                                      // Main Pin Circle
                                      Container(
                                        width: isCap ? 22 : (isPlayerHere || hasBattle ? 18 : 12),
                                        height: isCap ? 22 : (isPlayerHere || hasBattle ? 18 : 12),
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: isPlayerHere
                                              ? AppColors.emerald
                                              : hasBattle
                                                  ? AppColors.crimson
                                                  : isCap
                                                      ? const Color(0xFFF59E0B)
                                                      : Colors.white,
                                          border: Border.all(
                                            color: Colors.white,
                                            width: isCap ? 2.0 : 1.2,
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: (isPlayerHere
                                                      ? AppColors.emerald
                                                      : hasBattle
                                                          ? AppColors.crimson
                                                          : isCap
                                                              ? const Color(0xFFF59E0B)
                                                              : AppColors.cyan)
                                                  .withValues(alpha: 0.6),
                                              blurRadius: 8,
                                            ),
                                          ],
                                        ),
                                        child: isPlayerHere
                                            ? const Icon(Icons.person, size: 12, color: Colors.black)
                                            : hasBattle
                                                ? const Icon(Icons.military_tech_rounded, size: 11, color: Colors.white)
                                                : isCap
                                                    ? const Icon(Icons.star_rounded, size: 14, color: Colors.black)
                                                    : null,
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 3),
                                  // Region Label Pill
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.82),
                                      borderRadius: BorderRadius.circular(4),
                                      border: Border.all(
                                        color: isCap
                                            ? const Color(0xFFF59E0B).withValues(alpha: 0.7)
                                            : Colors.white24,
                                        width: 0.6,
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (isCap) ...[
                                          const Text('★ ', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 8)),
                                        ],
                                        Text(
                                          r.name,
                                          style: TextStyle(
                                            color: isCap ? const Color(0xFFFCD34D) : Colors.white,
                                            fontSize: 9,
                                            fontWeight: isCap ? FontWeight.w900 : FontWeight.bold,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                      ],
                    ),
                  ),
                ),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
            error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(worldMapDataProvider))),
          ),

          // 2. Top Header Bar (Tactical Status + Search Button)
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      // Active Nations Pill
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.surface.withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AppColors.border),
                          boxShadow: [
                            BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 10),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                shape: BoxShape.circle,
                                color: AppColors.emerald,
                              ),
                            ),
                            const SizedBox(width: 8),
                            mapDataAsync.maybeWhen(
                              data: (data) => Text(
                                '${data.countries.length} Active Nations · ${worldCountries.length} Complete World',
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                              orElse: () => const Text(
                                'Complete World Map',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      // Search Toggle Button
                      IconButton(
                        onPressed: () {
                          setState(() {
                            _showSearch = !_showSearch;
                            if (!_showSearch) {
                              _searchController.clear();
                              _searchQuery = '';
                            }
                          });
                        },
                        icon: Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(
                            color: AppColors.surface.withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: _showSearch ? AppColors.cyan : AppColors.border),
                          ),
                          child: Icon(
                            _showSearch ? Icons.close_rounded : Icons.search_rounded,
                            size: 18,
                            color: _showSearch ? AppColors.cyan : Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),

                  // Search Bar Input (when expanded)
                  if (_showSearch) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: AppColors.surface.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.cyan.withValues(alpha: 0.5)),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.6), blurRadius: 12),
                        ],
                      ),
                      child: TextField(
                        controller: _searchController,
                        autofocus: true,
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        decoration: const InputDecoration(
                          hintText: 'Search nation or region...',
                          hintStyle: TextStyle(color: AppColors.textMuted, fontSize: 13),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 10),
                        ),
                        onChanged: (val) => setState(() => _searchQuery = val.trim().toLowerCase()),
                      ),
                    ),

                    // Search Results List
                    if (_searchQuery.isNotEmpty)
                      mapDataAsync.maybeWhen(
                        data: (mapData) {
                          final matchingCountries = worldCountries.where((c) {
                            return c.name.toLowerCase().contains(_searchQuery) ||
                                c.code.toLowerCase().contains(_searchQuery);
                          }).take(5).toList();

                          final matchingRegions = mapData.regions.where((r) {
                            return r.name.toLowerCase().contains(_searchQuery) ||
                                r.countryName.toLowerCase().contains(_searchQuery);
                          }).take(5).toList();

                          final activeSet = {for (final c in mapData.countries) c.code};

                          return Container(
                            margin: const EdgeInsets.only(top: 6),
                            constraints: const BoxConstraints(maxHeight: 220),
                            decoration: BoxDecoration(
                              color: AppColors.surfaceCard,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.border),
                              boxShadow: [
                                BoxShadow(color: Colors.black.withValues(alpha: 0.7), blurRadius: 16),
                              ],
                            ),
                            child: ListView(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              shrinkWrap: true,
                              children: [
                                ...matchingCountries.map((c) {
                                  final isActive = activeSet.contains(c.code);
                                  return ListTile(
                                    dense: true,
                                    visualDensity: VisualDensity.compact,
                                    leading: Container(
                                      width: 24,
                                      height: 24,
                                      decoration: BoxDecoration(
                                        color: isActive ? AppColors.cyan : const Color(0xFF334155),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      alignment: Alignment.center,
                                      child: Text(
                                        c.code,
                                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                                      ),
                                    ),
                                    title: Text(c.name, style: const TextStyle(fontSize: 12, color: Colors.white)),
                                    trailing: Text(
                                      isActive ? 'ACTIVE' : 'INACTIVE',
                                      style: TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.bold,
                                        color: isActive ? AppColors.emerald : AppColors.textMuted,
                                      ),
                                    ),
                                    onTap: () {
                                      final cx = (c.bbox[0] + c.bbox[2]) / 2;
                                      final cy = (c.bbox[1] + c.bbox[3]) / 2;
                                      _jumpTo(3.5, cx, cy);
                                      setState(() {
                                        _selectedCountryCode = c.code;
                                        _showSearch = false;
                                        _searchController.clear();
                                        _searchQuery = '';
                                      });
                                    },
                                  );
                                }),
                                ...matchingRegions.map((r) {
                                  return ListTile(
                                    dense: true,
                                    visualDensity: VisualDensity.compact,
                                    leading: const Icon(Icons.location_on, size: 18, color: AppColors.amber),
                                    title: Text(r.name, style: const TextStyle(fontSize: 12, color: Colors.white)),
                                    subtitle: Text(r.countryName, style: const TextStyle(fontSize: 10, color: AppColors.textMuted)),
                                    onTap: () {
                                      _jumpTo(4.0, r.x, r.y);
                                      setState(() {
                                        _selectedCountryCode = r.countryCode;
                                        _showSearch = false;
                                        _searchController.clear();
                                        _searchQuery = '';
                                      });
                                      showModalBottomSheet(
                                        context: context,
                                        backgroundColor: Colors.transparent,
                                        isScrollControlled: true,
                                        builder: (_) => RegionInspectorSheet(region: r),
                                      );
                                    },
                                  );
                                }),
                              ],
                            ),
                          );
                        },
                        orElse: () => const SizedBox.shrink(),
                      ),
                  ],

                  // 3. Continent Jump Bar Pills
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 32,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _continents.length,
                      separatorBuilder: (context, index) => const SizedBox(width: 6),
                      itemBuilder: (context, index) {
                        final c = _continents[index];
                        return ActionChip(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                          label: Text(c['name'] as String, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                          backgroundColor: AppColors.surface.withValues(alpha: 0.9),
                          side: const BorderSide(color: AppColors.border),
                          onPressed: () => _jumpTo(
                            c['scale'] as double,
                            c['cx'] as double,
                            c['cy'] as double,
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 4. Floating Zoom Controls (Bottom Right)
          Positioned(
            right: 14,
            bottom: 30,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildMapControlBtn(icon: Icons.add_rounded, tooltip: 'Zoom In', onTap: _zoomIn),
                const SizedBox(height: 8),
                _buildMapControlBtn(icon: Icons.remove_rounded, tooltip: 'Zoom Out', onTap: _zoomOut),
                const SizedBox(height: 8),
                _buildMapControlBtn(icon: Icons.refresh_rounded, tooltip: 'Reset View', onTap: _resetView),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapControlBtn({
    required IconData icon,
    required String tooltip,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: AppColors.surface.withValues(alpha: 0.92),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 8),
            ],
          ),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

class WorldCountriesPainter extends CustomPainter {
  final Map<String, String> activeCountryColors;
  final String? selectedCountryCode;
  final Set<String> battleCountryCodes;

  WorldCountriesPainter({
    required this.activeCountryColors,
    this.selectedCountryCode,
    this.battleCountryCodes = const {},
  });

  @override
  void paint(Canvas canvas, Size size) {
    // 1. Tactical Deep Ocean Canvas
    final bgPaint = Paint()..color = const Color(0xFF070B12);
    canvas.drawRect(Offset.zero & size, bgPaint);

    // 2. Subtle Ocean Coordinates Grid
    final gridPaint = Paint()
      ..color = const Color(0xFF101927).withValues(alpha: 0.7)
      ..strokeWidth = 0.5;

    for (double x = 0; x < size.width; x += 100) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += 100) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    final cachedPaths = WorldMapPathCache.paths;

    // 3. Draw All 68 World Countries: Inactive in Grey, Active in National Colors
    for (final c in worldCountries) {
      final path = cachedPaths[c.code];
      if (path == null) continue;

      final isActive = activeCountryColors.containsKey(c.code);
      final isSelected = selectedCountryCode == c.code;
      final hasBattle = battleCountryCodes.contains(c.code);

      final Color nationColor;
      if (isActive) {
        final hex = activeCountryColors[c.code]!;
        nationColor = _parseHexColor(hex);
      } else {
        // Complete tactical grey for inactive countries
        nationColor = const Color(0xFF1E293B);
      }

      // Fill
      final fillPaint = Paint()
        ..color = isSelected
            ? (isActive ? nationColor : const Color(0xFF334155)).withValues(alpha: 0.95)
            : isActive
                ? nationColor.withValues(alpha: 0.85)
                : const Color(0xFF1E293B).withValues(alpha: 0.50)
        ..style = PaintingStyle.fill;

      canvas.drawPath(path, fillPaint);

      // Stroke border
      final strokePaint = Paint()
        ..color = isSelected
            ? AppColors.emerald
            : hasBattle
                ? AppColors.crimson
                : isActive
                    ? const Color(0xFF0A0F18)
                    : const Color(0xFF334155).withValues(alpha: 0.7)
        ..strokeWidth = isSelected
            ? 2.0
            : hasBattle
                ? 1.4
                : isActive
                    ? 0.8
                    : 0.35
        ..style = PaintingStyle.stroke;

      canvas.drawPath(path, strokePaint);
    }
  }

  static Color _parseHexColor(String hex) {
    var clean = hex.replaceAll('#', '');
    if (clean.length == 6) {
      clean = 'FF$clean';
    }
    return Color(int.tryParse(clean, radix: 16) ?? 0xFF3B82F6);
  }

  @override
  bool shouldRepaint(covariant WorldCountriesPainter oldDelegate) {
    return oldDelegate.selectedCountryCode != selectedCountryCode ||
        oldDelegate.activeCountryColors != activeCountryColors ||
        oldDelegate.battleCountryCodes != battleCountryCodes;
  }
}

class _InactiveTerritorySheet extends StatelessWidget {
  final WorldCountryData country;

  const _InactiveTerritorySheet({required this.country});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(top: BorderSide(color: AppColors.borderGlow, width: 1)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF475569)),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    country.code,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              country.name,
                              style: Theme.of(context).textTheme.titleLarge,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: const Color(0xFF475569)),
                            ),
                            child: const Text(
                              'INACTIVE',
                              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Unsettled Neutral Territory',
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A).withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.shield_outlined, color: Color(0xFF94A3B8), size: 20),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'This territory is currently inactive in the global conflict arena. No sovereign government, resources, or armed divisions are active here.',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 12, height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
