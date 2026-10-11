const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function fetchApi(endpoint, queryParams = {}) {
  const url = new URL(API_BASE_URL + endpoint);
  Object.keys(queryParams).forEach(key => {
    if (queryParams[key]) {
      url.searchParams.append(key, queryParams[key]);
    }
  });

  const token = localStorage.getItem('token');
  let userId = '';
  try {
    const userObj = JSON.parse(localStorage.getItem('user'));
    if (userObj) {
      userId = userObj.user_id || userObj.id || '';
    }
  } catch (e) {}

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Auralis-User-Id': userId,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch');
  }
  return response.json();
}

export async function getComparativeAnalysis({ schoolYear, gradeLevel, quarter }) {
  return fetchApi('/department-head/comparative-analysis', { schoolYear, gradeLevel, quarter });
}

export async function getOverallPassRate({ schoolYear, gradeLevel, quarter }) {
  return fetchApi('/department-head/pass-rate', { schoolYear, gradeLevel, quarter });
}

export async function getDashboardStats({ schoolYear, gradeLevel, quarter }) {
  return fetchApi('/department-head/stats', { schoolYear, gradeLevel, quarter });
}

export async function getSubmissionMonitor({ schoolYear, gradeLevel, quarter }) {
  return fetchApi('/department-head/submission-monitor', { schoolYear, gradeLevel, quarter });
}

export async function getPerformanceMatrix({ schoolYear, gradeLevel, quarter }) {
  return fetchApi('/department-head/performance-matrix', { schoolYear, gradeLevel, quarter });
}

export async function getGradeDistribution({ schoolYear }) {
  return fetchApi('/department-head/grade-distribution', { schoolYear });
}
