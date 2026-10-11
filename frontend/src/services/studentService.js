const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Request failed.");
  }
  return data;
};

/**
 * Fetch all students with section, grade level, and program details
 */
export const fetchStudents = async () => {
  const response = await fetch(`${API_BASE_URL}/students`);
  const data = await parseResponse(response);
  return Array.isArray(data) ? data : [];
};

/**
 * Fetch available curriculum programs (STE, SPJ, SPA, EBEC)
 */
export const fetchPrograms = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/students/programs`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {
    console.warn("Using fallback programs:", err.message);
  }

  return [
    { program_id: 1, program_code: "STE", program_name: "Science Technology and Engineering" },
    { program_id: 2, program_code: "SPJ", program_name: "Special Program in Journalism" },
    { program_id: 3, program_code: "SPA", program_name: "Special Program in Arts" },
    { program_id: 4, program_code: "EBEC", program_name: "Enhanced Basic Education Curriculum" },
  ];
};

/**
 * Register a new student
 */
export const createStudent = async (studentData) => {
  const response = await fetch(`${API_BASE_URL}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(studentData),
  });
  return parseResponse(response);
};

/**
 * Update student record
 */
export const updateStudent = async (studentId, studentData) => {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(studentData),
  });
  return parseResponse(response);
};

/**
 * Delete student record
 */
export const deleteStudent = async (studentId) => {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
    method: "DELETE",
  });
  return parseResponse(response);
};

