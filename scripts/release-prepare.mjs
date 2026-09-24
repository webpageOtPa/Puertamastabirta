#!/usr/bin/env node
// release-prepare.mjs — Puerta Abierta (PA-14)
// ---------------------------------------------------------------------------
// Construye UNA SOLA VEZ el candidato de release desde el commit actual y
// datos aprobados en `releases/<id>/` con:
//   site/           compilado (UNA build, sin reconstrucciones)
//   wrangler.jsonc  config del candidato (assets.directory "./site")
//   manifest.json   sitio, propósito, commit limpio, lockfile, versiones,
//                   hashes SHA-256 de todos los assets, cabeceras/canonical/
//                   política de destino identificados, evidencia listada
//   evidencia/      salidas de las pruebas ejecutadas SOBRE esa salida
//                   (scanner, presupuesto, smoke local)
//
// Perfiles:
//   --profile commercial (defecto): flujo comercial completo. HOY falla por
//     diseño (canonical null, sin canal aprobado, hero BORRADOR; PA-Q057):
//     la puerta lo documenta y se detiene SIN producir candidato.
//   --profile technical: mecánica del pipeline con fixture técnico ETIQUETADO
//     (proposito "mecanica-preview"). Verifica con --allow-preview y NUNCA
//     se promueve a comercial.
//
// Uso:
//   node scripts/release-prepare.mjs [--profile technical|commercial] [--port N]
// Sin red remota, sin credenciales, sin deploy. `releases/` está gitignored.

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { dirname, join, resolve } from "node:path";
import { argv, env, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { listRelative, sha256File, verifyRelease } from "./release-verify.mjs";
import { parseJsonc } from "./check-static.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "apps/puerta-abierta/dist");
const APP_WRANGLER = resolve(ROOT, "apps/puerta-abierta/wrangler.jsonc");
const DESTINO = "puerta-abierta-preview";
const SITE_ID = "puerta-abierta";

function log(s) {
  console.log(`[release-prepare] ${s}`);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
  return { status: r.status ?? 99, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function parseArgs(argvList) {
  const args = { profile: "commercial", port: 4510, help: false };
  for (let i = 0; i < argvList.length; i++) {
    const a = argvList[i];
    if (a === "--profile") {
      const v = argvList[++i];
      if (v !== "technical" && v !== "commercial") {
        console.error(`[release-prepare] perfil desconocido: ${v}`);
        exit(2);
      }
      args.profile = v;
    } else if (a === "--port") {
      args.port = Number(argvList[++i]);
      if (!Number.isInteger(args.port) || args.port < 1024) {
        console.error("[release-prepare] puerto inválido");
        exit(2);
      }
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else {
      console.error(`[release-prepare] argumento desconocido: ${a}`);
      exit(2);
    }
  }
  return args;
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

/** Petición HTTP local (GET/POST/HEAD) con cuerpo consumido. */
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

async function smoke(siteAbs, port) {
  const child = spawn(
    process.execPath,
    ["scripts/serve-dist.mjs", "--host", "127.0.0.1", "--port", String(port), "--root", siteAbs],
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
      contentType: root.headers["content-type"] ?? null,
      cache: root.headers["cache-control"] ?? null,
      csp: (root.headers["content-security-policy"] ?? "").slice(0, 80),
    });
    const nf = await request("GET", port, "/ruta-que-no-existe-xyz-pa14");
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
      allow: post.headers["allow"] ?? null,
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
  if (args.help) {
    console.log(
      "Uso: node scripts/release-prepare.mjs [--profile technical|commercial] [--port N]",
    );
    exit(0);
  }
  const { profile } = args;
  const esMecanica = profile === "technical";

  // 0. Commit limpio y trazable.
  const head = run("git", ["rev-parse", "HEAD"]);
  if (head.status !== 0) {
    console.error("[release-prepare] ERROR · no se pudo leer HEAD");
    exit(2);
  }
  const commit = head.out.trim();
  const dirty = run("git", ["status", "--porcelain"]);
  if (dirty.status !== 0 || dirty.out.trim() !== "") {
    console.error(
      "[release-prepare] ERROR · árbol con cambios sin commitear; el candidato exige commit limpio",
    );
    exit(1);
  }
  const short = commit.slice(0, 7);
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const id = `pa-${profile}-${short}-${ts}`;
  log(`commit=${short} perfil=${profile} id=${id}`);

  // 1. Puerta de configuración del perfil (el commercial HOY falla por diseño).
  const val = run(process.execPath, [
    "--experimental-strip-types",
    "--no-warnings",
    "scripts/validate-config.mjs",
    profile,
  ]);
  if (val.status !== 0) {
    console.error(val.out.trimEnd());
    if (!esMecanica) {
      console.error(
        "[release-prepare] RECHAZO · el candidato COMERCIAL no puede prepararse hoy: " +
          "canonical null, sin canal aprobado y hero en BORRADOR (puerta PA-Q057 por diseño). " +
          "Para probar la MECÁNICA del pipeline, usar --profile technical (fixture etiquetado, sin promoción).",
      );
    }
    exit(1);
  }
  log(`validate:config OK (${profile})`);

  // 2. UNA SOLA build del perfil pedido.
  const buildEnv = { ...env, PA_BUILD_PROFILE: profile };
  const sync = run(process.execPath, ["scripts/sync-coverage-script.mjs"], { env: buildEnv });
  if (sync.status !== 0) {
    console.error(sync.out.trimEnd());
    console.error("[release-prepare] ERROR · sync-coverage-script falló");
    exit(1);
  }
  const build = run("pnpm", ["--filter", "./apps/puerta-abierta", "build:test"], { env: buildEnv });
  if (build.status !== 0) {
    console.error(build.out.trimEnd());
    console.error("[release-prepare] ERROR · build del candidato falló");
    exit(1);
  }
  log("build única OK");

  // 3. Copia a releases/<id>/site + wrangler del candidato.
  const cand = resolve(ROOT, "releases", id);
  const site = join(cand, "site");
  const evid = join(cand, "evidencia");
  mkdirSync(evid, { recursive: true });
  cpSync(DIST, site, { recursive: true });
  log(`site copiado (${listRelative(site).length} archivos)`);

  const appW = parseJsonc(readFileSync(APP_WRANGLER, "utf8"));
  const wranglerText =
    `{\n` +
    `  // Candidato ${id} — Puerta Abierta (PA-14).\n` +
    `  // Emulación/preparación futura; destino "${DESTINO}" PENDIENTE_DE_APROBACION.\n` +
    `  // Sin main, sin bindings, sin run_worker_first. NO autoriza nada remoto.\n` +
    `  "name": "${DESTINO}",\n` +
    `  "compatibility_date": "${appW.compatibility_date}",\n` +
    `  "assets": {\n` +
    `    "directory": "./site",\n` +
    `    "not_found_handling": "${appW.assets?.not_found_handling ?? "404-page"}",\n` +
    `    "html_handling": "${appW.assets?.html_handling ?? "auto-trailing-slash"}",\n` +
    `  },\n` +
    `}\n`;
  writeFileSync(join(cand, "wrangler.jsonc"), wranglerText, "utf8");

  // 4. Pruebas SOBRE esa salida (no se recicla otro fixture).
  const scan = run(process.execPath, ["scripts/check-static.mjs", "--dist", site]);
  const scanLog = `${scan.out.trimEnd()}\n[release-prepare] check-static exit=${scan.status}\n`;
  writeFileSync(join(evid, "check-static.log"), scanLog, "utf8");
  log(`check-static sobre candidato exit=${scan.status}`);
  if (scan.status !== 0) {
    console.error(scanLog);
    console.error("[release-prepare] RECHAZO · el candidato no pasa check:static");
    exit(1);
  }

  const budget = run(process.execPath, [
    "scripts/budget-report.mjs",
    "--use-dist",
    "--dist",
    site,
    "--port",
    String(args.port + 1),
  ]);
  const budgetLog = `${budget.out.trimEnd()}\n[release-prepare] budget exit=${budget.status}\n`;
  writeFileSync(join(evid, "budget.log"), budgetLog, "utf8");
  log(`budget sobre candidato exit=${budget.status}`);
  if (budget.status !== 0) {
    console.error(budgetLog);
    console.error("[release-prepare] RECHAZO · el candidato supera el presupuesto");
    exit(1);
  }

  const smokeRes = await smoke(site, args.port);
  writeFileSync(join(evid, "smoke.json"), `${JSON.stringify(smokeRes, null, 2)}\n`, "utf8");
  log(`smoke local ${smokeRes.ok ? "OK" : "FALLO"} (200/404/405)`);
  if (!smokeRes.ok) {
    console.error(JSON.stringify(smokeRes, null, 2));
    console.error("[release-prepare] RECHAZO · smoke local falló sobre el candidato");
    exit(1);
  }

  // 5. Manifiesto (hashes de TODOS los assets) + autoverificación sin reconstruir.
  const pnpmR = run("pnpm", ["--version"]);
  const appPkg = JSON.parse(
    readFileSync(resolve(ROOT, "apps/puerta-abierta/package.json"), "utf8"),
  );
  const assets = listRelative(site).map((ruta) => ({
    ruta,
    sha256: sha256File(join(site, ruta)),
    bytes: statSync(join(site, ruta)).size,
  }));
  const manifest = {
    formato: "puerta-abierta-release/1",
    id,
    sitio: SITE_ID,
    proposito: esMecanica ? "mecanica-preview" : "comercial",
    perfil: profile,
    commit,
    commitLimpio: true,
    destino: DESTINO,
    lockfile: {
      archivo: "pnpm-lock.yaml",
      sha256: createHash("sha256")
        .update(readFileSync(resolve(ROOT, "pnpm-lock.yaml")))
        .digest("hex"),
    },
    versiones: {
      node: process.version,
      pnpm: pnpmR.out.trim(),
      astro: String(appPkg?.dependencies?.astro ?? ""),
    },
    wrangler: "wrangler.jsonc",
    cabeceras: "scripts/serve-dist.mjs",
    canonical: "apps/puerta-abierta/src/config/site.ts",
    politicaDestino: "deploy/destinos.json",
    assets,
    evidencia: ["evidencia/check-static.log", "evidencia/budget.log", "evidencia/smoke.json"],
    creado: new Date().toISOString(),
    nota: esMecanica
      ? "Candidato de MECÁNICA con perfil technical (proposito mecanica-preview): fixture para probar el pipeline. NO es comercial y NO se promueve."
      : "Candidato comercial: bytes exactos a publicar tras aprobación de ID+digest+destino, sin reconstrucción.",
  };
  writeFileSync(join(cand, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const verifyLines = [];
  const v = verifyRelease(cand, { allowPreview: esMecanica, repoRoot: ROOT });
  verifyLines.push(
    `[release-verify] ${v.ok ? "OK" : "RECHAZO"} · autocomprobación del candidato ${id}`,
  );
  for (const e of v.errors) verifyLines.push(`  - ${e}`);
  // La propia autoverificación también queda como evidencia listada: se
  // escribe verify.log ANTES de la verificación final para que exista al
  // comprobar la lista (la evidencia no se hashea, sólo se exige que
  // exista; el resultado final se añade al mismo archivo después).
  manifest.evidencia = [...manifest.evidencia, "evidencia/verify.log"];
  writeFileSync(join(cand, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(evid, "verify.log"), `${verifyLines.join("\n")}\n`, "utf8");
  if (!v.ok) {
    console.error(verifyLines.join("\n"));
    console.error("[release-prepare] RECHAZO · el candidato no pasa su autoverificación");
    exit(1);
  }
  // Re-verifica con la lista final de evidencia (sin reconstruir) y añade
  // el resultado al mismo verify.log (ya existe; la evidencia no se hashea).
  const v2 = verifyRelease(cand, { allowPreview: esMecanica, repoRoot: ROOT });
  verifyLines.push(
    `[release-verify] ${v2.ok ? "OK" : "RECHAZO"} · verificación final con evidencia completa`,
  );
  for (const e of v2.errors) verifyLines.push(`  - ${e}`);
  writeFileSync(join(evid, "verify.log"), `${verifyLines.join("\n")}\n`, "utf8");
  if (!v2.ok) {
    console.error(verifyLines.join("\n"));
    exit(1);
  }

  const digest = createHash("sha256")
    .update(readFileSync(join(cand, "manifest.json")))
    .digest("hex");
  log(`candidato listo: releases/${id}`);
  log(`digest(manifest.json)=${digest}`);
  if (esMecanica) {
    log("MECÁNICA-PREVIEW con perfil technical — NO es comercial y NO se promueve");
    log(`verificar con: node scripts/release-verify.mjs releases/${id} --allow-preview`);
  } else {
    log(`verificar con: node scripts/release-verify.mjs releases/${id}`);
  }
}

main().catch((e) => {
  console.error(
    `[release-prepare] ERROR · ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
  );
  exit(1);
});
