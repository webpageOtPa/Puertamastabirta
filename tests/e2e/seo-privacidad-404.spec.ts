import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-10 — SEO y 404 (PA-Q045, PA-Q047)
// ---------------------------------------------------------------------
// Casos sobre el sitio compilado (apps/puerta-abierta/dist, perfil
// technical): metadatos por perfil, 404 real,
// robots/sitemap coherentes y anclas únicas.
// Página /privacidad/ retirada por decisión del propietario (2026-09-18):
// no rehacer sin instrucción expresa; una petición a /privacidad/ debe
// dar 404.
//
// Las capturas son evidencia para revisión humana; este test NO aprueba
// visualmente nada. Salida en docs/implementacion/PA-17F/capturas/pa-10/.

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17F/capturas/pa-10");
mkdirSync(OUT_DIR, { recursive: true });

test.describe("PA-10 · SEO por perfil technical", () => {
  test("noindex presente y canonical/og:url omitidos (canonical null)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
    expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
    expect(await page.locator('meta[property="og:url"]').count()).toBe(0);
    // Metadatos propios sin promesas de recepción ni rentas.
    await expect(page).toHaveTitle(/Puerta Abierta/);
    const description =
      (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
    expect(description.length).toBeGreaterThan(0);
    expect(description).not.toMatch(/garantiz|rentabilidad|automático/i);
    // OpenGraph propio + favicon local + lang.
    expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toBeTruthy();
    expect(await page.locator('meta[property="og:locale"][content="es_CO"]').count()).toBe(1);
    expect(await page.locator('link[rel="icon"][href="/favicon.svg"]').count()).toBe(1);
    expect(await page.locator("html").getAttribute("lang")).toBe("es-co");
  });

  test("señal visible de preview técnica (sin prometer recepción)", async ({ page }) => {
    await page.goto("/");
    const aviso = page.locator(".tech-preview");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(/vista previa técnica/i);
    await expect(aviso).toContainText(/no indexada/i);
    await expect(aviso).not.toContainText(/recibimos|resultados|garantiz/i);
  });

  test("robots.txt bloquea todo y sitemap no inventa dominio", async ({ page }) => {
    const robots = await page.request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const robotsBody = await robots.text();
    expect(robotsBody).toMatch(/Disallow: \//);
    expect(robotsBody).not.toMatch(/localhost|file:\/\//);

    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toMatch(/<urlset/);
    expect(sitemapBody).not.toMatch(/localhost|file:\/\/|example\.invalid/);
  });

  test("sin JSON-LD crudo en la portada", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0);
  });
});

test.describe("PA-10 · /privacidad/ retirada (negativo)", () => {
  test("no existe /privacidad/ (retirada 2026-09-18): 404 con la página propia", async ({
    page,
  }) => {
    const res = await page.goto("/privacidad/");
    expect(res?.status()).toBe(404);
    await expect(page.locator("#error404-titulo")).toBeVisible();
  });

  test("el pie no enlaza a /privacidad/", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator("footer a[href='/privacidad']").count()).toBe(0);
    expect(await page.locator("footer a[href='/privacidad/']").count()).toBe(0);
    await page.goto("/ruta-que-no-existe-xyz/");
    expect(await page.locator("footer a[href='/privacidad']").count()).toBe(0);
    expect(await page.locator("footer a[href='/privacidad/']").count()).toBe(0);
  });

  test("las anclas de la cabecera resuelven a la portada (sin destinos colgados)", async ({
    page,
  }) => {
    await page.goto("/ruta-que-no-existe-xyz/");
    for (const ancla of ["ventajas", "metodo", "cobertura", "contacto"]) {
      const href = await page.locator(`header a[href='/#${ancla}']`).first().getAttribute("href");
      expect(href).toBe(`/#${ancla}`);
    }
    // Seguir /#contacto aterriza en la portada con el destino visible.
    await page.locator("header a[href='/#contacto']").first().click();
    await expect(page).toHaveURL(/\/#contacto$/);
    await expect(page.locator("#contacto")).toBeVisible();
  });

  test("el footer de la página auxiliar enlaza a /#contacto (sin ancla colgada)", async ({
    page,
  }) => {
    await page.goto("/ruta-que-no-existe-xyz/");
    await expect(page.locator("footer a[href='/#contacto']")).toHaveCount(1);
    expect(await page.locator("footer a[href='#contacto']").count()).toBe(0);

    // La portada conserva el default (`#contacto` relativo, correcto en `/`).
    await page.goto("/");
    await expect(page.locator("footer a[href='#contacto']")).toHaveCount(1);
  });
});

test.describe("PA-10 · Página 404", () => {
  test("ruta inexistente sirve la 404 propia con estado 404 real", async ({ page }) => {
    const res = await page.goto("/ruta-que-no-existe-xyz/");
    expect(res?.status()).toBe(404);
    await expect(page.locator("#error404-titulo")).toContainText(/no existe/i);
    const volver = page.locator('main a[href="/"]');
    await expect(volver.first()).toBeVisible();
    await volver.first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("ruta antigua de recepción devuelve 404, nunca éxito falso", async ({ page }) => {
    const res = await page.request.get("/api/contacto");
    expect(res.status()).toBe(404);
  });

  test("la 404 lleva noindex + banner de preview en technical (D2: señales desacopladas)", async ({
    page,
  }) => {
    const res = await page.goto("/ruta-que-no-existe-xyz/");
    expect(res?.status()).toBe(404);
    // `noindex` se mantiene en la 404…
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
    // …y en technical el banner visible acompaña (en commercial iría
    // `techPreview=false` aunque `noindex` siga siendo true).
    const aviso = page.locator(".tech-preview");
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(/vista previa técnica/i);
  });
});

test.describe("PA-10 · Anclas internas", () => {
  test("los id del documento son únicos y las anclas del menú existen", async ({ page }) => {
    await page.goto("/");
    const duplicados = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
      const vistos = new Set<string>();
      return ids.filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)));
    });
    expect(duplicados).toEqual([]);
    for (const ancla of ["#ventajas", "#metodo", "#cobertura", "#contacto"]) {
      // Cada ancla tiene exactamente un destino en la portada.
      expect(await page.locator(ancla).count()).toBe(1);
    }
    // El menú principal enlaza las 3 secciones y el CTA de cabecera a #contacto.
    for (const ancla of ["#ventajas", "#metodo", "#cobertura"]) {
      expect(
        await page.locator(`nav[aria-label='Navegación principal'] a[href='${ancla}']`).count(),
      ).toBe(1);
    }
    expect(await page.locator(`header a[href='#contacto']`).count()).toBeGreaterThanOrEqual(1);
  });
});

test.describe("PA-10 · Capturas", () => {
  test("captura 404 en desktop y móvil", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ruta-que-no-existe-xyz/");
    await expect(page.locator("#error404-titulo")).toBeVisible();
    await page.screenshot({ path: resolve(OUT_DIR, "desktop-1440-404.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ruta-que-no-existe-xyz/");
    await expect(page.locator("#error404-titulo")).toBeVisible();
    await page.screenshot({ path: resolve(OUT_DIR, "mobile-390-404.png") });
  });
});
