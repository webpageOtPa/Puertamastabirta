import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-17B — Ilustración conceptual de locales en Método
// ---------------------------------------------------------------------
// Casos sobre el sitio compilado (apps/puerta-abierta/dist):
//   - <figure> a ancho de contenedor tras la intro y antes del <ol>.
//   - <picture> con <source type="image/webp"> + srcset/sizes exactos;
//     <img> de respaldo con alt/width/height/loading/decoding.
//   - <figcaption> con el pie literal definido por el propietario.
//   - Enlace simple "Ver ilustración ampliada" al PNG (sin JS).
//   - Sin desbordamiento a 320/390/768/1440; variante correcta por
//     viewport (currentSrc); visible sin JS.

const ALT =
  "Ilustración conceptual en perspectiva de un edificio con locales comerciales y accesos peatonales. Incluye los rótulos: 50–300 m², alto potencial y flujo constante de personas.";
const CAPTION =
  "Ilustración conceptual generada con IA. No representa un inmueble disponible ni un plano técnico validado.";
const SRCSET =
  "/images/espacios-640.webp 640w, /images/espacios-960.webp 960w, /images/espacios-1280.webp 1280w";
const SIZES = "(max-width: 768px) 100vw, 1216px";
const PNG = "/images/espacios-comerciales.png";
const CAPTURE_DIR = resolve(process.cwd(), "docs/implementacion/PA-17L/capturas/ilustracion");
mkdirSync(CAPTURE_DIR, { recursive: true });

test.describe("PA-17B · Ilustración comercial en Método", () => {
  test("figure tras la intro y antes del ol, con picture/srcset/sizes/alt/pie literales", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const section = page.locator("#metodo");
    const figure = section.locator("figure.metodo__ilustracion");
    await expect(figure).toBeVisible();
    // Orden en el DOM: header (intro) → figure → ol.
    const orden = await page.evaluate(() => {
      const header = document.querySelector("#metodo header");
      const fig = document.querySelector("#metodo figure.metodo__ilustracion");
      const ol = document.querySelector("#metodo ol.metodo__grid");
      if (!header || !fig || !ol) return null;
      return {
        headerAntes: Boolean(
          header.compareDocumentPosition(fig) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        olDespues: Boolean(fig.compareDocumentPosition(ol) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });
    expect(orden).toEqual({ headerAntes: true, olDespues: true });
    await expect(section.locator(".metodo__intro")).toBeVisible();
    // <picture> con source webp + srcset/sizes exactos.
    const source = figure.locator("picture > source[type='image/webp']");
    await expect(source).toHaveCount(1);
    expect(await source.getAttribute("srcset")).toBe(SRCSET);
    expect(await source.getAttribute("sizes")).toBe(SIZES);
    // <img> de respaldo con alt/width/height/loading/decoding.
    const img = figure.locator("picture > img");
    await expect(img).toHaveAttribute("src", PNG);
    await expect(img).toHaveAttribute("alt", ALT);
    await expect(img).toHaveAttribute("width", "1280");
    await expect(img).toHaveAttribute("height", "720");
    await expect(img).toHaveAttribute("loading", "lazy");
    await expect(img).toHaveAttribute("decoding", "async");
    await img.evaluate((el) => (el as HTMLImageElement).decode());
    await figure.screenshot({ path: resolve(CAPTURE_DIR, "desktop-1440.png") });
    // Pie literal del propietario + enlace de ampliación.
    const caption = figure.locator("figcaption");
    await expect(caption).toContainText(CAPTION);
    const amplia = caption.locator("a");
    await expect(amplia).toHaveCount(1);
    await expect(amplia).toHaveAttribute("href", PNG);
    await expect(amplia).toHaveAttribute("target", "_blank");
    await expect(amplia).toHaveAttribute("rel", "noopener");
    expect((await amplia.innerText()).trim()).toBe("Ver ilustración ampliada");
  });

  test("el PNG de ampliación se sirve local (200, image/png)", async ({ page }) => {
    const res = await page.request.get(PNG);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/png/);
    expect((await res.body()).length).toBeGreaterThan(100_000);
  });

  test("viewport 390 · se sirve la variante 640", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const img = page.locator("#metodo figure.metodo__ilustracion img");
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector("#metodo figure.metodo__ilustracion img");
      return el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0;
    });
    const currentSrc = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
    expect(currentSrc).toMatch(/\/images\/espacios-640\.webp$/);
    await img.screenshot({ path: resolve(CAPTURE_DIR, "mobile-390.png") });
  });

  test("viewport 390 DPR 2 · se sirve la variante 960", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto("/");
    const img = page.locator("#metodo figure.metodo__ilustracion img");
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector("#metodo figure.metodo__ilustracion img");
      return el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0;
    });
    const currentSrc = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
    expect(currentSrc).toMatch(/\/images\/espacios-960\.webp$/);
    await context.close();
  });

  test("viewport 1440 · se sirve la variante 1280", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const img = page.locator("#metodo figure.metodo__ilustracion img");
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const el = document.querySelector("#metodo figure.metodo__ilustracion img");
      return el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0;
    });
    const currentSrc = await img.evaluate((el) => (el as HTMLImageElement).currentSrc);
    expect(currentSrc).toMatch(/\/images\/espacios-1280\.webp$/);
  });

  for (const width of [320, 390, 768, 1440]) {
    test(`sin desbordamiento a ${width}px (página y figura)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const figure = page.locator("#metodo figure.metodo__ilustracion");
      await expect(figure).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
      const rect = await figure.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.width).toBeLessThanOrEqual(width + 1);
      // La imagen conserva la proporción 1280×720 (sin distorsión).
      const ratio = await figure
        .locator("img")
        .evaluate((el) =>
          el instanceof HTMLImageElement && el.naturalHeight > 0
            ? el.naturalWidth / el.naturalHeight
            : 0,
        );
      expect(ratio).toBeGreaterThan(1.7);
      expect(ratio).toBeLessThan(1.85);
    });
  }

  test.describe("sin JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("la ilustración se ve sin JS (img nativa + pie + enlace simple)", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      const figure = page.locator("#metodo figure.metodo__ilustracion");
      await expect(figure).toBeVisible();
      const img = figure.locator("img");
      await img.scrollIntoViewIfNeeded();
      await expect(img).toBeVisible();
      const cargada = await img.evaluate(
        (el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
      );
      expect(cargada).toBe(true);
      await expect(figure.locator("figcaption")).toContainText(CAPTION);
      await expect(figure.locator("a")).toHaveAttribute("href", PNG);
    });
  });
});
