/**
 * Helpers puros para construção de query strings e validação dos filtros
 * da vitrine de profissionais (issue #96).
 */

export type RadiusFilterValue = string;
export type SortOrderValue = '' | 'avaliacao';

export const MIN_DISTANCE_KM = 5;
export const MAX_DISTANCE_KM = 150;
export const DISTANCE_STEP_KM = 5;

export interface RadiusOption {
  value: RadiusFilterValue;
  label: string;
}

export const RADIUS_FILTER_OPTIONS: readonly RadiusOption[] = [
  { value: '', label: 'Qualquer distância' },
  { value: 'max_10', label: 'Até 10 km' },
  { value: 'min_10', label: '10+ km' },
  { value: 'min_25', label: '25+ km' },
  { value: 'min_50', label: '50+ km' },
] as const;

export interface SortOption {
  value: SortOrderValue;
  label: string;
}

export const SORT_ORDER_OPTIONS: readonly SortOption[] = [
  { value: '', label: 'Relevância' },
  { value: 'avaliacao', label: 'Melhor avaliação' },
] as const;

const LEGACY_RADIUS_VALUES = new Set<string>(['max_10', 'min_10', 'min_25', 'min_50']);
const VALID_SORT_VALUES = new Set<string>(SORT_ORDER_OPTIONS.map((opt) => opt.value));

export function parseRadiusFilter(raw: string | null | undefined): RadiusFilterValue {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (LEGACY_RADIUS_VALUES.has(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) {
    const km = Number(trimmed);
    if (km >= 1 && km <= 500) return String(km);
  }
  return '';
}

export function parseSortOrder(raw: string | null | undefined): SortOrderValue {
  if (!raw) return '';
  const trimmed = raw.trim().toLowerCase();
  return VALID_SORT_VALUES.has(trimmed) ? (trimmed as SortOrderValue) : '';
}

export function radiusFilterToApiParams(
  radius: RadiusFilterValue,
): { min_radius_km?: number; max_radius_km?: number; max_distance_km?: number } {
  switch (radius) {
    case 'max_10':
      return { max_radius_km: 10 };
    case 'min_10':
      return { min_radius_km: 10 };
    case 'min_25':
      return { min_radius_km: 25 };
    case 'min_50':
      return { min_radius_km: 50 };
    default: {
      if (/^\d+$/.test(radius)) {
        const km = Number(radius);
        if (km >= 1 && km <= 500) return { max_distance_km: km };
      }
      return {};
    }
  }
}

export interface BuildProfessionalsSearchUrlOptions {
  specialty?: string;
  city?: string;
  state?: string;
  q?: string;
  radius?: RadiusFilterValue;
  orderBy?: SortOrderValue;
  limit?: number;
  skip?: number;
  approvalStatus?: string;
}

/**
 * Monta a URL completa para `GET /api/professionals/search` enviando todos os
 * parâmetros ativos (`q`, `specialty`, `city`, `state`, `min_radius_km`,
 * `max_radius_km`, `order_by`) ao motor de busca do backend.
 */
export function buildProfessionalsSearchUrl(
  apiBaseUrl: string,
  options: BuildProfessionalsSearchUrlOptions = {},
): string {
  const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${normalizedBase}/api/professionals/search`);

  const q = options.q?.trim();
  if (q) {
    url.searchParams.set('q', q);
  }

  const specialty = options.specialty?.trim();
  if (specialty && specialty.toLowerCase() !== 'todas') {
    url.searchParams.set('specialty', specialty);
  }

  const city = options.city?.trim();
  if (city) {
    url.searchParams.set('city', city);
  }

  const state = options.state?.trim().toUpperCase();
  if (state && state.length === 2) {
    url.searchParams.set('state', state);
  }

  const { min_radius_km, max_radius_km, max_distance_km } = radiusFilterToApiParams(options.radius ?? '');
  if (min_radius_km !== undefined) {
    url.searchParams.set('min_radius_km', String(min_radius_km));
  }
  if (max_radius_km !== undefined) {
    url.searchParams.set('max_radius_km', String(max_radius_km));
  }
  if (max_distance_km !== undefined) {
    url.searchParams.set('max_distance_km', String(max_distance_km));
  }

  const orderBy = parseSortOrder(options.orderBy);
  if (orderBy) {
    url.searchParams.set('order_by', orderBy);
  }

  url.searchParams.set('approval_status', options.approvalStatus ?? 'approved');
  url.searchParams.set('limit', String(options.limit ?? 50));

  if (typeof options.skip === 'number' && options.skip > 0) {
    url.searchParams.set('skip', String(options.skip));
  }

  return url.toString();
}
