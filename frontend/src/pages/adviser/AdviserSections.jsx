import { useState, useMemo, useEffect } from "react";
import { Check, FileSpreadsheet, X, ArrowDownNarrowWide, Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";

// Components
import SelectFilter from "../../components/common/SelectFilter.jsx";
import ClassCard from "../../components/sections/ClassCard";
import GradingSheet from "./GradingSheet"; // Imported the separated component
import ClassRecord from "./ClassRecord.jsx";
import SectionDetails from "./SectionDetails.jsx";

// Auth & Services
import { getStoredUser } from "../../utils/auth";
import { getAdviserSections, getStudentsBySection } from "../../services/sectionService";

// Style
import "../../styles/sections.css";
import "../../styles/attendanceSheet.css";

// -------------------------------------------------------------
// INITIAL MOCK DATA (FALLBACK)
// -------------------------------------------------------------
const INITIAL_CLASSES = [
  {
    id: "class-1",
    sectionName: "Mahogany",
    gradeLevel: "G10",
    subject: "Mathematics",
    classType: "Advisory Class",
    deadline: "2026-07-31",
    submitted: false,
  },
  {
    id: "class-2",
    sectionName: "Gemelina",
    gradeLevel: "G10",
    subject: "Mathematics",
    classType: "Regular Class",
    deadline: "2026-08-05",
    submitted: false,
  },
  {
    id: "class-3",
    sectionName: "Narra",
    gradeLevel: "G9",
    subject: "Advanced Algebra",
    classType: "Regular Class",
    deadline: "2026-07-28",
    submitted: false,
  },
  {
    id: "class-4",
    sectionName: "Tanguile",
    gradeLevel: "G10",
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

import { normalizeRole } from "../../utils/auth";

export default function AdviserSections({ userRole: propUserRole }) {
  const location = useLocation();
  const storedUser = useMemo(() => getStoredUser(), []);
  const normRole = useMemo(() => normalizeRole(storedUser?.role, storedUser), [storedUser]);
  const userRole = propUserRole || (normRole === "adviser" ? "adviser" : "teacher");

  const [classes, setClasses] = useState([]);
  const [studentsBySection, setStudentsBySection] = useState(generateMockStudents());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch sections from backend
  useEffect(() => {
    async function fetchAdviserClasses() {
      setLoading(true);
      setError(null);
      try {
        const user = getStoredUser();
        const userId = user?.user_id || user?.id || 1;
        const fetched = await getAdviserSections(userId);

        if (fetched && Array.isArray(fetched) && fetched.length > 0) {
          setClasses(fetched);
        } else {
          setClasses(INITIAL_CLASSES);
        }
      } catch (err) {
        console.error("Error fetching adviser sections:", err);
        setError("Unable to connect to backend. Showing default assigned classes.");
        setClasses(INITIAL_CLASSES);
      } finally {
        setLoading(false);
      }
    }

    fetchAdviserClasses();
  }, []);

  // Navigation View State
  const [currentView, setCurrentView] = useState(
    location.state?.currentView || "dashboard"
  );
  const [activeSelectedClass, setactiveSelectedClass] = useState(
    location.state?.activeSelectedClass || null
  );

  // Fetch students when a section is opened
  useEffect(() => {
    async function fetchSectionStudents() {
      if (!activeSelectedClass || !activeSelectedClass.section_id) return;
      const classKey = activeSelectedClass.id;
      if (studentsBySection[classKey] && studentsBySection[classKey].length > 0) return;

      try {
        const studentList = await getStudentsBySection(activeSelectedClass.section_id);
        if (studentList && Array.isArray(studentList) && studentList.length > 0) {
          setStudentsBySection((prev) => ({
            ...prev,
            [classKey]: studentList.map((s) => ({
              id: s.id,
              lrn: s.lrn,
              firstName: s.firstName || s.first_name,
              lastName: s.lastName || s.last_name,
              middleName: s.middleName || s.middle_name || "",
              sex: s.sex || "M",
              term1: s.term1 || 85,
              term2: s.term2 || 88,
              term3: s.term3 || 90,
            })),
          }));
        }
      } catch (err) {
        console.error("Error fetching students for section:", err);
      }
    }

    fetchSectionStudents();
  }, [activeSelectedClass]);

  // Controls Filters and Sorting
  const [filterSubject, setFilterSubject] = useState("All");
  const [filterGrade, setFilterGrade] = useState("All");
  const [sortBy, setSortBy] = useState("sectionName");
  const [sortAscending, setSortAscending] = useState(true);

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

          <div className="controls-row">
            <div className="control-left">
              <div className="control-text">
                Filters:
              </div>

              <SelectFilter
                value={filterSubject}
                onChange={setFilterSubject}
                options={[
                  { value: "All", label: "All Subjects" },
                  ...subjectOptions
                    .filter((s) => s !== "All")
                    .map((s) => ({
                      value: s,
                      label: s,
                    })),
                ]}
                minWidth="150px"
              />

              <SelectFilter
                value={filterGrade}
                onChange={setFilterGrade}
                options={[
                  { value: "All", label: "All Grade Levels" },
                  ...gradeOptions
                    .filter((g) => g !== "All")
                    .map((g) => ({
                      value: g,
                      label: g,
                    })),
                ]}
                minWidth="150px"
              />
            </div>
            <div className="control-right">
              <div className="control-text">
                Sort by:
              </div>

              <SelectFilter
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "sectionName", label: "Section Name" },
                  { value: "gradeLevel", label: "Grade Level" },
                  { value: "subject", label: "Subject" },
                ]}
                minWidth="150px"
              />

              <button
                className="sort-order-btn"
                onClick={() => setSortAscending(!sortAscending)}
                title="Toggle sorting order"
              >
                < ArrowDownNarrowWide
                  size={22}
                  style={{ transform: sortAscending ? "none" : "rotate(180deg)" }}
                />
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
              <style>{`@keyframes spinLoader { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <Loader2 size={32} style={{ animation: "spinLoader 1s linear infinite", marginBottom: "12px", color: "#C9A227" }} />
              <p style={{ fontWeight: 500, fontSize: "15px" }}>Loading assigned classes...</p>
            </div>
          ) : filteredAndSortedClasses.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#ffffff", borderRadius: "16px", color: "#64748b", border: "1px solid #eef2f6" }}>
              <p style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>No assigned classes found</p>
              <p style={{ fontSize: "14px" }}>Try adjusting your search filters above.</p>
            </div>
          ) : (
            <div className="classes-grid">
              {filteredAndSortedClasses.map((cls) => (
                <ClassCard
                  key={cls.id} cls={cls}
                  onView={(c) => { setactiveSelectedClass(c); setCurrentView("section-details"); }}
                  onGradingSheet={(c) => { setactiveSelectedClass(c); setCurrentView("grading-sheet"); }}
                  onEdit={(c) => { setactiveSelectedClass(c); setCurrentView("class-record"); }}
                />
              ))}
            </div>
          )}
        </>
      ) : currentView === "class-record" ? (
        <ClassRecord
          activeClass={activeSelectedClass}
          onBack={() => setCurrentView("dashboard")}
        />
      ) : currentView === "section-details" ? (
        <SectionDetails
          student={activeSelectedClass}
          userRole={userRole}
          onBack={() => setCurrentView("dashboard")}
        />
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

    </div>
  );
}