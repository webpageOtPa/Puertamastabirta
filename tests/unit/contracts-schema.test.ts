import { describe, it, expect } from "vitest";
import {
  ContactChannelSchema,
  CoverageCitySchema,
  CoverageGroupSchema,
  EditorialBlockSchema,
  SiteIdentitySchema,
  EditorialStatusSchema,
  BuildProfileSchema,
} from "../../apps/puerta-abierta/src/contracts/index";

// PA-Q004 — Tipos inválidos en canal
//
// Cada esquema debe rechazar entradas malformadas con un mensaje
// legible y, sobre `ContactChannel`, también distinguir el `kind`
// equivocado de un valor faltante.

describe("SiteIdentitySchema", () => {
  it("acepta una identidad técnica válida", () => {
    const r = SiteIdentitySchema.safeParse({
      siteId: "puerta-abierta",
      nombrePublico: "Puerta Abierta",
      lang: "es-CO",
      canonical: null,
      primaryChannelId: null,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza siteId distinto al literal", () => {
    const r = SiteIdentitySchema.safeParse({
      siteId: "oterco",
      nombrePublico: "x",
      lang: "es-CO",
      canonical: null,
      primaryChannelId: null,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza lang fuera del patrón BCP-47", () => {
    const r = SiteIdentitySchema.safeParse({
      siteId: "puerta-abierta",
      nombrePublico: "x",
      lang: "ESP",
      canonical: null,
      primaryChannelId: null,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza canonical que no es URL válida", () => {
    const r = SiteIdentitySchema.safeParse({
      siteId: "puerta-abierta",
      nombrePublico: "x",
      lang: "es-CO",
      canonical: "no-es-url",
      primaryChannelId: null,
    });
    expect(r.success).toBe(false);
  });

  it("acepta primaryChannelId como id no vacío", () => {
    const r = SiteIdentitySchema.safeParse({
      siteId: "puerta-abierta",
      nombrePublico: "x",
      lang: "es-CO",
      canonical: "https://ejemplo.com",
      primaryChannelId: "email-comercial",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza primaryChannelId como cadena vacía", () => {
    const r = SiteIdentitySchema.safeParse({
      siteId: "puerta-abierta",
      nombrePublico: "x",
      lang: "es-CO",
      canonical: null,
      primaryChannelId: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("BuildProfileSchema", () => {
  it("acepta 'technical' y 'commercial'", () => {
    expect(BuildProfileSchema.safeParse("technical").success).toBe(true);
    expect(BuildProfileSchema.safeParse("commercial").success).toBe(true);
  });
  it("rechaza otros valores", () => {
    expect(BuildProfileSchema.safeParse("preview").success).toBe(false);
    expect(BuildProfileSchema.safeParse("").success).toBe(false);
  });
});

describe("EditorialStatusSchema", () => {
  it("acepta los cuatro estados editoriales", () => {
    for (const s of ["BORRADOR", "PENDIENTE", "APROBADO", "OMITIDO_POR_DECISION"]) {
      expect(EditorialStatusSchema.safeParse(s).success).toBe(true);
    }
  });
  it("rechaza estados no definidos", () => {
    expect(EditorialStatusSchema.safeParse("PUBLICADO").success).toBe(false);
  });
});

describe("ContactChannelSchema — tipos inválidos (PA-Q004)", () => {
  it("rechaza kind fuera del enum (no envía ni recibe)", () => {
    const r = ContactChannelSchema.safeParse({
      id: "c1",
      kind: "telegram", // no admitido
      value: "abc",
      label: "Telegram",
      enabled: false,
      approved: false,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const kindIssue = r.error.issues.find((i) => i.path.includes("kind"));
      expect(kindIssue?.message).toBeTruthy();
    }
  });

  it("rechaza id vacío", () => {
    const r = ContactChannelSchema.safeParse({
      id: "",
      kind: "email",
      value: null,
      label: "X",
      enabled: false,
      approved: false,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza label vacío", () => {
    const r = ContactChannelSchema.safeParse({
      id: "c1",
      kind: "email",
      value: null,
      label: "",
      enabled: false,
      approved: false,
    });
    expect(r.success).toBe(false);
  });

  it("acepta canales deshabilitados con value=null", () => {
    const r = ContactChannelSchema.safeParse({
      id: "email-comercial",
      kind: "email",
      value: null,
      label: "Escribir un correo",
      enabled: false,
      approved: false,
    });
    expect(r.success).toBe(true);
  });
});

describe("CoverageGroup + CoverageCity", () => {
  it("acepta un grupo y ciudad mínimos", () => {
    const g = CoverageGroupSchema.safeParse({
      id: "zona-x",
      label: "Zona X",
      cities: ["c1"],
    });
    expect(g.success).toBe(true);
    const c = CoverageCitySchema.safeParse({
      id: "c1",
      name: "Ciudad 1",
      groupId: "zona-x",
    });
    expect(c.success).toBe(true);
  });
  it("rechaza ciudad con id vacío", () => {
    expect(CoverageCitySchema.safeParse({ id: "", name: "X", groupId: "g" }).success).toBe(false);
  });
  it("rechaza marker fuera de [0,1]", () => {
    expect(
      CoverageCitySchema.safeParse({
        id: "c1",
        name: "X",
        groupId: "g",
        marker: { x: 1.5, y: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("EditorialBlockSchema", () => {
  it("rechaza tipo fuera del enum", () => {
    const r = EditorialBlockSchema.safeParse({
      id: "b1",
      tipo: "popup", // no admitido
      enabled: true,
      status: "BORRADOR",
      origen: { fuente: "MANUAL", refOriginal: "x" },
      data: {},
    });
    expect(r.success).toBe(false);
  });
  it("rechaza data con claves no admitidas (strict)", () => {
    const r = EditorialBlockSchema.safeParse({
      id: "b1",
      tipo: "hero",
      enabled: true,
      status: "BORRADOR",
      origen: { fuente: "MANUAL", refOriginal: "x" },
      data: { html: "<script>alert(1)</script>" }, // no admitido en .strict()
    });
    expect(r.success).toBe(false);
  });
  it("acepta un bloque válido mínimo", () => {
    const r = EditorialBlockSchema.safeParse({
      id: "b1",
      tipo: "footer",
      enabled: true,
      status: "APROBADO",
      origen: { fuente: "MANUAL", refOriginal: "x" },
      data: { cuerpo: "Pie de página" },
    });
    expect(r.success).toBe(true);
  });
});
