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
export async function getTeacherFeedbackSummary(schoolYear = "2026-2027") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/principal/feedback/summary?schoolYear=${encodeURIComponent(schoolYear)}`,
    );
    return await parseResponse(response);
  } catch (error) {
    // Graceful fallback to zero data
    return defaultFeedbackSummary;
  }
}

/**
 * REST Route: GET /api/principal/feedback/likert-results?schoolYear=:schoolYear
 * Retrieves the Likert scale ratings for leadership evaluation.
 */
export async function getLikertEvaluationResults(schoolYear = "2026-2027") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/principal/feedback/likert-results?schoolYear=${encodeURIComponent(schoolYear)}`,
    );
    const data = await parseResponse(response);
    return data?.results || defaultLikertQuestions;
  } catch (error) {
    // Graceful fallback to default questions with 0 ratings
    return defaultLikertQuestions;
  }
}

/**
 * REST Route: GET /api/principal/feedback/comments?schoolYear=:schoolYear&query=:query
 * Retrieves open-ended teacher responses.
 */
export async function getTeacherFeedbackComments(schoolYear = "2026-2027", query = "") {
  try {
    const response = await fetch(
      `${API_BASE_URL}/principal/feedback/comments?schoolYear=${encodeURIComponent(schoolYear)}&query=${encodeURIComponent(query)}`,
    );
    const data = await parseResponse(response);
    return data?.comments || [];
  } catch (error) {
    // Graceful fallback to empty comments
    return [];
  }
}

/**
 * REST Route: GET /api/school-years
 * Dynamically retrieves available school years.
 */
export async function getSchoolYears() {
  try {
    const response = await fetch(`${API_BASE_URL}/school-years`);
    const data = await parseResponse(response);
    if (Array.isArray(data) && data.length > 0) {
      const formatted = data
        .map((sy) => {
          const start = typeof sy.starts_on === "number" || !isNaN(Number(sy.starts_on))
            ? Number(sy.starts_on)
            : new Date(sy.starts_on).getFullYear();
          const end = typeof sy.ends_on === "number" || !isNaN(Number(sy.ends_on))
            ? Number(sy.ends_on)
            : new Date(sy.ends_on).getFullYear();
          if (start && end) return `${start}-${end}`;
          return null;
        })
        .filter(Boolean);

      const unique = Array.from(new Set(formatted)).sort((a, b) => b.localeCompare(a));
      if (unique.length > 0) return unique;
    }
  } catch (error) {
    console.warn("Error fetching dynamic school years:", error);
  }
  return ["2026-2027", "2025-2026"];
}

