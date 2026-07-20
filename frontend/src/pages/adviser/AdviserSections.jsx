import { useState, useMemo } from "react";
import { Check, FileSpreadsheet, X } from "lucide-react";

// Components
import SectionsControls from "../../components/sections/SectionsControls";
import ClassCard from "../../components/sections/ClassCard";
import GradingSheet from "./GradingSheet"; // Imported the separated component

// Style
import "../../styles/sections.css";

// -------------------------------------------------------------
// INITIAL MOCK DATA
// -------------------------------------------------------------
const INITIAL_CLASSES = [
  {
    id: "class-1",
    sectionName: "Rizal",
    gradeLevel: "Grade 10",
    subject: "Mathematics",
    classType: "Advisory Class",
    deadline: "2026-07-31",
    submitted: false,
  },
  {
    id: "class-2",
    sectionName: "Bonifacio",
    gradeLevel: "Grade 10",
    subject: "Mathematics",
    classType: "Regular Class",
    deadline: "2026-08-05",
    submitted: false,
  },
  {
    id: "class-3",
    sectionName: "Aguinaldo",
    gradeLevel: "Grade 9",
    subject: "Advanced Algebra",
    classType: "Regular Class",
    deadline: "2026-07-28",
    submitted: false,
  },
  {
    id: "class-4",
    sectionName: "Mabini",
    gradeLevel: "Grade 10",
    subject: "Geometry",
    classType: "Regular Class",
    deadline: "2026-08-12",
    submitted: false,
  },
];

const generateMockStudents = () => ({
  "class-1": [
    { id: "s1", lrn: 102938475601, firstName: "Juan", lastName: "Dela Cruz", middleName: "Santos", sex: "M", term1: 92, term2: 90, term3: 94 },
    { id: "s2", lrn: 102938475602, firstName: "Pedro", lastName: "Penduko", middleName: "Reyes", sex: "M", term1: 85, term2: 83, term3: 84 },
    { id: "s3", lrn: 102938475603, firstName: "Jose", lastName: "Rizal", middleName: "Protacio", sex: "M", term1: 98, term2: 97, term3: 99 },
    { id: "s4", lrn: 102938475604, firstName: "Andres", lastName: "Bonifacio", middleName: "Castro", sex: "M", term1: 74, term2: 78, term3: 73 },
    { id: "s5", lrn: 102938475605, firstName: "Maria", lastName: "Clara", middleName: "Lara", sex: "F", term1: 95, term2: 96, term3: 94 },
    { id: "s6", lrn: 102938475606, firstName: "Gabriela", lastName: "Silang", middleName: "Cariño", sex: "F", term1: 88, term2: 89, term3: 91 },
    { id: "s7", lrn: 102938475607, firstName: "Melchora", lastName: "Aquino", middleName: "Ramos", sex: "F", term1: 72, term2: 75, term3: 73 },
    { id: "s8", lrn: 102938475608, firstName: "Leonor", lastName: "Rivera", middleName: "Kipping", sex: "F", term1: 82, term2: 85, term3: 86 },
  ],
  "class-2": [
    { id: "s21", lrn: 202938475601, firstName: "Emilio", lastName: "Aguinaldo", middleName: "Famy", sex: "M", term1: 85, term2: 86, term3: 88 },
    { id: "s22", lrn: 202938475602, firstName: "Apolinario", lastName: "Mabini", middleName: "Maranan", sex: "M", term1: 90, term2: 92, term3: 93 },
    { id: "s23", lrn: 202938475603, firstName: "Marcelo", lastName: "Del Pilar", middleName: "Hilario", sex: "M", term1: 78, term2: 80, term3: 82 },
    { id: "s24", lrn: 202938475604, firstName: "Juan", lastName: "Luna", middleName: "Novicio", sex: "M", term1: 83, term2: 85, term3: 84 },
    { id: "s25", lrn: 202938475605, firstName: "Teresa", lastName: "Magbanua", middleName: "Ferraris", sex: "F", term1: 87, term2: 88, term3: 90 },
    { id: "s26", lrn: 202938475606, firstName: "Gregoria", lastName: "De Jesus", middleName: "Alvarez", sex: "F", term1: 91, term2: 93, term3: 92 },
    { id: "s27", lrn: 202938475607, firstName: "Marina", lastName: "Dizon", middleName: "Santiago", sex: "F", term1: 80, term2: 82, term3: 81 },
    { id: "s28", lrn: 202938475608, firstName: "Gliceria", lastName: "Marella", middleName: "Villavicencio", sex: "F", term1: 73, term2: 74, term3: 75 },
  ],
});

export default function AdviserSections() {
  const [classes, setClasses] = useState(INITIAL_CLASSES);
  const [studentsBySection] = useState(generateMockStudents());

  // Navigation View State
  const [currentView, setCurrentView] = useState("dashboard");
  const [activeSelectedClass, setactiveSelectedClass] = useState(null);

  // Controls Filters and Sorting
  const [filterSubject, setFilterSubject] = useState("All");
  const [filterGrade, setFilterGrade] = useState("All");
  const [sortBy, setSortBy] = useState("sectionName");
  const [sortAscending, setSortAscending] = useState(true);

  // Drawer & Modal States
  const [viewDrawerOpen, setViewDrawerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    id: "", sectionName: "", gradeLevel: "", subject: "", classType: "", deadline: "",
  });

  const [toasts, setToasts] = useState([]);

  const triggerToast = (message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const calculateFinalGrade = (t1, t2, t3) => {
    const term1 = parseFloat(t1);
    const term2 = parseFloat(t2);
    const term3 = parseFloat(t3);
    const values = [];
    if (!isNaN(term1)) values.push(term1);
    if (!isNaN(term2)) values.push(term2);
    if (!isNaN(term3)) values.push(term3);
    if (values.length === 0) return "";
    return Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
  };

  const filteredAndSortedClasses = useMemo(() => {
    let result = [...classes];
    if (filterSubject !== "All") result = result.filter((c) => c.subject === filterSubject);
    if (filterGrade !== "All") result = result.filter((c) => c.gradeLevel === filterGrade);

    result.sort((a, b) => {
      let valA = a[sortBy] ? a[sortBy].toLowerCase() : "";
      let valB = b[sortBy] ? b[sortBy].toLowerCase() : "";
      if (sortBy === "gradeLevel") {
        const numA = parseInt(a.gradeLevel.replace(/\D/g, "")) || 0;
        const numB = parseInt(b.gradeLevel.replace(/\D/g, "")) || 0;
        return sortAscending ? numA - numB : numB - numA;
      }
      if (valA < valB) return sortAscending ? -1 : 1;
      if (valA > valB) return sortAscending ? 1 : -1;
      return 0;
    });
    return result;
  }, [classes, filterSubject, filterGrade, sortBy, sortAscending]);

  const subjectOptions = useMemo(() => ["All", ...Array.from(new Set(classes.map((c) => c.subject)))], [classes]);
  const gradeOptions = useMemo(() => ["All", ...Array.from(new Set(classes.map((c) => c.gradeLevel)))], [classes]);

  const handleSaveEdit = (e) => {
    e.preventDefault();
    setClasses((prev) =>
      prev.map((c) => (c.id === editFormData.id ? { ...c, ...editFormData } : c))
    );
    setEditModalOpen(false);
    triggerToast(`Successfully updated details for ${editFormData.gradeLevel} - ${editFormData.sectionName}`);
  };

  const handleGradeSubmit = async (classId) => {
    // simulate API call if needed
    // await api.submitGrades(classId);

    setClasses((prev) =>
      prev.map((c) =>
        c.id === classId
          ? { ...c, submitted: true }
          : c
      )
    );

    // ⭐ THIS IS THE IMPORTANT PART ⭐
    setactiveSelectedClass((prev) => ({
      ...prev,
      submitted: true,
    }));

    triggerToast(
      `Grading sheet for ${activeSelectedClass.gradeLevel} - ${activeSelectedClass.sectionName} has been submitted!`
    );
  };

  const activeactiveSelectedClass = useMemo(() => {
    if (!activeSelectedClass) return null;

    return (
      classes.find((c) => c.id === activeSelectedClass.id) ||
      activeSelectedClass
    );
  }, [classes, activeSelectedClass]);

  const activeClassStats = useMemo(() => {
    if (!activeSelectedClass) return null;
    const students = studentsBySection[activeSelectedClass.id] || [];
    const total = students.length;
    const males = students.filter((s) => s.sex === "M").length;
    const females = students.filter((s) => s.sex === "F").length;
    const grades = students.map((s) => calculateFinalGrade(s.term1, s.term2, s.term3)).filter((g) => g !== "");
    const avgGrade = grades.length > 0 ? Math.round(grades.reduce((sum, val) => sum + val, 0) / grades.length) : "N/A";
    return { total, males, females, avgGrade };
  }, [activeSelectedClass, studentsBySection]);

  return (
    <div className="sections-page-container">
      {/* Toast Notifications */}
      <div style={{ zIndex: 9999 }}>
        {toasts.map((t) => (
          <div key={t.id} className={`toast-notification ${t.type === "success" ? "toast-success" : "toast-info"}`}>
            {t.type === "success" ? <Check size={18} style={{ color: "#10b981" }} /> : <FileSpreadsheet size={18} style={{ color: "#3b82f6" }} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {currentView === "dashboard" ? (
        <>
          <div className="sections-header">
            <h1 className="sections-title">Assigned Classes</h1>
            <p className="sections-subtext">View all your assigned classes and their corresponding details.</p>
          </div>

          <SectionsControls
            filterSubject={filterSubject} setFilterSubject={setFilterSubject} subjectOptions={subjectOptions}
            filterGrade={filterGrade} setFilterGrade={setFilterGrade} gradeOptions={gradeOptions}
            sortBy={sortBy} setSortBy={setSortBy} sortAscending={sortAscending} setSortAscending={setSortAscending}
          />

          {filteredAndSortedClasses.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#ffffff", borderRadius: "16px", color: "#64748b", border: "1px solid #eef2f6" }}>
              <p style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>No assigned classes found</p>
              <p style={{ fontSize: "14px" }}>Try adjusting your search filters above.</p>
            </div>
          ) : (
            <div className="classes-grid">
              {filteredAndSortedClasses.map((cls) => (
                <ClassCard
                  key={cls.id} cls={cls}
                  onView={(c) => { setactiveSelectedClass(c); setViewDrawerOpen(true); }}
                  onGradingSheet={(c) => { setactiveSelectedClass(c); setCurrentView("grading-sheet"); }}
                  onEdit={(c) => { setactiveSelectedClass(c); setEditFormData({ ...c }); setEditModalOpen(true); }}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        activeSelectedClass && (
          <GradingSheet
            activeSelectedClass={activeactiveSelectedClass}
            students={studentsBySection[activeSelectedClass.id] || []}
            onBack={() => setCurrentView("dashboard")}
            triggerToast={triggerToast}
            calculateFinalGrade={calculateFinalGrade}
            onSubmit={handleGradeSubmit}
          />
        )
      )}

      {/* EDIT CLASS DETAILS MODAL */}
      {editModalOpen && (
        <div className="modal-overlay" onClick={() => setEditModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Class Details</h3>
              <button className="modal-close-btn" onClick={() => setEditModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Section Name</label>
                  <input type="text" required className="form-input" value={editFormData.sectionName} onChange={(e) => setEditFormData({ ...editFormData, sectionName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Grade Level</label>
                  <select className="form-input" value={editFormData.gradeLevel} onChange={(e) => setEditFormData({ ...editFormData, gradeLevel: e.target.value })}>
                    <option value="Grade 7">Grade 7</option><option value="Grade 8">Grade 8</option><option value="Grade 9">Grade 9</option><option value="Grade 10">Grade 10</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input type="text" required className="form-input" value={editFormData.subject} onChange={(e) => setEditFormData({ ...editFormData, subject: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Class Type</label>
                  <select className="form-input" value={editFormData.classType} onChange={(e) => setEditFormData({ ...editFormData, classType: e.target.value })}>
                    <option value="Regular Class">Regular Class</option><option value="Advisory Class">Advisory Class</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Submission Deadline</label>
                  <input type="date" required className="form-input" value={editFormData.deadline} onChange={(e) => setEditFormData({ ...editFormData, deadline: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="modal-btn modal-btn-cancel" onClick={() => setEditModalOpen(false)}>Cancel</button>
                <button type="submit" className="modal-btn modal-btn-save">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CLASS INFORMATION DRAWER */}
      {viewDrawerOpen && activeSelectedClass && activeClassStats && (
        <div className="drawer-overlay" onClick={() => setViewDrawerOpen(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3 className="modal-title">Class Information</h3>
              <button className="modal-close-btn" onClick={() => setViewDrawerOpen(false)}><X size={20} /></button>
            </div>
            <div className="drawer-body">
              <div style={{ marginBottom: "24px" }}>
                <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#1e293b", margin: "0 0 4px 0" }}>{activeSelectedClass.gradeLevel} - {activeSelectedClass.sectionName}</h2>
                <p style={{ color: "#64748b", margin: 0, fontWeight: "500" }}>{activeSelectedClass.subject}</p>
                <span className="class-type-tag" style={{ marginTop: "10px", display: "inline-block" }}>{activeSelectedClass.classType}</span>
              </div>
              <div className="drawer-section-title">Academic Indicators</div>
              <div className="stats-grid">
                <div className="stat-widget"><span className="stat-val">{activeClassStats.total}</span><span className="stat-lbl">Total Students</span></div>
                <div className="stat-widget"><span className="stat-val" style={{ color: "#10b981" }}>{activeClassStats.avgGrade}%</span><span className="stat-lbl">Class Average</span></div>
              </div>
              <div className="stat-widget" style={{ marginBottom: "24px", width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 600, color: "#475569" }}>
                  <span>Gender Breakdown</span>
                  <span>M: {activeClassStats.males} | F: {activeClassStats.females}</span>
                </div>
                <div className="stats-gender-bar">
                  <div className="gender-bar-male" style={{ width: `${(activeClassStats.males / activeClassStats.total) * 100}%` }} />
                  <div className="gender-bar-female" style={{ width: `${(activeClassStats.females / activeClassStats.total) * 100}%` }} />
                </div>
              </div>
              <div className="drawer-section-title">Students Registry</div>
              <div className="students-mini-list">
                {(studentsBySection[activeSelectedClass.id] || []).map((stud) => (
                  <div key={stud.id} className="student-mini-item">
                    <span className="student-mini-name">{stud.lastName}, {stud.firstName}</span>
                    <span className={`student-mini-sex ${stud.sex === "M" ? "sex-m" : "sex-f"}`}>{stud.sex === "M" ? "Male" : "Female"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}