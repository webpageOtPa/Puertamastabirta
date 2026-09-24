import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// PA-12 — Accesibilidad y regresión visual integrales
// ---------------------------------------------------------------------
// Recorridos completos sobre el sitio compilado
// (apps/puerta-abierta/dist, perfil technical): `/` y
// la 404, en desktop 1440 / móvil 390 / móvil 320.
// Página /privacidad/ retirada por decisión del propietario (2026-09-18):
// no rehacer sin instrucción expresa.
//
// Esta suite VERIFICA y GENERA EVIDENCIA; no aprueba visualmente nada:
// las capturas de docs/implementacion/PA-17F/capturas/pa-12/ quedan pendientes
// de revisión humana (el propietario conserva la puerta de aprobación
// visual, PA-Q008). Los defectos verificables se corrigen de forma
// mínima y separada; las preferencias de diseño quedan ABIERTAS.
//
// Decisión axe (encargo §3): `axe-playwright` NO es dependencia del
// proyecto (ver package.json) y no se añade una dependencia nueva para
// esta unidad. En su lugar: checks manuales de landmarks, nombres
// accesibles y atributos aria-* con `getByRole` + asserts, que cubren
// la ficha (ACCESIBILIDAD.md). axe complementa y no acredita
// conformidad: registrado como limitación en EVIDENCIA.md.

const OUT_DIR = resolve(process.cwd(), "docs/implementacion/PA-17F/capturas/pa-12");
mkdirSync(OUT_DIR, { recursive: true });

const PAGINAS = [
  { ruta: "/", nombre: "portada" },
  { ruta: "/ruta-que-no-existe-xyz/", nombre: "404" },
] as const;

// Blanco/tinta/superficie usados por el banner `.tech-preview`:
// par ya medido en `contrast:strict`.
const RGB = {
  ink: "rgb(13, 44, 84)", // #0D2C54
  muted: "rgb(75, 85, 99)", // #4B5563
  surface: "rgb(244, 246, 249)", // #F4F6F9
};

// Foco visible: el CSS usa `box-shadow` en `:focus-visible` para
// enlaces/botones (y outline UA para summary/select). Un indicador es
// visible si hay sombra o contorno no nulo.
async function indicadorFocoVisible(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return "sin-elemento";
    const cs = getComputedStyle(el);
    const partes: string[] = [];
    partes.push(`tag=${el.tagName}`);
    partes.push(`outline=${cs.outlineStyle}/${cs.outlineWidth}`);
    partes.push(`boxShadow=${cs.boxShadow === "none" ? "none" : "presente"}`);
    return partes.join(" ");
  });
}

// Huella de identidad del foco (para detectar trampas de teclado): no
// sirve el estilo computado porque muchos elementos comparten el mismo.
async function huellaFoco(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return "sin-elemento";
    const texto = (el.innerText ?? "").replace(/\s+/g, " ").slice(0, 30);
    const href = el instanceof HTMLAnchorElement ? el.getAttribute("href") : "";
    return `${el.tagName}#${el.id}.${el.className}|href=${href}|${texto}`;
  });
}

async function tieneFocoVisible(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    const cs = getComputedStyle(el);
    const outlineOk = cs.outlineStyle !== "none" && cs.outlineWidth !== "0px";
    const shadowOk = cs.boxShadow !== "none";
    return outlineOk || shadowOk;
  });
}

test.describe("PA-12 · Landmarks, jerarquía e idioma (las 3 páginas)", () => {
  for (const { ruta, nombre } of PAGINAS) {
    test(`${nombre} — header/nav/main/footer, un H1, jerarquía e idioma`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(ruta);
      // Landmarks por rol (nombres accesibles donde la ficha los exige).
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      // Idioma declarado.
      expect(await page.locator("html").getAttribute("lang")).toBe("es-co");
      // Un solo H1 con texto real.
      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      expect(((await h1.first().innerText()) ?? "").trim().length).toBeGreaterThan(0);
      // Jerarquía coherente: sin saltos de nivel (h1→h3 directo, etc.).
      const saltos = await page.evaluate(() => {
        const niveles = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((el) =>
          Number(el.tagName.slice(1)),
        );
        const mal: string[] = [];
        for (let i = 1; i < niveles.length; i++) {
          if (niveles[i]! > niveles[i - 1]! + 1) mal.push(`${niveles[i - 1]}→${niveles[i]}`);
        }
        return { niveles, mal };
      });
      expect(saltos.mal).toEqual([]);
      // Sin tabindex positivos en toda la página.
      const positivos = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[tabindex]"))
          .map((el) => el.getAttribute("tabindex"))
          .filter((v) => v !== null && Number(v) > 0),
      );
      expect(positivos).toEqual([]);
    });
  }

  test("portada — nombres accesibles de enlaces coinciden con texto visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    // Muestra de enlaces de navegación: el nombre accesible contiene el
    // texto visible (criterio de la ficha, sin lector externo).
    for (const nombre of ["Servicios", "Método", "Ubicaciones"]) {
      // Comparar las etiquetas completas de la navegación aprobada.
      await expect(page.getByRole("link", { name: nombre, exact: true })).toBeVisible();
    }
    // El logo enlaza a la portada con nombre propio (no repite texto).
    await expect(page.getByRole("link", { name: /Ir a la portada de/ })).toHaveCount(2);
    // El selector de cobertura tiene etiqueta asociada real.
    const selector = page.locator("[data-cobertura-selector]");
    await expect(selector).toHaveCount(1);
    const forId = await page.locator("label.cobertura__label").getAttribute("for");
    expect(forId).toBe("cobertura-selector");
    expect(await selector.getAttribute("id")).toBe("cobertura-selector");
    // Secciones con aria-labelledby resuelven a ids existentes.
    const rotas = await page.evaluate(() => {
      const rotas: string[] = [];
      for (const el of document.querySelectorAll("[aria-labelledby]")) {
        for (const id of (el.getAttribute("aria-labelledby") ?? "").split(/\s+/)) {
          if (id && !document.getElementById(id)) rotas.push(id);
        }
      }
      return rotas;
    });
    expect(rotas).toEqual([]);
    // PA-17E retiró la comparativa no sustentada.
    await expect(page.locator("#comparativa")).toHaveCount(0);
    // SVG decorativo fuera del orden de tabulación y del árbol accesible.
    const svg = page.locator(".cobertura__diagrama");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(await svg.getAttribute("focusable")).toBe("false");
  });
});

test.describe("PA-12 · Teclado: orden, foco visible y sin trampas", () => {
  for (const { ruta, nombre } of PAGINAS) {
    test(`${nombre} — primer Tab cae en el skip-link visible`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(ruta);
      await page.keyboard.press("Tab");
      const href = await page.evaluate(() =>
        document.activeElement instanceof HTMLAnchorElement
          ? document.activeElement.getAttribute("href")
          : null,
      );
      expect(href).toBe("#main");
      const caja = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      expect(caja).not.toBeNull();
      expect(caja!.x).toBeGreaterThanOrEqual(0);
      expect(caja!.y).toBeGreaterThanOrEqual(0);
      expect(caja!.w).toBeGreaterThan(0);
      expect(await tieneFocoVisible(page)).toBe(true);
    });
  }

  test("portada desktop — el foco sigue visible tras tabular por la cabecera", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    // Recorre los 7 primeros stops (skip-link, logo, 4 anclas, CTA) y
    // exige indicador visible en cada uno.
    const sinIndicador: string[] = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      if (!(await tieneFocoVisible(page))) sinIndicador.push(await indicadorFocoVisible(page));
    }
    expect(sinIndicador).toEqual([]);
    // Recorte del elemento enfocado como evidencia de foco visible.
    await page.keyboard.press("Tab");
    const enfocado = page.locator(":focus");
    await enfocado.screenshot({ path: resolve(OUT_DIR, "desktop-1440-focus.png") });
  });

  test("móvil 390 — foco visible en el toggle del menú y sin focos atrapados", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const summary = page.locator(".site-header__toggle");
    await summary.focus();
    expect(await tieneFocoVisible(page)).toBe(true);
    await summary.screenshot({ path: resolve(OUT_DIR, "mobile-390-focus.png") });
    // Sin trampas: 40 Tabs mueven el foco por ≥8 elementos distintos
    // (huella de identidad, no de estilo: muchos enlaces comparten el
    // mismo indicador visual).
    const vistos = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      vistos.add(await huellaFoco(page));
    }
    expect(vistos.size).toBeGreaterThanOrEqual(8);
  });

  test("404 — foco visible tras tabular (recorte)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ruta-que-no-existe-xyz/");
    await page.keyboard.press("Tab");
    expect(await tieneFocoVisible(page)).toBe(true);
    await page.locator(":focus").screenshot({ path: resolve(OUT_DIR, "404-focus.png") });
  });
});

test.describe("PA-12 · Sin JavaScript (contenido completo legible)", () => {
  test.use({ javaScriptEnabled: false });

  test("portada — los 7 bloques, cobertura textual y contacto sin JS", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    // Cabecera + hero + 5 secciones + contacto + pie.
    await expect(page.locator("header.site-header")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Locales comerciales en arriendo");
    for (const id of ["#ventajas", "#metodo", "#flujograma", "#cobertura", "#contacto"]) {
      await expect(page.locator(id)).toBeVisible();
    }
    await expect(page.locator("footer.site-footer")).toBeVisible();
    // Cobertura textual completa: 13 ciudades como texto (no sólo SVG).
    const ciudades = await page.locator(".cobertura__ciudad").allInnerTexts();
    expect(ciudades).toHaveLength(13);
    // Contacto: un único correo visible sin controles de envío.
    await expect(page.locator("#contacto a[href^='mailto:']")).toHaveCount(1);
    // Sin JS el selector se sirve estático pero inerte (sin script de
    // mejora); la lista textual completa es la fuente de verdad y el
    // estado inicial se sirve renderizado.
    expect(await page.locator("[data-cobertura-selector]").count()).toBe(1);
    await expect(page.locator("[data-cobertura-status]")).toContainText(/elige una ciudad/i);
    expect(await page.locator(".cobertura__mapa").count()).toBe(1);
  });

  test("móvil 390 sin JS — el menú nativo abre y sus anclas son alcanzables", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const details = page.locator(".site-header__nav-details");
    const summary = details.locator("summary");
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(page.locator('.site-header__nav a[href="#cobertura"]')).toBeVisible();
  });

  test("404 legible sin JS", async ({ page }) => {
    await page.goto("/ruta-que-no-existe-xyz/");
    await expect(page.locator("#error404-titulo")).toBeVisible();
    await expect(page.locator('main a[href="/"]')).toBeVisible();
  });
});

test.describe("PA-12 · Movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });

  test("transiciones desactivadas y captura de evidencia", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    // El CSS global apaga transiciones/animaciones con reduce. Chromium
    // serializa `0.001ms` como `1e-06s`: se acepta cualquier duración
    // numéricamente nula (<10ms).
    const casiCero = (v: string) =>
      v
        .split(",")
        .map((p) => p.trim())
        .every((p) => {
          const n = Number.parseFloat(p);
          return !Number.isNaN(n) && (p.endsWith("ms") ? n < 10 : n < 0.01);
        });
    const duraciones = await page.evaluate(() => {
      const muestra = [
        document.querySelector(".btn--primary"),
        document.querySelector(".site-header__cta"),
        document.querySelector("a"),
      ].filter((el): el is Element => el !== null);
      return muestra.map((el) => getComputedStyle(el).transitionDuration);
    });
    expect(duraciones.length).toBeGreaterThan(0);
    for (const d of duraciones) {
      expect(casiCero(d), `${d}`).toBe(true);
    }
    const scrollBehavior = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    expect(scrollBehavior).toBe("auto");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({
      path: resolve(OUT_DIR, "desktop-1440-reduced-motion.png"),
      fullPage: true,
    });
  });
});

test.describe("PA-12 · Zoom 200% y reflow (sin overflow ni recortes)", () => {
  // Zoom 200% reproducible como viewport equivalente: la mitad de CSS px
  // (1440/2 = 720 de ancho efectivo). Se exige: sin overflow horizontal
  // de página y secciones clave visibles sin recorte.
  for (const { ruta, nombre } of PAGINAS) {
    test(`${nombre} — zoom 200% equivalente (720px) sin overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 720, height: 900 });
      await page.goto(ruta);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.locator("main")).toBeVisible();
    });
  }

  test("portada 320 — reflow completo sin overflow ni contenido cortado", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    const sinOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      );
    await expect.poll(sinOverflow).toBe(true);
    // Cada sección cabe en el viewport estrecho (sin recorte propio).
    for (const id of ["#ventajas", "#metodo", "#flujograma", "#cobertura", "#contacto"]) {
      const recorte = await page.locator(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, vw: document.documentElement.clientWidth };
      });
      expect(recorte.left).toBeGreaterThanOrEqual(-1);
      expect(recorte.right).toBeLessThanOrEqual(recorte.vw + 1);
    }
    // La comparativa retirada tampoco debe aparecer en móvil.
    await expect(page.locator("#comparativa, .comparativa__cards")).toHaveCount(0);
  });

  test("portada desktop — comparativa retirada sin tabla ni tarjetas", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("#comparativa, .comparativa__cards, table.comparativa")).toHaveCount(
      0,
    );
  });

  test("404 320 — sin overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/ruta-que-no-existe-xyz/");
    await expect(page.locator("#error404-titulo")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("PA-12 · Contraste en superficie auxiliar (par ya medido)", () => {
  test("banner preview usa par de contrast:strict", async ({ page }) => {
    await page.goto("/");
    // `.tech-preview`: ink sobre surface (par "Ink sobre surface", AA).
    const banner = page.locator(".tech-preview");
    await expect(banner).toBeVisible();
    const bannerCS = await banner.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    expect(bannerCS.color).toBe(RGB.ink);
    expect(bannerCS.bg).toBe(RGB.surface);
    // Sin texto blanco sobre lavanda ni combinaciones no medidas.
  });
});

test.describe("PA-12 · Táctil: controles ≥44px en móvil (con excepciones documentadas)", () => {
  test("primarios (CTA, toggle, CTAs del hero, selector) miden ≥44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const medidas: Array<{ nombre: string; w: number; h: number }> = [];
    for (const [nombre, sel] of [
      ["cta-cabecera", ".site-header__cta"],
      ["toggle-menu", ".site-header__toggle"],
      ["hero-primario", ".hero .btn--primary"],
      ["hero-secundario", ".hero .btn--secondary"],
      ["selector-cobertura", "[data-cobertura-selector]"],
    ] as const) {
      const caja = await page.locator(sel).first().boundingBox();
      expect(caja).not.toBeNull();
      medidas.push({ nombre, w: Math.round(caja!.width), h: Math.round(caja!.height) });
    }
    // Registro reproducible en la salida del test.
    console.log(`[PA-12 tactil] ${JSON.stringify(medidas)}`);
    for (const m of medidas) {
      expect(Math.min(m.w, m.h), `${m.nombre}: ${m.w}x${m.h}`).toBeGreaterThanOrEqual(44);
    }
    // Enlaces del footer: texto en línea (excepción documentada en
    // EVIDENCIA.md); se exige el mínimo AA 24px, no 44px.
    const pie = await page.locator("footer a").first().boundingBox();
    expect(pie).not.toBeNull();
    console.log(`[PA-12 tactil] footer-link: ${Math.round(pie!.width)}x${Math.round(pie!.height)}`);
    expect(Math.min(pie!.width, pie!.height), "footer-link").toBeGreaterThanOrEqual(24);
  });
});

test.describe("PA-12 · Fuentes realmente cargadas (PA-Q009)", () => {
  test("Manrope/Source Sans 3 cargadas; sin familias de OTERCO", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    // `document.fonts.check` devuelve true sólo si la cara se cargó y
    // está disponible para ese peso/tamaño (no basta con declararla).
    const manrope = await page.evaluate(() => document.fonts.check('700 32px "Manrope"'));
    const source = await page.evaluate(() => document.fonts.check('400 16px "Source Sans 3"'));
    expect(manrope, "Manrope 700 cargada").toBe(true);
    expect(source, "Source Sans 3 400 cargada").toBe(true);
    // La pila computada usa las familias propias, no la serif de OTERCO.
    const h1Stack = await page.evaluate(
      () => getComputedStyle(document.querySelector("h1")!).fontFamily,
    );
    const bodyStack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(h1Stack).toMatch(/Manrope/);
    expect(bodyStack).toMatch(/Source Sans 3/);
    expect(`${h1Stack} ${bodyStack}`).not.toMatch(/Caslon/i);
  });
});

test.describe("PA-12 · Capturas bajo entorno fijo", () => {
  test("set completo + registro de entorno", async ({ page, browser }) => {
    // Portada desktop completa.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({ path: resolve(OUT_DIR, "desktop-1440-home-full.png"), fullPage: true });

    // Portada móvil completa.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({ path: resolve(OUT_DIR, "mobile-390-home-full.png"), fullPage: true });

    // Portada 320.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    await expect(page.locator("#contacto")).toBeVisible();
    await page.screenshot({ path: resolve(OUT_DIR, "mobile-320-home-full.png"), fullPage: true });

    // 404 desktop/móvil.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ruta-que-no-existe-xyz/");
    await expect(page.locator("#error404-titulo")).toBeVisible();
    await page.screenshot({ path: resolve(OUT_DIR, "desktop-1440-404.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ruta-que-no-existe-xyz/");
    await page.screenshot({ path: resolve(OUT_DIR, "mobile-390-404.png"), fullPage: true });

    // Registro del entorno fijo (viewport, DSF, navegador/versión).
    const entorno = {
      viewports: [
        { nombre: "desktop", width: 1440, height: 900 },
        { nombre: "movil", width: 390, height: 844 },
        { nombre: "estrecho", width: 320, height: 720 },
        { nombre: "zoom200-equivalente", width: 720, height: 900 },
      ],
      deviceScaleFactor: 1,
      navegador: browser.browserType().name(),
      version: browser.version(),
      perfil: "technical",
      headless: true,
    };
    writeFileSync(resolve(OUT_DIR, "entorno.json"), `${JSON.stringify(entorno, null, 2)}\n`);
  });
});
