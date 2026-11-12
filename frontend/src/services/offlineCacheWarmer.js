import { getAdviserSections } from './sectionService.js';
import { getClassRecord } from './classRecordApi.js';
import { getScreeningRecords } from './philIriScreeningApi.js';
import { setPersistentCache, getPersistentCache } from '../offline/syncManager.js';
import { API_BASE_URL } from './apiConfig.js';

let isWarming = false;
let lastWarmedUser = null;
let lastWarmedAt = 0;
const WARM_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes debounce

/**
 * Normalizes students to a consistent roster format
 */
function normalizeStudentList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({
    student_section_id: s.student_section_id || s.id,
    student_id: s.student_id || s.id,
    id: s.student_id || s.id,
    lrn: s.lrn || s.LRN || "",
    first_name: s.firstName || s.first_name || "Unknown",
    last_name: s.lastName || s.last_name || "",
    middle_name: s.middleName || s.middle_name || "",
    sex: s.sex || "M",
  }));
}

/**
 * Pre-cache student roster for a specific section into localStorage and Dexie cache
 */
async function warmSectionStudents(sectionId) {
  if (!sectionId) return [];
  try {
    const res = await fetch(`${API_BASE_URL}/sections/${sectionId}/students`);
    if (res.ok) {
      const raw = await res.json();
      const students = normalizeStudentList(raw);
      if (students.length > 0) {
        try {
          localStorage.setItem(`auralis_students_section_${sectionId}`, JSON.stringify(students));
        } catch (_) {}
        await setPersistentCache(`students:section:${sectionId}`, students).catch(() => {});
        return students;
      }
    }
  } catch (err) {
    console.debug(`[CacheWarmer] section ${sectionId} students warm skipped:`, err?.message);
  }
  return [];
}

/**
 * Pre-cache attendance sheets and records for a section
 */
async function warmAttendance(sectionId, isSubject, userId, schoolYearId, teacherAssignmentId, adviserAssignmentId, students) {
  if (!sectionId || !userId) return;
  const scopeTag = isSubject ? 'subject' : 'section';
  const cacheKey = `attendance_sheet_${sectionId}_${scopeTag}_${userId}`;

  try {
    const existing = await getPersistentCache(cacheKey);
    if (existing && Array.isArray(existing.students) && existing.students.length > 0) {
      return; // Already cached
    }

    const scopeQuery = isSubject ? 'scope=SUBJECT' : 'scope=SECTION';
    const assignmentQuery = isSubject
      ? (teacherAssignmentId ? `&teacherAssignmentId=${teacherAssignmentId}` : '')
      : (adviserAssignmentId ? `&adviserAssignmentId=${adviserAssignmentId}` : '');
    const yearQuery = schoolYearId ? `&schoolYearId=${schoolYearId}` : '';
    const filterParams = `?${scopeQuery}${assignmentQuery}${yearQuery}&userId=${userId}`;

    const [sheetsRes, attRes] = await Promise.all([
      fetch(`${API_BASE_URL}/attendance-sheets/section/${sectionId}${filterParams}`).catch(() => null),
      fetch(`${API_BASE_URL}/attendance/section/${sectionId}${filterParams}`).catch(() => null),
    ]);

    const sheets = sheetsRes?.ok ? await sheetsRes.json().catch(() => []) : [];
    const attRows = attRes?.ok ? await attRes.json().catch(() => []) : [];

    const byDate = {};
    const noClassDaysMap = {};
    if (Array.isArray(sheets)) {
      sheets.forEach(sh => {
        const d = sh.attendance_date?.split("T")[0] || sh.attendance_date;
        if (d) {
          byDate[d] = sh.attendance_sheet_id;
          if (sh.is_no_class || sh.no_class_reason) {
            noClassDaysMap[d] = {
              sheet_id: sh.attendance_sheet_id,
              reason: sh.no_class_reason || "No class declared",
            };
          }
        }
      });
    }

    const attMap = {};
    const remMap = {};
    if (Array.isArray(attRows)) {
      attRows.forEach(row => {
        const d = row.attendance_date?.split("T")[0] || row.attendance_date;
        const key = `${row.student_section_id}-${d}`;
        attMap[key] = row.status;
        if (row.student_id) attMap[`${row.student_id}-${d}`] = row.status;
        if (row.remarks) {
          remMap[row.student_section_id] = row.remarks;
          if (row.student_id) remMap[row.student_id] = row.remarks;
        }
      });
    }

    await setPersistentCache(cacheKey, {
      students: students || [],
      sheetsByDate: byDate,
      noClassDays: noClassDaysMap,
      attendanceMap: attMap,
      remarksMap: remMap,
      adviserAssignment: adviserAssignmentId ? { adviser_assignment_id: adviserAssignmentId, section_id: sectionId } : null,
      teacherAssignment: teacherAssignmentId ? { teacher_assignment_id: teacherAssignmentId, section_id: sectionId } : null,
    }).catch(() => {});
  } catch (err) {
    console.debug(`[CacheWarmer] attendance warm skipped for section ${sectionId}:`, err?.message);
  }
}

/**
 * Main warmer routine: warms all assigned classes, rosters, class records, attendance sheets, and PHIL-IRI
 */
export async function warmUserOfflineData(userId, classes = null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return; // Don't attempt warming when offline
  }
  if (!userId) return;

  const now = Date.now();
  if (isWarming || (lastWarmedUser === userId && now - lastWarmedAt < WARM_INTERVAL_MS)) {
    return;
  }

  isWarming = true;
  lastWarmedUser = userId;
  lastWarmedAt = now;

  try {
    let assignedClasses = classes;
    if (!Array.isArray(assignedClasses) || assignedClasses.length === 0) {
      assignedClasses = await getAdviserSections(userId, { force: true }).catch(() => []);
    }

    if (!Array.isArray(assignedClasses) || assignedClasses.length === 0) {
      return;
    }

    // 1. Gather all unique sections
    const sectionIds = [...new Set(assignedClasses.map(c => c.section_id).filter(Boolean))];
    const sectionStudentsMap = {};

    for (const sId of sectionIds) {
      const students = await warmSectionStudents(sId);
      sectionStudentsMap[sId] = students;
      // Brief pause between requests to keep the main thread snappy
      await new Promise(r => setTimeout(r, 60));
    }

    // 2. Warm Class Records, Attendance, and PHIL-IRI per assigned class
    for (const cls of assignedClasses) {
      const sId = cls.section_id;
      const offId = cls.subject_offering_id || cls.offering_id;
      const isSubj = !cls.isAdviser;
      const students = sectionStudentsMap[sId] || [];

      // Warm Class Record (T1, T2, T3) if subject_offering_id is available
      if (offId && !String(offId).startsWith('sec-')) {
        try {
          await getClassRecord(offId, 'T1', sId, null, null, { force: false }).catch(() => {});
          await new Promise(r => setTimeout(r, 80));
        } catch (_) {}
      }

      // Warm Attendance
      const syId = cls.school_year_id || cls.schoolYearId;
      const tAssignId = cls.teacher_assignment_id;
      const aAssignId = cls.adviser_assignment_id;
      await warmAttendance(sId, isSubj, userId, syId, tAssignId, aAssignId, students);
      await new Promise(r => setTimeout(r, 60));

      // Warm PHIL-IRI for advisory classes
      if (cls.isAdviser && sId && syId) {
        try {
          await getScreeningRecords(sId, syId).catch(() => {});
          await new Promise(r => setTimeout(r, 60));
        } catch (_) {}
      }
    }
  } catch (err) {
    console.debug('[CacheWarmer] Warm completed with non-fatal issues:', err?.message);
  } finally {
    isWarming = false;
  }
}
