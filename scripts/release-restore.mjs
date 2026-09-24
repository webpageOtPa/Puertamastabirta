#!/usr/bin/env node
// release-restore.mjs — Puerta Abierta (PA-15)
// ---------------------------------------------------------------------------
// Ensaya la restauración LOCAL de un candidato de release: copia los bytes
// exactos de `releases/<id>/site/` al directorio de salida local
// (`apps/puerta-abierta/dist` por defecto), verifica que los hashes SHA-256
// del manifiesto coinciden en el destino y repite el smoke local
// (GET / → 200, GET /inexistente → 404, POST / → 405).
//
// No reconstruye nada, no toca DNS, correo, datos heredados ni nada remoto.
// La restauración real en hosting es tarea del operador (fijar esos bytes
// con Wrangler, PA-17+); aquí sólo se ensaya la mecánica local del artefacto.
//
// Uso:
//   node scripts/release-restore.mjs <id|ruta> [--allow-preview] [--port N]
//                                        [--no-smoke] [--root DIR]
//   pnpm run release:restore -- <id> [--allow-preview]
//
//   <id|ruta>      id del candidato (`pa-technical-…`) o ruta a `releases/<id>/`.
//   --allow-preview  verifica candidatos de mecánica (`mecanica-preview`,
//                    perfil technical) SIN promoverlos a comerciales.
//   --port N        puerto del smoke local (defecto 4520).
//   --no-smoke      omite el smoke (sólo copia + verifica hashes).
//   --root DIR      destino de la restauración (defecto
//                   `apps/puerta-abierta/dist`, relativo al repo).
//                   GUARDIA DE SEGURIDAD (D1, PA-15): el root resuelto SÓLO
//                   puede ser el `dist` por defecto o un subdirectorio suyo,
//                   o un directorio bajo `tests/.tmp/` o bajo el temporal
//                   del sistema (`os.tmpdir()`). Cualquier otro destino
//                   (raíz del proyecto, ancestro de la raíz, directorio del
//                   candidato o ruta que lo contenga/contenida en él, ruta
//                   absoluta arbitraria fuera de esas zonas) ABORTA con
//                   exit 2 SIN borrar nada.
//
// Salida: 0 restaurado y verificado · 1 rechazo/fallo · 2 error de uso.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { listRelative, sha256File, verifyRelease } from "./release-verify.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DEFAULT = resolve(ROOT, "apps/puerta-abierta/dist");

function log(s) {
  console.log(`[release-restore] ${s}`);
}

function parseArgs(argvList) {
  const args = {
    target: null,
    allowPreview: false,
    port: 4520,
    smoke: true,
    root: DIST_DEFAULT,
    help: false,
  };
  for (let i = 0; i < argvList.length; i++) {
    const a = argvList[i];
    if (a === "--allow-preview") args.allowPreview = true;
    else if (a === "--no-smoke") args.smoke = false;
    else if (a === "--port") {
      args.port = Number(argvList[++i]);
      if (!Number.isInteger(args.port) || args.port < 1024) {
        console.error("[release-restore] puerto inválido");
        exit(2);
      }
    } else if (a === "--root") {
      const v = argvList[++i];
      if (!v) {
        console.error("[release-restore] --root exige un directorio");
        exit(2);
      }
      args.root = resolve(ROOT, v);
    } else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("--")) {
      console.error(`[release-restore] argumento desconocido: ${a}`);
      exit(2);
    } else if (args.target === null) args.target = a;
    else {
      console.error(`[release-restore] argumento posicional extra: ${a}`);
      exit(2);
    }
  }
  return args;
}

/** Resuelve el directorio del candidato desde un id o una ruta. */
function resolveCandidate(target) {
  const asGiven = resolve(target);
  if (existsSync(join(asGiven, "manifest.json"))) return asGiven;
  const inReleases = resolve(ROOT, "releases", target);
  if (existsSync(join(inReleases, "manifest.json"))) return inReleases;
  return null;
}

// ---------------------------------------------------------------------------
// Guardia de seguridad del destino (D1, PA-15).
// `rmSync(root, {recursive:true})` es destructivo: sin guardia, `--root .`
// borraría la raíz del repo y `--root apps/puerta-abierta` las fuentes.
// Regla (simple y conservadora): el root resuelto SÓLO es aceptable si
// queda dentro de una zona permitida — el `dist` local por defecto
// (`apps/puerta-abierta/dist`, él mismo o un subdirectorio), el temporal
// de pruebas (`<ROOT>/tests/.tmp/`, subdirectorio) o el temporal del
// sistema (`os.tmpdir()`, subdirectorio) — Y ADEMÁS no es ni contiene ni
// está contenido en el directorio del candidato, ni es la raíz del
// proyecto ni un ancestro suyo. Todo lo demás ABORTA con exit 2 antes de
// borrar nada.
// ---------------------------------------------------------------------------
const TESTS_TMP = resolve(ROOT, "tests", ".tmp");

function isSameOrInside(child, parent) {
  return child === parent || child.startsWith(parent + sep);
}

function isAncestorOf(maybeAncestor, p) {
  return p.startsWith(maybeAncestor + sep);
}

/** exit 2 con mensaje claro si el destino no es seguro. No borra nada. */
function assertSafeRoot(rootAbs, candAbs) {
  const reason = (() => {
    if (rootAbs === ROOT) return `el destino es la raíz del proyecto (${ROOT})`;
    if (isAncestorOf(rootAbs, ROOT))
      return `el destino (${rootAbs}) es un ancestro de la raíz del proyecto (${ROOT})`;
    if (candAbs !== null) {
      if (rootAbs === candAbs)
        return `el destino es el propio directorio del candidato (${candAbs})`;
      if (isAncestorOf(rootAbs, candAbs))
        return `el destino (${rootAbs}) contiene al candidato (${candAbs})`;
      if (isAncestorOf(candAbs, rootAbs))
        return `el destino (${rootAbs}) está dentro del candidato (${candAbs})`;
    }
    const inDist = isSameOrInside(rootAbs, DIST_DEFAULT);
    const inTestsTmp = isSameOrInside(rootAbs, TESTS_TMP);
    const inSysTmp = isSameOrInside(rootAbs, resolve(tmpdir()));
    if (!inDist && !inTestsTmp && !inSysTmp)
      return (
        `el destino (${rootAbs}) está fuera de las zonas permitidas: ` +
        `"${DIST_DEFAULT}", "${TESTS_TMP}/…" o el temporal del sistema ("${resolve(tmpdir())}/…")`
      );
    return null;
  })();
  if (reason !== null) {
    console.error(
      `[release-restore] RECHAZO · destino --root no permitido: ${reason}. Sin borrar nada.`,
    );
    exit(2);
  }
}

/** Espera a que el servidor sirva 200 en `/` (sondeo local). */
function waitReady(port, timeoutMs = 15000) {
  return new Promise((resolveP, rejectP) => {
    const t0 = Date.now();
    const probe = () => {
      const req = get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolveP();
        else if (Date.now() - t0 > timeoutMs)
          rejectP(new Error(`smoke sin 200 en / (${res.statusCode})`));
        else setTimeout(probe, 250);
      });
      req.on("error", () => {
        if (Date.now() - t0 > timeoutMs) rejectP(new Error("smoke: serve-dist no respondió"));
        else setTimeout(probe, 250);
      });
    };
    probe();
  });
}

/** Petición HTTP local con cuerpo consumido. */
function request(method, port, path) {
  return new Promise((resolveP, rejectP) => {
    const req = get({ host: "127.0.0.1", port, path, method }, (res) => {
      let n = 0;
      res.on("data", (c) => (n += c.length));
      res.on("end", () =>
        resolveP({ status: res.statusCode ?? 0, headers: res.headers, bytes: n }),
      );
    });
    req.on("error", rejectP);
  });
}

async function smoke(rootAbs, port) {
  const child = spawn(
    process.execPath,
    ["scripts/serve-dist.mjs", "--host", "127.0.0.1", "--port", String(port), "--root", rootAbs],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverOut = "";
  child.stdout.on("data", (d) => (serverOut += String(d)));
  child.stderr.on("data", (d) => (serverOut += String(d)));
  const checks = [];
  try {
    await waitReady(port);
    const root = await request("GET", port, "/");
    checks.push({
      nombre: "GET /",
      esperado: 200,
      observado: root.status,
      pasa: root.status === 200,
    });
    const nf = await request("GET", port, "/ruta-que-no-existe-xyz-pa15");
    checks.push({
      nombre: "GET /inexistente",
      esperado: 404,
      observado: nf.status,
      pasa: nf.status === 404,
    });
    const post = await request("POST", port, "/");
    checks.push({
      nombre: "POST /",
      esperado: 405,
      observado: post.status,
      pasa: post.status === 405 && (post.headers["allow"] ?? "").includes("GET"),
    });
  } finally {
    child.kill("SIGTERM");
  }
  return {
    servidor: serverOut.trim().split("\n")[0] ?? "",
    checks,
    ok: checks.every((c) => c.pasa),
  };
}

async function main() {
  const args = parseArgs(argv.slice(2));
  if (args.help || args.target === null) {
    console.log(
      "Uso: node scripts/release-restore.mjs <id|ruta> [--allow-preview] [--port N] [--no-smoke] [--root DIR]\n" +
        "  --root DIR sólo admite el dist por defecto, tests/.tmp/… o el temporal del sistema;\n" +
        "  cualquier otro destino (raíz del proyecto, candidato, ruta arbitraria) aborta con exit 2 sin borrar.",
    );
    exit(args.help ? 0 : 2);
  }

  // 1. Localizar el candidato (sólo local; sin red ni credenciales).
  const cand = resolveCandidate(args.target);
  if (cand === null) {
    console.error(
      `[release-restore] RECHAZO · candidato no encontrado: "${args.target}" (ni ruta con manifest.json ni releases/<id>/)`,
    );
    exit(1);
  }
  const manifest = JSON.parse(readFileSync(join(cand, "manifest.json"), "utf8"));
  const id = String(manifest.id ?? args.target);
  log(`candidato=${id}`);

  // 2. Verificar el candidato SIN reconstruirlo (misma guardia que PA-14).
  const v = verifyRelease(cand, { allowPreview: args.allowPreview, repoRoot: ROOT });
  if (!v.ok) {
    console.error("[release-restore] RECHAZO · el candidato NO es restaurable:");
    for (const e of v.errors) console.error(`  - ${e}`);
    exit(1);
  }
  log(
    args.allowPreview && manifest.proposito === "mecanica-preview"
      ? "verify OK · MECÁNICA-PREVIEW, NO PROMOVER A COMERCIAL"
      : "verify OK",
  );

  // 3. Copiar los bytes exactos al destino local (sólo salida local).
  // Guardia D1: validar el destino ANTES de borrar nada.
  assertSafeRoot(args.root, cand);
  const site = join(cand, "site");
  rmSync(args.root, { recursive: true, force: true });
  mkdirSync(args.root, { recursive: true });
  cpSync(site, args.root, { recursive: true });
  log(`copiado site/ → ${args.root} (${listRelative(args.root).length} archivos)`);

  // 4. Verificar hashes del manifiesto contra el destino restaurado.
  const mismatches = [];
  for (const a of manifest.assets) {
    const abs = join(args.root, a.ruta);
    if (!existsSync(abs)) {
      mismatches.push(`ausente en destino: "${a.ruta}"`);
      continue;
    }
    const real = sha256File(abs);
    if (real !== a.sha256) mismatches.push(`hash mismatch en destino: "${a.ruta}"`);
    else if (statSync(abs).size !== a.bytes)
      mismatches.push(`tamaño incoherente en destino: "${a.ruta}"`);
  }
  for (const rel of listRelative(args.root)) {
    if (!manifest.assets.some((a) => a.ruta === rel))
      mismatches.push(`archivo extra en destino no inventariado: "${rel}"`);
  }
  if (mismatches.length > 0) {
    console.error("[release-restore] RECHAZO · el destino no reproduce el manifiesto:");
    for (const m of mismatches) console.error(`  - ${m}`);
    exit(1);
  }
  log(`hashes verificados en destino (${manifest.assets.length} assets)`);

  // 5. Smoke local sobre lo restaurado (200/404/405).
  if (args.smoke) {
    const res = await smoke(args.root, args.port);
    for (const c of res.checks)
      log(
        `smoke ${c.nombre}: esperado ${c.esperado}, observado ${c.observado} → ${c.pasa ? "OK" : "FALLO"}`,
      );
    if (!res.ok) {
      console.error("[release-restore] RECHAZO · smoke local falló sobre lo restaurado");
      exit(1);
    }
    log("smoke local OK (200/404/405)");
  } else {
    log("smoke omitido (--no-smoke)");
  }

  const digest = createHash("sha256")
    .update(readFileSync(join(cand, "manifest.json")))
    .digest("hex");
  log(`restaurado ${id} (digest manifest=${digest.slice(0, 12)}…${digest.slice(-6)})`);
}

main().catch((e) => {
  console.error(
    `[release-restore] ERROR · ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
  );
  exit(1);
});
