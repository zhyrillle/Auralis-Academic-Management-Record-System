import { useEffect, useState } from 'react';
import { apiFetch } from './navigationCache.js';
import { getStoredUser } from '../utils/auth.js';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const states = ['SUBMITTED', 'NOT_SUBMITTED', 'IN_CORRECTION', 'UNAVAILABLE'];

export async function getGradeSubmissionStatus(context, { signal } = {}) {
  const userId = getStoredUser()?.user_id || getStoredUser()?.id;
  if (!userId) throw new Error('Sign in to view submission status.');
  const query = new URLSearchParams(context);
  const response = await apiFetch(`${API}/grade-submission-status?${query}`, {
    headers: { 'X-Auralis-User-Id': String(userId) }, cache: 'no-store', signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Unable to load submission status.');
  if (data?.statusVersion !== 1 || !Array.isArray(data.subjects)
    || Object.entries(context).some(([key, value]) => String(data.context?.[key]) !== String(value))
    || data.subjects.some(s => !s.subjectOfferingId || !s.subjectName || !Array.isArray(s.assignedTeachers)
      || !Array.isArray(s.terms) || s.terms.length !== 3
      || ['T1', 'T2', 'T3'].some(term => s.terms.filter(t => t.term === term && states.includes(t.state)).length !== 1))) {
    throw new Error('Submission status returned incomplete information. Please retry.');
  }
  return data;
}

export function useGradeSubmissionStatus(context, { enabled = true, refreshKey } = {}) {
  const userId = getStoredUser()?.user_id || getStoredUser()?.id;
  const key = JSON.stringify({ userId, ...context });
  const [version, setVersion] = useState(0);
  const resultKey = JSON.stringify([key, version, refreshKey]);
  const [result, setResult] = useState({ key: '', data: null, error: '', loading: true });
  const retry = () => setVersion(n => n + 1);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const { userId: owner, ...selection } = JSON.parse(key);
    if (!owner) return undefined;
    getGradeSubmissionStatus(selection, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key: resultKey, data, error: '', loading: false }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key: resultKey, data: null, error: error.message, loading: false }); });
    return () => controller.abort();
  }, [key, enabled, resultKey]);
  if (!userId) return { data: null, error: 'Sign in to view submission status.', loading: false, retry };
  return { ...(result.key === resultKey ? result : { data: null, error: '', loading: enabled }), retry };
}
