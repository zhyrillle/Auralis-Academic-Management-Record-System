import { cachedApiFetch as fetch } from "./navigationCache.js";
import { cacheKey, loadCached } from './navigationCache.js';
import { RISK_INPUT_POLICY, SECTION_DETAILS_CACHE, TEACHER_RISK_VIEW_VERSION } from './riskInputPolicy.js';
import { isSectionDetailsView } from '../utils/sectionDetailsPresentation.js';

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
  riskMode = 'monitoring',
  userId,
  signal,
  force = false,
}) => {
  const read = async () => {
    const response = await fetch(
      `${API_BASE_URL}/section-details/${encodeURIComponent(assignmentType)}/${encodeURIComponent(assignmentId)}?term=${encodeURIComponent(term)}&riskMode=${encodeURIComponent(riskMode)}&inputPolicy=${RISK_INPUT_POLICY}&viewVersion=${TEACHER_RISK_VIEW_VERSION}`,
      { queueOffline: false, force,
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
    if (!isSectionDetailsView(data, { assignmentType, assignmentId, term, riskMode })) {
      throw new SectionDetailsRequestError('Section Details returned an outdated or incomplete response. Refresh the page and try again.',
        'SECTION_DETAILS_VIEW_MISMATCH', 502);
    }
    return data;
  };
  // Shared reads must not inherit one caller's abort signal.
  if (signal) return read();
  return loadCached(cacheKey(SECTION_DETAILS_CACHE, { assignmentType, assignmentId: Number(assignmentId),
    term, riskMode, userId: Number(userId) }), read, { force });
};
