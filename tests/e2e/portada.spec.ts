import { test, expect } from "@playwright/test";

// PA-02: smoke mínimo sobre el sitio compilado (apps/puerta-abierta/dist).
// Esta prueba es deliberadamente simple: NO es el catálogo completo
// de E2E del sitio comercial (eso entra en PA-03+). Aquí sólo se
// demuestra que:
//   1) el servidor estático levanta la salida compilada, y
//   2) la portada responde con título y <h1> coherentes.

test("portada del sitio estático responde con título y h1", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Puerta Abierta/);
  const h1 = page.locator("h1").first();
  await expect(h1).toBeVisible();
  await expect(h1).toContainText("Locales comerciales en arriendo");
});

test("la portada no carga scripts remotos", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) {
      requests.push(url);
    }
  });
  await page.goto("/");
  // Sin red remota: ni CDN, ni fonts.googleapis, ni analytics.
  expect(requests).toEqual([]);
});
