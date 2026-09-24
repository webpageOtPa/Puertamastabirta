import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-17G — regresiones de Cobertura y capturas viewport propias de esta tarea.
// No reutiliza la carpeta PA-17F.
const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17G/capturas");
mkdirSync(OUT_DIR, { recursive: true });

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
}

async function scrollMapBelowStickyHeader(page: Page): Promise<void> {
  await page.locator(".cobertura__mapa").evaluate((map) => {
    const top = window.scrollY + map.getBoundingClientRect().top - 112;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  });
  await page.evaluate(
    () => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())),
  );
}

test.describe("PA-17G · cobertura y aviso técnico", () => {
  test("el aviso técnico ocupa todo el ancho disponible en escritorio", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const width = await page
      .locator(".tech-preview")
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(width).toBe(1440);
  });

  test("Manizales y Pereira pasan al frente al seleccionarlas y conservan sus coordenadas", async ({
    page,
  }) => {
    await page.goto("/");
    const select = page.locator("select[data-cobertura-selector]");
    await expect(select).toBeVisible();
    const manizales = page.locator("circle.cobertura-punto[data-city-id='manizales']");
    const pereira = page.locator("circle.cobertura-punto[data-city-id='pereira']");
    const baseCoords = {
      manizales: {
        cx: await manizales.getAttribute("cx"),
        cy: await manizales.getAttribute("cy"),
      },
      pereira: {
        cx: await pereira.getAttribute("cx"),
        cy: await pereira.getAttribute("cy"),
      },
    };
    const pointOrder = () =>
      page
        .locator("svg.cobertura__diagrama circle.cobertura-punto[data-city-id]")
        .evaluateAll((points) => points.map((point) => point.getAttribute("data-city-id")));
    const originalPointOrder = await pointOrder();

    await select.selectOption("manizales");
    await expect(manizales).toHaveClass(/cobertura-punto--activo/);
    expect((await pointOrder()).at(-1)).toBe("manizales");
    await expect(manizales).toHaveAttribute("cx", baseCoords.manizales.cx ?? "");
    await expect(manizales).toHaveAttribute("cy", baseCoords.manizales.cy ?? "");
    await expect(pereira).not.toHaveClass(/cobertura-punto--activo/);

    await select.selectOption("pereira");
    await expect(pereira).toHaveClass(/cobertura-punto--activo/);
    expect((await pointOrder()).at(-1)).toBe("pereira");
    await expect(pereira).toHaveAttribute("cx", baseCoords.pereira.cx ?? "");
    await expect(pereira).toHaveAttribute("cy", baseCoords.pereira.cy ?? "");
    await expect(manizales).not.toHaveClass(/cobertura-punto--activo/);

    await select.selectOption("manizales");
    expect((await pointOrder()).at(-1)).toBe("manizales");
    await select.selectOption("");
    expect(await pointOrder()).toEqual(originalPointOrder);
    expect(await page.locator(".cobertura-punto--activo").count()).toBe(0);
  });

  test("el enlace abre la vista ampliada local y mantiene las notas de procedencia", async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http") && !url.startsWith("http://127.0.0.1")) {
        externalRequests.push(url);
      }
    });
    await page.goto("/");
    const note = page.locator(".cobertura__mapa-nota");
    await expect(note).toContainText("La lista textual es la fuente de verdad");
    await expect(note).toContainText("ubicaciones aproximadas");
    await expect(note).toContainText("no indican oficinas");
    await expect(note).toContainText("Natural Earth (dominio público)");

    const link = page.getByRole("link", { name: "Ver mapa ampliado" });
    await expect(link).toHaveAttribute("href", "/mapa-de-cobertura/");
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/mapa-de-cobertura/") && response.request().isNavigationRequest(),
    );
    await link.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ciudades de referencia" }),
    ).toBeVisible();
    await expect(page.locator("svg.cobertura__diagrama")).toHaveAttribute("role", "group");
    await expect(page.locator("svg.cobertura__diagrama #cobertura-svg-titulo")).toContainText(
      "13 ciudades de referencia",
    );
    await expect(page.locator("svg.cobertura__diagrama desc")).toContainText(
      "La lista textual es la fuente de verdad",
    );
    expect(externalRequests).toEqual([]);
  });

  test("teclado: resalta las ciudades superpuestas y enfoca el enlace con indicador visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#cobertura");
    const select = page.locator("select[data-cobertura-selector]");
    await select.focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press("ArrowDown");
    const manizales = page.locator("circle.cobertura-punto[data-city-id='manizales']");
    await expect(manizales).toHaveClass(/cobertura-punto--activo/);
    expect(
      (
        await page
          .locator("svg.cobertura__diagrama circle.cobertura-punto[data-city-id]")
          .evaluateAll((points) => points.map((point) => point.getAttribute("data-city-id")))
      ).at(-1),
    ).toBe("manizales");

    await page.keyboard.press("ArrowDown");
    const pereira = page.locator("circle.cobertura-punto[data-city-id='pereira']");
    await expect(pereira).toHaveClass(/cobertura-punto--activo/);
    const link = page.getByRole("link", { name: "Ver mapa ampliado" });
    for (let i = 0; i < 14; i += 1) await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    const focusIndicator = await link.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(focusIndicator).not.toBe("none");
  });

  test("sin recursos externos al cargar la portada y Cobertura", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http") && !url.startsWith("http://127.0.0.1")) {
        externalRequests.push(url);
      }
    });
    await page.goto("/");
    await page.locator("#cobertura").scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "Ver mapa ampliado" })).toBeVisible();
    expect(externalRequests).toEqual([]);
  });

  test("sin desbordamiento horizontal a 390 y 320 px", async ({ page }) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/#cobertura");
      await expect(page.getByRole("link", { name: "Ver mapa ampliado" })).toBeVisible();
      await expect(page.locator(".cobertura__mapa-nota")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("capturas viewport PA-17G: portada 1440 y mapa 390/320", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(OUT_DIR, "1440-home.png") });

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await scrollMapBelowStickyHeader(page);
      await expect(page.locator(".cobertura__mapa")).toBeInViewport();
      await page.screenshot({ path: resolve(OUT_DIR, `cobertura-${width}-viewport.png`) });
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe("PA-17G · Cobertura sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("conserva lista, nota y enlace local como contenido funcional", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    await expect(page.locator("svg.cobertura__diagrama circle.cobertura-punto")).toHaveCount(13);
    await expect(page.locator(".cobertura__mapa-nota")).toContainText(
      "La lista textual es la fuente de verdad",
    );
    const link = page.getByRole("link", { name: "Ver mapa ampliado" });
    await expect(link).toHaveAttribute("href", "/mapa-de-cobertura/");
    await expect(page.locator("select[data-cobertura-selector]")).toBeHidden();
    const routePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/mapa-de-cobertura/") && response.request().isNavigationRequest(),
    );
    await link.click();
    const routeResponse = await routePromise;
    expect(routeResponse.status()).toBe(200);
    expect(routeResponse.headers()["content-type"]).toContain("text/html");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ciudades de referencia" }),
    ).toBeVisible();
    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    await expect(page.locator("button[data-cobertura-city-button]")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
