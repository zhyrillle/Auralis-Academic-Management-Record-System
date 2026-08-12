const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || "The request could not be completed.",
    );
  }

  return data;
};

export const getSchoolYears = async () => {
  const response = await fetch(`${API_BASE_URL}/school-years`);
  return parseResponse(response);
};

export const getSubjectWeightConfiguration = async (schoolYearId) => {
  const response = await fetch(
    `${API_BASE_URL}/subject-component-weights/configuration/${schoolYearId}`,
  );
  return parseResponse(response);
};

export const inheritSubjectWeightConfiguration = async (schoolYearId) => {
  const response = await fetch(
    `${API_BASE_URL}/subject-component-weights/configuration/${schoolYearId}/inherit`,
    { method: "POST" },
  );
  return parseResponse(response);
};

export const saveSubjectWeightConfiguration = async (
  schoolYearId,
  weights,
) => {
  const response = await fetch(
    `${API_BASE_URL}/subject-component-weights/configuration/${schoolYearId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weights }),
    },
  );

  return parseResponse(response);
};
