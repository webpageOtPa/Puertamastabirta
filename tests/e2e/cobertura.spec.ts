import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-08 — Cobertura local y módulo opcional
// ---------------------------------------------------------------------
// Casos sobre el sitio compilado:
//   - Lista textual completa: 13 ciudades con ID único + grupo, 4 grupos
//     (fuente de verdad; funciona sin JS).
//   - SVG geográfico: title/desc, 13 puntos con data-city-id, nota
//     visible de mapa geográfico simplificado con procedencia, sin recursos remotos.
//   - Con `coverageInteraction` habilitado: selector semántico que
//     resalta ciudad + punto + estado aria-live; IDs inválidos con
//     estado estable; teclado y toque equivalentes.
//   - Con `coverageInteraction` deshabilitado: sin controles ni script
//     exclusivo; lista y SVG intactos.
//
// El spec es adaptativo: detecta el modo del build servido y ejecuta la
// rama que corresponde (la otra se marca skipped). `pnpm test:e2e` lo
// ejerce sobre el build por defecto (habilitado); la rama deshabilitada
// se ejerce sirviendo el build `PA_COVERAGE_INTERACTION=0` (ver
// docs/implementacion/PA-08/EVIDENCIA.md).
//
// Las capturas son evidencia para revisión humana; este test NO aprueba
// visualmente nada. Salida en docs/implementacion/PA-17F/capturas/pa-08/.

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17F/capturas/pa-08");
mkdirSync(OUT_DIR, { recursive: true });

const CIUDADES_ESPERADAS: Array<{ id: string; nombre: string; grupo: string }> = [
  { id: "bogota", nombre: "Bogotá D.C.", grupo: "zona-centro-y-sur" },
  { id: "ibague", nombre: "Ibagué", grupo: "zona-centro-y-sur" },
  { id: "cali", nombre: "Cali", grupo: "zona-centro-y-sur" },
  { id: "medellin", nombre: "Medellín", grupo: "zona-eje-cafetero-y-antioquia" },
  { id: "manizales", nombre: "Manizales", grupo: "zona-eje-cafetero-y-antioquia" },
  { id: "pereira", nombre: "Pereira", grupo: "zona-eje-cafetero-y-antioquia" },
  { id: "cartagena", nombre: "Cartagena", grupo: "zona-norte-y-caribe" },
  { id: "barranquilla", nombre: "Barranquilla", grupo: "zona-norte-y-caribe" },
  { id: "santa-marta", nombre: "Santa Marta", grupo: "zona-norte-y-caribe" },
  { id: "monteria", nombre: "Montería", grupo: "zona-norte-y-caribe" },
  { id: "sincelejo", nombre: "Sincelejo", grupo: "zona-norte-y-caribe" },
  { id: "valledupar", nombre: "Valledupar", grupo: "zona-norte-y-caribe" },
  { id: "cucuta", nombre: "Cúcuta", grupo: "zona-oriente" },
];

const GRUPOS_ESPERADOS = [
  "zona-centro-y-sur",
  "zona-eje-cafetero-y-antioquia",
  "zona-norte-y-caribe",
  "zona-oriente",
];

/** `true` cuando el build servido publica el selector (flag habilitado). */
async function interactionEnabled(page: Page): Promise<boolean> {
  return (await page.locator("select[data-cobertura-selector]").count()) > 0;
}

test.describe("PA-08 · Cobertura local — lista y diagrama (ambos modos)", () => {
  test("lista textual completa: 13 ciudades únicas con ID y grupo", async ({ page }) => {
    await page.goto("/");
    const items = page.locator("li[data-city-id].cobertura__ciudad");
    await expect(items).toHaveCount(13);
    const ids = await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-city-id")));
    expect(new Set(ids).size).toBe(13);
    for (const c of CIUDADES_ESPERADAS) {
      expect(ids).toContain(c.id);
      const li = page.locator(`li[data-city-id="${c.id}"].cobertura__ciudad`);
      await expect(li).toHaveCount(1);
      await expect(li).toHaveAttribute("data-group-id", c.grupo);
      await expect(li).toHaveAttribute("id", `cobertura-ciudad-${c.id}`);
      await expect(li).toContainText(c.nombre);
    }
    // Cuatro grupos con sus etiquetas.
    for (const g of GRUPOS_ESPERADOS) {
      await expect(page.locator(`li.cobertura__grupo[data-group-id="${g}"]`)).toHaveCount(1);
    }
  });

  test("SVG geográfico: title/desc, 13 puntos y nota visible de mapa real", async ({ page }) => {
    await page.goto("/");
    const svg = page.locator("svg.cobertura__diagrama");
    await expect(svg).toBeVisible();
    await expect(svg.locator("title")).toHaveCount(1);
    expect(((await svg.locator("title").textContent()) ?? "").toLowerCase()).toContain(
      "geográfico",
    );
    await expect(svg.locator("desc")).toHaveCount(1);
    expect(((await svg.locator("desc").textContent()) ?? "").toLowerCase()).toContain("aproximad");
    const puntos = svg.locator("circle.cobertura-punto[data-city-id]");
    await expect(puntos).toHaveCount(13);
    const ids = await puntos.evaluateAll((els) => els.map((el) => el.getAttribute("data-city-id")));
    expect(new Set(ids).size).toBe(13);
    for (const c of CIUDADES_ESPERADAS) expect(ids).toContain(c.id);
    // Contorno del país presente (un path cerrado, no conectores abstractos).
    await expect(svg.locator("path[src], path[d]")).toHaveCount(2);
    // Nota visible: procedencia, posiciones aproximadas y ausencia de oficinas.
    const nota = await page.locator(".cobertura__mapa-nota").innerText();
    expect(nota).toMatch(/Mapa simplificado de Colombia/i);
    expect(nota).toMatch(/Natural Earth \(dominio público\)/i);
    expect(nota).toMatch(/ubicaciones aproximadas/i);
    expect(nota).toMatch(/no indican oficinas/i);
  });

  test("sin recursos remotos al visitar la cobertura", async ({ page }) => {
    const externas: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) {
        externas.push(url);
      }
    });
    await page.goto("/");
    await expect(page.locator("#cobertura")).toBeVisible();
    expect(externas).toEqual([]);
  });
});

test.describe("PA-08 · Cobertura — con interacción habilitada", () => {
  test("selector semántico con 13 opciones en 4 grupos", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    const select = page.locator("select[data-cobertura-selector]");
    await expect(select).toBeVisible();
    await expect(page.locator("label[for='cobertura-selector']")).toHaveCount(1);
    // Placeholder + 13 ciudades.
    expect(await select.locator("option").count()).toBe(14);
    expect(await select.locator("optgroup").count()).toBe(4);
    for (const c of CIUDADES_ESPERADAS) {
      await expect(select.locator(`option[value="${c.id}"]`)).toContainText(c.nombre);
    }
  });

  test("elegir ciudad resalta su nombre, su punto y el estado", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    const select = page.locator("select[data-cobertura-selector]");
    await select.selectOption("medellin");
    const activa = page.locator("#cobertura-ciudad-medellin");
    await expect(activa).toHaveClass(/cobertura__ciudad--activa/);
    // Sólo una ciudad resaltada…
    expect(await page.locator(".cobertura__ciudad--activa").count()).toBe(1);
    // …y sólo su punto.
    await expect(page.locator("circle.cobertura-punto[data-city-id='medellin']")).toHaveClass(
      /cobertura-punto--activo/,
    );
    expect(await page.locator(".cobertura-punto--activo").count()).toBe(1);
    // Estado anunciado con ciudad y grupo.
    const estado = page.locator("[data-cobertura-status]");
    await expect(estado).toContainText("Medellín");
    await expect(estado).toContainText("Zona Eje Cafetero y Antioquia");
  });

  test("reelegir mueve el resaltado sin duplicados", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    const select = page.locator("select[data-cobertura-selector]");
    await select.selectOption("medellin");
    await select.selectOption("cucuta");
    await expect(page.locator("#cobertura-ciudad-cucuta")).toHaveClass(/cobertura__ciudad--activa/);
    await expect(page.locator("#cobertura-ciudad-medellin")).not.toHaveClass(
      /cobertura__ciudad--activa/,
    );
    expect(await page.locator(".cobertura__ciudad--activa").count()).toBe(1);
    expect(await page.locator(".cobertura-punto--activo").count()).toBe(1);
    await expect(page.locator("[data-cobertura-status]")).toContainText("Cúcuta");
  });

  test("ID inválido: estado estable sin excepción", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    const select = page.locator("select[data-cobertura-selector]");
    await select.selectOption("cali");
    await expect(page.locator("#cobertura-ciudad-cali")).toHaveClass(/cobertura__ciudad--activa/);
    const errores: string[] = [];
    page.on("pageerror", (err) => errores.push(String(err)));
    // Inyectar un valor desconocido y disparar change como haría el DOM.
    await page.evaluate(() => {
      const sel = document.querySelector("[data-cobertura-selector]") as HTMLSelectElement | null;
      if (!sel) throw new Error("sin selector");
      sel.value = "ciudad-fantasma";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(errores).toEqual([]);
    expect(await page.locator(".cobertura__ciudad--activa").count()).toBe(0);
    expect(await page.locator(".cobertura-punto--activo").count()).toBe(0);
    await expect(page.locator("[data-cobertura-status]")).toContainText(/Elige una ciudad/);
  });

  test("teclado: el selector recibe foco y cambia con flechas", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    const positivos = await page
      .locator("#cobertura [tabindex]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("tabindex")).filter((v) => v !== null && Number(v) > 0),
      );
    expect(positivos).toEqual([]);
    const select = page.locator("select[data-cobertura-selector]");
    await select.focus();
    // Del placeholder a la primera ciudad con una flecha.
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#cobertura-ciudad-bogota")).toHaveClass(/cobertura__ciudad--activa/);
    await expect(page.locator("[data-cobertura-status]")).toContainText("Bogotá D.C.");
  });

  test("móvil 390: controles visibles sin overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    await expect(page.locator("select[data-cobertura-selector]")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });

  test("capturas PA-08 — cobertura en desktop (reposo y selección)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    await expect(page.locator("#cobertura")).toBeVisible();
    await page.locator("#cobertura").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-cobertura.png"),
    });
    await page.locator("select[data-cobertura-selector]").selectOption("cartagena");
    await expect(page.locator("#cobertura-ciudad-cartagena")).toHaveClass(
      /cobertura__ciudad--activa/,
    );
    await page.locator("#cobertura").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-cobertura-seleccion.png"),
    });
  });

  test("capturas PA-08 — cobertura en móvil", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    await expect(page.locator("#cobertura")).toBeVisible();
    await page.locator("#cobertura").screenshot({
      path: resolve(OUT_DIR, "mobile-390-cobertura.png"),
    });
  });
});

test.describe("PA-08 · Cobertura — con interacción deshabilitada", () => {
  test("sin controles ni script exclusivo; lista y SVG intactos", async ({ page }) => {
    await page.goto("/");
    test.skip(await interactionEnabled(page), "build con interacción habilitada");
    await expect(page.locator("select[data-cobertura-selector]")).toHaveCount(0);
    await expect(page.locator("[data-cobertura-status]")).toHaveCount(0);
    // Ningún script de página menciona el módulo de cobertura (ni
    // inline ni tag diferido a /coverage-interaction.js).
    const restos = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script"))
        .map((el) => el.textContent ?? "")
        .filter((t) => t.includes("coberturaBound") || t.includes("data-cobertura-selector")),
    );
    expect(restos).toEqual([]);
    await expect(page.locator("script[src*='coverage']")).toHaveCount(0);
    // La alternativa funcional permanece: 13 ciudades y 13 puntos.
    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    await expect(page.locator("circle.cobertura-punto[data-city-id]")).toHaveCount(13);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#cobertura").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-cobertura-sin-interaccion.png"),
    });
  });
});

test.describe("PA-08 · Cobertura — sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("lista y diagrama se leen completos sin JS", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    await expect(page.locator("svg.cobertura__diagrama")).toBeVisible();
    await expect(page.locator("circle.cobertura-punto[data-city-id]")).toHaveCount(13);
    // Sin JS no hay resaltado posible, pero tampoco contenido oculto.
    expect(await page.locator(".cobertura__ciudad--activa").count()).toBe(0);
    expect(((await page.locator("#cobertura").innerText()) ?? "").length).toBeGreaterThan(200);
  });
});
