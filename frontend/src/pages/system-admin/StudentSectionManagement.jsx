import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import DropdownSelect from "../../components/common/DropdownSelect";
import { Plus, X, Edit, Users, Eye, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  fetchSections,
  fetchGradeLevels,
  fetchStudents,
  fetchStudentSections,
  createSection,
  updateSection,
  assignStudent,
  bulkAssignStudents,
  unassignStudent,
} from "../../services/studentSectionService";
import "../../styles/ManageUsers.css";
import "../../styles/StudentSectionManagement.css";

const formatLevelLabel = (lvl, gradeLevelId) => {
  if (gradeLevelId) {
    const gid = Number(gradeLevelId);
    if (gid === 1) return "Grade 7";
    if (gid === 2) return "Grade 8";
    if (gid === 3) return "Grade 9";
    if (gid === 4) return "Grade 10";
  }
  if (!lvl || lvl === "Unassigned") return "Unassigned";
  const num = parseInt(String(lvl).replace(/\D/g, ""), 10);
  if (num === 1) return "Grade 7";
  if (num === 2) return "Grade 8";
  if (num === 3) return "Grade 9";
  if (num === 4) return "Grade 10";
  if (num >= 7 && num <= 12) return `Grade ${num}`;
  return String(lvl);
};

function StatusBadge({ status }) {
  const isActive = String(status).toLowerCase() === "active";
  return (
    <span className={`status-badge ${isActive ? "active" : "inactive"}`}>
      <span className="status-dot"></span>
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

// Custom dropdown for Section Actions
function ActionMenu({ section, onEdit, onManageStudents, onViewStudents }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="actions" ref={menuRef} style={{ position: "relative" }}>
      <button
        className="action-btn action-btn--edit"
        onClick={() => setIsOpen(!isOpen)}
        title="Actions"
        type="button"
      >
        <Edit size={21} />
      </button>
      {isOpen && (
        <div className="section-action-dropdown">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onEdit(section);
            }}
          >
            <Edit size={14} /> Edit Section
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onManageStudents(section);
            }}
          >
            <Users size={14} /> Manage Students
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onViewStudents(section);
            }}
          >
            <Eye size={14} /> View Students
          </button>
        </div>
      )}
    </div>
  );
}

export default function StudentSectionManagement() {
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [gradeLevels, setGradeLevels] = useState([
    { id: 1, name: "G7", label: "Grade 7", value: "1" },
    { id: 2, name: "G8", label: "Grade 8", value: "2" },
    { id: 3, name: "G9", label: "Grade 9", value: "3" },
    { id: 4, name: "G10", label: "Grade 10", value: "4" },
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [sectionLevelFilter, setSectionLevelFilter] = useState("All Levels");
  const [sectionSearch, setSectionSearch] = useState("");
  const [viewSearch, setViewSearch] = useState("");
  const [massSelectedStudents, setMassSelectedStudents] = useState(new Set());
  const [studentSpecializations, setStudentSpecializations] = useState({});
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSectionFilter, setStudentSectionFilter] = useState("All Sections");
  const [studentStatusFilter, setStudentStatusFilter] = useState("All Students");
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());

  // Modal states
  const [activeModal, setActiveModal] = useState(null);

  // Modal context data
  const [sectionFormData, setSectionFormData] = useState({ id: null, name: "", grade_level_id: 1, level: "G7", is_specialized: false, program_id: "1" });
  const [assignFormData, setAssignFormData] = useState({ section_id: "" });
  const [targetSection, setTargetSection] = useState(null);
  const [targetStudent, setTargetStudent] = useState(null);
  const [manageSearch, setManageSearch] = useState("");

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [sectionsData, gradeLevelsData, studentsData, studentSectionsData] = await Promise.all([
        fetchSections().catch(() => []),
        fetchGradeLevels().catch(() => []),
        fetchStudents().catch(() => []),
        fetchStudentSections().catch(() => []),
      ]);

      const gradeMap = new Map();
      if (Array.isArray(gradeLevelsData) && gradeLevelsData.length > 0) {
        gradeLevelsData.forEach((gl) => {
          gradeMap.set(Number(gl.grade_level_id), gl.grade_level_name);
        });

        setGradeLevels(
          gradeLevelsData.map((gl) => ({
            id: gl.grade_level_id,
            name: gl.grade_level_name,
            label: formatLevelLabel(gl.grade_level_name, gl.grade_level_id),
            value: String(gl.grade_level_id),
          }))
        );
      } else {
        gradeMap.set(1, "G7");
        gradeMap.set(2, "G8");
        gradeMap.set(3, "G9");
        gradeMap.set(4, "G10");
      }

      // Map sections by id
      const sectionMap = new Map();
      if (Array.isArray(sectionsData)) {
        sectionsData.forEach((sec) => {
          sectionMap.set(Number(sec.section_id || sec.id), sec);
        });
      }

      // Map latest student section assignments from STUDENT_SECTION table
      const studentSectionMap = new Map();
      if (Array.isArray(studentSectionsData)) {
        studentSectionsData.forEach((ss) => {
          studentSectionMap.set(Number(ss.student_id), ss);
        });
      }

      if (Array.isArray(sectionsData)) {
        setSections(
          sectionsData.map((s) => {
            const secId = Number(s.section_id || s.id);
            const glId = Number(s.grade_level_id);
            const levelFromMap = gradeMap.get(glId);
            const resolvedLevel = s.grade_level_name || levelFromMap || s.level || (glId === 2 ? "G8" : glId === 3 ? "G9" : glId === 4 ? "G10" : "G7");
            const countFromSS = Array.isArray(studentSectionsData)
              ? studentSectionsData.filter((ss) => Number(ss.section_id) === secId).length
              : 0;

            return {
              id: secId,
              name: s.section_name || s.name,
              level: resolvedLevel,
              grade_level_id: glId || 1,
              status: s.status || "Active",
              is_specialized: s.is_specialized || 0,
              program_id: s.program_id || null,
              student_count: s.student_count !== undefined && Number(s.student_count) > 0 ? Number(s.student_count) : countFromSS,
            };
          })
        );
      }

      if (Array.isArray(studentsData)) {
        setStudents(
          studentsData.map((st) => {
            const sId = Number(st.student_id || st.id);
            const ssEntry = studentSectionMap.get(sId);
            const resolvedSectionId = st.section_id || ssEntry?.section_id || null;
            const secMatch = resolvedSectionId ? sectionMap.get(Number(resolvedSectionId)) : null;
            const glId = Number(st.grade_level_id || secMatch?.grade_level_id);
            const levelFromMap = gradeMap.get(glId);
            const resolvedGrade = resolvedSectionId
              ? (secMatch?.grade_level_name || secMatch?.level || levelFromMap || (glId === 2 ? "G8" : glId === 3 ? "G9" : glId === 4 ? "G10" : "G7"))
              : "Unassigned";

            const fullName = st.name || `${st.first_name || ""} ${st.middle_name ? st.middle_name + " " : ""}${st.last_name || ""}${st.extension_name ? " " + st.extension_name : ""}`.trim();

            return {
              id: sId,
              name: fullName,
              lrn: String(st.LRN || st.lrn || ""),
              grade_level_id: glId || null,
              gradeLevel: resolvedGrade,
              section_id: resolvedSectionId ? Number(resolvedSectionId) : null,
              section: secMatch ? (secMatch.section_name || secMatch.name) : (st.section || (resolvedSectionId ? `Section ${resolvedSectionId}` : "Unassigned")),
              student_section_id: st.student_section_id || ssEntry?.student_section_id || null,
              status: st.status || "Active",
            };
          })
        );
      }
    } catch (err) {
      console.error("Error loading student section management data:", err);
      showFeedback("error", "Failed to load sections and students from the server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getSectionStudentCount = (sectionId) =>
    students.filter((s) => Number(s.section_id) === Number(sectionId)).length;

  const filterLevelOptions = useMemo(() => {
    return [
      { value: "All Levels", label: "All Levels" },
      ...gradeLevels.map((gl) => ({
        value: String(gl.id),
        label: gl.label,
      })),
    ];
  }, [gradeLevels]);

  const filteredSections = useMemo(() => {
    return sections.filter((sec) => {
      const matchSearch = sectionSearch.trim() === "" || sec.name.toLowerCase().includes(sectionSearch.toLowerCase());
      if (!matchSearch) return false;
      if (sectionLevelFilter === "All Levels") return true;
      return (
        String(sec.grade_level_id) === String(sectionLevelFilter) ||
        String(sec.level) === String(sectionLevelFilter) ||
        formatLevelLabel(sec.level, sec.grade_level_id) === sectionLevelFilter
      );
    });
  }, [sections, sectionLevelFilter, sectionSearch]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const searchMatch =
        student.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        student.lrn.includes(studentSearch);
      let sectionMatch = true;
      if (studentSectionFilter !== "All Sections") {
        if (studentSectionFilter === "Unassigned") sectionMatch = !student.section_id;
        else sectionMatch = student.section === studentSectionFilter;
      }
      let statusMatch = true;
      if (studentStatusFilter !== "All Students") {
        if (studentStatusFilter === "Assigned") statusMatch = !!student.section_id;
        if (studentStatusFilter === "Unassigned") statusMatch = !student.section_id;
      }
      return searchMatch && sectionMatch && statusMatch;
    });
  }, [students, studentSearch, studentSectionFilter, studentStatusFilter]);

  const toggleStudentSelection = (id) => {
    const newSelected = new Set(selectedStudentIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedStudentIds(newSelected);
  };

  const toggleAllStudents = () => {
    if (selectedStudentIds.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)));
    }
  };

  const toggleMassStudentSelection = (studentId) => {
    const newSet = new Set(massSelectedStudents);
    if (newSet.has(studentId)) {
      newSet.delete(studentId);
    } else {
      newSet.add(studentId);
    }
    setMassSelectedStudents(newSet);
  };

  const toggleAllMassStudents = (filteredManageStudents) => {
    const assignableStudents = filteredManageStudents.filter(s => !s.section_id);
    if (massSelectedStudents.size === assignableStudents.length && assignableStudents.length > 0) {
      setMassSelectedStudents(new Set());
    } else {
      setMassSelectedStudents(new Set(assignableStudents.map(s => s.id)));
    }
  };

  const handleMassAssign = async () => {
    if (massSelectedStudents.size === 0) return;
    try {
      setIsSubmitting(true);
      await bulkAssignStudents({
        studentIds: Array.from(massSelectedStudents),
        sectionId: targetSection.id,
      });
      showFeedback("success", `Successfully assigned ${massSelectedStudents.size} students.`);
      setMassSelectedStudents(new Set());
      await loadData();
    } catch (err) {
      showFeedback("error", err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSection = async (e) => {
    e.preventDefault();
    if (!sectionFormData.name.trim()) return;

    try {
      setIsSubmitting(true);
      if (activeModal === "createSection") {
                  await createSection({
            section_name: sectionFormData.name.trim(),
            grade_level_id: sectionFormData.grade_level_id,
            level: sectionFormData.level,
            is_specialized: sectionFormData.is_specialized ? 1 : 0,
            program_id: sectionFormData.is_specialized ? sectionFormData.program_id : null,
          });
        showFeedback("success", `Section "${sectionFormData.name.trim()}" created successfully.`);
      } else if (activeModal === "editSection") {
                  await updateSection(sectionFormData.id, {
            section_name: sectionFormData.name.trim(),
            grade_level_id: sectionFormData.grade_level_id,
            level: sectionFormData.level,
            is_specialized: sectionFormData.is_specialized ? 1 : 0,
            program_id: sectionFormData.is_specialized ? sectionFormData.program_id : null,
          });
        showFeedback("success", `Section "${sectionFormData.name.trim()}" updated successfully.`);
      }
      await loadData();
      closeModal();
    } catch (err) {
      console.error("Save section error:", err);
      showFeedback("error", err.message || "Failed to save section.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkAssign = async (e) => {
    e.preventDefault();
    if (!assignFormData.section_id) return;
    const target = sections.find((s) => String(s.id) === String(assignFormData.section_id));
    if (!target) return;

    try {
      setIsSubmitting(true);
      const studentIdsArray = Array.from(selectedStudentIds);
      await bulkAssignStudents({
        studentIds: studentIdsArray,
        section_id: target.id,
      });
      showFeedback(
        "success",
        `Successfully assigned ${studentIdsArray.length} student(s) to ${target.name}.`
      );
      setSelectedStudentIds(new Set());
      await loadData();
      closeModal();
    } catch (err) {
      console.error("Bulk assign error:", err);
      showFeedback("error", err.message || "Failed to assign students.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateSection = () => {
    const defaultGl = gradeLevels[0] || { id: 1, name: "G7" };
    setSectionFormData({
      id: null,
      name: "",
      grade_level_id: defaultGl.id,
      level: defaultGl.name,
      is_specialized: false,
      program_id: "1",
    });
    setActiveModal("createSection");
  };

  const openEditSection = (section) => {
    const matchedGl = gradeLevels.find(
      (gl) =>
        String(gl.id) === String(section.grade_level_id) ||
        gl.name === section.level ||
        formatLevelLabel(gl.name, gl.id) === formatLevelLabel(section.level, section.grade_level_id)
    ) || gradeLevels[0] || { id: 1, name: "G7" };

    setSectionFormData({
      id: section.id,
      name: section.name,
      grade_level_id: matchedGl.id,
      level: matchedGl.name,
      is_specialized: Boolean(section.is_specialized),
      program_id: String(section.program_id || "1"),
    });
    setActiveModal("editSection");
  };

  const openManageStudents = (section) => {
    setTargetSection(section);
    setManageSearch("");
    setActiveModal("manageStudents");
  };

  const openViewStudents = (section) => {
    setStudentSectionFilter(section.name);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const removeStudentFromSection = (student) => {
    setTargetStudent(student);
    setActiveModal("removeStudent");
  };

  const confirmRemoveStudent = async () => {
    if (!targetStudent || !targetSection) return;
    try {
      setIsSubmitting(true);
      await unassignStudent({
        studentId: targetStudent.id,
        sectionId: targetSection.id,
        studentSectionId: targetStudent.student_section_id,
      });
      showFeedback("success", `${targetStudent.name} removed from ${targetSection.name}.`);
      await loadData();
      setActiveModal("manageStudents");
      setTargetStudent(null);
    } catch (err) {
      console.error("Unassign student error:", err);
      showFeedback("error", err.message || "Failed to remove student.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const assignStudentToSection = async (studentId, sectionId) => {
    try {
      setIsSubmitting(true);
      const st = students.find((s) => s.id === studentId);
      await assignStudent({
        studentId,
        sectionId,
        studentSectionId: st?.student_section_id,
      });
      const sec = sections.find((s) => s.id === sectionId);
      showFeedback(
        "success",
        `${st ? st.name : "Student"} assigned to ${sec ? sec.name : "section"}.`
      );
      await loadData();
    } catch (err) {
      console.error("Assign student error:", err);
      showFeedback("error", err.message || "Failed to assign student.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setActiveModal(null);
    setTargetStudent(null);
  };

  return (
    <div className="user-management-page section-management-page">
      <div className="content-wrapper">
        <div className="page-header">
          <div>
            <h1>Student Section Management</h1>
            <p>Create and manage sections and assign students to their respective sections.</p>
          </div>
          <button type="button" className="add-user-btn" onClick={openCreateSection}>
            <Plus size={20} /> Create Section
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "8px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "0.9rem",
              fontWeight: 500,
              backgroundColor: feedback.type === "success" ? "#ecfdf5" : "#fef2f2",
              color: feedback.type === "success" ? "#065f46" : "#991b1b",
              border: `1px solid ${feedback.type === "success" ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 size={18} color="#059669" />
            ) : (
              <AlertCircle size={18} color="#dc2626" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Section List Panel */}
        <section className="users-panel">
          <div className="users-panel-header">
            <div>
              <h2>Sections</h2>
              <p>Manage existing sections and view capacity.</p>
            </div>
            <span className="users-result-count">
              {isLoading ? "Loading..." : `${filteredSections.length} sections`}
            </span>
          </div>

          <div className="filter-container" style={{ display: "flex", gap: "16px", alignItems: "flex-end", marginBottom: "20px" }}>
            <div style={{ width: "200px" }}>
              <DropdownSelect
                label="Filter by level"
                value={sectionLevelFilter}
                options={filterLevelOptions}
                onChange={setSectionLevelFilter}
              />
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0 12px", height: "42px" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input 
                type="text" 
                placeholder="Search sections by name..." 
                value={sectionSearch}
                onChange={(e) => setSectionSearch(e.target.value)}
                style={{ border: "none", outline: "none", background: "transparent", width: "100%", paddingLeft: "10px", color: "#1e293b", fontSize: "0.9rem", height: "100%" }}
              />
            </div>
          </div>

          <div className="sections-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px", marginTop: "20px" }}>
            {isLoading ? (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
                <Loader2 className="animate-spin" size={24} style={{ margin: "0 auto 10px" }} />
                <p>Loading sections from database...</p>
              </div>
            ) : filteredSections.length > 0 ? (
              filteredSections.map((sec) => (
                <div key={sec.id} className="section-place-card" style={{
                  background: "#ffffff",
                  borderRadius: "15px",
                  border: "1px solid #eef2f6",
                  padding: "24px",
                  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.3s ease",
                  height: "205px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-5px)";
                  e.currentTarget.style.boxShadow = "0 16px 35px rgba(15, 23, 42, 0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.06)";
                }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "7px" }}>
                      <h3 style={{ fontSize: "1.1rem", fontWeight: "600", color: "#1e293b", margin: 0 }}>
                        {sec.name}
                      </h3>
                      <span style={(() => {
                        const pid = String(sec.program_id);
                        const isSpec = sec.is_specialized == 1 || sec.program_id;
                        const base = { padding: "4px 10px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: "600" };
                        if (!isSpec) return { ...base, backgroundColor: "rgba(17,45,97,0.06)", color: "#112d61" };
                        if (pid === "1") return { ...base, backgroundColor: "rgba(37, 99, 235, 0.1)", color: "#2563eb" };
                        if (pid === "2") return { ...base, backgroundColor: "rgba(22, 163, 74, 0.1)", color: "#16a34a" };
                        if (pid === "3") return { ...base, backgroundColor: "rgba(202, 138, 4, 0.1)", color: "#ca8a04" };
                        return { ...base, backgroundColor: "rgba(201, 162, 39, 0.1)", color: "#c9a227" };
                      })()}>
                        {formatLevelLabel(sec.level, sec.grade_level_id)}
                      </span>
                    </div>
                    <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 16px 0", fontWeight: "500" }}>
                      {(sec.is_specialized == 1 || sec.program_id) 
                        ? (String(sec.program_id) === "1" ? "Special Program - STE" : String(sec.program_id) === "2" ? "Special Program - SPJ" : String(sec.program_id) === "3" ? "Special Program - SPA" : "Special Program")
                        : "Regular Class"}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Users size={16} color="#64748b" />
                      <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: "500" }}>
                        {getSectionStudentCount(sec.id)} Students
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                    <button onClick={() => openEditSection(sec)} style={{ flex: 1, padding: "8px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "white", color: "#64748b", fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <Edit size={14} /> Edit
                    </button>
                    <button onClick={() => openManageStudents(sec)} style={{ flex: 1, padding: "8px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "white", color: "#64748b", fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <Users size={14} /> Manage
                    </button>
                    <button onClick={() => { setActiveModal("viewStudents"); setTargetSection(sec); setViewSearch(""); }} style={{ flex: 1, padding: "8px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "white", color: "#64748b", fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                      <Eye size={14} /> View
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "#64748b" }}>
                No sections found matching your criteria.
              </div>
            )}
          </div>
        </section>

        {/* MODALS */}
        {/* Create / Edit Section Modal */}
        {(activeModal === "createSection" || activeModal === "editSection") && (
          <div
            className="user-form-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !isSubmitting) closeModal();
            }}
          >
            <section className="user-form-modal" role="dialog" style={{ maxWidth: "500px", height: "auto", maxHeight: "90vh" }}>
              <header className="user-form-header">
                <div className="user-form-heading">
                  <div>
                    <h2 id="user-form-title">
                      {activeModal === "createSection" ? "Create Section" : "Edit Section"}
                    </h2>
                  </div>
                </div>
                <button
                  className="user-form-close"
                  type="button"
                  disabled={isSubmitting}
                  onClick={closeModal}
                >
                  <X size={20} />
                </button>
              </header>
              <form className="user-form-layout" onSubmit={handleSaveSection}>
                <div className="user-form-body">
                  <fieldset className="user-form-fields">
                    <section className="user-form-section">
                      <div className="user-form-section-heading">
                        <h3>Section Details</h3>
                        <p>
                          {activeModal === "createSection"
                            ? "Create a new student section."
                            : "Modify existing section details."}
                        </p>
                      </div>
                      <div className="user-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                        <div className="user-form-field">
                          <label className="user-form-label">
                            Section Name <span aria-hidden="true">*</span>
                          </label>
                          <input
                            type="text"
                            className="user-form-placeholder-input"
                            required
                            value={sectionFormData.name}
                            onChange={(e) =>
                              setSectionFormData({ ...sectionFormData, name: e.target.value })
                            }
                            style={{
                              backgroundColor: "white",
                              border: "1px solid #cbd5e1",
                              color: "#1e293b",
                            }}
                            placeholder="Enter section name"
                          />
                        </div>
                        <div className="user-form-field">
                          <label className="user-form-label">
                            Section Level <span aria-hidden="true">*</span>
                          </label>
                          <DropdownSelect
                            label="Section Level"
                            value={String(sectionFormData.grade_level_id)}
                            options={gradeLevels.map((gl) => ({
                              value: String(gl.id),
                              label: gl.label,
                            }))}
                            onChange={(val) => {
                              const matchedGl = gradeLevels.find((g) => String(g.id) === String(val));
                              setSectionFormData({
                                ...sectionFormData,
                                grade_level_id: Number(val),
                                level: matchedGl ? matchedGl.name : "G7",
                              });
                            }}
                            className="user-form-select"
                          />
                        </div>
                        <div className="user-form-field" style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="checkbox"
                            id="specialized-checkbox"
                            checked={sectionFormData.is_specialized || false}
                            onChange={(e) =>
                              setSectionFormData({ ...sectionFormData, is_specialized: e.target.checked, program_id: e.target.checked ? (sectionFormData.program_id || "1") : "1" })
                            }
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                          />
                          <label htmlFor="specialized-checkbox" style={{ margin: 0, cursor: "pointer", fontSize: "0.9rem", color: "#1e293b", fontWeight: "500" }}>
                            Specialized Program
                          </label>
                        </div>
                        {sectionFormData.is_specialized && (
                          <div className="user-form-field" style={{ marginTop: "12px" }}>
                            <label className="user-form-label">
                              Specialization <span aria-hidden="true">*</span>
                            </label>
                            <select
                              value={sectionFormData.program_id || "1"}
                              onChange={(e) => setSectionFormData({ ...sectionFormData, program_id: e.target.value })}
                              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "white", outline: "none", color: "#1e293b", fontSize: "0.9rem" }}
                              required
                            >
                              <option value="1">Science Technology and Engineering (STE)</option>
                              <option value="2">Special Program in Journalism (SPJ)</option>
                              <option value="3">Special Program in Arts (SPA)</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </section>
                  </fieldset>
                </div>
                <footer className="user-form-footer">
                  <span>Review section details before saving.</span>
                  <div>
                    <button
                      type="button"
                      className="user-form-cancel"
                      disabled={isSubmitting}
                      onClick={closeModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="user-form-submit"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Loader2 className="animate-spin" size={16} /> Saving...
                        </span>
                      ) : activeModal === "createSection" ? (
                        "Create Section"
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </footer>
              </form>
            </section>
          </div>
        )}

        {/* Assign Selected Modal */}
        {activeModal === "assignSelected" && (
          <div
            className="user-form-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !isSubmitting) closeModal();
            }}
          >
            <section className="user-form-modal" role="dialog" style={{ maxWidth: "500px", height: "auto", maxHeight: "90vh" }}>
              <header className="user-form-header">
                <div className="user-form-heading">
                  <div>
                    <h2 id="user-form-title">Assign Students to Section</h2>
                  </div>
                </div>
                <button
                  className="user-form-close"
                  type="button"
                  disabled={isSubmitting}
                  onClick={closeModal}
                >
                  <X size={20} />
                </button>
              </header>
              <form className="user-form-layout" onSubmit={handleBulkAssign}>
                <div className="user-form-body">
                  <fieldset className="user-form-fields">
                    <section className="user-form-section">
                      <div className="user-form-section-heading">
                        <h3>{selectedStudentIds.size} student(s) selected</h3>
                        <p>These students will be assigned to the selected section.</p>
                      </div>
                      <div className="user-form-grid" style={{ gridTemplateColumns: "1fr" }}>
                        <div className="user-form-field">
                          <label className="user-form-label">
                            Select Section <span aria-hidden="true">*</span>
                          </label>
                          <DropdownSelect
                            label="Select Section"
                            value={assignFormData.section_id}
                            options={[
                              { value: "", label: "Select Section..." },
                              ...sections.map((sec) => ({
                                value: String(sec.id),
                                label: `${sec.name} â€” ${formatLevelLabel(sec.level, sec.grade_level_id)}`,
                              })),
                            ]}
                            onChange={(val) => setAssignFormData({ section_id: val })}
                            className="user-form-select"
                          />
                        </div>
                      </div>
                    </section>
                  </fieldset>
                </div>
                <footer className="user-form-footer">
                  <span>Review assignment details before saving.</span>
                  <div>
                    <button
                      type="button"
                      className="user-form-cancel"
                      disabled={isSubmitting}
                      onClick={closeModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="user-form-submit"
                      disabled={isSubmitting || !assignFormData.section_id}
                    >
                      {isSubmitting ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Loader2 className="animate-spin" size={16} /> Assigning...
                        </span>
                      ) : (
                        "Assign Selected"
                      )}
                    </button>
                  </div>
                </footer>
              </form>
            </section>
          </div>
        )}

        {/* Manage Students Modal */}
          {activeModal === "manageStudents" && targetSection && (
            <div
              className="user-form-overlay"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !isSubmitting) closeModal();
              }}
            >
              <section
                className="user-form-modal"
                role="dialog"
                style={{ maxWidth: "800px", maxHeight: "90vh" }}
              >
                <header className="user-form-header">
                  <div className="user-form-heading">
                    <div>
                      <h2 id="user-form-title">Manage Students - {targetSection.name}</h2>
                    </div>
                  </div>
                  <button
                    className="user-form-close"
                    type="button"
                    disabled={isSubmitting}
                    onClick={closeModal}
                  >
                    <X size={20} />
                  </button>
                </header>
                <div
                  className="user-form-layout"
                  style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}
                >
                  {(() => {
                    const filteredManageStudents = students.filter(
                      (s) =>
                        !s.section_id &&
                        (Number(s.grade_level_id) === Number(targetSection.grade_level_id) || !s.grade_level_id) &&
                        (manageSearch.trim() === "" ||
                          s.name.toLowerCase().includes(manageSearch.toLowerCase()) ||
                          s.lrn.includes(manageSearch))
                    );

                    return (
                      <>
                        <div style={{ padding: "24px 32px" }}>
                          <h3 style={{ fontSize: "1rem", color: "var(--mu-navy)", marginBottom: "12px" }}>
                            Add Students to {targetSection.name}
                          </h3>
                          <div className="search-box" style={{ marginBottom: "16px", maxWidth: "100%" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                            <input
                              type="text"
                              placeholder="Search student by name or LRN..."
                              value={manageSearch}
                              onChange={(e) => setManageSearch(e.target.value)}
                            />
                          </div>

                          <div className="manage-student-list">
                            <div style={{ padding: "10px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid #e2e8f0" }}>
                              <input 
                                type="checkbox" 
                                checked={massSelectedStudents.size === filteredManageStudents.length && filteredManageStudents.length > 0}
                                onChange={() => toggleAllMassStudents(filteredManageStudents)}
                                style={{ width: "16px", height: "16px", cursor: "pointer" }}
                              />
                              <span style={{ fontSize: "0.9rem", fontWeight: "600", color: "#1e293b" }}>Select All</span>
                            </div>
                            
                            {filteredManageStudents.map((student) => (
                                <div key={student.id} className="manage-student-item" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                  <input 
                                    type="checkbox" 
                                    checked={massSelectedStudents.has(student.id)}
                                    onChange={() => toggleMassStudentSelection(student.id)}
                                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                                  />
                                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <strong style={{ lineHeight: "1.2" }}>{student.name}</strong>
                                    <span style={{ fontSize: "0.85rem", color: "#64748b", lineHeight: "1.2" }}>
                                      LRN: {student.lrn} · {formatLevelLabel(student.gradeLevel, student.grade_level_id)}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <input 
                                      type="checkbox" 
                                      id={`spec-${student.id}`}
                                      checked={studentSpecializations[student.id]?.isSpecialized || false}
                                      onChange={(e) => setStudentSpecializations(prev => ({ ...prev, [student.id]: { ...prev[student.id], isSpecialized: e.target.checked, programId: e.target.checked ? "1" : "" } }))}
                                      style={{ width: "14px", height: "14px", cursor: "pointer" }}
                                    />
                                    <label htmlFor={`spec-${student.id}`} style={{ fontSize: "0.8rem", color: "#64748b", cursor: "pointer" }}>Specialized</label>
                                    
                                    {studentSpecializations[student.id]?.isSpecialized && (
                                      <select 
                                        value={studentSpecializations[student.id]?.programId || "1"}
                                        onChange={(e) => setStudentSpecializations(prev => ({ ...prev, [student.id]: { ...prev[student.id], programId: e.target.value } }))}
                                        style={{ fontSize: "0.8rem", padding: "4px", borderRadius: "4px", border: "1px solid #e2e8f0" }}
                                      >
                                        <option value="1">STE</option>
                                        <option value="2">SPJ</option>
                                        <option value="3">SPA</option>
                                      </select>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => assignStudentToSection(student.id, targetSection.id)}
                                    className="add-user-btn"
                                    style={{ padding: "4px 10px", fontSize: "1rem", minWidth: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                                    title="Add Student"
                                  >
                                    +
                                  </button>
                                </div>
                            ))}
                            {filteredManageStudents.length === 0 && (
                              <p className="users-empty-state" style={{ padding: "16px 0", border: "none" }}>
                                {manageSearch.trim() === "" ? `No unassigned Grade ${targetSection.grade_level_id === 1 ? '7' : targetSection.grade_level_id === 2 ? '8' : targetSection.grade_level_id === 3 ? '9' : targetSection.grade_level_id === 4 ? '10' : ''} students left to add.` : "No unassigned students found matching your search."}
                              </p>
                            )}
                          </div>
                        </div>

                        <div style={{ padding: "24px 32px", borderTop: "1px solid #e2e8f0" }}>
                          <h3 style={{ fontSize: "1rem", color: "var(--mu-navy)", marginBottom: "12px" }}>
                            Current Students ({students.filter(s => Number(s.section_id) === Number(targetSection.id)).length})
                          </h3>
                          <div className="manage-student-list">
                            {students
                              .filter((s) => Number(s.section_id) === Number(targetSection.id))
                              .map((student) => (
                                <div key={student.id} className="manage-student-item">
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                              <strong style={{ lineHeight: "1.2" }}>{student.name}</strong>
                              <span style={{ fontSize: "0.85rem", color: "#64748b", lineHeight: "1.2" }}>
                                LRN: {student.lrn} · {formatLevelLabel(student.gradeLevel, student.grade_level_id)}
                              </span>
                              {student.is_specialized == 1 && student.program_code && (
                                <div>
                                  <span style={{
                                    backgroundColor: String(student.program_id) === "1" ? "rgba(37, 99, 235, 0.1)" : String(student.program_id) === "2" ? "rgba(22, 163, 74, 0.1)" : "rgba(202, 138, 4, 0.1)",
                                    color: String(student.program_id) === "1" ? "#2563eb" : String(student.program_id) === "2" ? "#16a34a" : "#ca8a04",
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    fontSize: "0.7rem",
                                    fontWeight: "600",
                                    display: "inline-block"
                                  }}>
                                    Specialized - {student.program_code}
                                  </span>
                                </div>
                              )}
                            </div>
                                  <button
                                    type="button"
                                    className="remove-student-btn"
                                    onClick={() => removeStudentFromSection(student)}
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ))}
                            {students.filter((s) => Number(s.section_id) === Number(targetSection.id)).length === 0 && (
                              <p className="users-empty-state" style={{ padding: "16px 0", border: "none" }}>
                                No students assigned to this section yet.
                              </p>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <footer className="user-form-footer" style={{ justifyContent: "space-between" }}>
                  <button
                    type="button"
                    className="user-form-cancel"
                    disabled={isSubmitting}
                    onClick={closeModal}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={massSelectedStudents.size === 0 || isSubmitting}
                    onClick={handleMassAssign}
                    className="user-form-submit"
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    {isSubmitting ? (
                      <><Loader2 className="animate-spin" size={14} /> Assigning...</>
                    ) : (
                      `+ Assign Selected (${massSelectedStudents.size})`
                    )}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {/* View Students Modal (Read Only) */}
          {activeModal === "viewStudents" && targetSection && (
            <div
              className="user-form-overlay"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !isSubmitting) closeModal();
              }}
            >
              <section
                className="user-form-modal"
                role="dialog"
                style={{ maxWidth: "600px", maxHeight: "90vh" }}
              >
                <header className="user-form-header">
                  <div className="user-form-heading">
                    <div>
                      <h2 id="user-form-title">View Students - {targetSection.name}</h2>
                    </div>
                  </div>
                  <button
                    className="user-form-close"
                    type="button"
                    onClick={closeModal}
                  >
                    <X size={20} />
                  </button>
                </header>
                <div
                  className="user-form-layout"
                  style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}
                >
                  <div style={{ padding: "24px 32px" }}>
                    <div className="search-box" style={{ marginBottom: "16px", maxWidth: "100%" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                      <input
                        type="text"
                        placeholder="Search current students..."
                        value={viewSearch}
                        onChange={(e) => setViewSearch(e.target.value)}
                      />
                    </div>

                    <div className="manage-student-list">
                      {students
                        .filter((s) => Number(s.section_id) === Number(targetSection.id))
                        .filter((s) => viewSearch.trim() === "" || s.name.toLowerCase().includes(viewSearch.toLowerCase()) || s.lrn.includes(viewSearch))
                        .map((student) => (
                          <div key={student.id} className="manage-student-item">
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                              <strong style={{ lineHeight: "1.2" }}>{student.name}</strong>
                              <span style={{ fontSize: "0.85rem", color: "#64748b", lineHeight: "1.2" }}>
                                LRN: {student.lrn} · {formatLevelLabel(student.gradeLevel, student.grade_level_id)}
                              </span>
                              {student.is_specialized == 1 && student.program_code && (
                                <div>
                                  <span style={{
                                    backgroundColor: String(student.program_id) === "1" ? "rgba(37, 99, 235, 0.1)" : String(student.program_id) === "2" ? "rgba(22, 163, 74, 0.1)" : "rgba(202, 138, 4, 0.1)",
                                    color: String(student.program_id) === "1" ? "#2563eb" : String(student.program_id) === "2" ? "#16a34a" : "#ca8a04",
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    fontSize: "0.7rem",
                                    fontWeight: "600",
                                    display: "inline-block"
                                  }}>
                                    Specialized - {student.program_code}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      {students
                        .filter((s) => Number(s.section_id) === Number(targetSection.id))
                        .filter((s) => viewSearch.trim() === "" || s.name.toLowerCase().includes(viewSearch.toLowerCase()) || s.lrn.includes(viewSearch))
                        .length === 0 && (
                        <p className="users-empty-state" style={{ padding: "16px 0", border: "none" }}>
                          No students found.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <footer className="user-form-footer" style={{ justifyContent: "flex-end" }}>
                  <div>
                    <button
                      type="button"
                      className="user-form-cancel"
                      onClick={closeModal}
                    >
                      Close
                    </button>
                  </div>
                </footer>
              </section>
            </div>
          )}

          {/* Remove Student Confirmation Modal */}{/* Remove Student Confirmation Modal */}
        {activeModal === "removeStudent" && targetStudent && (
          <div
            className="user-form-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !isSubmitting)
                setActiveModal("manageStudents");
            }}
            style={{ zIndex: 1100 }}
          >
            <section className="user-form-modal" role="dialog" style={{ maxWidth: "400px", height: "auto", maxHeight: "90vh" }}>
              <header className="user-form-header">
                <div className="user-form-heading">
                  <div>
                    <h2 id="user-form-title">Remove Student?</h2>
                  </div>
                </div>
                <button
                  className="user-form-close"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setActiveModal("manageStudents")}
                >
                  <X size={20} />
                </button>
              </header>
              <div className="user-form-layout">
                <div className="user-form-body">
                  <fieldset className="user-form-fields">
                    <section className="user-form-section">
                      <p style={{ color: "#334155", margin: "0" }}>
                        <strong>{targetStudent.name}</strong> will be removed from{" "}
                        <strong>{targetSection.name}</strong> and become Unassigned.
                      </p>
                    </section>
                  </fieldset>
                </div>
                <footer className="user-form-footer">
                  <span>This does not delete the student record.</span>
                  <div>
                    <button
                      type="button"
                      className="user-form-cancel"
                      disabled={isSubmitting}
                      onClick={() => setActiveModal("manageStudents")}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="user-form-submit"
                      disabled={isSubmitting}
                      onClick={confirmRemoveStudent}
                      style={{ backgroundColor: "#ef4444" }}
                    >
                      {isSubmitting ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Loader2 className="animate-spin" size={16} /> Removing...
                        </span>
                      ) : (
                        "Remove Student"
                      )}
                    </button>
                  </div>
                </footer>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
