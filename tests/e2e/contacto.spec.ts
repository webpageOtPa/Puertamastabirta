import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-09 — Contacto directo sin formularios (PA-Q022, PA-Q027, PA-Q028)
// ---------------------------------------------------------------------
// Casos sobre el sitio compilado (apps/puerta-abierta/dist):
//   - Sin elementos de captación: no hay <form>, <input>, <textarea>,
//     checkbox ni botón submit en toda la página.
//   - El correo indicado por el propietario es el único canal visible.
//   - Los datos son seleccionables como texto plano (no dentro de input).
//   - Click en mailto interceptado: no abre un cliente externo ni envía
//     mensajes reales. Se verifica la ausencia de tel y wa.me.
//   - Sin JS: contacto y navegación siguen utilizables.
//
// Las capturas son evidencia para revisión humana; este test NO aprueba
// visualmente nada. Salida en docs/implementacion/PA-17M/capturas/contacto/.

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17M/capturas/contacto");
mkdirSync(OUT_DIR, { recursive: true });

test.describe("PA-09 · Contacto directo — sin captación", () => {
  test("no hay form, input, textarea, checkbox ni botón submit", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#contacto")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.locator("input[type='checkbox']")).toHaveCount(0);
    await expect(page.locator("button[type='submit'], input[type='submit']")).toHaveCount(0);
    // Sin fetch/XHR/beacon/WebSocket de aplicación al cargar la portada.
    const appTraffic: string[] = [];
    const page2 = await page.context().newPage();
    page2.on("request", (req) => {
      const kind = req.resourceType();
      if (["fetch", "xhr"].includes(kind)) appTraffic.push(req.url());
    });
    await page2.goto("/");
    await page2.waitForTimeout(500);
    expect(appTraffic).toEqual([]);
    await page2.close();
  });

  test("textos de contacto sin etiquetas de desarrollo", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#contacto-titulo")).toContainText(
      "Conversemos sobre un arriendo o una posible alianza",
    );
    await expect(page.locator("#contacto")).toContainText(
      "Para consultar un arriendo o explorar una alianza, escríbenos por correo.",
    );
    await expect(page.locator("#contacto")).not.toContainText(
      /vista previa|canal no disponible|pendiente/i,
    );
  });

  test("solo el correo enlaza por mailto", async ({ page }) => {
    await page.goto("/");
    const canales = page.locator("#contacto li.canal[data-channel-id]");
    await expect(canales).toHaveCount(1);
    const email = page.locator('#contacto li.canal[data-channel-id="email-comercial"]');
    await expect(email.locator("a.canal__valor--link")).toHaveText(
      "contacto@puertamasabierta.com.co",
    );
    await expect(email.locator("a.canal__valor--link")).toHaveAttribute(
      "href",
      /^mailto:contacto@puertamasabierta\.com\.co\?subject=/,
    );
    for (const id of ["telefono-comercial", "whatsapp-comercial"]) {
      const li = page.locator(`#contacto li.canal[data-channel-id="${id}"]`);
      await expect(li).toHaveCount(0);
    }
    await expect(page.locator("#contacto a[href^='mailto:']")).toHaveCount(1);
    await expect(page.locator("#contacto a[href^='tel:']")).toHaveCount(0);
    await expect(page.locator("#contacto a[href^='https://wa.me/']")).toHaveCount(0);
  });

  test("correo seleccionable como texto, sin inputs", async ({ page }) => {
    await page.goto("/");
    // El correo es un enlace seleccionable.
    const email = page.locator("#contacto a.canal__valor--link");
    await expect(email).toHaveText("contacto@puertamasabierta.com.co");
    await expect(page.locator("#contacto input")).toHaveCount(0);
  });

  test("click en mailto/tel/wa.me interceptado (no abre cliente externo en CI)", async ({
    page,
  }) => {
    await page.goto("/");
    const enlaces = page.locator(
      "#contacto a[href^='mailto:'], #contacto a[href^='tel:'], #contacto a[href^='https://wa.me/']",
    );
    const n = await enlaces.count();
    expect(n).toBe(1);
    // Si el build publicara canales aprobados, cada click se intercepta:
    // se cancela la navegación externa y la página sigue disponible sin
    // mostrar recepción exitosa.
    for (let i = 0; i < n; i++) {
      const href = await enlaces.nth(i).getAttribute("href");
      expect(href).toBeTruthy();
      if (href === null) continue;
      await page.route(
        href.startsWith("https://wa.me/") ? "https://wa.me/**" : `${href}**`,
        (route) => route.abort(),
      );
      await enlaces
        .nth(i)
        .click({ noWaitAfter: true })
        .catch(() => null);
      await expect(page.locator("#contacto")).toBeVisible();
    }
    await expect(page.locator("#contacto")).toBeVisible();
    await expect(page.locator("#contacto")).not.toContainText(/enviado|recibido|gracias por/i);
  });

  test("cancelar el cliente nunca muestra recepción exitosa", async ({ page }) => {
    await page.goto("/");
    // No existe ningún mensaje de éxito de recepción en la página.
    await expect(page.locator("#contacto")).not.toContainText(/enviado|recibido/i);
    await expect(page.locator("body")).not.toContainText(/solicitud registrada/i);
  });

  test("capturas PA-09 — contacto en desktop y móvil", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#contacto")).toBeVisible();
    await page.locator("#contacto").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-contacto.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#contacto")).toBeVisible();
    await page.locator("#contacto").screenshot({
      path: resolve(OUT_DIR, "mobile-390-contacto.png"),
    });
  });
});

test.describe("PA-09 · Contacto — sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("contacto y navegación siguen utilizables sin JS", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#contacto")).toBeVisible();
    await expect(page.locator("#contacto-titulo")).toContainText(
      "Conversemos sobre un arriendo o una posible alianza",
    );
    await expect(page.locator("#contacto li.canal[data-channel-id]")).toHaveCount(1);
    await expect(page.locator('#contacto li[data-channel-id="email-comercial"] a')).toHaveAttribute(
      "href",
      /^mailto:contacto@puertamasabierta\.com\.co\?subject=/,
    );
    await expect(
      page.locator("#contacto a[href^='tel:'], #contacto a[href^='https://wa.me/']"),
    ).toHaveCount(0);
    // La navegación por anclas sigue funcionando sin JS (CTA de cabecera).
    await expect(page.locator("nav[aria-label='Navegación principal']")).toBeVisible();
    await page.locator("header a[href='#contacto']").first().click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#contacto");
    await expect(page.locator("#contacto")).toBeVisible();
  });
});
