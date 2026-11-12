import { cachedApiFetch } from "./navigationCache.js";
import { API_BASE_URL } from "./apiConfig.js";
import { getStoredUser } from "../utils/auth.js";
import { getPersistentCache, setPersistentCache } from "../offline/syncManager.js";

const fetch = (url, options = {}) => {
  const user = getStoredUser();
  const userId = user?.user_id || user?.id;
  return cachedApiFetch(url, { ...options, headers: {
    ...(userId ? { "X-Auralis-User-Id": String(userId) } : {}), ...options.headers,
  } });
};

const parseResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }
  return data;
};

const formatGradeLevel = (name) => {
  if (!name) return "G10";
  const num = parseInt(String(name).replace(/\D/g, "")) || "";
  return num ? `G${num}` : name;
};

/**
 * Fetch assigned classes/sections (the teacher's Advisory Class + assigned subject teaching sections) for a specific user from backend.
 * Keeps advisory standing separate from every assigned teaching subject.
 * @param {string|number} userId
 */
const checkIsSpecialized = (val) => {
  if (val === null || val === undefined) return false;
  if (val === 1 || val === "1" || val === true || val === "true") return true;
  if (typeof val === "number" && val > 0) return true;
  return false;
};

const mapSectionItem = (item) => {
  const isSpecialized = checkIsSpecialized(item.is_specialized)
    || Boolean(item.classType && String(item.classType).startsWith('Special Program'));
  const isAdviser = item.isAdviser ?? (item.classType === 'Advisory Class');
  const program = item.program_code || item.programCode || null;
  const validProgram = program && String(program).toUpperCase() !== 'EBEC' ? String(program).toUpperCase() : null;
  const classType = isAdviser
    ? isSpecialized && validProgram ? `Advisory Class - ${validProgram}` : 'Advisory Class'
    : isSpecialized ? validProgram ? `Special Program - ${validProgram}` : 'Special Program' : 'Regular Class';
  return { ...item, gradeLevel: item.gradeLevel || formatGradeLevel(item.grade_level_name),
    program_code: item.program_code || null, is_specialized: isSpecialized ? 1 : 0,
    isAdviser, classType };
};

const safeGetPersistentCache = async (key) => {
  try {
    if (typeof getPersistentCache === 'function') {
      return await getPersistentCache(key);
    }
  } catch (_) {}
  return null;
};

const safeSetPersistentCache = async (key, val) => {
  try {
    if (typeof setPersistentCache === 'function') {
      return await setPersistentCache(key, val);
    }
  } catch (_) {}
  return null;
};

export const getAdviserSections = async (userId, options = {}) => {
  if (!userId) return [];
  const archived = options.archived === 'all' ? 'all' : options.archived ? 'true' : 'false';
  const queryParams = new URLSearchParams({ classContextVersion: '3', archived });
  const cacheKey = `sections:adviser:${userId}:${archived}`;

  // Instant SWR: Return cached sections immediately in 0ms if available
  if (!options.force) {
    const cached = await safeGetPersistentCache(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch(`${API_BASE_URL}/sections/adviser/${userId}?${queryParams}`, { force: true })
          .then(parseResponse)
          .then(fresh => {
            if (Array.isArray(fresh)) {
              const freshMapped = fresh.map(mapSectionItem);
              safeSetPersistentCache(cacheKey, freshMapped).catch(() => {});
              if (archived === 'false') {
                try {
                  if (freshMapped.length > 0) {
                    localStorage.setItem(`auralis_assigned_classes_${userId}`, JSON.stringify(freshMapped));
                  } else {
                    localStorage.removeItem(`auralis_assigned_classes_${userId}`);
                  }
                } catch (_) {}
              }
              if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('auralis-classes-refreshed', { detail: { userId, sections: freshMapped } }));
              }
            }
          })
          .catch(() => {});
      }
      return cached;
    }

    try {
      if (archived === 'false') {
        const local = JSON.parse(localStorage.getItem(`auralis_assigned_classes_${userId}`) || 'null');
        if (Array.isArray(local) && local.length > 0) return local;
      }
    } catch (_) {}
  }

  let data;
  try {
    const response = await fetch(`${API_BASE_URL}/sections/adviser/${userId}?${queryParams}`, { force: Boolean(options.force) });
    data = await parseResponse(response);
  } catch (err) {
    if (archived === 'false') {
      const cached = await safeGetPersistentCache(cacheKey);
      if (Array.isArray(cached) && cached.length > 0) return cached;
      try {
        const local = JSON.parse(localStorage.getItem(`auralis_assigned_classes_${userId}`) || 'null');
        if (Array.isArray(local) && local.length > 0) return local;
      } catch (_) {}
    }
    throw err;
  }
  if (!Array.isArray(data)) throw new Error('Assigned classes could not be loaded. Please retry.');
  const mapped = data.map(mapSectionItem);
  safeSetPersistentCache(cacheKey, mapped).catch(() => {});
  if (archived === 'false') {
    try {
      if (mapped.length > 0) {
        localStorage.setItem(`auralis_assigned_classes_${userId}`, JSON.stringify(mapped));
      } else {
        localStorage.removeItem(`auralis_assigned_classes_${userId}`);
      }
    } catch (_) {}
  }
  return mapped;
};

/**
 * Fetch students enrolled in a specific section from backend.
 * @param {string|number} sectionId
 */
export const getStudentsBySection = async (sectionId, subjectOfferingId = null, subjectId = null, subjectName = null) => {
  if (!sectionId) return [];
  try {
    let url = `${API_BASE_URL}/sections/${sectionId}/students`;
    const params = [];
    if (subjectOfferingId && !String(subjectOfferingId).startsWith("sec-")) {
      params.push(`subject_offering_id=${encodeURIComponent(subjectOfferingId)}`);
    }
    if (subjectId) params.push(`subject_id=${encodeURIComponent(subjectId)}`);
    if (subjectName) params.push(`subject_name=${encodeURIComponent(subjectName)}`);
    if (params.length > 0) {
      url += `?${params.join("&")}`;
    }
    const response = await fetch(url);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn("Error fetching section students:", e);
  }
  return [];
};

/**
 * Fetch all sections.
 */
export const getAllSections = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/sections`);
    return parseResponse(response);
  } catch {
    return [];
  }
};

/**
 * Fetch archived sections for a specific user.
 */
export const getArchivedSections = async (userId) => {
  return getAdviserSections(userId, { archived: true });
};

/**
 * Manually archive a class assignment / section.
 */
export const archiveClass = async (payload) => {
  if (!getStoredUser()) throw new Error('Please sign in before archiving a class.');
  const body = { ...payload };
  delete body.userId;
  const response = await fetch(`${API_BASE_URL}/sections/archive`, {
    method: "POST",
    queueOffline: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
};

/**
 * Restore an archived class assignment / section.
 */
export const restoreClass = async (payload) => {
  if (!getStoredUser()) throw new Error('Please sign in before restoring a class.');
  const body = { ...payload };
  delete body.userId;
  const response = await fetch(`${API_BASE_URL}/sections/restore`, {
    method: "POST",
    queueOffline: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
};

export const invalidateAdviserSectionsCache = async (userId) => {
  if (!userId) return;
  try {
    localStorage.removeItem(`auralis_assigned_classes_${userId}`);
    await safeSetPersistentCache(`sections:adviser:${userId}:false`, null);
    await safeSetPersistentCache(`sections:adviser:${userId}:true`, null);
    await safeSetPersistentCache(`sections:adviser:${userId}:all`, null);
  } catch (_) {}
};
