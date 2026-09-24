import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-04 — Capturas del prototipo estructural
// ---------------------------------------------------------------------
// Este test NO aprueba visualmente nada: genera capturas para que la
// persona designada por el propietario las revise (CHECKLIST_VISUAL.md,
// item "Capturas desktop/móvil/reduced-motion, versiones y commit
// registrados").
//
// Las capturas se depositan en docs/implementacion/PA-17F/capturas/pa-04/ y se
// declaran como "pendiente de aprobación humana" en EVIDENCIA.md.
//
// No se modifica ningún criterio ni snapshot para hacer pasar el test.

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17F/capturas/pa-04");
mkdirSync(OUT_DIR, { recursive: true });

test.describe("PA-04 · Prototipo estructural", () => {
  test("desktop 1440 — portada completa", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    // Captura completa (fullPage) del prototipo.
    await page.screenshot({
      path: resolve(OUT_DIR, "desktop-1440-full.png"),
      fullPage: true,
    });
  });

  test("móvil 390 — portada completa", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({
      path: resolve(OUT_DIR, "mobile-390-full.png"),
      fullPage: true,
    });
  });

  test("móvil 320 — sin recortes en bloque de contacto", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    await expect(page.locator("#contacto")).toBeVisible();
    // Captura sólo del panel de contacto en el viewport más estrecho
    // declarado en CHECKLIST_VISUAL.md ("nada cortado en 320px").
    const contacto = page.locator("#contacto");
    await contacto.screenshot({
      path: resolve(OUT_DIR, "mobile-320-contacto.png"),
    });
  });

  test("reduced-motion — la transición del CTA sigue declarada", async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const context = page.context();
    // Reducir movimiento desde CDP (Chromium).
    if (browserName === "chromium") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
    }
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({
      path: resolve(OUT_DIR, "desktop-reduced-motion.png"),
      fullPage: true,
    });
  });

  test("sin red remota — el prototipo no solicita recursos externos", async ({ page }) => {
    const remote: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (!u.startsWith("http://127.0.0.1") && !u.startsWith("http://localhost")) {
        remote.push(u);
      }
    });
    await page.goto("/");
    // Sin CDN, sin Google Fonts, sin analytics.
    expect(remote).toEqual([]);
  });

  test("sin elementos de formulario en la portada", async ({ page }) => {
    await page.goto("/");
    // Ningún <form>, <input>, <textarea>, <select> ni botón "submit".
    // PA-08 añade un <select> local de resaltado (sin <form>, sin envío):
    // el único selector permitido es el de cobertura.
    expect(await page.locator("form").count()).toBe(0);
    expect(await page.locator("input").count()).toBe(0);
    expect(await page.locator("textarea").count()).toBe(0);
    expect(await page.locator("select:not([data-cobertura-selector])").count()).toBe(0);
    // Ningún botón con type=submit.
    expect(await page.locator('button[type="submit"]').count()).toBe(0);
  });

  // PA-04.E/D1 — El ancla móvil con menú abierto no queda tapada.
  // ---------------------------------------------------------------
  // Defecto D1 (medio): en móvil, con el menú de la cabecera abierto,
  // pulsar un ancla interna dejaba el destino tapado por la cabecera
  // expandida porque `scroll-padding-top` no compensaba su altura.
  // El CSS usa `html:has(.site-header__nav-details[open])` para elevar
  // el relleno; este caso lo verifica de forma permanente.
  test("móvil 390 — ancla con menú abierto no queda tapada", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const details = page.locator(".site-header__nav-details");
    const summary = details.locator("summary");
    await expect(summary).toBeVisible();
    // PA-04.G: el <details> inicia cerrado en móvil (cabecera compacta);
    // asegurar abierto sin asumir estado inicial antes de pulsar el ancla.
    if ((await details.getAttribute("open")) === null) {
      await summary.click();
    }
    await expect(details).toHaveAttribute("open", "");
    // Pulsar un ancla del menú (las del <nav> son #ventajas, #metodo,
    // #comparativa y #cobertura; #contacto vive en el CTA, fuera del menú).
    await page.locator('.site-header__nav a[href="#cobertura"]').click();
    await page.waitForTimeout(400);
    // El destino no debe quedar tapado por la cabecera.
    const rects = await page.evaluate(() => {
      const header = document.querySelector(".site-header");
      const target = document.querySelector("#cobertura");
      if (!header || !target) return null;
      const h = header.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      return { headerBottom: h.bottom, targetTop: t.top };
    });
    expect(rects).not.toBeNull();
    expect(rects!.targetTop).toBeGreaterThanOrEqual(rects!.headerBottom - 1);
  });

  // Caso desktop sencillo: el CTA `#contacto` respeta el offset sticky.
  test("desktop — ancla #contacto desde el CTA no queda tapada", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.locator(".site-header__cta").click();
    await page.waitForTimeout(400);
    const rects = await page.evaluate(() => {
      const header = document.querySelector(".site-header");
      const target = document.querySelector("#contacto");
      if (!header || !target) return null;
      const h = header.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      return { headerBottom: h.bottom, targetTop: t.top };
    });
    expect(rects).not.toBeNull();
    expect(rects!.targetTop).toBeGreaterThanOrEqual(rects!.headerBottom - 1);
  });

  // PA-04.G — Cabecera sticky fijada tras scroll (captura de evidencia).
  test("desktop — cabecera sticky fijada tras scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(400);
    const sticky = await page.evaluate(() => {
      const header = document.querySelector(".site-header");
      if (!header) return null;
      const r = header.getBoundingClientRect();
      const cs = getComputedStyle(header);
      return { position: cs.position, top: r.top, visible: r.bottom > 0 };
    });
    expect(sticky).not.toBeNull();
    expect(sticky!.position).toBe("sticky");
    expect(sticky!.top).toBe(0);
    expect(sticky!.visible).toBe(true);
    await page.screenshot({
      path: resolve(OUT_DIR, "desktop-header-sticky.png"),
    });
  });

  // PA-17E: la comparativa no sustentada fue retirada por el propietario.
  for (const width of [390, 1440]) {
    test(`comparativa ausente y página sin overflow a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
      await expect(
        page.locator("#comparativa, .comparativa__cards, table.comparativa"),
      ).toHaveCount(0);
    });
  }
});
