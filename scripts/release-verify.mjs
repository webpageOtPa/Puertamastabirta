#!/usr/bin/env node
// release-verify.mjs — Puerta Abierta (PA-14)
// ---------------------------------------------------------------------------
// Verifica un candidato de release SIN reconstruirlo: compara los hashes
// SHA-256 del manifiesto contra los archivos reales de `site/`, exige
// metadatos completos, valida `wrangler.jsonc` del candidato con las mismas
// reglas del scanner PA-11 y rechaza destinos fuera del inventario.
//
// Un candidato con `proposito: "mecanica-preview"` (perfil technical,
// fixture de mecánica) NUNCA es comercial: en modo estricto (por defecto)
// se rechaza como promoción indebida. El flag `--allow-preview` permite
// verificar la mecánica del fixture sin promoverlo (la salida lo rotula
// como NO PROMOVER A COMERCIAL).
//
// Uso:
//   node scripts/release-verify.mjs releases/<id> [--allow-preview]
// Salida: 0 verificado · 1 rechazo · 2 error de uso/entorno.
//
// La función `verifyRelease` se reutiliza desde `release-prepare.mjs`
// (autocomprobación tras escribir el manifiesto) y se ejercita con
// negativos en `tests/unit/release-guard.test.ts` vía esta misma CLI.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { argv, cwd, exit } from "node:process";
import { parseJsonc } from "./check-static.mjs";

const SITE_ID = "puerta-abierta";
const DESTINOS_REL = "deploy/destinos.json";

/** Campos obligatorios de primer nivel del manifiesto. */
const REQUIRED_FIELDS = [
  "formato",
  "id",
  "sitio",
  "proposito",
  "perfil",
  "commit",
  "commitLimpio",
  "destino",
  "lockfile",
  "versiones",
  "wrangler",
  "cabeceras",
  "canonical",
  "politicaDestino",
  "assets",
  "evidencia",
  "creado",
];

/**
 * @typedef {{ ok: boolean, errors: string[] }} VerifyResult
 */

/** SHA-256 hex de un archivo. */
export function sha256File(abs) {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

/** Recorre un árbol devolviendo rutas relativas con `/` (sin enlaces). */
export function listRelative(dirAbs) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs)) {
      const a = join(abs, entry);
      const st = statSync(a, { throwIfNoEntry: false });
      if (!st || st.isSymbolicLink()) continue;
      const r = rel === "" ? entry : `${rel}/${entry}`;
      if (st.isDirectory()) walk(a, r);
      else if (st.isFile()) out.push(r);
    }
  };
  walk(dirAbs, "");
  return out.sort();
}

/**
 * Verifica un candidato sin reconstruirlo.
 * @param {string} candidateDir ruta al directorio `releases/<id>/`
 * @param {{ allowPreview?: boolean, repoRoot?: string }} opts
 * @returns {VerifyResult} `ok: true` sólo si TODO pasa; `errors` lista rechazos.
 */
export function verifyRelease(candidateDir, opts = {}) {
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const allowPreview = opts.allowPreview === true;
  const repoRoot = resolve(opts.repoRoot ?? cwd());
  const candAbs = resolve(candidateDir);

  const manifestPath = join(candAbs, "manifest.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, errors: [`manifiesto ausente: ${manifestPath}`] };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, errors: ["manifiesto no parseable como JSON"] };
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, errors: ["manifiesto no es un objeto"] };
  }

  // 1. Metadatos completos.
  for (const f of REQUIRED_FIELDS) {
    if (manifest[f] === undefined || manifest[f] === null) {
      fail(`manifiesto incompleto: falta "${f}"`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // 2. Sitio: sólo Puerta Abierta (un candidato de otro sitio se rechaza).
  if (manifest.sitio !== SITE_ID) {
    fail(`sitio distinto: manifiesto declara sitio="${manifest.sitio}" (se exige "${SITE_ID}")`);
  }

  // 3. Propósito/perfil: el modo estricto exige comercial; el fixture de
  // mecánica sólo pasa con --allow-preview y sin promoverse.
  const proposito = String(manifest.proposito ?? "");
  const perfil = String(manifest.perfil ?? "");
  const esComercial = proposito === "comercial" && perfil === "commercial";
  const esMecanica = proposito === "mecanica-preview" && perfil === "technical";
  if (!esComercial && !esMecanica) {
    fail(`propósito/perfil incoherente: proposito="${proposito}" perfil="${perfil}"`);
  } else if (esMecanica && !allowPreview) {
    fail(
      `promoción indebida: candidato de mecánica (proposito="mecanica-preview", perfil="technical") ` +
        `presentado como comercial; verificar con --allow-preview sin promoverlo`,
    );
  }

  // 4. Commit: hash completo + árbol limpio declarado.
  if (!/^[0-9a-f]{40}$/.test(String(manifest.commit ?? ""))) {
    fail("manifiesto incompleto: commit no es un hash git completo de 40 hex");
  }
  if (manifest.commitLimpio !== true) {
    fail("commit no limpio: el candidato exige commitLimpio === true");
  }

  // 5. Lockfile y versiones con forma exigible.
  const lock = manifest.lockfile;
  if (!lock || typeof lock !== "object" || typeof lock.archivo !== "string") {
    fail("manifiesto incompleto: lockfile debe ser { archivo, sha256 }");
  } else if (!/^[0-9a-f]{64}$/.test(String(lock.sha256 ?? ""))) {
    fail("manifiesto incompleto: lockfile.sha256 no es SHA-256 hex");
  }
  const ver = manifest.versiones;
  for (const k of ["node", "pnpm", "astro"]) {
    if (!ver || typeof ver !== "object" || typeof ver[k] !== "string" || ver[k].length === 0) {
      fail(`manifiesto incompleto: versiones.${k} ausente o vacía`);
    }
  }

  // 6. Destino dentro del inventario permitido (sin cambio arbitrario).
  const invPath = join(repoRoot, DESTINOS_REL);
  if (String(manifest.politicaDestino ?? "") !== DESTINOS_REL) {
    fail(
      `política de destino no reconocida: "${manifest.politicaDestino}" (se exige "${DESTINOS_REL}")`,
    );
  } else if (!existsSync(invPath)) {
    fail(`inventario de destinos ausente: ${DESTINOS_REL}`);
  } else {
    try {
      const inv = parseJsonc(readFileSync(invPath, "utf8"));
      const ids = Array.isArray(inv?.destinos) ? inv.destinos.map((d) => d?.id) : [];
      if (!ids.includes(manifest.destino)) {
        fail(`destino fuera del inventario permitido: "${manifest.destino}"`);
      }
    } catch {
      fail(`inventario de destinos no parseable: ${DESTINOS_REL}`);
    }
  }

  // 7. Hashes de todos los assets contra los archivos reales.
  const siteAbs = join(candAbs, "site");
  if (!existsSync(siteAbs)) {
    fail("site/ ausente en el candidato");
  } else {
    const assets = manifest.assets;
    if (!Array.isArray(assets) || assets.length === 0) {
      fail("manifiesto incompleto: assets debe ser una lista no vacía con { ruta, sha256, bytes }");
    } else {
      const seen = new Set();
      for (const a of assets) {
        const ruta = a?.ruta;
        if (typeof ruta !== "string" || ruta.length === 0) {
          fail("asset sin ruta válida en el manifiesto");
          continue;
        }
        // Ruta contenida: relativa, sin `..`, sin absoluta, sin `\`.
        const norm = normalize(ruta).replace(/\\/g, "/");
        if (
          ruta.startsWith("/") ||
          /^[A-Za-z]:/.test(ruta) ||
          norm === ".." ||
          norm.startsWith("../") ||
          ruta.includes("..") ||
          ruta.includes("\\")
        ) {
          fail(`ruta fuera del directorio permitido: "${ruta}"`);
          continue;
        }
        if (seen.has(norm)) {
          fail(`asset duplicado en el manifiesto: "${ruta}"`);
          continue;
        }
        seen.add(norm);
        const abs = join(siteAbs, norm);
        if (!existsSync(abs)) {
          fail(`asset inventariado ausente en site/: "${ruta}"`);
          continue;
        }
        if (!/^[0-9a-f]{64}$/.test(String(a?.sha256 ?? ""))) {
          fail(`asset sin SHA-256 válido: "${ruta}"`);
          continue;
        }
        const real = sha256File(abs);
        if (real !== a.sha256) {
          fail(`hash mismatch (candidato alterado): "${ruta}"`);
          continue;
        }
        const bytes = statSync(abs).size;
        if (typeof a?.bytes !== "number" || a.bytes !== bytes) {
          fail(`tamaño incoherente: "${ruta}" declara ${a?.bytes} B, reales ${bytes} B`);
        }
      }
      // Sin archivos extra fuera del inventario: lo no hasheado no se publica.
      for (const rel of listRelative(siteAbs)) {
        const norm = normalize(rel).replace(/\\/g, "/");
        if (!seen.has(norm)) {
          fail(`archivo en site/ no inventariado en el manifiesto: "${rel}"`);
        }
      }
    }
  }

  // 8. wrangler.jsonc del candidato: esquema PA-11 + directory ./site.
  const wranglerRel = String(manifest.wrangler ?? "wrangler.jsonc");
  if (wranglerRel.includes("..") || wranglerRel.startsWith("/") || wranglerRel.includes("\\")) {
    fail(`ruta de wrangler fuera del candidato: "${wranglerRel}"`);
  } else {
    const wPath = join(candAbs, wranglerRel);
    if (!existsSync(wPath)) {
      fail(`wrangler del candidato ausente: ${wranglerRel}`);
    } else {
      let obj;
      try {
        obj = parseJsonc(readFileSync(wPath, "utf8"));
      } catch {
        obj = null;
      }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        fail("wrangler del candidato no parseable como JSONC");
      } else {
        const denyTop = [
          "main",
          "vars",
          "d1",
          "kv_namespaces",
          "r2_buckets",
          "durable_objects",
          "triggers",
          "routes",
        ];
        for (const key of Object.keys(obj)) {
          if (
            key === "main" ||
            key === "run_worker_first" ||
            key.toLowerCase().includes("binding") ||
            denyTop.includes(key)
          ) {
            fail(
              `wrangler del candidato con clave prohibida: "${key}" (sin main/bindings/run_worker_first)`,
            );
          } else if (!["name", "compatibility_date", "assets"].includes(key)) {
            fail(`wrangler del candidato con clave no permitida: "${key}"`);
          }
        }
        const a = obj["assets"];
        if (!a || typeof a !== "object" || Array.isArray(a)) {
          fail("wrangler del candidato: assets debe ser objeto");
        } else {
          for (const sub of Object.keys(a)) {
            if (
              sub === "run_worker_first" ||
              sub === "binding" ||
              sub.toLowerCase().includes("binding")
            ) {
              fail(`wrangler del candidato con clave prohibida en assets: "${sub}"`);
            } else if (!["directory", "not_found_handling", "html_handling"].includes(sub)) {
              fail(`wrangler del candidato con clave no permitida en assets: "${sub}"`);
            }
          }
          const dir = String(a["directory"] ?? "");
          const normDir = normalize(dir).replace(/\\/g, "/");
          if (normDir !== "./site" && normDir !== "site") {
            fail(
              `wrangler del candidato fuera del directorio permitido: assets.directory="${dir}" (se exige "./site")`,
            );
          }
        }
        if (typeof obj["name"] !== "string" || obj["name"] !== manifest.destino) {
          fail(
            `wrangler del candidato: name="${obj["name"]}" no coincide con destino="${manifest.destino}"`,
          );
        }
      }
    }
  }

  // 9. Archivos de cabeceras/canonical/política identificados + evidencia.
  for (const k of ["cabeceras", "canonical", "politicaDestino"]) {
    const rel = String(manifest[k] ?? "");
    if (rel.includes("..") || rel.startsWith("/") || rel.includes("\\")) {
      fail(`referencia fuera del repo: ${k}="${rel}"`);
    } else if (!existsSync(join(repoRoot, rel))) {
      fail(`archivo referenciado ausente en el repo: ${k}="${rel}"`);
    }
  }
  if (!Array.isArray(manifest.evidencia) || manifest.evidencia.length === 0) {
    fail("manifiesto incompleto: evidencia debe listar las salidas ejecutadas sobre el candidato");
  } else {
    for (const rel of manifest.evidencia) {
      if (
        typeof rel !== "string" ||
        rel.includes("..") ||
        rel.startsWith("/") ||
        rel.includes("\\")
      ) {
        fail(`evidencia con ruta fuera del candidato: "${rel}"`);
      } else if (!existsSync(join(candAbs, rel))) {
        fail(`evidencia listada ausente en el candidato: "${rel}"`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function parseArgs(argvList) {
  const args = { dir: null, allowPreview: false, help: false };
  for (let i = 0; i < argvList.length; i++) {
    const a = argvList[i];
    if (a === "--allow-preview") args.allowPreview = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("--")) {
      console.error(`[release-verify] argumento desconocido: ${a}`);
      exit(2);
    } else if (args.dir === null) {
      args.dir = a;
    } else {
      console.error(`[release-verify] argumento posicional extra: ${a}`);
      exit(2);
    }
  }
  return args;
}

const invokedDirectly =
  typeof process !== "undefined" &&
  argv[1] !== undefined &&
  (argv[1].endsWith("release-verify.mjs") || argv[1].endsWith("release-verify"));

if (invokedDirectly) {
  const args = parseArgs(argv.slice(2));
  if (args.help || args.dir === null) {
    console.log("Uso: node scripts/release-verify.mjs releases/<id> [--allow-preview]");
    console.log("  Sin flags exige candidato comercial. --allow-preview verifica");
    console.log("  mecánica técnica SIN promoverla a comercial.");
    exit(args.help ? 0 : 2);
  }
  const r = verifyRelease(args.dir, { allowPreview: args.allowPreview });
  if (r.ok) {
    if (args.allowPreview) {
      console.log(
        "[release-verify] OK · mecánica íntegra — MECÁNICA-PREVIEW, NO PROMOVER A COMERCIAL",
      );
    } else {
      console.log("[release-verify] OK · candidato comercial íntegro y conforme");
    }
    exit(0);
  }
  console.error("[release-verify] RECHAZO · el candidato NO es publicable:");
  for (const e of r.errors) console.error(`  - ${e}`);
  exit(1);
}
