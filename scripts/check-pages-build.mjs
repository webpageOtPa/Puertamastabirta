#!/usr/bin/env node
// Comprobación del artefacto comercial que se entrega a Cloudflare Pages.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve("apps/puerta-abierta/dist");
const read = (path) => readFileSync(resolve(dist, path), "utf8");
const home = read("index.html");
const map = read("mapa-de-cobertura/index.html");
const notFound = read("404.html");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const headers = read("_headers");
const canonical = "https://puertamasabierta.com.co";

assert.match(home, new RegExp(`<link rel="canonical" href="${canonical}"`));
assert.match(map, new RegExp(`<link rel="canonical" href="${canonical}/mapa-de-cobertura/"`));
assert.match(notFound, /<meta name="robots" content="noindex"/);
for (const html of [home, map, notFound]) {
  assert.doesNotMatch(html, /Vista previa técnica|No habilitada para publicación|example\.invalid/);
}
for (const html of [home, map]) assert.doesNotMatch(html, /<meta name="robots" content="noindex"/);
assert.match(home, /mailto:contacto@puertamasabierta\.com\.co/);
assert.doesNotMatch(home, /href="(?:tel:|https:\/\/wa\.me\/)/);
assert.doesNotMatch(home, /Ilustración geométrica provisional|Canal no disponible/);
assert.match(robots, new RegExp(`Sitemap: ${canonical}/sitemap.xml`));
assert.match(sitemap, new RegExp(`<loc>${canonical}/</loc>`));
assert.match(sitemap, new RegExp(`<loc>${canonical}/mapa-de-cobertura/</loc>`));
assert.match(headers, /Content-Security-Policy: default-src 'self'/);
assert.match(headers, /X-Content-Type-Options: nosniff/);
assert.match(headers, /https:\/\/:project\.pages\.dev\/\*/);

for (const html of [home, map, notFound]) {
  for (const match of html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    if (!match[1]?.trim()) continue;
    const hash = createHash("sha256").update(match[1]).digest("base64");
    assert.ok(headers.includes(`'sha256-${hash}'`), "Falta hash CSP de un script inline");
  }
}

console.log("[check-pages-build] PASS · 3 HTML, SEO, contacto, robots, sitemap y CSP");
