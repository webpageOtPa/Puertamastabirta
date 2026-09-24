import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-17I — página de cobertura estática con selección bidireccional.
const CAPTURAS = resolve(process.cwd(), "docs/implementacion/PA-17I/capturas");
const STATIC_ROUTE = resolve(
  process.cwd(),
  "apps/puerta-abierta/dist/mapa-de-cobertura/index.html",
);
mkdirSync(CAPTURAS, { recursive: true });

const CIUDADES = [
  { id: "bogota", nombre: "Bogotá D.C.", grupo: "Zona Centro y Sur" },
  { id: "ibague", nombre: "Ibagué", grupo: "Zona Centro y Sur" },
  { id: "cali", nombre: "Cali", grupo: "Zona Centro y Sur" },
  {
    id: "medellin",
    nombre: "Medellín",
    grupo: "Zona Eje Cafetero y Antioquia",
  },
  {
    id: "manizales",
    nombre: "Manizales",
    grupo: "Zona Eje Cafetero y Antioquia",
  },
  {
    id: "pereira",
    nombre: "Pereira",
    grupo: "Zona Eje Cafetero y Antioquia",
  },
  { id: "cartagena", nombre: "Cartagena", grupo: "Zona Norte y Caribe" },
  { id: "barranquilla", nombre: "Barranquilla", grupo: "Zona Norte y Caribe" },
  { id: "santa-marta", nombre: "Santa Marta", grupo: "Zona Norte y Caribe" },
  { id: "monteria", nombre: "Montería", grupo: "Zona Norte y Caribe" },
  { id: "sincelejo", nombre: "Sincelejo", grupo: "Zona Norte y Caribe" },
  { id: "valledupar", nombre: "Valledupar", grupo: "Zona Norte y Caribe" },
  { id: "cucuta", nombre: "Cúcuta", grupo: "Zona Oriente" },
] as const;

async function interactionEnabled(page: Page): Promise<boolean> {
  return (await page.locator("select[data-cobertura-selector]").count()) > 0;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
}

test.describe("PA-17I · vista estática ampliada", () => {
  test("el enlace de ubicaciones abre la ruta precompilada y permite volver", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    expect(existsSync(STATIC_ROUTE)).toBe(true);
    const homeMapWidth = await page
      .locator("#cobertura .cobertura__mapa")
      .evaluate((el) => el.getBoundingClientRect().width);

    const primary = page.getByRole("link", { name: "Consultar un arriendo" });
    await expect(primary).toHaveAttribute("href", "#contacto");
    const mapLink = page.locator("#cobertura").getByRole("link", { name: "Ver mapa ampliado" });
    await expect(mapLink).toHaveAttribute("href", "/mapa-de-cobertura/");
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/mapa-de-cobertura/") && response.request().isNavigationRequest(),
    );
    await mapLink.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    await expect(page).toHaveURL(/\/mapa-de-cobertura\/$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ciudades de referencia" }),
    ).toBeVisible();
    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    const expandedMapWidth = await page
      .locator("#cobertura .cobertura__mapa")
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(expandedMapWidth).toBeGreaterThan(homeMapWidth);

    const map = page.locator("svg.cobertura__diagrama");
    await expect(map).toHaveAttribute("role", "group");
    await expect(map.locator("#cobertura-svg-titulo")).toContainText("13 ciudades de referencia");
    await expect(map.locator("desc")).toContainText("aproximados");
    await expect(page.locator(".cobertura__mapa-nota")).toContainText("no indican oficinas");
    await expect(page.locator(".cobertura__mapa-nota")).toContainText("disponibilidad de locales");
    const backLink = page.getByRole("link", { name: "Volver a Ubicaciones" });
    await expect(backLink).toHaveAttribute("href", "/#cobertura");
    const homeResponsePromise = page.waitForResponse(
      (homeResponse) =>
        homeResponse.url().endsWith("/") && homeResponse.request().isNavigationRequest(),
    );
    await backLink.click();
    expect((await homeResponsePromise).status()).toBe(200);
    await expect(page).toHaveURL(/\/#cobertura$/);
    await expect(page.locator("#cobertura")).toBeVisible();
  });

  test("lista y selector resaltan el marcador; marcador selecciona lista y selector", async ({
    page,
  }) => {
    await page.goto("/mapa-de-cobertura/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");

    const select = page.locator("select[data-cobertura-selector]");
    const markers = page.locator("circle.cobertura-punto[data-cobertura-map-marker='true']");
    const buttons = page.locator("button[data-cobertura-city-button]");
    await expect(select).toBeVisible();
    await expect(buttons).toHaveCount(CIUDADES.length);
    await expect(markers).toHaveCount(CIUDADES.length);
    for (const city of CIUDADES) {
      const accessibleName = `${city.nombre} — ${city.grupo}`;
      const marker = page.locator(`circle.cobertura-punto[data-city-id='${city.id}']`);
      await expect(page.getByRole("button", { name: accessibleName, exact: true })).toHaveCount(1);
      await expect(marker).toHaveAttribute("aria-label", accessibleName);
      await expect(marker.locator("title")).toHaveText(accessibleName);
    }

    await select.selectOption("medellin");
    await expect(page.locator("#cobertura-ciudad-medellin")).toHaveClass(
      /cobertura__ciudad--activa/,
    );
    await expect(page.locator("circle.cobertura-punto[data-city-id='medellin']")).toHaveClass(
      /cobertura-punto--activo/,
    );
    await expect(page.locator("circle.cobertura-punto[data-city-id='medellin']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("[data-cobertura-status]")).toHaveText(
      "Medellín — Zona Eje Cafetero y Antioquia.",
    );

    await page.locator("button[data-cobertura-city-button][data-city-id='bogota']").click();
    await expect(select).toHaveValue("bogota");
    await expect(page.locator("#cobertura-ciudad-bogota")).toHaveClass(/cobertura__ciudad--activa/);
    await expect(page.locator("circle.cobertura-punto[data-city-id='bogota']")).toHaveClass(
      /cobertura-punto--activo/,
    );
    await expect(page.locator("circle.cobertura-punto[data-city-id='bogota']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("[data-cobertura-status]")).toHaveText(
      "Bogotá D.C. — Zona Centro y Sur.",
    );

    const cartagenaMarker = page.getByRole("button", {
      name: "Cartagena — Zona Norte y Caribe",
      exact: true,
    });
    await cartagenaMarker.click();
    await expect(select).toHaveValue("cartagena");
    await expect(page.locator("#cobertura-ciudad-cartagena")).toHaveClass(
      /cobertura__ciudad--activa/,
    );
    await expect(
      page.locator("button[data-cobertura-city-button][data-city-id='cartagena']"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(cartagenaMarker).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("circle.cobertura-punto[data-city-id='medellin']")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("[data-cobertura-status]")).toHaveText(
      "Cartagena — Zona Norte y Caribe.",
    );

    for (const cityId of ["manizales", "pereira"] as const) {
      const city = CIUDADES.find((candidate) => candidate.id === cityId);
      if (!city) throw new Error(`Falta el caso de ${cityId}`);
      const marker = page.locator(`circle.cobertura-punto[data-city-id='${cityId}']`);
      await marker.focus();
      await page.keyboard.press(cityId === "manizales" ? "Enter" : "Space");
      await expect(select).toHaveValue(cityId);
      await expect(page.locator(`#cobertura-ciudad-${cityId}`)).toHaveClass(
        /cobertura__ciudad--activa/,
      );
      await expect(marker).toHaveAttribute("aria-pressed", "true");
      expect(
        await marker.evaluate((element) => element.parentElement?.lastElementChild === element),
      ).toBe(true);
      await expect(
        page.locator(`button[data-cobertura-city-button][data-city-id='${cityId}']`),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("[data-cobertura-status]")).toHaveText(
        `${city.nombre} — ${city.grupo}.`,
      );
    }
  });

  test("los marcadores reciben foco de teclado y se activan con Espacio", async ({ page }) => {
    await page.goto("/mapa-de-cobertura/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");

    const select = page.locator("select[data-cobertura-selector]");
    const bogota = page.getByRole("button", {
      name: "Bogotá D.C. — Zona Centro y Sur",
      exact: true,
    });
    await select.focus();
    for (let i = 0; i < CIUDADES.length + 1; i += 1) await page.keyboard.press("Tab");
    await expect(bogota).toBeFocused();
    const focus = await bogota.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
      };
    });
    expect(focus.outlineStyle).not.toBe("none");
    expect(focus.outlineWidth).toBe("3px");
    expect(focus.outlineOffset).toBe("3px");

    await page.keyboard.press("Space");
    await expect(page.locator("select[data-cobertura-selector]")).toHaveValue("bogota");
    await expect(page.locator("#cobertura-ciudad-bogota")).toHaveClass(/cobertura__ciudad--activa/);
    await expect(page.locator("circle.cobertura-punto[data-city-id='bogota']")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("la ruta ampliada no solicita recursos externos", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http") && !url.startsWith("http://127.0.0.1")) {
        externalRequests.push(url);
      }
    });
    await page.goto("/");
    await page.locator("#cobertura").getByRole("link", { name: "Ver mapa ampliado" }).click();
    await expect(page.locator("#cobertura .cobertura__mapa")).toBeVisible();
    expect(externalRequests).toEqual([]);
  });

  test("reflujo y capturas del mapa ampliado en 1440, 390 y 320 px", async ({ page }) => {
    await page.goto("/mapa-de-cobertura/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/mapa-de-cobertura/");
      await page.evaluate(() => document.fonts.ready);
      await page.locator("select[data-cobertura-selector]").selectOption("cartagena");
      await expect(page.locator("circle.cobertura-punto[data-city-id='cartagena']")).toHaveClass(
        /cobertura-punto--activo/,
      );
      await expectNoHorizontalOverflow(page);
      await page.locator("#cobertura").screenshot({
        path: resolve(CAPTURAS, `mapa-${width}.png`),
      });
    }
  });

  test("perfil OFF conserva los nombres y omite controles de mapa y script", async ({ page }) => {
    await page.goto("/mapa-de-cobertura/");
    test.skip(await interactionEnabled(page), "build con interacción habilitada");

    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    for (const city of CIUDADES) {
      await expect(page.locator(`#cobertura-ciudad-${city.id}`)).toContainText(city.nombre);
    }
    await expect(page.locator("select[data-cobertura-selector]")).toHaveCount(0);
    await expect(page.locator("[data-cobertura-status]")).toHaveCount(0);
    await expect(page.locator("button[data-cobertura-city-button]")).toHaveCount(0);
    await expect(page.locator("circle.cobertura-punto[role='button']")).toHaveCount(0);
    await expect(page.locator("script[src*='coverage-interaction']")).toHaveCount(0);
    await expect(page.locator(".cobertura__mapa-nota")).toContainText(
      "no indican oficinas ni disponibilidad de locales",
    );
  });
});

test.describe("PA-17I · fallback sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("muestra mapa, nombres y regreso sin controles inertes", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const response = await page.goto("/mapa-de-cobertura/");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ciudades de referencia" }),
    ).toBeVisible();
    await expect(page.locator("svg.cobertura__diagrama")).toBeVisible();
    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    await expect(page.locator("select[data-cobertura-selector]")).toBeHidden();
    await expect(page.locator("button[data-cobertura-city-button]")).toHaveCount(0);
    await expect(page.locator("circle.cobertura-punto[role='button']")).toHaveCount(0);
    for (const city of CIUDADES) {
      await expect(page.locator(`#cobertura-ciudad-${city.id}`)).toContainText(city.nombre);
    }
    await expect(page.getByRole("link", { name: "Volver a Ubicaciones" })).toHaveAttribute(
      "href",
      "/#cobertura",
    );
    await expectNoHorizontalOverflow(page);
  });
});
