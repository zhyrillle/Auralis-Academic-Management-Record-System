import { cachedApiFetch, cacheKey } from './navigationCache';
import useCachedQuery from './useCachedQuery';

// Page and HTTP cache identities both change: older demo/error-as-zero snapshots
// must never be mistaken for verified records. Other roles/outbox data are untouched.
export const PRINCIPAL_DATA_VERSION = 2;
const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
export const principalTerms = [
  { id: 'overall', label: 'Overall' },
  ...[1, 2, 3].map(term => ({ id: `term-${term}`, label: `Term ${term}` })),
];
export const numeric = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isFinite(Number(value));
export const principalCacheKey = (name, filters = {}) => cacheKey(name, { ...filters, recordsVersion: PRINCIPAL_DATA_VERSION });

export async function principalRead(path, params = {}, validate = () => true) {
  const query = new URLSearchParams({ ...params, recordsVersion: PRINCIPAL_DATA_VERSION });
  const response = await cachedApiFetch(`${base}${path}?${query}`, { queueOffline: false });
  if (!response.ok) {
    throw Object.assign(new Error(`Unable to load these records (HTTP ${response.status}). Please retry.`), { status: response.status });
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The server returned an unreadable response. Please retry.'); }
  if (path.startsWith('/principal/') && data?.recordsVersion !== PRINCIPAL_DATA_VERSION) {
    throw new Error('The backend needs the real-records update. Restart the backend and retry.');
  }
  let valid = false;
  try { valid = validate(data); } catch { /* Malformed nested fields are not an empty result. */ }
  if (!valid) throw new Error('The server returned incomplete records. Please retry.');
  return data;
}

const yearNumber = value => {
  if (value == null || value === '') return null;
  if (/^\d{4}$/.test(String(value))) return Number(value);
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
};

export async function getPrincipalSchoolYears() {
  const rows = await principalRead('/school-years', {}, Array.isArray);
  const years = rows.map(row => {
    const start = yearNumber(row.starts_on), end = yearNumber(row.ends_on);
    if (!start || !end) throw new Error('A saved school year is incomplete. Please contact the administrator.');
    return { value: `${start}-${end}`, label: `SY ${start}–${end}`,
      isCurrent: row.is_current === true || Number(row.is_current) === 1 || ['active', 'ongoing', 'current'].includes(String(row.status).toLowerCase()) };
  });
  return [...new Map(years.map(year => [year.value, year])).values()].sort((a, b) => b.value.localeCompare(a.value));
}

// Reuses the system cache; it does not introduce a second caching implementation.
export function usePrincipalQuery(name, filters, loader, { comparison = false } = {}) {
  const years = useCachedQuery(principalCacheKey('principal:school-years'), getPrincipalSchoolYears);
  const options = years.data || [];
  const requestedYear = comparison ? filters.primarySchoolYear : filters.schoolYear;
  const primary = options.find(year => year.value === requestedYear) || options.find(year => year.isCurrent) || options[0];
  const comparisonYear = options.find(year => year.value === filters.comparisonSchoolYear && year.value !== primary?.value)
    || options.find(year => year.value !== primary?.value);
  const resolved = comparison
    ? { ...filters, primarySchoolYear: primary?.value || '', comparisonSchoolYear: comparisonYear?.value || '' }
    : { ...filters, schoolYear: primary?.value || '' };
  const enabled = Boolean(primary && (!comparison || comparisonYear));
  const query = useCachedQuery(principalCacheKey(name, resolved), () => loader(resolved), { enabled, keepPreviousData: true });
  const configurationError = !years.loading && !years.error && !enabled
    ? comparison && primary ? 'At least two configured school years are needed for comparison.' : 'No school years are configured yet.' : '';
  return { ...query, ...resolved, schoolYears: options,
    loading: years.loading || query.loading,
    error: years.error || configurationError || query.error,
    refresh: years.error || configurationError ? years.refresh : query.refresh };
}
