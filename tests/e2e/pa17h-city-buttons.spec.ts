import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-17H — botones progresivos por ciudad; conserva el HTML de texto sin JS.
const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17H/capturas");
mkdirSync(OUT_DIR, { recursive: true });

const CITIES = [
  { id: "bogota", name: "Bogotá D.C.", group: "Zona Centro y Sur" },
  { id: "ibague", name: "Ibagué", group: "Zona Centro y Sur" },
  { id: "cali", name: "Cali", group: "Zona Centro y Sur" },
  {
    id: "medellin",
    name: "Medellín",
    group: "Zona Eje Cafetero y Antioquia",
  },
  {
    id: "manizales",
    name: "Manizales",
    group: "Zona Eje Cafetero y Antioquia",
  },
  {
    id: "pereira",
    name: "Pereira",
    group: "Zona Eje Cafetero y Antioquia",
  },
  { id: "cartagena", name: "Cartagena", group: "Zona Norte y Caribe" },
  {
    id: "barranquilla",
    name: "Barranquilla",
    group: "Zona Norte y Caribe",
  },
  {
    id: "santa-marta",
    name: "Santa Marta",
    group: "Zona Norte y Caribe",
  },
  { id: "monteria", name: "Montería", group: "Zona Norte y Caribe" },
  { id: "sincelejo", name: "Sincelejo", group: "Zona Norte y Caribe" },
  { id: "valledupar", name: "Valledupar", group: "Zona Norte y Caribe" },
  { id: "cucuta", name: "Cúcuta", group: "Zona Oriente" },
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
}

async function interactionEnabled(page: Page): Promise<boolean> {
  return (await page.locator("select[data-cobertura-selector]").count()) > 0;
}

test.describe("PA-17H · botones de ciudad y sincronización", () => {
  test("cada botón actualiza selector, lista, punto, aria-pressed y estado", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");

    const select = page.locator("select[data-cobertura-selector]");
    const buttons = page.locator("button[data-cobertura-city-button]");
    await expect(buttons).toHaveCount(CITIES.length);

    for (const city of CITIES) {
      const button = page.locator(`button[data-cobertura-city-button][data-city-id="${city.id}"]`);
      const item = page.locator(`#cobertura-ciudad-${city.id}`);
      const point = page.locator(`circle.cobertura-punto[data-city-id="${city.id}"]`);

      await expect(button).toHaveAccessibleName(city.name);
      await expect(button).toHaveAttribute("type", "button");
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await button.click();

      await expect(select).toHaveValue(city.id);
      await expect(item).toHaveClass(/cobertura__ciudad--activa/);
      await expect(point).toHaveClass(/cobertura-punto--activo/);
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("[data-cobertura-city-button][aria-pressed='true']")).toHaveCount(
        1,
      );
      await expect(page.locator(".cobertura__ciudad--activa")).toHaveCount(1);
      await expect(page.locator(".cobertura-punto--activo")).toHaveCount(1);
      await expect(page.locator("[data-cobertura-status]")).toHaveText(
        `${city.name} — ${city.group}.`,
      );
    }
  });

  test("elegir desde el selector actualiza el botón y su estado accesible", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");

    const select = page.locator("select[data-cobertura-selector]");
    const button = page.locator("button[data-cobertura-city-button][data-city-id='cartagena']");
    await select.selectOption("cartagena");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#cobertura-ciudad-cartagena")).toHaveClass(
      /cobertura__ciudad--activa/,
    );
    await expect(page.locator("circle.cobertura-punto[data-city-id='cartagena']")).toHaveClass(
      /cobertura-punto--activo/,
    );
    await expect(page.locator("[data-cobertura-status]")).toHaveText(
      "Cartagena — Zona Norte y Caribe.",
    );
    await expect(page.locator("[data-cobertura-city-button][aria-pressed='true']")).toHaveCount(1);
  });

  test("teclado nativo activa el primer botón con foco visible", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");

    const select = page.locator("select[data-cobertura-selector]");
    const firstButton = page.locator("button[data-cobertura-city-button][data-city-id='bogota']");
    await select.focus();
    await page.keyboard.press("Tab");
    await expect(firstButton).toBeFocused();
    const focus = await firstButton.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset };
    });
    expect(focus.style).not.toBe("none");
    expect(focus.width).toBe("3px");
    expect(focus.offset).toBe("2px");

    await page.keyboard.press("Space");
    await expect(page.locator("select[data-cobertura-selector]")).toHaveValue("bogota");
    await expect(firstButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-cobertura-status]")).toHaveText(
      "Bogotá D.C. — Zona Centro y Sur.",
    );
  });

  test("lista y botones no desbordan a 390 y 320 px", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/#cobertura");
      await expect(page.locator("button[data-cobertura-city-button]")).toHaveCount(13);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("no carga recursos externos", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http") && !url.startsWith("http://127.0.0.1")) {
        externalRequests.push(url);
      }
    });
    await page.goto("/");
    await page.locator("#cobertura").scrollIntoViewIfNeeded();
    await expect(page.locator("button[data-cobertura-city-button]")).toHaveCount(
      (await interactionEnabled(page)) ? CITIES.length : 0,
    );
    expect(externalRequests).toEqual([]);
  });

  test("capturas PA-17H en 1440, 390 y 320 px", async ({ page }) => {
    await page.goto("/");
    test.skip(!(await interactionEnabled(page)), "build con interacción deshabilitada");

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/#cobertura");
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("button", { name: "Cartagena", exact: true }).click();
      await expect(page.locator("[data-cobertura-status]")).toContainText("Cartagena");
      await expectNoHorizontalOverflow(page);
      await page.locator("#cobertura").screenshot({
        path: resolve(OUT_DIR, `cobertura-${width}.png`),
      });
    }
  });

  test("perfil de interacción OFF no publica botones ni controles inertes", async ({ page }) => {
    await page.goto("/");
    test.skip(await interactionEnabled(page), "build con interacción habilitada");

    await expect(page.locator("li[data-city-id].cobertura__ciudad")).toHaveCount(13);
    for (const city of CITIES) {
      await expect(page.locator(`#cobertura-ciudad-${city.id}`)).toContainText(city.name);
    }
    await expect(page.locator("button[data-cobertura-city-button]")).toHaveCount(0);
    await expect(page.locator("select[data-cobertura-selector]")).toHaveCount(0);
    await expect(page.locator("[data-cobertura-status]")).toHaveCount(0);
    await expect(page.locator("script[src*='coverage-interaction']")).toHaveCount(0);
    await expect(page.locator("circle.cobertura-punto[data-city-id]")).toHaveCount(13);
  });
});

test.describe("PA-17H · respaldo sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("13 nombres siguen visibles como texto y no se publican botones", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    const items = page.locator("li[data-city-id].cobertura__ciudad");
    await expect(items).toHaveCount(CITIES.length);
    await expect(page.locator("button[data-cobertura-city-button]")).toHaveCount(0);
    for (const city of CITIES) {
      await expect(page.locator(`#cobertura-ciudad-${city.id}`)).toContainText(city.name);
    }
    await expectNoHorizontalOverflow(page);
  });
});
