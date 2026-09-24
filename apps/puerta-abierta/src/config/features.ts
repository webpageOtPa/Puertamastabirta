// Features del sitio — Puerta Abierta (PA-08)
// ---------------------------------------------------------------------------
// `coverageInteraction` decide EN BUILD si la sección de cobertura
// incluye el selector local de ciudad y su script de resaltado.
//
//   - `true` (por defecto): Cobertura.astro publica un `<select>`
//     semántico + el tag diferido a `/coverage-interaction.js`, que
//     resalta la ciudad elegida en la lista y su punto en el SVG inline.
//   - `false`: sólo lista textual + SVG informativo, sin controles ni
//     JS exclusivo del módulo en `dist` (PA-Q019).
//
// Sobrescritura local para probar ambos estados sin editar fuentes:
//   PA_COVERAGE_INTERACTION=0 → deshabilitado ("0", "false" y "no"
//   apagan; "1"/"true" encienden; cualquier otro valor es el defecto).
//
// Sin red, sin querystring persistente, sin terceros. La lista textual
// sigue siendo la fuente de verdad en ambos estados.

import type { SiteFeatures } from "../contracts/index.js";

const ENV_VAR = "PA_COVERAGE_INTERACTION";
const FALSE_VALUES = new Set(["0", "false", "no"]);
const TRUE_VALUES = new Set(["1", "true", "yes"]);

function readEnvOverride(env: Record<string, string | undefined>): boolean | undefined {
  const raw = env[ENV_VAR]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return undefined;
  if (FALSE_VALUES.has(raw)) return false;
  if (TRUE_VALUES.has(raw)) return true;
  return undefined;
}

/**
 * Resuelve las features a partir de un entorno dado. Función pura para
 * poder probarla sin tocar `process.env` global.
 */
export function resolveSiteFeatures(env: Record<string, string | undefined>): SiteFeatures {
  const override = readEnvOverride(env);
  return { coverageInteraction: override ?? true };
}

/** Features efectivas del build actual (lee `process.env` una vez). */
export const SITE_FEATURES: SiteFeatures = resolveSiteFeatures(
  // `process` existe en el frontmatter de Astro (SSR/build en Node) y
  // en el CLI de validación; en el navegador este módulo no se importa.
  typeof process === "undefined" ? {} : (process.env as Record<string, string | undefined>),
);
