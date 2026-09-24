import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// PA-07 / PA-17E: método semántico y ausencia de la comparativa retirada.
// Conserva orden, teclado, no-JS, responsive y límites de claims.
// Las capturas requieren inspección visual; no equivalen a aprobación.
const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17F/capturas");
mkdirSync(OUT_DIR, { recursive: true });

// Patrones prohibidos: métricas/resultados/garantías y absolutos sobre
// terceros heredados de la guía histórica (GUIA_WEB.md NO es publicable).
const CLAIMS =
  /rentabilidad|blindad|mitigaci.n total|a.os operativ|garantiz|m.xima rentabilidad|estabilidad econ.mica a largo plazo|marcas en proceso de crecimiento|desalojo|morosos/i;

const PASOS_ESPERADOS = [
  "Cuéntanos qué buscas",
  "Conversemos sobre el local",
  "Aclaremos las condiciones",
  "Definamos el siguiente paso",
];

test.describe("PA-07 · Método y comparación semánticos", () => {
  test("método — 4 pasos visibles en orden 1→2→3→4", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const section = page.locator("#metodo");
    await expect(section).toBeVisible();
    const pasos = section.locator("ol.metodo__grid > li");
    await expect(pasos).toHaveCount(4);
    const titulos = await section.locator("ol.metodo__grid > li h3").allInnerTexts();
    expect(titulos).toEqual(PASOS_ESPERADOS);
    // Cada paso agrupa número visual + título + cuerpo, en ese orden.
    const estructura = await pasos.evaluateAll((els) =>
      els.map((li) => ({
        numero: li.querySelector(".paso__numero") !== null,
        titulo: li.querySelector("h3.paso__titulo") !== null,
        cuerpo: li.querySelector("p.paso__cuerpo") !== null,
        orden:
          li.querySelector(".paso__numero") !== null &&
          li.querySelector("h3.paso__titulo") !== null &&
          li.querySelector("p.paso__cuerpo") !== null
            ? [
                li
                  .querySelector(".paso__numero")!
                  .compareDocumentPosition(li.querySelector("h3.paso__titulo")!) &
                Node.DOCUMENT_POSITION_FOLLOWING
                  ? "numero-antes-titulo"
                  : "mal",
                li
                  .querySelector("h3.paso__titulo")!
                  .compareDocumentPosition(li.querySelector("p.paso__cuerpo")!) &
                Node.DOCUMENT_POSITION_FOLLOWING
                  ? "titulo-antes-cuerpo"
                  : "mal",
              ]
            : [],
      })),
    );
    for (const e of estructura) {
      expect(e.numero).toBe(true);
      expect(e.titulo).toBe(true);
      expect(e.cuerpo).toBe(true);
      expect(e.orden).toEqual(["numero-antes-titulo", "titulo-antes-cuerpo"]);
    }
  });

  test("método — semántica: sección etiquetada, lista ordenada nativa, números decorativos", async ({
    page,
  }) => {
    await page.goto("/");
    const section = page.locator("#metodo");
    await expect(section).toHaveAttribute("aria-labelledby", "metodo-titulo");
    const ol = section.locator("ol.metodo__grid");
    await expect(ol).toHaveCount(1);
    // role="list" explícito: .metodo__grid usa list-style:none y sin el
    // role Safari/VoiceOver puede perder la semántica de lista.
    expect(await ol.getAttribute("role")).toBe("list");
    // Los números visuales no duplican la numeración del lector.
    const ocultos = await section
      .locator(".paso__numero")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-hidden")));
    expect(ocultos).toEqual(["true", "true", "true", "true"]);
    // Un h3 por paso, colgando del h2 de la sección.
    await expect(section.locator("ol.metodo__grid > li h3")).toHaveCount(4);
    const jerarquia = await page.evaluate(() => {
      const h2 = document.querySelector("#metodo-titulo");
      const h3 = document.querySelector("#metodo h3");
      if (!h2 || !h3 || !(h2 instanceof HTMLHeadingElement) || !(h3 instanceof HTMLHeadingElement))
        return null;
      return { h2: h2.tagName, h3: h3.tagName, orden: h2.compareDocumentPosition(h3) };
    });
    expect(jerarquia?.h2).toBe("H2");
    expect(jerarquia?.h3).toBe("H3");
  });

  test("método — móvil 390: una columna en orden 1→4 sin overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    const boxes = await page.locator("#metodo ol.metodo__grid > li").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left };
      }),
    );
    expect(boxes).toHaveLength(4);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.top).toBeGreaterThan(boxes[i - 1]!.top);
      expect(Math.abs(boxes[i]!.left - boxes[0]!.left)).toBeLessThan(2);
    }
    const titulos = await page.locator("#metodo ol.metodo__grid > li h3").allInnerTexts();
    expect(titulos).toEqual(PASOS_ESPERADOS);
  });

  for (const width of [390, 1440]) {
    test(`comparativa retirada — ausente a ${width}px y sin enlaces huérfanos`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(
        page.locator("#comparativa, .comparativa__cards, table.comparativa"),
      ).toHaveCount(0);
      await expect(page.locator('a[href$="#comparativa"]')).toHaveCount(0);
    });
  }

  test("móvil 320 — método sin desborde y comparativa ausente de página", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    await expect(page.locator("#metodo")).toBeVisible();
    await expect(page.locator("#comparativa")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });

  test("teclado — sin trampas ni tabindex positivos; el flujograma recibe foco y permite salir", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const positivos = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[tabindex]"))
        .map((el) => el.getAttribute("tabindex"))
        .filter((v) => v !== null && Number(v) > 0),
    );
    expect(positivos).toEqual([]);
    // Método contiene solo el enlace de ampliación de la ilustración
    // (PA-17B: <a> simple al PNG, sin tabindex positivo ni trampa).
    expect(await page.locator("#metodo a, #metodo button").count()).toBe(1);
    expect(await page.locator("#metodo figure a").getAttribute("href")).toBe(
      "/images/espacios-comerciales.png",
    );
    expect(await page.locator(".comparativa__cards a, .comparativa__cards button").count()).toBe(0);
    // Tabulando desde el inicio se alcanza la transcripción nativa y se sale
    // de ella sin quedar atrapado (se llega al pie).
    let vioRegion = false;
    let llegoAlPie = false;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const estado = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return "otro";
        if (el.matches(".flujograma__texto summary")) return "region";
        if (el.closest("footer.site-footer")) return "pie";
        return "otro";
      });
      if (estado === "region") vioRegion = true;
      if (estado === "pie" && vioRegion) {
        llegoAlPie = true;
        break;
      }
    }
    expect(vioRegion).toBe(true);
    expect(llegoAlPie).toBe(true);
  });

  test("copy — método sin claims y comparativa retirada", async ({ page }) => {
    await page.goto("/");
    const metodo = await page.locator("#metodo").innerText();
    expect(metodo).not.toMatch(CLAIMS);
    // El método se presenta como conversación, no como algoritmo/resultado.
    expect(metodo).toMatch(/no (es|es una calculadora)|conversaci.n/i);
    await expect(page.locator("#comparativa")).toHaveCount(0);
  });

  test.describe("sin JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("método completo y comparativa ausente sin JS", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      // Método: 4 pasos en orden, sin JS.
      await expect(page.locator("#metodo ol.metodo__grid > li")).toHaveCount(4);
      expect(await page.locator("#metodo ol.metodo__grid > li h3").allInnerTexts()).toEqual(
        PASOS_ESPERADOS,
      );
      await expect(page.locator("#comparativa")).toHaveCount(0);
    });

    test("móvil 390 sin JS — método legible y comparativa ausente", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await expect(page.locator("#metodo ol.metodo__grid > li")).toHaveCount(4);
      await expect(page.locator("#comparativa")).toHaveCount(0);
    });
  });

  test("capturas PA-17F — método en desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#metodo")).toBeVisible();
    await page.locator("#metodo").screenshot({
      path: resolve(OUT_DIR, "desktop-1440-metodo.png"),
    });
  });

  test("capturas PA-17F — método en móvil", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#metodo")).toBeVisible();
    await page.locator("#metodo").screenshot({
      path: resolve(OUT_DIR, "mobile-390-metodo.png"),
    });
  });
});
