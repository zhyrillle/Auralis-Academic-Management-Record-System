import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, Users, FileText, Download, AlertCircle } from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import SearchBar from "../../components/common/SearchBar";
import Badge from "../../components/common/Badge";
import Toast from "../../components/common/Toast";
import AnalyticsTermTabs from "./analytics/AnalyticsTermTabs";
import StudentSF9Page from "../adviser/StudentSF9Page";
import {
  fetchStudents, fetchSections, fetchStudentSections, fetchGradeLevels, fetchSchoolYears,
} from "../../services/studentSectionService";
import "./PrincipalReports.css";

const REPORT_TERMS = [
  { id: "overall", label: "Overall" },
  { id: "1", label: "Term 1" },
  { id: "2", label: "Term 2" },
  { id: "3", label: "Term 3" },
];

export default function PrincipalReports() {
  const [data, setData] = useState({ students: [], sections: [], enrollments: [], grades: [], years: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [gradeId, setGradeId] = useState("all");
  const [search, setSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("overall");
  const [toast, setToast] = useState({ message: "", variant: "info", icon: null });

  const termLabel = selectedTerm === "overall" ? "Overall" : `Term ${selectedTerm}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [students, sections, enrollments, grades, years] = await Promise.all([
          fetchStudents(), fetchSections(), fetchStudentSections(), fetchGradeLevels(), fetchSchoolYears(),
        ]);
        if (cancelled) return;
        const sortedYears = [...years].sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)));
        const current = sortedYears.find((year) => ["ACTIVE", "ONGOING"].includes(String(year.status).toUpperCase()))
          || sortedYears.find((year) => String(year.status).toUpperCase() !== "UPCOMING") || sortedYears[0];
        setData({ students, sections, enrollments, grades, years: sortedYears });
        setSchoolYearId((previous) => sortedYears.some((year) => String(year.school_year_id) === previous)
          ? previous : String(current?.school_year_id ?? ""));
      } catch {
        if (!cancelled) setError("Unable to load student records. Check the backend connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reload]);

  const yearOptions = data.years.map((year) => ({
    value: String(year.school_year_id),
    label: `S.Y. ${String(year.starts_on).slice(0, 4)}–${String(year.ends_on).slice(0, 4)}`,
  }));
  const yearLabel = yearOptions.find((year) => year.value === schoolYearId)?.label || "No school year";
  const gradeOptions = [{ value: "all", label: "All Grades" }, ...data.grades.map((grade) => ({
    value: String(grade.grade_level_id), label: grade.grade_level_name,
  }))];

  const learners = useMemo(() => {
    const students = new Map(data.students.map((student) => [String(student.student_id), student]));
    const sections = new Map(data.sections.map((section) => [String(section.section_id), section]));
    // Use this year's enrollment, not the latest section returned on the student profile.
    const enrollments = new Map();
    for (const enrollment of data.enrollments) {
      if (String(enrollment.school_year_id) !== schoolYearId) continue;
      const key = String(enrollment.student_id);
      const previous = enrollments.get(key);
      if (!previous || Number(enrollment.student_section_id) > Number(previous.student_section_id)) {
        enrollments.set(key, enrollment);
      }
    }
    return [...enrollments.values()].flatMap((enrollment) => {
      const student = students.get(String(enrollment.student_id));
      const section = sections.get(String(enrollment.section_id));
      if (!student || !section) return [];
      return [{
        ...student,
        id: String(student.student_id), name: student.name.replace(/\s+/g, " ").trim(),
        lrn: String(student.lrn ?? student.LRN ?? ""),
        gradeId: String(section.grade_level_id), sectionId: String(section.section_id),
        gradeSection: `${section.grade_level_name} · ${section.section_name}`,
        gradeLevel: section.grade_level_name, section: section.section_name,
        schoolYearId, studentSectionId: enrollment.student_section_id,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, schoolYearId]);

  // Section cards for Landing Page (Assigned Classes view)
  const displaySections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.sections
      .filter((section) => {
        if (gradeId !== "all" && String(section.grade_level_id) !== gradeId) return false;
        if (!query) return true;
        const name = (section.section_name || section.name || "").toLowerCase();
        const grade = (section.grade_level_name || section.level || "").toLowerCase();
        const prog = (section.program_name || section.program_code || "").toLowerCase();
        return name.includes(query) || grade.includes(query) || prog.includes(query);
      })
      .map((section) => {
        const secId = String(section.section_id || section.id);
        const count = learners.filter((l) => l.sectionId === secId).length;
        return {
          ...section,
          studentCount: count,
          entryProgress: count > 0 ? 100 : 0,
        };
      });
  }, [data.sections, gradeId, search, learners]);

  // Learners within the selected section
  const sectionLearners = useMemo(() => {
    if (!selectedSection) return [];
    const secId = String(selectedSection.section_id || selectedSection.id);
    const query = sectionSearch.trim().toLowerCase();
    return learners.filter((learner) => {
      if (learner.sectionId !== secId) return false;
      if (!query) return true;
      return learner.name.toLowerCase().includes(query) || learner.lrn.includes(query);
    });
  }, [selectedSection, learners, sectionSearch]);

  const handleQuickAction = (docType) => {
    setToast({
      message: `Initiating ${docType} download for all enrolled learners...`,
      variant: "info",
      icon: Download,
    });
  };

  if (selectedStudent) {
    return (
      <div className="pr-page-container pr-page-container--report">
        <StudentSF9Page
          student={selectedStudent}
          userRole="principal"
          isAdviser
          onBack={() => setSelectedStudent(null)}
        />
      </div>
    );
  }

  // Selected Section Detail View
  if (selectedSection) {
    const secName = selectedSection.section_name || selectedSection.name || "Section";
    const secGrade = selectedSection.grade_level_name || selectedSection.level || "";
    const secProgram = selectedSection.program_name || selectedSection.program_code || "General Curriculum";

    return (
      <div className="pr-page-container pr-page-container--list">
        <header className="pr-header">
          <div className="pr-header-left">
            <div>
              <div className="pr-title-row">
                <button
                  type="button"
                  className="pr-section-back-btn"
                  onClick={() => { setSelectedSection(null); setSectionSearch(""); }}
                  title="Back"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <h1 className="pr-title">{secGrade ? `${secGrade} - ${secName}` : secName}</h1>
              </div>
              <p className="pr-subtitle">
                {secProgram} · {yearLabel} · {termLabel} · {sectionLearners.length} enrolled learner{sectionLearners.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </header>

        <section className="pr-controls-bar" aria-label="Student filters">
          <div className="pr-term-control">
            <AnalyticsTermTabs options={REPORT_TERMS} value={selectedTerm} onChange={setSelectedTerm} ariaLabel="Report term" />
          </div>
        </section>

        <section className="pr-table-card" aria-busy={loading}>
          <div className="pr-card-header">
            <div>
              <h2 className="pr-card-title">Subject-Level Breakdown</h2>
              <p className="pr-card-subtitle" aria-live="polite">
                {loading ? "Loading learners…" : error ? "Student records unavailable" : `${sectionLearners.length} learners · ${secName} · ${termLabel}`}
              </p>
            </div>
            <div className="pr-search" role="search" aria-label="Search learners">
              <SearchBar query={sectionSearch} setQuery={setSectionSearch} placeholder="Search student name or LRN…" />
            </div>
          </div>
          <div className="pr-table-wrap" tabIndex={0} role="region" aria-label="Student records">
            <table className="pr-table">
              <thead>
                <tr>
                  <th scope="col">STUDENT</th>
                  <th scope="col">LRN</th>
                  <th scope="col">GRADE / SECTION</th>
                  <th scope="col">FORMS</th>
                  <th scope="col">STATUS</th>
                  <th scope="col" className="pr-th-actions">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }, (_, row) => (
                    <tr key={row} aria-hidden="true">
                      {Array.from({ length: 6 }, (_, col) => (
                        <td key={col}><span className="pr-skeleton" /></td>
                      ))}
                    </tr>
                  ))
                ) : error ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="pr-empty" role="alert">
                        <EmptyState title="Student records could not be loaded" description={error} />
                        <button type="button" className="pr-action-view-btn" onClick={() => setReload((v) => v + 1)}>
                          Try again
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : sectionLearners.length ? (
                  sectionLearners.map((learner) => (
                    <tr key={learner.id} className="pr-tr">
                      <td className="pr-td-student">{learner.name}</td>
                      <td className="pr-td-lrn">{learner.lrn || "—"}</td>
                      <td>{learner.gradeSection}</td>
                      <td>
                        <span className="pr-forms">
                          <Badge className="pr-form-badge pr-form-badge--sf9">SF9</Badge>
                          <Badge className="pr-form-badge pr-form-badge--sf10">SF10</Badge>
                        </span>
                      </td>
                      <td title="Report issuance status is not tracked. Use View to preview or download school forms.">
                        <Badge className="pr-status-pill pr-status-pill--unavailable">Not tracked</Badge>
                      </td>
                      <td className="pr-th-actions">
                        <button
                          type="button"
                          className="pr-action-eye-btn"
                          title={`View ${learner.name}`}
                          aria-label={`View ${learner.name}`}
                          onClick={() => setSelectedStudent(learner)}
                        >
                          <Eye size={20} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        className="pr-empty"
                        icon={Users}
                        title="No learners found"
                        description={sectionSearch.trim() ? "Try a different student name or LRN." : "No enrolled learners in this section for the active school year."}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  // Landing Page View (Imitating Adviser Assigned Classes)
  return (
    <div className="pr-page-container pr-page-container--list">
      <header className="pr-header">
        <div className="pr-header-left">
          <div>
            <div className="pr-title-row">
              <h1 className="pr-title">Student Reports</h1>
            </div>
            <p className="pr-subtitle">Browse learner records by class section and subject.</p>
          </div>
        </div>
      </header>

      <section className="pr-controls-bar" aria-label="Student filters">
        <div className="pr-term-control">
          <AnalyticsTermTabs options={REPORT_TERMS} value={selectedTerm} onChange={setSelectedTerm} ariaLabel="Report term" />
        </div>
      </section>

      <section className="pr-assigned-section">
        <div className="pr-assigned-header">
          <div className="pr-filter-controls-left">
            <div className="pr-search" role="search" aria-label="Search sections">
              <SearchBar query={search} setQuery={setSearch} placeholder="Search section, subject, or program…" />
            </div>
            <div className="pr-dropdowns-group">
              <DropdownSelect
                label="School year"
                value={schoolYearId}
                options={yearOptions}
                placeholder="No school years available"
                disabled={loading || !data.years.length}
                onChange={(value) => { setSchoolYearId(value); setGradeId("all"); }}
              />
              <DropdownSelect
                label="Grade level"
                value={gradeId}
                options={gradeOptions}
                disabled={loading}
                onChange={setGradeId}
              />
            </div>
          </div>
        </div>

        <div className="pr-assigned-layout">
          {/* Class Cards List */}
          <div className="pr-class-cards-container">
            {loading ? (
              <div className="pr-class-cards-grid">
                {Array.from({ length: 4 }, (_, idx) => (
                  <div key={idx} className="pr-class-card" style={{ minHeight: 200 }}>
                    <span className="pr-skeleton" style={{ width: "60%", height: 20 }} />
                    <span className="pr-skeleton" style={{ width: "40%", height: 14 }} />
                    <span className="pr-skeleton" style={{ width: "50%", height: 16 }} />
                    <span className="pr-skeleton" style={{ width: "100%", height: 8, marginTop: 12 }} />
                    <span className="pr-skeleton" style={{ width: "100%", height: 38, marginTop: 12, borderRadius: 8 }} />
                  </div>
                ))}
              </div>
            ) : displaySections && displaySections.length > 0 ? (
              <div className="pr-class-cards-grid">
                {displaySections.map((sec) => {
                  const secName = sec.section_name || sec.name || "Section";
                  const secGrade = sec.grade_level_name || sec.level || "";
                  const displayTitle = secGrade ? `${secGrade} - ${secName}` : secName;
                  const displaySubject = sec.program_name
                    ? `${sec.program_code ? `${sec.program_code} · ` : ""}${sec.program_name}`
                    : "General Curriculum";

                  return (
                    <div key={sec.section_id || sec.id} className="pr-class-card">
                      <div className="pr-class-card-header">
                        <h4 className="pr-class-card-title">{displayTitle}</h4>
                        <span className="pr-class-status-badge">{sec.status || "Active"}</span>
                      </div>

                      <div className="pr-class-subject">{displaySubject}</div>

                      <div className="pr-class-students">
                        <Users size={16} className="pr-class-icon" />
                        <span>{sec.studentCount} students</span>
                      </div>

                      <div className="pr-class-progress-wrap">
                        <div className="pr-class-progress-label">Entry Progress</div>
                        <div className="pr-class-progress-bar-bg">
                          <div
                            className="pr-class-progress-bar-fill"
                            style={{ width: `${sec.entryProgress}%` }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="pr-class-cta-btn"
                        onClick={() => setSelectedSection(sec)}
                      >
                        VIEW
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="pr-no-classes-card">
                <AlertCircle size={20} className="pr-no-classes-icon" />
                <span>No matching class sections found for this grade or school year.</span>
              </div>
            )}
          </div>

          {/* Side Quick Actions Card (Adviser-style) */}
          <div className="pr-quick-actions-card">
            <h3 className="pr-quick-actions-title">Quick actions</h3>
            <p className="pr-quick-actions-desc">Generate official government documents</p>

            <div className="pr-quick-action-items">
              <div className="pr-doc-item">
                <div className="pr-doc-left">
                  <FileText size={18} className="pr-doc-icon" />
                  <span className="pr-doc-name">SF9 Report Card</span>
                </div>
                <button
                  type="button"
                  className="pr-doc-download-btn"
                  title="Download SF9 Report Card"
                  onClick={() => handleQuickAction("SF9 Report Card")}
                >
                  <Download size={15} />
                </button>
              </div>

              <div className="pr-doc-item">
                <div className="pr-doc-left">
                  <FileText size={18} className="pr-doc-icon" />
                  <span className="pr-doc-name">SF10 Permanent Record</span>
                </div>
                <button
                  type="button"
                  className="pr-doc-download-btn"
                  title="Download SF10 Permanent Record"
                  onClick={() => handleQuickAction("SF10 Permanent Record")}
                >
                  <Download size={15} />
                </button>
              </div>
            </div>

            <button
              type="button"
              className="pr-bulk-download-btn"
              onClick={() => handleQuickAction("Bulk Documents")}
            >
              Bulk Download
            </button>
          </div>
        </div>
      </section>

      {toast.message && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          icon={toast.icon}
          onDismiss={() => setToast({ message: "", variant: "info", icon: null })}
        />
      )}
    </div>
  );
}
