import { useEffect, useMemo, useState } from "react";
import { Users, Plus, Pencil, Trash2, GraduationCap, AlertCircle } from "lucide-react";
import useCachedQuery from "../../services/useCachedQuery";
import { cacheKey } from "../../services/navigationCache";
import { isSessionCancellation } from "../../offline/syncManager";
import DropdownSelect from "../../components/common/DropdownSelect";
import SearchBar from "../../components/common/SearchBar";
import MaskedLrn from "../../components/common/MaskedLrn";
import StatCard from "../../components/common/StatCard";
import EmptyState from "../../components/common/EmptyState";
import Toast from "../../components/common/Toast";
import Badge from "../../components/common/Badge";
import OverlayPanel from "../../components/common/OverlayPanel";
import TablePagination from "../../components/common/TablePagination";
import StudentFormModal from "./manage-students/StudentFormModal";
import StudentDetailModal from "./manage-students/StudentDetailModal";
import { fetchStudents, fetchPrograms, createStudent, updateStudent, deleteStudent } from "../../services/studentService";
import "../../styles/adminDashboard.css";
import "../../styles/StudentAdmin.css";
import "../../styles/ManageStudents.css";
const EMPTY_LIST = [];
const GRADES = [{
  value: "all",
  label: "All grade levels"
}, ...[7, 8, 9, 10].map(grade => ({
  value: `G${grade}`,
  label: `Grade ${grade}`
})), {
  value: "unassigned",
  label: "Unassigned"
}];
function normalizeGrade(student) {
  const raw = String(student.grade_level_name || student.gradeLevel || "").toUpperCase();
  const number = Number(raw.replace(/\D/g, ""));
  if ([7, 8, 9, 10].includes(number)) return `G${number}`;
  if (Number(student.grade_level_id) >= 1 && Number(student.grade_level_id) <= 4) return `G${Number(student.grade_level_id) + 6}`;
  return "unassigned";
}
const studentName = student => student.name || [student.last_name && `${student.last_name},`, student.first_name, student.middle_name, student.extension_name].filter(Boolean).join(" ");
async function loadStudentCatalog() {
  const [students, programs] = await Promise.all([fetchStudents(), fetchPrograms()]);
  return {
    students,
    programs
  };
}
export default function ManageStudents() {
  const query = useCachedQuery(cacheKey("admin:students"), loadStudentCatalog);
  const students = query.data?.students || EMPTY_LIST;
  const programs = query.data?.programs || EMPTY_LIST;
  const [gradeFilter, setGradeFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    document.querySelector(".page-content-area")?.scrollTo({
      top: 0
    });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const counts = useMemo(() => {
    const result = {
      all: students.length,
      G7: 0,
      G8: 0,
      G9: 0,
      G10: 0,
      unassigned: 0
    };
    students.forEach(student => {
      result[normalizeGrade(student)]++;
    });
    return result;
  }, [students]);
  const filtered = useMemo(() => students.filter(student => (gradeFilter === "all" || normalizeGrade(student) === gradeFilter) && (programFilter === "all" || String(student.program_id) === programFilter) && `${studentName(student)} ${student.LRN || student.lrn || ""} ${student.masked_lrn || ""} ${student.section || student.section_name || ""}`.toLowerCase().includes(search.toLowerCase().trim())), [students, gradeFilter, programFilter, search]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  const shown = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  const openProfile = student => {
    setSelectedStudent(student);
    setDetailOpen(true);
  };
  const openForm = student => {
    setToast(null);
    setEditingStudent(student);
    setFormOpen(true);
  };
  const onSave = async payload => {
    if (saving) return;
    setSaving(true);
    try {
      const id = editingStudent?.student_id || editingStudent?.id;
      if (id) await updateStudent(id, payload);else await createStudent(payload);
      setToast({
        message: id ? "Student updated successfully." : "Student registered successfully.",
        type: "success"
      });
      setFormOpen(false);
      await query.refresh();
    } catch (error) {
      if (!isSessionCancellation(error)) setToast({
        message: error.message || "The student record could not be saved.",
        type: "error"
      });
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (saving || !deletingStudent) return;
    setSaving(true);
    try {
      await deleteStudent(deletingStudent.student_id || deletingStudent.id);
      setDeleteOpen(false);
      setToast({
        message: "Student deleted successfully.",
        type: "success"
      });
      await query.refresh();
    } catch (error) {
      if (!isSessionCancellation(error)) setToast({
        message: error.message || "The student could not be deleted.",
        type: "error"
      });
    } finally {
      setSaving(false);
    }
  };
  return <div className="student-admin-page manage-students-container">
    <header className="student-admin-header"><div><h1>Manage Students</h1><p>All learner profiles across Grades 7–10, including regular and specialized programs.</p></div>
      <button type="button" className="student-admin-button student-admin-button--primary" onClick={() => openForm(null)}><Plus size={17} />Add Student</button></header>
    <section className="student-overview-grid" aria-label="Student overview">
      {[{
        title: "All students",
        key: "all",
        description: "Regular & specialized programs",
        icon: Users,
        variant: "primary"
      }, ...[7, 8, 9, 10].map((grade, index) => ({
        title: `Grade ${grade}`,
        key: `G${grade}`,
        description: "Learners with a grade assignment",
        icon: GraduationCap,
        variant: ["info", "warning", "primary", "info"][index]
      }))].map(card => <StatCard key={card.key} title={card.title} value={query.loading ? "—" : counts[card.key]} description={card.description} icon={card.icon} variant={card.variant} />)}
    </section>
    <section className="student-admin-panel">
      <div className="student-admin-panel-heading"><div><h2>Student directory</h2><p>Select a student row to view their profile. Use the actions to edit or delete.</p></div><span className="student-admin-count">{filtered.length} {filtered.length === 1 ? "student" : "students"}</span></div>
      <div className="student-admin-toolbar"><SearchBar query={search} setQuery={value => {
          setSearch(value);
          setPage(1);
        }} placeholder="Search name, LRN, or section…" />
        <DropdownSelect label="Grade level" value={gradeFilter} options={GRADES} onChange={value => {
          setGradeFilter(value);
          setPage(1);
        }} />
        <DropdownSelect label="Program" value={programFilter} options={[{
          value: "all",
          label: "All programs"
        }, ...programs.map(program => ({
          value: String(program.program_id),
          label: program.program_code
        }))]} onChange={value => {
          setProgramFilter(value);
          setPage(1);
        }} /></div>
      {query.loading ? <EmptyState className="student-admin-empty student-admin-loading" icon={Users} title="Loading student records…" /> : query.error ? <div className="student-admin-empty"><EmptyState icon={AlertCircle} title="Students are unavailable" description={query.error} /><button type="button" className="student-admin-button" onClick={query.refresh}>Retry</button></div> : !shown.length ? <EmptyState className="student-admin-empty" icon={Users} title="No students found" description="Try another grade level, program, or search." /> : <><div className="student-admin-table-scroll"><table className="student-admin-table student-directory-table"><colgroup><col style={{
                width: "16%"
              }} /><col style={{
                width: "25%"
              }} /><col style={{
                width: "8%"
              }} /><col style={{
                width: "11%"
              }} /><col style={{
                width: "13%"
              }} /><col style={{
                width: "9%"
              }} /><col style={{
                width: "18%"
              }} /></colgroup>
              <thead><tr><th>LRN</th><th>Student name</th><th>Sex</th><th>Grade level</th><th>Section</th><th>Program</th><th>Actions</th></tr></thead>
              <tbody>{shown.map(student => {
                const id = student.student_id || student.id;
                const name = studentName(student);
                const grade = normalizeGrade(student);
                return <tr key={id} className="student-directory-row" tabIndex={0} aria-label={`View profile for ${name}`} onClick={() => openProfile(student)} onKeyDown={event => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openProfile(student);
                  }
                }}><td className="student-admin-mono"><MaskedLrn lrn={student.LRN || student.lrn} maskedLrn={student.masked_lrn} showToggle allowCopy /></td><td><strong>{name}</strong></td><td>{student.sex === "M" ? "Male" : student.sex === "F" ? "Female" : student.sex || "—"}</td><td>{grade === "unassigned" ? "Unassigned" : `Grade ${grade.slice(1)}`}</td><td><span className="student-admin-badge student-admin-badge--muted">{student.section || student.section_name || "Unassigned"}</span></td><td><Badge className="student-admin-program" variant={`program-${String(student.program_code || "EBEC").toLowerCase()}`} title={student.program_name || student.program_code || "EBEC"}>{student.program_code || "EBEC"}</Badge></td>
                  <td><div className="student-admin-actions">                    <button type="button" className="student-admin-icon-button" aria-label={`Edit ${name}`} title="Edit student" onClick={event => {
                        event.stopPropagation();
                        openForm(student);
                      }}><Pencil size={16} /></button>
                    <button type="button" className="student-admin-icon-button student-admin-icon-button--danger" aria-label={`Delete ${name}`} title="Delete student" onClick={event => {
                        event.stopPropagation();
                        setToast(null);
                        setDeletingStudent(student);
                        setDeleteOpen(true);
                      }}><Trash2 size={16} /></button></div></td></tr>;
              })}</tbody></table></div><TablePagination page={currentPage} pageSize={12} total={filtered.length} onPageChange={setPage} /></>}
    </section>
    <StudentFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} onSubmit={onSave} initialData={editingStudent} programs={programs} isSaving={saving} errorMessage={toast?.type === "error" ? toast.message : ""} />
    <StudentDetailModal isOpen={detailOpen} onClose={() => setDetailOpen(false)} student={selectedStudent} onEdit={() => {
      setDetailOpen(false);
      openForm(selectedStudent);
    }} />
    <OverlayPanel isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete student" eyebrow="Student record" busy={saving} error={toast?.type === "error" ? toast.message : ""} description="Review this action carefully. This deletes a learner profile, not just a section assignment." footer={<><button type="button" className="student-admin-button" disabled={saving} onClick={() => setDeleteOpen(false)}>Cancel</button><button type="button" className="student-admin-button student-admin-button--danger" disabled={saving} onClick={confirmDelete}>{saving ? "Deleting…" : "Delete student"}</button></>}>
      <div className="student-admin-form-note"><strong>{deletingStudent && studentName(deletingStudent)}</strong><p>LRN: <MaskedLrn lrn={deletingStudent?.LRN || deletingStudent?.lrn} maskedLrn={deletingStudent?.masked_lrn} /></p>Academic records or other linked information may prevent deletion.</div>
    </OverlayPanel>
    <Toast className="app-toast--bottom-tray" message={toast?.message} variant={toast?.type} icon={toast?.type === "error" ? AlertCircle : undefined} onDismiss={() => setToast(null)} />
  </div>;
}
