// Parser minimalista y determinista para archivos `astro.config.mjs`
// que siguen el patrón `defineConfig({ ... })`. Sólo captura lo que
// `validateStaticConfig` necesita para su contrato:
//
//   - output        (string)
//   - adapter       (presencia de cualquier valor)
//   - site          (string)
//   - trailingSlash (string|boolean)
//   - build.format  (string dentro de un objeto anidado)
//
// Si el archivo crece o requiere claves nuevas (p.ej. integrations,
// prefetch, image, vite), este parser debe sustituirse por una
// solución basada en `zod` o `astro`/`@astrojs/internal-helpers`;
// el contrato público de la función (tipo ParsedConfig + path)
// permanece igual para no romper a los tests existentes.

import { readFile } from "node:fs/promises";

export interface ParsedConfig {
  output?: unknown;
  adapter?: unknown;
  site?: unknown;
  trailingSlash?: unknown;
  build?: { format?: unknown } | undefined;
}

export async function readAstroConfig(path: string): Promise<ParsedConfig> {
  const text = await readFile(path, "utf8");
  const match = text.match(/defineConfig\(\s*\{([\s\S]*)\}\s*\)/);
  if (!match) {
    throw new Error(`No se encontró defineConfig({...}) en ${path}`);
  }
  const body = match[1] ?? "";
  const result: Record<string, unknown> = {};
  const scalarRe = /(\w+)\s*:\s*("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = scalarRe.exec(body)) !== null) {
    const key = m[1];
    const raw = m[2];
    if (!key || raw === undefined) continue;
    let value: unknown = raw;
    if (raw === "true") value = "true";
    else if (raw === "false") value = "false";
    else if (raw === "null") value = null;
    else if (/^-?\d/.test(raw)) value = raw;
    else value = raw.slice(1, -1);
    result[key] = value;
  }
  const objRe = /(\w+)\s*:\s*\{([^{}]*)\}/g;
  while ((m = objRe.exec(body)) !== null) {
    const key = m[1];
    const inner = m[2];
    if (!key || inner === undefined) continue;
    const obj: Record<string, unknown> = {};
    const innerScalarRe = /(\w+)\s*:\s*("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?)/g;
    let im: RegExpExecArray | null;
    while ((im = innerScalarRe.exec(inner)) !== null) {
      const ikey = im[1];
      const iraw = im[2];
      if (!ikey || iraw === undefined) continue;
      let ival: unknown = iraw;
      if (iraw === "true") ival = "true";
      else if (iraw === "false") ival = "false";
      else if (iraw === "null") ival = null;
      else if (/^-?\d/.test(iraw)) ival = iraw;
      else ival = iraw.slice(1, -1);
      obj[ikey] = ival;
    }
    result[key] = obj;
  }
  return result as ParsedConfig;
}
