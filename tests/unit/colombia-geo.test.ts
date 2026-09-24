import { describe, it, expect } from "vitest";
import {
  COLOMBIA_CITY_POINTS,
  COLOMBIA_OUTLINE_LONLAT,
  COLOMBIA_OUTLINE_PATH,
  COLOMBIA_SOURCE,
  COLOMBIA_VIEWBOX,
  projectLonLat,
} from "../../apps/puerta-abierta/src/data/colombia-geo.js";
import { COVERAGE_CITIES } from "../../apps/puerta-abierta/src/config/coverage.js";

// PA-17D — Mapa geográfico Natural Earth 1:50m (build-time, sin red).
//
//   - 13 puntos con los IDs exactos del dataset (el JS de cobertura y
//     los E2E los requieren vía `data-city-id`).
//   - Contorno cerrado de 40–180 vértices dentro del bbox continental,
//     con procedencia Natural Earth documentada (no inventada).
//   - Path relativo compacto (`M…l…Z`, coordenadas enteras) por el
//     techo de transferencia inicial: el formato cambió en PA-17D.
//   - Orden geográfico aproximado: Caribe arriba (y menor), sur abajo
//     (y mayor); Cúcuta al este de Cali (x mayor).

const EXPECTED_IDS = COVERAGE_CITIES.map((c) => c.id);

describe("colombia-geo — PA-17D", () => {
  it("publica 13 puntos con los IDs exactos del dataset", () => {
    expect(COLOMBIA_CITY_POINTS).toHaveLength(13);
    expect(COLOMBIA_CITY_POINTS.map((p) => p.id)).toEqual(EXPECTED_IDS);
    expect(new Set(COLOMBIA_CITY_POINTS.map((p) => p.id)).size).toBe(13);
  });

  it("el contorno es un path cerrado de 40–180 vértices", () => {
    expect(COLOMBIA_OUTLINE_LONLAT.length).toBeGreaterThanOrEqual(40);
    expect(COLOMBIA_OUTLINE_LONLAT.length).toBeLessThanOrEqual(180);
    expect(COLOMBIA_OUTLINE_PATH.startsWith("M")).toBe(true);
    expect(COLOMBIA_OUTLINE_PATH.endsWith("Z")).toBe(true);
    expect(COLOMBIA_OUTLINE_PATH).toContain("l");
    expect(COLOMBIA_VIEWBOX).toBe("0 0 600 720");
  });

  it("la procedencia es Natural Earth con licencia de dominio público", () => {
    expect(COLOMBIA_SOURCE.url).toContain("natural-earth-vector");
    expect(COLOMBIA_SOURCE.file).toContain("ne_50m_admin_0_countries.geojson");
    expect(COLOMBIA_SOURCE.license.toLowerCase()).toContain("public domain");
    expect(COLOMBIA_SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(COLOMBIA_SOURCE.vertices).toBe(COLOMBIA_OUTLINE_LONLAT.length);
  });

  it("los vértices están dentro del bbox continental de Colombia", () => {
    for (const [lon, lat] of COLOMBIA_OUTLINE_LONLAT) {
      expect(lon).toBeGreaterThanOrEqual(-79.5);
      expect(lon).toBeLessThanOrEqual(-66.5);
      expect(lat).toBeGreaterThanOrEqual(-4.5);
      expect(lat).toBeLessThanOrEqual(12.7);
    }
  });

  it("los puntos quedan dentro del viewBox", () => {
    for (const p of COLOMBIA_CITY_POINTS) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(600);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(720);
    }
  });

  it("respeta el orden geográfico aproximado (norte arriba, este a la derecha)", () => {
    const byId = new Map(COLOMBIA_CITY_POINTS.map((p) => [p.id, p]));
    const y = (id: string): number => byId.get(id)?.y ?? NaN;
    const x = (id: string): number => byId.get(id)?.x ?? NaN;
    // Caribe arriba, sur abajo.
    expect(y("santa-marta")).toBeLessThan(y("bogota"));
    expect(y("barranquilla")).toBeLessThan(y("medellin"));
    expect(y("bogota")).toBeLessThan(y("cali"));
    expect(y("cucuta")).toBeLessThan(y("bogota"));
    // Este/oeste: Cúcuta y Valledupar al este; Cali e Ibagué al oeste.
    expect(x("cucuta")).toBeGreaterThan(x("cali"));
    expect(x("valledupar")).toBeGreaterThan(x("ibague"));
    expect(x("cali")).toBeLessThan(x("bogota"));
  });

  it("la proyección es determinista y monótona en el bbox", () => {
    const a = projectLonLat(-74.072, 4.711);
    const b = projectLonLat(-74.072, 4.711);
    expect(a).toEqual(b);
    // Más al norte → y menor; más al este → x mayor.
    expect(projectLonLat(-74.0, 11.0).y).toBeLessThan(projectLonLat(-74.0, 4.0).y);
    expect(projectLonLat(-72.0, 5.0).x).toBeGreaterThan(projectLonLat(-76.0, 5.0).x);
  });
});
