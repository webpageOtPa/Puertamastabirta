#!/usr/bin/env node
// sync-coverage-script.mjs — Puerta Abierta (PA-08)
// ---------------------------------------------------------------------------
// Sincroniza el script de mejora progresiva de cobertura entre su fuente
// versionada y la carpeta `public/` que Astro copia verbatim a `dist/`:
//
//   fuente : apps/puerta-abierta/src/scripts/coverage-interaction.js
//   destino: apps/puerta-abierta/public/coverage-interaction.js (GENERADO,
//            ignorado por git; no editar a mano)
//
//   - `coverageInteraction` habilitado (por defecto): copia la fuente al
//     destino para que el build publique `/coverage-interaction.js`, que
//     Cobertura.astro referencia con un tag diferido (`defer`: no bloquea
//     la lectura) sólo en ese estado.
//   - `coverageInteraction` deshabilitado (`PA_COVERAGE_INTERACTION=0`):
//     elimina el destino si existe, de modo que `dist/` no contenga JS
//     exclusivo del módulo (PA-Q019).
//
// El criterio de habilitado/deshabilitado replica
// `src/config/features.ts` (misma variable, mismos valores). Sin red, sin
// I/O fuera del repo, sin Astro. Sólo Node.

import { copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env, exit } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "apps/puerta-abierta/src/scripts/coverage-interaction.js");
const DEST = resolve(ROOT, "apps/puerta-abierta/public/coverage-interaction.js");

const FALSE_VALUES = new Set(["0", "false", "no"]);
const TRUE_VALUES = new Set(["1", "true", "yes"]);

function resolveEnabled(e) {
  const raw = (e["PA_COVERAGE_INTERACTION"] ?? "").trim().toLowerCase();
  if (raw === "") return true;
  if (FALSE_VALUES.has(raw)) return false;
  if (TRUE_VALUES.has(raw)) return true;
  return true;
}

const enabled = resolveEnabled(env);

if (enabled) {
  if (!existsSync(SRC)) {
    console.error(`[sync-coverage-script] ERROR · falta la fuente ${SRC}`);
    exit(1);
  }
  copyFileSync(SRC, DEST);
  console.log(`[sync-coverage-script] OK · coverageInteraction=habilitado · publicado ${DEST}`);
} else {
  if (existsSync(DEST)) rmSync(DEST);
  console.log("[sync-coverage-script] OK · coverageInteraction=deshabilitado · sin script en dist");
}
exit(0);
