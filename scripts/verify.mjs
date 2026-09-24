#!/usr/bin/env node
// verify.mjs — Puerta Abierta (PA-13)
// ---------------------------------------------------------------------------
// Cadena reproducible de puertas en orden, con fallo claro en la primera que
// falle (02_ARQUITECTURA/ARCHIVOS_DE_PROYECTO.md: `pnpm verify`).
//
// Orden: validate:config → check → build:test → test → check:static
//        → contrast:strict → budget:report → test:e2e
//
// build:test va antes del scanner y de los unit tests que leen dist: así
// verify siempre evalúa su propio artefacto técnico, incluso si el último
// build local fue comercial. budget:report usa --use-dist porque build:test
// ya reconstruyó dist en esta misma cadena (la medición autónoma
// con build propio es `pnpm run budget:report` sin flags).
//
// Contingencia por cuota de CI (PA-Q060): si el CI agota cuota, se pausa o se
// aplica contingencia manual autorizada con artefacto verificado; NUNCA se
// activa un servicio pagado ni un segundo autodeploy. Ver EVIDENCIA de PA-13.
//
// `verify` no publica ni hace smoke contra producción.

import { spawnSync } from "node:child_process";

const GATES = [
  { name: "validate:config", cmd: "pnpm", args: ["run", "validate:config"] },
  { name: "check", cmd: "pnpm", args: ["run", "check"] },
  { name: "build:test", cmd: "pnpm", args: ["run", "build:test"] },
  { name: "test", cmd: "pnpm", args: ["test"] },
  { name: "check:static", cmd: "pnpm", args: ["run", "check:static"] },
  { name: "contrast:strict", cmd: "pnpm", args: ["run", "contrast:strict"] },
  { name: "budget:report", cmd: "pnpm", args: ["run", "budget:report", "--", "--use-dist"] },
  { name: "test:e2e", cmd: "pnpm", args: ["run", "test:e2e"] },
];

let failed = null;
for (const [i, gate] of GATES.entries()) {
  console.log(`\n[verify] puerta ${i + 1}/${GATES.length}: ${gate.name} …`);
  const r = spawnSync(gate.cmd, gate.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    failed = { name: gate.name, exit: r.status };
    console.error(`[verify] FAIL en puerta "${gate.name}" (exit ${r.status}); cadena detenida.`);
    break;
  }
  console.log(`[verify] OK · ${gate.name}`);
}

if (failed) {
  console.error(
    `[verify] RESULTADO: FAIL · primera puerta fallida: ${failed.name} (exit ${failed.exit})`,
  );
  process.exit(typeof failed.exit === "number" ? failed.exit : 1);
}
console.log("\n[verify] RESULTADO: PASS · todas las puertas en orden");
