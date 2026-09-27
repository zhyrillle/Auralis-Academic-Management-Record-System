const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const parseJsonResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "The Master Sheet request could not be completed.");
  }
  return data;
};

export const normalizeMasterSheetError = (error) => {
  if (error instanceof TypeError || /failed to fetch/i.test(error?.message || "")) {
    return "Unable to connect to the Master Sheet service. Check the backend connection and try again.";
  }
  return error?.message || "The Master Sheet request could not be completed.";
};

export const getMasterSheetOptions = async (userId) => {
  const response = await fetch(
    `${API_BASE_URL}/master-sheets/options?user_id=${encodeURIComponent(userId)}`,
  );
  return parseJsonResponse(response);
};

export const getMasterSheet = async (adviserAssignmentId, userId) => {
  const response = await fetch(
    `${API_BASE_URL}/master-sheets/${encodeURIComponent(adviserAssignmentId)}?user_id=${encodeURIComponent(userId)}`,
  );
  return parseJsonResponse(response);
};

const extractFilename = (contentDisposition) => {
  if (!contentDisposition) return null;
  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) return decodeURIComponent(encodedMatch[1].trim());
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1].trim() : null;
};

export const downloadMasterSheet = async (adviserAssignmentId, userId) => {
  const response = await fetch(
    `${API_BASE_URL}/master-sheets/${encodeURIComponent(adviserAssignmentId)}/download?user_id=${encodeURIComponent(userId)}`,
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "The Master Sheet could not be downloaded.");
  }

  return {
    blob: await response.blob(),
    filename: extractFilename(response.headers.get("Content-Disposition")) || "Master_Sheet.xlsx",
  };
};
