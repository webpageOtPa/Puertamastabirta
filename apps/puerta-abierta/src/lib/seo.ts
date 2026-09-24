// Utilidades SEO por perfil — Puerta Abierta (PA-10)
// ---------------------------------------------------------------------------
// Funciones puras, sin red ni E/S: resuelven metadatos, robots y sitemap
// según el perfil de build (`technical` | `commercial`).
//
// Reglas (03_INTERFAZ/SEO_Y_RECURSOS.md):
//   - `technical`: canonical null/omitido + `noindex` + señal visible.
//   - `commercial`: canonical https aprobado + sin noindex (sólo tras
//     aprobación; hoy el build comercial sigue bloqueado por
//     validate-config, lo importante es que el flag funcione).
//   - Sin localhost, file:// ni rutas de preview en la salida.
//   - JSON-LD: NO se emite en ninguna página de esta unidad (no hay
//     entidad/servicios aprobados que declarar); se conserva sólo el
//     serializador seguro `escapeJsonLd` para uso futuro, con test de
//     secuencias de cierre `</script`.

import type { BuildProfile, SiteIdentity } from "../contracts/index.js";

/** Rutas reales del sitio (sin file://, localhost ni previews). */
// Página /privacidad/ retirada por decisión del propietario (2026-09-18, acta del coordinador): el contacto se realiza por canales externos; la política de privacidad se revisará antes de comercial si el responsable la requiere. No rehacer sin instrucción expresa.
export const SITE_PATHS: readonly string[] = ["/", "/mapa-de-cobertura/"];

/** `og:locale` en formato OpenGraph (`es-CO` → `es_CO`). */
export function toOgLocale(lang: string): string {
  const parts = lang.split("-");
  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return `${parts[0].toLowerCase()}_${parts[1].toUpperCase()}`;
  }
  return lang;
}

export interface SeoInput {
  profile: BuildProfile;
  site: SiteIdentity;
  title: string;
  description: string;
}

export interface SeoMeta {
  lang: string;
  title: string;
  description: string;
  /** `null` en technical: la página debe omitir el canonical. */
  canonical: string | null;
  noindex: boolean;
  /** Etiqueta OpenGraph `og:locale` derivada de `lang` (`es-CO` → `es_CO`). */
  ogLocale: string;
  /** `og:url`: sólo cuando hay canonical aprobado. */
  ogUrl: string | null;
  siteName: string;
}

/**
 * Resuelve el perfil de build desde el entorno. Cualquier valor distinto
 * de `"commercial"` se considera `"technical"` (mismo criterio que
 * `scripts/validate-config.mjs` con `PA_BUILD_PROFILE`).
 */
export function resolveBuildProfile(env: NodeJS.ProcessEnv = process.env): BuildProfile {
  return env["PA_BUILD_PROFILE"] === "commercial" ? "commercial" : "technical";
}

/** Metadatos por perfil. No promete recepción, rentas ni oficinas. */
export function resolveSeoMeta(input: SeoInput): SeoMeta {
  const { profile, site, title, description } = input;
  return {
    lang: site.lang.toLowerCase(),
    title,
    description,
    canonical: profile === "commercial" ? site.canonical : null,
    noindex: profile === "technical",
    ogLocale: toOgLocale(site.lang),
    ogUrl: profile === "commercial" ? site.canonical : null,
    siteName: site.nombrePublico,
  };
}

/**
 * Serializa un valor para incrustar en un bloque JSON-LD con escape
 * seguro de `<` (convierte cada `<` en `\u003c`, lo que impide
 * secuencias de cierre `</script` sin romper el JSON: el parse
 * inverso recupera el texto original).
 */
export function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value)?.replace(/</g, "\\u003c") ?? "null";
}

/** `true` si el texto contiene una secuencia de cierre de script. */
export function containsScriptClose(text: string): boolean {
  return /<\/script/i.test(text);
}

/** robots.txt por perfil: technical bloquea todo; commercial permite. */
export function buildRobotsTxt(profile: BuildProfile, sitemapUrl: string | null): string {
  if (profile === "technical") {
    return "User-agent: *\nDisallow: /\n";
  }
  const sitemapLine = sitemapUrl !== null ? `Sitemap: ${sitemapUrl}\n` : "";
  return `User-agent: *\nAllow: /\n${sitemapLine}`;
}

/**
 * Sitemap con rutas reales. Con canonical `null` (technical) NO se
 * inventa dominio: se emite un `urlset` vacío en vez de URLs falsas.
 */
export function buildSitemapXml(canonical: string | null, paths: readonly string[]): string {
  const entries =
    canonical === null
      ? ""
      : paths.map((p) => `  <url><loc>${canonical}${p}</loc></url>\n`).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}</urlset>\n`
  );
}
