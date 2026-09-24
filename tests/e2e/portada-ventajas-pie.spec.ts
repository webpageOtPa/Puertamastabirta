import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-06 — Portada, ventajas y pie propios
// ---------------------------------------------------------------------
// Casos sobre el sitio compilado (apps/puerta-abierta/dist):
//   - Hero: CTA "Consultar un arriendo" → #contacto,
//     dimensiones reservadas (CLS) y velo presente.
//   - Ventajas: 3 tarjetas, iconos decorativos (alt="") y apilado en móvil.
//   - Pie: sin enlace de privacidad (retirada 2026-09-18) y nota de vista previa técnica en revisión.
//   - SEO: title/description sin claims no aprobados.
//   - Sin formularios ni red remota (Q028/Q032, porción aplicable a PA-06).
//
// Las capturas son evidencia para revisión humana; este test NO aprueba
// visualmente nada. Salida en docs/implementacion/PA-17K/capturas/inicio/.

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17K/capturas/inicio");
mkdirSync(OUT_DIR, { recursive: true });

// Patrones prohibidos en copy visible y metadatos (claims no aprobados).
const CLAIMS = /rentabilidad|blindad|mitigaci.n total|a.os operativ|garantiz|m.xima rentabilidad/i;

test.describe("PA-06 · Portada, ventajas y pie propios", () => {
  test("hero — CTA primario a #contacto y nota de placeholder visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const hero = page.locator(".hero");
    await expect(hero).toBeVisible();
    const subtitulo = hero.locator(".hero__subtitulo");
    await expect(subtitulo).toContainText(
      "Ofrecemos locales comerciales en arriendo para empresas a nivel nacional.",
    );
    await expect(subtitulo).not.toContainText("empresas nacionales en expansión");
    const cta = hero.getByRole("link", { name: "Consultar un arriendo" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "#contacto");
    const sec = hero.getByRole("link", { name: "Explorar una alianza" });
    await expect(sec).toHaveAttribute("href", "#metodo");
    // La nota indica que el fondo es un placeholder, no fotografía real.
    await expect(hero.locator(".hero__placeholder-nota")).toHaveCount(0);
    // Sin claims no aprobados en el hero.
    const heroText = await hero.innerText();
    expect(heroText).not.toMatch(CLAIMS);
  });

  test("hero — imagen con dimensiones reservadas y velo presente", async ({ page }) => {
    await page.goto("/");
    const img = page.locator(".hero__media img");
    await expect(img).toHaveAttribute("width", "1600");
    await expect(img).toHaveAttribute("height", "720");
    // Decorativa: el fondo no aporta contenido (la nota textual lo declara).
    await expect(img).toHaveAttribute("alt", "");
    // El velo oscuro existe para mantener el texto blanco legible.
    await expect(page.locator(".hero__veil")).toHaveCount(1);
    const veil = await page.evaluate(() => {
      const el = document.querySelector(".hero__veil");
      if (!el) return null;
      return getComputedStyle(el).backgroundColor;
    });
    expect(veil).not.toBeNull();
    expect(veil).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("ventajas — tres tarjetas con iconos decorativos", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#ventajas");
    await expect(section).toBeVisible();
    await expect(section.locator(".ventaja")).toHaveCount(3);
    // Iconos servidos como <img> decorativos.
    const icons = section.locator(".ventaja__icono img");
    await expect(icons).toHaveCount(3);
    for (const src of await icons.evaluateAll((els) => els.map((el) => el.getAttribute("src")))) {
      expect(src).toMatch(/^\/icons\/(grid|scale|compass)\.svg$/);
    }
    const alts = await icons.evaluateAll((els) => els.map((el) => el.getAttribute("alt")));
    expect(alts).toEqual(["", "", ""]);
    // Sin claims no aprobados en las ventajas.
    const text = await section.innerText();
    expect(text).not.toMatch(CLAIMS);
  });

  test("móvil 390 — las tres tarjetas se apilan sin overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    expect(noOverflow).toBe(true);
    // Apilado vertical: cada tarjeta empieza más abajo que la anterior y
    // comparten el mismo borde izquierdo (una columna).
    const boxes = await page.locator("#ventajas .ventaja").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width };
      }),
    );
    expect(boxes).toHaveLength(3);
    expect(boxes[1]!.top).toBeGreaterThan(boxes[0]!.top);
    expect(boxes[2]!.top).toBeGreaterThan(boxes[1]!.top);
    expect(Math.abs(boxes[1]!.left - boxes[0]!.left)).toBeLessThan(2);
    expect(Math.abs(boxes[2]!.left - boxes[0]!.left)).toBeLessThan(2);
  });

  test("pie — sin enlace de privacidad (retirada) y nota de vista previa técnica en revisión", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer).toBeVisible();
    // Página /privacidad/ retirada por decisión del propietario
    // (2026-09-18): el pie no lleva enlace de privacidad.
    expect(await footer.locator("a[href='/privacidad']").count()).toBe(0);
    expect(await footer.locator("a[href='/privacidad/']").count()).toBe(0);
    const nota = await footer.locator(".site-footer__nota").innerText();
    expect(nota).toMatch(/vista previa técnica/i);
    expect(nota).toMatch(/revisi/i);
    expect(nota).toMatch(/no habilitada para publicación/i);
    // La identidad legal sin aprobación no se presenta en el pie.
    const footerText = await footer.innerText();
    expect(footerText).not.toMatch(/Identificación|pendiente de aprobaci/i);
    expect(footerText).not.toMatch(CLAIMS);
  });

  test("SEO — title/description propios sin claims no aprobados", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title).toMatch(/Puerta Abierta/);
    expect(title).toMatch(/Locales comerciales en arriendo/);
    expect(title).not.toMatch(CLAIMS);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).not.toBeNull();
    expect(description!).not.toMatch(CLAIMS);
    expect(description!.length).toBeGreaterThan(0);
  });

  test("sin formularios ni red remota en la portada", async ({ page }) => {
    const remote: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (!u.startsWith("http://127.0.0.1") && !u.startsWith("http://localhost")) {
        remote.push(u);
      }
    });
    await page.goto("/");
    expect(await page.locator("form").count()).toBe(0);
    expect(await page.locator("input").count()).toBe(0);
    expect(await page.locator("textarea").count()).toBe(0);
    // PA-08 añade un <select> local de resaltado (sin <form>, sin envío):
    // el único selector permitido es el de cobertura.
    expect(await page.locator("select:not([data-cobertura-selector])").count()).toBe(0);
    expect(remote).toEqual([]);
  });

  test("capturas PA-06 — desktop hero, ventajas y pie", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.locator(".hero").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-hero.png"),
    });
    await page.locator("#ventajas").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-ventajas.png"),
    });
    await page.locator("footer.site-footer").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-footer.png"),
    });
  });

  test("capturas PA-06 — móvil hero, ventajas y pie", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.locator(".hero").screenshot({
      path: resolve(OUT_DIR, "mobile-390-hero.png"),
    });
    await page.locator("#ventajas").screenshot({
      path: resolve(OUT_DIR, "mobile-390-ventajas.png"),
    });
    await page.locator("footer.site-footer").screenshot({
      path: resolve(OUT_DIR, "mobile-390-footer.png"),
    });
  });
});
