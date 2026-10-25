import { useState, useEffect } from "react";
import { Plus, Trash2, Users, Settings2, UserMinus, UserPlus, Loader2, BookOpen, CheckCircle2, Sparkles, Check } from "lucide-react";
import OverlayPanel from "../../../components/common/OverlayPanel";
import SegmentedControl from "../../../components/common/SegmentedControl";
import SearchBar from "../../../components/common/SearchBar";
import DropdownSelect from "../../../components/common/DropdownSelect";
import { maskLrn } from "../../../utils/lrnHelper";
import EmptyState from "../../../components/common/EmptyState";
import TablePagination from "../../../components/common/TablePagination";
import SectionFormFields from "./SectionFormFields";
import SectionCapacity from "./SectionCapacity";
import { canAddToSection, formatSectionGrade } from "../../../utils/studentSections";
import {
  fetchSectionSubjects,
  addSectionSubject,
  removeSectionSubject,
  autoAssignSectionSubjects,
  fetchSubjectCatalog,
} from "../../../services/studentSectionService";

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

  // Section Subjects State
  const [sectionSubjects, setSectionSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [subjectCatalog, setSubjectCatalog] = useState([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [addingSubjectModalOpen, setAddingSubjectModalOpen] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(new Set());
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerFilter, setPickerFilter] = useState("available");
  const [pendingSubjectRemoval, setPendingSubjectRemoval] = useState(null);
  const [subjectActionBusy, setSubjectActionBusy] = useState(false);
  const [subjectError, setSubjectError] = useState("");

  const members = students.filter(student => Number(student.section_id) === Number(section?.id));
  const eligible = students.filter(student => canAddToSection(student, section));
  const filtered = (view === "add" ? eligible : members).filter(student => `${student.name} ${student.lrn} ${student.masked_lrn || ""}`.toLowerCase().includes(search.toLowerCase().trim()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 4)));
  const shown = filtered.slice((currentPage - 1) * 4, currentPage * 4);
  const selectedIds = [...selected].filter(id => eligible.some(student => student.id === id));

  const loadSectionSubjects = async () => {
    if (!section?.id) return;
    setLoadingSubjects(true);
    setSubjectError("");
    try {
      const [subRows, catRows] = await Promise.all([
        fetchSectionSubjects(section.id),
        catalogLoaded ? Promise.resolve(subjectCatalog) : fetchSubjectCatalog(),
      ]);
      setSectionSubjects(subRows);
      if (!catalogLoaded) {
        setSubjectCatalog(catRows);
        setCatalogLoaded(true);
      }
    } catch (err) {
      setSubjectError(err.message || "Failed to load subjects.");
    } finally {
      setLoadingSubjects(false);
    }
  };

  useEffect(() => {
    if (isOpen && section?.id) {
      loadSectionSubjects();
    }
  }, [isOpen, section?.id]);

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
    setSubjectSearch("");
    setPage(1);
    setPendingRemoval(null);
    setPendingSubjectRemoval(null);
    setSubjectError("");
  };

  const toggle = id => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);else next.add(id);
    return next;
  });

  const openAddSubjectModal = () => {
    setSubjectError("");
    setSelectedSubjectIds(new Set());
    setPickerSearch("");
    setPickerFilter("available");
    setAddingSubjectModalOpen(true);
  };

  const isSubjectAlreadyInSection = (subId) =>
    sectionSubjects.some(secSub => Number(secSub.subject_id) === Number(subId));

  const toggleSubjectSelection = (subId) => {
    if (isSubjectAlreadyInSection(subId)) return;
    setSelectedSubjectIds(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const handleAddSubjectSubmit = async (e) => {
    e?.preventDefault();
    const ids = Array.from(selectedSubjectIds);
    if (!ids.length || subjectActionBusy) return;
    setSubjectActionBusy(true);
    setSubjectError("");
    try {
      await addSectionSubject(section.id, { subject_ids: ids });
      setSelectedSubjectIds(new Set());
      setAddingSubjectModalOpen(false);
      await loadSectionSubjects();
    } catch (err) {
      setSubjectError(err.message || "Failed to add subject(s).");
    } finally {
      setSubjectActionBusy(false);
    }
  };

  const handleAutoAssign = async () => {
    if (subjectActionBusy) return;
    setSubjectActionBusy(true);
    setSubjectError("");
    try {
      await autoAssignSectionSubjects(section.id);
      await loadSectionSubjects();
    } catch (err) {
      setSubjectError(err.message || "Failed to auto-assign subjects.");
    } finally {
      setSubjectActionBusy(false);
    }
  };

  const handleConfirmRemoveSubject = async () => {
    if (!pendingSubjectRemoval || subjectActionBusy) return;
    setSubjectActionBusy(true);
    setSubjectError("");
    try {
      await removeSectionSubject(section.id, pendingSubjectRemoval.subject_offering_id);
      setPendingSubjectRemoval(null);
      await loadSectionSubjects();
    } catch (err) {
      setSubjectError(err.message || "Failed to remove subject.");
    } finally {
      setSubjectActionBusy(false);
    }
  };

  const filteredCatalogSubjects = subjectCatalog.filter(sub => {
    const alreadyIn = isSubjectAlreadyInSection(sub.subject_id);
    if (pickerFilter === "available" && alreadyIn) return false;
    if (pickerFilter === "core" && (sub.is_specialized || (sub.program_id && sub.program_id !== 4))) return false;
    if (pickerFilter === "specialized" && !sub.is_specialized && (!sub.program_id || sub.program_id === 4)) return false;

    if (!pickerSearch.trim()) return true;
    const q = pickerSearch.toLowerCase().trim();
    return (
      (sub.subject_code || "").toLowerCase().includes(q) ||
      (sub.subject_name || "").toLowerCase().includes(q) ||
      (sub.program_code || "").toLowerCase().includes(q) ||
      (sub.description || "").toLowerCase().includes(q)
    );
  });

  const filteredSubjects = sectionSubjects.filter(sub =>
    `${sub.subject_code} ${sub.subject_name} ${sub.teacher_name || ""}`.toLowerCase().includes(subjectSearch.toLowerCase().trim())
  );

  return (
    <OverlayPanel
      isOpen={isOpen}
      onClose={onClose}
      title={section?.name || "Manage section"}
      eyebrow="Section workspace"
      description={section && `${formatSectionGrade(section.level, section.grade_level_id)} · Section details, subjects, and student membership`}
      className="section-management-drawer"
      busy={busy || subjectActionBusy}
      error={error || subjectError}
      notification={notification}
      footer={<>
        {view === "details" ? (
          <>
            <button type="button" className="student-admin-button" onClick={onClose} disabled={busy}>Close</button>
            <button type="submit" form="section-details-form" className="student-admin-button student-admin-button--primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </>
        ) : view === "add" ? (
          <>
            <span className="section-drawer-selection" role={addingTarget ? "status" : undefined}>
              {addingTarget ? (addingTarget.ids.length === 1 ? "Adding student…" : "Adding students…") : `${selectedIds.length} selected`}
            </span>
            <button type="button" className="student-admin-button" disabled={busy || !selectedIds.length} onClick={() => setSelected(new Set())}>Clear</button>
            <button type="button" className="student-admin-button student-admin-button--primary" aria-busy={Boolean(addingTarget?.bulk)} disabled={busy || !selectedIds.length} onClick={async () => {
              if (await addStudents(selectedIds, true)) setSelected(new Set());
            }}>
              {addingTarget?.bulk ? <Loader2 size={15} className="student-admin-spinner" aria-hidden="true" /> : <Plus size={15} />}
              {addingTarget?.bulk ? "Adding…" : "Add selected"}
            </button>
          </>
        ) : (
          <button type="button" className="student-admin-button" onClick={onClose} disabled={busy || subjectActionBusy}>Done</button>
        )}
      </>}
    >
      <SectionCapacity count={members.length} />
      <SegmentedControl
        label="Section workspace"
        value={view}
        onChange={changeView}
        disabled={busy || subjectActionBusy}
        options={[
          { value: "details", label: "Details", icon: Settings2 },
          { value: "subjects", label: `Subjects (${sectionSubjects.length})`, icon: BookOpen },
          { value: "add", label: "Add students", icon: UserPlus },
          { value: "remove", label: "Current students", icon: Users },
        ]}
      />
      <div className="section-drawer-content" key={view}>
        {view === "details" ? (
          <>
            <section className="student-admin-form-section">
              <h3>Section details</h3>
              <p>Update the name, grade level, or curriculum below.</p>
              <form id="section-details-form" onSubmit={onSave}>
                <SectionFormFields value={form} onChange={setForm} gradeLevels={gradeLevels} disabled={busy} />
              </form>
            </section>
            <section className="student-admin-danger-zone">
              <h3>Remove section</h3>
              <p>Review the section and its students before removing it.</p>
              <button type="button" className="student-admin-button student-admin-button--danger" disabled={busy} onClick={onDelete}>
                <Trash2 size={14} />Remove section
              </button>
            </section>
          </>
        ) : view === "subjects" ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 className="student-admin-subheading">Curriculum subjects ({sectionSubjects.length})</h3>
                <p className="student-admin-hint">Subjects offered for this section in the active school year.</p>
              </div>
              {sectionSubjects.length > 0 && (
                <button
                  type="button"
                  className="student-admin-button student-admin-button--primary"
                  onClick={openAddSubjectModal}
                  disabled={busy || subjectActionBusy}
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  <Plus size={15} /> Add Subject
                </button>
              )}
            </div>

            {sectionSubjects.length > 0 && (
              <div className="student-admin-toolbar section-drawer-search">
                <SearchBar
                  query={subjectSearch}
                  setQuery={setSubjectSearch}
                  placeholder="Search subject by code, name, or teacher…"
                />
              </div>
            )}

            {loadingSubjects ? (
              <div className="section-student-list" style={{ padding: "20px 0", textAlign: "center" }}>
                <Loader2 size={24} className="student-admin-spinner" style={{ margin: "0 auto" }} />
                <p className="student-admin-hint" style={{ marginTop: 8 }}>Loading subjects…</p>
              </div>
            ) : sectionSubjects.length === 0 ? (
              <>
                <EmptyState
                  className="student-admin-empty"
                  icon={BookOpen}
                  title="No subjects offered yet"
                  description="This section does not have subjects attached for the active school year. You can auto-assign the standard curriculum or add individual subjects."
                />
                <div className="section-subject-empty-actions">
                  <button
                    type="button"
                    className="student-admin-button student-admin-button--primary"
                    onClick={handleAutoAssign}
                    disabled={busy || subjectActionBusy}
                  >
                    {subjectActionBusy ? <Loader2 size={15} className="student-admin-spinner" /> : <Sparkles size={15} />}
                    Auto-Assign Curriculum Subjects
                  </button>
                  <button
                    type="button"
                    className="student-admin-button"
                    onClick={openAddSubjectModal}
                    disabled={busy || subjectActionBusy}
                  >
                    <Plus size={15} /> Add Custom Subject
                  </button>
                </div>
              </>
            ) : !filteredSubjects.length ? (
              <EmptyState
                className="student-admin-empty"
                icon={BookOpen}
                title="No matching subjects"
                description={subjectSearch ? "Try another subject code or name." : "No subjects found."}
              />
            ) : (
              <div className="section-student-list">
                {filteredSubjects.map(sub => (
                  <div className="section-subject-row" key={sub.subject_offering_id}>
                    <div className="section-subject-info">
                      <div className="section-subject-title-row">
                        <span className="section-subject-code">{sub.subject_code}</span>
                        <span className="section-subject-name">{sub.subject_name}</span>
                      </div>
                      <div className="section-subject-meta">
                        {sub.teacher_name ? (
                          <span className="section-teacher-badge section-teacher-badge--assigned">
                            <CheckCircle2 size={12} /> Teacher: {sub.teacher_name}
                          </span>
                        ) : (
                          <span className="section-teacher-badge section-teacher-badge--unassigned">
                            ⚠️ No teacher assigned
                          </span>
                        )}
                        <span>· {sub.program_code || "EBEC"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="student-admin-icon-button student-admin-icon-button--danger"
                      title={`Remove ${sub.subject_name}`}
                      aria-label={`Remove ${sub.subject_name}`}
                      disabled={busy || subjectActionBusy}
                      onClick={() => setPendingSubjectRemoval(sub)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h3 className="student-admin-subheading">{view === "add" ? "Add students" : `Current students (${members.length})`}</h3>
            <p className="student-admin-hint">{view === "add" ? "Unassigned students matching this section’s grade and program rules." : "Removing a student unassigns the section; it does not delete the student’s profile."}</p>
            <div className="student-admin-toolbar section-drawer-search">
              <SearchBar query={search} setQuery={value => {
                setSearch(value);
                setPage(1);
              }} placeholder="Search name or LRN…" />
            </div>
            {view === "add" && shown.length > 0 && (
              <label className="student-admin-check section-select-page">
                <input type="checkbox" aria-label="Select all students on this drawer page" disabled={busy} checked={shown.every(student => selected.has(student.id))} onChange={() => setSelected(previous => {
                  const next = new Set(previous);
                  const all = shown.every(student => next.has(student.id));
                  shown.forEach(student => all ? next.delete(student.id) : next.add(student.id));
                  return next;
                })} />Select this page
              </label>
            )}
            <div className="section-student-list">
              {shown.map(student => (
                <div className="section-student-row" key={student.id}>
                  {view === "add" && <input type="checkbox" aria-label={`Select ${student.name}`} checked={selected.has(student.id)} onChange={() => toggle(student.id)} disabled={busy} />}
                  <div><strong>{student.name}</strong><small>LRN {student.masked_lrn || maskLrn(student.lrn)} · {student.program_code || "EBEC"}</small></div>
                  {view === "add" ? (
                    <button type="button" className="student-admin-icon-button student-admin-icon-button--primary" aria-label={`Add ${student.name}`} aria-busy={Boolean(addingTarget?.ids.includes(student.id))} disabled={busy} onClick={() => addStudents([student.id])}>
                      {addingTarget?.ids.includes(student.id) ? <Loader2 size={16} className="student-admin-spinner" aria-hidden="true" /> : <Plus size={16} />}
                    </button>
                  ) : (
                    <button type="button" className="student-admin-icon-button student-admin-icon-button--danger" aria-label={`Remove ${student.name}`} disabled={busy} onClick={() => setPendingRemoval(student)}>
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!shown.length && (
              <EmptyState
                className="student-admin-empty"
                icon={Users}
                title={view === "add" ? "No eligible students found" : "No students found"}
                description={search ? "Try another name or LRN." : view === "add" ? "All eligible students may already have a section." : "This section has no assigned students."}
              />
            )}
            {filtered.length > 4 && <TablePagination page={currentPage} pageSize={4} total={filtered.length} onPageChange={setPage} />}
          </>
        )}
      </div>

      {/* Remove Student Modal */}
      <OverlayPanel
        isOpen={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        variant="modal"
        title="Remove student from section?"
        busy={busy}
        error={error}
        description="The student’s profile and academic records will be kept."
        footer={<>
          <button type="button" className="student-admin-button" disabled={busy} onClick={() => setPendingRemoval(null)}>Cancel</button>
          <button type="button" className="student-admin-button student-admin-button--danger" disabled={busy} onClick={async () => {
            if (await onRemove(pendingRemoval)) setPendingRemoval(null);
          }}>Remove student</button>
        </>}
      >
        <p className="student-admin-form-note"><strong>{pendingRemoval?.name}</strong> will be unassigned from {section?.name}.</p>
      </OverlayPanel>

      {/* Add Subject Modal */}
      <OverlayPanel
        isOpen={addingSubjectModalOpen}
        onClose={() => setAddingSubjectModalOpen(false)}
        variant="modal"
        title="Add Subjects to Section"
        eyebrow="Curriculum catalog"
        className="add-subject-modal"
        busy={subjectActionBusy}
        error={subjectError}
        description={`Choose subjects from the catalog to offer in ${section?.name || "this section"}.`}
        footer={<>
          <button
            type="button"
            className="student-admin-button"
            disabled={subjectActionBusy}
            onClick={() => setAddingSubjectModalOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="student-admin-button student-admin-button--primary"
            disabled={subjectActionBusy || selectedSubjectIds.size === 0}
            onClick={handleAddSubjectSubmit}
          >
            {subjectActionBusy ? (
              <>
                <Loader2 size={15} className="student-admin-spinner" />
                Adding…
              </>
            ) : (
              <>
                <Plus size={15} />
                {selectedSubjectIds.size === 0
                  ? "Select subject(s)"
                  : selectedSubjectIds.size === 1
                  ? "Add 1 Subject"
                  : `Add ${selectedSubjectIds.size} Subjects`}
              </>
            )}
          </button>
        </>}
      >
        <div className="add-subject-picker">
          <div className="add-subject-toolbar">
            <SearchBar
              id="picker-subject-search"
              query={pickerSearch}
              setQuery={setPickerSearch}
              placeholder="Search by code, subject name, or program…"
            />
            <div className="add-subject-filter-chips">
              {[
                { id: "available", label: `Available (${subjectCatalog.filter(s => !isSubjectAlreadyInSection(s.subject_id)).length})` },
                { id: "all", label: `All catalog (${subjectCatalog.length})` },
                { id: "core", label: "Core (EBEC)" },
                { id: "specialized", label: "Specialized" },
              ].map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  className={`add-subject-chip ${pickerFilter === chip.id ? "is-active" : ""}`}
                  onClick={() => setPickerFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="add-subject-cards-list">
            {filteredCatalogSubjects.length === 0 ? (
              <EmptyState
                className="student-admin-empty"
                icon={BookOpen}
                title="No subjects match your filter"
                description={pickerSearch ? "Try a different search term or filter chip." : "All matching subjects are already in this section."}
              />
            ) : (
              filteredCatalogSubjects.map(sub => {
                const alreadyIn = isSubjectAlreadyInSection(sub.subject_id);
                const isSelected = selectedSubjectIds.has(sub.subject_id);
                return (
                  <div
                    key={sub.subject_id}
                    className={`add-subject-card ${alreadyIn ? "is-disabled" : ""} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => toggleSubjectSelection(sub.subject_id)}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-disabled={alreadyIn}
                  >
                    <div className="add-subject-card-left">
                      <span className="add-subject-card-badge">{sub.subject_code}</span>
                      <div className="add-subject-card-body">
                        <div className="add-subject-card-title">
                          <span>{sub.subject_name}</span>
                          {sub.program_code && (
                            <span className="add-subject-card-program">{sub.program_code}</span>
                          )}
                        </div>
                        {sub.description && (
                          <span className="add-subject-card-desc">{sub.description}</span>
                        )}
                      </div>
                    </div>

                    <div className="add-subject-card-status">
                      {alreadyIn ? (
                        <span className="add-subject-already-added">
                          <CheckCircle2 size={12} /> In Section
                        </span>
                      ) : (
                        <span className="add-subject-checkbox">
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </OverlayPanel>

      {/* Remove Subject Modal */}
      <OverlayPanel
        isOpen={Boolean(pendingSubjectRemoval)}
        onClose={() => setPendingSubjectRemoval(null)}
        variant="modal"
        title="Remove subject from section?"
        busy={subjectActionBusy}
        error={subjectError}
        description="This removes the subject offering from this section. It cannot be undone if grades already exist."
        footer={<>
          <button type="button" className="student-admin-button" disabled={subjectActionBusy} onClick={() => setPendingSubjectRemoval(null)}>Cancel</button>
          <button
            type="button"
            className="student-admin-button student-admin-button--danger"
            disabled={subjectActionBusy}
            onClick={handleConfirmRemoveSubject}
          >
            {subjectActionBusy ? "Removing…" : "Remove subject"}
          </button>
        </>}
      >
        <p className="student-admin-form-note">
          Are you sure you want to remove <strong>{pendingSubjectRemoval?.subject_code} - {pendingSubjectRemoval?.subject_name}</strong> from {section?.name}?
          {pendingSubjectRemoval?.teacher_name && (
            <span style={{ display: "block", marginTop: 6, color: "#dc2626" }}>
              Note: This will also unassign teacher <strong>{pendingSubjectRemoval.teacher_name}</strong> from this subject.
            </span>
          )}
        </p>
      </OverlayPanel>
    </OverlayPanel>
  );
}

