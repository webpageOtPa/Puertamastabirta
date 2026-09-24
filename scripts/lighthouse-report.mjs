#!/usr/bin/env node
// lighthouse-report.mjs — Puerta Abierta (PA-13)
// ---------------------------------------------------------------------------
// Tres ejecuciones comparables de rendimiento móvil contra el servidor del
// compilado (scripts/serve-dist.mjs; NUNCA astro dev/HMR).
//
// LÍMITE DOCUMENTADO (PA-13): el binario `lighthouse` NO está disponible en
// este entorno local y la política del proyecto prohíbe red remota para
// descargarlo (`npx lighthouse` exigiría fetching del paquete) e instalar
// dependencias nuevas sin justificación. Por tanto NO se produce una
// puntuación Lighthouse (0–100) y NO se inventa ninguna: se sustituye por
// una medición equivalente reproducible con Playwright (ya devDependency):
//   - viewport 390×844, isMobile, contexto fresco (caché vacía) por ejecución
//   - throttling CPU 4x vía CDP (Emulation.setCPUThrottlingRate), análogo al
//     4x de Moto G4 que usa Lighthouse móvil
//   - red Slow-4G emulada vía CDP (Network.emulateNetworkConditions,
//     1.6 Mbps bajada / 750 kbps subida / RTT 150 ms), documentada abajo
//   - métricas: domContentLoaded, load (PerformanceTiming sobre la
//     navegación), bytes transferidos y nº de requests en carga inicial
//
// Se registran las 3 ejecuciones y la MEDIANA del tiempo de load como valor
// comparable entre commits. No son métricas de campo (LCP/INP/CLS reales
// requieren muestras de usuarios; fuera de alcance).
//
// Uso:
//   node scripts/lighthouse-report.mjs [--use-dist] [--port N] [--out-dir ruta]
// Sale exit 0 si la página carga en las 3 ejecuciones; exit 1 si alguna falla.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "apps/puerta-abierta/dist");

const args = process.argv.slice(2);
const useDist = args.includes("--use-dist");
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 4498;
const outIdx = args.indexOf("--out-dir");
const OUT_DIR = resolve(ROOT, outIdx >= 0 ? args[outIdx + 1] : "docs/implementacion/PA-13");

// Emulación documentada (Lighthouse-like, no idéntica).
const EMULATION = {
  viewport: { width: 390, height: 844 },
  cpuThrottlingRate: 4,
  network: { name: "Slow-4G(CDP)", downloadKbps: 1600, uploadKbps: 750, latencyMs: 150 },
};

function startServer(port) {
  return new Promise((resolveSrv, rejectSrv) => {
    const child = spawn(
      process.execPath,
      ["scripts/serve-dist.mjs", "--host", "127.0.0.1", "--port", String(port)],
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

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  if (!useDist) {
    console.log("[lighthouse] construyendo con pnpm build:test …");
    const r = spawnSync("pnpm", ["build:test"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) {
      console.error("[lighthouse] FAIL · build:test no terminó (exit " + r.status + ")");
      process.exit(1);
    }
  } else if (!existsSync(resolve(DIST, "index.html"))) {
    console.error("[lighthouse] FAIL · --use-dist pero dist/index.html no existe");
    process.exit(1);
  }

  // Límite honesto: ¿existe el binario local?
  let lighthouseAvailable = false;
  try {
    const probe = spawnSync("npx", ["--no-install", "lighthouse", "--version"], {
      encoding: "utf8",
      timeout: 20000,
    });
    lighthouseAvailable = probe.status === 0;
    console.log(
      `[lighthouse] binario local: ${lighthouseAvailable ? probe.stdout.trim() : "NO disponible (sin red para instalar; se usa equivalente Playwright)"}`,
    );
  } catch {
    console.log("[lighthouse] binario local: NO disponible (se usa equivalente Playwright)");
  }
  if (lighthouseAvailable) {
    // Sonda informativa: aunque el binario exista, este script no lo invoca;
    // las métricas siguen siendo del equivalente Playwright. No se cambia la
    // etiqueta a "lighthouse" para no mentir sobre el origen de los datos.
    console.log(
      "[lighthouse] AVISO: binario lighthouse presente pero NO invocado por este script; la medición sigue siendo playwright-equivalente.",
    );
  }

  const { chromium } = await import("@playwright/test");
  const server = await startServer(PORT);
  const base = `http://127.0.0.1:${PORT}`;
  const results = [];

  try {
    const browser = await chromium.launch();
    const browserVersion = browser.version();
    console.log(`[lighthouse] navegador: Chromium Playwright ${browserVersion}`);
    console.log(
      `[lighthouse] emulación: viewport 390×844 móvil · CPU ${EMULATION.cpuThrottlingRate}x · red ${EMULATION.network.name} (${EMULATION.network.downloadKbps} kbps / RTT ${EMULATION.network.latencyMs} ms) · caché vacía · ${base}/`,
    );

    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport: { ...EMULATION.viewport },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: EMULATION.cpuThrottlingRate });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: EMULATION.network.latencyMs,
        downloadThroughput: Math.floor((EMULATION.network.downloadKbps * 1024) / 8),
        uploadThroughput: Math.floor((EMULATION.network.uploadKbps * 1024) / 8),
      });

      let bytes = 0;
      let requests = 0;
      const pending = new Set();
      const detail = new Map();
      page.on("response", (resp) => {
        if (!resp.url().startsWith(base)) return;
        requests++;
        // Se rastrea la promesa: sin esto, cuerpos aún en vuelo al
        // instantanear quedarían fuera del conteo (subconteo observado).
        const job = (async () => {
          let n = 0;
          try {
            n = (await resp.body()).length;
          } catch {
            n = Number(resp.headers()["content-length"] ?? 0);
          }
          bytes += n;
          detail.set(resp.url(), n);
        })();
        pending.add(job);
        job.finally(() => pending.delete(job));
      });

      const t0 = Date.now();
      await page.goto(base + "/", { waitUntil: "load", timeout: 90000 });
      try {
        await page.waitForLoadState("networkidle", { timeout: 20000 });
      } catch {
        /* se declara */
      }
      // Settle: las fuentes con font-display:swap pueden arrancar tras el
      // aquietado de red; sin esta espera el conteo de bytes queda incompleto.
      await page.waitForTimeout(2000);
      try {
        await page.waitForLoadState("networkidle", { timeout: 20000 });
      } catch {
        /* se declara */
      }
      await Promise.allSettled([...pending]);
      if (process.env.PA_PERF_DEBUG === "1") {
        for (const [u, b] of detail.entries())
          console.log(`[lighthouse/debug] ${b} B ${u.replace(base, "")}`);
        console.log(`[lighthouse/debug] pendientes vivas: ${pending.size}`);
      }
      const wallMs = Date.now() - t0;
      const timing = await page.evaluate(() => {
        const t = performance.timing;
        const nav = t.navigationStart;
        return {
          domContentLoadedMs: t.domContentLoadedEventEnd - nav,
          loadMs: t.loadEventEnd - nav,
        };
      });
      console.log(
        `[lighthouse] ejecución ${run}/3: DCL=${timing.domContentLoadedMs} ms load=${timing.loadMs} ms muro=${wallMs} ms bytes=${bytes} requests=${requests}`,
      );
      results.push({ run, ...timing, wallMs, bytes, requests });
      await context.close();
    }
    await browser.close();
  } finally {
    server.kill("SIGTERM");
  }

  const med = {
    domContentLoadedMs: median(results.map((r) => r.domContentLoadedMs)),
    loadMs: median(results.map((r) => r.loadMs)),
    wallMs: median(results.map((r) => r.wallMs)),
    bytes: median(results.map((r) => r.bytes)),
    requests: median(results.map((r) => r.requests)),
  };
  console.log(
    `[lighthouse] MEDIANA (3 ejecuciones): DCL=${med.domContentLoadedMs} ms load=${med.loadMs} ms muro=${med.wallMs} ms bytes=${med.bytes} requests=${med.requests}`,
  );
  console.log(
    "[lighthouse] NOTA: esto NO es una puntuación Lighthouse (0–100). PA-Q044 queda PARCIAL con límite documentado: sin binario local no hay mediana ≥90 verificable; el equivalente queda guardado como comparable entre commits.",
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    // Etiqueta fija: el script NUNCA invoca el binario `lighthouse`; la sonda
    // `lighthouseAvailable` queda solo como informativa. Si algún día se
    // implementa la invocación real, cambiar aquí a "lighthouse" con la
    // evidencia de la invocación.
    herramienta: "playwright-equivalente",
    lighthouseDisponible: lighthouseAvailable,
    nota: "Sin binario lighthouse local y sin red para instalarlo: medición equivalente reproducible, no puntuación 0–100. PA-Q044 parcial.",
    navegador: "Chromium Playwright",
    viewport: EMULATION.viewport,
    cpuThrottlingRate: EMULATION.cpuThrottlingRate,
    red: EMULATION.network,
    servidor: "scripts/serve-dist.mjs sobre apps/puerta-abierta/dist (compilado, no astro dev)",
    cache: "vacía (contexto fresco por ejecución)",
    ejecuciones: results,
    mediana: med,
  };
  writeFileSync(
    resolve(OUT_DIR, "lighthouse-equivalente.json"),
    JSON.stringify(payload, null, 2) + "\n",
    "utf8",
  );
  console.log(`[lighthouse] JSON guardado en ${resolve(OUT_DIR, "lighthouse-equivalente.json")}`);
}

main().catch((e) => {
  console.error(`[lighthouse] ERROR · ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
