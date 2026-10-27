/**
 * Generates packages/game-core/src/world-data.ts from the simplemaps world.svg.
 * Usage: node tools/generate-world.mjs /path/to/world.svg
 */
import { readFileSync, writeFileSync } from "node:fs";

const svgPath = process.argv[2];
if (!svgPath) {
  console.error("usage: node generate-world.mjs <world.svg>");
  process.exit(1);
}
const svg = readFileSync(svgPath, "utf8");

// --- target countries -------------------------------------------------------
const PLAYABLE = {
  AL: "Albania", DZ: "Algeria", AR: "Argentina", AM: "Armenia", AT: "Austria", AZ: "Azerbaijan",
  BE: "Belgium", BO: "Bolivia", BA: "Bosnia and Herzegovina", BR: "Brazil", BG: "Bulgaria",
  CL: "Chile", CN: "China", CO: "Colombia", HR: "Croatia", CZ: "Czech Republic", EG: "Egypt",
  EE: "Estonia", FR: "France", GE: "Georgia", DE: "Germany", GR: "Greece", HU: "Hungary",
  IN: "India", ID: "Indonesia", IR: "Iran", IL: "Israel", IT: "Italy", JP: "Japan", LV: "Latvia",
  LY: "Libya", LT: "Lithuania", MX: "Mexico", ME: "Montenegro", MA: "Morocco", NL: "Netherlands",
  MK: "North Macedonia", PK: "Pakistan", PE: "Peru", PH: "Philippines", PL: "Poland",
  PT: "Portugal", RO: "Romania", RU: "Russia", RS: "Serbia", SK: "Slovakia", SI: "Slovenia",
  ES: "Spain", SE: "Sweden", TN: "Tunisia", TR: "Turkey", UA: "Ukraine", GB: "United Kingdom",
  US: "United States of America",
};
const NEUTRAL = {
  CU: "Cuba", PY: "Paraguay", TW: "Taiwan", SA: "Saudi Arabia", MD: "Moldova", CH: "Switzerland",
  CY: "Cyprus", XK: "Kosovo", IE: "Ireland", MT: "Malta",
  NK: "Nagorno Karabakh", SFI: "Southern Finland", SNO: "Southern Norway",
};
const STAFF = { AQ: "Antarctica" };
const WANTED = new Map([
  ...Object.entries(PLAYABLE).map(([c, n]) => [c, { name: n, type: "PLAYABLE" }]),
  ...Object.entries(NEUTRAL).map(([c, n]) => [c, { name: n, type: "NEUTRAL" }]),
  ...Object.entries(STAFF).map(([c, n]) => [c, { name: n, type: "STAFF" }]),
]);

// class-name → ISO2 for simplemaps class-style paths
const CLASS_TO_ISO = {
  Angola: "AO", "Antarctica": "AQ", Argentina: "AR", Australia: "AU", Azerbaijan: "AZ",
  Bahamas: "BS", Belarus: "BY", Belize: "BZ", Bolivia: "BO", Brazil: "BR", Canada: "CA",
  Chile: "CL", China: "CN", Colombia: "CO", "Costa Rica": "CR", Croatia: "HR", Cuba: "CU",
  "Czech Republic": "CZ", "Czechia": "CZ", Cyprus: "CY", Denmark: "DK", "Dominican Republic": "DO",
  Ecuador: "EC", Egypt: "EG", "El Salvador": "SV", "Russian Federation": "RU", France: "FR",
  Germany: "DE", Greece: "GR", Greenland: "GL", Guatemala: "GT", Guyana: "GY", Honduras: "HN",
  Hungary: "HU", India: "IN", Indonesia: "ID", Iran: "IR", Iraq: "IQ", Ireland: "IE",
  Israel: "IL", Italy: "IT", Japan: "JP", Jordan: "JO", "South Korea": "KR", Kuwait: "KW",
  Lebanon: "LB", Libya: "LY", Malaysia: "MY", Malta: "MT", Mexico: "MX", Morocco: "MA",
  Netherlands: "NL", "New Zealand": "NZ", Nicaragua: "NI", Nigeria: "NG", Norway: "NO",
  Oman: "OM", Pakistan: "PK", Panama: "PA", Paraguay: "PY", Peru: "PE", Philippines: "PH",
  Poland: "PL", Portugal: "PT", "Puerto Rico": "PR", Romania: "RO", Russia: "RU",
  "Saudi Arabia": "SA", Slovakia: "SK", Slovenia: "SI", "South Africa": "ZA", Spain: "ES",
  Sweden: "SE", Switzerland: "CH", Syria: "SY", Thailand: "TH", Tunisia: "TN", Turkey: "TR",
  "Turkmenistan": "TM", Ukraine: "UA", "United Arab Emirates": "AE", "United Kingdom": "GB",
  "United States of America": "US", "United States": "US", Uruguay: "UY", Venezuela: "VE",
  Vietnam: "VN", Yemen: "YE",
};

// --- parse paths ------------------------------------------------------------
const pathRe = /<path\s+([^>]*?)\/?>(?:<\/path>)?/g;
const attrRe = /(\w+)="([^"]*)"/g;

const countries = new Map(); // iso2 → { code, name, type, d: [], minX, minY, maxX, maxY }
let minXAll = Infinity, minYAll = Infinity, maxXAll = -Infinity, maxYAll = -Infinity;

function ensure(code, name, type) {
  if (!countries.has(code)) {
    countries.set(code, { code, name, type, d: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }
  return countries.get(code);
}

function bboxFromPath(d, box) {
  // Minimal path-data scanner: tracks current point through M/L/H/V/C/S/Q/T/A (abs+rel).
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, lastCmd = "";
  const num = () => parseFloat(tokens[i++]);
  const pt = (x, y) => {
    if (x < box.minX) box.minX = x;
    if (y < box.minY) box.minY = y;
    if (x > box.maxX) box.maxX = x;
    if (y > box.maxY) box.maxY = y;
  };
  while (i < tokens.length) {
    let cmd = tokens[i];
    if (/^[a-zA-Z]$/.test(cmd)) { i++; lastCmd = cmd; } else { cmd = lastCmd || "L"; } // implicit repetition keeps case
    switch (cmd) {
      case "M": cx = num(); cy = num(); sx = cx; sy = cy; pt(cx, cy); break;
      case "m": cx += num(); cy += num(); sx = cx; sy = cy; pt(cx, cy); break;
      case "L": cx = num(); cy = num(); pt(cx, cy); break;
      case "l": cx += num(); cy += num(); pt(cx, cy); break;
      case "H": cx = num(); pt(cx, cy); break;
      case "h": cx += num(); pt(cx, cy); break;
      case "V": cy = num(); pt(cx, cy); break;
      case "v": cy += num(); pt(cx, cy); break;
      case "C": { // x1 y1 x2 y2 x y
        const x1 = num(), y1 = num(), x2 = num(), y2 = num();
        cx = num(); cy = num();
        pt(x1, y1); pt(x2, y2); pt(cx, cy);
        break;
      }
      case "c": { // dx1 dy1 dx2 dy2 dx dy
        const x1 = cx + num(), y1 = cy + num(), x2 = cx + num(), y2 = cy + num();
        cx += num(); cy += num();
        pt(x1, y1); pt(x2, y2); pt(cx, cy);
        break;
      }
      case "S": case "Q": { // S: x2 y2 x y · Q: cx cy x y
        const x2 = num(), y2 = num();
        cx = num(); cy = num();
        pt(x2, y2); pt(cx, cy);
        break;
      }
      case "s": case "q": {
        const x2 = cx + num(), y2 = cy + num();
        cx += num(); cy += num();
        pt(x2, y2); pt(cx, cy);
        break;
      }
      case "T": cx = num(); cy = num(); pt(cx, cy); break;
      case "t": cx += num(); cy += num(); pt(cx, cy); break;
      case "A": { // rx ry rot laf sf x y
        num(); num(); num(); num(); num();
        cx = num(); cy = num(); pt(cx, cy);
        break;
      }
      case "a": {
        num(); num(); num(); num(); num();
        cx += num(); cy += num(); pt(cx, cy);
        break;
      }
      case "Z": case "z": cx = sx; cy = sy; break;
      default: i++; break;
    }
  }
}

let m;
while ((m = pathRe.exec(svg)) !== null) {
  const attrs = {};
  attrRe.lastIndex = 0; // reset per-path (global regex state otherwise corrupts scans)
  let am;
  while ((am = attrRe.exec(m[1])) !== null) attrs[am[1]] = am[2];
  const d = attrs.d;
  if (!d) continue;

  let code = null, name = null;
  if (attrs.id && /^[A-Z]{2}$/.test(attrs.id)) { code = attrs.id; name = attrs.name || attrs.id; }
  else if (attrs.class) {
    const iso = CLASS_TO_ISO[attrs.class];
    code = iso || attrs.class;
    name = attrs.name || attrs.class;
  } else if (attrs.id) {
    code = attrs.id;
    name = attrs.name || attrs.id;
  }
  if (!code) continue;

  const type = WANTED.has(code) ? WANTED.get(code).type : "INACTIVE";
  const cName = WANTED.has(code) ? WANTED.get(code).name : name;
  const c = ensure(code, cName, type);
  c.d.push(d);
  bboxFromPath(d, c);
  if (c.minX < minXAll) minXAll = c.minX;
  if (c.minY < minYAll) minYAll = c.minY;
  if (c.maxX > maxXAll) maxXAll = c.maxX;
  if (c.maxY > maxYAll) maxYAll = c.maxY;
}

// synthetic spots for countries missing from the SVG (near real geography)
function synth(code, name, x, y, w = 18, h = 12) {
  const c = ensure(code, name, code === "AQ" ? "STAFF" : "NEUTRAL");
  c.d.push(`M${x} ${y} h${w} v${h} h${-w} Z`);
  c.minX = x; c.minY = y; c.maxX = x + w; c.maxY = y + h;
  return c;
}
if (!countries.has("NK")) synth("NK", "Nagorno Karabakh", 1125, 375, 8, 8);
if (!countries.has("SFI")) synth("SFI", "Southern Finland", 1345, 240, 14, 10);
if (!countries.has("SNO")) synth("SNO", "Southern Norway", 1290, 205, 16, 10);
// Antarctica (staff country) as a full-width strip at the bottom of the map.
if (!countries.has("AQ")) synth("AQ", "Antarctica", 700, 1020, 700, 40);
if (minXAll > 1000000) { minXAll = 0; minYAll = 0; maxXAll = 2000; maxYAll = 1000; }
for (const c of countries.values()) {
  if (!isFinite(c.minX)) { c.minX = 0; c.minY = 0; c.maxX = 10; c.maxY = 10; }
}

// --- borders: bbox proximity ------------------------------------------------
const list = [...countries.values()];
const borders = [];
const GAP = 6;
const OVERLAP = 10;
for (let i = 0; i < list.length; i++) {
  for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const gapX = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
    const gapY = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
    const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    if ((gapX <= GAP && overlapY >= OVERLAP) || (gapY <= GAP && overlapX >= OVERLAP)) {
      borders.push([a.code, b.code]);
    }
  }
}

// --- emit -------------------------------------------------------------------
const esc = (s) => s.replace(/\\/g, "\\\\");
const out = `/**
 * GENERATED by tools/generate-world.mjs from simplemaps world.svg (MIT).
 * ${list.length} countries — ${PLAYABLE && Object.keys(PLAYABLE).length} playable, ${Object.keys(NEUTRAL).length} neutral, 1 staff.
 * Coordinates are in the source SVG viewBox space.
 */
export type WorldCountryType = "PLAYABLE" | "NEUTRAL" | "STAFF" | "INACTIVE";

export interface WorldCountry {
  code: string;
  name: string;
  type: WorldCountryType;
  d: string; // merged SVG path
  paths?: string[];
  bbox: [number, number, number, number];
  flagColor?: string;
}

export const WORLD_VIEWBOX = { minX: ${minXAll.toFixed(1)}, minY: ${minYAll.toFixed(1)}, w: ${(maxXAll - minXAll).toFixed(1)}, h: ${(maxYAll - minYAll).toFixed(1)} };

export const WORLD_COUNTRIES: WorldCountry[] = [
${list.map((c) => `  { code: ${JSON.stringify(c.code)}, name: ${JSON.stringify(c.name)}, type: ${JSON.stringify(c.type)}, bbox: [${[c.minX, c.minY, c.maxX, c.maxY].map((v) => v.toFixed(1)).join(", ")}], d: ${JSON.stringify(c.d.join(" "))} },`).join("\n")}
];

/** Adjacency by bbox proximity (bridge planning + war borders). */
export const WORLD_BORDERS: Array<[string, string]> = [
${borders.map(([a, b]) => `  [${JSON.stringify(a)}, ${JSON.stringify(b)}],`).join("\n")}
];
`;
writeFileSync(new URL("../packages/game-core/src/world-data.ts", import.meta.url), out);
console.log(`generated: ${list.length} countries, ${borders.length} borders`);
