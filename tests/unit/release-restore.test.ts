import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// PA-15 — Restauración local (PA-Q053): la CLI REAL
// (`scripts/release-restore.mjs`) copia los bytes exactos de un candidato
// al destino local, verifica hashes del manifiesto y repite el smoke.
// ---------------------------------------------------------------------
// Estrategia: candidatos de prueba construidos en
// `tests/.tmp/release-restore/<caso>/` — nunca en `releases/` ni en
// `apps/puerta-abierta/dist` — con destino `--root` también temporal.
// Casos: restauración íntegra (hashes + archivos), destino con smoke,
// candidato inexistente, manifiesto ausente, candidato alterado
// (hash mismatch → rechazo), --root peligroso (raíz → exit 2 sin borrar).
// Los fixtures se borran en `afterAll`;
// `tests/.tmp/` está gitignored.

const REPO = process.cwd();
const TMP = resolve(REPO, "tests/.tmp/release-restore");
const RESTORE = resolve(REPO, "scripts/release-restore.mjs");

const SITE_FILES: Record<string, string> = {
  "index.html": "<html><head><title>PA</title></head><body><p>hola</p></body></html>\n",
  "404.html": "<html><head><title>404</title></head><body><p>no</p></body></html>\n",
  "estilos.css": "p { color: #1a1a1a; }\n",
};

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const DESTINO = "puerta-abierta-preview";

function shaHex(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

function writeCandidate(dir: string, siteExtra: Record<string, string> = {}): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "site"), { recursive: true });
  mkdirSync(join(dir, "evidencia"), { recursive: true });
  const files = { ...SITE_FILES, ...siteExtra };
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(join(dir, "site", rel), content, "utf8");
  }
  const assets = Object.keys(files).map((ruta) => ({
    ruta,
    sha256: shaHex(readFileSync(join(dir, "site", ruta))),
    bytes: readFileSync(join(dir, "site", ruta)).length,
  }));
  const manifest = {
    formato: "puerta-abierta-release/1",
    id: "pa-test-restore",
    sitio: "puerta-abierta",
    proposito: "comercial",
    perfil: "commercial",
    commit: COMMIT,
    commitLimpio: true,
    destino: DESTINO,
    lockfile: { archivo: "pnpm-lock.yaml", sha256: "1".repeat(64) },
    versiones: { node: "v26.8.2", pnpm: "11.26.0", astro: "7.3.3" },
    wrangler: "wrangler.jsonc",
    cabeceras: "scripts/serve-dist.mjs",
    canonical: "apps/puerta-abierta/src/config/site.ts",
    politicaDestino: "deploy/destinos.json",
    assets,
    evidencia: ["evidencia/nota.txt"],
    creado: "2026-09-18T00:00:00.000Z",
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(
    join(dir, "wrangler.jsonc"),
    `{\n  "name": "${DESTINO}",\n  "compatibility_date": "2026-09-17",\n  "assets": {\n    "directory": "./site",\n    "not_found_handling": "404-page",\n    "html_handling": "auto-trailing-slash"\n  }\n}\n`,
    "utf8",
  );
  writeFileSync(join(dir, "evidencia", "nota.txt"), "fixture de prueba\n", "utf8");
}

function runRestore(args: string[]): { status: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [RESTORE, ...args], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, out: String(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 99,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

beforeAll(() => {
  writeCandidate(join(TMP, "ok"));
  writeCandidate(join(TMP, "smoke"));
  writeCandidate(join(TMP, "alterado"));
  // Corrompe un byte del site tras firmar el manifiesto → hash mismatch.
  writeFileSync(join(TMP, "alterado", "site", "index.html"), "<html>CORRUPTO</html>\n", "utf8");
  mkdirSync(join(TMP, "sin-manifiesto", "site"), { recursive: true });
  writeFileSync(join(TMP, "sin-manifiesto", "site", "index.html"), "<html></html>\n", "utf8");
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("release-restore", () => {
  it("restaura un candidato íntegro: copia bytes y verifica hashes (exit 0)", () => {
    const dest = join(TMP, "dest-ok");
    const r = runRestore([join(TMP, "ok"), "--root", dest, "--no-smoke"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("verify OK");
    expect(r.out).toContain("hashes verificados en destino (3 assets)");
    for (const [rel, content] of Object.entries(SITE_FILES)) {
      expect(existsSync(join(dest, rel))).toBe(true);
      expect(readFileSync(join(dest, rel), "utf8")).toBe(content);
    }
  });

  it("repite el smoke local sobre lo restaurado (200/404/405)", () => {
    const dest = join(TMP, "dest-smoke");
    const r = runRestore([join(TMP, "smoke"), "--root", dest, "--port", "4531"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("GET /: esperado 200, observado 200");
    expect(r.out).toContain("GET /inexistente: esperado 404, observado 404");
    expect(r.out).toContain("POST /: esperado 405, observado 405");
    expect(r.out).toContain("smoke local OK (200/404/405)");
  });

  it("rechaza un candidato inexistente (exit 1)", () => {
    const r = runRestore(["pa-inexistente-xyz", "--root", join(TMP, "dest-no"), "--no-smoke"]);
    expect(r.status).toBe(1);
    expect(r.out).toContain("candidato no encontrado");
  });

  it("rechaza un directorio sin manifiesto (exit 1)", () => {
    const r = runRestore([
      join(TMP, "sin-manifiesto"),
      "--root",
      join(TMP, "dest-noman"),
      "--no-smoke",
    ]);
    expect(r.status).toBe(1);
    expect(r.out).toContain("candidato no encontrado");
  });

  it("rechaza un candidato alterado tras el manifiesto (exit 1, sin copiar)", () => {
    const dest = join(TMP, "dest-alterado");
    const r = runRestore([join(TMP, "alterado"), "--root", dest, "--no-smoke"]);
    expect(r.status).toBe(1);
    expect(r.out).toContain("hash mismatch");
    expect(existsSync(join(dest, "index.html"))).toBe(false);
  });

  it("--help explica el uso (exit 0)", () => {
    const r = runRestore(["--help"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("--allow-preview");
  });

  it("rechaza --root en la raíz del proyecto (exit 2, sin borrar nada)", () => {
    // Guardia D1 (PA-15): `--root` fuera de las zonas permitidas aborta
    // con exit 2 ANTES de borrar. El centinela prueba que no se borró nada.
    const sentinel = join(TMP, "guardia-d1-sentinel.txt");
    mkdirSync(TMP, { recursive: true });
    writeFileSync(sentinel, "centinela D1\n", "utf8");
    const r = runRestore([join(TMP, "ok"), "--root", REPO, "--no-smoke"]);
    expect(r.status).toBe(2);
    expect(r.out).toContain("destino --root no permitido");
    expect(r.out).toContain("Sin borrar nada");
    expect(existsSync(sentinel)).toBe(true);
    expect(existsSync(resolve(REPO, "package.json"))).toBe(true);
    expect(existsSync(join(TMP, "ok", "manifest.json"))).toBe(true);
  });
});
