// Geometría geográfica de Colombia — Puerta Abierta (PA-17D)
// -----------------------------------------------------------------------------
// Contorno continental REAL de Natural Earth 1:50m (dominio público),
// simplificado en preparación local (107 vértices lon/lat; ver
// `colombia-outline.json` con fuente exacta, hash SHA-256 y licencia, y
// `colombia-outline.ts` como acceso tipado). Solo tierra continental:
// excluidos islotes oceánicos (islote menor del Pacífico (Gorgona); San Andrés no figura en el
// feature a 1:50m).
//
// Las 13 ciudades usan lat/lon reales aproximadas y se proyectan a
// coordenadas SVG ENTERAS con Mercator esférica EN TIEMPO DE BUILD: este
// módulo sólo corre durante el build de Astro; el navegador recibe el
// path y los x/y finales, sin JS de proyección, sin red y sin
// persistencia. El path usa codificación relativa compacta (techo de
// transferencia inicial: sin ampliar presupuesto).
//
// Convención de `marker` (ver contracts): x/y normalizados al viewBox
// 600×720 (marker.x = svgX/600, marker.y = svgY/720), redondeados a 4
// decimales. Las posiciones son APROXIMADAS (simplificado + redondeo a
// enteros en SVG); la lista textual sigue siendo la fuente de verdad.

import { COLOMBIA_OUTLINE_LONLAT, COLOMBIA_SOURCE } from "./colombia-outline.ts";

export { COLOMBIA_OUTLINE_LONLAT, COLOMBIA_SOURCE };

/** ViewBox compartido por el SVG inline y `public/coverage-map.svg`. */
export const COLOMBIA_VIEWBOX = "0 0 600 720" as const;

const VIEW_W = 600;
const VIEW_H = 720;
const MARGIN_X = 60;
const MARGIN_Y = 50;

const DEG2RAD = Math.PI / 180;

/** Mercator esférica: lat (grados) → ordenada cilíndrica (radianes). */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * DEG2RAD) / 2));
}

const outlineMercY = COLOMBIA_OUTLINE_LONLAT.map(([, lat]) => mercatorY(lat));
const LON_MIN = Math.min(...COLOMBIA_OUTLINE_LONLAT.map(([lon]) => lon));
const LON_MAX = Math.max(...COLOMBIA_OUTLINE_LONLAT.map(([lon]) => lon));
const MY_MIN = Math.min(...outlineMercY);
const MY_MAX = Math.max(...outlineMercY);

const SCALE = Math.min(
  (VIEW_W - 2 * MARGIN_X) / ((LON_MAX - LON_MIN) * DEG2RAD),
  (VIEW_H - 2 * MARGIN_Y) / (MY_MAX - MY_MIN),
);
const OFFSET_X = (VIEW_W - (LON_MAX - LON_MIN) * DEG2RAD * SCALE) / 2;
const OFFSET_Y = (VIEW_H - (MY_MAX - MY_MIN) * SCALE) / 2;

/** Proyecta lon/lat (grados) a coordenadas ENTERAS del viewBox. */
export function projectLonLat(lon: number, lat: number): { x: number; y: number } {
  return {
    x: Math.round(OFFSET_X + (lon - LON_MIN) * DEG2RAD * SCALE),
    y: Math.round(OFFSET_Y + (MY_MAX - mercatorY(lat)) * SCALE),
  };
}

/** Path `d` del contorno (relativo compacto, cerrado con Z), en build. */
export const COLOMBIA_OUTLINE_PATH: string = (() => {
  const pts = COLOMBIA_OUTLINE_LONLAT.map(([lon, lat]) => projectLonLat(lon, lat));
  const first = pts[0];
  if (!first) throw new Error("contorno vacío");
  const segs: string[] = [];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (!prev || !cur) throw new Error(`vértice indefinido en ${i}`);
    segs.push(`${cur.x - prev.x},${cur.y - prev.y}`);
  }
  let body = segs[0] ?? "";
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i] ?? "";
    body += (s.startsWith("-") ? "" : " ") + s;
  }
  return `M${first.x},${first.y}l` + body + "Z";
})();

/** Lat/lon reales aproximadas de las 13 ciudades contratadas (grados). */
export const COLOMBIA_CITY_LATLON: Readonly<Record<string, readonly [number, number]>> = {
  bogota: [4.711, -74.072],
  ibague: [4.438, -75.232],
  cali: [3.451, -76.532],
  medellin: [6.244, -75.581],
  manizales: [5.068, -75.51],
  pereira: [4.809, -75.513],
  cartagena: [10.391, -75.479],
  barranquilla: [10.968, -74.781],
  "santa-marta": [11.242, -74.218],
  monteria: [8.76, -75.886],
  sincelejo: [9.304, -75.397],
  valledupar: [10.463, -73.253],
  cucuta: [7.894, -72.508],
};

export interface ColombiaCityPoint {
  id: string;
  x: number;
  y: number;
  r: number;
}

/**
 * Los 13 puntos en el mismo orden textual de `COVERAGE_CITIES`.
 * `r` conserva la distinción heredada (Bogotá y Cúcuta, cabeceras
 * unipersonales de su rótulo, en 9; resto en 7).
 */
export const COLOMBIA_CITY_POINTS: ColombiaCityPoint[] = [
  "bogota",
  "ibague",
  "cali",
  "medellin",
  "manizales",
  "pereira",
  "cartagena",
  "barranquilla",
  "santa-marta",
  "monteria",
  "sincelejo",
  "valledupar",
  "cucuta",
].map((id) => {
  const entry = COLOMBIA_CITY_LATLON[id];
  if (!entry) throw new Error(`ciudad sin lat/lon: ${id}`);
  const [lat, lon] = entry;
  const p = projectLonLat(lon, lat);
  return { id, x: p.x, y: p.y, r: id === "bogota" || id === "cucuta" ? 9 : 7 };
});

export interface ColombiaZoneWash {
  groupId: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * Elipses de sombreado zonal derivadas EN BUILD de los puntos de cada
 * grupo (centroide del bbox del grupo + holgura de 30): nada inventado a
 * mano, se recalculan si cambian las ciudades. La zona Oriente (una sola
 * ciudad) no lleva elipse: basta su punto.
 */
export const COLOMBIA_ZONE_WASHES: ColombiaZoneWash[] = (
  [
    ["zona-centro-y-sur", ["bogota", "ibague", "cali"]],
    ["zona-eje-cafetero-y-antioquia", ["medellin", "manizales", "pereira"]],
    [
      "zona-norte-y-caribe",
      ["cartagena", "barranquilla", "santa-marta", "monteria", "sincelejo", "valledupar"],
    ],
  ] as Array<[string, string[]]>
).map(([groupId, ids]) => {
  const ps = ids.map((id) => {
    const p = COLOMBIA_CITY_POINTS.find((q) => q.id === id);
    if (!p) throw new Error(`ciudad sin punto: ${id}`);
    return p;
  });
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    groupId,
    cx: Math.round((minX + maxX) / 2),
    cy: Math.round((minY + maxY) / 2),
    rx: Math.round((maxX - minX) / 2 + 30),
    ry: Math.round((maxY - minY) / 2 + 30),
  };
});

export interface ColombiaMapLabel {
  text: string;
  x: number;
  y: number;
}

/**
 * Etiquetas discretas de contexto natural (mares), proyectadas desde
 * lon/lat elegidas sobre agua en preparación: Mar Caribe al norte del
 * litoral, Océano Pacífico al oeste de la costa. Sin claims.
 */
export const COLOMBIA_MAP_LABELS: ColombiaMapLabel[] = (
  [
    ["Mar Caribe", -75.0, 12.6],
    ["Océano Pacífico", -79.7, 4.6],
  ] as Array<[string, number, number]>
).map(([text, lon, lat]) => {
  const p = projectLonLat(lon, lat);
  return { text, x: p.x, y: p.y };
});
