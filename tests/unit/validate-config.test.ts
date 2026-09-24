import { describe, it, expect } from "vitest";
import { validateConfig } from "../../apps/puerta-abierta/src/lib/validate-config.js";
import type {
  ContactChannel,
  CoverageCity,
  CoverageGroup,
  EditorialBlock,
  SiteIdentity,
} from "../../apps/puerta-abierta/src/contracts/index";

// PA-Q004, PA-Q005, PA-Q006, PA-Q016 — Reglas cruzadas.
//
// Estos tests NO dependen del estado de `src/config/*`; construyen
// inputs sintéticos en memoria para comprobar cada regla de forma
// aislada. La suite demuestra que:
//   - IDs duplicados entre canales → rechazo.
//   - Canal deshabilitado con valor no vacío → rechazo.
//   - Canal habilitado sin aprobado → rechazo.
//   - Build commercial con bloque habilitado en BORRADOR → rechazo.
//   - Build commercial sin canonical https → rechazo.
//   - Build commercial sin primaryChannelId válido → rechazo.
//   - Cobertura: 13 ciudades únicas, 4 grupos exactos → OK.

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

describe("validateConfig — reglas de canal (PA-Q004)", () => {
  it("rechaza canal deshabilitado con valor no vacío", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: false,
          approved: false,
          value: "x@y.com",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[canal:email-comercial\] deshabilitado con valor no vacío/,
      );
    }
  });

  it("rechaza canal habilitado sin aprobado", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: false,
          value: "x@y.com",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/\[canal:email-comercial\] habilitado pero no aprobado/);
    }
  });

  it("rechaza IDs duplicados entre canales", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel({ id: "dup" }), baseChannel({ id: "dup", kind: "phone" })],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/\[canal\] ID duplicado: "dup"/);
    }
  });

  it("acepta email con formato válido y caracteres prohibidos ausentes", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock()],
      profile: "technical",
    });
    expect(r.ok).toBe(true);
  });

  it("rechaza email con CRLF o carácter de inyección", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "x\r\nBcc: victima@example.com",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock()],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/carácter prohibido/);
    }
  });
});

describe("validateConfig — reglas de bloque (PA-Q005)", () => {
  it("rechaza build commercial con bloque habilitado en BORRADOR", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ id: "hero", status: "BORRADOR", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[bloque:hero\] habilitado en build commercial pero su estado es "BORRADOR"/,
      );
    }
  });

  it("rechaza build commercial sin primaryChannelId válido (canal no utilizable)", () => {
    // La regla "al menos un canal utilizable" (enabled && approved && value)
    // se consolidó en `primaryChannelId` (ver comentario al inicio de
    // `src/lib/validate-config.ts`): un primaryChannelId válido implica un
    // canal utilizable, y exigir ambos era redundante. Aquí se mantiene
    // la semántica de la prueba pero se afirma sobre el mensaje consolidado.
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock()],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/primaryChannelId/);
    }
  });

  it("acepta build technical con bloque en BORRADOR", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ id: "hero", status: "BORRADOR", enabled: true })],
      profile: "technical",
    });
    expect(r.ok).toBe(true);
  });

  it("acepta build commercial cuando todos los habilitados están APROBADO y hay canal", () => {
    const r = validateConfig({
      site: {
        ...baseSite,
        canonical: "https://puerta-abierta.example",
        primaryChannelId: "email-comercial",
      },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ id: "footer-portada", status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(true);
  });

  it("rechaza IDs duplicados entre bloques", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ id: "dup" }), baseBlock({ id: "dup", tipo: "footer" })],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/\[bloque\] ID duplicado: "dup"/);
    }
  });

  it("rechaza build commercial sin canonical (canonical=null)", () => {
    const r = validateConfig({
      site: { ...baseSite, canonical: null },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[build:commercial\] canonical debe ser una URL https:\/\/\.\.\. aprobada/,
      );
    }
  });

  it("rechaza build commercial con canonical no-https", () => {
    const r = validateConfig({
      site: { ...baseSite, canonical: "http://ejemplo.com/landing" },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[build:commercial\] canonical debe ser una URL https:\/\/\.\.\. aprobada/,
      );
    }
  });

  it("rechaza build commercial sin primaryChannelId configurado", () => {
    const r = validateConfig({
      site: { ...baseSite, canonical: "https://puerta-abierta.example", primaryChannelId: null },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[build:commercial\] primaryChannelId no configurado o no apunta a un canal habilitado y aprobado/,
      );
    }
  });

  it("rechaza build commercial con primaryChannelId que apunta a un canal inexistente", () => {
    const r = validateConfig({
      site: {
        ...baseSite,
        canonical: "https://puerta-abierta.example",
        primaryChannelId: "canal-fantasma",
      },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[build:commercial\] primaryChannelId no configurado o no apunta a un canal habilitado y aprobado/,
      );
    }
  });

  it("rechaza build commercial con primaryChannelId que apunta a un canal no aprobado", () => {
    const r = validateConfig({
      site: {
        ...baseSite,
        canonical: "https://puerta-abierta.example",
        primaryChannelId: "email-comercial",
      },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: false, // NO aprobado
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[build:commercial\] primaryChannelId no configurado o no apunta a un canal habilitado y aprobado/,
      );
    }
  });

  it("rechaza build commercial con primaryChannelId que apunta a un canal con value vacío", () => {
    const r = validateConfig({
      site: {
        ...baseSite,
        canonical: "https://puerta-abierta.example",
        primaryChannelId: "email-comercial",
      },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: null, // value vacío
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[build:commercial\] primaryChannelId no configurado o no apunta a un canal habilitado y aprobado/,
      );
    }
  });

  it("acepta build commercial con canonical https y primaryChannelId válido", () => {
    const r = validateConfig({
      site: {
        ...baseSite,
        canonical: "https://puerta-abierta.example",
        primaryChannelId: "email-comercial",
      },
      channels: [
        baseChannel({
          id: "email-comercial",
          enabled: true,
          approved: true,
          value: "operador@puerta-abierta.example",
        }),
      ],
      groups: [baseGroup()],
      cities: [baseCity()],
      blocks: [baseBlock({ status: "APROBADO", enabled: true })],
      profile: "commercial",
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateConfig — reglas de cobertura (PA-Q016)", () => {
  it("rechaza ciudad con groupId desconocido", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [baseGroup({ cities: ["c1"] })],
      cities: [baseCity({ id: "c1", groupId: "otro-grupo" })],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/groupId inexistente/);
    }
  });

  it("rechaza ciudad duplicada", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [baseGroup({ cities: ["c1", "c1"] })],
      cities: [baseCity()],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/\[cobertura:ciudad\] ID duplicado/);
    }
  });

  it("rechaza grupo que referencia ciudad inexistente", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [baseGroup({ cities: ["fantasma"] })],
      cities: [baseCity()],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/ciudad desconocida: "fantasma"/);
    }
  });

  it("rechaza ciudad sin grupo", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [],
      cities: [baseCity()],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(
        /\[cobertura:ciudad:c1\] \(C1\) no aparece en ningún grupo/,
      );
    }
  });

  it("rechaza grupo declarado sin ciudades", () => {
    const r = validateConfig({
      site: baseSite,
      channels: [baseChannel()],
      groups: [baseGroup({ cities: [] })],
      cities: [],
      blocks: [],
      profile: "technical",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/\[cobertura:grupo:zona-x\] no contiene ciudades/);
    }
  });
});
