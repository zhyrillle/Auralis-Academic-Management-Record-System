const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export const getStudentSF9Details = async (identifier) => {
  if (!identifier) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/student-sf9/student/${encodeURIComponent(identifier)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch SF9 details: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error in getStudentSF9Details:", error);
    throw error;
  }
};
