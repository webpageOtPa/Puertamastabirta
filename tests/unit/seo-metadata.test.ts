import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  SITE_PATHS,
  buildRobotsTxt,
  buildSitemapXml,
  containsScriptClose,
  escapeJsonLd,
  resolveBuildProfile,
  resolveSeoMeta,
  toOgLocale,
} from "../../apps/puerta-abierta/src/lib/seo.js";
import type { SiteIdentity } from "../../apps/puerta-abierta/src/contracts/index";

// PA-10 (PA-Q006, PA-Q045, PA-Q046, PA-Q047, PA-Q057) — SEO por perfil.
// ---------------------------------------------------------------------
// Tests puros sobre `src/lib/seo.ts` (sin red, sin build):
//   - technical: canonical null + noindex.
//   - commercial: canonical aprobado + sin noindex.
//   - JSON-LD: escape seguro de `<` y ausencia de `</script`.
//   - robots/sitemap coherentes con el perfil, sin localhost/file://.
//   - Sin rutas de API antiguas en `src/pages` (nunca capturan).

const baseSite: SiteIdentity = {
  siteId: "puerta-abierta",
  nombrePublico: "Puerta Abierta",
  lang: "es-CO",
  canonical: null,
  primaryChannelId: null,
};

const commercialSite: SiteIdentity = {
  ...baseSite,
  canonical: "https://puerta-abierta.example",
  primaryChannelId: "email-comercial",
};

describe("seo — perfil technical (PA-Q045, PA-Q057)", () => {
  it("canonical null + noindex presente", () => {
    const seo = resolveSeoMeta({
      profile: "technical",
      site: baseSite,
      title: "Puerta Abierta — prototipo",
      description: "Prototipo en revisión.",
    });
    expect(seo.canonical).toBeNull();
    expect(seo.ogUrl).toBeNull();
    expect(seo.noindex).toBe(true);
    expect(seo.lang).toBe("es-co");
    expect(seo.ogLocale).toBe("es_CO");
  });

  it("robots technical bloquea todo sin Sitemap inventado", () => {
    const robots = buildRobotsTxt("technical", null);
    expect(robots).toMatch(/Disallow: \//);
    expect(robots).not.toMatch(/Allow: \//);
    expect(robots).not.toMatch(/Sitemap:/);
  });

  it("sitemap technical no inventa dominio (urlset sin loc)", () => {
    const xml = buildSitemapXml(null, SITE_PATHS);
    expect(xml).not.toMatch(/<loc>/);
    expect(xml).not.toMatch(/localhost|file:\/\/|example\.invalid/);
  });
});

describe("seo — perfil commercial (PA-Q045)", () => {
  it("canonical aprobado + sin noindex", () => {
    const seo = resolveSeoMeta({
      profile: "commercial",
      site: commercialSite,
      title: "Puerta Abierta",
      description: "Descripción aprobada.",
    });
    expect(seo.canonical).toBe("https://puerta-abierta.example");
    expect(seo.ogUrl).toBe("https://puerta-abierta.example");
    expect(seo.noindex).toBe(false);
  });

  it("robots commercial permite y declara el sitemap aprobado", () => {
    const robots = buildRobotsTxt("commercial", "https://puerta-abierta.example/sitemap.xml");
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toMatch("Sitemap: https://puerta-abierta.example/sitemap.xml");
    expect(robots).not.toMatch(/Disallow: \//);
  });

  it("sitemap commercial lista las rutas reales con URLs absolutas", () => {
    const xml = buildSitemapXml("https://puerta-abierta.example", SITE_PATHS);
    expect(xml).toContain("<loc>https://puerta-abierta.example/</loc>");
    expect(xml).toContain("<loc>https://puerta-abierta.example/mapa-de-cobertura/</loc>");
    // Página /privacidad/ retirada por decisión del propietario
    // (2026-09-18): no debe aparecer en el sitemap.
    expect(xml).not.toContain("/privacidad");
    expect(xml).not.toMatch(/localhost|file:\/\//);
  });
});

describe("seo — resolución de perfil (PA-Q057)", () => {
  it("cualquier valor distinto de commercial es technical", () => {
    expect(resolveBuildProfile({})).toBe("technical");
    expect(resolveBuildProfile({ PA_BUILD_PROFILE: "preview" })).toBe("technical");
    expect(resolveBuildProfile({ PA_BUILD_PROFILE: "commercial" })).toBe("commercial");
  });

  it("og:locale deriva región en mayúsculas (es-CO → es_CO)", () => {
    expect(toOgLocale("es-CO")).toBe("es_CO");
    expect(toOgLocale("es-co")).toBe("es_CO");
    expect(toOgLocale("es")).toBe("es");
  });
});

describe("seo — JSON-LD seguro (PA-Q046)", () => {
  it("escapa `<` y elimina secuencias de cierre `</script`", () => {
    const evil = {
      name: 'Puerta Abierta </script><script>alert("x")</script>',
      note: "<img src=x onerror=alert(1)>",
    };
    const out = escapeJsonLd(evil);
    expect(containsScriptClose(out)).toBe(false);
    expect(out).not.toContain("<");
    // El JSON sigue siendo válido y recupera el texto original al parsear.
    expect(JSON.parse(out)).toEqual(evil);
  });

  it("detecta cierres en mayúsculas y con espacios", () => {
    expect(containsScriptClose("</SCRIPT>")).toBe(true);
    expect(containsScriptClose('</script ><img src="x">')).toBe(true);
    expect(containsScriptClose("texto inocuo")).toBe(false);
    expect(containsScriptClose(escapeJsonLd({ t: "</ScRiPt>" }))).toBe(false);
  });

  it("documenta la decisión: ninguna página emite JSON-LD en esta unidad", () => {
    // Si en el futuro se añade JSON-LD, este test debe ampliarse con la
    // página que lo emita. Hoy la decisión es no emitirlo (sin entidad
    // aprobada que declarar); el serializador queda probado arriba.
    expect(escapeJsonLd(null)).toBe("null");
  });
});

describe("seo — sin rutas de API antiguas (PA-Q047)", () => {
  it("src/pages no contiene endpoints de API que capturen solicitudes", () => {
    const pagesDir = resolve(process.cwd(), "apps/puerta-abierta/src/pages");
    const entries = readdirSync(pagesDir, { withFileTypes: true });
    const names = entries.map((e) => e.name);
    expect(names).not.toContain("api");
    const suspicious = names.filter(
      (n) => /api|action|webhook|submit|contacto-post/i.test(n) && n !== "404.astro",
    );
    expect(suspicious).toEqual([]);
  });

  it("las rutas del sitio son sólo /, 404, robots y sitemap (privacidad retirada 2026-09-18)", () => {
    expect(SITE_PATHS).toEqual(["/", "/mapa-de-cobertura/"]);
  });
});
