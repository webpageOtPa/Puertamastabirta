import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// PA-11 — Suite negativa sensible del scanner `check:static`
// (PA-Q028–PA-Q039, PA-Q063).
// ---------------------------------------------------------------------
// Estrategia: se ejecuta el SCANNER REAL (`scripts/check-static.mjs`)
// como proceso hijo contra árboles de fixtures construidos en
// `tests/.tmp/check-static/<caso>/` — nunca en `apps/` ni `public/` — y
// se comprueba que falla con el hallazgo esperado. Un caso final ejecuta
// el scanner contra el árbol actual y exige 0 hallazgos.
//
// Los fixtures se borran en `afterAll`; `tests/.tmp/` está gitignored.

const REPO = process.cwd();
const TMP = resolve(REPO, "tests/.tmp/check-static");
const SCANNER = resolve(REPO, "scripts/check-static.mjs");

const GOOD_MANIFEST = JSON.stringify(
  {
    name: "fixture-app",
    private: true,
    dependencies: { astro: "7.3.3", zod: "4.6.5" },
  },
  null,
  2,
);

const GOOD_CONFIG = `import { defineConfig } from "astro/config";
export default defineConfig({ output: "static" });
`;

const GOOD_WRANGLER = `{
  "name": "fixture-preview",
  "compatibility_date": "2026-09-17",
  "assets": { "directory": "./dist" }
}
`;

const BENIGN_PAGE = `---
const titulo = "Fixture";
---
<html><body><p>{titulo} sin captación.</p></body></html>
`;

const BENIGN_DIST = `<html><head><title>f</title></head><body><p>ok</p></body></html>`;

function writeTree(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(base, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  // Directorios vacíos que el scanner espera recorrer.
  for (const sub of ["app/src", "app/public", "app/dist"]) {
    mkdirSync(join(base, sub), { recursive: true });
  }
}

/** Árbol mínimo que debe PASAR (base para introducir infracciones). */
function cleanTree(caseDir: string): void {
  writeTree(caseDir, {
    "app/package.json": GOOD_MANIFEST,
    "app/astro.config.mjs": GOOD_CONFIG,
    "app/wrangler.jsonc": GOOD_WRANGLER,
    "app/src/pages/index.astro": BENIGN_PAGE,
    "app/public/app.js": "console.log('benigno');\n",
    "app/dist/index.html": BENIGN_DIST,
  });
}

function runScanner(caseDir: string): { exit: number; out: string } {
  const app = join(caseDir, "app");
  try {
    const out = execFileSync(
      process.execPath,
      [SCANNER, "--root", caseDir, "--app", app, "--dist", join(app, "dist")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
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
  // Limpia sondas manuales o restos de ejecuciones previas.
  rmSync(TMP, { recursive: true, force: true });
  rmSync(resolve(REPO, "tests/.tmp/probe"), { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("check-static — árbol real y fixture benigno (PA-Q063)", () => {
  it("el scanner real pasa contra el árbol actual con 0 hallazgos", () => {
    // Determinista en checkout fresco (CI): el scanner exige dist construido.
    // Si no existe, construirlo primero con `pnpm run build:test`; fallar si
    // el build falla (sin silenciar el hallazgo [missing-dist]).
    const dist = resolve(REPO, "apps/puerta-abierta/dist");
    if (!existsSync(dist)) {
      try {
        execFileSync("pnpm", ["run", "build:test"], {
          encoding: "utf8",
          cwd: REPO,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        const e = err as {
          status?: number;
          stdout?: unknown;
          stderr?: unknown;
        };
        throw new Error(
          `build:test previo falló (exit ${String(e.status ?? "?")}):\n` +
            `${String(e.stdout ?? "")}\n${String(e.stderr ?? "")}`,
        );
      }
    }
    let out = "";
    let exit = 99;
    try {
      out = String(execFileSync(process.execPath, [SCANNER], { encoding: "utf8" }));
      exit = 0;
    } catch (err) {
      const e = err as { status?: number; stdout?: unknown };
      exit = typeof e.status === "number" ? e.status : 99;
      out = String(e.stdout ?? "");
    }
    expect(out).toMatch(/0 hallazgos/);
    expect(exit).toBe(0);
  });

  it("no confunde menciones en comentarios con código (benigno con <form>/fetch/oterco comentados)", () => {
    const dir = join(TMP, "benigno-comentarios");
    cleanTree(dir);
    writeTree(dir, {
      // Todo lo "sospechoso" vive en comentarios: no es código desplegado.
      "app/src/pages/nota.astro": `---
// Nota: este componente NO contiene <form>, <input> ni fetch().
// Tampoco usa OTERCO como referencia de diseño.
// ---
<p>Visible sin captación.</p>
<!-- <form action="/x"><input type="submit"></form> -->
`,
      "app/public/nota.js": `/* fetch("/api"); localStorage.clear(); navigator.geolocation; */\nconsole.log("ok");\n`,
    });
    const r = runScanner(dir);
    expect(r.out).toMatch(/0 hallazgos/);
    expect(r.exit).toBe(0);
  });
});

describe("check-static — negativos de captación y red (PA-Q028, PA-Q031)", () => {
  it("form/submit en fixture de fuente → detectado con archivo:línea", () => {
    const dir = join(TMP, "form-submit");
    cleanTree(dir);
    writeTree(dir, {
      "app/src/components/Malo.astro": `<section>\n<form action="/recibir"><input name="q" type="text">\n<button type="submit">Enviar</button></form>\n</section>\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[form-tag\].*Malo\.astro:2/);
    expect(r.out).toMatch(/\[input-tag\]/);
    expect(r.out).toMatch(/\[submit-type\]/);
  });

  it("fetch/beacon en fixture público → detectado", () => {
    const dir = join(TMP, "fetch-beacon");
    cleanTree(dir);
    writeTree(dir, {
      "app/public/rastreo.js": `fetch("/api/visita", { method: "POST" });\nnavigator.sendBeacon("/api/ping", "x");\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[fetch-call\]/);
    expect(r.out).toMatch(/\[beacon\]/);
  });
});

describe("check-static — negativos de dependencias y config (PA-Q029, PA-Q030)", () => {
  it("adaptador SSR añadido al manifest temporal → detectado", () => {
    const dir = join(TMP, "ssr-dep");
    cleanTree(dir);
    writeTree(dir, {
      "app/package.json": JSON.stringify({
        name: "fixture-app",
        private: true,
        dependencies: { astro: "7.3.3", "@astrojs/node": "9.0.0" },
      }),
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[dep:ssr-adapter\]/);
  });

  it("SDK de DB y CAPTCHA en devDependencies → detectados", () => {
    const dir = join(TMP, "db-captcha");
    cleanTree(dir);
    writeTree(dir, {
      "app/package.json": JSON.stringify({
        name: "fixture-app",
        private: true,
        dependencies: { astro: "7.3.3" },
        devDependencies: { prisma: "6.0.0", "something-captcha": "1.0.0" },
      }),
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[dep:db\]/);
    expect(r.out).toMatch(/\[dep:captcha\]/);
  });

  it("prerender:false + middleware + pages/api en config temporal → detectados", () => {
    const dir = join(TMP, "config-temporal");
    cleanTree(dir);
    writeTree(dir, {
      "app/astro.config.mjs": `import { defineConfig } from "astro/config";\nexport default defineConfig({ output: "server", adapter: {} });\n`,
      "app/src/middleware.ts": `export function onRequest() {}\n`,
      "app/src/pages/api/hola.ts": `export function GET() { return new Response("x"); }\n`,
      "app/src/pages/otra.astro": `---\nexport const prerender = false;\n---\n<p>x</p>\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/output-server/);
    expect(r.out).toMatch(/\[middleware\]/);
    expect(r.out).toMatch(/\[runtime-dir\]/);
    expect(r.out).toMatch(/prerender-false/);
  });

  it("wrangler con comentarios y comas finales (JSONC) se parsea si las claves son buenas", () => {
    const dir = join(TMP, "hosting-jsonc");
    cleanTree(dir);
    writeTree(dir, {
      "app/wrangler.jsonc": `{
  // Comentario de emulación: esquema mínimo.
  "name": "x",
  "compatibility_date": "2026-09-17",
  "assets": { "directory": "./dist", },
}
`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(0);
    expect(r.out).toMatch(/0 hallazgos/);
  });

  it("run_worker_first dentro de assets → rechazado (D1)", () => {
    const dir = join(TMP, "hosting-run-worker-first");
    cleanTree(dir);
    writeTree(dir, {
      "app/wrangler.jsonc": `{\n"name": "x",\n"compatibility_date": "2026-09-17",\n"assets": { "directory": "./dist", "run_worker_first": true }\n}\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[hosting-key\]/);
    expect(r.out).toMatch(/run_worker_first/);
  });

  it("subclave desconocida dentro de assets → rechazada", () => {
    const dir = join(TMP, "hosting-assets-malo");
    cleanTree(dir);
    writeTree(dir, {
      "app/wrangler.jsonc": `{\n"name": "x",\n"compatibility_date": "2026-09-17",\n"assets": { "directory": "./dist", "binding": "ASSETS" }\n}\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[hosting-key\]/);
    expect(r.out).toMatch(/assets\.binding/);
  });
  it("main/bindings en wrangler temporal → rechazados", () => {
    const dir = join(TMP, "hosting-malo");
    cleanTree(dir);
    writeTree(dir, {
      "app/wrangler.jsonc": `{\n"name": "x",\n"compatibility_date": "2026-09-17",\n"main": "./worker.js",\n"assets": { "directory": "./dist", "binding": "ASSETS" }\n}\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[hosting-key\]/);
  });
});

describe("check-static — negativos de dist y storage (PA-Q033, PA-Q039)", () => {
  it("archivo privado sembrado en dist temporal (.env, sql, map) → detectado", () => {
    const dir = join(TMP, "dist-privado");
    cleanTree(dir);
    writeTree(dir, {
      "app/dist/.env": "SECRETO=1\n",
      "app/dist/volcado.sql": "CREATE TABLE x;\n",
      "app/dist/app.js.map": '{"mappings":""}\n',
      "app/dist/NOTAS.md": "# interno\n",
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[private-file\]/);
    expect(r.out).toMatch(/\.env/);
    expect(r.out).toMatch(/volcado\.sql/);
  });

  it("serviceWorker/storage/geolocation en fuente → detectados", () => {
    const dir = join(TMP, "storage-sw");
    cleanTree(dir);
    writeTree(dir, {
      "app/src/lib/malo.ts": `localStorage.setItem("a", "b");\nsessionStorage.getItem("a");\nconst db = indexedDB.open("x");\nnavigator.serviceWorker.register("/sw.js");\nnavigator.geolocation.getCurrentPosition(() => {});\ndocument.cookie = "a=b";\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    for (const rule of [
      "local-storage",
      "session-storage",
      "indexed-db",
      "service-worker",
      "geolocation",
      "cookie",
    ]) {
      expect(r.out).toMatch(new RegExp(`\\[${rule}\\]`));
    }
  });

  it("referencia a OTERCO en código publicable → detectada (PA-Q003)", () => {
    const dir = join(TMP, "oterco-import");
    cleanTree(dir);
    writeTree(dir, {
      "app/src/lib/puente.ts": `import { x } from "../oterco/tema";\nconsole.log(x);\n`,
    });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[oterco-import\]/);
  });
});

describe("check-static — guarda de cobertura mínima (PA-Q063)", () => {
  it("nunca devuelve OK vacío: árbol sin archivos revisables → FALLO", () => {
    const dir = join(TMP, "vacio");
    writeTree(dir, {
      "app/package.json": GOOD_MANIFEST,
      "app/astro.config.mjs": GOOD_CONFIG,
      "app/wrangler.jsonc": GOOD_WRANGLER,
    });
    // Sin archivos en src/public y sin dist: 0 archivos revisados.
    rmSync(join(dir, "app/dist"), { recursive: true, force: true });
    const r = runScanner(dir);
    expect(r.exit).toBe(1);
    expect(r.out).toMatch(/\[missing-dist\]/);
    expect(r.out).toMatch(/\[empty-scan\]/);
    expect(existsSync(dir)).toBe(true);
  });
});
