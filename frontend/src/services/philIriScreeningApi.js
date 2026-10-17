import { cachedApiFetch as apiFetch } from './navigationCache';
import { API_BASE_URL } from './classRecordApi';
import { getStoredUser } from '../utils/auth';

async function request(sectionId, schoolYearId, body) {
  const user = getStoredUser();
  const response = await apiFetch(`${API_BASE_URL}/phil-iri/screening/${encodeURIComponent(sectionId)}?schoolYearId=${encodeURIComponent(schoolYearId)}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Auralis-User-Id': String(user?.user_id || user?.id || '') },
    ...(body ? { body: JSON.stringify({ ...body, schoolYearId }) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Screening scores could not be loaded or saved.');
  return data;
}

export const getScreeningRecords = (sectionId, schoolYearId) => request(sectionId, schoolYearId);
export const saveScreeningRecords = (sectionId, schoolYearId, body) => request(sectionId, schoolYearId, body);
