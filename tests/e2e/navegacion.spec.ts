import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-05 — Shell, menú y navegación accesible
// ---------------------------------------------------------------------
// Casos de teclado y landmarks sobre el sitio compilado
// (apps/puerta-abierta/dist). No aprueban visualmente nada: las dos
// capturas son evidencia para revisión humana en
// docs/implementacion/PA-17F/capturas/pa-05/.
//
// El menú móvil es `<details>/<summary>` nativo (funciona sin JS); el
// script de Header.astro es mejora progresiva (Escape, foco lógico y
// `aria-expanded`). Estos casos verifican el comportamiento CON JS; la
// ruta sin JS se conserva por construcción (sin `open` por defecto y
// sin control dependiente de JS).

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17F/capturas/pa-05");
mkdirSync(OUT_DIR, { recursive: true });

test.describe("PA-05 · Shell, menú y navegación accesible", () => {
  test("landmarks, un solo main, un solo h1 y pie sin enlace de privacidad (retirada 2026-09-18)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("header.site-header")).toHaveCount(1);
    await expect(page.locator("nav[aria-label='Navegación principal']")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("main#main")).toHaveCount(1);
    await expect(page.locator("footer.site-footer")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    // Jerarquía: el h1 precede al primer h2 de la página.
    const order = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const h2 = document.querySelector("h2");
      if (!h1 || !h2) return null;
      return h1.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING ? "h1-first" : "bad";
    });
    expect(order).toBe("h1-first");
    // Pie: sin enlace de privacidad (página /privacidad/ retirada por
    // decisión del propietario 2026-09-18: no rehacer sin instrucción
    // expresa) + nota sin el texto antiguo de "placeholders sin licencias".
    expect(await page.locator("footer a[href='/privacidad']").count()).toBe(0);
    expect(await page.locator("footer a[href='/privacidad/']").count()).toBe(0);
    const nota = await page.locator(".site-footer__nota").innerText();
    expect(nota).toMatch(/Vista previa técnica en revisión/i);
    expect(nota).toMatch(/No habilitada para publicación/i);
    expect(nota).not.toMatch(/sin licencias de marca/i);
  });

  test("no hay tabindex positivos en la página", async ({ page }) => {
    await page.goto("/");
    const positivos = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[tabindex]"))
        .map((el) => el.getAttribute("tabindex"))
        .filter((v) => v !== null && Number(v) > 0),
    );
    expect(positivos).toEqual([]);
  });

  test("desktop — skip-link visible al tabular y salta a #main", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    // Primer Tab desde el cuerpo: el foco cae en el skip-link.
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLAnchorElement)) return null;
      const r = el.getBoundingClientRect();
      return { href: el.getAttribute("href"), x: r.x, y: r.y, w: r.width, h: r.height };
    });
    expect(focused).not.toBeNull();
    expect(focused!.href).toBe("#main");
    // Visible en el viewport (el CSS lo saca de -9999px sólo con :focus).
    expect(focused!.x).toBeGreaterThanOrEqual(0);
    expect(focused!.y).toBeGreaterThanOrEqual(0);
    expect(focused!.w).toBeGreaterThan(0);
    await page.locator(".skip-link:focus").screenshot({
      path: resolve(OUT_DIR, "desktop-skip-link-focus.png"),
    });
    // Activarlo lleva el hash y el foco al contenido principal.
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#main");
    const mainFocused = await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.tagName,
    );
    expect(mainFocused).toBe("MAIN");
  });

  test("desktop — orden de tabulación: skip-link → logo → 3 anclas → CTA", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const hrefs: Array<string | null> = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      hrefs.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el instanceof HTMLAnchorElement ? el.getAttribute("href") : (el?.tagName ?? null);
        }),
      );
    }
    expect(hrefs).toEqual([
      "#main", // skip-link
      "/", // logo
      "#ventajas",
      "#metodo",
      "#cobertura",
      "#contacto", // CTA de la cabecera
    ]);
  });

  test("móvil 390 — menú se abre con Enter, foco al primer enlace; Escape cierra y devuelve el foco", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const details = page.locator(".site-header__nav-details");
    const summary = details.locator("summary");
    await expect(summary).toBeVisible();
    // Estado inicial cerrado con `aria-expanded=false` y control declarado.
    await expect(details).not.toHaveAttribute("open", "");
    await expect(summary).toHaveAttribute("aria-expanded", "false");
    await expect(summary).toHaveAttribute("aria-controls", "navegacion-principal");
    // Abrir con Enter: el foco va al primer enlace del menú.
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(summary).toHaveAttribute("aria-expanded", "true");
    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
    });
    expect(firstFocused).toBe("#ventajas");
    await page.screenshot({
      path: resolve(OUT_DIR, "mobile-390-menu-abierto.png"),
    });
    // Cerrar con Escape: el foco vuelve al toggle.
    await page.keyboard.press("Escape");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(summary).toHaveAttribute("aria-expanded", "false");
    const backOnToggle = await page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLElement ? el.className : null;
    });
    expect(backOnToggle).toContain("site-header__toggle");
  });

  test("móvil 390 — menú se abre con Espacio en el toggle", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const details = page.locator(".site-header__nav-details");
    const summary = details.locator("summary");
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(details).toHaveAttribute("open", "");
    await expect(summary).toHaveAttribute("aria-expanded", "true");
    // Limpieza: cerrar con Escape para no dejar el menú abierto.
    await page.keyboard.press("Escape");
    await expect(details).not.toHaveAttribute("open", "");
  });

  test("móvil 390 — con el menú cerrado sus enlaces no reciben foco", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const details = page.locator(".site-header__nav-details");
    const summary = details.locator("summary");
    if ((await details.getAttribute("open")) !== null) {
      await summary.focus();
      await page.keyboard.press("Escape");
    }
    await expect(details).not.toHaveAttribute("open", "");
    // Desde el toggle, el siguiente Tab salta al CTA sin pasar por los
    // enlaces ocultos del menú cerrado.
    await summary.focus();
    await page.keyboard.press("Tab");
    const next = await page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLAnchorElement ? el.getAttribute("href") : (el?.tagName ?? null);
    });
    expect(next).toBe("#contacto");
  });

  test("móvil 320 — cabecera y menú sin overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    const noOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      );
    await expect.poll(noOverflow).toBe(true);
    const details = page.locator(".site-header__nav-details");
    const summary = details.locator("summary");
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(page.locator(".site-header__list").first()).toBeVisible();
    expect(await noOverflow()).toBe(true);
  });
});
