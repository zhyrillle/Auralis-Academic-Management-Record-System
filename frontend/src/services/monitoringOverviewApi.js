import { API_BASE_URL } from './apiConfig';
import { cachedApiFetch } from './navigationCache';
import { getStoredUser } from '../utils/auth';

async function read(path, params = {}) {
  const user = getStoredUser();
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null));
  // useCachedQuery owns freshness. Retry must also bypass the HTTP/offline cache.
  const response = await cachedApiFetch(`${API_BASE_URL}${path}?${query}`, {
    force: true, queueOffline: false,
    headers: { 'X-Auralis-User-Id': String(user?.user_id || user?.id || ''),
      Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.message || result.error || 'Monitoring could not be loaded. Please retry.'), { status: response.status });
  return result;
}
export const getAttendanceOptions = () => read('/principal/attendance-monitoring/options');
export const getWeeklyTardiness = schoolYear => read('/principal/attendance-monitoring/weekly', { schoolYear });
export async function getAttendanceOverview(schoolYear) {
  const data = await read('/principal/attendance-monitoring/preview', { schoolYear });
  if (data.version !== 'attendance-monitoring-v5' || data.policy?.occurrenceBasis !== 'absent' || !Array.isArray(data.policy?.tiers) || data.policy.tiers.length !== 6 || !data.policy.disclaimer) {
    throw new Error('Attendance guidance is temporarily unavailable. Please retry.');
  }
  return data;
}
export async function getDepartmentAcademicRisk(params) {
  const data = await read('/department-head/monitoring/academic-risk', params);
  if (data.version !== 'department-academic-risk-v2' || !data.summary || !Array.isArray(data.byGrade)) {
    throw new Error('Academic risk counts are unavailable. Check that the backend has the monitoring update.');
  }
  return data;
}
