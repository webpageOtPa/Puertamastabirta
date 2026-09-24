// Contorno continental de Colombia — datos Natural Earth (PA-17D)
// -----------------------------------------------------------------------------
// Fuente: Natural Earth admin 0 countries 1:50m (dominio público), feature
// ADMIN=Colombia (ADM0_A3=COL). Solo el polígono continental (el mayor);
// excluidos islotes oceánicos (islote menor del Pacífico (Gorgona); San Andrés no figura en el feature
// a 1:50m). Simplificado con Douglas-Peucker (tol 0.09°) en preparación
// local. Ver `colombia-outline.json` (fuente exacta, hash SHA-256 y
// licencia) — este módulo es el acceso tipado a esos datos.
//
// Sin red en runtime: el navegador solo recibe el path SVG final.

import data from "./colombia-outline.json";

export interface ColombiaOutlineSource {
  dataset: string;
  file: string;
  url: string;
  sha256: string;
  downloaded: string;
  license: string;
  feature: string;
  filter: string;
  method: string;
  vertices: number;
}

/** Procedencia exacta del contorno (trazabilidad, no procedencia inventada). */
export const COLOMBIA_SOURCE: ColombiaOutlineSource = data.source;

/** Contorno continental [lon, lat] en grados (107 vértices, anillo abierto). */
export const COLOMBIA_OUTLINE_LONLAT: ReadonlyArray<readonly [number, number]> =
  data.outline as unknown as ReadonlyArray<readonly [number, number]>;
