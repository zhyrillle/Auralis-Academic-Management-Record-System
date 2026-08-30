import React, { useMemo } from "react";
import { X, Printer } from "lucide-react";
import depedLogoUrl from "../assets/deped_logo.png";
import { formatClassRecordData, triggerClassRecordPrint } from "../utils/exportClassRecordPdf";
import "../styles/DepEdClassRecordPrint.css";

export default function DepEdClassRecordPrintModal({
  isOpen,
  onClose,
  metadata = {},
  weights = { WW: 30, PT: 50, QA: 20 },
  writtenWorkColumns = [],
  performanceTaskColumns = [],
  quarterlyAssessmentHPS = 50,
  students = [],
  grades = {},
}) {
  const formattedData = useMemo(() => {
    if (!isOpen) return null;
    return formatClassRecordData({
      metadata,
      weights,
      writtenWorkColumns,
      performanceTaskColumns,
      quarterlyAssessmentHPS,
      students,
      grades,
    });
  }, [isOpen, metadata, weights, writtenWorkColumns, performanceTaskColumns, quarterlyAssessmentHPS, students, grades]);

  if (!isOpen || !formattedData) return null;

  const {
    region,
    division,
    schoolName,
    schoolId,
    schoolYear,
    quarterLabel,
    gradeAndSection,
    teacherName,
    subjectName,
  } = formattedData.metadata;

  const wwCols = formattedData.writtenWorkColumns;
  const ptCols = formattedData.performanceTaskColumns;
  const totalCols = 3 + wwCols.length + 3 + ptCols.length + 3 + 1 + 2 + 2;

  const handlePrint = () => {
    triggerClassRecordPrint({
      metadata,
      weights,
      writtenWorkColumns,
      performanceTaskColumns,
      quarterlyAssessmentHPS,
      students,
      grades,
      depedLogoUrl,
    });
  };

  const renderStudentRows = (list) => {
    return list.map((st) => (
      <tr key={`st-${st.lrn || st.index}`}>
        <td className="student-num-cell">{st.index}</td>
        <td className="student-lrn-cell">{st.lrn}</td>
        <td className="student-name-cell">{st.fullName}</td>
        {st.wwScores.map((score, i) => (
          <td key={`ww-${i}`}>{score}</td>
        ))}
        <td style={{ fontWeight: "bold" }}>{st.wwTotalRaw}</td>
        <td className="ps-cell">{st.wwPS}</td>
        <td className="ws-cell">{st.wwWS}</td>
        {st.ptScores.map((score, i) => (
          <td key={`pt-${i}`}>{score}</td>
        ))}
        <td style={{ fontWeight: "bold" }}>{st.ptTotalRaw}</td>
        <td className="ps-cell">{st.ptPS}</td>
        <td className="ws-cell">{st.ptWS}</td>
        <td>{st.qaScore}</td>
        <td className="ps-cell">{st.qaPS}</td>
        <td className="ws-cell">{st.qaWS}</td>
        <td className="initial-grade-cell">{st.initialGrade}</td>
        <td className={`quarterly-grade-cell ${st.isFailing ? "failing" : ""}`}>
          {st.quarterlyGrade}
        </td>
      </tr>
    ));
  };

  return (
    <div className="deped-modal-overlay" onClick={onClose}>
      <div className="deped-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Bar */}
        <div className="deped-modal-header">
          <h3>
            <span>DepEd JHS Class Record Preview</span>
          </h3>
          <div className="deped-modal-actions">
            <button
              type="button"
              className="deped-print-btn"
              onClick={handlePrint}
              title="Print or Save as Landscape PDF"
            >
              <Printer size={16} />
              Print / Save as PDF
            </button>
            <button
              type="button"
              className="deped-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="deped-modal-body">
          <div className="deped-paper">
            {/* Header Layout */}
            <div className="deped-header-wrap">
              <div>
                <img
                  src={depedLogoUrl}
                  alt="Department of Education Seal"
                  className="deped-seal-img"
                />
              </div>

              <div className="deped-header-center">
                <h1 className="deped-main-title">Class Record</h1>
                <div className="deped-subtitle">
                  (Pursuant to DepEd Order 8 series of 2015)
                </div>

                <div className="deped-meta-boxes">
                  <div className="deped-meta-row">
                    <div className="deped-meta-field">
                      <span className="meta-label">REGION</span>
                      <span className="meta-box">{region}</span>
                    </div>
                    <div className="deped-meta-field">
                      <span className="meta-label">DIVISION</span>
                      <span className="meta-box">{division}</span>
                    </div>
                  </div>

                  <div className="deped-meta-row">
                    <div className="deped-meta-field">
                      <span className="meta-label">SCHOOL NAME</span>
                      <span className="meta-box">{schoolName}</span>
                    </div>
                    <div className="deped-meta-field">
                      <span className="meta-label">SCHOOL ID</span>
                      <span className="meta-box">{schoolId}</span>
                    </div>
                    <div className="deped-meta-field">
                      <span className="meta-label">SCHOOL YEAR</span>
                      <span className="meta-box">{schoolYear}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="deped-logo-wrap">
                <div className="deped-wordmark-title">DepED</div>
                <div className="deped-wordmark-sub">DEPARTMENT OF EDUCATION</div>
              </div>
            </div>

            {/* Sub-header Metadata Bar */}
            <div className="deped-subheader-bar">
              <div className="deped-subheader-cell quarter-cell">
                {quarterLabel}
              </div>
              <div className="deped-subheader-cell">
                <span className="deped-sub-label">GRADE & SECTION:</span>
                <span className="deped-sub-val">{gradeAndSection}</span>
              </div>
              <div className="deped-subheader-cell">
                <span className="deped-sub-label">TEACHER:</span>
                <span className="deped-sub-val">{teacherName}</span>
              </div>
              <div className="deped-subheader-cell">
                <span className="deped-sub-label">SUBJECT:</span>
                <span className="deped-sub-val">{subjectName}</span>
              </div>
            </div>

            {/* Main Class Record Table */}
            <table className="deped-table">
              <thead>
                <tr>
                  <th colSpan={3} rowSpan={2} style={{ width: "260px" }}>
                    LEARNERS' NAMES
                  </th>
                  <th colSpan={wwCols.length + 3}>
                    WRITTEN WORK ({formattedData.weights.WW}%)
                  </th>
                  <th colSpan={ptCols.length + 3}>
                    PERFORMANCE TASKS ({formattedData.weights.PT}%)
                  </th>
                  <th colSpan={3}>
                    QUARTERLY ASSESSMENT ({formattedData.weights.QA}%)
                  </th>
                  <th rowSpan={2} style={{ width: "45px" }}>
                    Initial Grade
                  </th>
                  <th rowSpan={2} style={{ width: "45px" }}>
                    Quarterly Grade
                  </th>
                </tr>
                <tr>
                  {wwCols.map((col, i) => (
                    <th key={`ww-hdr-${col.id}`} className="vertical-header-cell">
                      <div className="vertical-text">
                        {col.activity_name || (col.date ? String(col.date).slice(5) : String(i + 1))}
                      </div>
                    </th>
                  ))}
                  <th style={{ width: "30px" }}>Total</th>
                  <th style={{ width: "34px" }}>PS</th>
                  <th style={{ width: "32px" }}>WS</th>

                  {ptCols.map((col, i) => (
                    <th key={`pt-hdr-${col.id}`} className="vertical-header-cell">
                      <div className="vertical-text">
                        {col.activity_name || (col.date ? String(col.date).slice(5) : String(i + 1))}
                      </div>
                    </th>
                  ))}
                  <th style={{ width: "30px" }}>Total</th>
                  <th style={{ width: "34px" }}>PS</th>
                  <th style={{ width: "32px" }}>WS</th>

                  <th style={{ width: "30px" }}>1</th>
                  <th style={{ width: "34px" }}>PS</th>
                  <th style={{ width: "32px" }}>WS</th>
                </tr>

                {/* HIGHEST POSSIBLE SCORE ROW */}
                <tr className="hps-row">
                  <td colSpan={3} className="hps-label-cell">
                    HIGHEST POSSIBLE SCORE
                  </td>
                  {wwCols.map((c) => (
                    <td key={`ww-hps-${c.id}`}>{c.max_score || 0}</td>
                  ))}
                  <td>{formattedData.totalWWHps}</td>
                  <td>100.00</td>
                  <td>{formattedData.weights.WW}%</td>

                  {ptCols.map((c) => (
                    <td key={`pt-hps-${c.id}`}>{c.max_score || 0}</td>
                  ))}
                  <td>{formattedData.totalPTHps}</td>
                  <td>100.00</td>
                  <td>{formattedData.weights.PT}%</td>

                  <td>{formattedData.totalQAHps}</td>
                  <td>100.00</td>
                  <td>{formattedData.weights.QA}%</td>

                  <td>100</td>
                  <td>100</td>
                </tr>
              </thead>

              <tbody>
                {/* MALE GROUP */}
                <tr className="gender-header-row">
                  <td colSpan={totalCols}>MALE</td>
                </tr>
                {renderStudentRows(formattedData.maleStudents)}

                {/* FEMALE GROUP */}
                <tr className="gender-header-row">
                  <td colSpan={totalCols}>FEMALE</td>
                </tr>
                {renderStudentRows(formattedData.femaleStudents)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
