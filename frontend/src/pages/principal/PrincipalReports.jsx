import React, { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronDown,
  Eye,
  Printer,
  Download,
  Moon,
  Bell,
  User,
} from "lucide-react";

import StudentSF9Page from "../adviser/StudentSF9Page";
import "./PrincipalReports.css";

// Sample Pre-labeled Report Records matching reference design
const INITIAL_REPORTS = [
  {
    id: "r1",
    name: "Luis B. Torres",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF9",
    status: "Pending",
    schoolYear: "2024–2025",
  },
  {
    id: "r2",
    name: "Andrea C. Mendoza",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF10",
    status: "Pending",
    schoolYear: "2024–2025",
  },
  {
    id: "r3",
    name: "Kristen A. Reyes",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF9",
    status: "Pending",
    schoolYear: "2024–2025",
  },
  {
    id: "r4",
    name: "Jose M. Dela Cruz",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF10",
    status: "Delayed",
    schoolYear: "2024–2025",
  },
  {
    id: "r5",
    name: "Sofia Cruz",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF10",
    status: "Delayed",
    schoolYear: "2024–2025",
  },
  {
    id: "r6",
    name: "TLE",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF9",
    status: "Submitted",
    schoolYear: "2024–2025",
  },
  {
    id: "r7",
    name: "MAPEH",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF9",
    status: "Submitted",
    schoolYear: "2024–2025",
  },
  {
    id: "r8",
    name: "ESP",
    lrn: "101234567893",
    gradeLevel: "Grade 10",
    grade: "10",
    section: "A",
    gradeSection: "G10-A",
    address: "Cagayan de Oro City",
    form: "SF10",
    status: "Submitted",
    schoolYear: "2024–2025",
  },
];

export default function PrincipalReports() {
  // Navigation Mode: "list" | "student" | "sf9"
  const [mode, setMode] = useState("list");
  const [selectedStudent, setSelectedStudent] = useState(INITIAL_REPORTS[0]);

  // Controls State
  const [selectedTerm, setSelectedTerm] = useState("Overall");
  const [selectedForm, setSelectedForm] = useState("All Forms");
  const [selectedGradeLevel, setSelectedGradeLevel] = useState("Grade Level");
  const [selectedSchoolYear, setSelectedSchoolYear] = useState("School Year");

  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState(null);

  const terms = ["Overall", "Term 1", "Term 2", "Term 3"];
  const forms = ["All Forms", "SF9", "SF10"];
  const gradeLevels = ["All Grades", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
  const schoolYears = ["S.Y. 2024–2025", "S.Y. 2025–2026", "S.Y. 2026–2027"];

  const [docTab, setDocTab] = useState("sf9");

  // Filtered reports
  const filteredReports = useMemo(() => {
    return INITIAL_REPORTS.filter((r) => {
      if (selectedForm !== "All Forms" && r.form !== selectedForm) return false;
      if (
        selectedGradeLevel !== "Grade Level" &&
        selectedGradeLevel !== "All Grades" &&
        !r.gradeLevel.toLowerCase().includes(selectedGradeLevel.toLowerCase().replace("grade ", ""))
      )
        return false;
      return true;
    });
  }, [selectedForm, selectedGradeLevel]);

  const handleSelectStudent = (student, tab = "sf9") => {
    setSelectedStudent(student);
    setDocTab(tab);
    setMode("student");
  };

  const handleTriggerPrint = (formName) => {
    window.print();
  };

  const handleDownload = (formName) => {
    alert(`Downloading ${formName} for ${selectedStudent?.name || "student"}...`);
  };

  // If in SF9 view mode, render official DepEd SF9 document spread with adviser tabs
  if (mode === "sf9") {
    return (
      <StudentSF9Page
        student={selectedStudent}
        initialTab={docTab}
        onBack={() => setMode("student")}
        userRole="principal"
      />
    );
  }

  return (
    <div className="pr-page-container">
      {/* 1. Header Area */}
      <header className="pr-header">
        <div className="pr-header-left">
          {mode === "student" && (
            <button
              type="button"
              className="pr-back-btn"
              title="Back to Reports"
              onClick={() => setMode("list")}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="pr-title">Student Reports</h1>
            <p className="pr-subtitle">
              Term based pass / fail overview across all grades · S.Y. 2024–2025
            </p>
          </div>
        </div>

        <div className="pr-header-actions">
          <button type="button" className="pr-icon-btn" title="Notifications">
            <Bell size={18} />
            <span className="pr-badge">7</span>
          </button>
        </div>
      </header>

      {/* 2. MODE: LIST (Reports 1 Landing Page) */}
      {mode === "list" && (
        <>
          {/* Controls Bar */}
          <section className="pr-controls-bar">
            {/* Term Tabs */}
            <div className="pr-term-group">
              {terms.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`pr-term-btn ${selectedTerm === t ? "active" : ""}`}
                  onClick={() => setSelectedTerm(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Dropdown Filters Group */}
            <div className="pr-dropdowns-group">
              {/* Form Filter */}
              <div className="pr-dropdown-wrap">
                <button
                  type="button"
                  className="pr-dropdown-btn"
                  onClick={() =>
                    setOpenDropdown(openDropdown === "form" ? null : "form")
                  }
                >
                  <span>{selectedForm}</span>
                  <ChevronDown size={14} />
                </button>
                {openDropdown === "form" && (
                  <div className="pr-dropdown-menu">
                    {forms.map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`pr-dropdown-item ${selectedForm === f ? "active" : ""}`}
                        onClick={() => {
                          setSelectedForm(f);
                          setOpenDropdown(null);
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Grade Level Filter */}
              <div className="pr-dropdown-wrap">
                <button
                  type="button"
                  className="pr-dropdown-btn"
                  onClick={() =>
                    setOpenDropdown(openDropdown === "gl" ? null : "gl")
                  }
                >
                  <span>{selectedGradeLevel}</span>
                  <ChevronDown size={14} />
                </button>
                {openDropdown === "gl" && (
                  <div className="pr-dropdown-menu">
                    {gradeLevels.map((gl) => (
                      <button
                        key={gl}
                        type="button"
                        className={`pr-dropdown-item ${selectedGradeLevel === gl ? "active" : ""}`}
                        onClick={() => {
                          setSelectedGradeLevel(gl);
                          setOpenDropdown(null);
                        }}
                      >
                        {gl}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* School Year Filter */}
              <div className="pr-dropdown-wrap">
                <button
                  type="button"
                  className="pr-dropdown-btn"
                  onClick={() =>
                    setOpenDropdown(openDropdown === "sy" ? null : "sy")
                  }
                >
                  <span>{selectedSchoolYear}</span>
                  <ChevronDown size={14} />
                </button>
                {openDropdown === "sy" && (
                  <div className="pr-dropdown-menu">
                    {schoolYears.map((sy) => (
                      <button
                        key={sy}
                        type="button"
                        className={`pr-dropdown-item ${selectedSchoolYear === sy ? "active" : ""}`}
                        onClick={() => {
                          setSelectedSchoolYear(sy);
                          setOpenDropdown(null);
                        }}
                      >
                        {sy}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Subject-Level Breakdown Table Card */}
          <section className="pr-table-card">
            <div className="pr-card-header">
              <h2 className="pr-card-title">Subject-Level Breakdown</h2>
              <span className="pr-card-subtitle">Current vs Previous term</span>
            </div>

            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th className="pr-th">STUDENT</th>
                    <th className="pr-th">LRN</th>
                    <th className="pr-th">GRADE / SECTION</th>
                    <th className="pr-th">FORM</th>
                    <th className="pr-th">STATUS</th>
                    <th className="pr-th pr-th-actions">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((item) => (
                    <tr
                      key={item.id}
                      className="pr-tr"
                      onClick={() => handleSelectStudent(item)}
                    >
                      <td className="pr-td pr-td-student">{item.name}</td>
                      <td className="pr-td pr-td-lrn">{item.lrn}</td>
                      <td className="pr-td pr-td-section">{item.gradeSection}</td>
                      <td className="pr-td">
                        <span
                          className={`pr-form-badge ${
                            item.form === "SF10"
                              ? "pr-form-badge--sf10"
                              : "pr-form-badge--sf9"
                          }`}
                        >
                          {item.form}
                        </span>
                      </td>
                      <td className="pr-td">
                        <span
                          className={`pr-status-pill ${
                            item.status === "Submitted"
                              ? "pr-status-pill--submitted"
                              : item.status === "Delayed"
                              ? "pr-status-pill--delayed"
                              : "pr-status-pill--pending"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="pr-td" style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="pr-action-view-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectStudent(item);
                          }}
                        >
                          VIEW
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* 3. MODE: STUDENT (Reports 2 Student Overview) */}
      {mode === "student" && (
        <>
          {/* Student Profile Card */}
          <section className="pr-student-profile-card">
            <div className="pr-student-info-left">
              <div className="pr-student-avatar">
                <User size={40} />
              </div>
              <div className="pr-student-details">
                <h2 className="pr-student-name">{selectedStudent.name}</h2>
                <p className="pr-student-meta">{selectedStudent.lrn}</p>
                <p className="pr-student-meta">
                  Grade {selectedStudent.grade} – {selectedStudent.section}
                </p>
                <p className="pr-student-meta">{selectedStudent.address}</p>
              </div>
            </div>

            <span className="pr-student-tag-badge">Student</span>
          </section>

          {/* 2 Cards: Report Card (SF9) & Learner's Card (SF10) */}
          <section className="pr-cards-grid">
            {/* Card 1: Report Card (SF9) */}
            <div className="pr-doc-card">
              <div className="pr-doc-card-header">
                <h3 className="pr-doc-card-title">Report Card</h3>
                <span className="pr-doc-form-tag">SF9</span>
              </div>

              <p className="pr-doc-card-desc">
                The official learner's progress report issued every quarter.
                Contains grades per subject, conduct ratings, and attendance summary.
              </p>

              <div className="pr-doc-card-actions">
                <button
                  type="button"
                  className="pr-btn-view-doc"
                  onClick={() => {
                    setDocTab("sf9");
                    setMode("sf9");
                  }}
                >
                  <Eye size={16} />
                  <span>VIEW SF9</span>
                </button>
                <button
                  type="button"
                  className="pr-btn-print-doc"
                  onClick={() => handleTriggerPrint("SF9")}
                >
                  <Printer size={16} />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  className="pr-btn-download-icon"
                  title="Download SF9"
                  onClick={() => handleDownload("SF9")}
                >
                  <Download size={18} />
                </button>
              </div>
            </div>

            {/* Card 2: Learner's Card (SF10) */}
            <div className="pr-doc-card">
              <div className="pr-doc-card-header">
                <h3 className="pr-doc-card-title">Learner's Card</h3>
                <span className="pr-doc-form-tag">SF10</span>
              </div>

              <p className="pr-doc-card-desc">
                The official learner's progress report issued every quarter.
                Contains grades per subject, conduct ratings, and attendance summary.
              </p>

              <div className="pr-doc-card-actions">
                <button
                  type="button"
                  className="pr-btn-view-doc"
                  onClick={() => {
                    setDocTab("personal");
                    setMode("sf9");
                  }}
                >
                  <Eye size={16} />
                  <span>VIEW SF10</span>
                </button>
                <button
                  type="button"
                  className="pr-btn-print-doc"
                  onClick={() => handleTriggerPrint("SF10")}
                >
                  <Printer size={16} />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  className="pr-btn-download-icon"
                  title="Download SF10"
                  onClick={() => handleDownload("SF10")}
                >
                  <Download size={18} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
