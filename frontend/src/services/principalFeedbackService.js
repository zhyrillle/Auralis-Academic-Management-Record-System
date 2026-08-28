/**
 * Principal Teacher Feedback Service
 *
 * REST endpoint connectors for anonymous teacher feedback on principal leadership.
 * Initialized with empty / zero fallbacks awaiting backend route implementation.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.error || data.message || "The request could not be completed.",
    );
  }
  return data;
};

// Default empty summary data
const defaultFeedbackSummary = {
  totalResponses: 0,
  overallRating: 0.0,
  ratingDiff: "+0.0",
  wouldRecommendPercent: 0,
  belowTargetCount: 0,
};

// Default leadership evaluation questions (rate defaulted to 0)
const defaultLikertQuestions = [
  { id: 1, description: "The principal communicates clear goals and vision for the school.", rate: 0 },
  { id: 2, description: "The principal provides adequate support for instructional needs and materials.", rate: 0 },
  { id: 3, description: "The principal recognizes and appreciates teachers' accomplishments.", rate: 0 },
  { id: 4, description: "The principal encourages professional growth and learning opportunities.", rate: 0 },
  { id: 5, description: "The principal maintains a safe and positive school environment.", rate: 0 },
  { id: 6, description: "The principal handles administrative matters and concerns promptly.", rate: 0 },
  { id: 7, description: "The principal is approachable and open to teacher feedback.", rate: 0 },
  { id: 8, description: "The principal demonstrates fair and transparent decision-making.", rate: 0 },
];

/**
 * Placeholder REST Route: GET /api/principal/feedback/summary?term=:term&schoolYear=:schoolYear
 * Retrieves top metric cards for teacher feedback.
 */
export async function getTeacherFeedbackSummary(term = "Overall", schoolYear = "2025-2026") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/principal/feedback/summary?term=${encodeURIComponent(term)}&schoolYear=${encodeURIComponent(schoolYear)}`,
    );
    return await parseResponse(response);
  } catch (error) {
    // Graceful fallback to zero data
    return defaultFeedbackSummary;
  }
}

/**
 * Placeholder REST Route: GET /api/principal/feedback/likert-results?term=:term&schoolYear=:schoolYear
 * Retrieves the Likert scale ratings for leadership evaluation.
 */
export async function getLikertEvaluationResults(term = "Overall", schoolYear = "2025-2026") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/principal/feedback/likert-results?term=${encodeURIComponent(term)}&schoolYear=${encodeURIComponent(schoolYear)}`,
    );
    const data = await parseResponse(response);
    return data?.results || defaultLikertQuestions;
  } catch (error) {
    // Graceful fallback to default questions with 0 ratings
    return defaultLikertQuestions;
  }
}

/**
 * Placeholder REST Route: GET /api/principal/feedback/comments?term=:term&schoolYear=:schoolYear&query=:query
 * Retrieves open-ended teacher responses.
 */
export async function getTeacherFeedbackComments(term = "Overall", schoolYear = "2025-2026", query = "") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/principal/feedback/comments?term=${encodeURIComponent(term)}&schoolYear=${encodeURIComponent(schoolYear)}&query=${encodeURIComponent(query)}`,
    );
    const data = await parseResponse(response);
    return data?.comments || [];
  } catch (error) {
    // Graceful fallback to empty comments
    return [];
  }
}

