// Interacción local de cobertura — Puerta Abierta (PA-08)
// ---------------------------------------------------------------------------
// Módulo de mejora progresiva OPCIONAL para la sección de cobertura.
// Sin backend, sin geolocalización, sin GIS, sin red, sin querystring,
// sin persistencia: resuelve un ID de ciudad contra el dataset ya
// publicado en el HTML y devuelve su grupo para que el presentador DOM
// resalte ambos.
//
// Diseño (ver 03_INTERFAZ/MAPA_Y_HERRAMIENTAS.md):
//   Entradas → estado → presentador DOM local.
//   - `normalizeCityId` / `resolveCity`: funciones puras.
//   - `createCoverageInteraction`: factoría con estado por instancia
//     (clausura); sin variables globales que mezclen instancias.
//   - IDs desconocidos → `null` con estado estable, NUNCA excepción.
//   - Reabrir/montar de nuevo parte de estado vacío; no hay listeners
//     aquí (el pegamento DOM vive en el `<script is:inline>` de
//     Cobertura.astro, que sólo se publica con el flag habilitado).

export interface CoverageCityRef {
  id: string;
  name: string;
  groupId: string;
}

export interface CoverageGroupRef {
  id: string;
  label: string;
}

export interface CoverageSelection {
  cityId: string;
  cityName: string;
  groupId: string;
  groupLabel: string;
}

/**
 * Normaliza un ID candidato: recorta y minúsculas. Devuelve `null`
 * para todo lo que no sea una cadena no vacía (números, null,
 * undefined, objetos, cadenas en blanco).
 */
export function normalizeCityId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return id === "" ? null : id;
}

/**
 * Resuelve un ID contra el dataset. Pura: no lee ni escribe estado.
 * Devuelve la selección (ciudad + grupo) o `null` si el ID es
 * desconocido, vacío o no pertenece a ningún grupo declarado.
 */
export function resolveCity(
  cities: readonly CoverageCityRef[],
  groups: readonly CoverageGroupRef[],
  raw: unknown,
): CoverageSelection | null {
  const id = normalizeCityId(raw);
  if (id === null) return null;
  const city = cities.find((c) => c.id === id);
  if (!city) return null;
  const group = groups.find((g) => g.id === city.groupId);
  if (!group) return null;
  return { cityId: city.id, cityName: city.name, groupId: group.id, groupLabel: group.label };
}

export interface CoverageInteractionOptions {
  cities: readonly CoverageCityRef[];
  groups: readonly CoverageGroupRef[];
  /** Llamado sólo con selecciones válidas (nunca con IDs inválidos). */
  onSelect?: (selection: CoverageSelection | null) => void;
}

export interface CoverageInteraction {
  /** Selecciona una ciudad; ID inválido → `null`, estado estable. */
  select: (raw: unknown) => CoverageSelection | null;
  /** Limpia la selección (estado vacío, avisa con `null`). */
  clear: () => void;
  /** Selección actual o `null` si no hay ninguna. */
  getSelected: () => CoverageSelection | null;
  /** Número de selecciones válidas aplicadas en esta instancia. */
  getSelectCount: () => number;
}

/**
 * Crea una instancia independiente. Cada llamada devuelve un estado
 * propio: dos instancias no comparten selección ni contadores.
 */
export function createCoverageInteraction(
  options: CoverageInteractionOptions,
): CoverageInteraction {
  const { cities, groups, onSelect } = options;
  let selected: CoverageSelection | null = null;
  let selectCount = 0;

  return {
    select(raw: unknown): CoverageSelection | null {
      const resolved = resolveCity(cities, groups, raw);
      if (resolved === null) return null;
      selected = resolved;
      selectCount += 1;
      onSelect?.(resolved);
      return resolved;
    },
    clear(): void {
      selected = null;
      onSelect?.(null);
    },
    getSelected(): CoverageSelection | null {
      return selected === null ? null : { ...selected };
    },
    getSelectCount(): number {
      return selectCount;
    },
  };
}
