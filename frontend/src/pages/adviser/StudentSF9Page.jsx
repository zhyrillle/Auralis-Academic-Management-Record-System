import React, { useState } from "react";
import { Eye, Download, FileText, Sparkles } from "lucide-react";
import "../../styles/studentSF9.css";

import depedLogo from "../../assets/deped_logo.png";
import gccnhsLogo from "../../assets/gccnhs_logo.png";
import backIconUrl from "../../assets/backButton.svg";

export default function StudentSF9Page({ student, onBack }) {
  const [activeTab, setActiveTab] = useState("sf9");

  // Mock student detailed records matching mockups exactly
  const studentProfile = {
    name: "CRUZ, ALEX MATTHEW",
    lrn: "145783920614",
    gradeLevel: "Grade 8 Mahogany",
    section: "Mahogany",
    sex: "Male",
    age: 13,
    schoolYear: "2026-2027",
    curriculum: "K to 12 Basic Education",
    dateOfBirth: "January 15, 2010",
    address: "123 Rizal Street, Brgy. San Isidro, Manila",
    termGrade: 92,
    honorStatus: "With Honor",
    daysPresent: 20,
    daysAbsent: 2,
    missingActivities: 2
  };

  // Mock Academic Grades for SF9 table
  const [grades] = useState([
    { area: "Filipino", t1: 90, t2: 91, t3: 92, final: 91, remark: "PASSED" },
    { area: "English", t1: 92, t2: 93, t3: 94, final: 93, remark: "PASSED" },
    { area: "Mathematics", t1: 91, t2: 92, t3: 93, final: 92, remark: "PASSED" },
    { area: "Science", t1: 93, t2: 94, t3: 95, final: 94, remark: "PASSED" },
    { area: "Araling Panlipunan", t1: 89, t2: 90, t3: 91, final: 90, remark: "PASSED" },
    { area: "Values Education", t1: 92, t2: 93, t3: 94, final: 93, remark: "PASSED" },
    { area: "Technology and Livelihood", t1: 91, t2: 92, t3: 93, final: 92, remark: "PASSED" },
    { area: "MAPEH", t1: 90, t2: 91, t3: 92, final: 91, remark: "PASSED", isHeader: true },
    { area: "Music & Arts", t1: 90, t2: 91, t3: 92, final: "", remark: "", isSubSubject: true },
    { area: "PE & Health", t1: 91, t2: 92, t3: 93, final: "", remark: "", isSubSubject: true },
    { area: "HGP", t1: 91, t2: 92, t3: 93, final: 92, remark: "PASSED" },
    { area: "ALIVE", t1: 91, t2: 92, t3: 93, final: 92, remark: "PASSED" },
  ]);

  // Mock Attendance Calendar Days
  const attendanceData = {
    months: ["June", "July", "August", "September", "October", "November", "December", "January", "February", "March"],
    schoolDays: [3, 21, 22, 19, 10, 21, 21, 19, 21, 22],
    daysPresent: [3, 21, 22, 19, 10, 21, 21, 19, 21, 21],
    daysAbsent: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
  };

  const getAttendanceTotal = (arr) => arr.reduce((acc, curr) => acc + curr, 0);

  // State for Observed Values ratings (Making Term 3 interactive!)
  const [observedValues, setObservedValues] = useState([
    {
      coreValue: "1. Maka-Diyos",
      statements: [
        { id: "md_s1", text: "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others", t1: "AO", t2: "AO", t3: "AO" },
        { id: "md_s2", text: "Shows adherence to ethical principles by upholding truth in all undertakings", t1: "AO", t2: "AO", t3: "AO" }
      ]
    },
    {
      coreValue: "2. Maka-tao",
      statements: [
        { id: "mt_s1", text: "Is sensitive to individual, social, and cultural differences", t1: "SO", t2: "AO", t3: "AO" },
        { id: "mt_s2", text: "Demonstrates contributions towards solidarity", t1: "AO", t2: "AO", t3: "AO" }
      ]
    },
    {
      coreValue: "3. Maka Kalikasan",
      statements: [
        { id: "mk_s1", text: "Cares for the environment and utilizes resources wisely, judiciously and economically", t1: "AO", t2: "SO", t3: "SO" }
      ]
    },
    {
      coreValue: "4. Maka Bansa",
      statements: [
        { id: "mb_s1", text: "Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen", t1: "RO", t2: "SO", t3: "SO" },
        { id: "mb_s2", text: "Demonstrates appropriate behavior in carrying out activities in school, community, and country", t1: "RO", t2: "RO", t3: "RO" }
      ]
    }
  ]);

  const handleRatingChange = (valId, term, newValue) => {
    setObservedValues(prev => prev.map(group => ({
      ...group,
      statements: group.statements.map(stmt =>
        stmt.id === valId ? { ...stmt, [term]: newValue } : stmt
      )
    })));
  };

  const getRatingBadgeClass = (rating) => {
    switch (rating) {
      case "AO": return "ao";
      case "SO": return "so";
      case "RO": return "ro";
      case "NO": return "no";
      default: return "";
    }
  };

  return (
    <div className="student-sf9-container">
      {/* Top Navigation / Breadcrumb Area */}
      <div className="sf9-header-bar">
        <button className="back-btn" onClick={onBack} title="Back to Mahogany">
          <img src={backIconUrl} alt="Back" width={17} height={17} />
        </button>
        <h1 className="sf9-section-title">{studentProfile.section}</h1>
      </div>

      {/* Student Overview Indicator Header Card */}
      <div className="student-header-grid">
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

      {/* Tabs Row Selector */}
      <div className="sf9-tabs-outer">
        <button
          className={`sf9-tab-button ${activeTab === "sf9" ? "active" : ""}`}
          onClick={() => setActiveTab("sf9")}
        >
          SF9
        </button>
        <button
          className={`sf9-tab-button ${activeTab === "personal" ? "active" : ""}`}
          onClick={() => setActiveTab("personal")}
        >
          Personal Info
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "sf9" ? (
        /* SF9 Tab Layout (Dual Column) */
        <div className="sf9-dual-layout">

          {/* Left Column: School Form 9 Document */}
          <div className="sf9-document-paper">

            {/* Header info */}
            <div className="sf9-doc-heading-container">
              <span className="sf9-doc-form-tag">SF 9-JHS</span>
              <div className="sf9-header-logos-row">
                <img src={depedLogo} alt="DepEd Seal" width="55" height="55" style={{ objectFit: "contain" }} />
                <div style={{ textAlign: "center", flexGrow: 1 }}>
                  <p className="sf9-doc-heading-text">Republic of the Philippines</p>
                  <p className="sf9-doc-heading-text" style={{ fontWeight: "bold" }}>Department of Education</p>
                  <p className="sf9-doc-heading-text" style={{ fontSize: "10px" }}>Region X — Northern Mindanao</p>
                  <p className="sf9-doc-heading-text" style={{ fontSize: "10px" }}>Division of Gingoog City</p>
                  <p className="sf9-doc-heading-text" style={{ fontSize: "10px" }}>West 1 District</p>
                  <h3 className="sf9-doc-school-title">Gingoog City Comprehensive National High School</h3>
                  <p className="sf9-doc-school-sub">Gingoog City | School ID: 304139</p>
                </div>
                <img src={gccnhsLogo} alt="School Seal" width="55" height="55" style={{ objectFit: "contain" }} />
              </div>
            </div>

            {/* Student Metadata Table */}
            <div className="sf9-metadata-grid">
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">Pangalan (Name):</span>
                <span className="sf9-metadata-value" style={{ textTransform: "uppercase" }}>{studentProfile.name}</span>
              </div>
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">LRN:</span>
                <span className="sf9-metadata-value">{studentProfile.lrn}</span>
              </div>
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">Gulang (Age):</span>
                <span className="sf9-metadata-value">{studentProfile.age}</span>
              </div>
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">Kasarian (Sex):</span>
                <span className="sf9-metadata-value">{studentProfile.sex === "Male" ? "M" : "F"}</span>
              </div>
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">Baitang (Grade):</span>
                <span className="sf9-metadata-value">8</span>
              </div>
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">Pangkat (Section):</span>
                <span className="sf9-metadata-value">{studentProfile.section}</span>
              </div>
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">Kurikulum (Curriculum):</span>
                <span className="sf9-metadata-value">{studentProfile.curriculum}</span>
              </div>
              <div className="sf9-metadata-item">
                <span className="sf9-metadata-label">Taong Panuruan (School Year):</span>
                <span className="sf9-metadata-value">{studentProfile.schoolYear}</span>
              </div>
            </div>

            {/* Parent letter */}
            <div className="sf9-dear-parent-text">
              <strong>Dear Parent:</strong><br />
              This report card shows the ability and progress your child has made in the different learning areas as well as his/her core values. The school welcomes you should you desire to know more about your child's progress.
            </div>

            {/* Signatures */}
            <div className="sf9-signatures-row">
              <div className="sf9-signature-block">
                <div style={{ fontWeight: "bold" }}>HELEN C. TANASAS, PhD</div>
                <div className="sf9-signature-title">Secondary School Principal II</div>
              </div>
              <div className="sf9-signature-block">
                <div style={{ fontWeight: "bold", borderBottom: "1px solid #000000", display: "inline-block", paddingBottom: "2px", width: "150px" }}>HARVEY BABIA</div>
                <div className="sf9-signature-title" style={{ marginTop: "2px" }}>Adviser</div>
              </div>
            </div>

            {/* Report card table grades */}
            <div className="sf9-table-title">Ulat Tungkol sa Pag-unlad ng Marka (Progress Report)</div>
            <table className="sf9-progress-table">
              <thead>
                <tr>
                  <th rowspan="2" style={{ width: "40%" }}>LEARNING AREAS</th>
                  <th colspan="3" style={{ width: "30%" }}>TERM</th>
                  <th rowspan="2" style={{ width: "15%" }}>FINAL GRADE</th>
                  <th rowspan="2" style={{ width: "15%" }}>REMARKS</th>
                </tr>
                <tr>
                  <th style={{ width: "10%" }}>1</th>
                  <th style={{ width: "10%" }}>2</th>
                  <th style={{ width: "10%" }}>3</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((item, idx) => (
                  <tr key={idx} style={item.isHeader ? { fontWeight: "bold", backgroundColor: "#f8fafc" } : {}}>
                    <td className={item.isSubSubject ? "sub-subject-name" : "subject-name"}>
                      {item.area}
                    </td>
                    <td className="grade-val">{item.t1}</td>
                    <td className="grade-val">{item.t2}</td>
                    <td className="grade-val">{item.t3}</td>
                    <td className="grade-val" style={{ fontWeight: "bold" }}>{item.final}</td>
                    <td className="remark-val">{item.remark}</td>
                  </tr>
                ))}

                {/* General Average */}
                <tr className="average-row">
                  <td className="avg-label">General Average</td>
                  <td colSpan="3"></td>
                  <td className="grade-val">{studentProfile.termGrade}</td>
                  <td className="remark-val">PASSED</td>
                </tr>
              </tbody>
            </table>

            {/* Descriptors & Grading scale */}
            <div className="sf9-descriptors-section">
              <div>
                <table className="sf9-descriptors-table">
                  <thead>
                    <tr>
                      <th>Descriptors</th>
                      <th>Grading Scale</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Outstanding</td>
                      <td>90–100</td>
                      <td style={{ color: "#16a34a", fontWeight: "bold" }}>Passed</td>
                    </tr>
                    <tr>
                      <td>Very Satisfactory</td>
                      <td>85–89</td>
                      <td style={{ color: "#16a34a", fontWeight: "bold" }}>Passed</td>
                    </tr>
                    <tr>
                      <td>Satisfactory</td>
                      <td>80–84</td>
                      <td style={{ color: "#16a34a", fontWeight: "bold" }}>Passed</td>
                    </tr>
                    <tr>
                      <td>Fairly Satisfactory</td>
                      <td>75–79</td>
                      <td style={{ color: "#16a34a", fontWeight: "bold" }}>Passed</td>
                    </tr>
                    <tr>
                      <td>Did Not Meet Expectations</td>
                      <td>Below 75</td>
                      <td style={{ color: "#ef4444", fontWeight: "bold" }}>Failed</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", fontSize: "10px", lineHeight: "1.5", paddingLeft: "8px" }}>
                <div><strong>Marking Code Guidelines:</strong></div>
                <div>AO — Always Observed (Laging Ginagawa)</div>
                <div>SO — Sometimes Observed (Paminsang Ginagawa)</div>
                <div>RO — Rarely Observed (Madalang Ginagawa)</div>
                <div>NO — Not Observed (Hindi Ginagawa)</div>
              </div>
            </div>

            {/* Attendance table */}
            <table className="sf9-attendance-table">
              <thead>
                <tr>
                  <th style={{ width: "20%" }}>Months</th>
                  {attendanceData.months.map((m, idx) => (
                    <th key={idx}>{m.slice(0, 3)}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="row-label">School Days</td>
                  {attendanceData.schoolDays.map((d, idx) => (
                    <td key={idx}>{d}</td>
                  ))}
                  <td style={{ fontWeight: "bold" }}>{getAttendanceTotal(attendanceData.schoolDays)}</td>
                </tr>
                <tr>
                  <td className="row-label">Days Present</td>
                  {attendanceData.daysPresent.map((d, idx) => (
                    <td key={idx}>{d}</td>
                  ))}
                  <td style={{ fontWeight: "bold" }}>{getAttendanceTotal(attendanceData.daysPresent)}</td>
                </tr>
                <tr>
                  <td className="row-label">Days Absent</td>
                  {attendanceData.daysAbsent.map((d, idx) => (
                    <td key={idx}>{d}</td>
                  ))}
                  <td style={{ fontWeight: "bold" }}>{getAttendanceTotal(attendanceData.daysAbsent)}</td>
                </tr>
              </tbody>
            </table>

          </div>

          {/* Right Column: Observed Values & Signatures */}
          <div className="sf9-observed-values-card">
            <h3 className="observed-values-title">Report on Learner's Observed Values</h3>

            <table className="observed-values-table">
              <thead>
                <tr>
                  <th>Core Values</th>
                  <th>Behavior Statements</th>
                  <th style={{ width: "40px" }}>T1</th>
                  <th style={{ width: "40px" }}>T2</th>
                  <th style={{ width: "85px" }}>T3 (Edit)</th>
                </tr>
              </thead>
              <tbody>
                {observedValues.map((group, groupIdx) => (
                  <React.Fragment key={groupIdx}>
                    {group.statements.map((stmt, stmtIdx) => (
                      <tr key={stmt.id}>
                        {stmtIdx === 0 && (
                          <td className="core-value-cell" rowSpan={group.statements.length}>
                            {group.coreValue}
                          </td>
                        )}
                        <td className="statement-cell">{stmt.text}</td>
                        <td className="term-rating-cell">
                          <span className={`rating-badge ${getRatingBadgeClass(stmt.t1)}`}>{stmt.t1}</span>
                        </td>
                        <td className="term-rating-cell">
                          <span className={`rating-badge ${getRatingBadgeClass(stmt.t2)}`}>{stmt.t2}</span>
                        </td>
                        {/* Interactive Dropdown Selector for Term 3 */}
                        <td className="term-rating-cell" style={{ padding: "4px" }}>
                          <select
                            className={`observed-value-select ${getRatingBadgeClass(stmt.t3)}`}
                            value={stmt.t3}
                            onChange={(e) => handleRatingChange(stmt.id, "t3", e.target.value)}
                          >
                            <option value="AO">AO</option>
                            <option value="SO">SO</option>
                            <option value="RO">RO</option>
                            <option value="NO">NO</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Parent Signatures Area */}
            <div className="sf9-right-sign-block">
              <h4 className="sf9-right-sign-title">Parent/Guardian's Signature</h4>
              <div className="sf9-signature-lines-vertical">
                <div className="sf9-sig-line-item">
                  <span className="sf9-sig-label">1st Term:</span>
                  <div className="sf9-sig-value-underline"></div>
                </div>
                <div className="sf9-sig-line-item">
                  <span className="sf9-sig-label">2nd Term:</span>
                  <div className="sf9-sig-value-underline"></div>
                </div>
                <div className="sf9-sig-line-item">
                  <span className="sf9-sig-label">3rd Term:</span>
                  <div className="sf9-sig-value-underline"></div>
                </div>
              </div>
            </div>

            {/* Certificate of Transfer */}
            <div className="certificate-transfer-block">
              <h4 className="certificate-title">Certificate of Transfer</h4>
              <div className="certificate-row">
                <span className="certificate-label">Admitted to Grade:</span>
                <span className="certificate-underline">Grade 9</span>
                <span className="certificate-label" style={{ marginLeft: "12px" }}>Section:</span>
                <span className="certificate-underline"></span>
              </div>
              <div className="certificate-row" style={{ marginTop: "12px" }}>
                <span className="certificate-label">Eligibility for Admission to Grade:</span>
                <span className="certificate-underline">Grade 9</span>
              </div>

              <div className="sf9-signatures-row" style={{ marginTop: "24px", marginBottom: "0px" }}>
                <div className="sf9-signature-block" style={{ width: "50%" }}>
                  <div style={{ fontWeight: "bold", borderBottom: "1px solid #475569", display: "inline-block", paddingBottom: "2px", width: "100%" }}>HELEN C. TANASAS, PhD</div>
                  <div className="sf9-signature-title">Secondary School Principal II</div>
                </div>
                <div className="sf9-signature-block" style={{ width: "45%" }}>
                  <div style={{ fontWeight: "bold", borderBottom: "1px solid #475569", display: "inline-block", paddingBottom: "2px", width: "100%" }}>HARVEY BABIA</div>
                  <div className="sf9-signature-title">Adviser</div>
                </div>
              </div>
            </div>

            {/* Cancellation of Transfer */}
            <div className="certificate-transfer-block" style={{ marginBottom: "0" }}>
              <h4 className="certificate-title" style={{ fontSize: "11px", marginBottom: "8px" }}>Cancellation of Eligibility to Transfer</h4>
              <div className="certificate-row">
                <span className="certificate-label">Admitted in:</span>
                <span className="certificate-underline"></span>
              </div>
              <div className="certificate-row" style={{ marginTop: "8px" }}>
                <span className="certificate-label">Date:</span>
                <span className="certificate-underline"></span>
              </div>

              <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
                <div className="sf9-signature-block" style={{ width: "70%" }}>
                  <div style={{ borderBottom: "1px solid #cbd5e1", height: "18px" }}></div>
                  <div className="sf9-signature-title" style={{ marginTop: "4px" }}>Secondary School Principal</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      ) : (
        /* Personal Info Tab Layout (Dual Column) */
        <div className="personal-info-grid">

          {/* Left Column (1 span): Student Profile Information Card */}
          <div className="profile-info-column">
            {/* Section heading – outside the card */}
            <div className="profile-info-header">
              <h3 className="profile-info-title">Student Profile</h3>
              <p className="profile-info-subtitle">Student demographic and enrollment details</p>
            </div>

            {/* Card */}
            <div className="profile-info-card sf9-card">
              {/* Profile Data Fields */}
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

          {/* Right Column (2 spans): Documents Section */}
          <div className="documents-section">
            {/* Section heading – outside the cards */}
            <h3 className="documents-section-title">Documents</h3>

            {/* Document Cards Grid (2-column card grid) */}
            <div className="documents-grid">
              {/* Form 10 - Permanent Record Card */}
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

              {/* Form 9 - Report Card Card */}
              <div className="doc-card">
                <div className="doc-card-top">
                  <div className="doc-icon-box">
                    <FileText size={20} />
                  </div>
                  <div className="doc-details">
                    <h4 className="doc-title">Form 9 - Report Card</h4>
                    <p className="doc-subtitle">Per term performance report</p>
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

        </div>
      )}
    </div>
  );
}
