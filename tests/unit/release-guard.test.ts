import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, readFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";

// PA-14 — Guardia de release: el candidato comercial se RECHAZA si está
// alterado, es técnico promovido, es de otro sitio, sale del directorio
// permitido, está incompleto o trae worker/bindings (PA-Q051).
// ---------------------------------------------------------------------
// Estrategia: se ejecuta la CLI REAL (`scripts/release-verify.mjs`) como
// proceso hijo contra candidatos de prueba construidos en
// `tests/.tmp/release-guard/<caso>/` — nunca en `releases/` ni en
// `apps/public` — y se comprueba el rechazo con el motivo esperado. Un
// caso positivo exige que el candidato íntegro pase.
//
// Los fixtures se borran en `afterAll`; `tests/.tmp/` está gitignored.

const REPO = process.cwd();
const TMP = resolve(REPO, "tests/.tmp/release-guard");
const VERIFY = resolve(REPO, "scripts/release-verify.mjs");

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

interface FixtureOpts {
  sitio?: string;
  proposito?: string;
  perfil?: string;
  assetsDirectory?: string;
  wranglerExtra?: Record<string, unknown>;
  assetsExtra?: Record<string, unknown>;
  omit?: string[];
  destino?: string;
}

function writeCandidate(dir: string, opts: FixtureOpts = {}): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "site"), { recursive: true });
  mkdirSync(join(dir, "evidencia"), { recursive: true });
  for (const [rel, content] of Object.entries(SITE_FILES)) {
    writeFileSync(join(dir, "site", rel), content, "utf8");
  }
  const assets = Object.keys(SITE_FILES).map((ruta) => ({
    ruta,
    sha256: shaHex(readFileSync(join(dir, "site", ruta))),
    bytes: readFileSync(join(dir, "site", ruta)).length,
  }));
  const manifest: Record<string, unknown> = {
    formato: "puerta-abierta-release/1",
    id: "pa-test-fijo",
    sitio: opts.sitio ?? "puerta-abierta",
    proposito: opts.proposito ?? "comercial",
    perfil: opts.perfil ?? "commercial",
    commit: COMMIT,
    commitLimpio: true,
    destino: opts.destino ?? DESTINO,
    lockfile: { archivo: "pnpm-lock.yaml", sha256: "1".repeat(64) },
    versiones: { node: "v26.8.2", pnpm: "11.26.0", astro: "7.3.3" },
    wrangler: "wrangler.jsonc",
    cabeceras: "scripts/serve-dist.mjs",
    canonical: "apps/puerta-abierta/src/config/site.ts",
    politicaDestino: "deploy/destinos.json",
    assets,
    evidencia: ["evidencia/nota.txt"],
    creado: "2026-09-18T00:00:00.000Z",
    ...(opts.assetsExtra ?? {}),
  };
  for (const k of opts.omit ?? []) delete manifest[k];
  const wrangler: Record<string, unknown> = {
    name: opts.destino ?? DESTINO,
    compatibility_date: "2026-09-17",
    assets: { directory: opts.assetsDirectory ?? "./site" },
    ...(opts.wranglerExtra ?? {}),
  };
  writeFileSync(join(dir, "wrangler.jsonc"), JSON.stringify(wrangler, null, 2), "utf8");
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  writeFileSync(join(dir, "evidencia", "nota.txt"), "evidencia del fixture\n", "utf8");
}

function runVerify(
  dir: string,
  extraArgs: string[] = [],
): {
  exit: number;
  out: string;
} {
  try {
    const out = execFileSync(process.execPath, [VERIFY, dir, ...extraArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { exit: 0, out: String(out) };
  } catch (err) {
    const e = err as { status?: number; stdout?: unknown; stderr?: unknown };
    return {
      exit: typeof e.status === "number" ? e.status : 99,
      out: `${String(e.stdout ?? "")}\n${String(e.stderr ?? "")}`,
    };
  }
}

beforeAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("release-guard — positivo: candidato íntegro (PA-Q050)", () => {
  it("candidato comercial íntegro → verify pasa (exit 0)", () => {
    const dir = join(TMP, "positivo-comercial");
    writeCandidate(dir);
    const r = runVerify(dir);
    expect(r.out).toMatch(/candidato comercial íntegro/);
    expect(r.exit).toBe(0);
  });

  it("candidato de mecánica íntegro → pasa sólo con --allow-preview y sin promoverse", () => {
    const dir = join(TMP, "positivo-mecanica");
    writeCandidate(dir, { proposito: "mecanica-preview", perfil: "technical" });
    const estricto = runVerify(dir);
    expect(estricto.exit).toBe(1);
    expect(estricto.out).toMatch(/promoción indebida/);
    const mecanica = runVerify(dir, ["--allow-preview"]);
    expect(mecanica.exit).toBe(0);
    expect(mecanica.out).toMatch(/NO PROMOVER A COMERCIAL/);
  });
});

describe("release-guard — negativos de integridad y procedencia (PA-Q051)", () => {
  it("1. candidato alterado (un byte en un asset) → hash mismatch", () => {
    const dir = join(TMP, "alterado");
    writeCandidate(dir);
    appendFileSync(join(dir, "site", "estilos.css"), "/* x */\n", "utf8");
    const r = runVerify(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/hash mismatch/);
    expect(r.out).toMatch(/estilos\.css/);
  });

  it("2. candidato técnico promovido a comercial → rechazo por propósito/perfil", () => {
    const dir = join(TMP, "tecnico-promovido");
    writeCandidate(dir, { proposito: "mecanica-preview", perfil: "technical" });
    const r = runVerify(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/promoción indebida/);
  });

  it("3. candidato de otro sitio → rechazo por sitio distinto", () => {
    const dir = join(TMP, "otro-sitio");
    writeCandidate(dir, { sitio: "oterco" });
    const r = runVerify(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/sitio distinto/);
  });

  it("4. ruta fuera del directorio permitido → rechazo (traversal)", () => {
    const dir = join(TMP, "ruta-fuera");
    writeCandidate(dir, { assetsDirectory: "../fuera" });
    const r = runVerify(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/fuera del directorio permitido/);
  });

  it("5. manifiesto incompleto (sin hashes, sin commit, sin versiones) → rechazo", () => {
    const dir = join(TMP, "incompleto");
    writeCandidate(dir, { omit: ["assets", "commit", "versiones"] });
    const r = runVerify(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/manifiesto incompleto/);
  });

  it("6. wrangler con main/binding/run_worker_first → rechazo", () => {
    const dir = join(TMP, "worker-encubierto");
    writeCandidate(dir, {
      wranglerExtra: { main: "./worker.js", run_worker_first: true },
    });
    // binding dentro de assets: reescribe el wrangler del fixture.
    const wPath = join(dir, "wrangler.jsonc");
    const w = JSON.parse(readFileSync(wPath, "utf8")) as {
      assets: Record<string, unknown>;
    };
    w.assets["binding"] = "ASSETS";
    writeFileSync(wPath, JSON.stringify(w, null, 2), "utf8");
    const r = runVerify(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/prohibida/);
    expect(r.out).toMatch(/main|binding|run_worker_first/);
  });
});
