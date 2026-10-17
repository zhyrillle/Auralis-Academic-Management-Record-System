import { useEffect, useMemo, useState } from "react";
import { Plus, Users, Eye, Settings2, LayoutGrid, UserPlus, AlertCircle, Trash2, Loader2 } from "lucide-react";
import useCachedQuery from "../../services/useCachedQuery";
import { cacheKey } from "../../services/navigationCache";
import { isSessionCancellation } from "../../offline/syncManager";
import DropdownSelect from "../../components/common/DropdownSelect";
import SearchBar from "../../components/common/SearchBar";
import MaskedLrn from "../../components/common/MaskedLrn";
import { maskLrn } from "../../utils/lrnHelper";
import SegmentedControl from "../../components/common/SegmentedControl";
import OverlayPanel from "../../components/common/OverlayPanel";
import EmptyState from "../../components/common/EmptyState";
import TablePagination from "../../components/common/TablePagination";
import Toast from "../../components/common/Toast";
import Badge from "../../components/common/Badge";
import SectionCapacity from "./student-sections/SectionCapacity";
import SectionFormFields from "./student-sections/SectionFormFields";
import SectionManagementDrawer from "./student-sections/SectionManagementDrawer";
import StudentSelectionTray from "./student-sections/StudentSelectionTray";
import { formatSectionGrade, sectionProgram } from "../../utils/studentSections";
import { fetchSections, fetchGradeLevels, fetchStudents, fetchStudentSections, createSection, updateSection, deleteSection, bulkAssignStudents, unassignStudent } from "../../services/studentSectionService";
import "../../styles/StudentAdmin.css";
import "../../styles/StudentSectionManagement.css";
const DEFAULT_GRADES = [7, 8, 9, 10].map((grade, index) => ({
  id: index + 1,
  name: `G${grade}`,
  label: `Grade ${grade}`
}));
const EMPTY_LIST = [];
const blankSection = grade => ({
  id: null,
  name: "",
  grade_level_id: grade.id,
  level: grade.name,
  is_specialized: false,
  program_id: "1"
});
async function loadSectionCatalog() {
  const [sectionRows, gradeRows, studentRows, enrollmentRows] = await Promise.all([fetchSections(), fetchGradeLevels(), fetchStudents(), fetchStudentSections()]);
  const gradeLevels = gradeRows.length ? gradeRows.map(grade => ({
    id: grade.grade_level_id,
    name: grade.grade_level_name,
    label: formatSectionGrade(grade.grade_level_name, grade.grade_level_id)
  })) : DEFAULT_GRADES;
  const gradeMap = new Map(gradeLevels.map(grade => [Number(grade.id), grade.name]));
  const sectionMap = new Map(sectionRows.map(section => [Number(section.section_id || section.id), section]));
  const enrollmentMap = new Map(enrollmentRows.map(enrollment => [Number(enrollment.student_id), enrollment]));
  const sections = sectionRows.map(section => ({
    id: Number(section.section_id || section.id),
    name: section.section_name || section.name,
    level: section.grade_level_name || gradeMap.get(Number(section.grade_level_id)) || section.level || "G7",
    grade_level_id: Number(section.grade_level_id) || 1,
    status: section.status || "Active",
    is_specialized: section.is_specialized || 0,
    program_id: section.program_id || null
  }));
  const students = studentRows.map(student => {
    const id = Number(student.student_id || student.id);
    const enrollment = enrollmentMap.get(id);
    const sectionId = student.section_id || enrollment?.section_id || null;
    const section = sectionMap.get(Number(sectionId));
    const gradeId = Number(section?.grade_level_id || student.grade_level_id) || null;
    const specialized = sectionProgram(section);
    return {
      ...student,
      id,
      name: student.name || [student.first_name, student.middle_name, student.last_name, student.extension_name].filter(Boolean).join(" "),
      lrn: String(student.LRN || student.lrn || ""),
      masked_lrn: student.masked_lrn || maskLrn(student.LRN || student.lrn),
      grade_level_id: gradeId,
      gradeLevel: sectionId ? section?.grade_level_name || gradeMap.get(gradeId) || section?.level : "Unassigned",
      section_id: sectionId ? Number(sectionId) : null,
      section: section?.section_name || section?.name || student.section || "Unassigned",
      student_section_id: student.student_section_id || enrollment?.student_section_id || null,
      status: student.status || "Active",
      program_id: specialized ? Number(section.program_id) : Number(student.program_id) || 4,
      program_code: specialized?.code || student.program_code || "EBEC",
      is_specialized: specialized ? 1 : student.is_specialized || 0
    };
  });
  return {
    sections,
    students,
    gradeLevels
  };
}
export default function StudentSectionManagement() {
  const query = useCachedQuery(cacheKey("admin:sections"), loadSectionCatalog);
  const [mutationCatalog, setMutationCatalog] = useState(null);
  // Keep this view stable while its own save invalidates and reloads cached reads.
  const catalog = query.data ?? mutationCatalog;
  const loading = query.loading && !catalog;
  const sections = catalog?.sections || EMPTY_LIST;
  const students = catalog?.students || EMPTY_LIST;
  const gradeLevels = catalog?.gradeLevels || DEFAULT_GRADES;
  const [view, setView] = useState("sections");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sectionSearch, setSectionSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(() => blankSection(DEFAULT_GRADES[0]));
  const [drawerSection, setDrawerSection] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("details");
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentIds, setAssignmentIds] = useState([]);
  const [assignmentSectionId, setAssignmentSectionId] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  useEffect(() => {
    document.querySelector(".page-content-area")?.scrollTo({
      top: 0
    });
  }, [view]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const filteredSections = useMemo(() => sections.filter(section => (levelFilter === "all" || String(section.grade_level_id) === levelFilter) && section.name.toLowerCase().includes(sectionSearch.toLowerCase().trim())), [sections, levelFilter, sectionSearch]);
  const filteredStudents = useMemo(() => students.filter(student => `${student.name} ${student.lrn} ${student.masked_lrn || ""}`.toLowerCase().includes(studentSearch.toLowerCase().trim()) && (sectionFilter === "all" || (sectionFilter === "unassigned" ? !student.section_id : String(student.section_id) === sectionFilter)) && (assignmentFilter === "all" || Boolean(student.section_id) === (assignmentFilter === "assigned"))), [students, studentSearch, sectionFilter, assignmentFilter]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredStudents.length / 10)));
  const pageStudents = filteredStudents.slice((currentPage - 1) * 10, currentPage * 10);
  const selectedStudents = students.filter(student => selectedIds.has(student.id));
  const targetSection = sections.find(section => section.id === drawerSection?.id) || drawerSection;
  const assignmentStudents = students.filter(student => assignmentIds.includes(student.id));
  const assignmentSections = sections.filter(section => `${section.name} ${formatSectionGrade(section.level, section.grade_level_id)} ${sectionProgram(section)?.code || "Regular Class"}`.toLowerCase().includes(assignmentSearch.toLowerCase().trim()));
  const countMembers = id => students.filter(student => Number(student.section_id) === Number(id)).length;
  const toggleStudent = id => setSelectedIds(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);else next.add(id);
    return next;
  });
  const mutate = async (action, message) => {
    if (busy) return false;
    setToast(null);
    setMutationCatalog(catalog);
    setBusy(true);
    try {
      await action();
      await query.refresh();
      setToast({
        message,
        type: "success"
      });
      return true;
    } catch (error) {
      if (!isSessionCancellation(error)) setToast({
        message: error.message || "The change could not be saved.",
        type: "error"
      });
      return false;
    } finally {
      setBusy(false);
      setMutationCatalog(null);
    }
  };
  const openCreate = () => {
    setToast(null);
    setForm(blankSection(gradeLevels[0] || DEFAULT_GRADES[0]));
    setCreateOpen(true);
  };
  const openDrawer = (section, nextView = "details") => {
    setToast(null);
    setDrawerSection(section);
    setForm({
      ...section,
      is_specialized: Number(section.is_specialized) === 1,
      program_id: String(section.program_id || "1")
    });
    setDrawerView(nextView);
    setDrawerVersion(value => value + 1);
    setDrawerOpen(true);
  };
  const saveSection = async event => {
    event.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      section_name: form.name.trim(),
      grade_level_id: form.grade_level_id,
      level: form.level,
      is_specialized: form.is_specialized ? 1 : 0,
      program_id: form.is_specialized ? form.program_id : null
    };
    if (await mutate(() => createOpen ? createSection(payload) : updateSection(form.id, payload), createOpen ? "Section created successfully." : "Section details updated.")) {
      setCreateOpen(false);
      if (!createOpen) setDrawerSection(previous => ({
        ...previous,
        name: form.name.trim()
      }));
    }
  };
  const openAssignment = ids => {
    setToast(null);
    setAssignmentIds(ids);
    setAssignmentSectionId("");
    setAssignmentSearch("");
    setAssignmentOpen(true);
  };
  const submitAssignment = async event => {
    event.preventDefault();
    if (!assignmentSectionId || !assignmentIds.length) return;
    if (await mutate(() => bulkAssignStudents({
      studentIds: assignmentIds,
      sectionId: Number(assignmentSectionId)
    }), "Students assigned successfully.")) {
      setSelectedIds(previous => new Set([...previous].filter(id => !assignmentIds.includes(id))));
      setAssignmentOpen(false);
    }
  };
  return <div className={`student-admin-page section-management-page ${view === "assign" && selectedStudents.length ? "has-selection" : ""}`}>
    <header className="student-admin-header"><div><h1>Student Sections</h1><p>Organize sections and manage student assignments in one place.</p></div>
      <SegmentedControl label="Section page view" value={view} onChange={setView} options={[{
        value: "sections",
        label: "Sections",
        icon: LayoutGrid
      }, {
        value: "assign",
        label: "Assign Students",
        icon: UserPlus
      }]} /></header>
    <section className="student-admin-panel">
      <div className="student-admin-panel-heading"><div><h2>{view === "sections" ? "Manage sections" : "Assign students"}</h2><p>{view === "sections" ? "A clear view of each section’s program and class size." : "Select learners, review your selection, then assign a section."}</p></div><span className="student-admin-count">{view === "sections" ? filteredSections.length + " sections" : filteredStudents.length + (filteredStudents.length === 1 ? " student" : " students")}</span></div>
      {view === "sections" ? <>
        <div className="student-admin-toolbar"><DropdownSelect label="Grade level" value={levelFilter} options={[{
            value: "all",
            label: "All levels"
          }, ...gradeLevels.map(grade => ({
            value: String(grade.id),
            label: grade.label
          }))]} onChange={setLevelFilter} />
          <SearchBar query={sectionSearch} setQuery={setSectionSearch} placeholder="Search sections by name…" /><button type="button" className="student-admin-button student-admin-button--primary" onClick={openCreate}><Plus size={17} />Create Section</button></div>
        {loading ? <div className="section-card-grid" role="status" aria-label="Loading sections">{[1, 2, 3, 4, 5, 6].map(id => <div className="section-card section-card--skeleton student-admin-loading" key={id} />)}</div> : query.error ? <div className="student-admin-empty"><EmptyState icon={AlertCircle} title="Sections are unavailable" description={query.error} /><button type="button" className="student-admin-button" onClick={query.refresh}>Retry</button></div> : !filteredSections.length ? <EmptyState className="student-admin-empty" icon={LayoutGrid} title="No sections found" description="Try another search or create a section to get started." /> : <div className="section-card-grid">{filteredSections.map(section => {
            const program = sectionProgram(section);
            const count = countMembers(section.id);
            return <article key={section.id} className="section-card" aria-label={`${section.name}, ${formatSectionGrade(section.level, section.grade_level_id)}`}>
              <div className="section-card__heading"><h3>{section.name}</h3><span className="section-card__grade" data-grade-level={section.grade_level_id}>{formatSectionGrade(section.level, section.grade_level_id).replace("Grade ", "G")}</span></div>
              <p className="section-card__program">{program ? `Special Program - ${program.code}` : "Regular Class"}</p>
              <div className="section-card__students"><Users size={17} /><span>{count} {count === 1 ? "Student" : "Students"}</span></div>
              <SectionCapacity count={count} />
              <div className="section-card__actions"><button type="button" className="student-admin-button" aria-label={`Manage ${section.name}`} onClick={() => openDrawer(section)}><Settings2 size={16} />Manage</button>
                <button type="button" className="student-admin-button" aria-label={`View students in ${section.name}`} onClick={() => {
                  setSectionFilter(String(section.id));
                  setAssignmentFilter("all");
                  setStudentSearch("");
                  setPage(1);
                  setView("assign");
                }}><Eye size={16} />View</button>
                <button type="button" className="student-admin-icon-button student-admin-icon-button--danger" title="Delete section" aria-label={`Delete section ${section.name}`} onClick={() => {
                  setToast(null);
                  setDrawerSection(section);
                  setDeleteOpen(true);
                }}><Trash2 size={16} /></button>
              </div>
            </article>;
          })}</div>}
      </> : <>
        <div className="student-admin-toolbar"><SearchBar query={studentSearch} setQuery={value => {
            setStudentSearch(value);
            setPage(1);
          }} placeholder="Search student name or LRN…" />
          <DropdownSelect label="Section" value={sectionFilter} options={[{
            value: "all",
            label: "All sections"
          }, {
            value: "unassigned",
            label: "Unassigned"
          }, ...sections.map(section => ({
            value: String(section.id),
            label: `${section.name} · ${formatSectionGrade(section.level, section.grade_level_id)}`
          }))]} onChange={value => {
            setSectionFilter(value);
            setPage(1);
          }} />
          <DropdownSelect label="Assignment" value={assignmentFilter} options={[{
            value: "all",
            label: "All students"
          }, {
            value: "assigned",
            label: "Assigned"
          }, {
            value: "unassigned",
            label: "Unassigned"
          }]} onChange={value => {
            setAssignmentFilter(value);
            setPage(1);
          }} /></div>
        {loading ? <EmptyState className="student-admin-empty student-admin-loading" icon={Users} title="Loading students…" /> : query.error ? <div className="student-admin-empty"><EmptyState icon={AlertCircle} title="Students are unavailable" description={query.error} /><button type="button" className="student-admin-button" onClick={query.refresh}>Retry</button></div> : !filteredStudents.length ? <EmptyState className="student-admin-empty" icon={Users} title="No students found" description="Try changing the section, assignment filter, or search." /> : <><div className="student-admin-table-scroll"><table className="student-admin-table section-assignment-table"><colgroup><col style={{
                  width: "4%"
                }} /><col style={{
                  width: "22%"
                }} /><col style={{
                  width: "15%"
                }} /><col style={{
                  width: "10%"
                }} /><col style={{
                  width: "12%"
                }} /><col style={{
                  width: "8%"
                }} /><col style={{
                  width: "10%"
                }} /><col style={{
                  width: "19%"
                }} /></colgroup>
                <thead><tr><th><input type="checkbox" aria-label="Select all students on this page" checked={pageStudents.length > 0 && pageStudents.every(student => selectedIds.has(student.id))} onChange={() => setSelectedIds(previous => {
                      const next = new Set(previous);
                      const all = pageStudents.every(student => next.has(student.id));
                      pageStudents.forEach(student => all ? next.delete(student.id) : next.add(student.id));
                      return next;
                    })} /></th><th>Student name</th><th>LRN</th><th>Grade level</th><th>Section</th><th>Program</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{pageStudents.map(student => <tr key={student.id} className={selectedIds.has(student.id) ? "is-selected" : ""}><td><input type="checkbox" aria-label={`Select ${student.name}`} checked={selectedIds.has(student.id)} onChange={() => toggleStudent(student.id)} /></td><td><strong>{student.name}</strong></td><td className="student-admin-mono"><MaskedLrn lrn={student.lrn} maskedLrn={student.masked_lrn} showToggle allowCopy /></td><td>{formatSectionGrade(student.gradeLevel, student.grade_level_id)}</td><td><span className={`student-admin-badge ${student.section_id ? "" : "student-admin-badge--gold"}`}>{student.section}</span></td><td><Badge className="student-admin-program" variant={`program-${String(student.program_code || "EBEC").toLowerCase()}`} title={student.program_name || student.program_code || "EBEC"}>{student.program_code || "EBEC"}</Badge></td><td className="section-assignment-status"><Badge variant={String(student.status).toLowerCase()} className="student-admin-status"><span className="student-admin-status__dot" aria-hidden="true" />{String(student.status).toLowerCase()}</Badge></td>
                  <td><div className="student-admin-actions"><button type="button" className={student.section_id ? "student-admin-button section-change-button" : "student-admin-icon-button student-admin-icon-button--primary"} aria-label={`${student.section_id ? "Change section for" : "Assign"} ${student.name}`} title={student.section_id ? "Change section" : "Assign student"} onClick={() => openAssignment([student.id])}>{student.section_id ? "Change" : <Plus size={17} />}</button></div></td></tr>)}</tbody></table></div><TablePagination page={currentPage} pageSize={10} total={filteredStudents.length} onPageChange={setPage} /></>}
      </>}
    </section>
    {view === "assign" && <StudentSelectionTray students={selectedStudents} onRemove={toggleStudent} onClear={() => setSelectedIds(new Set())} onAssign={() => openAssignment(selectedStudents.map(student => student.id))} />}
    <OverlayPanel isOpen={createOpen} onClose={() => setCreateOpen(false)} variant="modal" title="Create Section" eyebrow="New section" description="Set the grade level and curriculum before assigning students." busy={busy} error={toast?.type === "error" ? toast.message : ""} footer={<><button type="button" className="student-admin-button" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button><button type="submit" form="create-section-form" className="student-admin-button student-admin-button--primary" disabled={busy}>{busy ? "Creating…" : "Create section"}</button></>}>
      <form id="create-section-form" onSubmit={saveSection}><SectionFormFields value={form} onChange={setForm} gradeLevels={gradeLevels} disabled={busy} /></form>
    </OverlayPanel>
    <SectionManagementDrawer notification={toast?.type === "success" ? <Toast persistent className="app-overlay__notification" message={toast.message} onDismiss={() => setToast(null)} /> : null} key={`${drawerSection?.id || "section"}:${drawerVersion}`} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} section={targetSection} students={students} gradeLevels={gradeLevels} form={form} setForm={setForm} onSave={saveSection} onDelete={() => setDeleteOpen(true)} busy={busy} error={toast?.type === "error" ? toast.message : ""} view={drawerView} onViewChange={setDrawerView} onAssign={ids => mutate(() => bulkAssignStudents({
      studentIds: ids,
      sectionId: targetSection.id
    }), `${ids.length} ${ids.length === 1 ? "student added" : "students added"} to ${targetSection.name}.`)} onRemove={student => mutate(() => unassignStudent({
      studentId: student.id,
      sectionId: targetSection.id,
      studentSectionId: student.student_section_id
    }), `${student.name} removed from ${targetSection.name}.`)} />
    <OverlayPanel isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} variant="modal" title="Remove section?" busy={busy} error={toast?.type === "error" ? toast.message : ""} description="This action removes the section. Existing records may prevent removal." footer={<><button type="button" className="student-admin-button" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button><button type="button" className="student-admin-button student-admin-button--danger" disabled={busy} onClick={async () => {
        if (await mutate(() => deleteSection(targetSection.id), "Section removed.")) {
          setDeleteOpen(false);
          setDrawerOpen(false);
        }
      }}>Remove section</button></>}>
      <p className="student-admin-form-note">You are removing <strong>{targetSection?.name}</strong>. Review its assigned students and academic records before continuing.</p>
    </OverlayPanel>
    <OverlayPanel isOpen={assignmentOpen} onClose={() => setAssignmentOpen(false)} variant="modal" title="Assign students to a section" eyebrow="Review assignment" busy={busy} error={toast?.type === "error" ? toast.message : ""} description={`${assignmentStudents.length} ${assignmentStudents.length === 1 ? "student" : "students"} selected. Existing assignments will be changed to the chosen section.`} footer={<><button type="button" className="student-admin-button" disabled={busy} onClick={() => setAssignmentOpen(false)}>Cancel</button><button type="submit" form="assign-students-form" className="student-admin-button student-admin-button--primary" aria-busy={busy} disabled={busy || !assignmentSectionId || !assignmentStudents.length}>{busy && <Loader2 size={15} className="student-admin-spinner" aria-hidden="true" />}{busy ? "Assigning…" : "Confirm assignment"}</button></>}>
      <div className="section-assignment-review">{assignmentStudents.map(student => <span key={student.id}>{student.name}<small><MaskedLrn lrn={student.lrn} maskedLrn={student.masked_lrn} badge={false} /></small></span>)}</div>
      <form id="assign-students-form" className="student-admin-form" onSubmit={submitAssignment}>
        <div className="student-admin-field"><label htmlFor="assignment-search">Find a section</label><SearchBar id="assignment-search" query={assignmentSearch} setQuery={value => {
            setAssignmentSearch(value);
            setAssignmentSectionId("");
          }} placeholder="Search sections by name, grade, or program…" /></div>
        {!assignmentSections.length && <p className="student-admin-hint" role="status">No sections match your search.</p>}
        <div className="student-admin-field"><label htmlFor="assignment-section">Destination section</label><DropdownSelect className="section-assignment-select" id="assignment-section" label="Destination section" value={assignmentSectionId} placeholder="Choose a section" options={assignmentSections.map(section => ({
            value: String(section.id),
            label: `${section.name} · ${formatSectionGrade(section.level, section.grade_level_id)}`
          }))} onChange={setAssignmentSectionId} disabled={busy} /></div></form>
    </OverlayPanel>
    <Toast className="app-toast--bottom-tray" message={drawerOpen ? null : toast?.message} variant={toast?.type} icon={toast?.type === "error" ? AlertCircle : undefined} onDismiss={() => setToast(null)} />
  </div>;
}
