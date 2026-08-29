import React, { useState, useMemo } from "react";
import { Eye, Download, FileText, Sparkles, Printer, FileSpreadsheet } from "lucide-react";
import "../../styles/studentSF9.css";

import depedLogo from "../../assets/deped_logo.png";
import gccnhsLogo from "../../assets/gccnhs_logo.png";
import backIconUrl from "../../assets/backButton.svg";
import { getStoredUser, normalizeRole } from "../../utils/auth";

export default function StudentSF9Page({ student, onBack, userRole: propUserRole }) {
  const storedUser = useMemo(() => getStoredUser(), []);
  const normRole = useMemo(() => normalizeRole(storedUser?.role, storedUser), [storedUser]);
  const userRole = propUserRole || (normRole === "adviser" ? "adviser" : "teacher");
  const isAdviser = userRole === "adviser";

  const [activeTab, setActiveTab] = useState(isAdviser ? "sf9" : "personal");
  const [viewMode, setViewMode] = useState("spread"); // "spread", "front", "back"

  // Teacher Comments/Remarks state for terms
  const [comments, setComments] = useState({
    term1: "Demonstrates consistent academic performance and actively participates in classroom discussions.",
    term2: "Shows great progress in analytical tasks and exhibits exemplary leadership during group activities.",
    term3: "Consistently maintains high standards in all learning areas. Promoted with commendable honors."
  });

  // Dynamic / Mock student records matching official layout
  const studentProfile = {
    name: student?.name || "CRUZ, ALEX MATTHEW",
    lrn: student?.lrn || "145783920614",
    gradeLevel: student?.gradeLevel || "Grade 8 Mahogany",
    grade: student?.grade || "8",
    section: student?.section || "Mahogany",
    program: student?.program || "Junior High School",
    sex: student?.sex || "Male",
    age: student?.age || 13,
    schoolYear: student?.schoolYear || "2026 – 2027",
    dateOfBirth: student?.dateOfBirth || "January 15, 2010",
    address: student?.address || "123 Rizal Street, Brgy. San Isidro, Manila",
    termGrade: student?.grade || 92,
    honorStatus: student?.honorStatus || "With Honor",
    daysPresent: student?.daysPresent || 202,
    daysAbsent: student?.daysAbsent || 3,
    missingActivities: student?.missingActivities || 2,
    adviserName: student?.adviserName || "HARVEY BABIA",
    principalName: student?.principalName || "HELEN C. TANASAS, PhD"
  };

  // Official SF9 Subjects matching the new template
  const [grades] = useState([
    { code: "fil", name: "Filipino", t1: 90, t2: 91, t3: 92, final: 91, remark: "Passed" },
    { code: "eng", name: "English", t1: 92, t2: 93, t3: 94, final: 93, remark: "Passed" },
    { code: "math", name: "Mathematics", t1: 91, t2: 92, t3: 93, final: 92, remark: "Passed" },
    { code: "sci", name: "Science", t1: 93, t2: 94, t3: 95, final: 94, remark: "Passed" },
    { code: "ap", name: "Araling Panlipunan (AP)", t1: 89, t2: 90, t3: 91, final: 90, remark: "Passed" },
    { code: "ve", name: "Values Education", t1: 92, t2: 93, t3: 94, final: 93, remark: "Passed" },
    { code: "tle", name: "TLE", t1: 91, t2: 92, t3: 93, final: 92, remark: "Passed" },
    { code: "mapeh", name: "MAPEH", t1: 90, t2: 91, t3: 92, final: 91, remark: "Passed", isHeader: true },
    { code: "music_arts", name: "Music and Arts", t1: 90, t2: 91, t3: 92, final: "", remark: "", isSubSubject: true },
    { code: "pe_health", name: "Physical Education and Health", t1: 91, t2: 92, t3: 93, final: "", remark: "", isSubSubject: true },
  ]);

  // Performance Descriptors matching the official layout
  const performanceDescriptors = [
    { scale: "90-100", desc: "Advancing", remarks: "Passed" },
    { scale: "80-89", desc: "Benchmarking", remarks: "Passed" },
    { scale: "75-79", desc: "Connecting", remarks: "Passed" },
    { scale: "65-74", desc: "Developing", remarks: "Passed" },
    { scale: "0-64", desc: "Emerging", remarks: "Passed" }
  ];

  // Official Attendance Record Data (11 months: Jun - Apr)
  const attendanceData = {
    months: ["Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
    classDays: [12, 21, 22, 20, 21, 20, 16, 21, 20, 21, 18],
    daysPresent: [12, 21, 21, 20, 21, 19, 16, 21, 20, 20, 18],
    daysAbsent: [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0]
  };

  const getAttendanceTotal = (arr) => arr.reduce((acc, curr) => acc + curr, 0);

  const handleCommentChange = (term, val) => {
    setComments(prev => ({ ...prev, [term]: val }));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="student-sf9-container">
      {/* Top Navigation / Breadcrumb Area */}
      <div className="sf9-header-bar no-print">
        <button className="back-btn" onClick={onBack} title="Back to Class List">
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
          <span className="term-grade-label">Term Grade: {studentProfile.termGrade}</span>
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
              onClick={() => setActiveTab("sf9")}
            >
              Official SF9 Form
            </button>
            <button
              className={`sf9-tab-button ${activeTab === "personal" ? "active" : ""}`}
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

            <button className="sf9-print-btn" onClick={handlePrint} title="Print Official SF9 Document">
              <Printer size={16} />
              <span>Print SF9</span>
            </button>
          </div>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === "sf9" ? (
        /* Official SF9 Document Spread Layout */
        <div className={`sf9-document-spread ${viewMode}`}>

          {/* ============================================================
              FRONT PAGE (PAGE 1): LEARNER'S PERFORMANCE REPORT
             ============================================================ */}
          {(viewMode === "spread" || viewMode === "front") && (
            <div className="sf9-official-sheet sf9-front-sheet">

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
                    <p className="sf9-hdr-line">West 1 District</p>
                    <p className="sf9-hdr-line">Gingoog City, Misamis Oriental</p>
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
                    <td className="grade-remark font-bold">Passed</td>
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
          )}

          {/* ============================================================
              BACK PAGE (PAGE 2): ATTENDANCE, REMARKS, & CERTIFICATE OF TRANSFER
             ============================================================ */}
          {(viewMode === "spread" || viewMode === "back") && (
            <div className="sf9-official-sheet sf9-back-sheet">

              {/* Section 1: Attendance Record */}
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

              {/* Section 2: Teacher's Comments/Remarks */}
              <div className="sf9-comments-section">
                <div className="sf9-table-heading" style={{ marginTop: "14px" }}>TEACHER'S COMMENTS/REMARKS</div>
                <div className="sf9-term-comments-box">
                  <div className="sf9-comment-term-row">
                    <span className="sf9-term-label font-bold">Term 1</span>
                    <div className="sf9-comment-textarea-wrap">
                      <textarea
                        className="sf9-comment-input"
                        rows="2"
                        value={comments.term1}
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
                        onChange={(e) => handleCommentChange("term3", e.target.value)}
                        placeholder="Enter comments for Term 3..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Parents/Guardian's Signature */}
              <div className="sf9-parent-signatures-section">
                <div className="sf9-table-heading" style={{ marginTop: "14px" }}>PARENTS/GUARDIAN'S SIGNATURE</div>
                <div className="sf9-parent-sig-lines">
                  <div className="sf9-parent-sig-row">
                    <span className="sf9-parent-sig-label font-bold">Term 1</span>
                    <div className="sf9-parent-sig-underline"></div>
                  </div>
                  <div className="sf9-parent-sig-row">
                    <span className="sf9-parent-sig-label font-bold">Term 2</span>
                    <div className="sf9-parent-sig-underline"></div>
                  </div>
                  <div className="sf9-parent-sig-row">
                    <span className="sf9-parent-sig-label font-bold">Term 3</span>
                    <div className="sf9-parent-sig-underline"></div>
                  </div>
                </div>
              </div>

              {/* Section 4: Certificate of Transfer */}
              <div className="sf9-certificate-section">
                <div className="sf9-table-heading" style={{ marginTop: "16px" }}>CERTIFICATE OF TRANSFER</div>
                <p className="sf9-cert-statement">
                  This is to certify that the above-named learner has satisfactorily completed the requirements for the grade level indicated.
                </p>

                <div className="sf9-cert-form-lines">
                  <div className="sf9-cert-line">
                    <span className="sf9-cert-label">Admitted to Grade:</span>
                    <span className="sf9-cert-underline">Grade 9</span>
                  </div>
                  <div className="sf9-cert-line">
                    <span className="sf9-cert-label">Eligible for Admission to Grade:</span>
                    <span className="sf9-cert-underline">Grade 9</span>
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

              {/* Section 5: Cancellation of Eligibility to Transfer */}
              <div className="sf9-cancellation-section">
                <div className="sf9-table-heading" style={{ marginTop: "16px" }}>CANCELLATION OF ELIGIBILITY TO TRANSFER</div>
                <div className="sf9-cancel-row">
                  <div className="sf9-cancel-field">
                    <span className="sf9-cert-label">Admitted in:</span>
                    <span className="sf9-cert-underline"></span>
                  </div>
                  <div className="sf9-cancel-field">
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
          )}

        </div>
      ) : (
        /* Personal Info Tab Layout */
        <div className="personal-info-grid" style={!isAdviser ? { gridTemplateColumns: "1fr" } : undefined}>

          {/* Left Column: Student Profile Information Card */}
          <div className="profile-info-column" style={!isAdviser ? { gridColumn: "1 / -1" } : undefined}>
            <div className="profile-info-header">
              <h3 className="profile-info-title">Student Profile</h3>
              <p className="profile-info-subtitle">Student demographic and enrollment details</p>
            </div>

            <div className="profile-info-card sf9-card">
              <div className="profile-fields-list">
                <div className="profile-field-group">
                  <span className="profile-field-label">Full Name</span>
                  <span className="profile-field-value">{studentProfile.name}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Learner Reference Number</span>
                  <span className="profile-field-value">{studentProfile.lrn}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Sex</span>
                  <span className="profile-field-value">{studentProfile.sex}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Date of Birth</span>
                  <span className="profile-field-value">{studentProfile.dateOfBirth}</span>
                </div>

                <div className="profile-field-group">
                  <span className="profile-field-label">Address</span>
                  <span className="profile-field-value">{studentProfile.address}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Documents Section (Adviser ONLY) */}
          {isAdviser && (
            <div className="documents-section">
              <h3 className="documents-section-title">Documents</h3>

              <div className="documents-grid">
                {/* Form 10 Card */}
                <div className="doc-card">
                  <div className="doc-card-top">
                    <div className="doc-icon-box">
                      <FileText size={20} />
                    </div>
                    <div className="doc-details">
                      <h4 className="doc-title">Form 10 - Permanent Record</h4>
                      <p className="doc-subtitle">Official cumulative student record</p>
                      <span className="doc-status-badge">Available</span>
                      <div className="doc-actions">
                        <button className="btn-doc-action preview" title="Preview Document">
                          <Eye size={14} />
                          <span>Preview</span>
                        </button>
                        <button className="btn-doc-action download" title="Download Document">
                          <Download size={14} />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form 9 Card */}
                <div className="doc-card">
                  <div className="doc-card-top">
                    <div className="doc-icon-box">
                      <FileSpreadsheet size={20} />
                    </div>
                    <div className="doc-details">
                      <h4 className="doc-title">Form 9 - Report Card (Official)</h4>
                      <p className="doc-subtitle">Per term performance report</p>
                      <span className="doc-status-badge">Available</span>
                      <div className="doc-actions">
                        <button className="btn-doc-action preview" onClick={() => setActiveTab("sf9")} title="View Official SF9">
                          <Eye size={14} />
                          <span>View SF9</span>
                        </button>
                        <button className="btn-doc-action download" onClick={handlePrint} title="Print/Export SF9">
                          <Download size={14} />
                          <span>Print/PDF</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bulk Actions Card */}
                <div className="doc-card">
                  <div className="doc-card-top">
                    <div className="doc-icon-box">
                      <FileText size={20} />
                    </div>
                    <div className="doc-details">
                      <h4 className="doc-title">Bulk Actions</h4>
                      <p className="doc-subtitle">Perform actions on multiple documents</p>
                      <span className="doc-status-badge">Available</span>
                      <div className="doc-actions">
                        <button className="btn-doc-action zip-download" title="Download All Documents (ZIP)">
                          <Download size={14} />
                          <span>Download All Documents (ZIP)</span>
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
    </div>
  );
}
