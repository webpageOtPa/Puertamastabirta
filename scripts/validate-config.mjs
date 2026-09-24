#!/usr/bin/env node
// validate-config.mjs — Puerta Abierta
// ---------------------------------------------------------------------------
// CLI que ejecuta `loadSiteConfig(profile)` y vuelca el resultado a
// stdout. Devuelve exit 0 si la configuración es válida y exit 1 si no.
//
// Se invoca SIEMPRE con `--experimental-strip-types` (Node 22.6+), desde
// el script de `package.json`:
//
//   "validate:config": "node --experimental-strip-types --no-warnings
//                        scripts/validate-config.mjs technical"
//
// Perfil:
//   - Argumento posicional #1: "technical" | "commercial". Por defecto
//     "technical".
//   - Variable de entorno `PA_BUILD_PROFILE` sobrescribe el argumento.
//   - Cualquier valor distinto a "commercial" se considera "technical".
//
// Flags de features (PA-08):
//   - `PA_COVERAGE_INTERACTION=0` deshabilita el selector de cobertura
//     en el build (sin controles ni script en dist). Por defecto
//     habilitado. El resultado imprime `coverageInteraction=<bool>`.
//     `scripts/sync-coverage-script.mjs` (invocado por `pnpm build:test`
//     y `pnpm build`) aplica el mismo criterio al publicar/retirar
//     `public/coverage-interaction.js` antes de compilar Astro.
//
// Sin red, sin I/O fuera del repo, sin Astro. Sólo Node + Zod.

import { argv, env, exit } from "node:process";

const arg = argv[2];
const envProfile = env.PA_BUILD_PROFILE;
const profile = arg === "commercial" || envProfile === "commercial" ? "commercial" : "technical";

const mod = await import("../apps/puerta-abierta/src/config/index.ts");
const result = mod.loadSiteConfig(profile);
if (!result.ok) {
  console.error(
    `[validate-config] ERROR · perfil=${profile} · ${result.errors.length} problema(s):`,
  );
  for (const e of result.errors) console.error(`  - ${e}`);
  exit(1);
}

const s = result.crossValidation.summary;
console.log(
  `[validate-config] OK · perfil=${profile} · siteId=${s.siteId} · canales=${s.channelCount} (habilitados+aprobados=${s.enabledApprovedChannels}) · cobertura=${s.cityCount} ciudades en ${s.groupCount} grupos · bloques=${s.blockCount} (habilitados=${s.enabledBlocks}) · coverageInteraction=${String(result.config.features.coverageInteraction)}`,
);
exit(0);
