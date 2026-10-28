import { useEffect, useMemo, useState } from "react";
import { Plus, Users, Eye, Settings2, LayoutGrid, UserPlus, AlertCircle, Trash2, Loader2, BookOpen, CheckCircle2, Check } from "lucide-react";
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
import SectionCard from "../../components/sections/SectionCard";
import SectionFormFields from "./student-sections/SectionFormFields";
import SectionManagementDrawer from "./student-sections/SectionManagementDrawer";
import StudentSelectionTray from "./student-sections/StudentSelectionTray";
import { formatSectionGrade, sectionProgram } from "../../utils/studentSections";
import {
  fetchSections,
  fetchGradeLevels,
  fetchStudents,
  fetchStudentSections,
  createSection,
  updateSection,
  deleteSection,
  bulkAssignStudents,
  unassignStudent,
  fetchAllGradeLevelSubjects,
  addGradeLevelSubjects,
  dropGradeLevelSubject,
  fetchSubjectCatalog,
} from "../../services/studentSectionService";
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
  const [sectionRows, gradeRows, studentRows, enrollmentRows, gradeSubjectRows] = await Promise.all([
    fetchSections(),
    fetchGradeLevels(),
    fetchStudents(),
    fetchStudentSections(),
    fetchAllGradeLevelSubjects().catch(() => []),
  ]);

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
    gradeLevels,
    gradeSubjects: gradeSubjectRows || []
  };
}

export default function StudentSectionManagement() {
  const query = useCachedQuery(cacheKey("admin:sections"), loadSectionCatalog);
  const [mutationCatalog, setMutationCatalog] = useState(null);
  const catalog = query.data ?? mutationCatalog;
  const loading = query.loading && !catalog;

  const sections = catalog?.sections || EMPTY_LIST;
  const students = catalog?.students || EMPTY_LIST;
  const gradeLevels = catalog?.gradeLevels || DEFAULT_GRADES;
  const gradeSubjects = catalog?.gradeSubjects || EMPTY_LIST;

  const [view, setView] = useState("sections"); // "sections" | "subjects" | "assign"

  // Sections view filters
  const [levelFilter, setLevelFilter] = useState("all");
  const [sectionSearch, setSectionSearch] = useState("");

  // Manage Subjects view filters & states
  const [subjectLevelFilter, setSubjectLevelFilter] = useState("all");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectCatalog, setSubjectCatalog] = useState([]);

  // Add Subject Modal state
  const [addSubjectModalOpen, setAddSubjectModalOpen] = useState(false);
  const [addSubjectGradeId, setAddSubjectGradeId] = useState("");
  const [addSubjectTarget, setAddSubjectTarget] = useState("all");
  const [addSubjectSearch, setAddSubjectSearch] = useState("");
  const [selectedCatalogSubjectIds, setSelectedCatalogSubjectIds] = useState(new Set());
  const [addSubjectBusy, setAddSubjectBusy] = useState(false);
  const [addSubjectError, setAddSubjectError] = useState("");

  // Drop Subject confirmation state
  const [pendingDropSubject, setPendingDropSubject] = useState(null);
  const [dropSubjectBusy, setDropSubjectBusy] = useState(false);
  const [dropSubjectError, setDropSubjectError] = useState("");

  // Assign Students view filters & states
  const [studentSearch, setStudentSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // General states
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(() => blankSection(DEFAULT_GRADES[0]));
  const [drawerSection, setDrawerSection] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("details");
  const [drawerVersion, setDrawerVersion] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Student Assignment Modal state (Requirement 2)
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentIds, setAssignmentIds] = useState([]);
  const [assignmentGradeId, setAssignmentGradeId] = useState("");
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

  // Filtered lists
  const filteredSections = useMemo(() => {
    return sections.filter(section =>
      (levelFilter === "all" || String(section.grade_level_id) === levelFilter) &&
      section.name.toLowerCase().includes(sectionSearch.toLowerCase().trim())
    );
  }, [sections, levelFilter, sectionSearch]);

  const filteredGradeSubjects = useMemo(() => {
    return gradeSubjects.filter(sub => {
      const matchesLevel = subjectLevelFilter === "all" || String(sub.grade_level_id) === String(subjectLevelFilter);
      if (!matchesLevel) return false;
      if (!subjectSearch.trim()) return true;
      const q = subjectSearch.toLowerCase().trim();
      return (
        (sub.subject_code || "").toLowerCase().includes(q) ||
        (sub.subject_name || "").toLowerCase().includes(q) ||
        (sub.program_code || "").toLowerCase().includes(q) ||
        (sub.section_names || "").toLowerCase().includes(q)
      );
    });
  }, [gradeSubjects, subjectLevelFilter, subjectSearch]);

  const filteredStudents = useMemo(() => {
    return students.filter(student =>
      `${student.name} ${student.lrn} ${student.masked_lrn || ""}`.toLowerCase().includes(studentSearch.toLowerCase().trim()) &&
      (sectionFilter === "all" || (sectionFilter === "unassigned" ? !student.section_id : String(student.section_id) === sectionFilter)) &&
      (assignmentFilter === "all" || Boolean(student.section_id) === (assignmentFilter === "assigned"))
    );
  }, [students, studentSearch, sectionFilter, assignmentFilter]);

  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredStudents.length / 10)));
  const pageStudents = filteredStudents.slice((currentPage - 1) * 10, currentPage * 10);
  const selectedStudents = students.filter(student => selectedIds.has(student.id));
  const targetSection = sections.find(section => section.id === drawerSection?.id) || drawerSection;
  const assignmentStudents = students.filter(student => assignmentIds.includes(student.id));

  // Requirement 2: Filter assignment sections by selected grade level
  const assignmentSections = useMemo(() => {
    if (!assignmentGradeId) return [];
    return sections
      .filter(section => String(section.grade_level_id) === String(assignmentGradeId))
      .filter(section => `${section.name} ${formatSectionGrade(section.level, section.grade_level_id)} ${sectionProgram(section)?.code || "Regular Class"}`.toLowerCase().includes(assignmentSearch.toLowerCase().trim()));
  }, [sections, assignmentGradeId, assignmentSearch]);

  const countMembers = id => students.filter(student => Number(student.section_id) === Number(id)).length;

  const toggleStudent = id => setSelectedIds(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
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
    const assignedStudents = students.filter(s => ids.includes(s.id));
    const firstGrade = assignedStudents.length === 1 && assignedStudents[0].grade_level_id
      ? String(assignedStudents[0].grade_level_id)
      : "";
    setAssignmentGradeId(firstGrade);
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

  // Manage Subjects: Add Subject Modal flow
  const openAddSubjectModal = async () => {
    const defaultGrade = subjectLevelFilter !== "all" ? subjectLevelFilter : String(gradeLevels[0]?.id || 1);
    setAddSubjectGradeId(defaultGrade);
    setAddSubjectTarget("all");
    setAddSubjectSearch("");
    setSelectedCatalogSubjectIds(new Set());
    setAddSubjectError("");
    setAddSubjectModalOpen(true);

    if (!subjectCatalog.length) {
      try {
        const cat = await fetchSubjectCatalog();
        setSubjectCatalog(cat);
      } catch (e) {
        console.warn("Failed to load subject catalog:", e);
      }
    }
  };

  // Target sections for Add Subject modal
  const targetGradeSections = useMemo(() => {
    if (!addSubjectGradeId) return [];
    return sections.filter(sec => String(sec.grade_level_id) === String(addSubjectGradeId));
  }, [sections, addSubjectGradeId]);

  const regularTargetSections = useMemo(() => {
    return targetGradeSections.filter(sec => !sec.is_specialized);
  }, [targetGradeSections]);

  const specializedTargetSections = useMemo(() => {
    return targetGradeSections.filter(sec => Boolean(sec.is_specialized));
  }, [targetGradeSections]);

  const selectedSpecificSection = useMemo(() => {
    if (addSubjectTarget.startsWith("section:")) {
      const secId = Number(addSubjectTarget.replace("section:", ""));
      return sections.find(s => Number(s.id) === secId) || null;
    }
    return null;
  }, [sections, addSubjectTarget]);

  // Existing offerings map: subject_id -> Set of section_ids
  const existingOfferingsMap = useMemo(() => {
    const map = new Map();
    gradeSubjects
      .filter(sub => String(sub.grade_level_id) === String(addSubjectGradeId))
      .forEach(sub => {
        const secIds = String(sub.section_ids || "")
          .split(",")
          .map(id => Number(id.trim()))
          .filter(Boolean);
        map.set(Number(sub.subject_id), new Set(secIds));
      });
    return map;
  }, [gradeSubjects, addSubjectGradeId]);

  // Filter catalog subjects: Requirement 1 + Duplicate prevention
  const filteredDisplayCatalogSubjects = useMemo(() => {
    return subjectCatalog
      .filter(sub => {
        const isSubSpec = Boolean(sub.is_specialized || (sub.program_id && sub.program_id !== 4));
        const subProgId = Number(sub.program_id);

        // Requirement 1: Specialized filtering
        if (selectedSpecificSection) {
          const isSecSpec = Boolean(selectedSpecificSection.is_specialized);
          const secProgId = Number(selectedSpecificSection.program_id);
          if (!isSecSpec && isSubSpec) return false;
          if (isSecSpec && !isSubSpec) return false;
          if (isSecSpec && subProgId && subProgId !== 4 && subProgId !== secProgId) return false;
        } else if (addSubjectTarget === "regular") {
          if (isSubSpec) return false;
        } else if (addSubjectTarget === "specialized") {
          if (!isSubSpec) return false;
        } else if (addSubjectTarget === "all") {
          if (isSubSpec) return false;
        }

        if (!addSubjectSearch.trim()) return true;
        const q = addSubjectSearch.toLowerCase().trim();
        return (
          (sub.subject_code || "").toLowerCase().includes(q) ||
          (sub.subject_name || "").toLowerCase().includes(q) ||
          (sub.program_code || "").toLowerCase().includes(q) ||
          (sub.description || "").toLowerCase().includes(q)
        );
      })
      .map(sub => {
        const offeredSet = existingOfferingsMap.get(Number(sub.subject_id)) || new Set();
        let isAlreadyPresent = false;

        if (selectedSpecificSection) {
          isAlreadyPresent = offeredSet.has(Number(selectedSpecificSection.id));
        } else if (addSubjectTarget === "regular") {
          isAlreadyPresent = regularTargetSections.length > 0 && regularTargetSections.every(sec => offeredSet.has(Number(sec.id)));
        } else if (addSubjectTarget === "specialized") {
          isAlreadyPresent = specializedTargetSections.length > 0 && specializedTargetSections.every(sec => offeredSet.has(Number(sec.id)));
        } else if (addSubjectTarget === "all") {
          isAlreadyPresent = targetGradeSections.length > 0 && targetGradeSections.every(sec => offeredSet.has(Number(sec.id)));
        }

        return {
          ...sub,
          isAlreadyPresent,
        };
      });
  }, [
    subjectCatalog,
    selectedSpecificSection,
    addSubjectTarget,
    addSubjectSearch,
    existingOfferingsMap,
    regularTargetSections,
    specializedTargetSections,
    targetGradeSections,
  ]);

  const handleAddSubjectSubmit = async () => {
    if (!addSubjectGradeId || !selectedCatalogSubjectIds.size || addSubjectBusy) return;
    setAddSubjectBusy(true);
    setAddSubjectError("");
    try {
      const sectionId = addSubjectTarget.startsWith("section:")
        ? Number(addSubjectTarget.replace("section:", ""))
        : null;
      const sectionType = sectionId ? "all" : addSubjectTarget;

      const res = await addGradeLevelSubjects(addSubjectGradeId, {
        subject_ids: Array.from(selectedCatalogSubjectIds),
        section_id: sectionId,
        section_type: sectionType,
      });

      setAddSubjectModalOpen(false);
      setSelectedCatalogSubjectIds(new Set());
      setToast({
        message: res.message || "Subjects added successfully.",
        type: "success",
      });
      await query.refresh();
    } catch (err) {
      setAddSubjectError(err.message || "Failed to add subjects.");
    } finally {
      setAddSubjectBusy(false);
    }
  };

  const handleConfirmDropSubject = async () => {
    if (!pendingDropSubject || dropSubjectBusy) return;
    setDropSubjectBusy(true);
    setDropSubjectError("");
    try {
      const res = await dropGradeLevelSubject(pendingDropSubject.grade_level_id, pendingDropSubject.subject_id, {
        section_type: "all",
      });
      setPendingDropSubject(null);
      setToast({
        message: res.message || "Subject dropped successfully.",
        type: "success",
      });
      await query.refresh();
    } catch (err) {
      setDropSubjectError(err.message || "Failed to drop subject.");
    } finally {
      setDropSubjectBusy(false);
    }
  };

  return (
    <div className={`student-admin-page section-management-page ${view === "assign" && selectedStudents.length ? "has-selection" : ""}`}>
      <header className="student-admin-header">
        <div>
          <h1>Student Sections</h1>
          <p>Organize sections, allocate subjects, and manage student assignments in one place.</p>
        </div>
        <SegmentedControl
          label="Section page view"
          value={view}
          onChange={setView}
          options={[
            {
              value: "sections",
              label: "Manage Sections",
              icon: LayoutGrid
            },
            {
              value: "subjects",
              label: "Manage Subjects",
              icon: BookOpen
            },
            {
              value: "assign",
              label: "Assign Students",
              icon: UserPlus
            }
          ]}
        />
      </header>

      <section className="student-admin-panel">
        <div className="student-admin-panel-heading">
          <div>
            <h2>
              {view === "sections" && "Manage sections"}
              {view === "subjects" && "Manage subjects"}
              {view === "assign" && "Assign students"}
            </h2>
            <p>
              {view === "sections" && "A clear view of each section’s program and class size."}
              {view === "subjects" && "Curriculum subjects assigned to each grade level and program."}
              {view === "assign" && "Select learners, review your selection, then assign a section."}
            </p>
          </div>
          <span className="student-admin-count">
            {view === "sections" && `${filteredSections.length} ${filteredSections.length === 1 ? "section" : "sections"}`}
            {view === "subjects" && `${filteredGradeSubjects.length} ${filteredGradeSubjects.length === 1 ? "subject" : "subjects"}`}
            {view === "assign" && `${filteredStudents.length} ${filteredStudents.length === 1 ? "student" : "students"}`}
          </span>
        </div>

        {view === "sections" ? (
          <>
            <div className="student-admin-toolbar">
              <DropdownSelect
                label="Grade level"
                value={levelFilter}
                options={[
                  {
                    value: "all",
                    label: "All levels"
                  },
                  ...gradeLevels.map(grade => ({
                    value: String(grade.id),
                    label: grade.label
                  }))
                ]}
                onChange={setLevelFilter}
              />
              <SearchBar query={sectionSearch} setQuery={setSectionSearch} placeholder="Search sections by name…" />
              <button type="button" className="student-admin-button student-admin-button--primary" onClick={openCreate}>
                <Plus size={17} />Create Section
              </button>
            </div>

            {loading ? (
              <div className="section-card-grid" role="status" aria-label="Loading sections">
                {[1, 2, 3, 4, 5, 6].map(id => <div className="section-card section-card--skeleton student-admin-loading" key={id} />)}
              </div>
            ) : query.error ? (
              <div className="student-admin-empty">
                <EmptyState icon={AlertCircle} title="Sections are unavailable" description={query.error} />
                <button type="button" className="student-admin-button" onClick={query.refresh}>Retry</button>
              </div>
            ) : !filteredSections.length ? (
              <EmptyState className="student-admin-empty" icon={LayoutGrid} title="No sections found" description="Try another search or create a section to get started." />
            ) : (
              <div className="section-card-grid">
                {filteredSections.map(section => {
                  const program = sectionProgram(section);
                  const count = countMembers(section.id);
                  return (
                    <SectionCard
                      key={section.id}
                      name={section.name}
                      ariaLabel={`${section.name}, ${formatSectionGrade(section.level, section.grade_level_id)}`}
                      grade={formatSectionGrade(section.level, section.grade_level_id).replace("Grade ", "G")}
                      gradeId={section.grade_level_id}
                      program={program ? `Special Program - ${program.code}` : "Regular Class"}
                      count={count}
                      actions={
                        <>
                          <button type="button" className="student-admin-button" aria-label={`Manage ${section.name}`} onClick={() => openDrawer(section)}>
                            <Settings2 size={16} />Manage
                          </button>
                          <button
                            type="button"
                            className="student-admin-button"
                            aria-label={`View students in ${section.name}`}
                            onClick={() => {
                              setSectionFilter(String(section.id));
                              setAssignmentFilter("all");
                              setStudentSearch("");
                              setPage(1);
                              setView("assign");
                            }}
                          >
                            <Eye size={16} />View
                          </button>
                          <button
                            type="button"
                            className="student-admin-icon-button student-admin-icon-button--danger"
                            title="Delete section"
                            aria-label={`Delete section ${section.name}`}
                            onClick={() => {
                              setToast(null);
                              setDrawerSection(section);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      }
                    >
                      <SectionCapacity count={count} />
                    </SectionCard>
                  );
                })}
              </div>
            )}
          </>
        ) : view === "subjects" ? (
          <>
            <div className="student-admin-toolbar">
              <DropdownSelect
                label="Grade level"
                value={subjectLevelFilter}
                options={[
                  {
                    value: "all",
                    label: "All levels"
                  },
                  ...gradeLevels.map(grade => ({
                    value: String(grade.id),
                    label: grade.label
                  }))
                ]}
                onChange={setSubjectLevelFilter}
              />
              <SearchBar query={subjectSearch} setQuery={setSubjectSearch} placeholder="Search subjects by name, code, or program…" />
              <button type="button" className="student-admin-button student-admin-button--primary" onClick={openAddSubjectModal}>
                <Plus size={17} />Add Subject to Grade
              </button>
            </div>

            {loading ? (
              <div className="section-card-grid" role="status" aria-label="Loading subjects">
                {[1, 2, 3, 4, 5, 6].map(id => <div className="section-card section-card--skeleton student-admin-loading" key={id} />)}
              </div>
            ) : query.error ? (
              <div className="student-admin-empty">
                <EmptyState icon={AlertCircle} title="Subjects are unavailable" description={query.error} />
                <button type="button" className="student-admin-button" onClick={query.refresh}>Retry</button>
              </div>
            ) : !filteredGradeSubjects.length ? (
              <EmptyState
                className="student-admin-empty"
                icon={BookOpen}
                title="No subjects found"
                description="No subjects found for this grade level. Click 'Add Subject to Grade' to add curriculum subjects."
              />
            ) : (
              <div className="section-card-grid">
                {filteredGradeSubjects.map(sub => {
                  const gradeId = sub.grade_level_id;
                  const gradeName = sub.grade_level_name || `G${gradeId + 6}`;
                  const isSpecialized = Boolean(sub.is_specialized || (sub.program_id && sub.program_id !== 4));
                  const progCode = sub.program_code || (isSpecialized ? "Specialized" : "EBEC");
                  const offeringCount = Number(sub.offering_count || 0);

                  return (
                    <article
                      key={`${sub.grade_level_id}-${sub.subject_id}`}
                      className="section-card subject-card"
                      aria-label={`${sub.subject_name}, ${formatSectionGrade(gradeName, gradeId)}`}
                    >
                      <div className="section-card__heading">
                        <div>
                          <h3 title={sub.subject_name}>{sub.subject_name}</h3>
                          <span className="subject-card-code-badge">{sub.subject_code}</span>
                        </div>
                        <span className="section-card__grade" data-grade-level={gradeId}>
                          {formatSectionGrade(gradeName, gradeId).replace("Grade ", "G")}
                        </span>
                      </div>
                      <p className="section-card__program">
                        {isSpecialized ? `Special Program - ${progCode}` : `Core Curriculum (${progCode})`}
                      </p>
                      <div className="subject-card-offering">
                        <div className="subject-card-offering-header">
                          <Users size={14} />
                          <span>
                            Offered in <strong>{offeringCount} {offeringCount === 1 ? "Section" : "Sections"}</strong>
                          </span>
                        </div>
                        {sub.section_names && (
                          <p className="subject-card-sections-list" title={sub.section_names}>
                            {sub.section_names}
                          </p>
                        )}
                      </div>
                      <div className="section-card__actions">
                        <button
                          type="button"
                          className="student-admin-button student-admin-button--danger"
                          aria-label={`Drop ${sub.subject_name} from ${formatSectionGrade(gradeName, gradeId)}`}
                          onClick={() => setPendingDropSubject(sub)}
                        >
                          <Trash2 size={16} />Drop from Grade
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="student-admin-toolbar">
              <SearchBar
                query={studentSearch}
                setQuery={value => {
                  setStudentSearch(value);
                  setPage(1);
                }}
                placeholder="Search student name or LRN…"
              />
              <DropdownSelect
                label="Section"
                value={sectionFilter}
                options={[
                  {
                    value: "all",
                    label: "All sections"
                  },
                  {
                    value: "unassigned",
                    label: "Unassigned"
                  },
                  ...sections.map(section => ({
                    value: String(section.id),
                    label: `${section.name} · ${formatSectionGrade(section.level, section.grade_level_id)}`
                  }))
                ]}
                onChange={value => {
                  setSectionFilter(value);
                  setPage(1);
                }}
              />
              <DropdownSelect
                label="Assignment"
                value={assignmentFilter}
                options={[
                  {
                    value: "all",
                    label: "All students"
                  },
                  {
                    value: "assigned",
                    label: "Assigned"
                  },
                  {
                    value: "unassigned",
                    label: "Unassigned"
                  }
                ]}
                onChange={value => {
                  setAssignmentFilter(value);
                  setPage(1);
                }}
              />
            </div>

            {loading ? (
              <EmptyState className="student-admin-empty student-admin-loading" icon={Users} title="Loading students…" />
            ) : query.error ? (
              <div className="student-admin-empty">
                <EmptyState icon={AlertCircle} title="Students are unavailable" description={query.error} />
                <button type="button" className="student-admin-button" onClick={query.refresh}>Retry</button>
              </div>
            ) : !filteredStudents.length ? (
              <EmptyState className="student-admin-empty" icon={Users} title="No students found" description="Try changing the section, assignment filter, or search." />
            ) : (
              <>
                <div className="student-admin-table-scroll">
                  <table className="student-admin-table section-assignment-table">
                    <colgroup>
                      <col style={{ width: "4%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "8%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "19%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label="Select all students on this page"
                            checked={pageStudents.length > 0 && pageStudents.every(student => selectedIds.has(student.id))}
                            onChange={() => setSelectedIds(previous => {
                              const next = new Set(previous);
                              const all = pageStudents.every(student => next.has(student.id));
                              pageStudents.forEach(student => all ? next.delete(student.id) : next.add(student.id));
                              return next;
                            })}
                          />
                        </th>
                        <th>Student name</th>
                        <th>LRN</th>
                        <th>Grade level</th>
                        <th>Section</th>
                        <th>Program</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageStudents.map(student => (
                        <tr key={student.id} className={selectedIds.has(student.id) ? "is-selected" : ""}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${student.name}`}
                              checked={selectedIds.has(student.id)}
                              onChange={() => toggleStudent(student.id)}
                            />
                          </td>
                          <td><strong>{student.name}</strong></td>
                          <td className="student-admin-mono">
                            <MaskedLrn lrn={student.lrn} maskedLrn={student.masked_lrn} showToggle allowCopy />
                          </td>
                          <td>{formatSectionGrade(student.gradeLevel, student.grade_level_id)}</td>
                          <td>
                            <span className={`student-admin-badge ${student.section_id ? "" : "student-admin-badge--gold"}`}>
                              {student.section}
                            </span>
                          </td>
                          <td>
                            <Badge className="student-admin-program" variant={`program-${String(student.program_code || "EBEC").toLowerCase()}`} title={student.program_name || student.program_code || "EBEC"}>
                              {student.program_code || "EBEC"}
                            </Badge>
                          </td>
                          <td className="section-assignment-status">
                            <Badge variant={String(student.status).toLowerCase()} className="student-admin-status">
                              <span className="student-admin-status__dot" aria-hidden="true" />
                              {String(student.status).toLowerCase()}
                            </Badge>
                          </td>
                          <td>
                            <div className="student-admin-actions">
                              <button
                                type="button"
                                className={student.section_id ? "student-admin-button section-change-button" : "student-admin-icon-button student-admin-icon-button--primary"}
                                aria-label={`${student.section_id ? "Change section for" : "Assign"} ${student.name}`}
                                title={student.section_id ? "Change section" : "Assign student"}
                                onClick={() => openAssignment([student.id])}
                              >
                                {student.section_id ? "Change" : <Plus size={17} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination page={currentPage} pageSize={10} total={filteredStudents.length} onPageChange={setPage} />
              </>
            )}
          </>
        )}
      </section>

      {view === "assign" && (
        <StudentSelectionTray
          students={selectedStudents}
          onRemove={toggleStudent}
          onClear={() => setSelectedIds(new Set())}
          onAssign={() => openAssignment(selectedStudents.map(student => student.id))}
        />
      )}

      {/* Centered Modal: Create Section */}
      <OverlayPanel
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        variant="modal"
        title="Create Section"
        eyebrow="New section"
        description="Set the grade level and curriculum before assigning students."
        busy={busy}
        error={toast?.type === "error" ? toast.message : ""}
        footer={
          <>
            <button type="button" className="student-admin-button" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
            <button type="submit" form="create-section-form" className="student-admin-button student-admin-button--primary" disabled={busy}>
              {busy ? "Creating…" : "Create section"}
            </button>
          </>
        }
      >
        <form id="create-section-form" onSubmit={saveSection}>
          <SectionFormFields value={form} onChange={setForm} gradeLevels={gradeLevels} disabled={busy} />
        </form>
      </OverlayPanel>

      {/* Drawer: Section Management */}
      <SectionManagementDrawer
        notification={toast?.type === "success" ? <Toast persistent className="app-overlay__notification" message={toast.message} onDismiss={() => setToast(null)} /> : null}
        key={`${drawerSection?.id || "section"}:${drawerVersion}`}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        section={targetSection}
        students={students}
        gradeLevels={gradeLevels}
        form={form}
        setForm={setForm}
        onSave={saveSection}
        onDelete={() => setDeleteOpen(true)}
        busy={busy}
        error={toast?.type === "error" ? toast.message : ""}
        view={drawerView}
        onViewChange={setDrawerView}
        onAssign={ids => mutate(() => bulkAssignStudents({
          studentIds: ids,
          sectionId: targetSection.id
        }), `${ids.length} ${ids.length === 1 ? "student added" : "students added"} to ${targetSection.name}.`)}
        onRemove={student => mutate(() => unassignStudent({
          studentId: student.id,
          sectionId: targetSection.id,
          studentSectionId: student.student_section_id
        }), `${student.name} removed from ${targetSection.name}.`)}
      />

      {/* Centered Modal: Delete Section */}
      <OverlayPanel
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        variant="modal"
        title="Remove section?"
        busy={busy}
        error={toast?.type === "error" ? toast.message : ""}
        description="This action removes the section. Existing records may prevent removal."
        footer={
          <>
            <button type="button" className="student-admin-button" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="student-admin-button student-admin-button--danger"
              disabled={busy}
              onClick={async () => {
                if (await mutate(() => deleteSection(targetSection.id), "Section removed.")) {
                  setDeleteOpen(false);
                  setDrawerOpen(false);
                }
              }}
            >
              Remove section
            </button>
          </>
        }
      >
        <p className="student-admin-form-note">You are removing <strong>{targetSection?.name}</strong>. Review its assigned students and academic records before continuing.</p>
      </OverlayPanel>

      {/* Centered Modal: Assign Students (Requirement 2: Grade Level first, then Sections under that Grade Level) */}
      <OverlayPanel
        isOpen={assignmentOpen}
        onClose={() => setAssignmentOpen(false)}
        variant="modal"
        title="Assign students to a section"
        eyebrow="Review assignment"
        busy={busy}
        error={toast?.type === "error" ? toast.message : ""}
        description={`${assignmentStudents.length} ${assignmentStudents.length === 1 ? "student" : "students"} selected. Select a grade level and section below.`}
        footer={
          <>
            <button type="button" className="student-admin-button" disabled={busy} onClick={() => setAssignmentOpen(false)}>Cancel</button>
            <button
              type="submit"
              form="assign-students-form"
              className="student-admin-button student-admin-button--primary"
              aria-busy={busy}
              disabled={busy || !assignmentSectionId || !assignmentStudents.length}
            >
              {busy && <Loader2 size={15} className="student-admin-spinner" aria-hidden="true" />}
              {busy ? "Assigning…" : "Confirm assignment"}
            </button>
          </>
        }
      >
        <div className="section-assignment-review">
          {assignmentStudents.map(student => (
            <span key={student.id}>{student.name}<small><MaskedLrn lrn={student.lrn} maskedLrn={student.masked_lrn} badge={false} /></small></span>
          ))}
        </div>
        <form id="assign-students-form" className="student-admin-form" onSubmit={submitAssignment}>
          {/* Requirement 2: The first that will appear should be the grade level */}
          <div className="student-admin-field">
            <label htmlFor="assignment-grade-level">Grade Level</label>
            <DropdownSelect
              id="assignment-grade-level"
              label="Grade Level"
              value={assignmentGradeId}
              placeholder="Choose grade level first"
              options={gradeLevels.map(grade => ({
                value: String(grade.id),
                label: grade.label || `Grade ${grade.name.replace(/\D/g, '')}`
              }))}
              onChange={value => {
                setAssignmentGradeId(value);
                setAssignmentSectionId("");
              }}
              disabled={busy}
            />
          </div>

          {/* After choosing a grade level, all the sections under that grade level appear */}
          {assignmentGradeId ? (
            <div className="student-admin-field">
              <label htmlFor="assignment-section">Destination Section</label>
              {assignmentSections.length > 5 && (
                <SearchBar
                  id="assignment-search"
                  query={assignmentSearch}
                  setQuery={setAssignmentSearch}
                  placeholder="Filter sections in this grade level…"
                />
              )}
              {assignmentSections.length === 0 ? (
                <p className="student-admin-hint" role="status" style={{ color: "#e11d48", marginTop: 4 }}>
                  No sections found under this grade level. Please create a section first.
                </p>
              ) : (
                <DropdownSelect
                  className="section-assignment-select"
                  id="assignment-section"
                  label="Destination Section"
                  value={assignmentSectionId}
                  placeholder="Choose a section"
                  options={assignmentSections.map(section => {
                    const prog = sectionProgram(section);
                    return {
                      value: String(section.id),
                      label: `${section.name} · ${prog ? `Special Program (${prog.code})` : "Regular Class"}`
                    };
                  })}
                  onChange={setAssignmentSectionId}
                  disabled={busy}
                />
              )}
            </div>
          ) : (
            <p className="student-admin-hint" style={{ marginTop: 8 }}>
              Please select a grade level above to view its available sections.
            </p>
          )}
        </form>
      </OverlayPanel>

      {/* Centered Modal: Add Subject to Grade Level (Manage Subjects Tab) */}
      <OverlayPanel
        isOpen={addSubjectModalOpen}
        onClose={() => setAddSubjectModalOpen(false)}
        variant="modal"
        title="Add Subject to Grade Level"
        eyebrow="Curriculum Allocation"
        className="add-subject-modal"
        busy={addSubjectBusy}
        error={addSubjectError}
        description="Select a grade level and target sections to assign subjects from the curriculum catalog."
        footer={
          <>
            <button
              type="button"
              className="student-admin-button"
              onClick={() => setAddSubjectModalOpen(false)}
              disabled={addSubjectBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="student-admin-button student-admin-button--primary"
              disabled={addSubjectBusy || selectedCatalogSubjectIds.size === 0}
              onClick={handleAddSubjectSubmit}
            >
              {addSubjectBusy ? (
                <Loader2 size={15} className="student-admin-spinner" />
              ) : (
                <Plus size={15} />
              )}
              {selectedCatalogSubjectIds.size === 0
                ? "Select Subject(s)"
                : selectedCatalogSubjectIds.size === 1
                ? "Add 1 Subject"
                : `Add ${selectedCatalogSubjectIds.size} Subjects`}
            </button>
          </>
        }
      >
        <div className="add-subject-modal-content student-admin-form">
          {/* Step 1: Grade Level Selection */}
          <div className="student-admin-field">
            <label htmlFor="add-sub-grade-level">Grade Level</label>
            <DropdownSelect
              id="add-sub-grade-level"
              label="Grade Level"
              value={addSubjectGradeId}
              options={gradeLevels.map(grade => ({
                value: String(grade.id),
                label: grade.label || `Grade ${grade.name.replace(/\D/g, "")}`
              }))}
              onChange={value => {
                setAddSubjectGradeId(value);
                setAddSubjectTarget("all");
                setSelectedCatalogSubjectIds(new Set());
              }}
              disabled={addSubjectBusy}
            />
          </div>

          {/* Step 2: Target Sections Selection */}
          <div className="student-admin-field">
            <label htmlFor="add-sub-target">Target Sections</label>
            <DropdownSelect
              id="add-sub-target"
              label="Target Sections"
              value={addSubjectTarget}
              options={[
                { value: "all", label: "All sections in this grade level" },
                { value: "regular", label: "Regular sections only (Non-specialized)" },
                { value: "specialized", label: "Specialized sections only" },
                ...targetGradeSections.map(sec => {
                  const prog = sectionProgram(sec);
                  return {
                    value: `section:${sec.id}`,
                    label: `Specific Section: ${sec.name} (${prog ? `Special Program - ${prog.code}` : "Regular"})`
                  };
                })
              ]}
              onChange={value => {
                setAddSubjectTarget(value);
                setSelectedCatalogSubjectIds(new Set());
              }}
              disabled={addSubjectBusy}
            />
            <p className="student-admin-hint">
              {addSubjectTarget === "regular"
                ? "Specialized subjects are excluded. Only core non-specialized subjects can be assigned."
                : addSubjectTarget === "specialized"
                ? "Core non-specialized subjects are excluded. Only specialized subjects can be assigned."
                : addSubjectTarget.startsWith("section:")
                ? selectedSpecificSection?.is_specialized
                  ? `Only specialized subjects matching ${sectionProgram(selectedSpecificSection)?.code || "this program"} can be assigned.`
                  : "Only core non-specialized subjects can be assigned to this regular section."
                : "Assigns subjects across sections in this grade level (specialized subjects excluded from regular sections)."}
            </p>
          </div>

          {/* Step 3: Catalog Subjects Selection */}
          <div className="student-admin-field">
            <label htmlFor="catalog-subject-search">Select Subjects from Catalog</label>
            <SearchBar
              id="catalog-subject-search"
              query={addSubjectSearch}
              setQuery={setAddSubjectSearch}
              placeholder="Search catalog by code, name, or program…"
            />

            <div className="catalog-subject-picker-list">
              {filteredDisplayCatalogSubjects.length === 0 ? (
                <EmptyState
                  className="student-admin-empty"
                  icon={BookOpen}
                  title="No matching subjects"
                  description="No subjects match the selected target and filter criteria."
                />
              ) : (
                filteredDisplayCatalogSubjects.map(sub => {
                  const isSelected = selectedCatalogSubjectIds.has(sub.subject_id);
                  const isAlreadyPresent = sub.isAlreadyPresent;
                  const isSpecialized = Boolean(sub.is_specialized || (sub.program_id && sub.program_id !== 4));

                  return (
                    <div
                      key={sub.subject_id}
                      className={`catalog-subject-item ${isSelected ? "is-selected" : ""} ${isAlreadyPresent ? "is-disabled" : ""}`}
                      onClick={() => {
                        if (isAlreadyPresent || addSubjectBusy) return;
                        setSelectedCatalogSubjectIds(prev => {
                          const next = new Set(prev);
                          if (next.has(sub.subject_id)) next.delete(sub.subject_id);
                          else next.add(sub.subject_id);
                          return next;
                        });
                      }}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-disabled={isAlreadyPresent}
                    >
                      <div className="catalog-subject-left">
                        <span className="subject-code-tag">{sub.subject_code}</span>
                        <div className="catalog-subject-body">
                          <div className="catalog-subject-name-row">
                            <span className="catalog-subject-name">{sub.subject_name}</span>
                            <span className={`catalog-subject-program-badge ${isSpecialized ? "is-spec" : "is-core"}`}>
                              {sub.program_code || (isSpecialized ? "Specialized" : "EBEC")}
                            </span>
                          </div>
                          {sub.description && (
                            <span className="catalog-subject-desc">{sub.description}</span>
                          )}
                        </div>
                      </div>

                      <div className="catalog-subject-right">
                        {isAlreadyPresent ? (
                          <span className="catalog-subject-badge-added" title="Subject is already offered in target section(s)">
                            <CheckCircle2 size={13} />
                            Already Added
                          </span>
                        ) : (
                          <span className={`catalog-subject-checkbox ${isSelected ? "is-checked" : ""}`}>
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
        </div>
      </OverlayPanel>

      {/* Centered Modal: Confirm Drop Subject from Grade Level */}
      <OverlayPanel
        isOpen={Boolean(pendingDropSubject)}
        onClose={() => setPendingDropSubject(null)}
        variant="modal"
        title="Drop subject from grade level?"
        eyebrow="Confirm Removal"
        busy={dropSubjectBusy}
        error={dropSubjectError}
        description={`This will remove '${pendingDropSubject?.subject_name}' from all sections offering it in ${formatSectionGrade(pendingDropSubject?.grade_level_name || `G${pendingDropSubject?.grade_level_id + 6}`, pendingDropSubject?.grade_level_id)}.`}
        footer={
          <>
            <button
              type="button"
              className="student-admin-button"
              disabled={dropSubjectBusy}
              onClick={() => setPendingDropSubject(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="student-admin-button student-admin-button--danger"
              disabled={dropSubjectBusy}
              onClick={handleConfirmDropSubject}
            >
              {dropSubjectBusy && <Loader2 size={15} className="student-admin-spinner" />}
              Drop Subject
            </button>
          </>
        }
      >
        <p className="student-admin-form-note">
          Are you sure you want to remove <strong>{pendingDropSubject?.subject_name} ({pendingDropSubject?.subject_code})</strong> from all sections in {formatSectionGrade(pendingDropSubject?.grade_level_name || `G${pendingDropSubject?.grade_level_id + 6}`, pendingDropSubject?.grade_level_id)}?
        </p>
        {pendingDropSubject?.section_names && (
          <p className="student-admin-hint" style={{ marginTop: 8 }}>
            Currently offered in: <strong>{pendingDropSubject.section_names}</strong>.
          </p>
        )}
      </OverlayPanel>

      <Toast
        className="app-toast--bottom-tray"
        message={drawerOpen || addSubjectModalOpen || Boolean(pendingDropSubject) ? null : toast?.message}
        variant={toast?.type}
        icon={toast?.type === "error" ? AlertCircle : undefined}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}
