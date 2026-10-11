const express = require('express');
const router = express.Router();
const db = require('../config/db');
const MasterSheetService = require('../services/MasterSheetService');

// DepEd Subject Template Definition
const DEPED_SUBJECT_TEMPLATE = [
  { code: "fil", name: "Filipino", msKey: "filipino", aliases: ["FIL", "FILIPINO"], isHeader: false, isSubSubject: false },
  { code: "eng", name: "English", msKey: "english", aliases: ["ENG", "ENGLISH"], isHeader: false, isSubSubject: false },
  { code: "math", name: "Mathematics", msKey: "mathematics", aliases: ["MATH", "MATHEMATICS"], isHeader: false, isSubSubject: false },
  { code: "sci", name: "Science", msKey: "science", aliases: ["SCI", "SCIENCE"], isHeader: false, isSubSubject: false },
  { code: "ap", name: "Araling Panlipunan (AP)", msKey: "ap", aliases: ["AP", "ARALINGPANLIPUNAN", "ARALING PANLIPUNAN"], isHeader: false, isSubSubject: false },
  { code: "ve", name: "Values Education", msKey: "esp", aliases: ["ESP", "VE", "EDUKASYONSAPAGPAPAKATAO", "VALUESEDUCATION", "VALUES EDUCATION", "EDUKASYON SA PAGPAPAKATAO"], isHeader: false, isSubSubject: false },
  { code: "tle", name: "Technology and Livelihood Education (TLE)", msKey: "tle", aliases: ["TLE", "TECHNOLOGYANDLIVELIHOODEDUCATION", "TECHNOLOGY AND LIVELIHOOD EDUCATION"], isHeader: false, isSubSubject: false },
  { code: "mapeh", name: "MAPEH", msKey: "mapeh", aliases: ["MAPEH"], isHeader: true, isSubSubject: false },
  { code: "music_arts", name: "Music and Arts", msKey: "mapeh", aliases: ["MUSIC", "ARTS", "MA"], isHeader: false, isSubSubject: true },
  { code: "pe_health", name: "Physical Education and Health", msKey: "mapeh", aliases: ["PE", "HEALTH", "PEH"], isHeader: false, isSubSubject: true }
];

function cleanToken(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseTermIndex(termStr) {
  const str = cleanToken(termStr);
  if (str.includes("1") || str.startsWith("FIRST") || str.startsWith("1ST") || str.startsWith("T1")) return 0;
  if (str.includes("2") || str.startsWith("SECOND") || str.startsWith("2ND") || str.startsWith("T2")) return 1;
  if (str.includes("3") || str.startsWith("THIRD") || str.startsWith("3RD") || str.startsWith("T3")) return 2;
  return null;
}

function calculateAge(birthdate) {
  if (!birthdate) return "";
  const dob = new Date(birthdate);
  if (isNaN(dob.getTime())) return "";
  const diffMs = Date.now() - dob.getTime();
  const ageDate = new Date(diffMs);
  const computedAge = Math.abs(ageDate.getUTCFullYear() - 1970);
  return (computedAge > 0 && computedAge < 100) ? computedAge : "";
}

function formatBirthdateDisplay(birthdate) {
  if (!birthdate) return "";
  const dob = new Date(birthdate);
  if (isNaN(dob.getTime())) return String(birthdate);
  const mm = String(dob.getMonth() + 1).padStart(2, '0');
  const dd = String(dob.getDate()).padStart(2, '0');
  const yyyy = dob.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatSchoolYear(startsOn, endsOn) {
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
    return `${startYear} - ${endYear}`;
  }
  if (startYear) return String(startYear);
  return "";
}

function formatPersonName(first, middle, last, ext) {
  const lastStr = (last || "").trim().toUpperCase();
  const firstStr = (first || "").trim().toUpperCase();
  const midStr = middle ? ` ${(middle || "").trim().toUpperCase()}` : "";
  const extStr = ext ? ` ${(ext || "").trim().toUpperCase()}` : "";
  return `${lastStr}, ${firstStr}${midStr}${extStr}`.trim();
}

/**
 * GET /api/reports/sf10/:studentId
 * Aggregates complete Learner's Permanent Academic Record (DepEd SF10-JHS)
 */
router.get('/sf10/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const cleanId = String(studentId).trim();

    // 1. Fetch Student Demographics
    let student = null;
    const [stRows] = await db.execute(
      `SELECT st.*, p.program_code, p.program_name, COALESCE(p.is_specialized, 0) AS is_specialized
       FROM STUDENT st
       LEFT JOIN PROGRAM p ON p.program_id = st.program_id
       WHERE st.student_id = ? OR st.LRN = ? LIMIT 1`,
      [cleanId, cleanId]
    );

    if (stRows.length > 0) {
      student = stRows[0];
    } else {
      // Check if student_section_id was passed
      const [ssRows] = await db.execute(
        `SELECT st.*, p.program_code, p.program_name, COALESCE(p.is_specialized, 0) AS is_specialized
         FROM STUDENT_SECTION ss
         JOIN STUDENT st ON ss.student_id = st.student_id
         LEFT JOIN PROGRAM p ON p.program_id = st.program_id
         WHERE ss.student_section_id = ? LIMIT 1`,
        [cleanId]
      );
      if (ssRows.length > 0) {
        student = ssRows[0];
      }
    }

    if (!student) {
      return res.status(404).json({ error: "Student record not found" });
    }

    // 2. Fetch School Information
    const [schoolRows] = await db.execute(`SELECT * FROM SCHOOL LIMIT 1`);
    const schoolData = schoolRows.length > 0 ? schoolRows[0] : {};
    const schoolInfo = {
      school_id: schoolData.schoolID || schoolData.school_code || "304130",
      school_name: schoolData.school_name || "Gingoog City Comprehensive National High School",
      district: schoolData.district || "West 1 District",
      division: schoolData.division || "Gingoog City",
      region: schoolData.region ? (schoolData.region.toString().startsWith("Region") ? schoolData.region : `Region ${schoolData.region}`) : "Region X",
      address: [schoolData.street, schoolData.barangay, schoolData.city, schoolData.province].filter(Boolean).join(", ")
    };

    // 3. Fetch Principal Details
    let principalName = "DR. JANE DOE, PH.D.";
    const [pRows] = await db.execute(
      `SELECT first_name, last_name, extension_name FROM USER WHERE role IN ('1', 'principal', '5') LIMIT 1`
    );
    if (pRows.length > 0) {
      const p = pRows[0];
      const baseName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toUpperCase();
      const ext = (p.extension_name || '').trim();
      principalName = ext ? `${baseName}, ${ext}` : baseName;
      if (!principalName.includes("PH.D") && !principalName.includes("PHD")) {
        principalName = `${principalName}, Ph.D.`;
      }
    }

    // 4. Fetch Learner Enrollment History (STUDENT_SECTION across grade levels)
    const [sectionHistory] = await db.execute(
      `SELECT ss.student_section_id, ss.student_id, ss.section_id, ss.school_year_id,
              sec.section_name, sec.grade_level_id,
              gl.grade_level_name,
              sy.starts_on, sy.ends_on, sy.status as school_year_status,
              saa.adviser_assignment_id, saa.user_id as adviser_user_id,
              u.first_name as adviser_first, u.last_name as adviser_last, u.middle_name as adviser_middle
       FROM STUDENT_SECTION ss
       JOIN SECTION sec ON ss.section_id = sec.section_id
       JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
       LEFT JOIN SCHOOL_YEAR sy ON ss.school_year_id = sy.school_year_id
       LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = sec.section_id AND saa.school_year_id = ss.school_year_id
       LEFT JOIN USER u ON saa.user_id = u.user_id
       WHERE ss.student_id = ?
       ORDER BY gl.grade_level_id ASC, ss.student_section_id ASC`,
      [student.student_id]
    );

    // 4b. Fetch Master Sheet Data for active/historical adviser assignments
    const masterSheetsByEnrollment = {};
    for (const sh of sectionHistory) {
      if (sh.adviser_assignment_id && sh.adviser_user_id) {
        try {
          const msData = await MasterSheetService.getMasterSheet(sh.adviser_assignment_id, sh.adviser_user_id);
          if (msData && msData.students) {
            const stInMs = msData.students.find(s =>
              Number(s.studentId) === Number(student.student_id) ||
              Number(s.studentSectionId) === Number(sh.student_section_id) ||
              String(s.lrn) === String(student.LRN)
            );
            if (stInMs) {
              masterSheetsByEnrollment[sh.student_section_id] = stInMs;
            }
          }
        } catch (err) {
          console.warn(`MasterSheet lookup error for section ${sh.section_id}:`, err.message);
        }
      }
    }

    // 5. Fetch all stored STUDENT_GRADE records for this student
    const [allGrades] = await db.execute(
      `SELECT sg.student_grade_id, sg.subject_offering_id, sg.student_id, sg.student_section_id,
              sg.term, sg.mapeh_component, sg.initial_grade, sg.quarterly_grade, sg.remarks,
              so.section_id, so.school_year_id, so.subject_id,
              s.subject_name, s.subject_code,
              sec.section_name, sec.grade_level_id,
              gl.grade_level_name,
              sy.starts_on, sy.ends_on
       FROM STUDENT_GRADE sg
       JOIN SUBJECT_OFFERING so ON sg.subject_offering_id = so.subject_offering_id
       JOIN SUBJECT s ON so.subject_id = s.subject_id
       LEFT JOIN SECTION sec ON so.section_id = sec.section_id
       LEFT JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
       LEFT JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
       WHERE sg.student_id = ?`,
      [student.student_id]
    );

    // Build subject list dynamically based on program specialization
    const rawProgCode = (student.program_code || "").toUpperCase();
    const subjectMapping = [...DEPED_SUBJECT_TEMPLATE];
    if (rawProgCode === "STE") {
      subjectMapping.push({ code: "research", name: "Research", msKey: "research", aliases: ["RESEARCH"], isHeader: false, isSubSubject: false });
    } else if (rawProgCode === "SPJ") {
      subjectMapping.push({ code: "journalism", name: "Journalism", msKey: "journalism", aliases: ["JOURNALISM"], isHeader: false, isSubSubject: false });
    } else if (rawProgCode === "SPA") {
      subjectMapping.push({ code: "spa_spec", name: "SPA Specialization", msKey: "spa_spec", aliases: ["SPA"], isHeader: false, isSubSubject: false });
    }

    // Standard JHS Grade Levels: 7, 8, 9, 10
    const JHS_GRADE_LEVELS = [
      { gradeNum: 7, levelName: "Grade 7", codeMatch: ["7", "G7", "GRADE 7"] },
      { gradeNum: 8, levelName: "Grade 8", codeMatch: ["8", "G8", "GRADE 8"] },
      { gradeNum: 9, levelName: "Grade 9", codeMatch: ["9", "G9", "GRADE 9"] },
      { gradeNum: 10, levelName: "Grade 10", codeMatch: ["10", "G10", "GRADE 10"] }
    ];

    // Build 4 Scholastic Record Blocks
    const scholasticRecords = JHS_GRADE_LEVELS.map((lvl) => {
      // Find matching section history for this grade level
      const matchingEnrollment = sectionHistory.find((sh) => {
        const glStr = cleanToken(sh.grade_level_name);
        return lvl.codeMatch.some((m) => glStr === cleanToken(m));
      });

      // Filter grades for this grade level
      const matchingGrades = allGrades.filter((g) => {
        if (matchingEnrollment && g.section_id && g.section_id === matchingEnrollment.section_id) {
          return true;
        }
        if (matchingEnrollment && g.school_year_id && g.school_year_id === matchingEnrollment.school_year_id) {
          return true;
        }
        const glStr = cleanToken(g.grade_level_name);
        return lvl.codeMatch.some((m) => glStr === cleanToken(m));
      });

      const sectionName = matchingEnrollment?.section_name || "";
      const schoolYearStr = formatSchoolYear(matchingEnrollment?.starts_on, matchingEnrollment?.ends_on);
      const adviserName = matchingEnrollment?.adviser_last
        ? `${matchingEnrollment.adviser_first || ''} ${matchingEnrollment.adviser_last || ''}`.trim().toUpperCase()
        : "";

      const msStudent = matchingEnrollment ? masterSheetsByEnrollment[matchingEnrollment.student_section_id] : null;

      // Extract MAPEH sub-components from matching grades
      const mapehMA = [null, null, null];
      const mapehPEH = [null, null, null];
      const mapehDirect = [null, null, null];

      matchingGrades.forEach((rg) => {
        const subCode = cleanToken(rg.subject_code);
        const subName = cleanToken(rg.subject_name);
        const isMapeh = subCode.includes("MAPEH") || subName.includes("MAPEH");

        if (isMapeh) {
          const tIdx = parseTermIndex(rg.term);
          if (tIdx !== null && rg.quarterly_grade !== null && rg.quarterly_grade !== undefined) {
            const val = Math.round(Number(rg.quarterly_grade));
            if (rg.mapeh_component === 'MA') {
              mapehMA[tIdx] = val;
            } else if (rg.mapeh_component === 'PEH') {
              mapehPEH[tIdx] = val;
            } else if (!rg.mapeh_component) {
              mapehDirect[tIdx] = val;
            }
          }
        }
      });

      // Map subjects according to updated DepEd Subject List
      const subjectRows = subjectMapping.map((template) => {
        let t1 = "";
        let t2 = "";
        let t3 = "";
        let finalGrade = "";
        let remark = "";

        if (template.code === "music_arts") {
          t1 = mapehMA[0] !== null ? mapehMA[0] : "";
          t2 = mapehMA[1] !== null ? mapehMA[1] : "";
          t3 = mapehMA[2] !== null ? mapehMA[2] : "";
        } else if (template.code === "pe_health") {
          t1 = mapehPEH[0] !== null ? mapehPEH[0] : "";
          t2 = mapehPEH[1] !== null ? mapehPEH[1] : "";
          t3 = mapehPEH[2] !== null ? mapehPEH[2] : "";
        } else if (template.code === "mapeh") {
          for (let i = 0; i < 3; i++) {
            let val = "";
            if (mapehMA[i] !== null && mapehPEH[i] !== null) {
              val = Math.round((mapehMA[i] + mapehPEH[i]) / 2);
            } else if (mapehDirect[i] !== null) {
              val = mapehDirect[i];
            } else if (mapehMA[i] !== null) {
              val = mapehMA[i];
            } else if (mapehPEH[i] !== null) {
              val = mapehPEH[i];
            }
            if (i === 0) t1 = val;
            if (i === 1) t2 = val;
            if (i === 2) t3 = val;
          }
        }

        // Use live MasterSheet data if available
        if (msStudent && msStudent.grades) {
          const g = msStudent.grades[template.msKey];
          if (g && Array.isArray(g.terms)) {
            if (t1 === "" && Number.isFinite(g.terms[0])) t1 = Math.round(g.terms[0]);
            if (t2 === "" && Number.isFinite(g.terms[1])) t2 = Math.round(g.terms[1]);
            if (t3 === "" && Number.isFinite(g.terms[2])) t3 = Math.round(g.terms[2]);
          }
          if (g && Number.isFinite(g.finalGrade) && template.code !== "music_arts" && template.code !== "pe_health") {
            finalGrade = Math.round(g.finalGrade);
          }
        } else if (!msStudent) {
          // Historical fallback with STRICT token equality (no loose substring matching)
          const subjectGrades = matchingGrades.filter((g) => {
            const sc = cleanToken(g.subject_code);
            const sn = cleanToken(g.subject_name);
            return template.aliases.some((a) => {
              const ca = cleanToken(a);
              return sc === ca || sn === ca;
            });
          });

          subjectGrades.forEach((g) => {
            const tIdx = parseTermIndex(g.term);
            if (tIdx !== null && g.quarterly_grade !== null && g.quarterly_grade !== undefined) {
              const val = Math.round(Number(g.quarterly_grade));
              if (tIdx === 0 && t1 === "") t1 = val;
              if (tIdx === 1 && t2 === "") t2 = val;
              if (tIdx === 2 && t3 === "") t3 = val;
            }
          });
        }

        // 3 Term Rating Structure:
        // Final Rating = ROUND((Term 1 + Term 2 + Term 3) / 3) only when all 3 terms are completed
        if (typeof t1 === 'number' && typeof t2 === 'number' && typeof t3 === 'number') {
          if (finalGrade === "") {
            finalGrade = Math.round((t1 + t2 + t3) / 3);
          }
          remark = finalGrade >= 75 ? "Passed" : "Failed";
        } else {
          finalGrade = "";
          remark = "";
        }

        return {
          code: template.code,
          name: template.name,
          t1: t1,
          t2: t2,
          t3: t3,
          final: finalGrade,
          remarks: remark,
          isHeader: template.isHeader,
          isSubSubject: template.isSubSubject
        };
      });

      // Compute General Average for the grade level across main learning areas
      // Main learning areas: 8 DepEd Core Areas (!s.isSubSubject):
      // Filipino, English, Math, Science, AP, Values Ed, TLE, MAPEH
      const mainSubjects = subjectRows.filter((s) => !s.isSubSubject);
      const allMainSubjsComplete = mainSubjects.length > 0 && mainSubjects.every((s) => typeof s.final === 'number');

      let genAvgT1 = "";
      let genAvgT2 = "";
      let genAvgT3 = "";
      let finalGenAvg = "";
      let genAvgRemarks = "";

      if (allMainSubjsComplete) {
        if (msStudent?.generalAverage && Number.isFinite(msStudent.generalAverage)) {
          finalGenAvg = Math.round(msStudent.generalAverage);
        } else {
          const sumFinal = mainSubjects.reduce((sum, s) => sum + s.final, 0);
          finalGenAvg = Math.round(sumFinal / mainSubjects.length);
        }
        genAvgRemarks = finalGenAvg >= 75 ? "Passed" : "Failed";

        if (mainSubjects.every((s) => typeof s.t1 === 'number')) {
          const sumT1 = mainSubjects.reduce((sum, s) => sum + s.t1, 0);
          genAvgT1 = Math.round(sumT1 / mainSubjects.length);
        }
        if (mainSubjects.every((s) => typeof s.t2 === 'number')) {
          const sumT2 = mainSubjects.reduce((sum, s) => sum + s.t2, 0);
          genAvgT2 = Math.round(sumT2 / mainSubjects.length);
        }
        if (mainSubjects.every((s) => typeof s.t3 === 'number')) {
          const sumT3 = mainSubjects.reduce((sum, s) => sum + s.t3, 0);
          genAvgT3 = Math.round(sumT3 / mainSubjects.length);
        }
      }

      const isEnrolledOrHasGrades = !!matchingEnrollment || matchingGrades.length > 0;

      return {
        grade_level: String(lvl.gradeNum),
        grade_level_name: lvl.levelName,
        is_populated: isEnrolledOrHasGrades,
        school_name: isEnrolledOrHasGrades ? schoolInfo.school_name : "",
        school_id: isEnrolledOrHasGrades ? schoolInfo.school_id : "",
        district: isEnrolledOrHasGrades ? schoolInfo.district : "",
        division: isEnrolledOrHasGrades ? schoolInfo.division : "",
        region: isEnrolledOrHasGrades ? schoolInfo.region : "",
        section_name: sectionName,
        school_year: schoolYearStr,
        adviser_name: adviserName,
        grades: subjectRows,
        general_average: {
          t1: genAvgT1,
          t2: genAvgT2,
          t3: genAvgT3,
          final: finalGenAvg,
          remarks: genAvgRemarks
        },
        remedial_classes: []
      };
    });

    // 6. Assemble Learner Information
    const sexDisplay = (student.sex === 'M' || student.sex === 'Male') ? 'Male'
      : (student.sex === 'F' || student.sex === 'Female') ? 'Female'
      : (student.sex || '');

    const learnerInfo = {
      student_id: student.student_id,
      lrn: String(student.LRN || ""),
      last_name: (student.last_name || "").toUpperCase(),
      first_name: (student.first_name || "").toUpperCase(),
      middle_name: (student.middle_name || "").toUpperCase(),
      name_extension: (student.extension_name || "").toUpperCase(),
      full_name: formatPersonName(student.first_name, student.middle_name, student.last_name, student.extension_name),
      birthdate: student.birthdate ? String(student.birthdate).split('T')[0] : "",
      birthdate_formatted: formatBirthdateDisplay(student.birthdate),
      sex: sexDisplay,
      age: calculateAge(student.birthdate)
    };

    // 7. Enrolment Eligibility Data
    const eligibilityInfo = {
      elementary_completer: true,
      general_average: "",
      citation: "",
      elementary_school_name: "",
      elementary_school_id: "",
      elementary_school_address: "",
      pept_passer: false,
      pept_rating: "",
      als_passer: false,
      als_rating: "",
      others_specified: "",
      exam_date: "",
      testing_center_name_address: ""
    };

    // 8. Certification Information
    // Determine highest completed grade
    let highestPassedGrade = null;
    scholasticRecords.forEach((rec) => {
      if (rec.is_populated && rec.general_average.final && rec.general_average.remarks === "Passed") {
        highestPassedGrade = parseInt(rec.grade_level, 10);
      }
    });

    const nextGrade = highestPassedGrade
      ? (highestPassedGrade === 10 ? "Grade 11 (SHS)" : `Grade ${highestPassedGrade + 1}`)
      : "";

    const activeSchoolYear = scholasticRecords.find((r) => r.is_populated && r.school_year)?.school_year || "";

    const certificationInfo = {
      true_record_of: learnerInfo.full_name,
      lrn: learnerInfo.lrn,
      eligible_for_admission_to_grade: nextGrade,
      school_name: schoolInfo.school_name,
      school_id: schoolInfo.school_id,
      last_school_year_attended: activeSchoolYear,
      principal_name: principalName,
      date_issued: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    };

    return res.json({
      success: true,
      learner: learnerInfo,
      eligibility: eligibilityInfo,
      school: schoolInfo,
      principal: principalName,
      scholastic_records: scholasticRecords,
      certification: certificationInfo
    });

  } catch (error) {
    console.error("Error in GET /api/reports/sf10/:studentId:", error);
    return res.status(500).json({ error: "Failed to generate SF10 record", message: error.message });
  }
});

module.exports = router;
