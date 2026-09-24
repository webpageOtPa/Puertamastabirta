import { describe, it, expect } from "vitest";
import { COVERAGE_CITIES, COVERAGE_GROUPS } from "../../apps/puerta-abierta/src/config/coverage.js";

// PA-Q016 — Comparar dataset con transcripción de fuentes.
//
//   - 13 IDs/ciudades únicas y 4 grupos exactos.
//   - Nombres literales según GUIA_WEB (sección 5) y DOSSIER (página 4).
//   - Ninguna ciudad declarada fuera de un grupo.

const EXPECTED_CITY_IDS = [
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
] as const;

const EXPECTED_GROUP_IDS = [
  "zona-centro-y-sur",
  "zona-eje-cafetero-y-antioquia",
  "zona-norte-y-caribe",
  "zona-oriente",
] as const;

describe("cobertura dataset — PA-Q016", () => {
  it("declara exactamente 13 ciudades únicas", () => {
    expect(COVERAGE_CITIES).toHaveLength(13);
    const ids = COVERAGE_CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(13);
    for (const id of EXPECTED_CITY_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("declara exactamente 4 grupos únicos", () => {
    expect(COVERAGE_GROUPS).toHaveLength(4);
    const ids = COVERAGE_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(4);
    for (const id of EXPECTED_GROUP_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("los nombres de ciudad reproducen literalmente la fuente", () => {
    const byId = new Map(COVERAGE_CITIES.map((c) => [c.id, c.name]));
    // Bogotá D.C. con D.C. y tildes en Medellín, Ibagué, Cúcuta, Montería.
    expect(byId.get("bogota")).toBe("Bogotá D.C.");
    expect(byId.get("ibague")).toBe("Ibagué");
    expect(byId.get("cali")).toBe("Cali");
    expect(byId.get("medellin")).toBe("Medellín");
    expect(byId.get("manizales")).toBe("Manizales");
    expect(byId.get("pereira")).toBe("Pereira");
    expect(byId.get("cartagena")).toBe("Cartagena");
    expect(byId.get("barranquilla")).toBe("Barranquilla");
    expect(byId.get("santa-marta")).toBe("Santa Marta");
    expect(byId.get("monteria")).toBe("Montería");
    expect(byId.get("sincelejo")).toBe("Sincelejo");
    expect(byId.get("valledupar")).toBe("Valledupar");
    expect(byId.get("cucuta")).toBe("Cúcuta");
  });

  it("los nombres de grupo reproducen literalmente la fuente", () => {
    const labels = COVERAGE_GROUPS.map((g) => g.label);
    expect(labels).toContain("Zona Centro y Sur");
    expect(labels).toContain("Zona Eje Cafetero y Antioquia");
    expect(labels).toContain("Zona Norte y Caribe");
    expect(labels).toContain("Zona Oriente");
  });

  it("toda ciudad está asignada a exactamente un grupo", () => {
    for (const c of COVERAGE_CITIES) {
      const referencedBy = COVERAGE_GROUPS.filter((g) => g.cities.includes(c.id));
      expect(referencedBy).toHaveLength(1);
      expect(referencedBy[0]?.id).toBe(c.groupId);
    }
  });

  it("toda ciudad declara un marker normalizado 0–1 (PA-17C, Mercator en build)", () => {
    for (const c of COVERAGE_CITIES) {
      expect(c.marker).toBeDefined();
      expect(c.marker?.x).toBeGreaterThanOrEqual(0);
      expect(c.marker?.x).toBeLessThanOrEqual(1);
      expect(c.marker?.y).toBeGreaterThanOrEqual(0);
      expect(c.marker?.y).toBeLessThanOrEqual(1);
    }
  });

  it("la suma de ciudades por grupo coincide con las 13 declaradas", () => {
    const total = COVERAGE_GROUPS.reduce((acc, g) => acc + g.cities.length, 0);
    expect(total).toBe(13);
  });

  it("ningún grupo contiene IDs duplicados", () => {
    for (const g of COVERAGE_GROUPS) {
      expect(new Set(g.cities).size).toBe(g.cities.length);
    }
  });

  it("composición textual de cada grupo respeta el orden de la fuente", () => {
    expect(COVERAGE_GROUPS[0]?.cities).toEqual(["bogota", "ibague", "cali"]);
    expect(COVERAGE_GROUPS[1]?.cities).toEqual(["medellin", "manizales", "pereira"]);
    expect(COVERAGE_GROUPS[2]?.cities).toEqual([
      "cartagena",
      "barranquilla",
      "santa-marta",
      "monteria",
      "sincelejo",
      "valledupar",
    ]);
    expect(COVERAGE_GROUPS[3]?.cities).toEqual(["cucuta"]);
  });
});
