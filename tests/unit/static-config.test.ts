import { describe, it, expect } from "vitest";
import { validateStaticConfig } from "./static-config-schema";

// PA-02 introduce el hábito de "comprobar que la puerta detecta un
// fallo introducido y, una vez retirado, vuelve a pasar". Estos
// tests trabajan con objetos en memoria (no tocan el repo) y no
// dependen de fixtures vivos en disco para evitar problemas de
// aislamiento o limpieza.

describe("validateStaticConfig — contrato positivo", () => {
  it('acepta output: "static" sin adaptador', () => {
    const r = validateStaticConfig({
      output: "static",
      site: "https://example.invalid",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.contract.output).toBe("static");
      expect(r.contract.hasAdapter).toBe(false);
      expect(r.contract.buildFormat).toBe("directory");
    }
  });

  it('acepta build.format = "file"', () => {
    const r = validateStaticConfig({
      output: "static",
      build: { format: "file" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.contract.buildFormat).toBe("file");
  });
});

describe("validateStaticConfig — puerta de fallos (negativos)", () => {
  it('rechaza output: "server" (SSR no permitido)', () => {
    const r = validateStaticConfig({ output: "server" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/output debe ser "static"/);
    }
  });

  it("rechaza la presencia de un adaptador (SSR/Node/Cloudflare)", () => {
    const r = validateStaticConfig({
      output: "static",
      adapter: { name: "@astrojs/node" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/adaptador/);
    }
  });

  it("rechaza build.format no permitido", () => {
    const r = validateStaticConfig({
      output: "static",
      build: { format: "entry" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/build\.format/);
    }
  });

  it("rechaza configuración no-objeto", () => {
    const r = validateStaticConfig("no soy config");
    expect(r.ok).toBe(false);
  });

  it("demuestra que, una vez retirado el fallo, vuelve a pasar", () => {
    // 1) Estado roto introducido a propósito.
    const broken = { output: "server" };
    const failed = validateStaticConfig(broken);
    expect(failed.ok).toBe(false);

    // 2) Se retira el fallo (output vuelve a "static").
    const fixed = { output: "static" as const };
    const passed = validateStaticConfig(fixed);
    expect(passed.ok).toBe(true);
  });
});
