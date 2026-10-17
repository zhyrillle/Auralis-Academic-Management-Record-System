import { cachedApiFetch as fetch } from "./navigationCache";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const getAuthHeaders = () => {
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const user = JSON.parse(raw);
      const id = user?.user_id ?? user?.id;
      if (id) {
        return { "X-Auralis-User-Id": String(id) };
      }
    }
  } catch {
    // Ignore error reading user
  }
  return {};
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || data.message || "The request could not be completed.",
    );
  }

  return data;
};

export const getGradeTransmutationConfig = async () => {
  const response = await fetch(`${API_BASE_URL}/grade-transmutation`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return parseResponse(response);
};

export const saveGradeTransmutationConfig = async ({ is_custom_enabled, ranges }) => {
  const response = await fetch(`${API_BASE_URL}/grade-transmutation`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ is_custom_enabled, ranges }),
  });
  return parseResponse(response);
};

export const resetGradeTransmutationConfig = async () => {
  const response = await fetch(`${API_BASE_URL}/grade-transmutation/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });
  return parseResponse(response);
};
