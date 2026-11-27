import { cachedApiFetch as fetch } from "./navigationCache.js";
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export const getStudentSF9Details = async (identifier, { schoolYearId } = {}) => {
  if (!identifier) return null;
  try {
    const query = schoolYearId ? `?schoolYearId=${encodeURIComponent(schoolYearId)}` : "";
    const response = await fetch(`${API_BASE_URL}/student-sf9/student/${encodeURIComponent(identifier)}${query}`, {
      cache: "no-store",
    });
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

export const downloadStudentSf9Pdf = async (identifier, { schoolYearId, comments, signal } = {}) => {
  if (!identifier) throw new Error("Student identifier is required");
  const query = schoolYearId ? `?schoolYearId=${encodeURIComponent(schoolYearId)}` : "";
  const response = await window.fetch(`${API_BASE_URL}/student-sf9/student/${encodeURIComponent(identifier)}/export-pdf${query}`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comments: comments || {} }),
  });
  if (!response.ok) {
    const error = new Error(`Failed to generate SF9 PDF: ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return await response.blob();
};

export const downloadSectionSf9Zip = async (sectionId, { schoolYearId, comments, signal } = {}) => {
  if (!sectionId) throw new Error("Section ID is required");
  const query = schoolYearId ? `?schoolYearId=${encodeURIComponent(schoolYearId)}` : "";
  const response = await window.fetch(
    `${API_BASE_URL}/student-sf9/section/${encodeURIComponent(sectionId)}/export-pdf-zip${query}`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comments: comments || {} }),
    }
  );
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const error = new Error(errBody.error || `Failed to generate SF9 ZIP: ${response.statusText}`);
    error.status = response.status;
    error.code = errBody.code || null;
    throw error;
  }
  return await response.blob();
};

function base64ToUint8Array(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const streamSectionSf9Pdfs = async (
  sectionId,
  { schoolYearId, comments, signal, onStart, onFile } = {}
) => {
  if (!sectionId) throw new Error("Section ID is required");
  const query = schoolYearId ? `?schoolYearId=${encodeURIComponent(schoolYearId)}` : "";
  const response = await window.fetch(
    `${API_BASE_URL}/student-sf9/section/${encodeURIComponent(sectionId)}/export-pdf-stream${query}`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comments: comments || {} }),
    }
  );
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const error = new Error(errBody.error || `Failed to stream SF9 PDFs: ${response.statusText}`);
    error.status = response.status;
    error.code = errBody.code || null;
    throw error;
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("Streaming response is not supported in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fileCount = 0;

  const handleLine = async (rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const event = JSON.parse(line);
    if (event.type === "start") {
      if (typeof onStart === "function") await onStart(event);
    } else if (event.type === "file") {
      fileCount += 1;
      const bytes = base64ToUint8Array(event.data);
      if (typeof onFile === "function") {
        await onFile({
          completed: event.completed,
          total: event.total,
          fileName: event.fileName,
          studentName: event.studentName,
          bytes,
        });
      }
    } else if (event.type === "error") {
      throw new Error(event.error || "Failed to generate SF9 PDFs.");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      await handleLine(line);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    await handleLine(buffer);
  }

  return { count: fileCount };
};

export const fetchSectionSf9BatchData = async (sectionId, { schoolYearId, signal } = {}) => {
  if (!sectionId) throw new Error("Section ID is required");
  const query = schoolYearId ? `?schoolYearId=${encodeURIComponent(schoolYearId)}` : "";
  const response = await window.fetch(
    `${API_BASE_URL}/student-sf9/section/${encodeURIComponent(sectionId)}/batch-data${query}`,
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const error = new Error(errBody.error || `Failed to load SF9 batch data: ${response.statusText}`);
    error.status = response.status;
    error.code = errBody.code || null;
    throw error;
  }
  return await response.json();
};

export const fetchEphemeralLrn = async (identifier, { signal } = {}) => {
  if (!identifier) return null;
  const response = await window.fetch(`${API_BASE_URL}/student-sf9/student/${encodeURIComponent(identifier)}/ephemeral-lrn`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch official export credential: ${response.statusText}`);
  }
  const data = await response.json();
  return data.lrn;
};


