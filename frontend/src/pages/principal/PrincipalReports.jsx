import useCachedQuery from "../../services/useCachedQuery";
import { cacheKey } from "../../services/navigationCache";
import { useMemo, useState } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Eye, Users, AlertCircle } from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import EmptyState from "../../components/common/EmptyState";
import SearchBar from "../../components/common/SearchBar";
import Badge from "../../components/common/Badge";
import backIconUrl from "../../assets/backButton.svg";
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


const EMPTY_REPORT_DATA = { students: [], sections: [], enrollments: [], grades: [], years: [] };
async function loadReportCatalog() {
  const [students, sections, enrollments, grades, years] = await Promise.all([
    fetchStudents(), fetchSections(), fetchStudentSections(), fetchGradeLevels(), fetchSchoolYears(),
  ]);
  const sortedYears = [...years].sort((a, b) => String(b.starts_on).localeCompare(String(a.starts_on)));
  const current = sortedYears.find(year => ["ACTIVE", "ONGOING"].includes(String(year.status).toUpperCase()))
    || sortedYears.find(year => String(year.status).toUpperCase() !== "UPCOMING") || sortedYears[0];
  return { students, sections, enrollments, grades, years: sortedYears,
    defaultSchoolYearId: String(current?.school_year_id ?? "") };
}

export default function PrincipalReports() {
  const [reportParams, setReportParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedStudentId = reportParams.get('studentId');
  const requestedYearId = reportParams.get('schoolYearId');
  const requestedEnrollmentId = reportParams.get('enrollmentId');
  const { data: cachedData, loading, error, refresh } = useCachedQuery(cacheKey('reports:catalog'), loadReportCatalog);
  const data = cachedData || EMPTY_REPORT_DATA;
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedSchoolYearId, setSchoolYearId] = useState("");
  const chosenYearId = requestedYearId || selectedSchoolYearId;
  const schoolYearId = data.years.some(year => String(year.school_year_id) === chosenYearId)
    ? chosenYearId : data.defaultSchoolYearId || "";
  const [gradeId, setGradeId] = useState("all");
  const [search, setSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("overall");

  const termLabel = selectedTerm === "overall" ? "Overall" : `Term ${selectedTerm}`;


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

  // Reuse the reports catalog and official SF9 reader; never silently open another enrollment year.
  const linkedStudent = requestedStudentId && requestedYearId === schoolYearId && !loading && !error
    ? learners.find(student => student.id === requestedStudentId
      && (!requestedEnrollmentId || String(student.studentSectionId) === requestedEnrollmentId)) : null;
  const reportStudent = selectedStudent || linkedStudent;
  const closeReport = () => {
    const returnTo = location.state?.returnTo;
    if (requestedStudentId && typeof returnTo === 'string' && returnTo.startsWith('/principal/at-risk-students/')) {
      navigate(returnTo); return;
    }
    setSelectedStudent(null);
    if (requestedStudentId) setReportParams({}, { replace: true });
  };
  if (reportStudent) {
    return (
      <div className="pr-page-container pr-page-container--report">
        <StudentSF9Page
          student={reportStudent}
          userRole="principal"
          isAdviser
          onBack={closeReport}
        />
      </div>
    );
  }

  if (requestedStudentId && !loading) {
    return <div className="pr-page-container"><EmptyState title="Learner report unavailable"
      description={error || 'The requested learner and enrollment could not be matched to this school year. No other year’s report has been opened.'} />
      <button type="button" className="back-btn" onClick={closeReport}>Back</button></div>;
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
                  className="back-btn pr-section-back-btn"
                  onClick={() => { setSelectedSection(null); setSectionSearch(""); }}
                  title="Back to sections"
                  aria-label="Back to sections"
                >
                  <img src={backIconUrl} alt="" width={17} height={17} />
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
          <div className="pr-filter-controls-right">
            <div className="pr-search" role="search" aria-label="Search learners">
              <SearchBar query={sectionSearch} setQuery={setSectionSearch} placeholder="Search student name or LRN…" />
            </div>
          </div>
        </section>

        <section className="pr-table-card" aria-busy={loading}>
          <div className="pr-card-header">
            <div>
              <h2 className="pr-card-title">Student reports</h2>
              <p className="pr-card-subtitle" aria-live="polite">
                {loading ? "Loading learners…" : error ? "Student records unavailable" : `${sectionLearners.length} learners · ${secName} · ${termLabel}`}
              </p>
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
                        <button type="button" className="pr-action-view-btn" onClick={refresh}>
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
            <p className="pr-subtitle">Browse learner reports by class section.</p>
          </div>
        </div>
      </header>

      <section className="pr-controls-bar" aria-label="Student filters">
        <div className="pr-term-control">
          <AnalyticsTermTabs options={REPORT_TERMS} value={selectedTerm} onChange={setSelectedTerm} ariaLabel="Report term" />
        </div>
          <div className="pr-filter-controls-right">
            <div className="pr-search" role="search" aria-label="Search sections">
              <SearchBar query={search} setQuery={setSearch} placeholder="Search section or program…" />
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
      </section>

      <section className="pr-assigned-section" aria-label="Class sections" aria-busy={loading}>
        <div className="pr-assigned-layout">
          {/* Class Cards List */}
          <div className="pr-class-cards-container">
            {loading ? (
              <div className="pr-class-cards-grid" aria-hidden="true">
                {Array.from({ length: 6 }, (_, idx) => (
                  <div key={idx} className="pr-class-card">
                    <span className="pr-skeleton" style={{ width: "60%", height: 20 }} />
                    <span className="pr-skeleton" style={{ width: "40%", height: 14 }} />
                    <span className="pr-skeleton" style={{ width: "50%", height: 16 }} />
                    <span className="pr-skeleton" style={{ width: "100%", height: 16, marginTop: "auto" }} />
                    <span className="pr-skeleton" style={{ width: "100%", height: 38, borderRadius: 999 }} />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="pr-no-classes-card" role="alert">
                <EmptyState icon={AlertCircle} title="Sections could not be loaded" description={error} />
                <button type="button" className="pr-action-view-btn" onClick={refresh}>Try again</button>
              </div>
            ) : displaySections && displaySections.length > 0 ? (
              <div className="pr-class-cards-grid">
                {displaySections.map((sec) => {
                  const secName = sec.section_name || sec.name || "Section";
                  const secGrade = sec.grade_level_name || sec.level || "";
                  const gradeNumber = String(secGrade).match(/\d+/)?.[0];
                  const gradeLabel = gradeNumber ? `G${gradeNumber}` : secGrade;
                  const displaySubject = sec.program_name
                    ? `${sec.program_code ? `${sec.program_code} · ` : ""}${sec.program_name}`
                    : "General Curriculum";

                  return (
                    <div key={sec.section_id || sec.id} className="pr-class-card">
                      <div className="pr-class-card-header">
                        <h2 className="pr-class-card-title">{secName}</h2>
                        {gradeLabel && <Badge className="pr-class-grade-badge">{gradeLabel}</Badge>}
                      </div>

                      <div className="pr-class-subject" title={displaySubject}>{displaySubject}</div>

                      <div className="pr-class-students">
                        <Users size={16} className="pr-class-icon" />
                        <span>{sec.studentCount} student{sec.studentCount === 1 ? "" : "s"}</span>
                      </div>

                      <div className="pr-class-report-status" title="Adviser report submission is not tracked.">
                        <span>Report submission</span>
                        <Badge className="pr-status-pill pr-status-pill--unavailable">Not tracked</Badge>
                      </div>

                      <button
                        type="button"
                        className="pr-class-cta-btn"
                        aria-label={`View reports for ${secGrade} ${secName}`}
                        onClick={() => setSelectedSection(sec)}
                      >
                        <Eye size={17} aria-hidden="true" /> VIEW
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

        </div>
      </section>

    </div>
  );
}
