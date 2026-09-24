import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateStaticConfig } from "./static-config-schema";
import { readAstroConfig } from "./astro-config-parser";

// Carga la configuración real sin importar Astro: la mayoría de
// astro.config.mjs en este repo sólo declaran `output: "static"`
// y un par de claves; lo leemos como texto y aplicamos un parsing
// mínimo basado en regex (tests/unit/astro-config-parser.ts) para
// mantener el test 100% determinista y sin red ni binarios nativos.
// Si el archivo crece, ese parser se sustituye por una solución más
// robusta (zod) sin tocar este test.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const ASTRO_CONFIG_PATH = resolve(REPO_ROOT, "apps/puerta-abierta/astro.config.mjs");

describe("astro.config.mjs — contrato de sitio estático", () => {
  it("existe y es legible", async () => {
    const cfg = await readAstroConfig(ASTRO_CONFIG_PATH);
    expect(typeof cfg).toBe("object");
  });

  it('declara output: "static" y no usa adaptador', async () => {
    const cfg = await readAstroConfig(ASTRO_CONFIG_PATH);
    const result = validateStaticConfig(cfg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contract.output).toBe("static");
      expect(result.contract.hasAdapter).toBe(false);
    }
  });

  it("usa build.format compatible con Astro 7 (directory o file)", async () => {
    const cfg = await readAstroConfig(ASTRO_CONFIG_PATH);
    const result = validateStaticConfig(cfg);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(["directory", "file"]).toContain(result.contract.buildFormat);
    }
  });
});
