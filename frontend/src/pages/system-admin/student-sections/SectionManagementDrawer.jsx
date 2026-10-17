import { useState } from "react";
import { Plus, Trash2, Users, Settings2, UserMinus, UserPlus, Loader2 } from "lucide-react";
import OverlayPanel from "../../../components/common/OverlayPanel";
import SegmentedControl from "../../../components/common/SegmentedControl";
import SearchBar from "../../../components/common/SearchBar";
import { maskLrn } from "../../../utils/lrnHelper";
import EmptyState from "../../../components/common/EmptyState";
import TablePagination from "../../../components/common/TablePagination";
import SectionFormFields from "./SectionFormFields";
import SectionCapacity from "./SectionCapacity";
import { canAddToSection, formatSectionGrade } from "../../../utils/studentSections";
export default function SectionManagementDrawer({
  isOpen,
  onClose,
  section,
  students,
  gradeLevels,
  form,
  setForm,
  onSave,
  onDelete,
  onAssign,
  onRemove,
  busy,
  error,
  notification,
  view = "details",
  onViewChange
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [addingTarget, setAddingTarget] = useState(null);
  const members = students.filter(student => Number(student.section_id) === Number(section?.id));
  const eligible = students.filter(student => canAddToSection(student, section));
  const filtered = (view === "add" ? eligible : members).filter(student => `${student.name} ${student.lrn} ${student.masked_lrn || ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 4)));
  const shown = filtered.slice((currentPage - 1) * 4, currentPage * 4);
  const selectedIds = [...selected].filter(id => eligible.some(student => student.id === id));
  const addStudents = async (ids, bulk = false) => {
    if (busy || addingTarget || !ids.length) return false;
    setAddingTarget({ ids, bulk });
    try {
      return await onAssign(ids);
    } finally {
      setAddingTarget(null);
    }
  };
  const changeView = next => {
    onViewChange(next);
    setSearch("");
    setPage(1);
    setPendingRemoval(null);
  };
  const toggle = id => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);else next.add(id);
    return next;
  });
  return <OverlayPanel isOpen={isOpen} onClose={onClose} title={section?.name || "Manage section"} eyebrow="Section workspace" description={section && `${formatSectionGrade(section.level, section.grade_level_id)} · Section details and student membership`} className="section-management-drawer" busy={busy} error={error} notification={notification} footer={<>
      {view === "details" ? <><button type="button" className="student-admin-button" onClick={onClose} disabled={busy}>Close</button>
        <button type="submit" form="section-details-form" className="student-admin-button student-admin-button--primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></> : view === "add" ? <><span className="section-drawer-selection" role={addingTarget ? "status" : undefined}>{addingTarget ? addingTarget.ids.length === 1 ? "Adding student…" : "Adding students…" : `${selectedIds.length} selected`}</span>
          <button type="button" className="student-admin-button" disabled={busy || !selectedIds.length} onClick={() => setSelected(new Set())}>Clear</button>
          <button type="button" className="student-admin-button student-admin-button--primary" aria-busy={Boolean(addingTarget?.bulk)} disabled={busy || !selectedIds.length} onClick={async () => {
        if (await addStudents(selectedIds, true)) setSelected(new Set());
      }}>{addingTarget?.bulk ? <Loader2 size={15} className="student-admin-spinner" aria-hidden="true" /> : <Plus size={15} />}{addingTarget?.bulk ? "Adding…" : "Add selected"}</button></> : <button type="button" className="student-admin-button" onClick={onClose} disabled={busy}>Done</button>}
    </>}>
    <SectionCapacity count={members.length} />
    <SegmentedControl label="Section workspace" value={view} onChange={changeView} disabled={busy} options={[{
      value: "details",
      label: "Details",
      icon: Settings2
    }, {
      value: "add",
      label: "Add students",
      icon: UserPlus
    }, {
      value: "remove",
      label: "Current students",
      icon: Users
    }]} />
    <div className="section-drawer-content" key={view}>
      {view === "details" ? <><section className="student-admin-form-section"><h3>Section details</h3><p>Update the name, grade level, or curriculum below.</p>
        <form id="section-details-form" onSubmit={onSave}><SectionFormFields value={form} onChange={setForm} gradeLevels={gradeLevels} disabled={busy} /></form></section>
        <section className="student-admin-danger-zone"><h3>Remove section</h3><p>Review the section and its students before removing it.</p>
          <button type="button" className="student-admin-button student-admin-button--danger" disabled={busy} onClick={onDelete}><Trash2 size={14} />Remove section</button></section>
      </> : <><h3 className="student-admin-subheading">{view === "add" ? "Add students" : `Current students (${members.length})`}</h3>
        <p className="student-admin-hint">{view === "add" ? "Unassigned students matching this section’s grade and program rules." : "Removing a student unassigns the section; it does not delete the student’s profile."}</p>
        <div className="student-admin-toolbar section-drawer-search"><SearchBar query={search} setQuery={value => {
            setSearch(value);
            setPage(1);
          }} placeholder="Search name or LRN…" /></div>
        {view === "add" && shown.length > 0 && <label className="student-admin-check section-select-page"><input type="checkbox" aria-label="Select all students on this drawer page" disabled={busy} checked={shown.every(student => selected.has(student.id))} onChange={() => setSelected(previous => {
            const next = new Set(previous);
            const all = shown.every(student => next.has(student.id));
            shown.forEach(student => all ? next.delete(student.id) : next.add(student.id));
            return next;
          })} />Select this page</label>}
        <div className="section-student-list">{shown.map(student => <div className="section-student-row" key={student.id}>
          {view === "add" && <input type="checkbox" aria-label={`Select ${student.name}`} checked={selected.has(student.id)} onChange={() => toggle(student.id)} disabled={busy} />}
          <div><strong>{student.name}</strong><small>LRN {student.masked_lrn || maskLrn(student.lrn)} · {student.program_code || "EBEC"}</small></div>
          {view === "add" ? <button type="button" className="student-admin-icon-button student-admin-icon-button--primary" aria-label={`Add ${student.name}`} aria-busy={Boolean(addingTarget?.ids.includes(student.id))} disabled={busy} onClick={() => addStudents([student.id])}>{addingTarget?.ids.includes(student.id) ? <Loader2 size={16} className="student-admin-spinner" aria-hidden="true" /> : <Plus size={16} />}</button> : <button type="button" className="student-admin-icon-button student-admin-icon-button--danger" aria-label={`Remove ${student.name}`} disabled={busy} onClick={() => setPendingRemoval(student)}><UserMinus size={16} /></button>}
        </div>)}</div>
        {!shown.length && <EmptyState className="student-admin-empty" icon={Users} title={view === "add" ? "No eligible students found" : "No students found"} description={search ? "Try another name or LRN." : view === "add" ? "All eligible students may already have a section." : "This section has no assigned students."} />}
        {filtered.length > 4 && <TablePagination page={currentPage} pageSize={4} total={filtered.length} onPageChange={setPage} />}
      </>}
    </div>
    <OverlayPanel isOpen={Boolean(pendingRemoval)} onClose={() => setPendingRemoval(null)} variant="modal" title="Remove student from section?" busy={busy} error={error} description="The student’s profile and academic records will be kept." footer={<><button type="button" className="student-admin-button" disabled={busy} onClick={() => setPendingRemoval(null)}>Cancel</button>
        <button type="button" className="student-admin-button student-admin-button--danger" disabled={busy} onClick={async () => {
        if (await onRemove(pendingRemoval)) setPendingRemoval(null);
      }}>Remove student</button></>}>
      <p className="student-admin-form-note"><strong>{pendingRemoval?.name}</strong> will be unassigned from {section?.name}.</p>
    </OverlayPanel>
  </OverlayPanel>;
}
