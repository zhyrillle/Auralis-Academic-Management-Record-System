import { cachedApiFetch } from './navigationCache';
import { API_BASE_URL } from './apiConfig';
import { getStoredUser } from '../utils/auth';

async function read(path, filters = {}) {
  const user = getStoredUser();
  const response = await cachedApiFetch(`${API_BASE_URL}/principal/student-monitoring/${path}?${new URLSearchParams(filters)}`, {
    queueOffline: false, headers: { 'X-Auralis-User-Id': String(user?.user_id || user?.id || '') },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Student monitoring could not be loaded.');
  return data;
}

export const getMonitoringOptions = () => read('options');
export const getMonitoringPreview = filters => read('preview', filters);
