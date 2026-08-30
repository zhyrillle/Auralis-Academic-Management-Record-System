const API_BASE_URL = "http://localhost:5000/api/principal/at-risk-prediction";

export async function getAtRiskSummary({ schoolYear, term } = {}) {
  const params = new URLSearchParams();
  if (schoolYear) params.append("schoolYear", schoolYear);
  if (term && term !== "overall") params.append("term", term);

  const res = await fetch(`${API_BASE_URL}/summary${params.toString() ? `?${params.toString()}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch at-risk summary");
  return res.json();
}

export async function getOverallDistribution({ schoolYear, term } = {}) {
  const params = new URLSearchParams();
  if (schoolYear) params.append("schoolYear", schoolYear);
  if (term && term !== "overall") params.append("term", term);

  const res = await fetch(`${API_BASE_URL}/breakdown${params.toString() ? `?${params.toString()}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch at-risk distribution");
  const data = await res.json();
  return data.distribution;
}

export async function getGradeLevelBreakdown({ schoolYear, term } = {}) {
  const params = new URLSearchParams();
  if (schoolYear) params.append("schoolYear", schoolYear);
  if (term && term !== "overall") params.append("term", term);

  const res = await fetch(`${API_BASE_URL}/breakdown${params.toString() ? `?${params.toString()}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch grade level breakdown");
  const data = await res.json();
  return data.gradeBreakdown;
}

export async function getRiskLevelLearners({ schoolYear, term, riskLevel } = {}) {
  const params = new URLSearchParams();
  if (schoolYear) params.append("schoolYear", schoolYear);
  if (term && term !== "overall") params.append("term", term);
  if (riskLevel) params.append("riskLevel", riskLevel);

  const res = await fetch(`${API_BASE_URL}/students${params.toString() ? `?${params.toString()}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch risk level learners");
  const data = await res.json();
  return {
    count: data.totalCount,
    notes: data.students.map((s) => `${s.name} (${s.section}) — Risk Score: ${s.riskScore}`),
  };
}
