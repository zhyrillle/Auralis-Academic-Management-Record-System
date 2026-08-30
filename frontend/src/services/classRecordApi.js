export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "The request could not be completed.");
  }
  return data;
};

export const getClassRecord = async (subjectOfferingId, term = "T1", sectionId = null) => {
  let url = `${API_BASE_URL}/class-record/${subjectOfferingId}?term=${encodeURIComponent(term)}`;
  if (sectionId) {
    url += `&section_id=${encodeURIComponent(sectionId)}`;
  }
  const res = await fetch(url);
  return parseResponse(res);
};

export const createAssessment = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/assessments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
};

export const updateAssessment = async (assessmentId, payload) => {
  const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
};

export const deleteAssessment = async (assessmentId) => {
  const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}`, {
    method: "DELETE",
  });
  return parseResponse(res);
};

export const saveScoresBatch = async ({ subject_offering_id, term = "T1", scores }) => {
  const res = await fetch(`${API_BASE_URL}/scores/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject_offering_id,
      term,
      scores,
    }),
  });
  return parseResponse(res);
};

export const calculateAndSaveGrades = async (subject_offering_id, term = "T1") => {
  const res = await fetch(`${API_BASE_URL}/class-record/calculate-and-save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject_offering_id, term }),
  });
  return parseResponse(res);
};

export const getExportClassRecordUrl = (subjectOfferingId, term = "T1") => {
  return `${API_BASE_URL}/class-record/${subjectOfferingId}/export?term=${encodeURIComponent(term)}`;
};

export const downloadClassRecordExcel = async (subjectOfferingId, term = "T1") => {
  const url = getExportClassRecordUrl(subjectOfferingId, term);
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Export failed with status ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition");
  let filename = `Class_Record_${subjectOfferingId}_${term}.xlsx`;
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
};

const classRecordApi = {
  getClassRecord,
  createAssessment,
  updateAssessment,
  updateAssessmentHps: (id, maxScore) => updateAssessment(id, { max_score: maxScore }),
  deleteAssessment,
  saveScoresBatch,
  batchSaveScores: (scores) => saveScoresBatch({ scores }),
  calculateAndSaveGrades,
  getExportClassRecordUrl,
  downloadClassRecordExcel,
  exportClassRecordExcel: downloadClassRecordExcel,
};

export default classRecordApi;
