// Endpoint /robots.txt — Puerta Abierta (PA-10)
// ---------------------------------------------------------------------------
// Genera `dist/robots.txt` en build según el perfil (`PA_BUILD_PROFILE`,
// por defecto `technical`):
//   - technical: `Disallow: /` (coherente con el noindex de las páginas).
//   - commercial: `Allow: /` + línea `Sitemap:` con la URL aprobada
//     (sólo existe cuando hay canonical; hoy el build comercial sigue
//     bloqueado por validate-config).

import type { APIRoute } from "astro";
import { loadSiteConfig } from "../config/index.js";
import { buildRobotsTxt, resolveBuildProfile } from "../lib/seo.js";

export const prerender = true;

export const GET: APIRoute = () => {
  const loaded = loadSiteConfig(resolveBuildProfile());
  if (!loaded.ok) {
    return new Response(loaded.errors.join("\n"), { status: 500 });
  }
  const { config } = loaded;
  const sitemapUrl =
    config.profile === "commercial" && config.site.canonical !== null
      ? `${config.site.canonical}/sitemap.xml`
      : null;
  return new Response(buildRobotsTxt(config.profile, sitemapUrl), {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
