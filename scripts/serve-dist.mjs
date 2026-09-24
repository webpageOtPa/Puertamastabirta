// Servidor estático mínimo y multiplataforma para servir la salida
// compilada de la app Astro (`apps/puerta-abierta/dist`) durante
// los tests E2E. NO es el servidor de producción ni se publica.
//
// Cumple el requisito de PA-02: los tests E2E deben ejercitarse
// contra la salida compilada, no contra `astro dev`.
//
// PA-11 — Emulación de cabeceras de seguridad y caché:
//   - CSP base de SEGURIDAD.md (`default-src 'self'` … sin
//     'unsafe-inline'/'unsafe-eval') + hashes sha256 CONCRETOS de los
//     `<script>`/`<style>` inline realmente servidos en cada HTML
//     (el inline del Header para el menú móvil; hoy un único hash
//     estable en todas las páginas). Los hashes se computan por
//     respuesta: ante un cambio del inline, la cabecera cambia con él
//     en vez de romper la página o de abrir la política.
//   - `X-Content-Type-Options: nosniff`, `Referrer-Policy` estricta y
//     `Permissions-Policy` acorde (geolocation/camera/microphone… off).
//   - Caché: HTML → `no-cache`; `/_astro/*` (nombres con content-hash)
//     → immutable largo; resto de assets → `max-age` corto con
//     revalidación; 404 → `no-store`.
//   - Métodos distintos de GET/HEAD → 405 con `Allow: GET, HEAD`
//     (PA-Q034: la emulación nunca "registra" nada con 200).
// LIMITACIÓN: el CDN real gestiona su propia caché/cabeceras; esta
// emulación NO declara control absoluto sobre el proveedor: la
// verificación final es el smoke sobre la URL de destino (PA-17+).
//
// Uso:
//   node scripts/serve-dist.mjs --port 4321 --root apps/puerta-abierta/dist
//
// Argumentos:
//   --port <n>     puerto TCP a escuchar (por defecto 4321).
//   --host <h>     interfaz (por defecto 127.0.0.1).
//   --root <p>     directorio raíz del sitio estático
//                  (por defecto apps/puerta-abierta/dist, relativo al repo).

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

function parseArgs(argv) {
  const args = { port: 4321, host: "127.0.0.1", root: "apps/puerta-abierta/dist" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--host") args.host = argv[++i];
    else if (a === "--root") args.root = argv[++i];
  }
  return args;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

// Política base objetivo de SEGURIDAD.md. Sin 'unsafe-inline' ni
// 'unsafe-eval': el único inline autorizado entra por hash concreto.
const CSP_BASE = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "connect-src 'none'",
  "img-src 'self'",
  "font-src 'self'",
].join("; ");

/** sha256 en base64 (formato que exige CSP) de un bloque inline. */
function sha256b64(text) {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

/**
 * CSP para un documento HTML: base + `script-src`/`style-src 'self'`
 * con los hashes de los bloques inline REALMENTE presentes en esa
 * respuesta. Sin inline → sin hashes (política mínima).
 */
function cspForHtml(html) {
  const scriptHashes = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    if ((m[1] ?? "").trim().length > 0) scriptHashes.push(`'sha256-${sha256b64(m[1])}'`);
  }
  const styleHashes = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    if ((m[1] ?? "").trim().length > 0) styleHashes.push(`'sha256-${sha256b64(m[1])}'`);
  }
  return (
    `${CSP_BASE}; script-src 'self'` +
    (scriptHashes.length > 0 ? ` ${scriptHashes.join(" ")}` : "") +
    `; style-src 'self'` +
    (styleHashes.length > 0 ? ` ${styleHashes.join(" ")}` : "")
  );
}

/** CSP para respuestas no-HTML (sin inline posible): base mínima. */
function cspForAsset() {
  return `${CSP_BASE}; script-src 'self'; style-src 'self'`;
}

function securityHeaders(csp) {
  return {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), " +
      "magnetometer=(), microphone=(), payment=(), usb=()",
  };
}

/**
 * Caché por tipo de recurso (PA-11 §4):
 * - HTML: `no-cache` (revalida siempre; el contenido cambia por deploy).
 * - `/_astro/*`: content-hash en el nombre → immutable largo.
 * - Resto de assets públicos (fuentes, imágenes, svg): `max-age` corto
 *   con revalidación (no tienen hash; el proveedor puede afinar).
 * - 404/errores: `no-store`.
 */
function cacheFor(pathname, ext, status) {
  if (status !== 200) return "no-store";
  if (ext === ".html" || pathname.endsWith("/index.html")) return "no-cache";
  if (pathname.startsWith("/_astro/")) return "public, max-age=31536000, immutable";
  return "public, max-age=3600, must-revalidate";
}

async function resolveFile(rootAbs, urlPath) {
  // Decodifica, quita query, normaliza y bloquea traversal fuera de root.
  const cleaned = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  let pathname = normalize(cleaned);
  if (pathname.startsWith("..") || pathname.includes("..\\")) return null;
  let abs = join(rootAbs, pathname);
  // Si es directorio, prueba index.html
  let info;
  try {
    info = await stat(abs);
  } catch {
    return null;
  }
  if (info.isDirectory()) {
    abs = join(abs, "index.html");
    try {
      await stat(abs);
    } catch {
      return null;
    }
    pathname = pathname.endsWith("/") ? pathname + "index.html" : pathname + "/index.html";
  }
  // Validación final: el archivo resuelto sigue dentro de rootAbs
  if (!resolve(abs).startsWith(resolve(rootAbs))) return null;
  return { abs, pathname };
}

function applyHeaders(res, headers) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const rootAbs = resolve(repoRoot, args.root);
  if (!existsSync(rootAbs)) {
    console.error(`[serve-dist] Raíz no encontrada: ${rootAbs}`);
    process.exit(2);
  }

  const server = createServer(async (req, res) => {
    try {
      // PA-11 §PA-Q034: emulación estática — sólo lectura.
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 405;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.setHeader("allow", "GET, HEAD");
        res.setHeader("cache-control", "no-store");
        applyHeaders(res, securityHeaders(cspForAsset()));
        res.end("405 Method Not Allowed");
        return;
      }
      const headOnly = req.method === "HEAD";
      const url = req.url ?? "/";
      const found = await resolveFile(rootAbs, url);
      if (!found) {
        // PA-10 §404: ante una ruta inexistente se sirve la página de
        // error propia (`dist/404.html`, generada desde
        // `src/pages/404.astro`) con estado 404 real — nunca un 200 tipo
        // SPA ni una redirección. Si el build no incluyó 404.html, se
        // responde 404 en texto plano.
        const notFound = join(rootAbs, "404.html");
        if (existsSync(notFound)) {
          const data = await readFile(notFound);
          res.statusCode = 404;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.setHeader("cache-control", cacheFor("/404.html", ".html", 404));
          applyHeaders(res, securityHeaders(cspForHtml(data.toString("utf8"))));
          res.end(headOnly ? "" : data);
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        applyHeaders(res, securityHeaders(cspForAsset()));
        res.end(headOnly ? "" : "404 Not Found");
        return;
      }
      const data = await readFile(found.abs);
      const ext = extname(found.abs).toLowerCase();
      const isHtml = ext === ".html";
      res.statusCode = 200;
      res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
      res.setHeader("cache-control", cacheFor(found.pathname, ext, 200));
      applyHeaders(
        res,
        securityHeaders(isHtml ? cspForHtml(data.toString("utf8")) : cspForAsset()),
      );
      res.end(headOnly ? "" : data);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      applyHeaders(res, securityHeaders(cspForAsset()));
      res.end(`500 Internal Server Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  server.listen(args.port, args.host, () => {
    console.log(`[serve-dist] http://${args.host}:${args.port} -> ${rootAbs}`);
  });

  const shutdown = () => {
    console.log("[serve-dist] cerrado");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
