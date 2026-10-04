import React from "react";
import depedLogo from "../assets/deped_logo.png";
import depedGifLogo from "../assets/deped-logo.gif";
import "../styles/SF10PreviewModal.css";

// Defensive string sanitizer to prevent object-as-React-child crashes
export const safeStr = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "object") {
    if (v instanceof Date) return v.toLocaleDateString();
    return fallback;
  }
  return String(v);
};

// Safe number or string display
export const safeDisplay = (v, fallback = "") => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  return fallback;
};

// Helper to parse name parts safely from full name
export const parseNameParts = (fullName) => {
  const nameStr = safeStr(fullName).trim();
  if (!nameStr) return { last: "", first: "", middle: "", ext: "" };
  if (nameStr.includes(",")) {
    const [lastPart, ...restParts] = nameStr.split(",");
    const rest = restParts.join(" ").trim();
    const parts = rest.split(/\s+/).filter(Boolean);
    return {
      last: (lastPart || "").trim().toUpperCase(),
      first: parts[0] ? parts[0].toUpperCase() : "",
      middle: parts.slice(1).join(" ").toUpperCase(),
      ext: ""
    };
  }
  const parts = nameStr.split(/\s+/).filter(Boolean);
  return {
    last: parts[parts.length - 1] ? parts[parts.length - 1].toUpperCase() : "",
    first: parts.slice(0, -1).join(" ").toUpperCase(),
    middle: "",
    ext: ""
  };
};

// Factory for a complete blank scholastic record
export const createDefaultRecord = (levelNum) => ({
  grade_level: String(levelNum),
  grade_level_name: `Grade ${levelNum}`,
  is_populated: false,
  school_name: "",
  school_id: "",
  district: "",
  division: "",
  region: "",
  section_name: "",
  school_year: "",
  adviser_name: "",
  grades: [],
  general_average: { t1: "", t2: "", t3: "", final: "", remarks: "" },
  remedial_classes: []
});

/**
 * Pure presentational SF10 2-page DepEd document
 */
export default function SF10Document({ student, sf10Data, page1Ref, page2Ref }) {
  const nameParts = parseNameParts(student?.name);

  // Demographics sanitized
  const rawLearner = sf10Data?.learner || {};
  const learner = {
    lrn: safeStr(rawLearner.lrn || student?.lrn || student?.LRN),
    last_name: safeStr(rawLearner.last_name || student?.last_name || student?.lastName || nameParts.last).toUpperCase(),
    first_name: safeStr(rawLearner.first_name || student?.first_name || student?.firstName || nameParts.first).toUpperCase(),
    middle_name: safeStr(rawLearner.middle_name || student?.middle_name || student?.middleName || nameParts.middle).toUpperCase(),
    name_extension: safeStr(rawLearner.name_extension || student?.extension_name || nameParts.ext).toUpperCase(),
    full_name: safeStr(rawLearner.full_name || student?.name || `${nameParts.last}, ${nameParts.first} ${nameParts.middle}`.trim()),
    birthdate_formatted: safeStr(rawLearner.birthdate_formatted || student?.dateOfBirth),
    sex: safeStr(rawLearner.sex || student?.sex || student?.gender)
  };

  const rawSchool = sf10Data?.school || {};
  const school = {
    school_id: safeStr(rawSchool.school_id || "304130"),
    school_name: safeStr(rawSchool.school_name || "Gingoog City Comprehensive National High School"),
    district: safeStr(rawSchool.district || "West 1 District"),
    division: safeStr(rawSchool.division || "Gingoog City"),
    region: safeStr(rawSchool.region || "Region X")
  };

  const principal = safeStr(sf10Data?.principal || student?.principalName || "DR. JANE DOE, PH.D.");
  const scholasticRecords = Array.isArray(sf10Data?.scholastic_records) ? sf10Data.scholastic_records : [];

  let recordG7 = scholasticRecords[0] || createDefaultRecord(7);
  let recordG8 = scholasticRecords[1] || createDefaultRecord(8);
  let recordG9 = scholasticRecords[2] || createDefaultRecord(9);
  let recordG10 = scholasticRecords[3] || createDefaultRecord(10);

  // Fallback: populate active grade level from student prop if backend scholastic records not yet loaded
  const studentGradeNum = safeStr(student?.grade || student?.gradeLevel || "7").replace(/\D/g, "") || "7";
  if (!recordG7.is_populated && !recordG8.is_populated && Array.isArray(student?.grades) && student.grades.length > 0) {
    const targetRec = studentGradeNum === "8" ? recordG8 : studentGradeNum === "9" ? recordG9 : studentGradeNum === "10" ? recordG10 : recordG7;
    targetRec.is_populated = true;
    targetRec.section_name = safeStr(student?.section || targetRec.section_name);
    targetRec.school_year = safeStr(student?.schoolYear || targetRec.school_year);
    targetRec.adviser_name = safeStr(student?.adviserName || targetRec.adviser_name);
    targetRec.grades = student.grades.map(g => ({
      code: safeStr(g.code),
      name: safeStr(g.name),
      t1: safeDisplay(g.t1),
      t2: safeDisplay(g.t2),
      t3: safeDisplay(g.t3),
      final: safeDisplay(g.final),
      remarks: safeStr(g.remark || g.remarks),
      isHeader: Boolean(g.isHeader),
      isSubSubject: Boolean(g.isSubSubject)
    }));
    const mainSubjs = targetRec.grades.filter(g => !g.isSubSubject);
    const allT1 = mainSubjs.length > 0 && mainSubjs.every(g => typeof g.t1 === 'number');
    const allFinal = mainSubjs.length > 0 && mainSubjs.every(g => typeof g.final === 'number');
    targetRec.general_average = {
      t1: allT1 ? Math.round(mainSubjs.reduce((s, g) => s + g.t1, 0) / mainSubjs.length) : "",
      t2: "",
      t3: "",
      final: allFinal ? safeDisplay(student?.termGrade) : "",
      remarks: allFinal ? (student?.honorStatus ? "Passed" : "") : ""
    };
  }

  const rawCert = sf10Data?.certification || {};
  const cert = {
    true_record_of: safeStr(rawCert.true_record_of || learner.full_name),
    lrn: safeStr(rawCert.lrn || learner.lrn),
    eligible_for_admission_to_grade: safeStr(
      rawCert.eligible_for_admission_to_grade ||
      (studentGradeNum ? (studentGradeNum === "10" ? "Grade 11 (SHS)" : `Grade ${Number(studentGradeNum) + 1}`) : "Grade 8")
    ),
    school_name: safeStr(rawCert.school_name || school.school_name),
    school_id: safeStr(rawCert.school_id || school.school_id),
    last_school_year_attended: safeStr(rawCert.last_school_year_attended || recordG7.school_year || student?.schoolYear),
    principal_name: safeStr(rawCert.principal_name || principal),
    date_issued: safeStr(rawCert.date_issued || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
  };

  const isSpaActive = Boolean(
    String(student?.program || "").toUpperCase().includes("SPA") ||
    String(student?.program_code || "").toUpperCase() === "SPA" ||
    (Array.isArray(student?.grades) && student.grades.some(g => String(g.code || g.name).toUpperCase().includes("SPA"))) ||
    scholasticRecords.some(r => Array.isArray(r.grades) && r.grades.some(g => String(g.code || g.name).toUpperCase().includes("SPA")))
  );

  // Helper to render scholastic table rows with DepEd subject list
  const renderScholasticRows = (record) => {
    let grades = Array.isArray(record?.grades) ? [...record.grades] : [];
    if (grades.length === 0) {
      // Default blank template rows (strictly matching the DepEd order)
      const defaultRows = [
        { code: "fil", name: "Filipino", isHeader: false, isSubSubject: false },
        { code: "eng", name: "English", isHeader: false, isSubSubject: false },
        { code: "math", name: "Mathematics", isHeader: false, isSubSubject: false },
        { code: "sci", name: "Science", isHeader: false, isSubSubject: false },
        { code: "ap", name: "Araling Panlipunan (AP)", isHeader: false, isSubSubject: false },
        { code: "ve", name: "Values Education", isHeader: false, isSubSubject: false },
        { code: "tle", name: "Technology and Livelihood Education (TLE)", isHeader: false, isSubSubject: false },
        { code: "mapeh", name: "MAPEH", isHeader: true, isSubSubject: false },
        { code: "music_arts", name: "Music and Arts", isHeader: false, isSubSubject: true },
        { code: "pe_health", name: "Physical Education and Health", isHeader: false, isSubSubject: true },
      ];
      if (isSpaActive) {
        defaultRows.push({ code: "spa_spec", name: "SPA Specialization", isHeader: false, isSubSubject: false });
      }

      return defaultRows.map((subj) => (
        <tr key={subj.code}>
          <td className={`sf10-td-subject-name ${subj.isSubSubject ? "sf10-sub-subject" : subj.isHeader ? "sf10-row-header" : ""}`}>
            {subj.name}
          </td>
          <td className="sf10-td-center">&nbsp;</td>
          <td className="sf10-td-center">&nbsp;</td>
          <td className="sf10-td-center">&nbsp;</td>
          <td className="sf10-td-center">&nbsp;</td>
          <td className="sf10-td-center">&nbsp;</td>
        </tr>
      ));
    }

    if (isSpaActive && !grades.some(g => String(g.code || g.name).toUpperCase().includes("SPA"))) {
      grades.push({ code: "spa_spec", name: "SPA Specialization", t1: "", t2: "", t3: "", final: "", remarks: "" });
    }

    return grades.map((g, idx) => (
      <tr key={safeStr(g.code) || `subj-${idx}`}>
        <td className={`sf10-td-subject-name ${g.isSubSubject ? "sf10-sub-subject" : g.isHeader ? "sf10-row-header" : ""}`}>
          {safeStr(g.name)}
        </td>
        <td className="sf10-td-center">{safeDisplay(g.t1)}</td>
        <td className="sf10-td-center">{safeDisplay(g.t2)}</td>
        <td className="sf10-td-center">{safeDisplay(g.t3)}</td>
        <td className="sf10-td-center" style={{ fontWeight: g.isHeader ? "bold" : "normal" }}>
          {safeDisplay(g.final)}
        </td>
        <td className="sf10-td-center">{safeStr(g.remarks)}</td>
      </tr>
    ));
  };

  const renderScholasticBlock = (record, defaultGradeNum) => {
    const isPop = Boolean(record?.is_populated);
    const gradeLevel = isPop ? safeStr(record?.grade_level || defaultGradeNum) : safeStr(defaultGradeNum);
    const section = isPop ? safeStr(record?.section_name) : "";
    const sy = isPop ? safeStr(record?.school_year) : "";
    const adviser = isPop ? safeStr(record?.adviser_name) : "";
    const recSchool = isPop && record?.school_name ? safeStr(record.school_name) : school.school_name;
    const recSchoolId = isPop && record?.school_id ? safeStr(record.school_id) : school.school_id;
    const recDistrict = isPop && record?.district ? safeStr(record.district) : school.district;
    const recDivision = isPop && record?.division ? safeStr(record.division) : school.division;
    const recRegion = isPop && record?.region ? safeStr(record.region) : school.region;
    const genAvg = record?.general_average || {};

    return (
      <div className="sf10-scholastic-block">
        <div className="sf10-block-meta-row">
          <div className="sf10-block-meta-field">
            <span className="lbl">School:</span>
            <span className="val" style={{ minWidth: "160px" }}>{recSchool}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">School ID:</span>
            <span className="val" style={{ minWidth: "55px" }}>{recSchoolId}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">District:</span>
            <span className="val" style={{ minWidth: "85px" }}>{recDistrict}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">Division:</span>
            <span className="val" style={{ minWidth: "90px" }}>{recDivision}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">Region:</span>
            <span className="val" style={{ minWidth: "50px" }}>{recRegion}</span>
          </div>
        </div>

        <div className="sf10-block-meta-row">
          <div className="sf10-block-meta-field">
            <span className="lbl">Classified as Grade:</span>
            <span className="val" style={{ minWidth: "40px", textAlign: "center" }}>{gradeLevel}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">Section:</span>
            <span className="val" style={{ minWidth: "100px" }}>{section}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">School Year:</span>
            <span className="val" style={{ minWidth: "80px", textAlign: "center" }}>{sy}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">Name of Adviser/Teacher:</span>
            <span className="val" style={{ minWidth: "150px" }}>{adviser}</span>
          </div>
          <div className="sf10-block-meta-field">
            <span className="lbl">Signature:</span>
            <span className="val" style={{ minWidth: "65px" }}>&nbsp;</span>
          </div>
        </div>

        {/* Scholastic Table with 3 Term Rating Headers */}
        <table className="sf10-table">
          <thead>
            <tr>
              <th rowSpan="2" className="sf10-th-learning-areas">LEARNING AREAS</th>
              <th colSpan="3">Term Rating</th>
              <th rowSpan="2" className="sf10-th-final">FINAL<br />RATING</th>
              <th rowSpan="2" className="sf10-th-remarks">REMARKS</th>
            </tr>
            <tr>
              <th className="sf10-th-term">1</th>
              <th className="sf10-th-term">2</th>
              <th className="sf10-th-term">3</th>
            </tr>
          </thead>
          <tbody>
            {renderScholasticRows(record)}
            {/* General Average Row */}
            <tr className="sf10-gen-avg-row">
              <td className="sf10-gen-avg-lbl">General Average</td>
              <td className="sf10-td-center">{safeDisplay(genAvg.t1)}</td>
              <td className="sf10-td-center">{safeDisplay(genAvg.t2)}</td>
              <td className="sf10-td-center">{safeDisplay(genAvg.t3)}</td>
              <td className="sf10-td-center font-bold">{safeDisplay(genAvg.final)}</td>
              <td className="sf10-td-center">{safeStr(genAvg.remarks)}</td>
            </tr>
          </tbody>
        </table>

        {/* Remedial Classes Sub-table */}
        <div className="sf10-remedial-box">
          <div className="sf10-remedial-header-row">
            <span>Remedial Classes</span>
            <span>Conducted from (mm/dd/yyyy): ____________________</span>
            <span>to (mm/dd/yyyy): ____________________</span>
          </div>
          <table className="sf10-remedial-table">
            <thead>
              <tr>
                <th style={{ width: "35%" }}>Learning Areas</th>
                <th style={{ width: "15%" }}>Final Rating</th>
                <th style={{ width: "18%" }}>Remedial Class Mark</th>
                <th style={{ width: "18%" }}>Recomputed Final Grade</th>
                <th style={{ width: "14%" }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
              <tr>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="sf10-document-wrapper">
      {/* ============================================================
          PAGE 1 OF SF10: LEARNER INFO, ELIGIBILITY, GRADE 7 & 8
         ============================================================ */}
      <div className="sf10-page-sheet" ref={page1Ref} id="sf10-page-1">
        <div className="sf10-doc-top-bar">
          <span className="sf10-code-tag">SF 10 - JHS</span>
          <span className="sf10-page-tag">&nbsp;</span>
        </div>

        {/* Official Header */}
        <div className="sf10-header-grid">
          <div className="sf10-header-logo-left">
            <img src={depedLogo} alt="DepEd Seal" />
          </div>
          <div className="sf10-header-center-text">
            <p>Republic of the Philippines</p>
            <p>Department of Education</p>
            <h1 className="sf10-doc-main-title">Learner's Permanent Academic Record for Junior High School (SF10-JHS)</h1>
            <p className="sf10-doc-sub-title">(Formerly Form 137)</p>
          </div>
          <div className="sf10-header-logo-right">
            <img src={depedGifLogo} alt="DepEd Logo" />
          </div>
        </div>

        {/* LEARNER'S INFORMATION */}
        <div className="sf10-section-banner">LEARNER'S INFORMATION</div>
        <div className="sf10-info-box">
          <div className="sf10-info-row">
            <div className="sf10-info-field" style={{ flex: "2" }}>
              <span className="lbl">LAST NAME:</span>
              <span className="underline-val" style={{ fontWeight: "bold" }}>{learner.last_name}</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "2" }}>
              <span className="lbl">FIRST NAME:</span>
              <span className="underline-val" style={{ fontWeight: "bold" }}>{learner.first_name}</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "1" }}>
              <span className="lbl">NAME EXTN. (Jr,I,II):</span>
              <span className="underline-val text-center">{learner.name_extension}</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "2" }}>
              <span className="lbl">MIDDLE NAME:</span>
              <span className="underline-val">{learner.middle_name}</span>
            </div>
          </div>
          <div className="sf10-info-row">
            <div className="sf10-info-field" style={{ flex: "2" }}>
              <span className="lbl">Learner Reference Number (LRN):</span>
              <span className="underline-val" style={{ fontWeight: "bold" }}>{learner.lrn}</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "2" }}>
              <span className="lbl">Birthdate (mm/dd/yyyy):</span>
              <span className="underline-val text-center">{learner.birthdate_formatted}</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "1" }}>
              <span className="lbl">Sex:</span>
              <span className="underline-val text-center">{learner.sex}</span>
            </div>
          </div>
        </div>

        {/* ELIGIBILITY FOR JHS ENROLMENT */}
        <div className="sf10-section-banner">ELIGIBILITY FOR JHS ENROLMENT</div>
        <div className="sf10-info-box">
          <div className="sf10-info-row">
            <div className="sf10-info-field" style={{ flex: "2" }}>
              <span className="sf10-checkbox">&#10003;</span>
              <span className="lbl">Elementary School Completer</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "2" }}>
              <span className="lbl">General Average:</span>
              <span className="underline-val" style={{ minWidth: "60px" }}>&nbsp;</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "3" }}>
              <span className="lbl">Citation: (If Any)</span>
              <span className="underline-val" style={{ minWidth: "120px" }}>&nbsp;</span>
            </div>
          </div>

          <div className="sf10-info-row">
            <div className="sf10-info-field" style={{ flex: "3" }}>
              <span className="lbl">Name of Elementary School:</span>
              <span className="underline-val">&nbsp;</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "1.5" }}>
              <span className="lbl">School ID:</span>
              <span className="underline-val">&nbsp;</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "3.5" }}>
              <span className="lbl">Address of School:</span>
              <span className="underline-val">&nbsp;</span>
            </div>
          </div>

          <div className="sf10-info-row" style={{ marginTop: "2px" }}>
            <span className="lbl" style={{ fontStyle: "italic", minWidth: "140px" }}>Other Credential Presented:</span>
            <div className="sf10-info-field" style={{ marginRight: "12px" }}>
              <span className="sf10-checkbox">&nbsp;</span>
              <span className="lbl">PEPT Passer</span>
              <span style={{ fontSize: "8px", marginLeft: "2px" }}>Rating:</span>
              <span className="underline-val" style={{ minWidth: "40px" }}>&nbsp;</span>
            </div>
            <div className="sf10-info-field" style={{ marginRight: "12px" }}>
              <span className="sf10-checkbox">&nbsp;</span>
              <span className="lbl">ALS A &amp; E Passer</span>
              <span style={{ fontSize: "8px", marginLeft: "2px" }}>Rating:</span>
              <span className="underline-val" style={{ minWidth: "40px" }}>&nbsp;</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "1" }}>
              <span className="sf10-checkbox">&nbsp;</span>
              <span className="lbl">Others (Pls. Specify):</span>
              <span className="underline-val" style={{ flex: "1" }}>&nbsp;</span>
            </div>
          </div>

          <div className="sf10-info-row">
            <div className="sf10-info-field" style={{ flex: "2.5" }}>
              <span className="lbl">Date of Examination/Assessment (mm/dd/yyyy):</span>
              <span className="underline-val" style={{ minWidth: "70px" }}>&nbsp;</span>
            </div>
            <div className="sf10-info-field" style={{ flex: "3.5" }}>
              <span className="lbl">Name and Address of Testing Center:</span>
              <span className="underline-val">&nbsp;</span>
            </div>
          </div>
        </div>

        {/* SCHOLASTIC RECORD - GRADE 7 */}
        <div className="sf10-section-banner">SCHOLASTIC RECORD</div>
        {renderScholasticBlock(recordG7, "7")}

        {/* SCHOLASTIC RECORD - GRADE 8 */}
        {renderScholasticBlock(recordG8, "8")}

        {/* Page 1 Certification */}
        <div className="sf10-cert-section">
          <div className="sf10-cert-header">CERTIFICATION</div>
          <p className="sf10-cert-text">
            I CERTIFY that this is a true record of <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.true_record_of}</span> with LRN <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.lrn}</span> and that he/she is eligible for admission to Grade <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.eligible_for_admission_to_grade || "________"}</span>.
            <br />
            Name of School: <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.school_name}</span> School ID: <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.school_id}</span> Last School Year Attended: <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.last_school_year_attended}</span>
          </p>
          <div className="sf10-cert-sign-grid">
            <div className="sf10-cert-sign-col">
              <div className="sf10-cert-sign-line">{cert.date_issued}</div>
              <span>Date</span>
            </div>
            <div className="sf10-cert-sign-col">
              <div className="sf10-cert-sign-line">{cert.principal_name}</div>
              <span>Name of Principal/School Head over Printed Name</span>
            </div>
            <div className="sf10-cert-sign-col sf10-seal-box">
              <span>(Affix School Seal here)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          PAGE 2 OF SF10: GRADE 9, GRADE 10 & TRANSFER CERTIFICATION
         ============================================================ */}
      <div className="sf10-page-sheet" ref={page2Ref} id="sf10-page-2">
        <div className="sf10-doc-top-bar" style={{ marginBottom: "8px" }}>
          <span className="sf10-code-tag">SF 10-JHS</span>
          <span className="sf10-page-tag">Page 2 of 2</span>
        </div>

        {/* SCHOLASTIC RECORD - GRADE 9 */}
        {renderScholasticBlock(recordG9, "9")}

        {/* SCHOLASTIC RECORD - GRADE 10 */}
        {renderScholasticBlock(recordG10, "10")}

        {/* TRANSFER OUT / JHS COMPLETER CERTIFICATION */}
        <div className="sf10-cert-section" style={{ marginTop: "16px" }}>
          <div className="sf10-cert-header" style={{ textAlign: "left", fontSize: "8.5px", fontStyle: "italic", marginBottom: "4px" }}>
            For Transfer Out / JHS Completer Only
          </div>
          <div className="sf10-cert-header">CERTIFICATION</div>
          <p className="sf10-cert-text">
            I CERTIFY that this is a true record of <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.true_record_of}</span> with LRN <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.lrn}</span> and that he/she is eligible for admission to Grade <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{recordG10.general_average?.remarks === "Passed" ? "Grade 11 (SHS)" : "________"}</span>.
            <br />
            Name of School: <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.school_name}</span> School ID: <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.school_id}</span> Last School Year Attended: <span style={{ textDecoration: "underline", fontWeight: "bold" }}>{cert.last_school_year_attended}</span>
          </p>
          <div className="sf10-cert-sign-grid">
            <div className="sf10-cert-sign-col">
              <div className="sf10-cert-sign-line">{cert.date_issued}</div>
              <span>Date</span>
            </div>
            <div className="sf10-cert-sign-col">
              <div className="sf10-cert-sign-line">{cert.principal_name}</div>
              <span>Name of Principal/School Head over Printed Name</span>
            </div>
            <div className="sf10-cert-sign-col sf10-seal-box">
              <span>(Affix School Seal here)</span>
            </div>
          </div>
        </div>

        <div className="sf10-footnote">
          <span>(May add Certification box if needed)</span>
          <span>SFRT Revised 2017</span>
        </div>
      </div>
    </div>
  );
}
