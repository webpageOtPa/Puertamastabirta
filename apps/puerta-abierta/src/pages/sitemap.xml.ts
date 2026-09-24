// Endpoint /sitemap.xml — Puerta Abierta (PA-10)
// ---------------------------------------------------------------------------
// Genera `dist/sitemap.xml` en build con las rutas reales.
// Página /privacidad/ retirada por decisión del propietario (2026-09-18,
// acta del coordinador): no rehacer sin instrucción expresa. Con canonical
// dominio técnico: el `urlset` sale vacío en vez de publicar localhost,
// file:// o previews. En commercial, las `<loc>` son absolutas sobre
// el canonical aprobado.

import type { APIRoute } from "astro";
import { loadSiteConfig } from "../config/index.js";
import { SITE_PATHS, buildSitemapXml, resolveBuildProfile } from "../lib/seo.js";

export const prerender = true;

export const GET: APIRoute = () => {
  const loaded = loadSiteConfig(resolveBuildProfile());
  if (!loaded.ok) {
    return new Response(loaded.errors.join("\n"), { status: 500 });
  }
  const canonical = loaded.config.profile === "commercial" ? loaded.config.site.canonical : null;
  return new Response(buildSitemapXml(canonical, SITE_PATHS), {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
