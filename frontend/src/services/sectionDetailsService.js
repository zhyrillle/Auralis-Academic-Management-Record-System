const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export class SectionDetailsRequestError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "SectionDetailsRequestError";
    this.code = code;
    this.status = status;
  }
}

export const normalizeSectionDetailsError = (error) => {
  if (error?.name === "AbortError") return null;
  if (error instanceof TypeError || /failed to fetch/i.test(error?.message || "")) {
    return "Unable to connect to the Section Details service. Check the backend connection and try again.";
  }
  return error?.message || "The Section Details request could not be completed.";
};

export const getSectionDetails = async ({
  assignmentType,
  assignmentId,
  term = "T1",
  userId,
  signal,
}) => {
  const response = await fetch(
    `${API_BASE_URL}/section-details/${encodeURIComponent(assignmentType)}/${encodeURIComponent(assignmentId)}?term=${encodeURIComponent(term)}`,
    {
      headers: { "X-Auralis-User-Id": String(userId) },
      signal,
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SectionDetailsRequestError(
      data.message || "The Section Details request could not be completed.",
      data.code || "SECTION_DETAILS_REQUEST_FAILED",
      response.status,
    );
  }
  return data;
};
