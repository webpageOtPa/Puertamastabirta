import { describe, it, expect } from "vitest";
import { loadSiteConfig } from "../../apps/puerta-abierta/src/config/index.js";

// PA-Q004, PA-Q005, PA-Q006, PA-Q016 — Carga real desde
// `src/config/*`. Esta suite demuestra que los datos declarados en el
// proyecto pasan ambos perfiles tras la aprobación editorial y del dominio.

describe("loadSiteConfig — datos reales del proyecto", () => {
  it("carga technical con 13 ciudades, 4 grupos y 7 bloques", () => {
    const r = loadSiteConfig("technical");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const s = r.crossValidation.summary;
      expect(s.siteId).toBe("puerta-abierta");
      expect(s.profile).toBe("technical");
      expect(s.cityCount).toBe(13);
      expect(s.groupCount).toBe(4);
      expect(s.blockCount).toBe(7);
      expect(s.enabledBlocks).toBeGreaterThan(0);
      expect(s.enabledApprovedChannels).toBe(1);
    }
  });

  it("carga commercial con canonical y correo aprobados", () => {
    const r = loadSiteConfig("commercial");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.site.canonical).toBe("https://puertamasabierta.com.co");
      expect(r.crossValidation.summary.enabledApprovedChannels).toBe(1);
    }
  });

  it("los CTAs del proyecto no incluyen el texto histórico de captación", () => {
    const r = loadSiteConfig("technical");
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const b of r.config.blocks) {
        if (b.data.cta) {
          expect(b.data.cta.label.toLowerCase()).not.toMatch(/consignar/);
          expect(b.data.cta.label.toLowerCase()).not.toMatch(/solicitar análisis/);
        }
      }
    }
  });
});
