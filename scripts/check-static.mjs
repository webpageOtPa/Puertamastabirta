#!/usr/bin/env node
// check-static.mjs — Scanner negativo de arquitectura estática (PA-11)
// ---------------------------------------------------------------------------
// Verifica que Puerta Abierta NO contiene ni despliega backend: sin
// dependencias de servidor/DB/captación, sin config SSR, sin captación en
// fuentes publicables, sin secretos ni código servidor en dist.
//
// Capas (ver 06_CALIDAD/AUSENCIA_DE_BACKEND.md):
//   L1 dependencias directas · L2 config Astro + rutas · L3 config hosting
//   L4 fuentes publicables (src/ + public/) · L5 dist
// Más guarda de cobertura mínima: fallar si no se escaneó nada.
//
// Reglas declarativas cuando es razonable; cadenas ambiguas → hallazgo con
// archivo:línea para revisión manual. Los comentarios se ignoran
// (documentación y menciones negativas no son código desplegado — PA-Q063),
// pero SÓLO comentarios: el código real siempre se revisa.
//
// Alcance del escaneo: únicamente `src/`, `public/` y `dist/` bajo el dir
// de la app. NUNCA se escanean `node_modules`, la documentación histórica
// (`00_*`-`10_*`), `tests/.tmp` ni releases: no son código desplegado.
//
// Uso:
//   node scripts/check-static.mjs [--root DIR] [--app DIR] [--dist DIR]
// Salida: 0 sin hallazgos · 1 con hallazgos · 2 error de uso/entorno.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { exit, cwd, argv } from "node:process";

// ---------------------------------------------------------------------------
// L1 — Dependencias directas prohibidas (nombre exacto o familia).
// ---------------------------------------------------------------------------

/** @type {Array<{ match: string | RegExp, family: string, reason: string }>} */
export const DENY_DEPENDENCIES = [
  // Adaptadores SSR / frameworks de servidor.
  { match: "@astrojs/node", family: "ssr-adapter", reason: "adaptador SSR Node" },
  { match: "@astrojs/cloudflare", family: "ssr-adapter", reason: "adaptador SSR Cloudflare" },
  { match: "@astrojs/vercel", family: "ssr-adapter", reason: "adaptador SSR Vercel" },
  { match: "@astrojs/netlify", family: "ssr-adapter", reason: "adaptador SSR Netlify" },
  { match: "@astrojs/deno", family: "ssr-adapter", reason: "adaptador SSR Deno" },
  { match: "express", family: "server-framework", reason: "framework de servidor" },
  { match: "fastify", family: "server-framework", reason: "framework de servidor" },
  { match: "hono", family: "server-framework", reason: "framework de servidor" },
  { match: "next", family: "server-framework", reason: "framework de servidor" },
  // ORM / clientes de base de datos.
  { match: "prisma", family: "db", reason: "ORM de base de datos" },
  { match: "@prisma/client", family: "db", reason: "cliente de base de datos" },
  { match: "drizzle-orm", family: "db", reason: "ORM de base de datos" },
  { match: "drizzle-kit", family: "db", reason: "herramienta de base de datos" },
  { match: "kysely", family: "db", reason: "cliente de base de datos" },
  { match: "typeorm", family: "db", reason: "ORM de base de datos" },
  { match: "sequelize", family: "db", reason: "ORM de base de datos" },
  { match: "mongoose", family: "db", reason: "cliente de base de datos" },
  { match: "mongodb", family: "db", reason: "cliente de base de datos" },
  { match: "pg", family: "db", reason: "cliente de base de datos" },
  { match: "mysql2", family: "db", reason: "cliente de base de datos" },
  { match: "better-sqlite3", family: "db", reason: "cliente de base de datos" },
  { match: "sqlite3", family: "db", reason: "cliente de base de datos" },
  { match: "@supabase/supabase-js", family: "db", reason: "cliente de base de datos" },
  { match: "@neondatabase/serverless", family: "db", reason: "cliente de base de datos" },
  { match: "@planetscale/database", family: "db", reason: "cliente de base de datos" },
  { match: "@libsql/client", family: "db", reason: "cliente de base de datos" },
  { match: "redis", family: "db", reason: "cliente de base de datos" },
  { match: "ioredis", family: "db", reason: "cliente de base de datos" },
  // Correo / CRM (recepción o exfiltración de visitantes).
  { match: "nodemailer", family: "email", reason: "envío de correo" },
  { match: "resend", family: "email", reason: "envío de correo" },
  { match: "@sendgrid/mail", family: "email", reason: "envío de correo" },
  { match: "mailgun.js", family: "email", reason: "envío de correo" },
  { match: "postmark", family: "email", reason: "envío de correo" },
  { match: "hubspot", family: "crm", reason: "CRM con captación" },
  { match: "salesforce", family: "crm", reason: "CRM con captación" },
  { match: "jsforce", family: "crm", reason: "CRM con captación" },
  { match: "pipedrive", family: "crm", reason: "CRM con captación" },
  // Familias por patrón (cualquier variante del SDK).
  { match: /captcha/i, family: "captcha", reason: "CAPTCHA no permitido" },
  { match: /turnstile/i, family: "captcha", reason: "CAPTCHA no permitido" },
  { match: /altcha/i, family: "captcha", reason: "CAPTCHA no permitido" },
];

// ---------------------------------------------------------------------------
// L4/L5 — Patrones prohibidos en fuentes publicables y en dist.
// `<select>` NO se incluye: Cobertura.astro lo usa como mejora progresiva
// local sin envío (PA-08). `<script>` tampoco: el inline del Header y el
// tag diferido de Cobertura son locales y se revisan por contenido.
// ---------------------------------------------------------------------------

// Eventos DOM cubiertos por las reglas de manejadores inline y por propiedad.
const HANDLER_EVENTS =
  "click|dblclick|contextmenu|load|error|submit|change|input|keydown|keyup|keypress|" +
  "toggle|focus|blur|mouse[a-z]*|touch[a-z]*|pointer[a-z]*|wheel|scroll|resize|select";

/** @type {Array<{ id: string, family: string, re: RegExp, detail: string }>} */
export const SOURCE_PATTERNS = [
  { id: "form-tag", family: "captacion", re: /<form(?=[\s>])/i, detail: "etiqueta <form>" },
  { id: "input-tag", family: "captacion", re: /<input(?=[\s>])/i, detail: "etiqueta <input>" },
  {
    id: "textarea-tag",
    family: "captacion",
    re: /<textarea(?=[\s>])/i,
    detail: "etiqueta <textarea>",
  },
  {
    id: "submit-type",
    family: "captacion",
    re: /type\s*=\s*["']submit["']/i,
    detail: 'type="submit"',
  },
  { id: "fetch-call", family: "red", re: /\bfetch\s*\(/, detail: "llamada fetch(" },
  { id: "xhr", family: "red", re: /\bXMLHttpRequest\b/, detail: "XMLHttpRequest" },
  { id: "beacon", family: "red", re: /\bsendBeacon\s*\(/, detail: "sendBeacon(" },
  { id: "websocket", family: "red", re: /\bWebSocket\b/, detail: "WebSocket" },
  { id: "worker", family: "red", re: /\bnew\s+Worker\s*\(/, detail: "new Worker(" },
  { id: "local-storage", family: "storage", re: /\blocalStorage\b/, detail: "localStorage" },
  { id: "session-storage", family: "storage", re: /\bsessionStorage\b/, detail: "sessionStorage" },
  { id: "indexed-db", family: "storage", re: /\bindexedDB\b/, detail: "indexedDB" },
  { id: "service-worker", family: "storage", re: /\bserviceWorker\b/, detail: "serviceWorker" },
  { id: "geolocation", family: "storage", re: /\bgeolocation\b/, detail: "geolocation" },
  {
    id: "cookie",
    family: "storage",
    re: /\bdocument\s*\.\s*cookie\b/,
    detail: "document.cookie",
  },
  { id: "js-url", family: "xss", re: /javascript\s*:/i, detail: "URL javascript:" },
  {
    id: "inline-handler",
    family: "xss",
    re: new RegExp(`\\son(?:${HANDLER_EVENTS})\\s*=`, "i"),
    detail: "atributo on* inline",
  },
  {
    id: "dom-handler-prop",
    family: "xss",
    re: new RegExp(`\\.\\s*on(?:${HANDLER_EVENTS})\\s*=`),
    detail: "propiedad DOM on*",
  },
  {
    id: "oterco-import",
    family: "independencia",
    re: /\boterco\b/i,
    detail: "referencia a OTERCO en código publicable (PA-Q003)",
  },
];

// ---------------------------------------------------------------------------
// L5 — Nombres privados que nunca deben estar en dist.
// ---------------------------------------------------------------------------

/** @type {Array<{ re: RegExp, detail: string }>} */
export const DIST_PRIVATE_NAMES = [
  { re: /(^|[./])\.env($|\.)/i, detail: "archivo .env" },
  { re: /\.env\./i, detail: "variante .env" },
  { re: /\.sql$/i, detail: "volcado SQL" },
  { re: /\.pem$/i, detail: "certificado/clave" },
  { re: /\.key$/i, detail: "clave privada" },
  { re: /\.crt$/i, detail: "certificado" },
  { re: /\.pfx$/i, detail: "certificado" },
  { re: /\.map$/i, detail: "sourcemap público" },
  { re: /sourceMappingURL/i, detail: "referencia a sourcemap (contenido)" },
  { re: /\.md$/i, detail: "documentación filtrada a dist" },
  { re: /(^|\/)(00|01|02|03|04|05|06|07|08|09|10)_/, detail: "documentación histórica" },
  { re: /fixture/i, detail: "fixture en salida publicable" },
  { re: /\.private\./i, detail: "referencia privada" },
  { re: /(^|\/)\.opencode(\/|$)/i, detail: "configuración de agentes" },
];

// URLs externas toleradas en dist (namespaces XML: nunca son red real).
// `https://wa.me/` se permite SÓLO como ancla visible a canal aprobado
// (PA-09, sin SDK ni envío); hoy dist/technical no la contiene.
export const DIST_EXTERNAL_ALLOWLIST = [
  "http://www.sitemaps.org/schemas/sitemap/0.9",
  "http://www.w3.org/2000/svg",
  "https://wa.me/",
];

// L3 — Claves de primer nivel permitidas en wrangler.jsonc (DESPLIEGUE.md).
export const WRANGLER_ALLOWED_KEYS = ["name", "compatibility_date", "assets"];

// L3 — Subclaves permitidas dentro de `assets` (sólo entrega estática).
// `directory` local + ajustes de enrutado estático (`not_found_handling`,
// `html_handling`). Todo lo demás (`run_worker_first`, `binding`, …)
// convierte el worker en handler con código y está prohibido.
export const WRANGLER_ASSETS_ALLOWED_KEYS = ["directory", "not_found_handling", "html_handling"];

// Extensiones de texto revisadas por contenido en src/public/dist.
const TEXT_EXTS = new Set([
  ".astro",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".svg",
  ".xml",
  ".txt",
  ".json",
]);

/**
 * @typedef {{ layer: string, rule: string, file: string, line: number, detail: string }} Finding
 */

/**
 * Parsea JSONC (wrangler): ignora comentarios de línea y de bloque
 * y comas finales, sin tocar el contenido de las cadenas. Sin dependencias.
 * @param {string} text
 */
export function parseJsonc(text) {
  let out = "";
  let i = 0;
  let inStr = null;
  const push = (s) => {
    out += s;
  };
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      push(c);
      if (c === "\\") {
        push(text[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      push(c);
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        push(text[i] === "\n" ? "\n" : " ");
        i++;
      }
      i += 2;
      continue;
    }
    if (c === ",") {
      // Coma final: mirar adelante (sin comentarios) por `}` o `]`.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") {
        i++;
        continue;
      }
      push(c);
      i++;
      continue;
    }
    push(c);
    i++;
  }
  return JSON.parse(out);
}

/**
 * Borra comentarios preservando posiciones (el contenido se sustituye por
 * espacios; los saltos de línea se conservan) para que archivo:línea del
 * hallazgo apunte al código real. Limitación documentada: `//` dentro de
 * un template literal multilínea con comillas desequilibradas en la misma
 * línea se trata como comentario; ante duda el hallazgo pide revisión
 * manual en vez de silenciarse.
 * @param {string} text
 * @returns {string}
 */
export function stripComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  let out = text.replace(/<!--[\s\S]*?-->/g, blank);
  out = out.replace(/\/\*[\s\S]*?\*\//g, blank);
  out = out
    .split("\n")
    .map((line) => {
      let inS = null;
      for (let i = 0; i < line.length - 1; i++) {
        const c = line[i];
        if (inS) {
          if (c === "\\") {
            i++;
            continue;
          }
          if (c === inS) inS = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") {
          inS = c;
          continue;
        }
        if (c === "/" && line[i + 1] === "/") {
          // Comentario de línea fuera de cadena: se conserva el código
          // previo (puede contener patrones reales) y se borra el resto.
          return line.slice(0, i) + line.slice(i).replace(/./g, " ");
        }
      }
      return line;
    })
    .join("\n");
  return out;
}

/**
 * Revisa un texto ya sin comentarios contra SOURCE_PATTERNS.
 * @param {string} relPath ruta para el informe
 * @param {string} text contenido sin comentarios
 * @param {string} layer capa del informe
 * @returns {Finding[]}
 */
export function scanText(relPath, text, layer) {
  const findings = [];
  const lines = text.split("\n");
  for (const p of SOURCE_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : p.re.flags + "g");
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      if (re.test(lines[i] ?? "")) {
        findings.push({ layer, rule: p.id, file: relPath, line: i + 1, detail: p.detail });
      }
    }
  }
  return findings;
}

/** Recorre un árbol devolviendo rutas absolutas (sin seguir enlaces). * @param {string} dir */
export function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs, { throwIfNoEntry: false });
    if (!st || st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(...walk(abs));
    else if (st.isFile()) out.push(abs);
  }
  return out;
}

function extOf(path) {
  const i = path.lastIndexOf(".");
  return i < 0 ? "" : path.slice(i).toLowerCase();
}

/**
 * Escanea dependencias directas de un package.json ya parseado.
 * @param {Record<string, unknown>} manifest
 * @param {string} manifestPath ruta para el informe
 * @returns {{ findings: Finding[], checked: number }}
 */
export function scanDependencies(manifest, manifestPath) {
  const findings = [];
  const groups = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  const names = new Set();
  for (const g of groups) {
    const section = manifest[g];
    if (section && typeof section === "object") {
      for (const name of Object.keys(section)) names.add(name);
    }
  }
  for (const name of names) {
    for (const deny of DENY_DEPENDENCIES) {
      const hit = typeof deny.match === "string" ? name === deny.match : deny.match.test(name);
      if (hit) {
        findings.push({
          layer: "dependencias",
          rule: `dep:${deny.family}`,
          file: manifestPath,
          line: 0,
          detail: `"${name}": ${deny.reason}`,
        });
      }
    }
  }
  return { findings, checked: names.size };
}

/**
 * Revisa el texto de astro.config.mjs (AST/imports cuando es razonable;
 * aquí reglas exactas sobre el texto + existencia de rutas prohibidas).
 * @param {string} configText
 * @param {string} configPath ruta para el informe
 * @param {string} srcDir dir src para buscar middleware/actions/api
 * @returns {{ findings: Finding[], checked: number }}
 */
export function scanAstroConfig(configText, configPath, srcDir) {
  const findings = [];
  let checked = 0;
  const fail = (rule, line, detail) =>
    findings.push({ layer: "config-astro", rule, file: configPath, line, detail });

  checked++;
  if (!/output\s*:\s*["']static["']/.test(configText)) {
    fail("output-static", 0, "falta output: 'static'");
  }
  const lineOf = (re) => {
    const lines = configText.split("\n");
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i] ?? "")) return i + 1;
    return 0;
  };
  if (/\boutput\s*:\s*["'](server|hybrid)["']/.test(configText)) {
    fail("output-server", lineOf(/output\s*:/), "output server/hybrid: SSR no permitido");
  }
  if (
    /prerender\s*:\s*false/.test(configText) ||
    /export\s+const\s+prerender\s*=\s*false/.test(configText)
  ) {
    fail("prerender-false", lineOf(/prerender/), "prerender: false no permitido");
  }
  if (/@astrojs\/(node|cloudflare|vercel|netlify|deno)/.test(configText)) {
    fail("adapter-import", lineOf(/@astrojs\//), "import de adaptador SSR en config");
  }
  if (/\badapter\s*\(/.test(configText)) {
    fail("adapter-call", lineOf(/adapter\s*\(/), "llamada a adaptador en config");
  }
  // Rutas con runtime: middleware, actions, pages/api.
  checked += 3;
  const bannedPaths = [
    join(srcDir, "middleware.ts"),
    join(srcDir, "middleware.js"),
    join(srcDir, "middleware.mjs"),
  ];
  for (const p of bannedPaths) {
    if (existsSync(p)) {
      fail("middleware", 0, `middleware runtime: ${relative(process.cwd(), p)}`);
    }
  }
  for (const sub of ["actions", join("pages", "api")]) {
    if (existsSync(join(srcDir, sub))) {
      fail("runtime-dir", 0, `directorio runtime: src/${sub.replace(/\\/g, "/")}`);
    }
  }
  // Imports runtime en cualquier fuente.
  checked++;
  for (const abs of walk(srcDir)) {
    if (!TEXT_EXTS.has(extOf(abs))) continue;
    const raw = readFileSync(abs, "utf8");
    const code = stripComments(raw);
    if (/from\s+["']astro:(actions|middleware)["']/.test(code)) {
      const lines = code.split("\n");
      let line = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/from\s+["']astro:(actions|middleware)["']/.test(lines[i] ?? "")) {
          line = i + 1;
          break;
        }
      }
      findings.push({
        layer: "config-astro",
        rule: "runtime-import",
        file: relative(process.cwd(), abs),
        line,
        detail: "import de astro:actions/astro:middleware",
      });
    }
    if (/export\s+const\s+prerender\s*=\s*false/.test(code)) {
      findings.push({
        layer: "config-astro",
        rule: "prerender-false",
        file: relative(process.cwd(), abs),
        line: 0,
        detail: "export const prerender = false",
      });
    }
  }
  return { findings, checked };
}

/**
 * Revisa wrangler.jsonc/.json/.toml: esquema permitido
 * name/compatibility_date/assets; sin main, bindings ni run_worker_first.
 * @param {string} appDir
 * @returns {{ findings: Finding[], checked: number }}
 */
export function scanHostingConfig(appDir) {
  const findings = [];
  const candidates = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]
    .map((n) => join(appDir, n))
    .filter((p) => existsSync(p));
  if (candidates.length === 0) {
    findings.push({
      layer: "config-hosting",
      rule: "missing-config",
      file: relative(process.cwd(), appDir) || ".",
      line: 0,
      detail: "sin wrangler.jsonc: el esquema de emulación debe estar versionado (DESPLIEGUE.md)",
    });
    return { findings, checked: 1 };
  }
  const fail = (rule, file, line, detail) =>
    findings.push({ layer: "config-hosting", rule, file, line, detail });
  for (const abs of candidates) {
    const rel = relative(process.cwd(), abs);
    const raw = readFileSync(abs, "utf8");
    if (abs.endsWith(".toml")) {
      // TOML: revisión ingenua por claves de primer nivel (sin parser).
      const deny = [
        "main",
        "run_worker_first",
        "[vars]",
        "[d1]",
        "[kv_namespaces]",
        "[r2_buckets]",
        "[durable_objects]",
        "binding",
        "[triggers]",
        "[routes]",
      ];
      raw.split("\n").forEach((line, i) => {
        const t = line.trim().toLowerCase();
        for (const d of deny) {
          if (t === d || t.startsWith(d + " ") || t.startsWith(d + "=")) {
            fail("hosting-key", rel, i + 1, `clave prohibida en toml: ${d}`);
          }
        }
      });
      continue;
    }
    let obj;
    try {
      obj = parseJsonc(raw);
    } catch {
      fail("hosting-parse", rel, 0, "wrangler JSON no parseable");
      continue;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      fail("hosting-parse", rel, 0, "wrangler JSON no es objeto");
      continue;
    }
    for (const key of Object.keys(obj)) {
      if (!WRANGLER_ALLOWED_KEYS.includes(key)) {
        fail(
          "hosting-key",
          rel,
          0,
          `clave no permitida: "${key}" (sólo name/compatibility_date/assets)`,
        );
      }
    }
    const assets = obj["assets"];
    if (assets !== undefined) {
      if (!assets || typeof assets !== "object" || Array.isArray(assets)) {
        fail("hosting-assets", rel, 0, "assets debe ser objeto");
      } else {
        if (typeof assets["directory"] !== "string" || assets["directory"].length === 0) {
          fail("hosting-assets", rel, 0, "assets.directory debe ser ruta local");
        }
        for (const sub of Object.keys(assets)) {
          if (WRANGLER_ASSETS_ALLOWED_KEYS.includes(sub)) continue;
          if (sub === "run_worker_first") {
            fail(
              "hosting-key",
              rel,
              0,
              "assets.run_worker_first ejecuta el worker antes de los assets: prohibido",
            );
          } else if (sub === "binding") {
            fail("hosting-key", rel, 0, "assets.binding convierte el worker en handler: prohibido");
          } else {
            fail(
              "hosting-key",
              rel,
              0,
              `clave no permitida en assets: "${sub}" (sólo ${WRANGLER_ASSETS_ALLOWED_KEYS.join("/")})`,
            );
          }
        }
      }
    }
  }
  return { findings, checked: candidates.length + 1 };
}

/**
 * Escanea fuentes publicables (src/ + public/).
 * @param {string} appDir
 * @returns {{ findings: Finding[], checked: number }}
 */
export function scanSources(appDir) {
  const findings = [];
  let checked = 0;
  for (const sub of ["src", "public"]) {
    for (const abs of walk(join(appDir, sub))) {
      if (!TEXT_EXTS.has(extOf(abs))) continue;
      checked++;
      const rel = relative(process.cwd(), abs);
      findings.push(...scanText(rel, stripComments(readFileSync(abs, "utf8")), "fuentes"));
    }
  }
  return { findings, checked };
}

/**
 * Escanea dist: nombres privados + contenido + URLs externas no permitidas.
 * @param {string} distDir
 * @returns {{ findings: Finding[], checked: number }}
 */
export function scanDist(distDir) {
  const findings = [];
  let checked = 0;
  if (!existsSync(distDir)) {
    findings.push({
      layer: "dist",
      rule: "missing-dist",
      file: relative(process.cwd(), distDir) || ".",
      line: 0,
      detail: "dist inexistente: construir antes de escanear la salida",
    });
    // Nada examinado: no cuenta para la cobertura (activa empty-scan).
    return { findings, checked: 0 };
  }
  for (const abs of walk(distDir)) {
    const rel = relative(process.cwd(), abs);
    const base = basename(abs);
    for (const priv of DIST_PRIVATE_NAMES) {
      // Las reglas "(contenido)" se revisan sobre el texto, no el nombre.
      if (priv.detail.includes("(contenido)")) continue;
      if (priv.re.test(base) || priv.re.test(rel)) {
        findings.push({
          layer: "dist",
          rule: "private-file",
          file: rel,
          line: 0,
          detail: priv.detail,
        });
        break;
      }
    }
    if (!TEXT_EXTS.has(extOf(abs))) continue;
    checked++;
    const raw = readFileSync(abs, "utf8");
    const code = stripComments(raw);
    findings.push(...scanText(rel, code, "dist"));
    if (/sourceMappingURL/.test(raw)) {
      findings.push({
        layer: "dist",
        rule: "private-file",
        file: rel,
        line: 0,
        detail: "referencia a sourcemap (contenido)",
      });
    }
    const urls = new Set();
    for (const m of raw.matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)) {
      urls.add(m[0].replace(/[),;.'"]+$/, ""));
    }
    for (const url of urls) {
      if (!DIST_EXTERNAL_ALLOWLIST.some((a) => url.startsWith(a))) {
        findings.push({
          layer: "dist",
          rule: "external-url",
          file: rel,
          line: 0,
          detail: `URL externa no permitida en salida: ${url}`,
        });
      }
    }
  }
  return { findings, checked };
}

/**
 * Escaneo completo del árbol.
 * @param {{ root?: string, appDir?: string, distDir?: string }} opts
 */
export function scanStatic(opts = {}) {
  const root = resolve(opts.root ?? cwd());
  const appDir = resolve(opts.appDir ?? join(root, "apps", "puerta-abierta"));
  const distDir = resolve(opts.distDir ?? join(appDir, "dist"));
  const t0 = Date.now();

  const findings = [];
  const stats = { filesScanned: 0, layers: {} };

  // L1 — dependencias.
  const manifestPath = join(appDir, "package.json");
  if (!existsSync(manifestPath)) {
    findings.push({
      layer: "dependencias",
      rule: "missing-manifest",
      file: relative(root, manifestPath),
      line: 0,
      detail: "package.json de la app inexistente",
    });
    stats.layers["dependencias"] = 0;
  } else {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      findings.push({
        layer: "dependencias",
        rule: "manifest-parse",
        file: relative(root, manifestPath),
        line: 0,
        detail: "package.json no parseable",
      });
      manifest = null;
    }
    if (manifest) {
      const r = scanDependencies(manifest, relative(root, manifestPath));
      findings.push(...r.findings);
      stats.layers["dependencias"] = r.checked;
    }
  }

  // L2 — config Astro.
  const configPath = join(appDir, "astro.config.mjs");
  if (!existsSync(configPath)) {
    findings.push({
      layer: "config-astro",
      rule: "missing-config",
      file: relative(root, configPath),
      line: 0,
      detail: "astro.config.mjs inexistente",
    });
    stats.layers["config-astro"] = 0;
  } else {
    const r = scanAstroConfig(
      readFileSync(configPath, "utf8"),
      relative(root, configPath),
      join(appDir, "src"),
    );
    findings.push(...r.findings);
    stats.layers["config-astro"] = r.checked;
  }

  // L3 — hosting.
  const h = scanHostingConfig(appDir);
  findings.push(...h.findings);
  stats.layers["config-hosting"] = h.checked;

  // L4 — fuentes.
  const s = scanSources(appDir);
  findings.push(...s.findings);
  stats.layers["fuentes"] = s.checked;

  // L5 — dist.
  const d = scanDist(distDir);
  findings.push(...d.findings);
  stats.layers["dist"] = d.checked;

  stats.filesScanned = (stats.layers["fuentes"] ?? 0) + (stats.layers["dist"] ?? 0);
  stats.ms = Date.now() - t0;

  // Guarda de cobertura mínima: nunca "OK" vacío.
  if (stats.filesScanned === 0) {
    findings.push({
      layer: "cobertura",
      rule: "empty-scan",
      file: relative(root, appDir) || ".",
      line: 0,
      detail: `escaneo vacío (0 archivos revisados en src/public/dist): el OK sin cobertura no vale`,
    });
  }

  return { ok: findings.length === 0, findings, stats, root, appDir, distDir };
}

/** Imprime el informe por capa. * @param {{ ok: boolean, findings: Finding[], stats: Record<string, unknown> }} report */
export function printReport(report) {
  const layers = ["dependencias", "config-astro", "config-hosting", "fuentes", "dist"];
  console.log("[check-static] Informe de ausencia de backend por capa");
  for (const layer of layers) {
    const items = report.findings.filter((f) => f.layer === layer);
    const n = layer === "fuentes" || layer === "dist" ? report.stats["layers"]?.[layer] : null;
    if (items.length === 0) {
      console.log(
        `[check-static] CAPA ${layer}: OK${typeof n === "number" ? ` (${n} archivos revisados)` : ""}`,
      );
    } else {
      console.log(`[check-static] CAPA ${layer}: ${items.length} HALLAZGO(S)`);
      for (const f of items) {
        const where = f.line > 0 ? `${f.file}:${f.line}` : f.file;
        console.log(`[check-static]   HALLAZGO [${f.rule}] ${where} — ${f.detail}`);
      }
    }
  }
  const cov = report.findings.filter((f) => f.layer === "cobertura");
  for (const f of cov) {
    console.log(`[check-static]   HALLAZGO [${f.rule}] ${f.file} — ${f.detail}`);
  }
  const files = report.stats["filesScanned"];
  const ms = report.stats["ms"];
  if (report.ok) {
    console.log(
      `[check-static] OK · 0 hallazgos · ${files} archivos revisados · ${ms}ms · ` +
        `excluidos: node_modules, 00_*-10_*, tests/.tmp, releases (no son código desplegado)`,
    );
  } else {
    console.log(
      `[check-static] FALLO · ${report.findings.length} hallazgo(s) · ` +
        `${files} archivos revisados · ${ms}ms`,
    );
  }
}

function parseArgs(argvList) {
  const args = {};
  for (let i = 0; i < argvList.length; i++) {
    const a = argvList[i];
    if (a === "--root") args.root = argvList[++i];
    else if (a === "--app") args.appDir = argvList[++i];
    else if (a === "--dist") args.distDir = argvList[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      console.error(`[check-static] argumento desconocido: ${a}`);
      exit(2);
    }
  }
  return args;
}

const invokedDirectly =
  typeof process !== "undefined" &&
  argv[1] !== undefined &&
  (argv[1].endsWith("check-static.mjs") || argv[1].endsWith("check-static"));

if (invokedDirectly) {
  const args = parseArgs(argv.slice(2));
  if (args.help) {
    console.log("Uso: node scripts/check-static.mjs [--root DIR] [--app DIR] [--dist DIR]");
    exit(0);
  }
  if (!args.root && !existsSync(resolve(cwd(), "apps", "puerta-abierta"))) {
    console.error("[check-static] ERROR · no se encontró apps/puerta-abierta desde el cwd actual");
    exit(2);
  }
  const report = scanStatic(args);
  printReport(report);
  exit(report.ok ? 0 : 1);
}
