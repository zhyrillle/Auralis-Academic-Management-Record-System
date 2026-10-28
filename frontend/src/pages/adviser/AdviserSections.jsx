import { useState, useMemo, useEffect } from "react";
import { ArrowDownNarrowWide, Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";

// Components
import SelectFilter from "../../components/common/SelectFilter.jsx";
import ClassCard from "../../components/sections/ClassCard";
import GradingSheet from "./GradingSheet"; // Imported the separated component
import ClassRecord from "./ClassRecord.jsx";
import SectionDetails from "./SectionDetails.jsx";
import AttendanceSheet from "./AttendanceSheet.jsx";
import PhilIri from "./PhilIri.jsx";
import Toast from "../../components/common/Toast.jsx";

// Auth & Services
import { getStoredUser } from "../../utils/auth";
import { getAdviserSections, getStudentsBySection } from "../../services/sectionService";
import { getTeacherGradingSummary, submitTeacherGrades } from "../../services/classRecordApi.js";

// Style
import "../../styles/sections.css";
import "../../styles/attendanceSheet.css";

import { normalizeRole } from "../../utils/auth";

export default function AdviserSections({ userRole: propUserRole }) {
  const location = useLocation();
  const storedUser = useMemo(() => getStoredUser(), []);
  const normRole = useMemo(() => normalizeRole(storedUser?.role, storedUser), [storedUser]);
  const userRole = propUserRole || (normRole === "adviser" ? "adviser" : "teacher");

  const [classes, setClasses] = useState([]);
  const [studentsBySection, setStudentsBySection] = useState({});
  const [loading, setLoading] = useState(true);
  const [recordReadVersion, setRecordReadVersion] = useState(0);
  const [recordReadError, setRecordReadError] = useState("");

  // Fetch sections from backend
  useEffect(() => {
    async function fetchAdviserClasses() {
      setLoading(true);
      try {
        const user = getStoredUser();
        const userId = user?.user_id || user?.id || 1;
        const fetched = await getAdviserSections(userId);

        if (fetched && Array.isArray(fetched) && fetched.length > 0) {
          setClasses(fetched);
        } else {
          setClasses([]);
        }
      } catch (err) {
        console.error("Error fetching adviser sections:", err);
        setClasses([]);
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
    let cancelled = false;
    async function fetchSectionStudents() {
      if (!activeSelectedClass) return;
      const sectionId = activeSelectedClass.section_id || activeSelectedClass.id;
      if (!sectionId) return;
      const classKey = activeSelectedClass.id;
      const offeringId = activeSelectedClass.subject_offering_id || activeSelectedClass.offering_id || null;
      const subjectId = activeSelectedClass.subject_id || null;
      const subjectName = activeSelectedClass.subject || activeSelectedClass.subject_name || null;
      setRecordReadError("");

      try {
        const schoolYearId = activeSelectedClass.school_year_id || activeSelectedClass.schoolYearId;
        const summary = offeringId && schoolYearId ? await getTeacherGradingSummary({
          subject_offering_id: offeringId, section_id: sectionId, school_year_id: schoolYearId,
        }, { force: recordReadVersion > 0 }) : null;
        const studentList = summary ? summary.students : await getStudentsBySection(sectionId, offeringId, subjectId, subjectName);
        if (cancelled) return;
        if (summary) setactiveSelectedClass(prev => prev && prev.id === classKey
          ? {
              ...prev,
              active_term: summary.context.activeTerm || prev.active_term,
              submissionTerms: summary.context.submissionTerms,
              termDeadlines: summary.context.termDeadlines || prev.termDeadlines,
              deadline: (summary.context.termDeadlines && summary.context.activeTerm && summary.context.termDeadlines[summary.context.activeTerm])
                || summary.context.deadline
                || prev.deadline,
            } : prev);
        if (Array.isArray(studentList)) {
          setStudentsBySection((prev) => ({
            ...prev,
            [classKey]: studentList.map((s) => ({
              id: s.id,
              student_id: s.student_id || s.id,
              student_section_id: s.student_section_id,
              lrn: s.lrn,
              firstName: s.firstName || s.first_name,
              lastName: s.lastName || s.last_name,
              middleName: s.middleName || s.middle_name || "",
              sex: s.sex || "M",
              term1: s.term1 !== undefined && s.term1 !== null ? s.term1 : "",
              term2: s.term2 !== undefined && s.term2 !== null ? s.term2 : "",
              term3: s.term3 !== undefined && s.term3 !== null ? s.term3 : "",
              term1_ma: s.term1_ma !== undefined && s.term1_ma !== null ? s.term1_ma : "",
              term2_ma: s.term2_ma !== undefined && s.term2_ma !== null ? s.term2_ma : "",
              term3_ma: s.term3_ma !== undefined && s.term3_ma !== null ? s.term3_ma : "",
              term1_peh: s.term1_peh !== undefined && s.term1_peh !== null ? s.term1_peh : "",
              term2_peh: s.term2_peh !== undefined && s.term2_peh !== null ? s.term2_peh : "",
              term3_peh: s.term3_peh !== undefined && s.term3_peh !== null ? s.term3_peh : "",
            })),
          }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching students for section:", err);
        setRecordReadError(err.message || "Unable to load this grading sheet.");
        setStudentsBySection(prev => ({ ...prev, [classKey]: [] }));
      }
    }

    fetchSectionStudents();
    return () => { cancelled = true; };
  }, [activeSelectedClass, recordReadVersion]);

  // Controls Filters and Sorting
  const [filterSubject, setFilterSubject] = useState("All");
  const [filterGrade, setFilterGrade] = useState("All");
  const [filterClassType, setFilterClassType] = useState("All");
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
    if (filterClassType !== "All") {
      result = result.filter((c) => {
        const isSpec = Boolean(
          c?.is_specialized == 1 ||
          c?.is_specialized === true ||
          c?.is_specialized === "1" ||
          String(c?.is_specialized).toLowerCase() === "true" ||
          c?.classType === "Special Program"
        );
        const isAdv = !isSpec && (c?.isAdviser === true || c?.classType === "Advisory Class");
        const type = isSpec ? "Special Program" : isAdv ? "Advisory Class" : "Regular Class";
        return type === filterClassType;
      });
    }

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
  }, [classes, filterSubject, filterGrade, filterClassType, sortBy, sortAscending]);

  const subjectOptions = useMemo(() => ["All", ...Array.from(new Set(classes.map((c) => c.subject)))], [classes]);
  const gradeOptions = useMemo(() => ["All", ...Array.from(new Set(classes.map((c) => c.gradeLevel)))], [classes]);

  const handleUpdateQuarterlyGrades = (term, quarterlyGradesMap) => {
    if (!activeSelectedClass) return;
    const classId = activeSelectedClass.id;

    setStudentsBySection((prev) => {
      const currentList = prev[classId] || [];
      if (currentList.length === 0) return prev;

      const termKey =
        term === "T1" || String(term).includes("1")
          ? "term1"
          : term === "T2" || String(term).includes("2")
            ? "term2"
            : "term3";

      let updated = false;
      const updatedList = currentList.map((stud) => {
        const newGrade =
          quarterlyGradesMap[stud.id] ??
          quarterlyGradesMap[stud.student_id] ??
          quarterlyGradesMap[stud.lrn];

        if (newGrade !== undefined && newGrade !== null && newGrade !== "" && stud[termKey] !== Number(newGrade)) {
          updated = true;
          return { ...stud, [termKey]: Number(newGrade) };
        }
        return stud;
      });

      if (!updated) return prev;

      return {
        ...prev,
        [classId]: updatedList,
      };
    });
  };

  const handleGradeSubmit = async (classId, term) => {
    const classObj = classes.find(c => c.id === classId) || activeSelectedClass;
    const context = {
      subject_offering_id: classObj?.subject_offering_id || classObj?.offering_id,
      section_id: classObj?.section_id || classObj?.sectionId,
      school_year_id: classObj?.school_year_id || classObj?.schoolYearId,
      term,
    };
    if (!/^T[123]$/.test(term) || !context.subject_offering_id || !context.section_id || !context.school_year_id) {
      throw new Error('Load a valid class, school year, and term before submitting.');
    }
    const result = await submitTeacherGrades(context);
    setactiveSelectedClass(prev => prev?.id === classId ? { ...prev, submissionRevision: result.revision, submissionRefresh: Date.now() } : prev);
    // A failed follow-up read must not pretend the already committed submission failed.
    try {
      const summary = await getTeacherGradingSummary(context, { force: true });
      setStudentsBySection(prev => ({ ...prev, [classId]: summary.students }));
      setactiveSelectedClass(prev => prev?.id === classId ? {
        ...prev,
        submissionTerms: summary.context.submissionTerms,
        termDeadlines: summary.context.termDeadlines || prev?.termDeadlines,
        deadline: (summary.context.termDeadlines && summary.context.activeTerm && summary.context.termDeadlines[summary.context.activeTerm])
          || summary.context.deadline
          || prev?.deadline,
      } : prev);
    } catch {
      triggerToast('Submission confirmed. Reload the grading sheet to retrieve its latest grades.', 'warning');
    }
    return result;
  };

  const activeSelectedClassData = useMemo(() => {
    if (!activeSelectedClass) return null;

    return (
      { ...(classes.find((c) => c.id === activeSelectedClass.id) || {}), ...activeSelectedClass }
    );
  }, [classes, activeSelectedClass]);

  return (
    <div className="sections-page-container">
      {/* Bottom-Right Toast Notifications */}
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          variant={t.type === "error" ? "error" : "success"}
          onDismiss={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
        />
      ))}

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

              <SelectFilter
                value={filterClassType}
                onChange={setFilterClassType}
                options={[
                  { value: "All", label: "All Class Types" },
                  { value: "Regular Class", label: "Regular Class" },
                  { value: "Advisory Class", label: "Advisory Class" },
                  { value: "Special Program", label: "Special Program" }
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
                  secondaryActionsDisabled={!(Number.isInteger(Number(cls.subject_offering_id || cls.offering_id))
                    && Number(cls.subject_offering_id || cls.offering_id) > 0)}
                  secondaryActionsDisabledReason="No teaching subject is assigned to you for this class. Use View to see the advisory section."
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
          key={`cr-${activeSelectedClass?.subject_offering_id || activeSelectedClass?.section_id || activeSelectedClass?.id || "default"}`}
          activeClass={activeSelectedClass}
          onBack={() => setCurrentView("dashboard")}
          onAttendance={(cls) => {
            setactiveSelectedClass(cls || activeSelectedClass);
            setCurrentView("attendance-sheet");
          }}
          onPhilIri={(cls) => {
            setactiveSelectedClass(cls || activeSelectedClass);
            setCurrentView("phil-iri");
          }}
          onUpdateQuarterlyGrades={handleUpdateQuarterlyGrades}
        />
      ) : currentView === "attendance-sheet" ? (
        <AttendanceSheet
          key={`att-${activeSelectedClass?.section_id || activeSelectedClass?.id || "default"}`}
          activeClass={activeSelectedClass}
          onBack={() => setCurrentView("class-record")}
        />
      ) : currentView === "phil-iri" ? (
        <PhilIri
          key={`philiri-${activeSelectedClass?.section_id || activeSelectedClass?.id || "default"}`}
          activeClass={activeSelectedClass}
          onBack={() => setCurrentView("class-record")}
        />
      ) : currentView === "section-details" ? (
        <SectionDetails
          key={`${activeSelectedClass?.assignmentType || "section"}-${activeSelectedClass?.assignmentId || activeSelectedClass?.section_id || "details"}`}
          section={activeSelectedClass}
          student={activeSelectedClass}
          isAdviser={activeSelectedClass?.isAdviser}
          userRole={userRole}
          onBack={() => setCurrentView("dashboard")}
        />
      ) : (
        activeSelectedClass && (
          <GradingSheet
            activeSelectedClass={activeSelectedClassData || activeSelectedClass}
            students={studentsBySection[activeSelectedClass.id] || []}
            onBack={() => setCurrentView("dashboard")}
            triggerToast={triggerToast}
            calculateFinalGrade={calculateFinalGrade}
            onSubmit={handleGradeSubmit}
            recordError={recordReadError}
            onRetry={() => setRecordReadVersion(version => version + 1)}
          />
        )
      )}

    </div>
  );
}
