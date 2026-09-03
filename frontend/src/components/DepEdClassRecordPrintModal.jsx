import React, { useMemo } from "react";
import { X, Printer, Download } from "lucide-react";
import depedLogoUrl from "../assets/deped_logo.png";
import depedWordmarkLogoUrl from "../assets/deped-logo.gif";
import { formatClassRecordData, triggerClassRecordPrint } from "../utils/exportClassRecordPdf";
import { exportClassRecordExcel } from "../utils/downloadHelper";
import "../styles/DepEdClassRecordPrint.css";

export default function DepEdClassRecordPrintModal({
  isOpen,
  onClose,
  metadata = {},
  weights = { WW: 20, PT: 50, EX: 30, QA: 30 },
  writtenWorkColumns = [],
  performanceTaskColumns = [],
  examConfig = {
    st1HPS: 25,
    st2HPS: 25,
    teHPS: 50,
    st1Weight: 30,
    st2Weight: 30,
    teWeight: 40,
  },
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
      examConfig,
      quarterlyAssessmentHPS,
      students,
      grades,
    });
  }, [isOpen, metadata, weights, writtenWorkColumns, performanceTaskColumns, examConfig, quarterlyAssessmentHPS, students, grades]);

  const displayTitle = useMemo(() => {
    return metadata?.termTitle || "CLASS RECORD - TERM 1";
  }, [metadata?.termTitle]);

  if (!isOpen || !formattedData) return null;

  const {
    region,
    division,
    schoolName,
    schoolId,
    schoolYear,
    termTitle,
    termHeader,
    gradeLevelDisplay,
    teacherName,
    subjectName,
    section,
  } = formattedData.metadata;

  const wwCols = formattedData.writtenWorkColumns;
  const ptCols = formattedData.performanceTaskColumns;
  const exConf = formattedData.examConfig;
  const totalCols = 2 + wwCols.length + 3 + ptCols.length + 3 + 8 + 3;

  const wwHalf1 = Math.max(1, Math.floor((wwCols.length + 3) / 2));
  const wwHalf2 = Math.max(1, (wwCols.length + 3) - wwHalf1);
  const ptHalf1 = Math.max(1, Math.floor((ptCols.length + 3) / 2));
  const ptHalf2 = Math.max(1, (ptCols.length + 3) - ptHalf1);

  const handlePrint = () => {
    triggerClassRecordPrint({
      metadata,
      weights,
      writtenWorkColumns,
      performanceTaskColumns,
      examConfig,
      quarterlyAssessmentHPS,
      students,
      grades,
      depedLogoUrl,
      depedWordmarkLogoUrl,
    });
  };

  const renderStudentRows = (list) => {
    return list.map((st) => (
      <tr key={`st-${st.fullName || st.index}`}>
        <td className="student-num-cell">{st.index}</td>
        <td className={`student-name-cell ${st.isFailing ? "failing" : ""}`}>{st.fullName}</td>
        {st.wwScores.map((score, i) => (
          <td key={`ww-${i}`}>{score}</td>
        ))}
        <td style={{ fontWeight: "bold" }}>{st.wwTotalRaw}</td>
        <td className={`ps-cell ${st.wwIsFailing ? "failing" : ""}`}>{st.wwPS}</td>
        <td className="ws-cell">{st.wwWS}</td>
        {st.ptScores.map((score, i) => (
          <td key={`pt-${i}`}>{score}</td>
        ))}
        <td style={{ fontWeight: "bold" }}>{st.ptTotalRaw}</td>
        <td className={`ps-cell ${st.ptIsFailing ? "failing" : ""}`}>{st.ptPS}</td>
        <td className="ws-cell">{st.ptWS}</td>
        <td>{st.st1Score}</td>
        <td>{st.st2Score}</td>
        <td>{st.teScore}</td>
        <td className="ws-cell">{st.wsST1}</td>
        <td className="ws-cell">{st.wsST2}</td>
        <td className="ws-cell">{st.wsTE}</td>
        <td className={`ps-cell ${st.exIsFailing ? "failing" : ""}`}>{st.exPS}</td>
        <td className="ws-cell">{st.exWS}</td>
        <td className="initial-grade-cell">{st.initialGrade}</td>
        <td className={`quarterly-grade-cell ${st.isFailing ? "failing" : ""}`}>
          {st.termGrade}
        </td>
        <td style={{ fontStyle: "italic", fontWeight: "bold" }}>{st.descriptor}</td>
      </tr>
    ));
  };

  const handleExportExcel = async () => {
    try {
      await exportClassRecordExcel({
        metadata,
        weights,
        writtenWorkColumns,
        performanceTaskColumns,
        examConfig,
        students,
        grades,
      });
    } catch (err) {
      console.error("Error exporting Excel class record:", err);
    }
  };

  return (
    <div className="deped-modal-overlay" onClick={onClose}>
      <div className="deped-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Bar */}
        <div className="deped-modal-header">
          <h3>
            <span>{displayTitle} Preview</span>
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
              className="deped-print-btn"
              onClick={handleExportExcel}
              title="Export Class Record as Excel (.xlsx)"
              style={{ background: "#0f766e" }}
            >
              <Download size={16} />
              Export Excel (.xlsx)
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
                <h1 className="deped-main-title">{termTitle}</h1>

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
                    <div className="deped-meta-field">
                      <span className="meta-label">SCHOOL ID</span>
                      <span className="meta-box">{schoolId}</span>
                    </div>
                  </div>

                  <div className="deped-meta-row">
                    <div className="deped-meta-field">
                      <span className="meta-label">SCHOOL NAME</span>
                      <span className="meta-box">{schoolName}</span>
                    </div>
                    <div className="deped-meta-field">
                      <span className="meta-label">SCHOOL YEAR</span>
                      <span className="meta-box">{schoolYear}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="deped-logo-wrap">
                <img
                  src={depedWordmarkLogoUrl}
                  alt="Department of Education"
                  className="deped-wordmark-img"
                />
              </div>
            </div>

            {/* Main Class Record Table */}
            <table className="deped-table">
              <thead>
                <tr>
                  <th colSpan={totalCols} style={{ background: "#0f2e53", height: "8px", padding: 0 }} />
                </tr>
                <tr>
                  <th rowSpan={4} style={{ fontSize: "14pt", fontWeight: "bold", width: "180px" }}>
                    {termHeader}
                  </th>
                  <th colSpan={wwHalf1} style={{ textAlign: "left", paddingLeft: "4px" }}>
                    GRADE LEVEL
                  </th>
                  <th colSpan={wwHalf2}>{gradeLevelDisplay}</th>
                  <th rowSpan={2} colSpan={ptHalf1} style={{ textAlign: "left", paddingLeft: "4px" }}>
                    TEACHER
                  </th>
                  <th rowSpan={2} colSpan={ptHalf2}>{teacherName}</th>
                  <th rowSpan={2} colSpan={3} style={{ textAlign: "left", paddingLeft: "4px" }}>
                    SUBJECT
                  </th>
                  <th rowSpan={2} colSpan={5}>{subjectName}</th>
                </tr>
                <tr>
                  <th colSpan={wwHalf1} style={{ textAlign: "left", paddingLeft: "4px" }}>
                    SECTION
                  </th>
                  <th colSpan={wwHalf2}>{section}</th>
                </tr>
                <tr>
                  <th colSpan={wwCols.length + 3}>
                    WRITTEN / ORAL WORKS (WWs) ({formattedData.weights.WW}%)
                  </th>
                  <th colSpan={ptCols.length + 3}>
                    PRODUCT / PERFORMANCE TASKS (PTs) ({formattedData.weights.PT}%)
                  </th>
                  <th colSpan={8}>
                    EXAMINATIONS (EXs) ({formattedData.weights.EX}%)
                  </th>
                  <th rowSpan={2} style={{ whiteSpace: "normal", lineHeight: 1.1 }}>
                    Initial<br />Grade
                  </th>
                  <th rowSpan={2} style={{ whiteSpace: "normal", lineHeight: 1.1 }}>
                    Term<br />Grade
                  </th>
                  <th rowSpan={2} style={{ whiteSpace: "normal", lineHeight: 1.1 }}>
                    Descriptor
                  </th>
                </tr>
                <tr>
                  {wwCols.map((col, i) => (
                    <th key={`ww-hdr-${col.id}`} style={{ width: "24px" }}>
                      {col.label || String(i + 1)}
                    </th>
                  ))}
                  <th style={{ width: "28px" }}>Total</th>
                  <th style={{ width: "28px" }}>PS</th>
                  <th style={{ width: "28px" }}>WS</th>

                  {ptCols.map((col, i) => (
                    <th key={`pt-hdr-${col.id}`} style={{ width: "24px" }}>
                      {col.label || String(i + 1)}
                    </th>
                  ))}
                  <th style={{ width: "28px" }}>Total</th>
                  <th style={{ width: "28px" }}>PS</th>
                  <th style={{ width: "28px" }}>WS</th>

                  <th style={{ width: "24px" }}>ST1</th>
                  <th style={{ width: "24px" }}>ST2</th>
                  <th style={{ width: "24px" }}>TE</th>
                  <th style={{ width: "28px" }}>WS ST1</th>
                  <th style={{ width: "28px" }}>WS ST2</th>
                  <th style={{ width: "28px" }}>WS TE</th>
                  <th style={{ width: "28px" }}>PS</th>
                  <th style={{ width: "28px" }}>WS</th>
                </tr>

                {/* HIGHEST POSSIBLE SCORE ROW */}
                <tr className="hps-row">
                  <td colSpan={2} className="hps-label-cell">
                    HIGHEST POSSIBLE SCORE
                  </td>
                  {wwCols.map((c) => (
                    <td key={`ww-hps-${c.id}`}>{c.max_score || 0}</td>
                  ))}
                  <td>{formattedData.totalWWHps}</td>
                  <td>100</td>
                  <td>{formattedData.weights.WW}%</td>

                  {ptCols.map((c) => (
                    <td key={`pt-hps-${c.id}`}>{c.max_score || 0}</td>
                  ))}
                  <td>{formattedData.totalPTHps}</td>
                  <td>100</td>
                  <td>{formattedData.weights.PT}%</td>

                  <td>{exConf.st1HPS}</td>
                  <td>{exConf.st2HPS}</td>
                  <td>{exConf.teHPS}</td>
                  <td>{exConf.st1Weight}</td>
                  <td>{exConf.st2Weight}</td>
                  <td>{exConf.teWeight}</td>
                  <td>100</td>
                  <td>{formattedData.weights.EX}%</td>

                  <td />
                  <td />
                  <td />
                </tr>
              </thead>

              <tbody>
                {/* LEARNERS' NAMES */}
                <tr style={{ background: "#0f2e53", color: "#fff", fontWeight: "bold" }}>
                  <td colSpan={totalCols} style={{ textAlign: "left", paddingLeft: "8px" }}>
                    LEARNERS' NAMES
                  </td>
                </tr>

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

