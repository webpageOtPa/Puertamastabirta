import { describe, it, expect } from "vitest";
import { validateConfig } from "../../apps/puerta-abierta/src/lib/validate-config.js";
import {
  CONTACT_EMAIL_SUBJECT,
  buildMailtoHref,
  buildTelHref,
  buildWhatsAppHref,
  channelHref,
} from "../../apps/puerta-abierta/src/lib/contact-links.js";
import type {
  ContactChannel,
  CoverageCity,
  CoverageGroup,
  EditorialBlock,
  SiteIdentity,
} from "../../apps/puerta-abierta/src/contracts/index";

// PA-09 · PA-Q022–Q026 — Contacto directo sin formularios.
//
// Esta suite construye inputs sintéticos en memoria (no depende del
// estado de `src/config/*`) y comprueba:
//   - Email válido aceptado; email con inyección (CRLF, ?, #, &, <>,
//     protocolo mailto:/http, lista con coma/;) rechazado.
//   - Teléfono E.164 válido aceptado e inválido rechazado.
//   - WhatsApp sólo-dígitos válido aceptado e inválido rechazado.
//   - Canal deshabilitado con valor rechazado (debe ser `value: null`).
//   - Build commercial sin canal habilitado+aprobado rechazado.
//   - `primaryChannelId` inválido rechazado.
//   - Enlaces: mailto con asunto fijo codificado (encodeURIComponent),
//     tel normalizado y wa.me sólo dígitos; canal deshabilitado sin href.

const baseSite: SiteIdentity = {
  siteId: "puerta-abierta",
  nombrePublico: "Puerta Abierta",
  lang: "es-CO",
  canonical: null,
  primaryChannelId: null,
};

const baseChannel = (over: Partial<ContactChannel> = {}): ContactChannel => ({
  id: "email-comercial",
  kind: "email",
  value: null,
  label: "Escribir un correo",
  enabled: false,
  approved: false,
  ...over,
});

const phoneChannel = (over: Partial<ContactChannel> = {}): ContactChannel =>
  baseChannel({
    id: "telefono-comercial",
    kind: "phone",
    label: "Llamar",
    ...over,
  });

const waChannel = (over: Partial<ContactChannel> = {}): ContactChannel =>
  baseChannel({
    id: "whatsapp-comercial",
    kind: "whatsapp",
    label: "Abrir WhatsApp",
    ...over,
  });

const baseBlock = (over: Partial<EditorialBlock> = {}): EditorialBlock => ({
  id: "footer-portada",
  tipo: "footer",
  enabled: true,
  status: "APROBADO",
  origen: { fuente: "MANUAL", refOriginal: "x" },
  data: { cuerpo: "x" },
  ...over,
});

const baseGroup = (over: Partial<CoverageGroup> = {}): CoverageGroup => ({
  id: "zona-x",
  label: "Zona X",
  cities: ["c1"],
  ...over,
});

const baseCity = (over: Partial<CoverageCity> = {}): CoverageCity => ({
  id: "c1",
  name: "C1",
  groupId: "zona-x",
  ...over,
});

function check(channels: ContactChannel[], profile: "technical" | "commercial" = "technical") {
  return validateConfig({
    site: baseSite,
    channels,
    groups: [baseGroup()],
    cities: [baseCity()],
    blocks: [],
    profile,
  });
}

describe("PA-09 · email válido e inválido (PA-Q023/Q024)", () => {
  it("acepta un buzón simple válido", () => {
    const r = check([
      baseChannel({ enabled: true, approved: true, value: "operador@puerta-abierta.example" }),
    ]);
    expect(r.ok).toBe(true);
  });

  it("rechaza email con CRLF (inyección de cabeceras)", () => {
    const r = check([
      baseChannel({
        enabled: true,
        approved: true,
        value: "x\r\nBcc: victima@example.com",
      }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/carácter prohibido/);
  });

  it.each([
    ["interrogación", "a?b@example.com"],
    ["almohadilla", "a#b@example.com"],
    ["ampersand", "a&b@example.com"],
    ["html", "a<b>@example.com"],
  ])("rechaza email con %s", (_label, value) => {
    const r = check([baseChannel({ enabled: true, approved: true, value })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/carácter prohibido/);
  });

  it("rechaza email con protocolo mailto: almacenado", () => {
    const r = check([
      baseChannel({
        enabled: true,
        approved: true,
        value: "mailto:operador@puerta-abierta.example",
      }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/protocolo|buzón/);
  });

  it("rechaza email con URL https arbitraria", () => {
    const r = check([
      baseChannel({
        enabled: true,
        approved: true,
        value: "https://evil.example/operador@puerta-abierta.example",
      }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/protocolo|forma válida/);
  });

  it("rechaza lista de destinatarios y Cc/Bcc (coma y punto y coma)", () => {
    for (const value of ["a@example.com,b@example.com", "a@example.com;b@example.com"]) {
      const r = check([baseChannel({ enabled: true, approved: true, value })]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join("\n")).toMatch(/lista|forma válida/);
    }
  });

  it("rechaza inyección CR/LF percent-encoded (D1)", () => {
    for (const value of ["a%0d%0aBcc%3Aevil@example.com@example.com", "a%0a@example.com"]) {
      const r = check([baseChannel({ enabled: true, approved: true, value })]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join("\n")).toMatch(/percent-encoded|inyección/);
    }
  });

  it("acepta porcentaje legítimo en local-part (D1)", () => {
    const r = check([
      baseChannel({ enabled: true, approved: true, value: "user%20name@example.com" }),
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("PA-09 · teléfono E.164 (PA-Q025)", () => {
  it("acepta teléfono internacional válido", () => {
    const r = check([phoneChannel({ enabled: true, approved: true, value: "+573001234567" })]);
    expect(r.ok).toBe(true);
  });

  it.each([
    ["sin prefijo +", "3001234567"],
    ["con espacios", "+57 300 123 4567"],
    ["con guiones", "+57-300-123-4567"],
    ["demasiado corto", "+57123"],
    ["con letras", "+57ABC123456"],
  ])("rechaza teléfono %s", (_label, value) => {
    const r = check([phoneChannel({ enabled: true, approved: true, value })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/E\.164/);
  });
});

describe("PA-09 · whatsapp sólo dígitos (PA-Q026)", () => {
  it("acepta dígitos internacionales 8–15", () => {
    const r = check([waChannel({ enabled: true, approved: true, value: "573001234567" })]);
    expect(r.ok).toBe(true);
  });

  it.each([
    ["con prefijo +", "+573001234567"],
    ["con espacios", "57 300 123 4567"],
    ["con letras", "57abc123"],
    ["demasiado corto", "1234567"],
  ])("rechaza whatsapp %s", (_label, value) => {
    const r = check([waChannel({ enabled: true, approved: true, value })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/whatsapp/);
  });
});

describe("PA-09 · canal deshabilitado y commercial (PA-Q022)", () => {
  it("rechaza canal deshabilitado con valor (debe ser null)", () => {
    const r = check([baseChannel({ enabled: false, approved: false, value: "x@y.com" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/deshabilitado con valor/);
  });

  it("rechaza canal deshabilitado con cadena vacía (debe ser null)", () => {
    const r = check([baseChannel({ enabled: false, approved: false, value: "" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/deshabilitado con valor/);
  });

  it("rechaza build commercial sin canal habilitado+aprobado", () => {
    const r = validateConfig({
      site: { ...baseSite, canonical: "https://puerta-abierta.example", primaryChannelId: null },
      channels: [baseChannel()],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock()],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/primaryChannelId/);
  });

  it("rechaza primaryChannelId inválido (inexistente)", () => {
    const r = validateConfig({
      site: {
        ...baseSite,
        canonical: "https://puerta-abierta.example",
        primaryChannelId: "canal-fantasma",
      },
      channels: [
        baseChannel({ enabled: true, approved: true, value: "operador@puerta-abierta.example" }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock()],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/primaryChannelId/);
  });
});

describe("PA-09 · construcción de enlaces (PA-Q024/Q025/Q026)", () => {
  it("mailto usa asunto fijo codificado, sin body", () => {
    expect(CONTACT_EMAIL_SUBJECT).toBe("Consulta sobre un local comercial");
    const href = buildMailtoHref("operador@puerta-abierta.example");
    expect(href).toBe(
      `mailto:operador@puerta-abierta.example?subject=${encodeURIComponent(CONTACT_EMAIL_SUBJECT)}`,
    );
    expect(href).not.toMatch(/body=/i);
    expect(href).not.toMatch(/cc=/i);
    // El asunto con tildes/espacios queda codificado, no crudo.
    expect(href).toContain(encodeURIComponent("Consulta sobre un local comercial"));
    expect(href).not.toContain(" ");
  });

  it("tel conserva el valor normalizado", () => {
    expect(buildTelHref("+573001234567")).toBe("tel:+573001234567");
  });

  it("wa.me sólo dígitos, sin texto pre-rellenado", () => {
    const href = buildWhatsAppHref("573001234567");
    expect(href).toBe("https://wa.me/573001234567");
    expect(href).not.toMatch(/text=/i);
  });

  it("canal deshabilitado no genera href", () => {
    expect(channelHref(baseChannel({ value: "x@y.com" }))).toBeNull();
    expect(
      channelHref(baseChannel({ enabled: true, approved: false, value: "x@y.com" })),
    ).toBeNull();
    expect(channelHref(baseChannel({ enabled: true, approved: true, value: null }))).toBeNull();
  });

  it("canal habilitado+aprobado genera href del tipo correcto", () => {
    expect(
      channelHref(
        baseChannel({ enabled: true, approved: true, value: "operador@puerta-abierta.example" }),
      ),
    ).toMatch(/^mailto:/);
    expect(
      channelHref(phoneChannel({ enabled: true, approved: true, value: "+573001234567" })),
    ).toBe("tel:+573001234567");
    expect(channelHref(waChannel({ enabled: true, approved: true, value: "573001234567" }))).toBe(
      "https://wa.me/573001234567",
    );
  });
});
