#!/usr/bin/env node
// Genera cabeceras para Cloudflare Pages a partir de los HTML compilados.
// Los hashes CSP corresponden a los bloques inline reales de este build.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dist = resolve("apps/puerta-abierta/dist");

async function htmlFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

function hashes(html, tag) {
  const pattern =
    tag === "script"
      ? /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script\s*>/gi
      : /<style[^>]*>([\s\S]*?)<\/style\s*>/gi;
  return [...html.matchAll(pattern)]
    .map((match) => match[1])
    .filter((content) => content?.trim())
    .map((content) => `'sha256-${createHash("sha256").update(content).digest("base64")}'`);
}

const files = await htmlFiles(dist);
if (
  !files.some((file) => file.endsWith("/index.html")) ||
  !files.some((file) => file.endsWith("/404.html"))
) {
  throw new Error("Build incompleto: faltan index.html o 404.html");
}

const scripts = new Set();
const styles = new Set();
for (const file of files) {
  const html = await readFile(file, "utf8");
  for (const hash of hashes(html, "script")) scripts.add(hash);
  for (const hash of hashes(html, "style")) styles.add(hash);
}

const csp = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "connect-src 'none'",
  "img-src 'self'",
  "font-src 'self'",
  `script-src 'self' ${[...scripts].sort().join(" ")}`.trim(),
  `style-src 'self' ${[...styles].sort().join(" ")}`.trim(),
].join("; ");

const cspLine = `  Content-Security-Policy: ${csp}`;
if (cspLine.length > 2000) {
  throw new Error(`CSP excede el límite de línea de Cloudflare Pages (${cspLine.length}/2000)`);
}

const output = [
  "# Generado por scripts/generate-pages-headers.mjs; no editar a mano.",
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  X-Frame-Options: DENY",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  cspLine,
  "",
  "# El subdominio de Pages es una vista alternativa; indexar solo el dominio propio.",
  "https://:project.pages.dev/*",
  "  X-Robots-Tag: noindex",
  "https://:version.:project.pages.dev/*",
  "  X-Robots-Tag: noindex",
  "",
].join("\n");
await writeFile(join(dist, "_headers"), output, "utf8");
console.log(
  `[pages-headers] ${files.length} HTML, ${scripts.size} script hash(es), ${styles.size} style hash(es)`,
);
