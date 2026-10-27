"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  Swords,
  Star,
  Flag,
  Globe2,
  Crosshair,
  Shield,
  Layers,
  Plane,
  MapPin,
} from "lucide-react";
import {
  WORLD_COUNTRIES,
  getCountryRegions,
  type WorldCountryData,
  type CountryRegionSpec,
} from "@egeopolis/game-core";
import { Badge, Button, cn } from "@/lib/ui";

export interface MapRegion {
  id: string;
  name: string;
  countryId: string;
  coreCountryId: string;
  isCapital: boolean;
  resource: string | null;
  density: string;
  x: number;
  y: number;
  population?: number;
  country: {
    id: string;
    name: string;
    code: string;
    flagColor: string;
    currencySymbol?: string;
    currencyName?: string;
  };
  battles: Array<{ id: string }>;
}

interface WorldMapProps {
  regions?: MapRegion[];
  countries?: Array<{ id: string; name: string; code: string; flagColor: string }>;
  onStartRw?: (regionId: string) => void;
  /** Show a "Travel here" action in the region inspector (wiki: travel by ticket). */
  onTravel?: (region: MapRegion) => void;
  meCitizenId?: string;
  meCountryId?: string;
  /** Region the player currently occupies — travel is hidden there. */
  meLocationRegionId?: string;
  userLevel?: number;
  className?: string;
}

interface ActiveRegionState {
  spec: CountryRegionSpec;
  country: WorldCountryData;
  dbRegion?: MapRegion;
}

const CONTINENT_PRESETS = [
  { name: "World", scale: 1, cx: 1000, cy: 428.5 },
  { name: "Europe", scale: 3.6, cx: 1036, cy: 197 },
  { name: "N. America", scale: 2.2, cx: 455, cy: 229 },
  { name: "S. America", scale: 2.4, cx: 619, cy: 623 },
  { name: "Asia", scale: 2.2, cx: 1537, cy: 337 },
  { name: "Africa", scale: 2.4, cx: 1103, cy: 467 },
  { name: "Oceania", scale: 2.8, cx: 1852, cy: 649 },
];

export function WorldMap({
  regions = [],
  countries = [],
  onStartRw,
  onTravel,
  meLocationRegionId,
  userLevel = 1,
  className,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom state
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Search & Active Selection
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredRegion, setHoveredRegion] = useState<ActiveRegionState | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<ActiveRegionState | null>(null);
  const [showRegionalBorders, setShowRegionalBorders] = useState(true);

  // Map region name -> database region
  const regionsByName = useMemo(() => {
    const map = new Map<string, MapRegion>();
    for (const r of regions) {
      map.set(r.name, r);
    }
    return map;
  }, [regions]);

  // Set of regions with active battles
  const battleRegionNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of regions) {
      if (r.battles && r.battles.length > 0) {
        set.add(r.name);
      }
    }
    return set;
  }, [regions]);

  // Set of active country codes in the current world database
  const activeCountryCodes = useMemo(() => {
    const set = new Set<string>();
    for (const c of countries) {
      set.add(c.code);
    }
    for (const r of regions) {
      if (r.country?.code) {
        set.add(r.country.code);
      }
    }
    return set;
  }, [countries, regions]);

  // Map country code -> flag color
  const countryFlagMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of countries) {
      map.set(c.code, c.flagColor);
    }
    return map;
  }, [countries]);

  // Pre-calculate 6 regions for all 221 countries
  const countryRegionsMap = useMemo(() => {
    const map = new Map<string, CountryRegionSpec[]>();
    for (const c of WORLD_COUNTRIES) {
      map.set(c.code, getCountryRegions(c));
    }
    return map;
  }, []);

  // Center on coordinates in 2000x857 coordinate space
  const focusOn = useCallback((cx: number, cy: number, targetScale = 3) => {
    setScale(targetScale);
    setTx(1000 - cx * targetScale);
    setTy(428.5 - cy * targetScale);
  }, []);

  // Zoom controls
  function zoomIn() {
    setScale((prev) => Math.min(10, prev * 1.35));
  }
  function zoomOut() {
    setScale((prev) => Math.max(0.8, prev / 1.35));
  }
  function resetView() {
    setScale(1);
    setTx(0);
    setTy(0);
  }

  // Mouse drag handling
  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - tx, y: e.clientY - ty });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    setTx(e.clientX - dragStart.x);
    setTy(e.clientY - dragStart.y);
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  // Wheel zoom
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.min(10, Math.max(0.8, scale * zoomFactor));

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const pointerX = ((e.clientX - rect.left) / rect.width) * 2000;
      const pointerY = ((e.clientY - rect.top) / rect.height) * 857;

      setTx((prev) => pointerX - (pointerX - prev) * (newScale / scale));
      setTy((prev) => pointerY - (pointerY - prev) * (newScale / scale));
    }
    setScale(newScale);
  }

  // Handle Search Selection
  function handleSearchSelect(country: WorldCountryData) {
    const specs = countryRegionsMap.get(country.code) || [];
    const capitalSpec = specs.find((s) => s.isCapital) || specs[0];
    const dbRegion = capitalSpec ? regionsByName.get(capitalSpec.name) : undefined;

    if (capitalSpec) {
      setSelectedRegion({ spec: capitalSpec, country, dbRegion });
      const cx = (country.bbox[0] + country.bbox[2]) / 2;
      const cy = (country.bbox[1] + country.bbox[3]) / 2;
      focusOn(cx, cy, 4.5);
    }
    setSearchQuery("");
  }

  const filteredSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return WORLD_COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [searchQuery]);

  const active = selectedRegion || hoveredRegion;
  const dbRegion = active?.dbRegion || (active ? regionsByName.get(active.spec.name) : undefined);
  const isOccupied = dbRegion ? dbRegion.coreCountryId !== dbRegion.countryId : false;
  const atWar = active ? battleRegionNames.has(active.spec.name) : false;
  const isActiveNation = active ? activeCountryCodes.has(active.country.code) || Boolean(dbRegion) : false;

  return (
    <div className={cn("relative flex flex-col rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl", className)}>
      {/* Top Map Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/90 px-4 py-3 backdrop-blur-md z-20">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            World Map — {activeCountryCodes.size} Active Nations · {WORLD_COUNTRIES.length} Complete World
          </span>
          {battleRegionNames.size > 0 && (
            <Badge color="red" className="animate-pulse">
              <Swords className="h-3 w-3" /> {battleRegionNames.size} battlefronts
            </Badge>
          )}
        </div>

        {/* Search bar */}
        <div className="relative">
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs">
            <Search className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Find nation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:w-48 transition-all"
            />
          </div>
          {filteredSearch.length > 0 && (
            <div className="absolute top-full mt-1.5 right-0 w-64 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 overflow-hidden">
              {filteredSearch.map((c) => {
                const isActive = activeCountryCodes.has(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSearchSelect(c)}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800/80 transition"
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full shrink-0 shadow-sm"
                      style={{
                        backgroundColor: isActive
                          ? (countryFlagMap.get(c.code) ?? c.flagColor ?? "#38bdf8")
                          : "#475569",
                      }}
                    />
                    <span className={cn("font-bold flex-1 truncate", !isActive && "text-slate-400")}>
                      {c.name}
                    </span>
                    {!isActive && (
                      <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Continent Presets */}
        <div className="hidden sm:flex items-center gap-1">
          {CONTINENT_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => focusOn(p.cx, p.cy, p.scale)}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Region Borders Toggle & Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="Toggle Regional Borders"
            onClick={() => setShowRegionalBorders((v) => !v)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition",
              showRegionalBorders
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-400"
                : "border-slate-800 text-slate-500 hover:text-slate-300",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden md:inline">6 Regions/Nation</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-950/80 rounded-lg border border-slate-800 p-0.5">
            <button
              type="button"
              title="Zoom In"
              onClick={zoomIn}
              className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Zoom Out"
              onClick={zoomOut}
              className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Reset View"
              onClick={resetView}
              className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Map Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={cn(
          "w-full h-[520px] md:h-[650px] bg-[#070b12] relative overflow-hidden select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <svg
          viewBox="0 0 2000 857"
          className="w-full h-full"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "0 0",
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          {/* Subtle ocean grid lines & filters */}
          <defs>
            <pattern id="oceanGrid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#0e1726" strokeWidth="0.5" />
            </pattern>
            <filter id="battleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Clipping definitions for each country and its 6 regions */}
            {WORLD_COUNTRIES.map((c) => {
              const countryPath = c.paths ? c.paths.join(" ") : c.d;
              const specs = countryRegionsMap.get(c.code) || [];

              return (
                <g key={c.code}>
                  {/* Full country outline clip path */}
                  <clipPath id={`country-outline-${c.code}`}>
                    <path d={countryPath} />
                  </clipPath>

                  {/* 6 Regional sub-clipping rects */}
                  {specs.map((s) => (
                    <clipPath key={s.index} id={`clip-${c.code}-${s.index}`}>
                      <rect
                        x={s.bounds.minX}
                        y={s.bounds.minY}
                        width={Math.max(1, s.bounds.maxX - s.bounds.minX)}
                        height={Math.max(1, s.bounds.maxY - s.bounds.minY)}
                      />
                    </clipPath>
                  ))}
                </g>
              );
            })}
          </defs>

          <rect width="2000" height="857" fill="#070b12" />
          <rect width="2000" height="857" fill="url(#oceanGrid)" />

          {/* Render All 221 World Countries, Sliced into 6 Regions Each */}
          {WORLD_COUNTRIES.map((c) => {
            const countryPath = c.paths ? c.paths.join(" ") : c.d;
            const specs = countryRegionsMap.get(c.code) || [];
            const [minX, minY, maxX, maxY] = c.bbox;
            const W = Math.max(1, maxX - minX);
            const H = Math.max(1, maxY - minY);
            const isWide = W >= H;
            const isCountryActive = activeCountryCodes.has(c.code);

            return (
              <g key={c.code} className="country-group">
                {/* 1. Sliced Regions for this Country */}
                {specs.map((spec) => {
                  const regionName = spec.name;
                  const itemDbRegion = regionsByName.get(regionName);
                  const isSelected = selectedRegion?.spec.name === regionName;
                  const isHovered = hoveredRegion?.spec.name === regionName;
                  const hasBattle = isCountryActive && battleRegionNames.has(regionName);
                  const fillColor = isCountryActive
                    ? (itemDbRegion?.country?.flagColor || countryFlagMap.get(c.code) || c.flagColor || "#38bdf8")
                    : "#1e293b";

                  return (
                    <g
                      key={spec.index}
                      onMouseEnter={() => setHoveredRegion({ spec, country: c, dbRegion: itemDbRegion })}
                      onMouseLeave={() => setHoveredRegion(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRegion({ spec, country: c, dbRegion: itemDbRegion });
                      }}
                      className="region-segment"
                    >
                      <path
                        d={countryPath}
                        clipPath={`url(#clip-${c.code}-${spec.index})`}
                        fill={fillColor}
                        fillOpacity={
                          isSelected
                            ? 1.0
                            : isHovered
                              ? (isCountryActive ? 0.95 : 0.70)
                              : (isCountryActive ? 0.82 : 0.45)
                        }
                        stroke={
                          isSelected
                            ? "#10b981"
                            : isHovered
                              ? (isCountryActive ? "#38bdf8" : "#64748b")
                              : hasBattle
                                ? "#ef4444"
                                : (isCountryActive ? "#0a0f18" : "#334155")
                        }
                        strokeWidth={
                          isSelected
                            ? 1.8
                            : isHovered
                              ? 1.2
                              : hasBattle
                                ? 1.0
                                : (isCountryActive ? 0.3 : 0.2)
                        }
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="cursor-pointer transition-colors duration-150"
                      />

                      {/* Capital Star Marker (Active nations or zoomed in) */}
                      {spec.isCapital && isCountryActive && (
                        <g transform={`translate(${spec.x}, ${spec.y})`}>
                          <circle r={scale > 3 ? 3.5 : 2} fill="#ffffff" stroke="#000" strokeWidth={0.5} />
                          {scale > 3 && (
                            <text y={-4} textAnchor="middle" fontSize={6} fill="#ffffff" fontWeight="bold">
                              ★
                            </text>
                          )}
                        </g>
                      )}

                      {/* Regional centroid dot when zoomed in on active nations */}
                      {!spec.isCapital && isCountryActive && scale > 3.5 && (
                        <circle cx={spec.x} cy={spec.y} r={1.2} fill="#ffffff" fillOpacity={0.6} />
                      )}

                      {/* Active Battle Marker */}
                      {hasBattle && (
                        <g transform={`translate(${spec.x - 10}, ${spec.y - 10})`}>
                          <circle cx="10" cy="10" r="8" fill="#dc2626" fillOpacity="0.8" className="animate-ping" />
                          <circle cx="10" cy="10" r="7" fill="#991b1b" stroke="#fca5a5" strokeWidth="1" />
                          <text x="10" y="13.5" textAnchor="middle" fontSize="9" fill="#ffffff" fontWeight="bold">⚔</text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* 2. Internal Regional Division Lines (Clipped inside Country Outline, active nations only) */}
                {showRegionalBorders && isCountryActive && (
                  <g clipPath={`url(#country-outline-${c.code})`} pointerEvents="none">
                    {isWide ? (
                      <>
                        <line
                          x1={minX + W / 3}
                          y1={minY}
                          x2={minX + W / 3}
                          y2={maxY}
                          stroke="#000000"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                          strokeOpacity="0.6"
                        />
                        <line
                          x1={minX + (2 * W) / 3}
                          y1={minY}
                          x2={minX + (2 * W) / 3}
                          y2={maxY}
                          stroke="#000000"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                          strokeOpacity="0.6"
                        />
                        <line
                          x1={minX}
                          y1={minY + H / 2}
                          x2={maxX}
                          y2={minY + H / 2}
                          stroke="#000000"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                          strokeOpacity="0.6"
                        />
                      </>
                    ) : (
                      <>
                        <line
                          x1={minX + W / 2}
                          y1={minY}
                          x2={minX + W / 2}
                          y2={maxY}
                          stroke="#000000"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                          strokeOpacity="0.6"
                        />
                        <line
                          x1={minX}
                          y1={minY + H / 3}
                          x2={maxX}
                          y2={minY + H / 3}
                          stroke="#000000"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                          strokeOpacity="0.6"
                        />
                        <line
                          x1={minX}
                          y1={minY + (2 * H) / 3}
                          x2={maxX}
                          y2={minY + (2 * H) / 3}
                          stroke="#000000"
                          strokeWidth="0.5"
                          strokeDasharray="2,2"
                          strokeOpacity="0.6"
                        />
                      </>
                    )}
                  </g>
                )}

                {/* 3. National Outer Border */}
                <path
                  d={countryPath}
                  fill="none"
                  stroke={isCountryActive ? "#05080e" : "#1e293b"}
                  strokeWidth={isCountryActive ? 0.7 : 0.35}
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Region Inspector HUD */}
        {active && (
          <div className="absolute bottom-4 left-4 max-w-sm rounded-2xl border border-slate-800/90 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-md"
                  style={{
                    backgroundColor: isActiveNation ? (countryFlagMap.get(active.country.code) ?? active.country.flagColor ?? "#38bdf8") : "#334155",
                    color: isActiveNation ? "#ffffff" : "#94a3b8",
                  }}
                >
                  {active.country.code}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
                    {active.spec.name}
                    {isActiveNation && active.spec.isCapital && (
                      <Badge color="gold" className="text-[10px]">
                        ★ Capital
                      </Badge>
                    )}
                    {isActiveNation && atWar && <Badge color="red">In Battle</Badge>}
                    {!isActiveNation && (
                      <Badge color="slate" className="text-[10px]">
                        Inactive Territory
                      </Badge>
                    )}
                  </h4>
                  <p className="text-[11px] font-medium text-slate-400">
                    {isActiveNation ? (
                      <>
                        Sovereign: <strong className="text-slate-200">{active.country.name}</strong> ({active.country.code})
                      </>
                    ) : (
                      <>
                        Territory: <strong className="text-slate-300">{active.country.name}</strong> ({active.country.code}) · Unsettled
                      </>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => focusOn(active.spec.x, active.spec.y, 4.5)}
                title="Center on Region"
                className="p-1 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800 transition"
              >
                <Crosshair className="h-4 w-4" />
              </button>
            </div>

            {isActiveNation ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Resource</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1 truncate">
                      <Star className="h-3 w-3 shrink-0" />
                      {dbRegion?.resource ? `${dbRegion.density} ${dbRegion.resource}` : "Standard"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Currency</span>
                    <span className="font-bold text-slate-300">
                      {dbRegion?.country?.currencySymbol ?? "◈"} {dbRegion?.country?.currencyName ?? "Currency"}
                    </span>
                  </div>
                </div>

                {/* Battle / Resistance War Action */}
                <div className="mt-3 flex items-center gap-2">
                  {dbRegion?.battles && dbRegion.battles.length > 0 ? (
                    <a
                      href={`/fight?battle=${dbRegion.battles[0].id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2 shadow-lg shadow-red-600/30 transition"
                    >
                      <Swords className="h-3.5 w-3.5" /> Join Battle Round →
                    </a>
                  ) : isOccupied && dbRegion && onStartRw ? (
                    <Button
                      size="sm"
                      variant="danger"
                      className="w-full text-xs"
                      onClick={() => onStartRw(dbRegion.id)}
                      disabled={userLevel < 10}
                    >
                      <Flag className="h-3 w-3 mr-1" /> Start Resistance War (20g, L10)
                    </Button>
                  ) : (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Shield className="h-3 w-3 text-emerald-400" />
                      <span>Sovereign region ({active.spec.isCapital ? "National Capital" : `Region ${active.spec.index + 1}/6`}).</span>
                    </div>
                  )}
                </div>

                {/* Travel — move here by spending a TICKET (wiki: ticket quality sets HP cost) */}
                {onTravel && dbRegion && (
                  dbRegion.id === meLocationRegionId ? (
                    <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-[11px] font-bold text-emerald-300">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> You are located here
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full text-xs"
                      onClick={() => onTravel(dbRegion)}
                    >
                      <Plane className="mr-1 h-3.5 w-3.5" /> Travel here (1 ticket)
                    </Button>
                  )
                )}
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                <div className="flex items-center gap-1.5 text-slate-200 font-bold mb-1">
                  <Shield className="h-3.5 w-3.5 text-slate-500" />
                  Unsettled Neutral Territory
                </div>
                This nation is currently inactive in the world arena. No sovereign government or military forces are stationed here.
              </div>
            )}
          </div>
        )}

        {/* Hint banner */}
        <div className="absolute bottom-4 right-4 text-[11px] text-slate-500 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800/80 pointer-events-none backdrop-blur-sm">
          Scroll to zoom · Drag to pan · Click any of the 6 regions to inspect
        </div>
      </div>
    </div>
  );
}
