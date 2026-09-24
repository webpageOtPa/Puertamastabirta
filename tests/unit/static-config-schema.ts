// Validador puro para la forma de astro.config de Puerta Abierta.
// Se usa desde los tests unitarios para que el contrato "salida
// estática, sin SSR, sin adaptador" sea comprobable sin necesidad
// de cargar la cadena de Astro en el runner.

export type AstroOutput = "static" | "server";

export interface AstroConfigShape {
  output?: unknown;
  adapter?: unknown;
  site?: unknown;
  trailingSlash?: unknown;
  build?: unknown;
  server?: unknown;
  devToolbar?: unknown;
}

export interface AstroConfigContract {
  output: "static";
  hasAdapter: false;
  buildFormat: "directory" | "file";
}

export interface ValidationOk {
  ok: true;
  contract: AstroConfigContract;
}

export interface ValidationErr {
  ok: false;
  reason: string;
}

export type ValidationResult = ValidationOk | ValidationErr;

/**
 * Verifica que una configuración de Astro cumple el contrato de
 * Puerta Abierta: sitio estático, sin adaptador SSR, formato de
 * build de directorio, sin server output.
 *
 * No reemplaza a `astro check` ni al build; sólo es una red de
 * seguridad rápida para los tests de Vitest.
 */
export function validateStaticConfig(config: unknown): ValidationResult {
  if (config === null || typeof config !== "object") {
    return { ok: false, reason: "La configuración no es un objeto." };
  }
  const cfg = config as AstroConfigShape;
  if (cfg.output !== "static") {
    return {
      ok: false,
      reason: `output debe ser "static"; recibido ${JSON.stringify(cfg.output)}.`,
    };
  }
  if (cfg.adapter !== undefined && cfg.adapter !== null) {
    return {
      ok: false,
      reason: "No debe declararse adaptador (SSR/Node/Cloudflare).",
    };
  }
  const build = cfg.build;
  if (build !== undefined) {
    if (build === null || typeof build !== "object") {
      return { ok: false, reason: "build debe ser un objeto cuando existe." };
    }
    const fmt = (build as { format?: unknown }).format;
    if (fmt !== undefined && fmt !== "directory" && fmt !== "file") {
      return {
        ok: false,
        reason: `build.format debe ser "directory" o "file"; recibido ${JSON.stringify(fmt)}.`,
      };
    }
  }
  return {
    ok: true,
    contract: {
      output: "static",
      hasAdapter: false,
      buildFormat: (build as { format?: "directory" | "file" } | undefined)?.format ?? "directory",
    },
  };
}
