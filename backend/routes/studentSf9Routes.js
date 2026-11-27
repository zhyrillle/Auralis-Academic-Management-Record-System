const express = require('express');
const router = express.Router();
const db = require('../config/db');
const MasterSheetService = require('../services/MasterSheetService');
const { dateKey, excludedDates, monthlyNoClassCounts } = require('../services/AttendanceSummaryService');
const { decryptLrn, hashLrn, maskLrn } = require('../utils/encryption');
const { generateSf9Pdf, generateSf9PdfBatch, createZipBuffer } = require('../services/Sf9PdfService');

const MONTH_NAMES = ["Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
const MONTH_INDEX_MAP = {
  5: 0,  // June
  6: 1,  // July
  7: 2,  // August
  8: 3,  // September
  9: 4,  // October
  10: 5, // November
  11: 6, // December
  0: 7,  // January
  1: 8,  // February
  2: 9,  // March
  3: 10  // April
};

// Map frontend 10 subjects template to MasterSheet keys
const FRONTEND_SUBJECT_MAPPING = [
  { code: "fil", name: "Filipino", msKey: "filipino", isHeader: false, isSubSubject: false },
  { code: "eng", name: "English", msKey: "english", isHeader: false, isSubSubject: false },
  { code: "math", name: "Mathematics", msKey: "mathematics", isHeader: false, isSubSubject: false },
  { code: "sci", name: "Science", msKey: "science", isHeader: false, isSubSubject: false },
  { code: "ap", name: "Araling Panlipunan (AP)", msKey: "ap", isHeader: false, isSubSubject: false },
  { code: "ve", name: "Values Education", msKey: "esp", isHeader: false, isSubSubject: false },
  { code: "tle", name: "TLE", msKey: "tle", isHeader: false, isSubSubject: false },
  { code: "mapeh", name: "MAPEH", msKey: "mapeh", isHeader: true, isSubSubject: false },
  { code: "music_arts", name: "Music and Arts", msKey: "mapeh", isHeader: false, isSubSubject: true },
  { code: "pe_health", name: "Physical Education and Health", msKey: "mapeh", isHeader: false, isSubSubject: true }
];

function calculateAge(birthdate) {
  if (birthdate) {
    const dob = new Date(birthdate);
    if (!isNaN(dob.getTime())) {
      const diffMs = Date.now() - dob.getTime();
      const ageDate = new Date(diffMs);
      const computedAge = Math.abs(ageDate.getUTCFullYear() - 1970);
      if (computedAge > 0 && computedAge < 100) return computedAge;
    }
  }
  return "";
}

function formatDateOfBirth(birthdate) {
  if (!birthdate) return "";
  const dob = new Date(birthdate);
  if (isNaN(dob.getTime())) return "";
  return dob.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function getWeekdaysInMonth(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

function getMonthlyClassDays(startsOn, endsOn) {
  let startYear = 2026;
  if (startsOn) {
    const yr = new Date(startsOn).getFullYear();
    if (!isNaN(yr) && yr > 1970) startYear = yr;
  }
  let endYear = startYear + 1;
  if (endsOn) {
    const yr = new Date(endsOn).getFullYear();
    if (!isNaN(yr) && yr > 1970) endYear = yr;
  }

  const monthSpecs = [
    { m: 5, y: startYear },  // Jun
    { m: 6, y: startYear },  // Jul
    { m: 7, y: startYear },  // Aug
    { m: 8, y: startYear },  // Sept
    { m: 9, y: startYear },  // Oct
    { m: 10, y: startYear }, // Nov
    { m: 11, y: startYear }, // Dec
    { m: 0, y: endYear },    // Jan
    { m: 1, y: endYear },    // Feb
    { m: 2, y: endYear },    // Mar
    { m: 3, y: endYear },    // Apr
  ];

  return monthSpecs.map(spec => getWeekdaysInMonth(spec.y, spec.m));
}

function formatSchoolYear(startsOn, endsOn) {
  if (!startsOn) return "";
  let startYear = startsOn;
  if (typeof startsOn === 'string' || startsOn instanceof Date) {
    const yr = new Date(startsOn).getFullYear();
    if (!isNaN(yr) && yr > 1970) startYear = yr;
  }
  let endYear = endsOn;
  if (typeof endsOn === 'string' || endsOn instanceof Date) {
    const yr = new Date(endsOn).getFullYear();
    if (!isNaN(yr) && yr > 1970) endYear = yr;
  }
  if (typeof startYear === 'number' && typeof endYear === 'number') {
    return `${startYear} – ${endYear}`;
  }
  return "";
}

function formatFullName(st) {
  const last = (st.last_name || "").toUpperCase();
  const first = (st.first_name || "").toUpperCase();
  const mid = st.middle_name ? ` ${st.middle_name.toUpperCase()}` : "";
  const ext = st.extension_name ? ` ${st.extension_name.toUpperCase()}` : "";
  return `${last}, ${first}${mid}${ext}`.trim();
}

function formatAddress(st) {
  const parts = [st.street, st.barangay, st.city, st.province].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "";
}

async function fetchStudentSf9Data(cleanId, schoolYearId) {
  // 1. Find Student record
  let student = null;
  let studentSectionId = null;

  const lrnHash = hashLrn(cleanId);
  const [stRows] = await db.execute(
    `SELECT st.*, p.program_code, p.program_name, COALESCE(p.is_specialized, 0) AS is_specialized
     FROM STUDENT st
     LEFT JOIN PROGRAM p ON p.program_id = st.program_id
     WHERE st.student_id = ? OR st.LRN = ? OR st.lrn_hash = ? LIMIT 1`,
    [cleanId, cleanId, lrnHash]
  );

  if (stRows.length > 0) {
    student = stRows[0];
  } else {
    const [ssCheck] = await db.execute(
      `SELECT st.*, p.program_code, p.program_name, COALESCE(p.is_specialized, 0) AS is_specialized, ss.student_section_id
       FROM STUDENT_SECTION ss
       JOIN STUDENT st ON ss.student_id = st.student_id
       LEFT JOIN PROGRAM p ON p.program_id = st.program_id
       WHERE ss.student_section_id = ? LIMIT 1`,
      [cleanId]
    );
    if (ssCheck.length > 0) {
      student = ssCheck[0];
      studentSectionId = ssCheck[0].student_section_id;
    }
  }

  if (!student) {
    return null;
  }

  // Decrypt LRN in backend memory for official DepEd document generation
  student.LRN = decryptLrn(student.LRN);
  student.lrn = student.LRN;

  // 2. Find Student Section & Section details
  let sectionInfo = null;
    if (studentSectionId && schoolYearId === undefined) {
      const [secRows] = await db.execute(
        `SELECT ss.student_section_id, ss.section_id, ss.school_year_id,
                sec.section_name, sec.program_id,
                p.program_code, p.program_name, COALESCE(p.is_specialized, 0) AS is_specialized,
                gl.grade_level_name,
                sy.starts_on, sy.ends_on
         FROM STUDENT_SECTION ss
         JOIN SECTION sec ON ss.section_id = sec.section_id
         LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
         LEFT JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON ss.school_year_id = sy.school_year_id
         WHERE ss.student_section_id = ? LIMIT 1`,
        [studentSectionId]
      );
      if (secRows.length > 0) sectionInfo = secRows[0];
    }

    if (!sectionInfo) {
      const [secRows] = await db.execute(
        `SELECT ss.student_section_id, ss.section_id, ss.school_year_id,
                sec.section_name, sec.program_id,
                p.program_code, p.program_name, COALESCE(p.is_specialized, 0) AS is_specialized,
                gl.grade_level_name,
                sy.starts_on, sy.ends_on
         FROM STUDENT_SECTION ss
         JOIN SECTION sec ON ss.section_id = sec.section_id
         LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
         LEFT JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON ss.school_year_id = sy.school_year_id
         WHERE ss.student_id = ? ${schoolYearId === undefined ? '' : 'AND ss.school_year_id = ?'}
         ORDER BY ss.student_section_id DESC LIMIT 1`,
        schoolYearId === undefined ? [student.student_id] : [student.student_id, schoolYearId]
      );
      if (secRows.length > 0) {
        sectionInfo = secRows[0];
        studentSectionId = sectionInfo.student_section_id;
      }
    }

    if (schoolYearId !== undefined && !sectionInfo) {
      return { notFoundSection: true };
    }

    // 3. Resolve Section Adviser & Principal Details
    let adviserName = "";
    let adviserAssignmentId = null;
    let adviserUserId = null;
    if (sectionInfo) {
      const [saaRows] = await db.execute(
        `SELECT saa.adviser_assignment_id, saa.user_id, u.first_name, u.middle_name, u.last_name, u.extension_name, u.credentials
         FROM SECTION_ADVISER_ASSIGNMENT saa
         JOIN USER u ON saa.user_id = u.user_id
         WHERE saa.section_id = ? AND saa.school_year_id = ?
         LIMIT 1`,
        [sectionInfo.section_id, sectionInfo.school_year_id]
      );
      if (saaRows.length > 0) {
        const u = saaRows[0];
        adviserAssignmentId = u.adviser_assignment_id;
        adviserUserId = u.user_id;
        const baseName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toUpperCase();
        const ext = (u.extension_name || '').trim().toUpperCase();
        const cred = (u.credentials || '').trim().toUpperCase();
        let formatted = ext ? `${baseName}, ${ext}` : baseName;
        if (cred) formatted = `${formatted}, ${cred}`;
        adviserName = formatted;
      }
    }

    let principalName = "";
    const [pRows] = await db.execute(
      `SELECT first_name, last_name, extension_name, credentials FROM USER WHERE role IN ('1', 'principal', '5') LIMIT 1`
    );
    if (pRows.length > 0) {
      const p = pRows[0];
      const baseName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toUpperCase();
      const ext = (p.extension_name || '').trim().toUpperCase();
      const cred = (p.credentials || '').trim().toUpperCase();
      let formatted = ext ? `${baseName}, ${ext}` : baseName;
      if (cred) formatted = `${formatted}, ${cred}`;
      principalName = formatted.toUpperCase();
    }

    // 4. Student Profile Demographics & Program formatting
    const gradeLevelRaw = sectionInfo?.grade_level_name || "";
    const gradeNumMatch = gradeLevelRaw.match(/\d+/);
    const gradeNum = gradeNumMatch ? gradeNumMatch[0] : "";
    const sectionNameStr = sectionInfo?.section_name || "";
    const sexFull = (student.sex === 'M' || student.sex === 'Male') ? 'Male' : (student.sex === 'F' || student.sex === 'Female') ? 'Female' : (student.sex || '');

    const rawProgCode = (student.program_code || sectionInfo?.program_code || "").toUpperCase();
    const rawProgName = student.program_name || sectionInfo?.program_name || "";
    let programDisplay = "";
    if (rawProgName && rawProgCode && rawProgCode !== "EBEC") {
      programDisplay = `${rawProgName} (${rawProgCode})`;
    } else if (rawProgName) {
      programDisplay = rawProgName;
    } else if (rawProgCode && rawProgCode !== "EBEC") {
      programDisplay = rawProgCode;
    } else if (rawProgCode === "EBEC") {
      programDisplay = "Enhanced Basic Education Curriculum (EBEC)";
    }

    const studentProfile = {
      studentId: student.student_id,
      studentSectionId: studentSectionId,
      name: formatFullName(student),
      lrn: String(student.LRN || ""),
      gradeLevel: gradeLevelRaw && sectionNameStr ? `${gradeLevelRaw} ${sectionNameStr}` : (gradeLevelRaw || sectionNameStr || ""),
      grade: gradeNum,
      section: sectionNameStr,
      program: programDisplay,
      sex: sexFull,
      age: calculateAge(student.birthdate),
      schoolYear: formatSchoolYear(sectionInfo?.starts_on, sectionInfo?.ends_on),
      dateOfBirth: formatDateOfBirth(student.birthdate),
      address: formatAddress(student),
      adviserName: adviserName,
      principalName: principalName,
      admittedToGrade: "",
      eligibleForAdmission: ""
    };

    // 5. Fetch Master Sheet Data directly using MasterSheetService
    let masterSheetStudent = null;
    if (adviserAssignmentId && adviserUserId) {
      try {
        const msData = await MasterSheetService.getMasterSheet(adviserAssignmentId, adviserUserId, {
          studentId: student.student_id,
        });
        if (msData && msData.students) {
          masterSheetStudent = msData.students.find(s =>
            Number(s.studentId) === Number(student.student_id) ||
            Number(s.studentSectionId) === Number(studentSectionId) ||
            String(s.lrn) === String(student.LRN)
          );
        }
      } catch (msErr) {
        console.error("MasterSheet calculation error:", msErr);
      }
    }

    // 5b. Fetch direct STUDENT_GRADE records for MAPEH components (MA and PEH)
    let studentGradeRows = [];
    if (studentSectionId || student.student_id) {
      try {
        const [sgRows] = await db.execute(
          `SELECT sg.subject_offering_id, sg.term, sg.mapeh_component, sg.quarterly_grade, sg.remarks,
                  s.subject_code, s.subject_name
           FROM STUDENT_GRADE sg
           INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
           INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
           WHERE ${schoolYearId === undefined
             ? 'sg.student_section_id = ? OR sg.student_id = ?'
             : 'sg.student_section_id = ? AND sg.student_id = ? AND so.school_year_id = ?'}`,
          schoolYearId === undefined
            ? [studentSectionId || 0, student.student_id || 0]
            : [studentSectionId, student.student_id, schoolYearId]
        );
        studentGradeRows = sgRows;
      } catch (sgErr) {
        console.warn("STUDENT_GRADE query error:", sgErr.message);
      }
    }

    const termIndex = (termStr) => {
      const str = String(termStr || '').toUpperCase();
      if (str.includes('1')) return 0;
      if (str.includes('2')) return 1;
      if (str.includes('3')) return 2;
      return null;
    };

    const mapehMA = [null, null, null];
    const mapehPEH = [null, null, null];
    const mapehCombined = [null, null, null];

    studentGradeRows.forEach(row => {
      const isMapehSubject = String(row.subject_code || '').toUpperCase().includes('MAPEH') ||
        String(row.subject_name || '').toUpperCase().includes('MAPEH');
      if (isMapehSubject) {
        const idx = termIndex(row.term);
        if (idx !== null && row.quarterly_grade !== null && row.quarterly_grade !== undefined) {
          const val = Math.round(Number(row.quarterly_grade));
          if (row.mapeh_component === 'MA') {
            mapehMA[idx] = val;
          } else if (row.mapeh_component === 'PEH') {
            mapehPEH[idx] = val;
          } else if (!row.mapeh_component) {
            mapehCombined[idx] = val;
          }
        }
      }
    });

    for (let i = 0; i < 3; i++) {
      if (mapehMA[i] !== null && mapehPEH[i] !== null) {
        mapehCombined[i] = Math.round((mapehMA[i] + mapehPEH[i]) / 2);
      }
    }

    // Build subject list dynamically based on program specialization
    const subjectMapping = [...FRONTEND_SUBJECT_MAPPING];
    if (rawProgCode === "STE") {
      subjectMapping.push({ code: "research", name: "Research", msKey: "research", isHeader: false, isSubSubject: false });
    } else if (rawProgCode === "SPJ") {
      subjectMapping.push({ code: "journalism", name: "Journalism", msKey: "journalism", isHeader: false, isSubSubject: false });
    } else if (rawProgCode === "SPA") {
      subjectMapping.push({ code: "spa_spec", name: "SPA Specialization", msKey: "spa_spec", isHeader: false, isSubSubject: false });
    }

    // Map Master Sheet grades & MAPEH sub-components to subjects list
    const gradesList = subjectMapping.map(tmpl => {
      let t1 = "";
      let t2 = "";
      let t3 = "";
      let finalVal = "";
      let remark = "";

      if (tmpl.code === "music_arts") {
        t1 = mapehMA[0] !== null ? mapehMA[0] : "";
        t2 = mapehMA[1] !== null ? mapehMA[1] : "";
        t3 = mapehMA[2] !== null ? mapehMA[2] : "";
      } else if (tmpl.code === "pe_health") {
        t1 = mapehPEH[0] !== null ? mapehPEH[0] : "";
        t2 = mapehPEH[1] !== null ? mapehPEH[1] : "";
        t3 = mapehPEH[2] !== null ? mapehPEH[2] : "";
      } else if (tmpl.code === "mapeh") {
        t1 = mapehCombined[0] !== null ? mapehCombined[0] : "";
        t2 = mapehCombined[1] !== null ? mapehCombined[1] : "";
        t3 = mapehCombined[2] !== null ? mapehCombined[2] : "";
      }

      if (masterSheetStudent && masterSheetStudent.grades) {
        const g = masterSheetStudent.grades[tmpl.msKey];
        if (g && Array.isArray(g.terms)) {
          if (t1 === "" && Number.isFinite(g.terms[0])) t1 = Math.round(g.terms[0]);
          if (t2 === "" && Number.isFinite(g.terms[1])) t2 = Math.round(g.terms[1]);
          if (t3 === "" && Number.isFinite(g.terms[2])) t3 = Math.round(g.terms[2]);
        }
        if (g && Number.isFinite(g.finalGrade) && tmpl.code !== "music_arts" && tmpl.code !== "pe_health") {
          finalVal = Math.round(g.finalGrade);
        }
      }

      // Compute final grade when terms are complete
      if (typeof t1 === 'number' && typeof t2 === 'number' && typeof t3 === 'number') {
        if (finalVal === "") {
          finalVal = Math.round((t1 + t2 + t3) / 3);
        }
        remark = finalVal >= 75 ? "Passed" : "Failed";
      } else {
        finalVal = "";
        remark = "";
      }

      return {
        code: tmpl.code,
        name: tmpl.name,
        t1: t1,
        t2: t2,
        t3: t3,
        final: finalVal,
        remark: remark,
        isHeader: tmpl.isHeader,
        isSubSubject: tmpl.isSubSubject
      };
    });

    // Calculate General Average & Honor Status ONLY if ALL main subjects have complete final grades
    const mainSubjGrades = gradesList.filter(g => !g.isHeader && !g.isSubSubject);
    const allMainSubjsComplete = mainSubjGrades.length > 0 && mainSubjGrades.every(g => typeof g.final === 'number');

    let overallFinalAvg = "";
    let honorStatus = "";

    if (allMainSubjsComplete) {
      if (masterSheetStudent?.generalAverage && Number.isFinite(masterSheetStudent.generalAverage)) {
        overallFinalAvg = Math.round(masterSheetStudent.generalAverage);
      } else {
        const totalFinal = mainSubjGrades.reduce((sum, g) => sum + g.final, 0);
        overallFinalAvg = Math.round(totalFinal / mainSubjGrades.length);
      }

      if (overallFinalAvg >= 98) honorStatus = "With Highest Honors";
      else if (overallFinalAvg >= 95) honorStatus = "With High Honors";
      else if (overallFinalAvg >= 90) honorStatus = "With Honors";
      else honorStatus = "Passed";
    }

    studentProfile.termGrade = overallFinalAvg !== "" ? overallFinalAvg : "";
    studentProfile.honorStatus = honorStatus;

    // 6. Fetch Section Adviser's Attendance Form Monthly Summary & Class Days
    const monthlyClassDays = getMonthlyClassDays(sectionInfo?.starts_on, sectionInfo?.ends_on);
    const rawPresent = new Array(11).fill(0);
    const rawLate = new Array(11).fill(0);
    const rawAbsent = new Array(11).fill(0);
    const monthlyDaysPresent = new Array(11).fill(0);
    const monthlyDaysAbsent = new Array(11).fill(0);

    if (sectionInfo && studentSectionId) {
      const [sheetRows] = await db.execute(
        `SELECT ash.attendance_sheet_id, ash.attendance_date, ash.no_class_reason
         FROM ATTENDANCE_SHEET ash
         LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON ash.adviser_assignment_id = saa.adviser_assignment_id
         WHERE saa.section_id = ? AND saa.school_year_id = ? AND ash.attendance_scope = 'SECTION'`,
        [sectionInfo.section_id, sectionInfo.school_year_id]
      );

      const noClassDates = excludedDates(sheetRows);
      const exclusionsByMonth = monthlyNoClassCounts(sheetRows, sectionInfo.starts_on, sectionInfo.ends_on);
      exclusionsByMonth.forEach((count, index) => { monthlyClassDays[index] = Math.max(0, monthlyClassDays[index] - count); });
      const classSheets = sheetRows.filter(sheet => !noClassDates.has(dateKey(sheet.attendance_date)));
      if (classSheets.length > 0) {
        const sheetIds = classSheets.map(s => s.attendance_sheet_id);

        const ph = sheetIds.map(() => '?').join(',');
        const [attRows] = await db.execute(
          `SELECT attendance_sheet_id, status FROM ATTENDANCE
           WHERE attendance_sheet_id IN (${ph}) AND student_section_id = ?`,
          [...sheetIds, studentSectionId]
        );

        const statusBySheetId = new Map(attRows.map(row => [row.attendance_sheet_id, row.status]));

        // Group class sheets by distinct date (deduplicating multiple sheets on the same date)
        const sheetsByDate = new Map();
        for (const sheet of classSheets) {
          const dStr = dateKey(sheet.attendance_date);
          if (!sheetsByDate.has(dStr)) {
            sheetsByDate.set(dStr, { dateStr: dStr, sheetIds: [] });
          }
          sheetsByDate.get(dStr).sheetIds.push(sheet.attendance_sheet_id);
        }

        const activeMonths = new Set();
        // For each unique recorded class day, evaluate learner attendance:
        for (const [, { dateStr, sheetIds: daySheetIds }] of sheetsByDate) {
          const parts = dateStr.split('-');
          const monthNum = parseInt(parts[1], 10) - 1;
          const mIndex = MONTH_INDEX_MAP[monthNum];
          if (mIndex === undefined) continue;
          activeMonths.add(mIndex);

          const statuses = daySheetIds.map(id => statusBySheetId.get(id)).filter(Boolean);
          if (statuses.includes('P')) {
            rawPresent[mIndex] += 1;
          } else if (statuses.includes('L')) {
            rawLate[mIndex] += 1;
          } else if (statuses.includes('A')) {
            rawAbsent[mIndex] += 1;
          }
        }

        const maxActiveMonth = activeMonths.size > 0 ? Math.max(...activeMonths) : -1;
        let accumulatedLates = 0;

        for (let i = 0; i < 11; i++) {
          accumulatedLates += rawLate[i];
          const convertedAbsent = Math.floor(accumulatedLates / 3);
          accumulatedLates = accumulatedLates % 3; // remainder lates carry over to next month

          monthlyDaysPresent[i] = Math.max(0, (rawPresent[i] + rawLate[i]) - convertedAbsent);

          // In SF9, blank cells count as absent: Days Absent = Class Days - Days Present
          if (i <= maxActiveMonth) {
            monthlyDaysAbsent[i] = Math.max(0, monthlyClassDays[i] - monthlyDaysPresent[i]);
          } else {
            monthlyDaysAbsent[i] = 0;
          }
        }
      }
    }

    const attendanceData = {
      months: MONTH_NAMES,
      classDays: monthlyClassDays,
      daysPresent: monthlyDaysPresent,
      daysAbsent: monthlyDaysAbsent
    };

    studentProfile.daysPresent = monthlyDaysPresent.reduce((a, b) => a + b, 0);
    studentProfile.daysAbsent = monthlyDaysAbsent.reduce((a, b) => a + b, 0);

    let missingActivities = 0;
    if (studentSectionId) {
      const [mRows] = await db.execute(
        `SELECT COUNT(*) as count FROM SCORE WHERE student_section_id = ? AND score_status = 'MISSING'`,
        [studentSectionId]
      );
      missingActivities = mRows[0]?.count || 0;
    }
    studentProfile.missingActivities = missingActivities;

    return {
      studentProfile,
      grades: gradesList,
      attendanceData
    };
}

// GET /student/:identifier - General UI endpoint (LRN is strictly masked for data privacy)
router.get('/student/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const cleanId = String(identifier).trim();
    const schoolYearId = req.query.schoolYearId;
    if (schoolYearId !== undefined && (typeof schoolYearId !== 'string' || !/^[1-9]\d*$/.test(schoolYearId))) {
      return res.status(400).json({ error: "Invalid school year" });
    }

    const data = await fetchStudentSf9Data(cleanId, schoolYearId);
    if (!data) {
      return res.status(404).json({ error: "Student not found" });
    }
    if (data.notFoundSection) {
      return res.status(404).json({ error: "Student is not enrolled in the selected school year" });
    }

    // Mask LRN for all UI displays (e.g. "123456******") so plaintext LRN never enters browser state or DOM
    const maskedProfile = {
      ...data.studentProfile,
      lrn: maskLrn(data.studentProfile.lrn),
    };

    return res.json({
      studentProfile: maskedProfile,
      grades: data.grades,
      attendanceData: data.attendanceData,
    });
  } catch (error) {
    console.error("Error fetching SF9 details:", error);
    return res.status(500).json({ error: "Failed to fetch student SF9 details", message: error.message });
  }
});

// POST /student/:identifier/export-pdf - Official DepEd SF9 PDF generation with unmasked LRN
router.post('/student/:identifier/export-pdf', async (req, res) => {
  try {
    const { identifier } = req.params;
    const cleanId = String(identifier).trim();
    const schoolYearId = req.query.schoolYearId;
    if (schoolYearId !== undefined && (typeof schoolYearId !== 'string' || !/^[1-9]\d*$/.test(schoolYearId))) {
      return res.status(400).json({ error: "Invalid school year" });
    }

    const data = await fetchStudentSf9Data(cleanId, schoolYearId);
    if (!data) {
      return res.status(404).json({ error: "Student not found" });
    }
    if (data.notFoundSection) {
      return res.status(404).json({ error: "Student is not enrolled in the selected school year" });
    }

    const comments = (req.body && typeof req.body.comments === 'object') ? req.body.comments : {};

    // Plaintext 12-digit LRN is used strictly in backend memory to compile the official DepEd PDF
    const pdfBuffer = await generateSf9Pdf({
      studentProfile: data.studentProfile,
      grades: data.grades,
      attendanceData: data.attendanceData,
      comments,
    });

    const nameParts = (data.studentProfile.name || "STUDENT").split(',');
    const lastName = nameParts[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    const fileName = `${lastName || 'STUDENT'}_SF9.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating SF9 PDF:", error);
    return res.status(500).json({ error: "Failed to generate SF9 PDF", message: error.message });
  }
});

// GET /student/:identifier/export-pdf - Direct browser preview / print endpoint
router.get('/student/:identifier/export-pdf', async (req, res) => {
  try {
    const { identifier } = req.params;
    const cleanId = String(identifier).trim();
    const schoolYearId = req.query.schoolYearId;
    if (schoolYearId !== undefined && (typeof schoolYearId !== 'string' || !/^[1-9]\d*$/.test(schoolYearId))) {
      return res.status(400).json({ error: "Invalid school year" });
    }

    const data = await fetchStudentSf9Data(cleanId, schoolYearId);
    if (!data) {
      return res.status(404).json({ error: "Student not found" });
    }
    if (data.notFoundSection) {
      return res.status(404).json({ error: "Student is not enrolled in the selected school year" });
    }

    const comments = {
      term1: req.query.term1 || "",
      term2: req.query.term2 || "",
      term3: req.query.term3 || "",
    };

    const pdfBuffer = await generateSf9Pdf({
      studentProfile: data.studentProfile,
      grades: data.grades,
      attendanceData: data.attendanceData,
      comments,
    });

    const nameParts = (data.studentProfile.name || "STUDENT").split(',');
    const lastName = nameParts[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    const fileName = `${lastName || 'STUDENT'}_SF9.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating SF9 PDF:", error);
    return res.status(500).json({ error: "Failed to generate SF9 PDF", message: error.message });
  }
});

function formatOfficialName(person) {
  if (!person) return "";
  const baseName = `${person.first_name || ''} ${person.last_name || ''}`.trim().toUpperCase();
  const ext = (person.extension_name || '').trim().toUpperCase();
  const cred = (person.credentials || '').trim().toUpperCase();
  let formatted = ext ? `${baseName}, ${ext}` : baseName;
  if (cred) formatted = `${formatted}, ${cred}`;
  return formatted.toUpperCase();
}

function buildStudentGradesSummary(rawProgCode, masterSheetStudent, studentGradeRows) {
  const termIndex = (termStr) => {
    const str = String(termStr || '').toUpperCase();
    if (str.includes('1')) return 0;
    if (str.includes('2')) return 1;
    if (str.includes('3')) return 2;
    return null;
  };

  const mapehMA = [null, null, null];
  const mapehPEH = [null, null, null];
  const mapehCombined = [null, null, null];

  studentGradeRows.forEach(row => {
    const isMapehSubject = String(row.subject_code || '').toUpperCase().includes('MAPEH') ||
      String(row.subject_name || '').toUpperCase().includes('MAPEH');
    if (isMapehSubject) {
      const idx = termIndex(row.term);
      if (idx !== null && row.quarterly_grade !== null && row.quarterly_grade !== undefined) {
        const val = Math.round(Number(row.quarterly_grade));
        if (row.mapeh_component === 'MA') {
          mapehMA[idx] = val;
        } else if (row.mapeh_component === 'PEH') {
          mapehPEH[idx] = val;
        } else if (!row.mapeh_component) {
          mapehCombined[idx] = val;
        }
      }
    }
  });

  for (let i = 0; i < 3; i++) {
    if (mapehMA[i] !== null && mapehPEH[i] !== null) {
      mapehCombined[i] = Math.round((mapehMA[i] + mapehPEH[i]) / 2);
    }
  }

  const subjectMapping = [...FRONTEND_SUBJECT_MAPPING];
  if (rawProgCode === "STE") {
    subjectMapping.push({ code: "research", name: "Research", msKey: "research", isHeader: false, isSubSubject: false });
  } else if (rawProgCode === "SPJ") {
    subjectMapping.push({ code: "journalism", name: "Journalism", msKey: "journalism", isHeader: false, isSubSubject: false });
  } else if (rawProgCode === "SPA") {
    subjectMapping.push({ code: "spa_spec", name: "SPA Specialization", msKey: "spa_spec", isHeader: false, isSubSubject: false });
  }

  const gradesList = subjectMapping.map(tmpl => {
    let t1 = "";
    let t2 = "";
    let t3 = "";
    let finalVal = "";
    let remark = "";

    if (tmpl.code === "music_arts") {
      t1 = mapehMA[0] !== null ? mapehMA[0] : "";
      t2 = mapehMA[1] !== null ? mapehMA[1] : "";
      t3 = mapehMA[2] !== null ? mapehMA[2] : "";
    } else if (tmpl.code === "pe_health") {
      t1 = mapehPEH[0] !== null ? mapehPEH[0] : "";
      t2 = mapehPEH[1] !== null ? mapehPEH[1] : "";
      t3 = mapehPEH[2] !== null ? mapehPEH[2] : "";
    } else if (tmpl.code === "mapeh") {
      t1 = mapehCombined[0] !== null ? mapehCombined[0] : "";
      t2 = mapehCombined[1] !== null ? mapehCombined[1] : "";
      t3 = mapehCombined[2] !== null ? mapehCombined[2] : "";
    }

    if (masterSheetStudent && masterSheetStudent.grades) {
      const g = masterSheetStudent.grades[tmpl.msKey];
      if (g && Array.isArray(g.terms)) {
        if (t1 === "" && Number.isFinite(g.terms[0])) t1 = Math.round(g.terms[0]);
        if (t2 === "" && Number.isFinite(g.terms[1])) t2 = Math.round(g.terms[1]);
        if (t3 === "" && Number.isFinite(g.terms[2])) t3 = Math.round(g.terms[2]);
      }
      if (g && Number.isFinite(g.finalGrade) && tmpl.code !== "music_arts" && tmpl.code !== "pe_health") {
        finalVal = Math.round(g.finalGrade);
      }
    }

    if (typeof t1 === 'number' && typeof t2 === 'number' && typeof t3 === 'number') {
      if (finalVal === "") {
        finalVal = Math.round((t1 + t2 + t3) / 3);
      }
      remark = finalVal >= 75 ? "Passed" : "Failed";
    } else {
      finalVal = "";
      remark = "";
    }

    return {
      code: tmpl.code,
      name: tmpl.name,
      t1,
      t2,
      t3,
      final: finalVal,
      remark,
      isHeader: tmpl.isHeader,
      isSubSubject: tmpl.isSubSubject
    };
  });

  const mainSubjGrades = gradesList.filter(g => !g.isHeader && !g.isSubSubject);
  const allMainSubjsComplete = mainSubjGrades.length > 0 && mainSubjGrades.every(g => typeof g.final === 'number');

  let overallFinalAvg = "";
  let honorStatus = "";

  if (allMainSubjsComplete) {
    if (masterSheetStudent?.generalAverage && Number.isFinite(masterSheetStudent.generalAverage)) {
      overallFinalAvg = Math.round(masterSheetStudent.generalAverage);
    } else {
      const totalFinal = mainSubjGrades.reduce((sum, g) => sum + g.final, 0);
      overallFinalAvg = Math.round(totalFinal / mainSubjGrades.length);
    }

    if (overallFinalAvg >= 98) honorStatus = "With Highest Honors";
    else if (overallFinalAvg >= 95) honorStatus = "With High Honors";
    else if (overallFinalAvg >= 90) honorStatus = "With Honors";
    else honorStatus = "Passed";
  }

  return {
    gradesList,
    termGrade: overallFinalAvg !== "" ? overallFinalAvg : "",
    honorStatus,
  };
}

function buildStudentAttendanceSummary(monthlyClassDaysBase, sheetsByDate, attRows) {
  const monthlyClassDays = [...monthlyClassDaysBase];
  const rawPresent = new Array(11).fill(0);
  const rawLate = new Array(11).fill(0);
  const rawAbsent = new Array(11).fill(0);
  const monthlyDaysPresent = new Array(11).fill(0);
  const monthlyDaysAbsent = new Array(11).fill(0);

  if (sheetsByDate.size > 0) {
    const statusBySheetId = new Map(attRows.map(row => [row.attendance_sheet_id, row.status]));
    const activeMonths = new Set();

    for (const [, { dateStr, sheetIds: daySheetIds }] of sheetsByDate) {
      const parts = dateStr.split('-');
      const monthNum = parseInt(parts[1], 10) - 1;
      const mIndex = MONTH_INDEX_MAP[monthNum];
      if (mIndex === undefined) continue;
      activeMonths.add(mIndex);

      const statuses = daySheetIds.map(id => statusBySheetId.get(id)).filter(Boolean);
      if (statuses.includes('P')) {
        rawPresent[mIndex] += 1;
      } else if (statuses.includes('L')) {
        rawLate[mIndex] += 1;
      } else if (statuses.includes('A')) {
        rawAbsent[mIndex] += 1;
      }
    }

    const maxActiveMonth = activeMonths.size > 0 ? Math.max(...activeMonths) : -1;
    let accumulatedLates = 0;

    for (let i = 0; i < 11; i++) {
      accumulatedLates += rawLate[i];
      const convertedAbsent = Math.floor(accumulatedLates / 3);
      accumulatedLates = accumulatedLates % 3;

      monthlyDaysPresent[i] = Math.max(0, (rawPresent[i] + rawLate[i]) - convertedAbsent);
      if (i <= maxActiveMonth) {
        monthlyDaysAbsent[i] = Math.max(0, monthlyClassDays[i] - monthlyDaysPresent[i]);
      } else {
        monthlyDaysAbsent[i] = 0;
      }
    }
  }

  return {
    attendanceData: {
      months: MONTH_NAMES,
      classDays: monthlyClassDays,
      daysPresent: monthlyDaysPresent,
      daysAbsent: monthlyDaysAbsent,
    },
    daysPresent: monthlyDaysPresent.reduce((a, b) => a + b, 0),
    daysAbsent: monthlyDaysAbsent.reduce((a, b) => a + b, 0),
  };
}

/**
 * Fetches SF9 data for EVERY active student in a section using batched section-wide SQL queries
 * (1 MasterSheet calculation + 1 MAPEH grades query + 1 attendance batch instead of N per-student loops).
 */
async function fetchSectionSf9DataBatch(sectionId, schoolYearId) {
  let targetSchoolYearId = schoolYearId ? Number(schoolYearId) : null;
  if (!targetSchoolYearId) {
    const [syRows] = await db.execute(
      `SELECT ss.school_year_id
       FROM STUDENT_SECTION ss
       JOIN STUDENT st ON ss.student_id = st.student_id
       WHERE ss.section_id = ?
         AND ss.school_year_id IS NOT NULL
         AND (st.status = 'ACTIVE' OR st.status IS NULL)
       ORDER BY ss.school_year_id DESC
       LIMIT 1`,
      [sectionId]
    );
    if (syRows.length > 0 && syRows[0].school_year_id != null) {
      targetSchoolYearId = Number(syRows[0].school_year_id);
    }
  }
  if (!targetSchoolYearId) {
    const [fallbackSy] = await db.execute(
      `SELECT school_year_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ? AND school_year_id IS NOT NULL ORDER BY school_year_id DESC LIMIT 1`,
      [sectionId]
    );
    if (fallbackSy.length > 0 && fallbackSy[0].school_year_id != null) {
      targetSchoolYearId = Number(fallbackSy[0].school_year_id);
    }
  }

  const [[secRows], [studentRows], [saaRows], [pRows]] = await Promise.all([
    db.execute(
      `SELECT sec.section_id, sec.section_name, sec.program_id,
              p.program_code, p.program_name, COALESCE(p.is_specialized, 0) AS is_specialized,
              gl.grade_level_name,
              sy.school_year_id, sy.starts_on, sy.ends_on
       FROM SECTION sec
       LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
       LEFT JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
       LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = ?
       WHERE sec.section_id = ? LIMIT 1`,
      [targetSchoolYearId || 0, sectionId]
    ),
    db.execute(
      `SELECT ss.student_section_id, ss.section_id, ss.school_year_id,
              st.*, p.program_code AS student_program_code, p.program_name AS student_program_name
       FROM STUDENT_SECTION ss
       JOIN STUDENT st ON ss.student_id = st.student_id
       LEFT JOIN PROGRAM p ON p.program_id = st.program_id
       WHERE ss.section_id = ? ${targetSchoolYearId ? 'AND ss.school_year_id = ?' : ''}
         AND (st.status = 'ACTIVE' OR st.status IS NULL)
       ORDER BY st.last_name ASC, st.first_name ASC, st.student_id ASC`,
      targetSchoolYearId ? [sectionId, targetSchoolYearId] : [sectionId]
    ),
    db.execute(
      `SELECT saa.adviser_assignment_id, saa.user_id, u.first_name, u.middle_name, u.last_name, u.extension_name, u.credentials
       FROM SECTION_ADVISER_ASSIGNMENT saa
       JOIN USER u ON saa.user_id = u.user_id
       WHERE saa.section_id = ? ${targetSchoolYearId ? 'AND saa.school_year_id = ?' : ''}
       ORDER BY saa.adviser_assignment_id DESC
       LIMIT 1`,
      targetSchoolYearId ? [sectionId, targetSchoolYearId] : [sectionId]
    ),
    db.execute(
      `SELECT first_name, last_name, extension_name, credentials FROM USER WHERE role IN ('1', 'principal', '5') LIMIT 1`
    ),
  ]);

  const sectionInfo = secRows[0] || null;
  if (!sectionInfo || studentRows.length === 0) {
    return { sectionInfo, items: [] };
  }

  const adviserRow = saaRows[0] || null;
  const adviserAssignmentId = adviserRow?.adviser_assignment_id || null;
  const adviserUserId = adviserRow?.user_id || null;
  const adviserName = formatOfficialName(adviserRow);
  const principalName = formatOfficialName(pRows[0] || null);

  const studentSectionIds = studentRows.map(r => Number(r.student_section_id)).filter(Boolean);
  const studentIds = studentRows.map(r => Number(r.student_id)).filter(Boolean);
  const ssPlaceholders = studentSectionIds.map(() => '?').join(',');

  // Fetch MasterSheet ONCE + MAPEH grades ONCE + section attendance sheets ONCE in parallel
  const [msResult, sgResult, sheetResult] = await Promise.all([
    adviserAssignmentId && adviserUserId && typeof MasterSheetService.getMasterSheet === 'function'
      ? MasterSheetService.getMasterSheet(adviserAssignmentId, adviserUserId).catch(err => {
          console.error("Batch MasterSheet calculation error:", err);
          return null;
        })
      : Promise.resolve(null),
    studentSectionIds.length > 0
      ? db.execute(
          `SELECT sg.student_section_id, sg.student_id, sg.subject_offering_id, sg.term,
                  sg.mapeh_component, sg.quarterly_grade, sg.remarks,
                  s.subject_code, s.subject_name
           FROM STUDENT_GRADE sg
           INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
           INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
           WHERE ${targetSchoolYearId ? 'so.school_year_id = ? AND ' : ''}(sg.student_section_id IN (${ssPlaceholders}) OR sg.student_id IN (${studentIds.map(() => '?').join(',')}))`,
          targetSchoolYearId ? [targetSchoolYearId, ...studentSectionIds, ...studentIds] : [...studentSectionIds, ...studentIds]
        ).then(([rows]) => rows).catch(err => {
          console.warn("Batch STUDENT_GRADE query error:", err.message);
          return [];
        })
      : Promise.resolve([]),
    db.execute(
      `SELECT ash.attendance_sheet_id, ash.attendance_date, ash.no_class_reason
       FROM ATTENDANCE_SHEET ash
       LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON ash.adviser_assignment_id = saa.adviser_assignment_id
       WHERE saa.section_id = ? ${targetSchoolYearId ? 'AND saa.school_year_id = ?' : ''} AND ash.attendance_scope = 'SECTION'`,
      targetSchoolYearId ? [sectionId, targetSchoolYearId] : [sectionId]
    ).then(([rows]) => rows).catch(err => {
      console.warn("Batch ATTENDANCE_SHEET query error:", err.message);
      return [];
    }),
  ]);

  // Index MasterSheet students for O(1) lookup
  const msByStudentId = new Map();
  const msByEnrollmentId = new Map();
  if (msResult && Array.isArray(msResult.students)) {
    for (const s of msResult.students) {
      if (s.studentId != null) msByStudentId.set(Number(s.studentId), s);
      if (s.studentSectionId != null) msByEnrollmentId.set(Number(s.studentSectionId), s);
    }
  }

  // Group MAPEH / student grades by student_section_id and student_id
  const gradesByEnrollment = new Map();
  const gradesByStudent = new Map();
  for (const row of sgResult) {
    if (row.student_section_id != null) {
      const k = Number(row.student_section_id);
      if (!gradesByEnrollment.has(k)) gradesByEnrollment.set(k, []);
      gradesByEnrollment.get(k).push(row);
    }
    if (row.student_id != null) {
      const k = Number(row.student_id);
      if (!gradesByStudent.has(k)) gradesByStudent.set(k, []);
      gradesByStudent.get(k).push(row);
    }
  }

  // Precompute section-wide attendance sheet calendar & fetch ALL student attendance rows in ONE query
  const monthlyClassDaysBase = getMonthlyClassDays(sectionInfo.starts_on, sectionInfo.ends_on);
  const noClassDates = excludedDates(sheetResult);
  const exclusionsByMonth = monthlyNoClassCounts(sheetResult, sectionInfo.starts_on, sectionInfo.ends_on);
  exclusionsByMonth.forEach((count, index) => {
    monthlyClassDaysBase[index] = Math.max(0, monthlyClassDaysBase[index] - count);
  });
  const classSheets = sheetResult.filter(sheet => !noClassDates.has(dateKey(sheet.attendance_date)));
  const sheetsByDate = new Map();
  for (const sheet of classSheets) {
    const dStr = dateKey(sheet.attendance_date);
    if (!sheetsByDate.has(dStr)) sheetsByDate.set(dStr, { dateStr: dStr, sheetIds: [] });
    sheetsByDate.get(dStr).sheetIds.push(sheet.attendance_sheet_id);
  }

  const attendanceByEnrollment = new Map();
  if (classSheets.length > 0 && studentSectionIds.length > 0) {
    const sheetIds = classSheets.map(s => s.attendance_sheet_id);
    const sheetPh = sheetIds.map(() => '?').join(',');
    const [attRows] = await db.execute(
      `SELECT attendance_sheet_id, student_section_id, status
       FROM ATTENDANCE
       WHERE attendance_sheet_id IN (${sheetPh}) AND student_section_id IN (${ssPlaceholders})`,
      [...sheetIds, ...studentSectionIds]
    );
    for (const row of attRows) {
      const k = Number(row.student_section_id);
      if (!attendanceByEnrollment.has(k)) attendanceByEnrollment.set(k, []);
      attendanceByEnrollment.get(k).push(row);
    }
  }

  const gradeLevelRaw = sectionInfo.grade_level_name || "";
  const gradeNumMatch = gradeLevelRaw.match(/\d+/);
  const gradeNum = gradeNumMatch ? gradeNumMatch[0] : "";
  const sectionNameStr = sectionInfo.section_name || "";
  const schoolYearLabel = formatSchoolYear(sectionInfo.starts_on, sectionInfo.ends_on);

  const usedFileNames = new Set();
  const makeUniquePdfName = (base) => {
    let name = `${base}.pdf`;
    let counter = 1;
    while (usedFileNames.has(name)) {
      name = `${base}_${counter}.pdf`;
      counter++;
    }
    usedFileNames.add(name);
    return name;
  };

  const items = studentRows.map((student) => {
    const enrollmentId = Number(student.student_section_id);
    const studentId = Number(student.student_id);
    const decryptedLrn = decryptLrn(student.LRN);
    const sexFull = (student.sex === 'M' || student.sex === 'Male')
      ? 'Male'
      : (student.sex === 'F' || student.sex === 'Female')
      ? 'Female'
      : (student.sex || '');

    const rawProgCode = (student.student_program_code || sectionInfo.program_code || "").toUpperCase();
    const rawProgName = student.student_program_name || sectionInfo.program_name || "";
    let programDisplay = "";
    if (rawProgName && rawProgCode && rawProgCode !== "EBEC") {
      programDisplay = `${rawProgName} (${rawProgCode})`;
    } else if (rawProgName) {
      programDisplay = rawProgName;
    } else if (rawProgCode && rawProgCode !== "EBEC") {
      programDisplay = rawProgCode;
    } else if (rawProgCode === "EBEC") {
      programDisplay = "Enhanced Basic Education Curriculum (EBEC)";
    }

    const msStudent = msByEnrollmentId.get(enrollmentId) || msByStudentId.get(studentId) || null;
    const studentGrades = gradesByEnrollment.get(enrollmentId) || gradesByStudent.get(studentId) || [];
    const { gradesList, termGrade, honorStatus } = buildStudentGradesSummary(rawProgCode, msStudent, studentGrades);
    const { attendanceData, daysPresent, daysAbsent } = buildStudentAttendanceSummary(
      monthlyClassDaysBase,
      sheetsByDate,
      attendanceByEnrollment.get(enrollmentId) || []
    );

    const studentProfile = {
      studentId,
      studentSectionId: enrollmentId,
      name: formatFullName(student),
      lrn: String(decryptedLrn || ""),
      gradeLevel: gradeLevelRaw && sectionNameStr ? `${gradeLevelRaw} ${sectionNameStr}` : (gradeLevelRaw || sectionNameStr || ""),
      grade: gradeNum,
      section: sectionNameStr,
      program: programDisplay,
      sex: sexFull,
      age: calculateAge(student.birthdate),
      schoolYear: schoolYearLabel,
      dateOfBirth: formatDateOfBirth(student.birthdate),
      address: formatAddress(student),
      adviserName,
      principalName,
      admittedToGrade: "",
      eligibleForAdmission: "",
      termGrade,
      honorStatus,
      daysPresent,
      daysAbsent,
    };

    const lastPart = String(student.last_name || "STUDENT").trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "") || "STUDENT";
    const firstPart = String(student.first_name || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    const baseName = firstPart ? `${lastPart}_${firstPart}_SF9` : `${lastPart}_SF9`;

    return {
      fileName: makeUniquePdfName(baseName),
      options: {
        studentProfile,
        grades: gradesList,
        attendanceData,
        comments: { term1: "", term2: "", term3: "" },
      },
    };
  });

  return { sectionInfo, items };
}

// POST /section/:sectionId/export-pdf-zip - Bulk official DepEd SF9 PDFs for an entire section in one ZIP
router.post('/section/:sectionId/export-pdf-zip', async (req, res) => {
  try {
    const cleanSectionId = String(req.params.sectionId || '').trim();
    if (!/^[1-9]\d*$/.test(cleanSectionId)) {
      return res.status(400).json({ error: "Invalid section ID" });
    }
    const schoolYearId = req.query.schoolYearId;
    if (schoolYearId !== undefined && (typeof schoolYearId !== 'string' || !/^[1-9]\d*$/.test(schoolYearId))) {
      return res.status(400).json({ error: "Invalid school year" });
    }

    const { sectionInfo, items } = await fetchSectionSf9DataBatch(Number(cleanSectionId), schoolYearId);
    if (!sectionInfo || items.length === 0) {
      return res.status(404).json({ error: "No students found in this section.", code: "NO_STUDENTS_FOUND" });
    }

    const comments = (req.body && typeof req.body.comments === 'object') ? req.body.comments : null;
    if (comments) {
      for (const item of items) {
        item.options.comments = comments;
      }
    }

    const renderedFiles = typeof generateSf9PdfBatch === 'function'
      ? await generateSf9PdfBatch(items, { concurrency: 1 })
      : await Promise.all(
          items.map(async (item) => ({
            fileName: item.fileName,
            buffer: await generateSf9Pdf(item.options),
          }))
        );

    const zipBuffer = createZipBuffer(renderedFiles);
    const cleanSectionName = String(sectionInfo.section_name || "Advisory_Class")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const zipFileName = `${cleanSectionName}_All_SF9_Report_Cards.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('X-Sf9-Count', String(renderedFiles.length));
    return res.send(zipBuffer);
  } catch (error) {
    console.error("Error generating bulk section SF9 ZIP:", error);
    return res.status(500).json({ error: "Failed to generate bulk SF9 ZIP", message: error.message });
  }
});

// POST /section/:sectionId/export-pdf-stream - Streams each SF9 PDF as NDJSON so UI shows live per-student progress
router.post('/section/:sectionId/export-pdf-stream', async (req, res) => {
  try {
    const cleanSectionId = String(req.params.sectionId || '').trim();
    if (!/^[1-9]\d*$/.test(cleanSectionId)) {
      return res.status(400).json({ error: "Invalid section ID" });
    }
    const schoolYearId = req.query.schoolYearId;
    if (schoolYearId !== undefined && (typeof schoolYearId !== 'string' || !/^[1-9]\d*$/.test(schoolYearId))) {
      return res.status(400).json({ error: "Invalid school year" });
    }

    const { sectionInfo, items } = await fetchSectionSf9DataBatch(Number(cleanSectionId), schoolYearId);
    if (!sectionInfo || items.length === 0) {
      return res.status(404).json({ error: "No students found in this section.", code: "NO_STUDENTS_FOUND" });
    }

    const comments = (req.body && typeof req.body.comments === 'object') ? req.body.comments : null;
    if (comments) {
      for (const item of items) {
        item.options.comments = comments;
      }
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    res.write(`${JSON.stringify({
      type: 'start',
      total: items.length,
      sectionName: sectionInfo.section_name || '',
      firstStudentName: items[0]?.options?.studentProfile?.name || '',
    })}\n`);

    let streamedCount = 0;
    const onProgress = ({ completed, total, fileName, studentName, buffer }) => {
      streamedCount += 1;
      res.write(`${JSON.stringify({
        type: 'file',
        completed,
        total,
        fileName,
        studentName,
        data: buffer.toString('base64'),
      })}\n`);
    };

    if (typeof generateSf9PdfBatch === 'function') {
      await generateSf9PdfBatch(items, { concurrency: 1, onProgress, retainBuffers: false });
    } else {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const pdfBytes = await generateSf9Pdf(item.options);
        const buffer = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
        onProgress({
          completed: i + 1,
          total: items.length,
          fileName: item.fileName,
          studentName: item.options?.studentProfile?.name || item.fileName,
          buffer,
        });
      }
    }

    res.write(`${JSON.stringify({ type: 'done', count: streamedCount })}\n`);
    return res.end();
  } catch (error) {
    console.error("Error streaming bulk section SF9 PDFs:", error);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to stream SF9 PDFs", message: error.message });
    }
    res.write(`${JSON.stringify({ type: 'error', error: error.message || 'Failed to generate SF9 PDFs' })}\n`);
    return res.end();
  }
});

// POST /section/:sectionId/batch-data - Single batched section SF9 payload for fast client-side vector PDF export
router.post('/section/:sectionId/batch-data', async (req, res) => {
  try {
    const cleanSectionId = String(req.params.sectionId || '').trim();
    if (!/^[1-9]\d*$/.test(cleanSectionId)) {
      return res.status(400).json({ error: "Invalid section ID" });
    }
    const schoolYearId = req.query.schoolYearId;
    if (schoolYearId !== undefined && (typeof schoolYearId !== 'string' || !/^[1-9]\d*$/.test(schoolYearId))) {
      return res.status(400).json({ error: "Invalid school year" });
    }

    const { sectionInfo, items } = await fetchSectionSf9DataBatch(Number(cleanSectionId), schoolYearId);
    if (!sectionInfo || items.length === 0) {
      return res.status(404).json({ error: "No students found in this section.", code: "NO_STUDENTS_FOUND" });
    }

    return res.json({
      sectionName: sectionInfo.section_name || "",
      count: items.length,
      items: items.map((item) => ({
        fileName: item.fileName,
        studentProfile: item.options.studentProfile,
        grades: item.options.grades,
        attendanceData: item.options.attendanceData,
      })),
    });
  } catch (error) {
    console.error("Error fetching bulk section SF9 data:", error);
    return res.status(500).json({ error: "Failed to fetch bulk SF9 data", message: error.message });
  }
});

// POST /student/:identifier/ephemeral-lrn - Ephemeral on-demand fetch of decrypted LRN strictly for document export
router.post('/student/:identifier/ephemeral-lrn', async (req, res) => {
  try {
    const { identifier } = req.params;
    const cleanId = String(identifier).trim();
    const lrnHash = hashLrn(cleanId);
    const [stRows] = await db.execute(
      `SELECT student_id, LRN FROM STUDENT WHERE student_id = ? OR LRN = ? OR lrn_hash = ? LIMIT 1`,
      [cleanId, cleanId, lrnHash]
    );

    if (stRows.length > 0) {
      const decrypted = decryptLrn(stRows[0].LRN);
      return res.json({ lrn: decrypted });
    }

    const [ssRows] = await db.execute(
      `SELECT st.student_id, st.LRN FROM STUDENT_SECTION ss
       JOIN STUDENT st ON ss.student_id = st.student_id
       WHERE ss.student_section_id = ? LIMIT 1`,
      [cleanId]
    );

    if (ssRows.length > 0) {
      const decrypted = decryptLrn(ssRows[0].LRN);
      return res.json({ lrn: decrypted });
    }

    return res.status(404).json({ error: "Student not found" });
  } catch (error) {
    console.error("Error in ephemeral LRN fetch:", error);
    return res.status(500).json({ error: "Failed to fetch export credential" });
  }
});

module.exports = router;
