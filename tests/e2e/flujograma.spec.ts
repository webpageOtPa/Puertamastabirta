import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17L/capturas/flujograma");
mkdirSync(OUT_DIR, { recursive: true });
const IMAGE = "/images/flujograma-consecucion-locales.png";
const MOBILE_IMAGE = "/images/flujograma-780.webp";
const DESKTOP_IMAGE = "/images/flujograma-1222.webp";

// Cargar y decodificar también Método antes de fotografiar la portada.
// No se modifica loading ni el diseño: se recorre la página como el usuario.
async function esperarImagenes(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  for (const img of await page.locator("img").all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate((el) => (el as HTMLImageElement).decode());
  }
}

async function colocarBajoCabecera(page: Page, target: Locator): Promise<void> {
  await target.evaluate((el) => {
    const headerHeight =
      document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({
      top: window.scrollY + el.getBoundingClientRect().top - headerHeight - 24,
      behavior: "instant",
    });
  });
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const headerBottom =
          document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
        return el.getBoundingClientRect().top >= headerBottom + 16;
      }),
    )
    .toBe(true);
}

async function volverAlInicio(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}
const TITULOS = [
  "Definición de la estrategia de marketing",
  "Generación de visibilidad",
  "Atracción de propietarios",
  "Recepción y calificación inicial",
  "Contacto y visita técnica",
  "Análisis de viabilidad comercial",
  "Presentación de propuesta de vinculación",
  "Incorporación al portafolio",
  "Seguimiento y retroalimentación",
  "Local en portafolio listo para comercialización",
];

test.describe("PA-17F · Flujograma del proceso", () => {
  test("imagen original local íntegra, con espacio reservado y enlace de ampliación", async ({
    page,
    request,
  }) => {
    const response = await request.get(IMAGE);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(await response.body()).toEqual(readFileSync(resolve(process.cwd(), "Fkujograma.png")));
    await page.goto("/");
    const section = page.locator("#flujograma");
    await expect(section).toHaveAttribute("aria-labelledby", "flujograma-titulo");
    expect(
      await section.evaluate((el) => [el.previousElementSibling?.id, el.nextElementSibling?.id]),
    ).toEqual(["metodo", "cobertura"]);
    const img = section.locator("img");
    await expect(img).toHaveAttribute("width", "1222");
    await expect(img).toHaveAttribute("height", "1287");
    await expect(img).toHaveAttribute("loading", "lazy");
    await expect(img).toHaveAttribute("alt", /diez etapas.*revisión.*seguimiento/);
    await expect(
      section.getByRole("link", { name: "Ver flujograma a tamaño completo" }),
    ).toHaveAttribute("href", IMAGE);
    await expect(section.locator("figcaption")).toContainText("Esquema del proceso");
    await expect(section.locator('source[media="(max-width: 768px)"]')).toHaveAttribute(
      "srcset",
      MOBILE_IMAGE,
    );
    for (const asset of [MOBILE_IMAGE, DESKTOP_IMAGE]) {
      const derivative = await request.get(asset);
      expect(derivative.status()).toBe(200);
      expect(derivative.headers()["content-type"]).toContain("image/webp");
    }
  });

  test("transcripción ordenada, decisión y retorno operables por teclado sin servicios remotos", async ({
    page,
  }) => {
    const remote: string[] = [];
    const writes: string[] = [];
    page.on("request", (req) => {
      if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(req.url())) remote.push(req.url());
      if (!["GET", "HEAD"].includes(req.method())) writes.push(req.method());
    });
    await page.goto("/");
    const details = page.locator("#flujograma details");
    const summary = details.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    expect(await page.locator(".flujograma__pasos > li h3").allTextContents()).toEqual(TITULOS);
    await expect(page.locator(".flujograma__pasos")).toHaveAttribute("role", "list");
    await expect(
      page.locator(".flujograma__pasos > li:nth-child(9) .flujograma__decision"),
    ).toContainText("Sí: continuar al paso 10.");
    await expect(page.locator(".flujograma__decision")).toContainText(
      "No: Ajustar estrategia de marketing y reforzar acciones. Volver al paso 9",
    );
    await expect(details).toContainText("Landing pages y formularios de contacto");
    await expect(details).toContainText("Registro en nuestra base de datos");
    // Son términos transcritos del esquema, no formularios ni servicios de la web.
    await expect(
      page.locator("#flujograma form, #flujograma input, #flujograma textarea, #flujograma select"),
    ).toHaveCount(0);
    expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.keyboard.press("Space");
    await expect(details).not.toHaveAttribute("open");
    await page.keyboard.press("Tab");
    await expect(summary).not.toBeFocused();
    expect(remote).toEqual([]);
    expect(writes).toEqual([]);
  });

  for (const width of [320, 390, 1440]) {
    test(`imagen completa y texto sin desbordamiento a ${width}px; capturas`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const loadedImages: string[] = [];
      page.on("request", (req) => {
        if (req.resourceType() === "image") loadedImages.push(new URL(req.url()).pathname);
      });
      await page.goto("/");
      const section = page.locator("#flujograma");
      const img = section.locator("img");
      await esperarImagenes(page);
      const expectedSource = width <= 768 ? MOBILE_IMAGE : DESKTOP_IMAGE;
      expect(
        await img.evaluate((el) => new URL((el as HTMLImageElement).currentSrc).pathname),
      ).toBe(expectedSource);
      expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(
        width <= 768 ? 780 : 1222,
      );
      expect(loadedImages).toContain(expectedSource);
      expect(loadedImages).not.toContain(IMAGE);
      expect(loadedImages).not.toContain(width <= 768 ? DESKTOP_IMAGE : MOBILE_IMAGE);
      await colocarBajoCabecera(page, section);
      const size = await img.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const image = el as HTMLImageElement;
        return {
          ratio: r.width / r.height,
          naturalRatio: image.naturalWidth / image.naturalHeight,
          left: r.left,
          right: r.right,
          viewport: innerWidth,
        };
      });
      expect(size.ratio).toBeCloseTo(size.naturalRatio, 2);
      expect(size.left).toBeGreaterThanOrEqual(0);
      expect(size.right).toBeLessThanOrEqual(size.viewport);
      // Vista de sección desde el viewport: la cabecera sticky queda por encima.
      await page.screenshot({ path: resolve(OUT_DIR, `${width}-flujograma.png`) });
      await section.locator("summary").click();
      await expect(section.locator(".flujograma__pasos > li")).toHaveCount(10);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      const clipped = await section.locator(".flujograma__paso").evaluateAll((els) =>
        els.some((el) => {
          const r = el.getBoundingClientRect();
          return r.left < 0 || r.right > innerWidth || el.scrollWidth > el.clientWidth + 1;
        }),
      );
      expect(clipped).toBe(false);
      await colocarBajoCabecera(page, section.locator(".flujograma__texto"));
      await page.screenshot({ path: resolve(OUT_DIR, `${width}-transcripcion.png`) });
      await section.locator("summary").click();
      await volverAlInicio(page);
      await page.screenshot({ path: resolve(OUT_DIR, `${width}-home.png`), fullPage: true });
    });
  }

  test.describe("sin JavaScript", () => {
    test.use({ javaScriptEnabled: false, deviceScaleFactor: 2 });
    test("imagen y diez etapas con bifurcación siguen disponibles en móvil", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      const section = page.locator("#flujograma");
      await expect(section.locator("img")).toBeVisible();
      await section.locator("img").scrollIntoViewIfNeeded();
      await section.locator("img").evaluate((el) => (el as HTMLImageElement).decode());
      expect(
        await section
          .locator("img")
          .evaluate((el) => new URL((el as HTMLImageElement).currentSrc).pathname),
      ).toBe(MOBILE_IMAGE);
      await section.locator("summary").click();
      await expect(section.locator("details")).toHaveAttribute("open", "");
      expect(await section.locator(".flujograma__pasos > li h3").allTextContents()).toEqual(
        TITULOS,
      );
      await expect(section.locator(".flujograma__decision")).toContainText("Volver al paso 9");
      await expect(
        section.getByRole("link", { name: "Ver flujograma a tamaño completo" }),
      ).toHaveAttribute("href", IMAGE);
    });
  });
});
