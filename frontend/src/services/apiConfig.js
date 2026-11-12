let rawUrl = "http://localhost:5000/api";
try {
  rawUrl = import.meta.env.VITE_API_BASE_URL || rawUrl;
} catch (_) {
  // Pure Node.js test environment
}

export const API_BASE_URL = rawUrl.replace(/\/$/, "");
export const BACKEND_URL = API_BASE_URL.replace(/\/api$/, "");
