#!/usr/bin/env node
/* global document */

// Smoke local del adjunto autocontenido; abre file:// y no usa red.
import assert from "node:assert/strict";
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const htmlPath = resolve(repoRoot, "preview-sitio-completo.html");
const capturesPath = resolve(repoRoot, "docs/implementacion/PA-17L/capturas/adjunto");
mkdirSync(capturesPath, { recursive: true });

const browser = await chromium.launch({ headless: true });
const externalRequests = [];
const runtimeErrors = [];

function track(page) {
  page.on("request", (request) => {
    if (request.url().startsWith("http://") || request.url().startsWith("https://")) {
      externalRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
}

function frame(page) {
  return page.frameLocator('iframe[title="Mapa ampliado con lista interactiva de ciudades"]');
}

async function assertNoHorizontalOverflow(page, label) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.client, `${label}: overflow exterior ${JSON.stringify(width)}`);

  const mapWidth = await frame(page)
    .locator("body")
    .evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
  assert.ok(
    mapWidth.scroll <= mapWidth.client,
    `${label}: overflow del mapa ${JSON.stringify(mapWidth)}`,
  );
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  track(page);
  await page.goto(pathToFileURL(htmlPath).href);
  assert.match(await page.title(), /^Puerta Abierta/);
  assert.equal(await page.locator("#cobertura li[data-city-id]").count(), 13);
  const email = page.locator('#contacto a[href^="mailto:"]');
  assert.equal(await email.textContent(), "contacto@puertamasabierta.com.co");
  assert.match(
    (await email.getAttribute("href")) ?? "",
    /^mailto:contacto@puertamasabierta\.com\.co\?subject=/,
  );
  await page.locator("img[src]").evaluateAll((images) =>
    Promise.all(
      images.map((image) => {
        image.loading = "eager";
        return image.decode();
      }),
    ),
  );
  assert.equal(await page.locator("img[src]").count(), 8);
  await page.screenshot({ path: resolve(capturesPath, "adjunto-inicio-1440.png") });
  await page
    .locator("#metodo")
    .screenshot({ path: resolve(capturesPath, "adjunto-metodo-1440.png") });
  await page
    .locator("#flujograma")
    .screenshot({ path: resolve(capturesPath, "adjunto-flujograma-1440.png") });

  await page.getByRole("link", { name: "Ver flujograma a tamaño completo" }).click();
  const imageDialog = page.locator("#email-preview-image-dialog");
  assert.equal(await imageDialog.evaluate((element) => element.open), true);
  assert.ok(await imageDialog.locator("img").evaluate((image) => image.naturalWidth >= 1000));
  await page.keyboard.press("Escape");
  assert.equal(await imageDialog.evaluate((element) => element.open), false);

  await page.getByRole("link", { name: "Ver mapa ampliado" }).click();
  assert.match(page.url(), /#mapa-ampliado$/);
  const desktopMap = frame(page);
  assert.equal(await desktopMap.locator("li[data-city-id].cobertura__ciudad").count(), 13);
  await desktopMap.locator("select[data-cobertura-selector]").selectOption("bogota");
  assert.equal(
    await desktopMap
      .locator('circle.cobertura-punto[data-city-id="bogota"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  await desktopMap.locator('button[data-cobertura-city-button][data-city-id="cali"]').click();
  assert.equal(await desktopMap.locator("select[data-cobertura-selector]").inputValue(), "cali");
  assert.equal(
    await desktopMap
      .locator('circle.cobertura-punto[data-city-id="cali"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  await desktopMap
    .locator("#cobertura")
    .screenshot({ path: resolve(capturesPath, "adjunto-mapa-1440.png") });
  await page.getByRole("link", { name: "Volver a Ubicaciones" }).click();
  assert.match(page.url(), /#cobertura$/);

  for (const width of [390, 320]) {
    const mobile = await browser.newPage({ viewport: { width, height: 844 } });
    track(mobile);
    await mobile.goto(pathToFileURL(htmlPath).href);
    await mobile.getByRole("link", { name: "Ver mapa ampliado" }).click();
    await assertNoHorizontalOverflow(mobile, `${width}px`);
    if (width === 390) {
      await frame(mobile)
        .locator("#cobertura")
        .screenshot({ path: resolve(capturesPath, "adjunto-mapa-390.png") });
    }
    await mobile.close();
  }

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const fallback = await noJs.newPage();
  track(fallback);
  await fallback.goto(pathToFileURL(htmlPath).href);
  await fallback.getByRole("link", { name: "Ver mapa ampliado" }).click();
  const staticMap = frame(fallback);
  assert.equal(await staticMap.locator("li[data-city-id].cobertura__ciudad").count(), 13);
  assert.equal(await staticMap.locator("select[data-cobertura-selector]").isHidden(), true);
  assert.equal(await staticMap.locator("button[data-cobertura-city-button]").count(), 0);
  assert.equal(await staticMap.locator("svg.cobertura__diagrama").count(), 1);
  await noJs.close();

  assert.deepEqual(externalRequests, []);
  assert.deepEqual(runtimeErrors, []);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        protocol: "file://",
        sizeBytes: statSync(htmlPath).size,
        decodedImages: 8,
        imageDialog: "PASS",
        mapCities: 13,
        mapListSelectorMarkerSync: "PASS",
        returnNavigation: "PASS",
        noJavaScriptFallback: "PASS",
        horizontalOverflow: { 390: false, 320: false },
        externalRequests: externalRequests.length,
        runtimeErrors: runtimeErrors.length,
        captures: [
          "adjunto-inicio-1440.png",
          "adjunto-metodo-1440.png",
          "adjunto-flujograma-1440.png",
          "adjunto-mapa-1440.png",
          "adjunto-mapa-390.png",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
