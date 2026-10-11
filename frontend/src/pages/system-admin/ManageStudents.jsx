import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  GraduationCap,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect";
import StudentFormModal from "./manage-students/StudentFormModal";
import StudentDetailModal from "./manage-students/StudentDetailModal";
import {
  fetchStudents,
  fetchPrograms,
  createStudent,
  updateStudent,
  deleteStudent,
} from "../../services/studentService";
import "../../styles/ManageStudents.css";

const GRADE_FILTER_TABS = [
  { id: "all", label: "All Grades" },
  { id: "G7", label: "Grade 7" },
  { id: "G8", label: "Grade 8" },
  { id: "G9", label: "Grade 9" },
  { id: "G10", label: "Grade 10" },
  { id: "unassigned", label: "Unassigned" },
];

export default function ManageStudents() {
  const [students, setStudents] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [gradeFilter, setGradeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Toast notification
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load students & programs from backend
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [studentsData, programsData] = await Promise.all([
        fetchStudents(),
        fetchPrograms(),
      ]);
      setStudents(studentsData);
      setPrograms(programsData);
    } catch (err) {
      console.error("Failed to load students:", err);
      setError(err.message || "Unable to fetch students from database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute Grade level normalization
  const normalizeGrade = (student) => {
    const raw = String(student.grade_level_name || student.gradeLevel || "").toUpperCase();
    if (raw.includes("7") || raw === "G7") return "G7";
    if (raw.includes("8") || raw === "G8") return "G8";
    if (raw.includes("9") || raw === "G9") return "G9";
    if (raw.includes("10") || raw === "G10") return "G10";
    return "unassigned";
  };

  // Counts for each tab
  const gradeCounts = useMemo(() => {
    const counts = { all: students.length, G7: 0, G8: 0, G9: 0, G10: 0, unassigned: 0 };
    students.forEach((s) => {
      const g = normalizeGrade(s);
      if (counts[g] !== undefined) counts[g]++;
      else counts.unassigned++;
    });
    return counts;
  }, [students]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // Grade filter
      if (gradeFilter !== "all") {
        const studentGrade = normalizeGrade(student);
        if (studentGrade !== gradeFilter) return false;
      }

      // Program filter
      if (programFilter !== "all") {
        if (String(student.program_id) !== String(programFilter)) return false;
      }

      // Search query (LRN or full name or section)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const lrn = String(student.LRN || student.lrn || "").toLowerCase();
        const fullName = String(
          student.name ||
            `${student.first_name || ""} ${student.middle_name || ""} ${student.last_name || ""}`
        ).toLowerCase();
        const section = String(student.section || student.section_name || "").toLowerCase();

        return lrn.includes(query) || fullName.includes(query) || section.includes(query);
      }

      return true;
    });
  }, [students, gradeFilter, programFilter, searchQuery]);

  // Paginated students
  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage]);

  // Handlers for Add/Edit
  const handleOpenAdd = () => {
    setEditingStudent(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (student) => {
    setEditingStudent(student);
    setIsFormModalOpen(true);
  };

  const handleOpenDetail = (student) => {
    setSelectedStudent(student);
    setIsDetailModalOpen(true);
  };

  const handleFormSubmit = async (formData) => {
    try {
      setIsSaving(true);
      if (editingStudent?.student_id) {
        await updateStudent(editingStudent.student_id, formData);
        showToast("Student updated successfully.");
      } else {
        await createStudent(formData);
        showToast("Student registered successfully.");
      }
      setIsFormModalOpen(false);
      setEditingStudent(null);
      await loadData();
    } catch (err) {
      console.error("Save error:", err);
      alert(err.message || "Failed to save student record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (student) => {
    const lrn = student.LRN || student.lrn;
    const name = student.name || `${student.first_name} ${student.last_name}`;
    if (!window.confirm(`Are you sure you want to delete student "${name}" (LRN: ${lrn})?`)) {
      return;
    }

    try {
      await deleteStudent(student.student_id);
      showToast("Student deleted successfully.");
      await loadData();
    } catch (err) {
      console.error("Delete error:", err);
      alert(err.message || "Failed to delete student.");
    }
  };

  // Program options for dropdown
  const programOptions = useMemo(() => {
    return [
      { value: "all", label: "All Programs" },
      ...programs.map((p) => ({
        value: String(p.program_id),
        label: p.program_code,
      })),
    ];
  }, [programs]);

  return (
    <div className="manage-students-container">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "24px",
            zIndex: 9999,
            backgroundColor: toast.type === "error" ? "#fee2e2" : "#ecfdf5",
            color: toast.type === "error" ? "#991b1b" : "#065f46",
            border: `1px solid ${toast.type === "error" ? "#f87171" : "#a7f3d0"}`,
            borderRadius: "8px",
            padding: "0.75rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            fontSize: "0.875rem",
            fontWeight: "500",
          }}
        >
          {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="manage-students-header">
        <div className="manage-students-title-area">
          <h1>Manage Students</h1>
          <p className="manage-students-subtitle">
            View, filter, and register student records across Grade 7 to 10.
          </p>
        </div>

        <div className="manage-students-actions-top">
          <button
            type="button"
            className="btn-primary-add"
            onClick={handleOpenAdd}
          >
            <Plus size={18} />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="students-stats-grid">
        <div className="students-stat-card">
          <div className="students-stat-icon primary">
            <Users size={22} />
          </div>
          <div className="students-stat-info">
            <span className="students-stat-value">{gradeCounts.all}</span>
            <span className="students-stat-label">Total Students</span>
          </div>
        </div>

        <div className="students-stat-card">
          <div className="students-stat-icon g7">
            <GraduationCap size={22} />
          </div>
          <div className="students-stat-info">
            <span className="students-stat-value">{gradeCounts.G7}</span>
            <span className="students-stat-label">Grade 7</span>
          </div>
        </div>

        <div className="students-stat-card">
          <div className="students-stat-icon g8">
            <GraduationCap size={22} />
          </div>
          <div className="students-stat-info">
            <span className="students-stat-value">{gradeCounts.G8}</span>
            <span className="students-stat-label">Grade 8</span>
          </div>
        </div>

        <div className="students-stat-card">
          <div className="students-stat-icon g9">
            <GraduationCap size={22} />
          </div>
          <div className="students-stat-info">
            <span className="students-stat-value">{gradeCounts.G9}</span>
            <span className="students-stat-label">Grade 9</span>
          </div>
        </div>

        <div className="students-stat-card">
          <div className="students-stat-icon g10">
            <GraduationCap size={22} />
          </div>
          <div className="students-stat-info">
            <span className="students-stat-value">{gradeCounts.G10}</span>
            <span className="students-stat-label">Grade 10</span>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="manage-students-toolbar">
        {/* Grade Filter Tabs */}
        <div className="grade-filter-tabs" role="tablist">
          {GRADE_FILTER_TABS.map((tab) => {
            const isActive = gradeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`grade-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => {
                  setGradeFilter(tab.id);
                  setCurrentPage(1);
                }}
              >
                <span>{tab.label}</span>
                <span className="grade-tab-count">{gradeCounts[tab.id] || 0}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Select Filters */}
        <div className="students-controls-row">
          <div className="students-search-box">
            <Search size={16} className="students-search-icon" />
            <input
              type="text"
              className="students-search-input"
              placeholder="Search by student name or LRN..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="students-filters-group">
            <div className="filter-dropdown-wrap">
              <DropdownSelect
                label="Program"
                value={programFilter}
                options={programOptions}
                onChange={(val) => {
                  setProgramFilter(val);
                  setCurrentPage(1);
                }}
                className="manage-users-filter-select"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card with Locked Fixed Columns */}
      <div className="manage-students-table-card">
        {loading ? (
          <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#64748b" }}>
            <Loader2
              size={32}
              className="animate-spin"
              style={{ margin: "0 auto 1rem auto", color: "#17376d" }}
            />
            <p style={{ margin: 0, fontWeight: 500 }}>Loading student records from database...</p>
          </div>
        ) : error ? (
          <div style={{ padding: "3rem 2rem", textAlign: "center", color: "#dc2626" }}>
            <AlertCircle size={32} style={{ margin: "0 auto 1rem auto" }} />
            <p style={{ margin: "0 0 1rem 0", fontWeight: 600 }}>{error}</p>
            <button
              type="button"
              className="btn-primary-add"
              style={{ margin: "0 auto" }}
              onClick={loadData}
            >
              Retry
            </button>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ padding: "4rem 2rem", textAlign: "center", color: "#64748b" }}>
            <Users size={40} style={{ margin: "0 auto 1rem auto", opacity: 0.4 }} />
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "1.05rem", fontWeight: 600, color: "#1e293b" }}>
              No students found
            </p>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              Try adjusting your grade filter, program filter, or search keywords.
            </p>
          </div>
        ) : (
          <>
            <div className="students-table-responsive">
              <table className="students-table">
                {/* Fixed column widths so headers and cells never shift across pages */}
                <colgroup>
                  <col style={{ width: "150px" }} />
                  <col style={{ width: "280px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "160px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "110px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>LRN</th>
                    <th>Student Name</th>
                    <th>Sex</th>
                    <th>Grade Level</th>
                    <th>Section</th>
                    <th>Program</th>
                    <th style={{ textAlign: "right", paddingRight: "1.25rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student) => {
                    const lrn = student.LRN || student.lrn || "N/A";
                    const fullName =
                      student.name ||
                      `${student.last_name || ""}, ${student.first_name || ""} ${student.middle_name || ""}${student.extension_name ? ` ${student.extension_name}` : ""}`.trim();

                    const gradeLabel =
                      student.gradeLevel && student.gradeLevel !== "Unassigned"
                        ? student.gradeLevel
                        : student.grade_level_name && student.grade_level_name !== "Unassigned"
                        ? `Grade ${student.grade_level_name.replace("G", "")}`
                        : "Unassigned";

                    const sectionLabel = student.section || student.section_name || "Unassigned";
                    const programLabel = student.program_code || "EBEC";

                    return (
                      <tr key={student.student_id || student.id}>
                        <td>
                          <span className="lrn-badge">{lrn}</span>
                        </td>
                        <td>
                          <div className="student-name-cell" title={fullName}>
                            <span className="student-name-main">{fullName}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 500 }}>
                            {student.sex === "M"
                              ? "Male"
                              : student.sex === "F"
                              ? "Female"
                              : student.sex || "—"}
                          </span>
                        </td>
                        <td>
                          <span className="badge-pill badge-grade">{gradeLabel}</span>
                        </td>
                        <td>
                          <span className="badge-pill badge-section">{sectionLabel}</span>
                        </td>
                        <td>
                          <span className="badge-pill badge-program">{programLabel}</span>
                        </td>
                        <td>
                          <div
                            className="students-actions-cell"
                            style={{ justifyContent: "flex-end" }}
                          >
                            <button
                              type="button"
                              className="btn-action-icon view"
                              title="View Full Profile"
                              onClick={() => handleOpenDetail(student)}
                            >
                              <Eye size={17} />
                            </button>
                            <button
                              type="button"
                              className="btn-action-icon edit"
                              title="Edit Student"
                              onClick={() => handleOpenEdit(student)}
                            >
                              <Edit size={17} />
                            </button>
                            <button
                              type="button"
                              className="btn-action-icon delete"
                              title="Delete Student"
                              onClick={() => handleDelete(student)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer with Pagination */}
            <div className="students-table-footer">
              <span>
                Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{" "}
                <strong>
                  {Math.min(currentPage * pageSize, filteredStudents.length)}
                </strong>{" "}
                of <strong>{filteredStudents.length}</strong> students
              </span>

              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn-pagination"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span style={{ padding: "0 0.5rem" }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-pagination"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Student Form Modal */}
      <StudentFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingStudent(null);
        }}
        onSubmit={handleFormSubmit}
        initialData={editingStudent}
        programs={programs}
        isSaving={isSaving}
      />

      {/* View Detail Modal */}
      <StudentDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
      />
    </div>
  );
}
