#!/usr/bin/env node

// Exporta la portada y la vista ampliada del mapa a un único HTML revisable.
// Requiere el build estático en apps/puerta-abierta/dist; no usa red ni paquetes.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(repoRoot, "apps/puerta-abierta/dist");
const outputPath = resolve(repoRoot, "preview-sitio-completo.html");

const mimeByExtension = {
  ".css": "text/css",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2];
}

function setAttr(tag, name, value) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(\\b${escaped}\\s*=\\s*)(["'])(.*?)\\2`, "i");
  if (pattern.test(tag)) return tag.replace(pattern, `$1"${value}"`);
  return tag.replace(/>$/, ` ${name}="${value}">`);
}

function logicalPath(url, relativeTo = "index.html") {
  const withoutQuery = url.split(/[?#]/, 1)[0];
  const decoded = decodeURIComponent(withoutQuery);
  const logical = decoded.startsWith("/")
    ? decoded.slice(1)
    : posix.normalize(posix.join(posix.dirname(relativeTo), decoded));
  const normalized = resolve(distRoot, logical);
  if (normalized !== distRoot && !normalized.startsWith(`${distRoot}${sep}`)) {
    throw new Error(`Ruta fuera del build estático: ${url}`);
  }
  return {
    logical: logical.replaceAll("\\", "/"),
    absolute: normalized,
  };
}

function dataUrl(url, relativeTo = "index.html") {
  if (/^(?:data:|https?:|mailto:|tel:|#|\/\/)/i.test(url)) return url;
  const file = logicalPath(url, relativeTo);
  const bytes = readFileSync(file.absolute);
  const mime = mimeByExtension[extname(file.logical).toLowerCase()];
  if (!mime) throw new Error(`Tipo de recurso local no esperado: ${url}`);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function inlineCssUrls(css, stylesheetUrl) {
  return css.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (whole, _quote, url) => {
    if (/^(?:data:|https?:|#|\/\/)/i.test(url)) return whole;
    return `url("${dataUrl(url, stylesheetUrl)}")`;
  });
}

function inlineStyles(html) {
  return html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel=["']stylesheet["']/i.test(tag)) return tag;
    const href = attr(tag, "href");
    if (!href || /^(?:https?:|\/\/)/i.test(href)) {
      throw new Error(`Hoja de estilos no local: ${href || tag}`);
    }
    const file = logicalPath(href);
    const css = readFileSync(file.absolute, "utf8");
    return `<style data-embedded-from="${href}">${inlineCssUrls(css, file.logical)}</style>`;
  });
}

function inlineScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (element) => {
    const src = attr(element, "src");
    if (!src) return element;
    if (/^(?:https?:|\/\/)/i.test(src)) throw new Error(`Script remoto: ${src}`);
    const source = readFileSync(logicalPath(src).absolute, "utf8");
    const opening = element.match(/^<script\b([^>]*)>/i)?.[1] || "";
    const attributes = opening
      .replace(/\s+src\s*=\s*(["']).*?\1/i, "")
      .replace(/\s+(?:defer|async)\b/gi, "");
    return `<script${attributes}>\n${source}\n</script>`;
  });
}

function inlineSrcset(value, ownerPath) {
  return value
    .split(",")
    .map((candidate) => {
      const match = candidate.trim().match(/^(\S+)(\s+.*)?$/);
      if (!match) return candidate.trim();
      return `${dataUrl(match[1], ownerPath)}${match[2] || ""}`;
    })
    .join(", ");
}

function inlineElementResources(html, ownerPath) {
  const imageTargets = new Map();
  // El adjunto usa los PNG completos una vez por imagen; el sitio publicado
  // conserva su selección WebP responsive optimizada.
  html = html.replace(/<source\b(?=[^>]*\btype=["']image\/webp["'])[^>]*>/gi, "");

  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attr(tag, "src");
    if (!src || !src.startsWith("/")) return tag;
    if (imageTargets.has(src)) return tag;
    const id = `email-preview-image-${imageTargets.size + 1}`;
    imageTargets.set(src, id);
    return setAttr(tag, "id", id);
  });

  html = html.replace(/<(?:img|source|link|video|audio|track|image|use)\b[^>]*>/gi, (tag) => {
    let updated = tag;
    for (const name of ["src", "href", "poster"]) {
      const value = attr(updated, name);
      if (value && value.startsWith("/")) {
        updated = setAttr(updated, name, dataUrl(value, ownerPath));
      }
    }
    const srcset = attr(updated, "srcset");
    if (srcset) updated = setAttr(updated, "srcset", inlineSrcset(srcset, ownerPath));
    return updated;
  });

  // Algunos enlaces abren una imagen ampliada directamente.
  html = html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = attr(tag, "href");
    const imagePath = href?.startsWith("/") ? href.split(/[?#]/, 1)[0] : "";
    if (imagePath && imageTargets.has(imagePath)) {
      let updated = setAttr(tag, "href", `#${imageTargets.get(imagePath)}`);
      updated = updated.replace(/\s+target\s*=\s*(["']).*?\1/i, "");
      return setAttr(updated, "data-email-preview-image", imageTargets.get(imagePath));
    }
    if (href && /^\/.+\.(?:png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i.test(href)) {
      return setAttr(tag, "href", dataUrl(href, ownerPath));
    }
    return tag;
  });

  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_whole, attributes, css) => {
    return `<style${attributes}>${inlineCssUrls(css, ownerPath)}</style>`;
  });
  return { html, imageTargets };
}

function rewriteLinks(html, { embeddedMap = false } = {}) {
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    let href = attr(tag, "href");
    if (
      !href ||
      href.startsWith("data:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return tag;
    }

    if (href === "/mapa-de-cobertura/") href = "#mapa-ampliado";
    else if (href === "/") href = "#main";
    else if (href.startsWith("/#")) href = href.slice(1);

    let updated = setAttr(tag, "href", href);
    if (embeddedMap && href.startsWith("#") && href !== "#main") {
      updated = setAttr(updated, "target", "_parent");
    }
    return updated;
  });
}

function loadPage(relativePath) {
  return readFileSync(resolve(distRoot, relativePath), "utf8");
}

function makeStandalonePage(relativePath, options = {}) {
  let html = loadPage(relativePath);
  // La URL canónica y og:url describen la web publicada; no corresponden
  // a una copia file:// y el enlace canonical sería una referencia externa.
  html = html.replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, "");
  html = html.replace(/<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*>/gi, "");
  html = inlineStyles(html);
  html = inlineScripts(html);
  const embedded = inlineElementResources(html, relativePath);
  return {
    html: rewriteLinks(embedded.html, options),
    imageTargets: embedded.imageTargets,
  };
}

const homePage = makeStandalonePage("index.html");
const mapPage = makeStandalonePage("mapa-de-cobertura/index.html", { embeddedMap: true });
const mapHead = mapPage.html.match(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i)?.[0];
const mapMain = mapPage.html.match(/<main\b[^>]*>[\s\S]*?<\/main\s*>/i)?.[0];
if (!mapHead || !mapMain) throw new Error("No se encontró head/main de la vista ampliada.");
const mapMainWithoutBack = mapMain.replace(
  /<a\b[^>]*class=["'][^"']*cobertura__volver[^"']*["'][^>]*>[\s\S]*?<\/a>/i,
  "",
);
const mapDocument = `<!doctype html><html lang="es">${mapHead}<body>${mapMainWithoutBack}</body></html>`;
const mapSrcdoc = mapDocument
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const expandedMap = `
<section class="section email-preview-map" id="mapa-ampliado" aria-labelledby="mapa-ampliado-title">
  <div class="container">
    <p class="eyebrow">Vista ampliada</p>
    <h2 id="mapa-ampliado-title">Mapa y lista interactivos</h2>
    <p>La vista del mapa también está incluida en este archivo. Los puntos representan ubicaciones aproximadas; no indican oficinas ni disponibilidad.</p>
    <a class="btn btn--secondary" href="#cobertura">Volver a Ubicaciones</a>
    <iframe
      class="email-preview-map__frame"
      title="Mapa ampliado con lista interactiva de ciudades"
      loading="lazy"
      sandbox="allow-scripts allow-top-navigation-by-user-activation"
      srcdoc="${mapSrcdoc}"></iframe>
  </div>
</section>`;

const embeddedCss = `
<style>
  .email-preview-map { padding-block: 3rem; background: #f4f8fc; }
  .email-preview-map__frame { display:block; width:100%; height:1250px; margin-top:1.5rem; border:1px solid #cbd7e5; border-radius:1rem; background:#fff; }
  @media (max-width: 600px) { .email-preview-map__frame { height:1600px; border-radius:.75rem; } }
</style>`;

const imageDialog = `
<style>
  .email-preview-image-dialog { width:min(96vw,1400px); max-width:96vw; max-height:95vh; padding:2.75rem 1rem 1rem; border:0; border-radius:1rem; background:#fff; }
  .email-preview-image-dialog::backdrop { background:rgba(7,32,64,.78); }
  .email-preview-image-dialog img { display:block; max-width:100%; max-height:88vh; width:auto; height:auto; margin:auto; object-fit:contain; }
  .email-preview-image-dialog button { position:absolute; top:.5rem; right:.5rem; padding:.55rem .8rem; border:0; border-radius:.5rem; background:#082f59; color:#fff; font:inherit; cursor:pointer; }
</style>
<dialog class="email-preview-image-dialog" id="email-preview-image-dialog" aria-label="Vista ampliada de la imagen">
  <button type="button" data-close-preview-image>Cerrar</button>
  <img alt="" />
</dialog>
<script>
  (() => {
    const dialog = document.getElementById("email-preview-image-dialog");
    const preview = dialog?.querySelector("img");
    if (!dialog || !preview) return;
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-email-preview-image]");
      if (!link) return;
      const image = document.getElementById(link.dataset.emailPreviewImage);
      if (!image) return;
      event.preventDefault();
      preview.src = image.currentSrc || image.src;
      preview.alt = image.alt;
      dialog.showModal();
    });
    dialog.querySelector("[data-close-preview-image]")?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  })();
</script>`;

let result = homePage.html;
const mainEnd = result.lastIndexOf("</main>");
if (mainEnd < 0) throw new Error("No se encontró <main> en la portada compilada.");
result = `${result.slice(0, mainEnd)}${embeddedCss}${expandedMap}${result.slice(mainEnd)}`;
result = result.replace("</body>", `${imageDialog}</body>`);

const externalResources = [
  ...result.matchAll(
    /<(?:script|img|source|link|video|audio|track|iframe)\b[^>]*(?:src|href)=["'](?:https?:)?\/\//gi,
  ),
];
if (externalResources.length > 0) {
  throw new Error(
    `El HTML todavía contiene ${externalResources.length} referencia(s) externa(s) de recurso.`,
  );
}
if (/\b(?:src|srcset|poster|href)=["']\/(?!\/)/i.test(result)) {
  throw new Error("El HTML todavía contiene una referencia absoluta local.");
}
if (!result.includes('id="mapa-ampliado"') || !result.includes('srcdoc="')) {
  throw new Error("La vista ampliada del mapa no quedó embebida.");
}

writeFileSync(outputPath, result, "utf8");
console.log(`HTML autocontenido generado: ${outputPath}`);
console.log(`Tamaño: ${Buffer.byteLength(result)} B`);
