// Cobertura nacional — Puerta Abierta
// ---------------------------------------------------------------------------
// Transcripción literal de la tabla de cobertura descrita en:
//   - `09_FUENTES/GUIA_WEB.md` (sección 5, "Presencia Regional")
//   - `09_FUENTES/DOSSIER.md` (página 4, "Infraestructura Comercial")
//
// Total: 13 ciudades únicas repartidas en 4 grupos. Las ciudades y los
// nombres de grupo se reproducen EXACTAMENTE como aparecen en la fuente
// histórica (incluyendo "Bogotá D.C.", tildes y mayúsculas). No se añade
// ni se quita ninguna ciudad.
//
// Las posiciones de marcador (`marker`) son coordenadas normalizadas 0–1
// al viewBox 600×720 del mapa (PA-17D: `marker.x = svgX/600`,
// `marker.y = svgY/720`), derivadas en build por proyección Mercator
// esférica desde lat/lon reales aproximadas
// (ver `src/data/colombia-geo.ts`). Son APROXIMADAS (contorno
// Natural Earth 1:50m simplificado + redondeo a enteros en SVG);
// la lista textual sigue siendo la fuente de verdad.
//
// El orden de las listas dentro de cada grupo refleja el orden textual
// de la fuente (no se reordena para "equilibrar" cobertura).

import type { CoverageCity, CoverageGroup } from "../contracts/index.js";

export const COVERAGE_GROUPS: CoverageGroup[] = [
  {
    id: "zona-centro-y-sur",
    label: "Zona Centro y Sur",
    cities: ["bogota", "ibague", "cali"],
  },
  {
    id: "zona-eje-cafetero-y-antioquia",
    label: "Zona Eje Cafetero y Antioquia",
    cities: ["medellin", "manizales", "pereira"],
  },
  {
    id: "zona-norte-y-caribe",
    label: "Zona Norte y Caribe",
    cities: ["cartagena", "barranquilla", "santa-marta", "monteria", "sincelejo", "valledupar"],
  },
  {
    id: "zona-oriente",
    label: "Zona Oriente",
    cities: ["cucuta"],
  },
];

export const COVERAGE_CITIES: CoverageCity[] = [
  {
    id: "bogota",
    name: "Bogotá D.C.",
    groupId: "zona-centro-y-sur",
    marker: { x: 0.4317, y: 0.4708 },
  },
  {
    id: "ibague",
    name: "Ibagué",
    groupId: "zona-centro-y-sur",
    marker: { x: 0.36, y: 0.4847 },
  },
  {
    id: "cali",
    name: "Cali",
    groupId: "zona-centro-y-sur",
    marker: { x: 0.28, y: 0.5347 },
  },
  {
    id: "medellin",
    name: "Medellín",
    groupId: "zona-eje-cafetero-y-antioquia",
    marker: { x: 0.3383, y: 0.3917 },
  },
  {
    id: "manizales",
    name: "Manizales",
    groupId: "zona-eje-cafetero-y-antioquia",
    marker: { x: 0.3417, y: 0.4514 },
  },
  {
    id: "pereira",
    name: "Pereira",
    groupId: "zona-eje-cafetero-y-antioquia",
    marker: { x: 0.3417, y: 0.4653 },
  },
  {
    id: "cartagena",
    name: "Cartagena",
    groupId: "zona-norte-y-caribe",
    marker: { x: 0.3433, y: 0.1764 },
  },
  {
    id: "barranquilla",
    name: "Barranquilla",
    groupId: "zona-norte-y-caribe",
    marker: { x: 0.3867, y: 0.1458 },
  },
  {
    id: "santa-marta",
    name: "Santa Marta",
    groupId: "zona-norte-y-caribe",
    marker: { x: 0.4217, y: 0.1319 },
  },
  {
    id: "monteria",
    name: "Montería",
    groupId: "zona-norte-y-caribe",
    marker: { x: 0.3183, y: 0.2611 },
  },
  {
    id: "sincelejo",
    name: "Sincelejo",
    groupId: "zona-norte-y-caribe",
    marker: { x: 0.3483, y: 0.2319 },
  },
  {
    id: "valledupar",
    name: "Valledupar",
    groupId: "zona-norte-y-caribe",
    marker: { x: 0.4817, y: 0.1722 },
  },
  {
    id: "cucuta",
    name: "Cúcuta",
    groupId: "zona-oriente",
    marker: { x: 0.5267, y: 0.3056 },
  },
];
