import type { WorldCountry } from "./world-data";

export type WorldCountryData = WorldCountry;

export interface CountryRegionSpec {
  /** 0..8 grid slot (3×3) */
  slot: number;
  index: number;
  name: string;
  x: number;
  y: number;
  /** true when this slot is a playable region slot (7 per country) */
  isRegion: boolean;
  isCapital: boolean;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function cellName(gx: number, gy: number): string {
  const rows = ["Northern", "Central", "Southern"];
  const cols = ["Western", "Central", "Eastern"];
  if (gx === 1 && gy === 1) return "Capital";
  if (gx === 1) return rows[gy];
  if (gy === 1) return cols[gx];
  return `${rows[gy]} ${cols[gx]}`;
}

/** 9 slot positions from a country bbox; center is always "Capital". */
export function getCountryRegions(c: WorldCountryData): CountryRegionSpec[] {
  const [x0, y0, x1, y1] = c.bbox;
  const w = (x1 - x0) / 3, h = (y1 - y0) / 3;
  const specs: CountryRegionSpec[] = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const slot = gy * 3 + gx;
      const isCapital = gx === 1 && gy === 1;
      specs.push({
        slot,
        index: slot,
        name: c.name === "Antarctica" ? "Prison" : isCapital ? `${c.name} Capital` : `${c.name} ${cellName(gx, gy)}`,
        x: x0 + (gx + 0.5) * w,
        y: y0 + (gy + 0.5) * h,
        isRegion: true,
        isCapital,
        bounds: {
          minX: x0 + gx * w,
          minY: y0 + gy * h,
          maxX: x0 + (gx + 1) * w,
          maxY: y0 + (gy + 1) * h,
        },
      });
    }
  }
  return specs;
}
