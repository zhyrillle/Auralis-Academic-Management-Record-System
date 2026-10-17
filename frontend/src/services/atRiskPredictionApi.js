import { cachedApiFetch as fetch } from "./navigationCache.js";
const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export async function requestRiskPreview(path, filters = {}, signal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== '') params.set(key, value);
  }
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const response = await fetch(`${BASE}/principal/at-risk-prediction/${path}?${params}`, { queueOffline: false,
    headers: { 'X-Auralis-User-Id': String(user?.user_id || user?.id || '') }, signal,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Prediction unavailable. Please try again.');
  return payload;
}

export const getAtRiskOptions = (signal) => requestRiskPreview('options', {}, signal);
export const getAtRiskPreview = (filters, signal) => requestRiskPreview('preview', filters, signal);
export const getAtRiskPredictionSummary = (filters) => requestRiskPreview('summary', filters);
export const getStudentsByRiskLevel = (filters) => requestRiskPreview('students', filters);
