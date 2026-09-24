import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createCoverageInteraction,
  normalizeCityId,
  resolveCity,
} from "../../apps/puerta-abierta/src/lib/coverage-interaction.js";
import type {
  CoverageCityRef,
  CoverageGroupRef,
} from "../../apps/puerta-abierta/src/lib/coverage-interaction.js";
import { SiteFeaturesSchema } from "../../apps/puerta-abierta/src/contracts/index.js";
import { resolveSiteFeatures } from "../../apps/puerta-abierta/src/config/features.js";
import { loadSiteConfig } from "../../apps/puerta-abierta/src/config/index.js";
import { validateConfig } from "../../apps/puerta-abierta/src/lib/validate-config.js";

// PA-08 · PA-Q021 — Montar/desmontar, dos instancias e ID desconocido.
// Módulo puro sin DOM: sin variables globales que mezclen instancias;
// IDs inválidos → `null` con estado estable, nunca excepción global.
//
// PA-08 · PA-Q019 — El flag `coverageInteraction` viaja del esquema a
// `loadSiteConfig` y a `validateConfig` (prueba de ambos estados con
// `resolveSiteFeatures`; el build con el flag apagado se verifica en
// EVIDENCIA.md con `PA_COVERAGE_INTERACTION=0` + grep sobre `dist`).

const CITIES: CoverageCityRef[] = [
  { id: "bogota", name: "Bogotá D.C.", groupId: "zona-centro-y-sur" },
  { id: "ibague", name: "Ibagué", groupId: "zona-centro-y-sur" },
  { id: "cucuta", name: "Cúcuta", groupId: "zona-oriente" },
];

const GROUPS: CoverageGroupRef[] = [
  { id: "zona-centro-y-sur", label: "Zona Centro y Sur" },
  { id: "zona-oriente", label: "Zona Oriente" },
];

afterEach(() => {
  vi.resetModules();
  delete process.env["PA_COVERAGE_INTERACTION"];
});

describe("coverage-interaction · normalizeCityId (PA-Q021)", () => {
  it("normaliza recorte y minúsculas", () => {
    expect(normalizeCityId("  Bogota ")).toBe("bogota");
    expect(normalizeCityId("CUCUTA")).toBe("cucuta");
  });

  it("rechaza no-cadenas y vacíos con null, sin lanzar", () => {
    expect(normalizeCityId("")).toBeNull();
    expect(normalizeCityId("   ")).toBeNull();
    expect(normalizeCityId(null)).toBeNull();
    expect(normalizeCityId(undefined)).toBeNull();
    expect(normalizeCityId(123)).toBeNull();
    expect(normalizeCityId({ id: "bogota" })).toBeNull();
    expect(normalizeCityId(["bogota"])).toBeNull();
  });
});

describe("coverage-interaction · resolveCity pura (PA-Q021)", () => {
  it("resuelve ciudad y grupo válidos", () => {
    expect(resolveCity(CITIES, GROUPS, "bogota")).toEqual({
      cityId: "bogota",
      cityName: "Bogotá D.C.",
      groupId: "zona-centro-y-sur",
      groupLabel: "Zona Centro y Sur",
    });
  });

  it("devuelve null para ID desconocido, sin excepción", () => {
    expect(resolveCity(CITIES, GROUPS, "ciudad-fantasma")).toBeNull();
    expect(resolveCity(CITIES, GROUPS, "")).toBeNull();
    expect(resolveCity(CITIES, GROUPS, null)).toBeNull();
    expect(resolveCity(CITIES, GROUPS, 42)).toBeNull();
  });

  it("devuelve null si la ciudad no tiene grupo declarado", () => {
    const huerfanas: CoverageCityRef[] = [{ id: "x", name: "X", groupId: "grupo-ausente" }];
    expect(resolveCity(huerfanas, GROUPS, "x")).toBeNull();
  });
});

describe("coverage-interaction · instancias independientes (PA-Q021)", () => {
  it("dos instancias no interfieren entre sí", () => {
    const a = createCoverageInteraction({ cities: CITIES, groups: GROUPS });
    const b = createCoverageInteraction({ cities: CITIES, groups: GROUPS });

    expect(a.select("bogota")?.cityId).toBe("bogota");
    // B sigue vacía aunque A haya seleccionado.
    expect(b.getSelected()).toBeNull();
    expect(b.getSelectCount()).toBe(0);

    expect(b.select("cucuta")?.cityId).toBe("cucuta");
    // A conserva su selección y su contador.
    expect(a.getSelected()?.cityId).toBe("bogota");
    expect(a.getSelectCount()).toBe(1);
    expect(b.getSelectCount()).toBe(1);

    // Limpiar A no afecta a B.
    a.clear();
    expect(a.getSelected()).toBeNull();
    expect(b.getSelected()?.cityId).toBe("cucuta");
  });

  it("remontar (crear de nuevo) parte de estado vacío", () => {
    const primera = createCoverageInteraction({ cities: CITIES, groups: GROUPS });
    primera.select("bogota");
    expect(primera.getSelected()?.cityId).toBe("bogota");

    const segunda = createCoverageInteraction({ cities: CITIES, groups: GROUPS });
    expect(segunda.getSelected()).toBeNull();
    expect(segunda.getSelectCount()).toBe(0);
  });

  it("IDs inválidos se rechazan sin excepción y con estado estable", () => {
    const onSelect = vi.fn();
    const inst = createCoverageInteraction({ cities: CITIES, groups: GROUPS, onSelect });
    inst.select("bogota");
    expect(inst.getSelected()?.cityId).toBe("bogota");
    expect(inst.getSelectCount()).toBe(1);
    onSelect.mockClear();

    const invalidos: unknown[] = [
      "ciudad-fantasma",
      "",
      "   ",
      null,
      undefined,
      0,
      123,
      { id: "bogota" },
      "bogota,ibague",
    ];
    for (const raw of invalidos) {
      let resultado = null;
      expect(() => {
        resultado = inst.select(raw);
      }).not.toThrow();
      expect(resultado).toBeNull();
    }
    // Estado estable: sigue la selección anterior, sin contar inválidos
    // y sin avisar al presentador.
    expect(inst.getSelected()?.cityId).toBe("bogota");
    expect(inst.getSelectCount()).toBe(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clear avisa con null y deja estado vacío", () => {
    const onSelect = vi.fn();
    const inst = createCoverageInteraction({ cities: CITIES, groups: GROUPS, onSelect });
    inst.select("ibague");
    inst.clear();
    expect(inst.getSelected()).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    // Tras limpiar se puede volver a seleccionar.
    expect(inst.select("cucuta")?.cityId).toBe("cucuta");
    expect(inst.getSelectCount()).toBe(2);
  });

  it("getSelected devuelve copia (mutarla no corrompe el estado)", () => {
    const inst = createCoverageInteraction({ cities: CITIES, groups: GROUPS });
    inst.select("bogota");
    const copia = inst.getSelected();
    expect(copia?.cityId).toBe("bogota");
    if (copia) copia.cityId = "manipulado";
    expect(inst.getSelected()?.cityId).toBe("bogota");
  });
});

describe("coverageInteraction · esquema y resolución (PA-Q019)", () => {
  it("el esquema acepta boolean y rechaza otros tipos", () => {
    expect(SiteFeaturesSchema.safeParse({ coverageInteraction: true }).success).toBe(true);
    expect(SiteFeaturesSchema.safeParse({ coverageInteraction: false }).success).toBe(true);
    expect(SiteFeaturesSchema.safeParse({ coverageInteraction: "si" }).success).toBe(false);
    expect(SiteFeaturesSchema.safeParse({}).success).toBe(false);
  });

  it("por defecto está habilitado", () => {
    expect(resolveSiteFeatures({})).toEqual({ coverageInteraction: true });
    expect(resolveSiteFeatures({ PA_COVERAGE_INTERACTION: "" })).toEqual({
      coverageInteraction: true,
    });
    expect(resolveSiteFeatures({ PA_COVERAGE_INTERACTION: "quizas" })).toEqual({
      coverageInteraction: true,
    });
  });

  it("PA_COVERAGE_INTERACTION=0/false/no lo deshabilita", () => {
    expect(resolveSiteFeatures({ PA_COVERAGE_INTERACTION: "0" })).toEqual({
      coverageInteraction: false,
    });
    expect(resolveSiteFeatures({ PA_COVERAGE_INTERACTION: "false" })).toEqual({
      coverageInteraction: false,
    });
    expect(resolveSiteFeatures({ PA_COVERAGE_INTERACTION: "no" })).toEqual({
      coverageInteraction: false,
    });
  });

  it("PA_COVERAGE_INTERACTION=1/true lo habilita", () => {
    expect(resolveSiteFeatures({ PA_COVERAGE_INTERACTION: "1" })).toEqual({
      coverageInteraction: true,
    });
    expect(resolveSiteFeatures({ PA_COVERAGE_INTERACTION: "TRUE" })).toEqual({
      coverageInteraction: true,
    });
  });

  it("loadSiteConfig(technical) incluye features con el flag habilitado", () => {
    const r = loadSiteConfig("technical");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.features).toEqual({ coverageInteraction: true });
      expect(r.crossValidation.summary.coverageInteraction).toBe(true);
    }
  });

  it("loadSiteConfig con PA_COVERAGE_INTERACTION=0 propaga el flag apagado", async () => {
    process.env["PA_COVERAGE_INTERACTION"] = "0";
    const mod = await import("../../apps/puerta-abierta/src/config/index.js");
    const r = mod.loadSiteConfig("technical");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.features).toEqual({ coverageInteraction: false });
      expect(r.crossValidation.summary.coverageInteraction).toBe(false);
    }
  });

  it("validateConfig sin features informa null y sigue validando", () => {
    const r = validateConfig({
      site: {
        siteId: "puerta-abierta",
        nombrePublico: "Puerta Abierta",
        lang: "es-CO",
        canonical: null,
        primaryChannelId: null,
      },
      channels: [],
      groups: [{ id: "g", label: "G", cities: ["c"] }],
      cities: [{ id: "c", name: "C", groupId: "g" }],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.coverageInteraction).toBeNull();
  });
});
