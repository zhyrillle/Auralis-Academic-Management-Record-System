import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Printer, User, Users } from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import SearchBar from "../../components/common/SearchBar";
import Badge from "../../components/common/Badge";
import AnalyticsTermTabs from "./analytics/AnalyticsTermTabs";
import backIconUrl from "../../assets/backButton.svg";
import {
  fetchStudents, fetchSections, fetchStudentSections, fetchGradeLevels, fetchSchoolYears,
} from "../../services/studentSectionService";
import "./PrincipalReports.css";

const DOCUMENTS = [
  { form: "SF9", title: "Report Card", description: "Learner progress, subject grades, conduct ratings, and attendance." },
  { form: "SF10", title: "Learner’s Permanent Record", description: "The learner’s cumulative academic record across school years." },
];

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
  const [schoolYearId, setSchoolYearId] = useState("");
  const [gradeId, setGradeId] = useState("all");
  const [sectionId, setSectionId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("overall");
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
  const sectionOptions = [{ value: "all", label: "All Sections" }, ...data.sections
    .filter((section) => gradeId === "all" || String(section.grade_level_id) === gradeId)
    .map((section) => ({
      value: String(section.section_id), label: `${section.grade_level_name} · ${section.section_name}`,
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
        id: String(student.student_id), name: student.name.replace(/\s+/g, " ").trim(),
        lrn: String(student.lrn ?? student.LRN ?? ""),
        gradeId: String(section.grade_level_id), sectionId: String(section.section_id),
        gradeSection: `${section.grade_level_name} · ${section.section_name}`,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, schoolYearId]);

  const filteredLearners = useMemo(() => {
    const query = search.trim().toLowerCase();
    return learners.filter((learner) => (gradeId === "all" || learner.gradeId === gradeId)
      && (sectionId === "all" || learner.sectionId === sectionId)
      && (!query || learner.name.toLowerCase().includes(query) || learner.lrn.includes(query)));
  }, [learners, gradeId, sectionId, search]);

  return (
    <div className={`pr-page-container ${selectedStudent ? "pr-page-container--detail" : "pr-page-container--list"}`}>
      <header className="pr-header">
        <div className="pr-header-left">
          <div>
            <div className="pr-title-row">
              {selectedStudent && <button type="button" className="pr-back-btn" aria-label="Back to Reports" title="Back to Reports"
                onClick={() => setSelectedStudent(null)}><img src={backIconUrl} alt="" /></button>}
            <h1 className="pr-title">Student Reports</h1>
            </div>
            <p className="pr-subtitle">{selectedStudent ? "Learner overview and school forms." : "Browse learner records by school year, grade, and section."}</p>
          </div>
        </div>
      </header>

      {!selectedStudent ? <>
        <section className="pr-controls-bar" aria-label="Student filters">
          <div className="pr-term-control">
            <AnalyticsTermTabs options={REPORT_TERMS} value={selectedTerm} onChange={setSelectedTerm} ariaLabel="Report term" />
          </div>
          <div className="pr-dropdowns-group">
          <DropdownSelect label="School year" value={schoolYearId} options={yearOptions}
            placeholder="No school years available" disabled={loading || !data.years.length}
            onChange={(value) => { setSchoolYearId(value); setGradeId("all"); setSectionId("all"); }} />
          <DropdownSelect label="Grade level" value={gradeId} options={gradeOptions} disabled={loading}
            onChange={(value) => { setGradeId(value); setSectionId("all"); }} />
          <DropdownSelect label="Section" value={sectionId} options={sectionOptions} disabled={loading}
            onChange={setSectionId} />
          </div>
        </section>

        <section className="pr-table-card" aria-busy={loading}>
          <div className="pr-card-header">
            <div>
              <h2 className="pr-card-title">Subject-Level Breakdown</h2>
              <p className="pr-card-subtitle" aria-live="polite">
                {loading ? "Loading learners…" : error ? "Student records unavailable" : `${filteredLearners.length} learners · ${yearLabel} · ${termLabel}`}
              </p>
            </div>
            <div className="pr-search" role="search" aria-label="Search learners">
              <SearchBar query={search} setQuery={setSearch} placeholder="Search student name or LRN…" />
            </div>
          </div>
          <div className="pr-table-wrap" tabIndex={0} role="region" aria-label="Student records">
            <table className="pr-table">
              <thead><tr>
                <th scope="col">STUDENT</th><th scope="col">LRN</th><th scope="col">GRADE / SECTION</th>
                <th scope="col">FORMS</th><th scope="col">STATUS</th><th scope="col" className="pr-th-actions">ACTIONS</th>
              </tr></thead>
              <tbody>
                {loading ? Array.from({ length: 6 }, (_, row) => <tr key={row} aria-hidden="true">
                  {Array.from({ length: 6 }, (_, column) => <td key={column}><span className="pr-skeleton" /></td>)}
                </tr>) : error ? <tr><td colSpan={6}>
                  <div className="pr-empty" role="alert"><EmptyState title="Student records could not be loaded" description={error} />
                    <button type="button" className="pr-action-view-btn" onClick={() => setReload((value) => value + 1)}>Try again</button>
                  </div>
                </td></tr> : filteredLearners.length ? filteredLearners.map((learner) => <tr key={learner.id} className="pr-tr">
                  <td className="pr-td-student">{learner.name}</td>
                  <td className="pr-td-lrn">{learner.lrn || "—"}</td><td>{learner.gradeSection}</td>
                  <td><span className="pr-forms">
                    <Badge className="pr-form-badge pr-form-badge--sf9">SF9</Badge>
                    <Badge className="pr-form-badge pr-form-badge--sf10">SF10</Badge>
                  </span></td>
                  <td title={`${termLabel} SF9/SF10 report status has not been connected yet.`}>
                    <Badge className="pr-status-pill pr-status-pill--unavailable">Not available</Badge>
                  </td>
                  <td className="pr-th-actions"><button type="button" className="pr-action-view-btn"
                    aria-label={`View ${learner.name}`} onClick={() => setSelectedStudent(learner)}>VIEW</button></td>
                </tr>) : <tr><td colSpan={6}><EmptyState className="pr-empty" icon={Users}
                  title="No learners found" description={search.trim() ? "Try a different student name or LRN."
                    : "No enrolled learners match this school year, grade, and section."} /></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </> : <>
        <section className="pr-student-profile-card">
          <div className="pr-student-info-left">
            <div className="pr-student-avatar"><User size={28} aria-hidden="true" /></div>
            <div className="pr-student-details">
              <h2 className="pr-student-name">{selectedStudent.name}</h2>
              <dl className="pr-student-metadata">
                <div><dt>LRN</dt><dd>{selectedStudent.lrn || "Not recorded"}</dd></div>
                <div><dt>Grade / Section</dt><dd><Badge className="pr-section-badge">{selectedStudent.gradeSection}</Badge></dd></div>
                <div><dt>Reporting period</dt><dd>{yearLabel} · {termLabel}</dd></div>
              </dl>
            </div>
          </div>
          <span className="pr-student-tag-badge">Student</span>
        </section>
        <section className="pr-cards-grid">
          {DOCUMENTS.map((document) => <div className={`pr-doc-card pr-doc-card--${document.form.toLowerCase()}`} key={document.form}>
            <div className="pr-doc-card-header"><div className="pr-doc-heading">
              <span className="pr-doc-icon"><FileText size={20} aria-hidden="true" /></span>
              <h3 className="pr-doc-card-title">{document.title}</h3></div>
              <span className="pr-doc-form-tag">{document.form}</span></div>
            <p className="pr-doc-card-desc">{document.description}</p>
            <p className="pr-doc-availability">Awaiting report integration</p>
            <div className="pr-doc-card-actions">
              <button type="button" className="pr-btn-view-doc" disabled title="Awaiting report integration">
                <Eye size={16} /> VIEW {document.form}</button>
              <button type="button" className="pr-btn-print-doc" disabled title="Awaiting report integration"><Printer size={16} /> Print</button>
              <button type="button" className="pr-btn-download-icon" disabled title="Awaiting report integration"
                aria-label={`Download ${document.form} (unavailable)`}><Download size={18} /></button>
            </div>
          </div>)}
        </section>
      </>}
    </div>
  );
}
