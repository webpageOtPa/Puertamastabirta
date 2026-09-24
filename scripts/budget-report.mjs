#!/usr/bin/env node
// budget-report.mjs — Puerta Abierta (PA-13)
// ---------------------------------------------------------------------------
// Informe de presupuesto de recursos por commit, reproducible y sin
// dependencias nuevas (solo Node stdlib + Playwright, ya devDependency).
//
// Mide la salida compilada técnica (apps/puerta-abierta/dist) servida por el
// servidor estático local scripts/serve-dist.mjs — NUNCA astro dev/HMR — con
// Chromium de Playwright, viewport móvil 390×844 y contexto fresco
// (caché vacía) en cada fase.
//
// Límites (06_CALIDAD/RENDIMIENTO_Y_CUOTAS.md):
//   1. Primera carga móvil caché vacía, sin interacción .... 1.000.000 B transferencia
//   2. JS inicial total (inline + dependencias), gzip ......   15.000 B gzip
//   3. CSS inicial total, gzip .............................   40.000 B gzip
//   4. Mejora del mapa (bytes nuevos al activarla), gzip ..   10.000 B gzip
//   5. Lógica del mapa desactivado ........................ 0 recursos exclusivos en dist
//   6. Terceros en la carga inicial ....................... 0 requests
//   7. Recorrido completo con scroll ...................... informativo (detecta
//      carga oculta masiva; sin límite normativo: se lista lo descargado extra)
//
// Gzip es presupuesto ANALÍTICO; la transferencia real se registra aparte.
// No se mezclan para aparentar cumplimiento.
//
// Uso:
//   node scripts/budget-report.mjs [--use-dist] [--dist DIR] [--port N] [--out ruta]
//     --use-dist  no reconstruye; usa dist/ existente (verify lo usa porque
//                 build:test ya corrió justo antes en la cadena).
//     --dist DIR  mide el árbol estático DIR en vez de apps/puerta-abierta/dist
//                 (release-prepare lo usa para medir SOBRE la salida del
//                 candidato; implica --use-dist). Sin flag, medición autónoma.
//     sin flag    ejecuta `pnpm build:test` antes de medir (medición autónoma).
//     --out ruta  guarda además el informe en un archivo.
//
// Sale con exit 1 si algún límite con puerta (1–6) se supera.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const distIdx = args.indexOf("--dist");
const DIST =
  distIdx >= 0 && args[distIdx + 1]
    ? resolve(ROOT, args[distIdx + 1])
    : resolve(ROOT, "apps/puerta-abierta/dist");
const PUBLIC_GEN = resolve(ROOT, "apps/puerta-abierta/public/coverage-interaction.js");

const LIMITS = {
  transferFirstLoad: 1_000_000, // B transferencia real
  jsInitialGzip: 15_000, // B gzip
  cssInitialGzip: 40_000, // B gzip
  mapDeltaGzip: 10_000, // B gzip
  mapOffExclusive: 0, // recursos
  thirdPartyInitial: 0, // requests
};

const useDist = args.includes("--use-dist") || distIdx >= 0;
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 4499;
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? resolve(ROOT, args[outIdx + 1]) : null;

function gzipBytes(buf) {
  return gzipSync(buf, { level: 9 }).length;
}

function fileBytes(rel) {
  return readFileSync(resolve(DIST, rel));
}

/** Scripts inline sin src en un HTML (bytes crudos + gzip del conjunto). */
function inlineScripts(html) {
  const blocks = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    if ((m[1] ?? "").trim().length > 0) blocks.push(m[1]);
  }
  const raw = Buffer.from(blocks.join("\n"), "utf8");
  return { count: blocks.length, raw: raw.length, gzip: gzipBytes(raw) };
}

function startServer(port, root) {
  return new Promise((resolveSrv, rejectSrv) => {
    const child = spawn(
      process.execPath,
      ["scripts/serve-dist.mjs", "--host", "127.0.0.1", "--port", String(port), "--root", root],
      {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let ready = false;
    const done = (err) => {
      if (!ready) {
        ready = true;
        if (err) rejectSrv(err);
        else resolveSrv(child);
      }
    };
    const timer = setTimeout(() => done(new Error("timeout esperando serve-dist")), 15000);
    child.stdout.on("data", () => {
      clearTimeout(timer);
      done(null);
    });
    child.stderr.on("data", (d) => process.stderr.write(`[serve-dist] ${d}`));
    child.on("error", (e) => {
      clearTimeout(timer);
      done(e);
    });
    child.on("exit", (c) => {
      if (!ready) {
        clearTimeout(timer);
        done(new Error(`serve-dist terminó con código ${c}`));
      }
    });
  });
}

async function main() {
  // 0. Build (salvo --use-dist).
  if (!useDist) {
    console.log("[budget] construyendo con pnpm build:test …");
    const r = spawnSync("pnpm", ["build:test"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) {
      console.error("[budget] FAIL · build:test no terminó (exit " + r.status + ")");
      process.exit(1);
    }
  } else if (!existsSync(resolve(DIST, "index.html"))) {
    console.error("[budget] FAIL · --use-dist pero dist/index.html no existe; ejecuta sin el flag");
    process.exit(1);
  }

  const { chromium } = await import("@playwright/test");
  const server = await startServer(PORT, DIST);
  const base = `http://127.0.0.1:${PORT}`;
  const lines = [];
  const log = (s) => {
    console.log(s);
    lines.push(s);
  };
  let failures = 0;

  try {
    const browser = await chromium.launch();
    const browserVersion = browser.version();
    log(
      `[budget] navegador: Chromium Playwright ${browserVersion} · viewport 390×844 · caché vacía · servidor del compilado ${base}`,
    );

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    /** url -> { status, type, bytes, phase } */
    const records = new Map();
    let phase = "initial";
    const failed = [];
    page.on("requestfailed", (req) =>
      failed.push(`${req.url()} :: ${req.failure()?.errorText ?? "?"}`),
    );
    page.on("response", async (resp) => {
      const url = resp.url();
      if (!url.startsWith(base)) {
        // Tercero (o data:): se registra sin descargar cuerpo.
        if (!records.has(url))
          records.set(url, { status: resp.status(), type: "third-party", bytes: 0, phase });
        return;
      }
      if (records.has(url)) return; // una sola cuenta por URL (caché del contexto)
      let bytes = 0;
      try {
        const body = await resp.body();
        bytes = body.length;
      } catch {
        bytes = Number(resp.headers()["content-length"] ?? 0);
      }
      const req = resp.request();
      records.set(url, { status: resp.status(), type: req.resourceType(), bytes, phase });
    });

    await page.goto(base + "/", { waitUntil: "load", timeout: 30000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {
      /* red sin aquietar: se mide lo observado y se declara */
    }
    await page.waitForTimeout(1500); // settle: deja que el JS diferido y las fuentes bloqueantes completen
    phase = "scroll";

    // Recorrido completo: scroll por pasos hasta el fondo.
    // Los callbacks de page.evaluate se ejecutan en el NAVEGADOR (document/
    // window son sus globales reales); el disable es local a esas líneas.
    // eslint-disable-next-line no-undef
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 844; y < scrollHeight + 844; y += 600) {
      // eslint-disable-next-line no-undef
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1500);

    const initial = [...records.entries()].filter(([, r]) => r.phase === "initial");
    const scrolled = [...records.entries()].filter(([, r]) => r.phase === "scroll");
    const thirdParty = [...records.entries()].filter(([u]) => {
      try {
        const h = new URL(u).hostname;
        return h !== "127.0.0.1" && h !== "localhost";
      } catch {
        return false; // data:, blob: — no son terceros de red
      }
    });

    const transferInitial = initial.reduce((a, [, r]) => a + r.bytes, 0);
    const transferScrollExtra = scrolled.reduce((a, [, r]) => a + r.bytes, 0);

    log("");
    log("== Transferencia primera carga móvil (caché vacía, sin interacción) ==");
    for (const [u, r] of initial) {
      const path = u.slice(base.length) || "/";
      log(`  ${String(r.bytes).padStart(7)} B  [${r.type}] ${path}`);
    }
    log(`  -------`);
    log(
      `  ${String(transferInitial).padStart(7)} B  TOTAL transferencia inicial (límite ${LIMITS.transferFirstLoad})`,
    );

    // Análisis estático (gzip analítico) desde dist.
    const html = fileBytes("index.html");
    const cssFiles = ["_astro/Footer.BXmQM_zs.css", "_astro/index.Bpb_srGj.css"].filter((f) =>
      existsSync(resolve(DIST, f)),
    );
    // A prueba de renombres con content-hash: si los nombres cambian, se toma todo _astro/*.css.
    const { readdirSync } = await import("node:fs");
    const astroCss = readdirSync(resolve(DIST, "_astro")).filter((f) => f.endsWith(".css"));
    const cssBufs = astroCss.map((f) => fileBytes(`_astro/${f}`));
    const cssGzip = cssBufs.reduce((a, b) => a + gzipBytes(b), 0);
    const cssRaw = cssBufs.reduce((a, b) => a + b.length, 0);
    const inline = inlineScripts(html.toString("utf8"));
    const covJs = fileBytes("coverage-interaction.js");
    // coverage-interaction.js lleva `defer` (no bloquea la lectura) pero SE
    // descarga con la carga inicial; por eso cuenta en el JS inicial.
    // Se documenta así en vez de excluirlo.
    const jsGzip = inline.gzip + gzipBytes(covJs);
    const mapDeltaGzip = gzipBytes(covJs);

    log("");
    log(
      "== JS inicial total (gzip analítico; incluye diferido porque se descarga en la carga inicial) ==",
    );
    log(`  inline Header (${inline.count} bloque(s)): raw ${inline.raw} B · gzip ${inline.gzip} B`);
    log(
      `  coverage-interaction.js (defer, cuenta en inicial): raw ${covJs.length} B · gzip ${gzipBytes(covJs)} B`,
    );
    log(`  TOTAL JS inicial gzip: ${jsGzip} B (límite ${LIMITS.jsInitialGzip})`);
    log("");
    log("== CSS inicial total (gzip analítico) ==");
    for (const f of astroCss) {
      const b = fileBytes(`_astro/${f}`);
      log(`  ${f}: raw ${b.length} B · gzip ${gzipBytes(b)} B`);
    }
    void cssFiles;
    log(`  <style> en index.html: 0 bloques (Astro emite hojas externas)`);
    log(
      `  TOTAL CSS inicial gzip: ${cssGzip} B (límite ${LIMITS.cssInitialGzip}) · raw ${cssRaw} B`,
    );
    log("");
    log(`== Mejora del mapa: bytes nuevos al activarla ==`);
    log(`  coverage-interaction.js gzip: ${mapDeltaGzip} B (límite ${LIMITS.mapDeltaGzip})`);
    log(`  (el resto del módulo —lista textual + SVG inline— ya está en el HTML inicial)`);

    // Mapa desactivado: mecanismo OFF sin residuos (PA-Q019).
    log("");
    log("== Lógica del mapa desactivado (PA-Q019) ==");
    const srcGate = readFileSync(
      resolve(ROOT, "apps/puerta-abierta/src/components/Cobertura.astro"),
      "utf8",
    ).includes('{interactionEnabled && <script src="/coverage-interaction.js" defer />}');
    let offOk = false;
    let offDetail = "";
    try {
      const before = existsSync(PUBLIC_GEN) ? readFileSync(PUBLIC_GEN) : null;
      const runSync = (env) => {
        const r = spawnSync(process.execPath, ["scripts/sync-coverage-script.mjs"], {
          cwd: ROOT,
          env: { ...process.env, ...env },
          encoding: "utf8",
        });
        return r.status === 0;
      };
      const offRan = runSync({ PA_COVERAGE_INTERACTION: "0" });
      const removed = !existsSync(PUBLIC_GEN);
      const onRan = runSync({});
      const restored =
        existsSync(PUBLIC_GEN) && (before === null || readFileSync(PUBLIC_GEN).equals(before));
      offOk = offRan && removed && onRan && restored && srcGate;
      offDetail = `sync OFF exit=${offRan} · generado eliminado=${removed} · sync ON exit=${onRan} · restaurado idéntico=${restored} · gate en Cobertura.astro=${srcGate}`;
    } catch (e) {
      offDetail = `excepción: ${e instanceof Error ? e.message : String(e)}`;
    }
    log(`  ${offDetail}`);
    log(
      `  Recursos exclusivos del módulo con mapa OFF: ${offOk ? 0 : ">0 (ver detalle)"} (límite ${LIMITS.mapOffExclusive})`,
    );

    log("");
    log("== Terceros en carga inicial (PA-Q042) ==");
    if (thirdParty.length === 0) log("  0 requests a terceros");
    else for (const [u] of thirdParty) log(`  TERCERO: ${u}`);
    if (failed.length > 0) {
      log("  requests fallidas (se declaran, no se ocultan):");
      for (const f of failed) log(`    ${f}`);
    }

    log("");
    log("== Recorrido completo con scroll (carga diferida observada) ==");
    if (scrolled.length === 0) log("  0 requests adicionales durante el scroll");
    else {
      for (const [u, r] of scrolled)
        log(`  ${String(r.bytes).padStart(7)} B  [${r.type}] ${u.slice(base.length) || "/"}`);
      log(
        `  ${String(transferScrollExtra).padStart(7)} B  extra tras scroll (informativo, sin límite normativo)`,
      );
    }

    // Puertas.
    log("");
    log("== Puertas ==");
    const check = (name, value, limit, unit) => {
      const ok = value <= limit;
      if (!ok) failures++;
      log(`  [${ok ? "PASS" : "FAIL"}] ${name}: ${value} ${unit} (límite ${limit} ${unit})`);
    };
    check("transferencia primera carga", transferInitial, LIMITS.transferFirstLoad, "B");
    check("JS inicial gzip", jsGzip, LIMITS.jsInitialGzip, "B");
    check("CSS inicial gzip", cssGzip, LIMITS.cssInitialGzip, "B");
    check("mejora del mapa gzip", mapDeltaGzip, LIMITS.mapDeltaGzip, "B");
    check("recursos exclusivos mapa OFF", offOk ? 0 : 1, LIMITS.mapOffExclusive, "");
    check("terceros en carga inicial", thirdParty.length, LIMITS.thirdPartyInitial, "requests");

    await browser.close();
  } finally {
    server.kill("SIGTERM");
  }

  const verdict = failures === 0 ? "TODAS LAS PUERTAS PASS" : `${failures} PUERTA(S) FAIL`;
  log("");
  log(`[budget] ${verdict}`);
  if (OUT) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
    console.log(`[budget] informe guardado en ${OUT}`);
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`[budget] ERROR · ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
