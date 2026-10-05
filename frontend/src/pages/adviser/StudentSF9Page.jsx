import { useState, useMemo, useEffect } from "react";
import { Eye, Download, FileText, Sparkles, Printer, FileSpreadsheet, CheckCircle2, Loader2 } from "lucide-react";
import "../../styles/studentSF9.css";

import depedLogo from "../../assets/deped_logo.png";
import gccnhsLogo from "../../assets/gccnhs_logo.png";
import backIconUrl from "../../assets/backButton.svg";
import { getStoredUser, normalizeRole } from "../../utils/auth";
import { getStudentSF9Details } from "../../services/studentSf9Service";
import { getStudentSF10Details } from "../../services/reportService";
import Toast from "../../components/common/Toast.jsx";
import { exportSf9Pdf } from "../../utils/exportSf9Pdf";
import SF10PreviewModal from "../../components/SF10PreviewModal.jsx";
import { exportSf10Excel } from "../../utils/exportSf10Excel.js";

export default function StudentSF9Page(props) {
  const student = props.student;
  const identity = student?.student_id || student?.studentId || student?.student_section_id || student?.studentSectionId || student?.lrn || student?.id || "default";
  const schoolYear = student?.schoolYearId || student?.schoolYear || "";
  // Remount learner-specific state before showing another learner's report.
  return <StudentSF9Details key={`${identity}:${schoolYear}:${props.reportIdentifier || ""}`} {...props} />;
}

function StudentReportSkeleton({ student, onBack }) {
  return <div className="student-sf9-container" role="status" aria-label="Loading learner report" aria-busy="true">
    <div className="sf9-header-bar no-print">
      <button className="back-btn" onClick={onBack} aria-label="Back"><img src={backIconUrl} alt="" width={17} height={17} /></button>
      <h1 className="sf9-section-title">{student?.section || "Student Reports"}</h1>
    </div>
    <div className="student-header-grid sf9-report-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => <div className="sf9-skeleton-card" key={index}>
        <span className="sf9-skeleton-block sf9-skeleton-heading" /><span className="sf9-skeleton-block" />
      </div>)}
    </div>
    <div className="sf9-skeleton-tabs" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => <span className="sf9-skeleton-block" key={index} />)}
    </div>
    <div className="sf9-skeleton-sheet" aria-hidden="true">
      <span className="sf9-skeleton-block sf9-skeleton-title" />
      <span className="sf9-skeleton-block sf9-skeleton-subtitle" />
      <div className="sf9-skeleton-table">
        {Array.from({ length: 7 }, (_, row) => <div className="sf9-skeleton-row" key={row}>
          {Array.from({ length: 4 }, (_, column) => <span className="sf9-skeleton-block" key={column} />)}
        </div>)}
      </div>
    </div>
  </div>;
}

function StudentSF9Details({ student, onBack, userRole: propUserRole, initialTab, isAdviser: propIsAdviser, reportIdentifier, loadReport = getStudentSF9Details }) {
  const storedUser = useMemo(() => getStoredUser(), []);
  const normRole = useMemo(() => normalizeRole(storedUser?.role, storedUser), [storedUser]);
  const userRole = propUserRole || (normRole === "adviser" ? "adviser" : normRole === "principal" ? "principal" : "teacher");
  const isAdviser = typeof propIsAdviser === "boolean"
    ? propIsAdviser
    : (userRole === "adviser" || userRole === "principal");

  const [requestedTab, setActiveTab] = useState(() => {
    if (!isAdviser) return "personal";
    return initialTab || "sf9";
  });

  const activeTab = isAdviser ? requestedTab : "personal";
  const [viewMode, setViewMode] = useState("spread"); // "spread", "front", "back"
  const [sf10ToolbarHost, setSF10ToolbarHost] = useState(null);
  const [sf9Data, setSf9Data] = useState(null);
  const identifier = reportIdentifier || student?.student_id || student?.studentId || student?.student_section_id || student?.studentSectionId || student?.lrn || student?.id;
  const schoolYearId = student?.schoolYearId;
  const [loading, setLoading] = useState(Boolean(identifier));
  const [loadError, setLoadError] = useState(false);
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [downloadingSF10, setDownloadingSF10] = useState(false);
  // This details component remounts for a different learner/school year.
  const [cachedSF10Data, setCachedSF10Data] = useState(null);

  // Teacher Comments/Remarks state for terms with frontend localStorage persistence
  const studentKey = student?.lrn || student?.student_id || student?.studentId || student?.id || "default";
  const storageKey = `sf9_comments_${studentKey}`;

  const [comments, setComments] = useState(() => {
    if (userRole === "principal") return { term1: "", term2: "", term3: "" };
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return { term1: "", term2: "", term3: "", ...parsed };
        }
      }
    } catch (e) {
      console.error("Error loading saved SF9 comments:", e);
    }
    return { term1: "", term2: "", term3: "" };
  });

  const handleCommentChange = (term, val) => {
    const updated = { ...comments, [term]: val };
    setComments(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving SF9 comments:", e);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (identifier) {
      loadReport(identifier, { schoolYearId })
        .then((data) => {
          if (isMounted && data) {
            setSf9Data(data);
          }
        })
        .catch((err) => {
          if (isMounted) setLoadError(true);
          console.error("Failed to load dynamic SF9 data:", err);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    }
    return () => { isMounted = false; };
  }, [identifier, schoolYearId, requestAttempt, loadReport]);

  // Dynamic student records matching official layout
  const studentProfile = useMemo(() => {
    const fetched = sf9Data?.studentProfile || {};
    return {
      name: fetched.name || student?.name || "",
      lrn: fetched.lrn || student?.lrn || "",
      gradeLevel: fetched.gradeLevel || student?.gradeLevel || "",
      grade: fetched.grade || student?.grade || "",
      section: fetched.section || student?.section || "",
      program: fetched.program || student?.program || "",
      sex: fetched.sex || student?.sex || student?.gender || "",
      age: sf9Data ? (fetched.age ?? "") : (student?.age ?? ""),
      schoolYear: fetched.schoolYear || student?.schoolYear || "",
      dateOfBirth: fetched.dateOfBirth || student?.dateOfBirth || "",
      address: fetched.address || student?.address || "",
      termGrade: fetched.termGrade ?? student?.grade ?? "",
      honorStatus: fetched.honorStatus || student?.honorStatus || "",
      daysPresent: fetched.daysPresent ?? student?.daysPresent ?? 0,
      daysAbsent: fetched.daysAbsent ?? student?.daysAbsent ?? 0,
      missingActivities: fetched.missingActivities ?? student?.missingActivities ?? 0,
      adviserName: fetched.adviserName || student?.adviserName || "",
      principalName: (() => {
        const raw = fetched.principalName || student?.principalName || "";
        if (!raw) return "";
        return raw;
      })(),
      admittedToGrade: "", // Leave blank as requested
      eligibleForAdmission: "" // Leave blank as requested
    };
  }, [sf9Data, student]);

  // Official SF9 Subjects
  const grades = useMemo(() => {
    if (sf9Data?.grades && sf9Data.grades.length > 0) {
      return sf9Data.grades;
    }
    return [
      { code: "fil", name: "Filipino", t1: "", t2: "", t3: "", final: "", remark: "" },
      { code: "eng", name: "English", t1: "", t2: "", t3: "", final: "", remark: "" },
      { code: "math", name: "Mathematics", t1: "", t2: "", t3: "", final: "", remark: "" },
      { code: "sci", name: "Science", t1: "", t2: "", t3: "", final: "", remark: "" },
      { code: "ap", name: "Araling Panlipunan (AP)", t1: "", t2: "", t3: "", final: "", remark: "" },
      { code: "ve", name: "Values Education", t1: "", t2: "", t3: "", final: "", remark: "" },
      { code: "tle", name: "TLE", t1: "", t2: "", t3: "", final: "", remark: "" },
      { code: "mapeh", name: "MAPEH", t1: "", t2: "", t3: "", final: "", remark: "", isHeader: true },
      { code: "music_arts", name: "Music and Arts", t1: "", t2: "", t3: "", final: "", remark: "", isSubSubject: true },
      { code: "pe_health", name: "Physical Education and Health", t1: "", t2: "", t3: "", final: "", remark: "", isSubSubject: true },
    ];
  }, [sf9Data]);

  // Performance Descriptors matching the official layout
  const performanceDescriptors = [
    { scale: "90-100", desc: "Advancing", remarks: "Passed" },
    { scale: "80-89", desc: "Benchmarking", remarks: "Passed" },
    { scale: "75-79", desc: "Connecting", remarks: "Passed" },
    { scale: "65-74", desc: "Developing", remarks: "Failed" },
    { scale: "0-64", desc: "Emerging", remarks: "Failed" }
  ];

  // Official Attendance Record Data (11 months: Jun - Apr)
  const attendanceData = useMemo(() => {
    if (sf9Data?.attendanceData) {
      return sf9Data.attendanceData;
    }
    return {
      months: ["Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
      classDays: new Array(11).fill(0),
      daysPresent: new Array(11).fill(0),
      daysAbsent: new Array(11).fill(0)
    };
  }, [sf9Data]);

  const [toast, setToast] = useState({ message: "", variant: "success", icon: null });

  const showToast = (message, variant = "success", icon = CheckCircle2) => {
    setToast({ message, variant, icon });
    setTimeout(() => {
      setToast({ message: "", variant: "success", icon: null });
    }, 4000);
  };

  const getAttendanceTotal = (arr) => arr.every(value => typeof value === "number" && Number.isFinite(value))
    ? arr.reduce((acc, curr) => acc + curr, 0) : "";

  const getStudentLastName = () => {
    if (student?.last_name) return String(student.last_name).trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    if (student?.lastName) return String(student.lastName).trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
    if (studentProfile?.name) {
      const nameStr = String(studentProfile.name).trim();
      if (nameStr.includes(",")) {
        const parts = nameStr.split(",");
        const cleaned = parts[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
        if (cleaned) return cleaned;
      } else {
        const parts = nameStr.split(/\s+/);
        const lastPart = parts[parts.length - 1].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
        if (lastPart) return lastPart;
      }
    }
    return "STUDENT";
  };

  const handleDownloadPDF = async () => {
    if (loading || loadError || !sf9Data) return;
    try {
      showToast(`Generating PDF for ${studentProfile.name || "Student"}...`, "info", CheckCircle2);
      await exportSf9Pdf({
        studentProfile,
        grades,
        performanceDescriptors,
        attendanceData,
        comments,
        depedLogo,
        gccnhsLogo,
      });
      showToast(`Downloaded PDF SF9 Performance Report for ${studentProfile.name}`, "success", CheckCircle2);
    } catch (err) {
      console.error("Failed to export SF9 PDF:", err);
      showToast("Failed to download SF9 PDF. Please try again.", "error");
    }
  };

  const handlePrint = () => {
    if (loading || loadError || !sf9Data) return;
    const originalTitle = document.title;
    const lastName = getStudentLastName();
    const fileName = `${lastName}_SF9`;

    showToast(`Opening Print Preview for ${studentProfile.name || "Student"}...`, "info", Printer);

    setTimeout(() => {
      document.title = fileName;
      window.print();
      document.title = originalTitle;
    }, 100);
  };

  const sf10StudentProp = useMemo(() => ({
    ...student,
    ...studentProfile,
    grades: grades,
    studentId: studentProfile.studentId || student?.studentId || student?.student_id,
    studentSectionId: studentProfile.studentSectionId || student?.studentSectionId || student?.student_section_id,
    lrn: studentProfile.lrn || student?.lrn || student?.LRN
  }), [student, studentProfile, grades]);

  const handleDirectDownloadSF10 = async () => {
    if (downloadingSF10) return;
    setDownloadingSF10(true);
    showToast("Generating Form 10 Excel (.xlsx)...", "info");

    try {
      let data = cachedSF10Data;
      const identifier =
        sf10StudentProp.studentId ||
        sf10StudentProp.student_id ||
        sf10StudentProp.studentSectionId ||
        sf10StudentProp.lrn ||
        sf10StudentProp.id;

      if (!data && identifier) {
        try {
          data = await getStudentSF10Details(identifier);
          if (data) setCachedSF10Data(data);
        } catch (fetchErr) {
          if (userRole === "principal") throw fetchErr;
          console.warn("Could not fetch remote SF10 data, using client fallback:", fetchErr);
        }
      }
      if (userRole === "principal" && !data) throw new Error("Official SF10 records are unavailable.");

      const lastName = getStudentLastName();
      const fileName = `${lastName}_SF10.xlsx`;

      await exportSf10Excel({
        student: sf10StudentProp,
        sf10Data: data,
        fileName
      });
      showToast(`Successfully downloaded ${fileName}!`, "success");
    } catch (err) {
      console.error("Direct SF10 Excel download error:", err);
      showToast("Failed to generate Form 10 Excel file. Please try again.", "error");
    } finally {
      setDownloadingSF10(false);
    }
  };

  const handleBulkDownload = async () => {
    showToast("Preparing bulk download for student records...", "info", Download);
    try {
      if (sf9Data) {
        await handleDownloadPDF();
      }
      await handleDirectDownloadSF10();
      showToast("Completed downloading student documents!", "success");
    } catch {
      showToast("Triggered download of available forms.", "info");
    }
  };

  if (loading) return <StudentReportSkeleton student={student} onBack={onBack} />;

  return (
    <div className="student-sf9-container" aria-busy={loading}>
      {sf9Data?.warnings?.length > 0 && <aside className="sf9-report-warnings" aria-label="Report completeness notes">
        <strong>Review before issuing</strong>
        <ul>{sf9Data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </aside>}
      {loadError && (
        <div role="alert" className="no-print">
          <p>Student records could not be loaded.</p>
          <button type="button" onClick={() => {
            setLoadError(false);
            setLoading(true);
            setRequestAttempt(attempt => attempt + 1);
          }}>Try again</button>
        </div>
      )}
      {/* Top Navigation / Breadcrumb Area */}
      <div className="sf9-header-bar no-print">
        <button className="back-btn" onClick={onBack} title={userRole === "principal" ? "Back to Reports" : "Back to Class List"}>
          <img src={backIconUrl} alt="Back" width={17} height={17} />
        </button>
        <h1 className="sf9-section-title">{studentProfile.section}</h1>
      </div>

      {/* Student Overview Indicator Header Cards */}
      <div className="student-header-grid no-print">
        {/* Name & Basic Info */}
        <div className="sf9-card student-profile-header-card">
          <div>
            <h2 className="student-name-title">{studentProfile.name}</h2>
            <div className="student-meta-row">
              <span>LRN: {studentProfile.lrn}</span>
              <div className="meta-divider" />
              <span>{studentProfile.gradeLevel}</span>
              <div className="meta-divider" />
              <span>{studentProfile.sex}</span>
            </div>
          </div>
        </div>

        {/* Term Grade average */}
        <div className="sf9-card term-grade-card">
          <span className="term-grade-label">{reportIdentifier ? "Final Average" : "Term Grade"}: {studentProfile.termGrade}</span>
          <span className="honor-badge">
            <Sparkles size={12} style={{ display: "inline-block", marginRight: "4px", verticalAlign: "middle" }} />
            {studentProfile.honorStatus}
          </span>
        </div>

        {/* Present Days */}
        <div className="sf9-card stat-metric-card present">
          <span className="stat-metric-value">{studentProfile.daysPresent}</span>
          <span className="stat-metric-label">Days Present</span>
        </div>

        {/* Absent Days */}
        <div className="sf9-card stat-metric-card absent">
          <span className="stat-metric-value">{studentProfile.daysAbsent}</span>
          <span className="stat-metric-label">Days Absent</span>
        </div>

        {/* Missing Activities */}
        <div className="sf9-card stat-metric-card missing">
          <span className="stat-metric-value">{studentProfile.missingActivities}</span>
          <span className="stat-metric-label">Missing Activities</span>
        </div>
      </div>

      {/* Tabs & Controls Row */}
      <div className="sf9-controls-row no-print">
        {/* Tabs Selector */}
        {isAdviser ? (
          <div className="sf9-tabs-outer">
            <button
              className={`sf9-tab-button ${activeTab === "sf9" ? "active" : ""}`}
              aria-pressed={activeTab === "sf9"}
              onClick={() => setActiveTab("sf9")}
            >
              Official SF9 Form
            </button>
            <button className={`sf9-tab-button ${activeTab === "sf10" ? "active" : ""}`}
              aria-pressed={activeTab === "sf10"}
              onClick={() => setActiveTab("sf10")}>Official SF10 Form</button>
            <button
              className={`sf9-tab-button ${activeTab === "personal" ? "active" : ""}`}
              aria-pressed={activeTab === "personal"}
              onClick={() => setActiveTab("personal")}
            >
              Personal Info
            </button>
          </div>
        ) : (
          <div className="sf9-tabs-outer">
            <button className="sf9-tab-button active">
              Personal Info
            </button>
          </div>
        )}

        {/* View Mode & Print Action Toolbar (Adviser SF9 view) */}
        {activeTab === "sf10" && isAdviser && (
          <div className="sf9-actions-toolbar" ref={setSF10ToolbarHost} />
        )}
        {activeTab === "sf9" && isAdviser && (
          <div className="sf9-actions-toolbar">
            <div className="sf9-view-modes">
              <button
                className={`sf9-view-btn ${viewMode === "spread" ? "active" : ""}`}
                onClick={() => setViewMode("spread")}
                title="View Front & Back Spread"
              >
                Spread View
              </button>
              <button
                className={`sf9-view-btn ${viewMode === "front" ? "active" : ""}`}
                onClick={() => setViewMode("front")}
                title="View Front (Performance Report)"
              >
                Front Page
              </button>
              <button
                className={`sf9-view-btn ${viewMode === "back" ? "active" : ""}`}
                onClick={() => setViewMode("back")}
                title="View Back (Attendance & Transfer)"
              >
                Back Page
              </button>
            </div>

            <button className="sf9-download-btn" onClick={handleDownloadPDF} disabled={loading || loadError || !sf9Data} title="Download SF9 PDF">
              <Download size={16} />
              <span>Download PDF</span>
            </button>
            <button className="sf9-print-btn" onClick={handlePrint} disabled={loading || loadError || !sf9Data} title="Open browser print dialog to print or save SF9 as PDF">
              <Printer size={16} />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === "sf9" && isAdviser ? (
        /* Official SF9 Document Spread Layout */
        <div className={`sf9-document-spread ${viewMode}`}>

          {/* ============================================================
              FRONT PAGE (PAGE 1): LEARNER'S PERFORMANCE REPORT
             ============================================================ */}
          <div className={`sf9-official-sheet sf9-front-sheet ${viewMode === "back" ? "hide-on-screen" : ""}`}>

              {/* Official Header */}
              <div className="sf9-sheet-header">
                <div className="sf9-header-grid">
                  <div className="sf9-header-logo-left">
                    <img src={depedLogo} alt="DepEd Seal" className="sf9-logo-img" />
                  </div>
                  <div className="sf9-header-text-center">
                    <p className="sf9-hdr-line">Republic of the Philippines</p>
                    <p className="sf9-hdr-line">Department of Education</p>
                    <p className="sf9-hdr-line">Region X – Northern Mindanao</p>
                    <p className="sf9-hdr-line font-bold">SCHOOLS DIVISION OFFICE OF GINGOOG CITY</p>
                    <p className="sf9-hdr-line">West 1 District</p><p className="sf9-hdr-line">Gingoog City, Misamis Oriental</p>
                    <h3 className="sf9-school-name-title">GINGOOG CITY COMPREHENSIVE NATIONAL HIGH SCHOOL</h3>
                    <h2 className="sf9-report-doc-title">LEARNER'S PERFORMANCE REPORT</h2>
                    <p className="sf9-school-year-title">School Year {studentProfile.schoolYear}</p>
                  </div>
                  <div className="sf9-header-logo-right">
                    <img src={gccnhsLogo} alt="GCCNS Seal" className="sf9-logo-img" />
                  </div>
                </div>
              </div>

              {/* Learner Information Underlined Form Fields */}
              <div className="sf9-student-info-section">
                <div className="sf9-info-line-row">
                  <div className="sf9-info-field grow-name">
                    <span className="sf9-field-label">Name:</span>
                    <span className="sf9-field-underline uppercase-val">{studentProfile.name}</span>
                  </div>
                  <div className="sf9-info-field age-field">
                    <span className="sf9-field-label">Age:</span>
                    <span className="sf9-field-underline text-center">{studentProfile.age}</span>
                  </div>
                  <div className="sf9-info-field sex-field">
                    <span className="sf9-field-label">Sex:</span>
                    <span className="sf9-field-underline text-center">{studentProfile.sex}</span>
                  </div>
                </div>

                <div className="sf9-info-line-row">
                  <div className="sf9-info-field grow-name">
                    <span className="sf9-field-label">LRN:</span>
                    <span className="sf9-field-underline">{studentProfile.lrn}</span>
                  </div>
                  <div className="sf9-info-field grade-field">
                    <span className="sf9-field-label">Grade:</span>
                    <span className="sf9-field-underline text-center">{studentProfile.grade}</span>
                  </div>
                  <div className="sf9-info-field section-field">
                    <span className="sf9-field-label">Section:</span>
                    <span className="sf9-field-underline text-center">{studentProfile.section}</span>
                  </div>
                </div>

                <div className="sf9-info-line-row">
                  <div className="sf9-info-field full-field">
                    <span className="sf9-field-label">Program:</span>
                    <span className="sf9-field-underline">{studentProfile.program}</span>
                  </div>
                </div>
              </div>

              {/* Dear Parents Note */}
              <div className="sf9-dear-parents-block">
                <p className="sf9-dp-salutation">Dear Parents,</p>
                <p className="sf9-dp-body">
                  This Performance Report shows the ability and progress your child has made in the different learning areas as well as his/her core values.
                </p>
                <p className="sf9-dp-body">
                  The school welcomes you should you desire to know more about your child's progress.
                </p>
              </div>

              {/* Learning Progress & Achievement Table */}
              <div className="sf9-table-heading">LEARNING PROGRESS AND ACHIEVEMENT</div>
              <table className="sf9-official-table sf9-grades-table">
                <thead>
                  <tr>
                    <th rowSpan="2" className="col-subjects">Subjects</th>
                    <th colSpan="3" className="col-term-head">TERM</th>
                    <th rowSpan="2" className="col-final">Final<br />Grade</th>
                    <th rowSpan="2" className="col-remarks">Remarks</th>
                  </tr>
                  <tr>
                    <th className="col-subterm">1</th>
                    <th className="col-subterm">2</th>
                    <th className="col-subterm">3</th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((row, idx) => (
                    <tr key={idx} className={row.isHeader ? "subject-header-row" : ""}>
                      <td className={row.isSubSubject ? "subj-title-sub" : "subj-title-main"}>
                        {row.name}
                      </td>
                      <td className="grade-num">{row.t1 || ""}</td>
                      <td className="grade-num">{row.t2 || ""}</td>
                      <td className="grade-num">{row.t3 || ""}</td>
                      <td className="grade-num font-bold">{row.final || ""}</td>
                      <td className="grade-remark">{row.remark || ""}</td>
                    </tr>
                  ))}

                  {/* Empty spacer row matching official template */}
                  <tr className="empty-spacer-row">
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>

                  {/* General Average */}
                  <tr className="general-average-row">
                    <td colSpan="4" className="general-avg-label">General Average</td>
                    <td className="grade-num font-bold">{studentProfile.termGrade}</td>
                    <td className="grade-remark font-bold">{studentProfile.termGrade !== "" ? (studentProfile.honorStatus || "Passed") : ""}</td>
                  </tr>
                </tbody>
              </table>

              {/* Performance Descriptors Table */}
              <div className="sf9-descriptors-wrapper">
                <div className="sf9-descriptors-title">PERFORMANCE DESCRIPTORS</div>
                <table className="sf9-descriptors-table-clean">
                  <thead>
                    <tr>
                      <th style={{ width: "35%", textAlign: "center" }}>Grading Scale</th>
                      <th style={{ width: "35%", textAlign: "center" }}>Description</th>
                      <th style={{ width: "30%", textAlign: "center" }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceDescriptors.map((desc, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: "center" }}>{desc.scale}</td>
                        <td style={{ textAlign: "center" }}>{desc.desc}</td>
                        <td style={{ textAlign: "center" }}>{desc.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>

          {/* ============================================================
              BACK PAGE (PAGE 2): ATTENDANCE, REMARKS, SIGNATURES, TRANSFER & CANCELLATION
             ============================================================ */}
          <div className={`sf9-official-sheet sf9-back-sheet ${viewMode === "front" ? "hide-on-screen" : ""}`}>

              {/* Section 1: ATTENDANCE RECORD (Top) */}
              <div className="sf9-section-block">
                <div className="sf9-table-heading">ATTENDANCE RECORD</div>
                <table className="sf9-official-table sf9-attendance-table-clean">
                  <thead>
                    <tr>
                      <th className="col-month-head">Month</th>
                      {attendanceData.months.map((m, idx) => (
                        <th key={idx} className="col-month-col">{m}</th>
                      ))}
                      <th className="col-total-col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="row-att-label">No. of Class Days</td>
                      {attendanceData.classDays.map((d, idx) => (
                        <td key={idx} className="att-num">{d}</td>
                      ))}
                      <td className="att-num font-bold">{getAttendanceTotal(attendanceData.classDays)}</td>
                    </tr>
                    <tr>
                      <td className="row-att-label">No. of Days Present</td>
                      {attendanceData.daysPresent.map((d, idx) => (
                        <td key={idx} className="att-num">{d}</td>
                      ))}
                      <td className="att-num font-bold">{getAttendanceTotal(attendanceData.daysPresent)}</td>
                    </tr>
                    <tr>
                      <td className="row-att-label">No. of Days Absent</td>
                      {attendanceData.daysAbsent.map((d, idx) => (
                        <td key={idx} className="att-num">{d}</td>
                      ))}
                      <td className="att-num font-bold">{getAttendanceTotal(attendanceData.daysAbsent)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Section 2: TEACHER'S COMMENTS/REMARKS (Full-Width Bordered Box) */}
              <div className="sf9-section-block">
                <div className="sf9-table-heading">TEACHER'S COMMENTS/REMARKS</div>
                <div className="sf9-term-comments-box">
                  <div className="sf9-comment-term-row">
                    <span className="sf9-term-label font-bold">Term 1</span>
                    <div className="sf9-comment-textarea-wrap">
                      <textarea
                        className="sf9-comment-input"
                        rows="2"
                        value={comments.term1}
                        readOnly={userRole === "principal"}
                        onChange={(e) => handleCommentChange("term1", e.target.value)}
                        placeholder="Enter comments for Term 1..."
                      />
                    </div>
                  </div>

                  <div className="sf9-comment-term-row">
                    <span className="sf9-term-label font-bold">Term 2</span>
                    <div className="sf9-comment-textarea-wrap">
                      <textarea
                        className="sf9-comment-input"
                        rows="2"
                        value={comments.term2}
                        readOnly={userRole === "principal"}
                        onChange={(e) => handleCommentChange("term2", e.target.value)}
                        placeholder="Enter comments for Term 2..."
                      />
                    </div>
                  </div>

                  <div className="sf9-comment-term-row">
                    <span className="sf9-term-label font-bold">Term 3</span>
                    <div className="sf9-comment-textarea-wrap">
                      <textarea
                        className="sf9-comment-input"
                        rows="2"
                        value={comments.term3}
                        readOnly={userRole === "principal"}
                        onChange={(e) => handleCommentChange("term3", e.target.value)}
                        placeholder="Enter comments for Term 3..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: PARENTS/GUARDIAN'S SIGNATURE (Full-Width Lined Block) */}
              <div className="sf9-section-block sf9-parent-signatures-full">
                <div className="sf9-table-heading">PARENTS/GUARDIAN'S SIGNATURE</div>
                <div className="sf9-parent-sig-stack">
                  <div className="sf9-parent-sig-row">
                    <span className="sf9-parent-sig-label font-bold">Term 1</span>
                    <div className="sf9-parent-sig-line"></div>
                  </div>
                  <div className="sf9-parent-sig-row">
                    <span className="sf9-parent-sig-label font-bold">Term 2</span>
                    <div className="sf9-parent-sig-line"></div>
                  </div>
                  <div className="sf9-parent-sig-row">
                    <span className="sf9-parent-sig-label font-bold">Term 3</span>
                    <div className="sf9-parent-sig-line"></div>
                  </div>
                </div>
              </div>

              {/* Section 4: CERTIFICATE OF TRANSFER */}
              <div className="sf9-section-block sf9-certificate-section">
                <div className="sf9-table-heading">CERTIFICATE OF TRANSFER</div>
                <p className="sf9-cert-statement">
                  This is to certify that the above-named learner has satisfactorily completed the requirements for the grade level indicated.
                </p>

                <div className="sf9-cert-form-lines">
                  <div className="sf9-cert-line">
                    <span className="sf9-cert-label">Admitted to Grade:</span>
                    <span className="sf9-cert-underline">{studentProfile.admittedToGrade || ""}</span>
                  </div>
                  <div className="sf9-cert-line">
                    <span className="sf9-cert-label">Eligible for Admission to Grade:</span>
                    <span className="sf9-cert-underline">{studentProfile.eligibleForAdmission || ""}</span>
                  </div>
                </div>

                <div className="sf9-approved-block">
                  <div className="sf9-approved-title font-bold">Approved:</div>
                  <div className="sf9-transfer-signatures-row">
                    <div className="sf9-sig-signatory-col school-head-sig">
                      <div className="sf9-signatory-line font-bold">{studentProfile.principalName}</div>
                      <div className="sf9-signatory-role">School Head</div>
                    </div>
                    <div className="sf9-sig-signatory-col adviser-sig">
                      <div className="sf9-signatory-line font-bold">{studentProfile.adviserName}</div>
                      <div className="sf9-signatory-role">Adviser</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5: CANCELLATION OF ELIGIBILITY TO TRANSFER */}
              <div className="sf9-section-block sf9-cancellation-section">
                <div className="sf9-table-heading">CANCELLATION OF ELIGIBILITY TO TRANSFER</div>
                <div className="sf9-cancel-row">
                  <div className="sf9-cancel-field cancel-admitted">
                    <span className="sf9-cert-label">Admitted in:</span>
                    <span className="sf9-cert-underline"></span>
                  </div>
                  <div className="sf9-cancel-field cancel-date">
                    <span className="sf9-cert-label">Date:</span>
                    <span className="sf9-cert-underline"></span>
                  </div>
                </div>

                <div className="sf9-cancel-signatory-row">
                  <div className="sf9-sig-signatory-col school-head-sig">
                    <div className="sf9-signatory-line font-bold">{studentProfile.principalName}</div>
                    <div className="sf9-signatory-role">School Head</div>
                  </div>
                </div>
              </div>

            </div>

        </div>
      ) : activeTab === "sf10" && isAdviser ? (
        <SF10PreviewModal isOpen inline student={sf10StudentProp}
          toolbarTarget={sf10ToolbarHost}
          initialData={cachedSF10Data} onDataLoaded={setCachedSF10Data}
          requireOfficialData={userRole === "principal"} onClose={() => setActiveTab("sf9")} />
      ) : (
        /* Personal Info Tab Layout */
        <div className="personal-info-grid" style={!isAdviser ? { gridTemplateColumns: "1fr" } : undefined}>

          {/* Left Column: Student Profile Information Card */}
          <div className="profile-info-column" style={!isAdviser ? { gridColumn: "1 / -1" } : undefined}>
            <div className="profile-info-header">
              <h3 className="profile-info-title">Student Profile Information</h3>
              <p className="profile-info-subtitle">Student demographic and enrollment details</p>
            </div>

            <div className="profile-info-card">
              <div className="profile-fields-list">
                <div className="profile-field-group">
                  <span className="profile-field-label">Full Name</span>
                  <span className="profile-field-value">{studentProfile.name || "—"}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Learner Reference Number</span>
                  <span className="profile-field-value">{studentProfile.lrn || "—"}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Sex</span>
                  <span className="profile-field-value">{studentProfile.sex || "—"}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Date of Birth</span>
                  <span className="profile-field-value">{studentProfile.dateOfBirth || "—"}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Address</span>
                  <span className="profile-field-value">{studentProfile.address || "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Documents Section (Adviser ONLY) */}
          {isAdviser && (
            <div className="documents-section">
              <div className="profile-info-header">
                <h3 className="documents-section-title">Documents</h3>
                <p className="profile-info-subtitle" style={{ visibility: "hidden" }}>&nbsp;</p>
              </div>

              <div className="documents-grid">
                {/* Form 10 Card */}
                <div className="doc-card">
                  <div className="doc-card-top">
                    <div className="doc-icon-box">
                      <FileSpreadsheet size={22} />
                    </div>
                    <div className="doc-details">
                      <h4 className="doc-title">Form 10 - Permanent Record</h4>
                      <p className="doc-subtitle">Official cumulative student record (.xlsx)</p>
                      <span className="doc-status-badge">Available</span>
                      <div className="doc-actions">
                        <button
                          className="btn-doc-action preview"
                          onClick={() => setActiveTab("sf10")}
                          title="Preview Form 10"
                        >
                          <Eye size={14} />
                          <span>Preview</span>
                        </button>
                        <button
                          className="btn-doc-action download"
                          onClick={handleDirectDownloadSF10}
                          disabled={downloadingSF10}
                          title="Download Form 10 Excel (.xlsx)"
                        >
                          {downloadingSF10 ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Downloading...</span>
                            </>
                          ) : (
                            <>
                              <FileSpreadsheet size={14} />
                              <span>Download (.xlsx)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bulk Actions Card */}
                <div className="doc-card">
                  <div className="doc-details">
                    <h4 className="doc-title">Bulk Actions</h4>
                    <p className="doc-subtitle">Perform actions on multiple documents</p>
                    <span className="doc-status-badge">Available</span>
                    <div className="doc-actions">
                      <button
                        className="btn-doc-action zip-download"
                        title="Download All Documents (ZIP)"
                        onClick={handleBulkDownload}
                      >
                        <Download size={14} />
                        <span>Download All Documents (ZIP)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form 9 Card */}
                <div className="doc-card">
                  <div className="doc-card-top">
                    <div className="doc-icon-box">
                      <FileText size={22} />
                    </div>
                    <div className="doc-details">
                      <h4 className="doc-title">Form 9 - Report Card</h4>
                      <p className="doc-subtitle">Per term performance report</p>
                      <span className="doc-status-badge">Available</span>
                      <div className="doc-actions">
                        <button className="btn-doc-action preview" onClick={() => setActiveTab("sf9")} title="Preview SF9">
                          <Eye size={14} />
                          <span>Preview</span>
                        </button>
                        <button className="btn-doc-action download" onClick={handleDownloadPDF}
                          disabled={loadError || !sf9Data} title="Download SF9">
                          <Download size={14} />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Toast Notification */}
      <Toast
        message={toast.message}
        variant={toast.variant}
        icon={toast.icon}
        onDismiss={() => setToast({ message: "", variant: "success", icon: null })}
      />
    </div>
  );
}
