const express = require('express');
const router = express.Router();
const db = require('../config/db');
const MasterSheetService = require('../services/MasterSheetService');

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

router.get('/student/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const cleanId = String(identifier).trim();

    // 1. Find Student record
    let student = null;
    let studentSectionId = null;

    const [stRows] = await db.execute(
      `SELECT * FROM STUDENT WHERE student_id = ? OR LRN = ? LIMIT 1`,
      [cleanId, cleanId]
    );

    if (stRows.length > 0) {
      student = stRows[0];
    } else {
      const [ssCheck] = await db.execute(
        `SELECT st.*, ss.student_section_id 
         FROM STUDENT_SECTION ss 
         JOIN STUDENT st ON ss.student_id = st.student_id 
         WHERE ss.student_section_id = ? LIMIT 1`,
        [cleanId]
      );
      if (ssCheck.length > 0) {
        student = ssCheck[0];
        studentSectionId = ssCheck[0].student_section_id;
      }
    }

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // 2. Find Student Section & Section details
    let sectionInfo = null;
    if (studentSectionId) {
      const [secRows] = await db.execute(
        `SELECT ss.student_section_id, ss.section_id, ss.school_year_id,
                sec.section_name,
                gl.grade_level_name,
                sy.starts_on, sy.ends_on
         FROM STUDENT_SECTION ss
         JOIN SECTION sec ON ss.section_id = sec.section_id
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
                sec.section_name,
                gl.grade_level_name,
                sy.starts_on, sy.ends_on
         FROM STUDENT_SECTION ss
         JOIN SECTION sec ON ss.section_id = sec.section_id
         LEFT JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON ss.school_year_id = sy.school_year_id
         WHERE ss.student_id = ?
         ORDER BY ss.student_section_id DESC LIMIT 1`,
        [student.student_id]
      );
      if (secRows.length > 0) {
        sectionInfo = secRows[0];
        studentSectionId = sectionInfo.student_section_id;
      }
    }

    // 3. Resolve Section Adviser & Principal Details
    let adviserName = "";
    let adviserAssignmentId = null;
    let adviserUserId = null;
    if (sectionInfo) {
      const [saaRows] = await db.execute(
        `SELECT saa.adviser_assignment_id, saa.user_id, u.first_name, u.last_name, u.middle_name
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
        adviserName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toUpperCase();
      }
    }

    let principalName = "";
    const [pRows] = await db.execute(
      `SELECT first_name, last_name, extension_name FROM USER WHERE role IN ('1', 'principal', '5') LIMIT 1`
    );
    if (pRows.length > 0) {
      const p = pRows[0];
      const baseName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toUpperCase();
      const ext = (p.extension_name || '').trim();
      principalName = ext ? `${baseName}, ${ext}` : baseName;
    }

    // 4. Student Profile Demographics
    const gradeLevelRaw = sectionInfo?.grade_level_name || "";
    const gradeNumMatch = gradeLevelRaw.match(/\d+/);
    const gradeNum = gradeNumMatch ? gradeNumMatch[0] : "";
    const sectionNameStr = sectionInfo?.section_name || "";
    const sexFull = (student.sex === 'M' || student.sex === 'Male') ? 'Male' : (student.sex === 'F' || student.sex === 'Female') ? 'Female' : (student.sex || '');

    const studentProfile = {
      studentId: student.student_id,
      studentSectionId: studentSectionId,
      name: formatFullName(student),
      lrn: String(student.LRN || ""),
      gradeLevel: gradeLevelRaw && sectionNameStr ? `${gradeLevelRaw} ${sectionNameStr}` : (gradeLevelRaw || sectionNameStr || ""),
      grade: gradeNum,
      section: sectionNameStr,
      program: "", // Blank as instructed
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
        const msData = await MasterSheetService.getMasterSheet(adviserAssignmentId, adviserUserId);
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

    // Map Master Sheet grades to frontend 10 subjects template
    const gradesList = FRONTEND_SUBJECT_MAPPING.map(tmpl => {
      let t1 = "";
      let t2 = "";
      let t3 = "";
      let finalVal = "";
      let remark = "";

      if (masterSheetStudent && masterSheetStudent.grades) {
        const g = masterSheetStudent.grades[tmpl.msKey];
        if (g && Array.isArray(g.terms)) {
          t1 = Number.isFinite(g.terms[0]) ? Math.round(g.terms[0]) : "";
          t2 = Number.isFinite(g.terms[1]) ? Math.round(g.terms[1]) : "";
          t3 = Number.isFinite(g.terms[2]) ? Math.round(g.terms[2]) : "";
        }
        // ONLY display finalGrade if all 3 terms are complete on MasterSheet
        if (g && Number.isFinite(g.finalGrade)) {
          finalVal = Math.round(g.finalGrade);
        }
      }

      // Strictly DO NOT compute a subject's final grade if not all terms are complete
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

    if (sectionInfo && studentSectionId) {
      const [sheetRows] = await db.execute(
        `SELECT ash.attendance_sheet_id, ash.attendance_date 
         FROM ATTENDANCE_SHEET ash 
         LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON ash.adviser_assignment_id = saa.adviser_assignment_id
         WHERE (saa.section_id = ? OR ash.adviser_assignment_id = ?)`,
        [sectionInfo.section_id, adviserAssignmentId || 0]
      );

      if (sheetRows.length > 0) {
        const sheetIds = sheetRows.map(s => s.attendance_sheet_id);
        const sheetDateMap = new Map(sheetRows.map(s => [s.attendance_sheet_id, s.attendance_date]));

        const ph = sheetIds.map(() => '?').join(',');
        const [attRows] = await db.execute(
          `SELECT attendance_sheet_id, status FROM ATTENDANCE 
           WHERE attendance_sheet_id IN (${ph}) AND student_section_id = ?`,
          [...sheetIds, studentSectionId]
        );

        for (const row of attRows) {
          const attDate = sheetDateMap.get(row.attendance_sheet_id);
          if (!attDate) continue;
          const dt = new Date(attDate);
          const mIndex = MONTH_INDEX_MAP[dt.getMonth()];
          if (mIndex !== undefined) {
            if (row.status === 'P') {
              rawPresent[mIndex] += 1;
            } else if (row.status === 'L') {
              rawLate[mIndex] += 1;
            } else if (row.status === 'A') {
              rawAbsent[mIndex] += 1;
            }
          }
        }
      }
    }

    // Apply rule: Every 3 Lates = 1 Absent (accumulating chronologically across months)
    const monthlyDaysPresent = new Array(11).fill(0);
    const monthlyDaysAbsent = new Array(11).fill(0);
    let accumulatedLates = 0;

    for (let i = 0; i < 11; i++) {
      accumulatedLates += rawLate[i];
      const convertedAbsent = Math.floor(accumulatedLates / 3);
      accumulatedLates = accumulatedLates % 3; // remainder lates carry over to next month

      monthlyDaysAbsent[i] = rawAbsent[i] + convertedAbsent;
      monthlyDaysPresent[i] = (rawPresent[i] + rawLate[i]) - convertedAbsent;
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

    return res.json({
      studentProfile,
      grades: gradesList,
      attendanceData
    });

  } catch (error) {
    console.error("Error fetching SF9 details:", error);
    return res.status(500).json({ error: "Failed to fetch student SF9 details", message: error.message });
  }
});

module.exports = router;
