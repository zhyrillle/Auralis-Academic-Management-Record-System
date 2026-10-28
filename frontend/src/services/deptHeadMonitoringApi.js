import { cachedApiFetch, cacheKey } from './navigationCache';
import useCachedQuery from './useCachedQuery';
import { getStoredUser, normalizeRole } from '../utils/auth';

const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
// A new report contract must not reuse older cached rosters without learner sex.
export const PHIL_IRI_REPORT_VERSION = 4;
async function read(path, params = {}) {
  const user = getStoredUser();
  const query = new URLSearchParams(params);
  const response = await cachedApiFetch(`${base}/department-head/monitoring/${path}${query.size ? `?${query}` : ''}`, {
    queueOffline: false,
    headers: { 'X-Auralis-User-Id': String(user?.user_id || user?.id || ''), Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'These records could not be loaded.');
  return data;
}
export const getMonitoringContext = () => read('context', { viewVersion: PHIL_IRI_REPORT_VERSION });
export const getDepartmentSections = schoolYearId => read('sections', { schoolYearId });
export const getDepartmentPhilIri = (schoolYearId, sectionId) => read(`phil-iri${sectionId ? `/${sectionId}` : ''}`,
  { schoolYearId, viewVersion: PHIL_IRI_REPORT_VERSION });
export function useDepartmentContext() {
  const user = getStoredUser();
  return useCachedQuery(cacheKey('department-monitoring-context', { userId: user?.user_id || user?.id, version: PHIL_IRI_REPORT_VERSION }), getMonitoringContext,
    { enabled: normalizeRole(user) === 'department-head' });
}
