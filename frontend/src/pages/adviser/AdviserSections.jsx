import PageSkeleton from '../../components/common/PageSkeleton.jsx';
import { useState, useMemo, useEffect, useRef } from "react";
import { ArrowDownNarrowWide, X, Archive, RotateCcw, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

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
import { getAdviserSections, getArchivedSections, archiveClass, restoreClass, getStudentsBySection } from "../../services/sectionService";
import { getTeacherGradingSummary, submitTeacherGrades } from "../../services/classRecordApi.js";

// Style
import "../../styles/sections.css";
import "../../styles/attendanceSheet.css";

import { normalizeRole } from "../../utils/auth";

export default function AdviserSections({ userRole: propUserRole, isArchivedView: propIsArchivedView }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isArchived = Boolean(propIsArchivedView || location.pathname.includes('/archived-classes'));
  const storedUser = useMemo(() => getStoredUser(), []);
  const normRole = useMemo(() => normalizeRole(storedUser?.role, storedUser), [storedUser]);
  const userRole = propUserRole || (normRole === "adviser" ? "adviser" : "teacher");

  const [classes, setClasses] = useState(() => {
    if (isArchived) return [];
    try {
      const u = getStoredUser();
      const uid = u?.user_id || u?.id;
      if (uid) {
        const raw = localStorage.getItem(`auralis_assigned_classes_${uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (_) {}
    return [];
  });
  const [studentsBySection, setStudentsBySection] = useState({});
  const [loading, setLoading] = useState(() => {
    if (isArchived) return true;
    try {
      const u = getStoredUser();
      const uid = u?.user_id || u?.id;
      if (uid) {
        const raw = localStorage.getItem(`auralis_assigned_classes_${uid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return false;
        }
      }
    } catch (_) {}
    return true;
  });
  const [classesError, setClassesError] = useState('');
  const [classesReadVersion, setClassesReadVersion] = useState(0);
  const [recordReadVersion, setRecordReadVersion] = useState(0);
  const [recordReadError, setRecordReadError] = useState("");
  const [gradingLoading, setGradingLoading] = useState(false);

  // Hamburger Menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  // In-Card Selection Mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch sections from backend
  useEffect(() => {
    let cancelled = false;
    async function fetchAdviserClasses(force = false) {
      setClasses(prev => {
        if (!prev || prev.length === 0) setLoading(true);
        return prev;
      });
      setClassesError('');
      try {
        const user = getStoredUser();
        const userId = user?.user_id || user?.id;
        if (!userId) throw new Error('Please sign in to view your classes.');
        const fetched = isArchived
          ? await getArchivedSections(userId, { force })
          : await getAdviserSections(userId, { force });
        if (cancelled) return;

        let cachedLocalClasses = null;
        if (!isArchived && userId) {
          try {
            const raw = localStorage.getItem(`auralis_assigned_classes_${userId}`);
            if (raw) cachedLocalClasses = JSON.parse(raw);
          } catch (_) {}
        }

        if (Array.isArray(fetched)) {
          setClasses(fetched);
        } else if (typeof navigator !== 'undefined' && !navigator.onLine && Array.isArray(cachedLocalClasses) && cachedLocalClasses.length > 0) {
          setClasses(cachedLocalClasses);
        } else {
          setClasses([]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching adviser sections:", err);
        const user = getStoredUser();
        const userId = user?.user_id || user?.id;

        let cachedLocalClasses = null;
        if (!isArchived && userId) {
          try {
            const raw = localStorage.getItem(`auralis_assigned_classes_${userId}`);
            if (raw) cachedLocalClasses = JSON.parse(raw);
          } catch (_) {}
        }

        if (Array.isArray(cachedLocalClasses) && cachedLocalClasses.length > 0) {
          setClasses(cachedLocalClasses);
        } else {
          setClassesError(err.message || (isArchived ? 'Archived classes could not be loaded.' : 'Assigned classes could not be loaded.'));
          setClasses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const handleClassesRefreshed = (e) => {
      const refreshed = e.detail?.sections;
      if (Array.isArray(refreshed) && !isArchived && !cancelled) {
        setClasses(refreshed);
      }
    };
    const handleCacheInvalidated = () => {
      if (!cancelled) fetchAdviserClasses(true);
    };
    window.addEventListener('auralis-classes-refreshed', handleClassesRefreshed);
    window.addEventListener('auralis-cache-invalidated', handleCacheInvalidated);

    fetchAdviserClasses(true);
    return () => {
      cancelled = true;
      window.removeEventListener('auralis-classes-refreshed', handleClassesRefreshed);
      window.removeEventListener('auralis-cache-invalidated', handleCacheInvalidated);
    };
  }, [classesReadVersion, isArchived, location.pathname]);

  // Navigation View State
  const [currentView, setCurrentView] = useState(
    location.state?.currentView || "dashboard"
  );
  const [activeSelectedClass, setactiveSelectedClass] = useState(
    location.state?.activeSelectedClass || null
  );

  useEffect(() => {
    if (location.state?.currentView) {
      setCurrentView(location.state.currentView);
    }
    if (location.state?.activeSelectedClass) {
      setactiveSelectedClass(location.state.activeSelectedClass);
    }
  }, [location.state]);
  const classKey = activeSelectedClass?.id;
  const sectionId = activeSelectedClass?.section_id || activeSelectedClass?.id;
  const offeringId = activeSelectedClass?.subject_offering_id || activeSelectedClass?.offering_id || null;
  const subjectId = activeSelectedClass?.subject_id || null;
  const subjectName = activeSelectedClass?.subject || activeSelectedClass?.subject_name || null;
  const schoolYearId = activeSelectedClass?.school_year_id || activeSelectedClass?.schoolYearId;

  // Fetch students when a section is opened
  useEffect(() => {
    let cancelled = false;
    async function fetchSectionStudents() {
      // Section Details and Class Record load their own records. Only the grading
      // sheet needs this read; depending on the whole class object repeated it.
      if (currentView !== "grading-sheet" || !sectionId) return;
      setRecordReadError("");
      setGradingLoading(true);

      try {
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
      } finally {
        if (!cancelled) setGradingLoading(false);
      }
    }

    fetchSectionStudents();
    return () => { cancelled = true; };
  }, [currentView, classKey, sectionId, offeringId, subjectId, subjectName, schoolYearId, recordReadVersion]);

  // Controls Filters and Sorting
  const [filterSubject, setFilterSubject] = useState("All");
  const [filterGrade, setFilterGrade] = useState("All");
  const [filterClassType, setFilterClassType] = useState("All");
  const [sortBy, setSortBy] = useState("sectionName");
  const [sortAscending, setSortAscending] = useState(true);

  const hasActiveFilters = filterSubject !== "All" || filterGrade !== "All" || filterClassType !== "All";

  const clearFilters = () => {
    setFilterSubject("All");
    setFilterGrade("All");
    setFilterClassType("All");
  };

  const classCards = useMemo(() => {
    const sectionKey = (cls) => `${cls.section_id}:${cls.school_year_id || cls.schoolYearId || ""}`;
    const advisoryClasses = new Map(classes
      .filter((cls) => cls.assignmentType === "advisory")
      .map((cls) => [sectionKey(cls), cls]));
    const teachingSections = new Set(classes
      .filter((cls) => cls.assignmentType === "teaching")
      .map(sectionKey));
    const combinedSections = new Set();

    return classes.flatMap((cls) => {
      const key = sectionKey(cls);
      if (cls.assignmentType === "advisory" && teachingSections.has(key)) return [];
      const advisory = advisoryClasses.get(key);
      if (cls.assignmentType !== "teaching" || !advisory || combinedSections.has(key)) return [cls];
      combinedSections.add(key);
      // Keep the teaching context for subject grades and retain the adviser assignment for adviser actions.
      return [{ ...cls, isAdviser: true, classType: advisory.classType, advisoryView: advisory }];
    });
  }, [classes]);

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
    let result = [...classCards];
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
  }, [classCards, filterSubject, filterGrade, filterClassType, sortBy, sortAscending]);

  const subjectOptions = useMemo(() => ["All", ...Array.from(new Set(classCards.map((c) => c.subject)))], [classCards]);
  const gradeOptions = useMemo(() => ["All", ...Array.from(new Set(classCards.map((c) => c.gradeLevel)))], [classCards]);

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

  const toggleSelectClass = (id) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedClassIds.length === filteredAndSortedClasses.length) {
      setSelectedClassIds([]);
    } else {
      setSelectedClassIds(filteredAndSortedClasses.map((c) => c.id));
    }
  };

  const handleConfirmBatchArchive = async () => {
    if (selectedClassIds.length === 0) return;
    try {
      setActionLoading(true);
      const user = getStoredUser();
      const userId = user?.user_id || user?.id;
      if (!userId) throw new Error('Please sign in before archiving a class.');

      const classesToArchive = classCards.filter((c) => selectedClassIds.includes(c.id));

      for (const target of classesToArchive) {
        await archiveClass({
          userId,
          assignmentType: target.assignmentType,
          assignmentId: target.assignmentId,
          sectionId: target.section_id,
          schoolYearId: target.school_year_id || target.schoolYearId,
          advisoryAssignmentId: target.adviser_assignment_id || target.advisoryView?.adviser_assignment_id,
          teacherAssignmentId: target.teacher_assignment_id,
        });
      }

      triggerToast(`Successfully archived ${classesToArchive.length} class(es).`, "success");
      setIsSelectionMode(false);
      setSelectedClassIds([]);
      const targetPath = userRole === "teacher" ? "/teacher/archived-classes" : "/adviser/archived-classes";
      navigate(targetPath);
      setClassesReadVersion((v) => v + 1);
    } catch (err) {
      console.error("Batch archive error:", err);
      triggerToast(err.message || "Failed to archive classes.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBatchRestore = async () => {
    if (selectedClassIds.length === 0) return;
    try {
      setActionLoading(true);
      const user = getStoredUser();
      const userId = user?.user_id || user?.id;
      if (!userId) throw new Error('Please sign in before restoring a class.');

      const classesToRestore = classCards.filter((c) => selectedClassIds.includes(c.id));

      for (const target of classesToRestore) {
        await restoreClass({
          userId,
          assignmentType: target.assignmentType,
          assignmentId: target.assignmentId,
          sectionId: target.section_id,
          schoolYearId: target.school_year_id || target.schoolYearId,
          advisoryAssignmentId: target.adviser_assignment_id || target.advisoryView?.adviser_assignment_id,
          teacherAssignmentId: target.teacher_assignment_id,
        });
      }

      triggerToast(`Successfully restored ${classesToRestore.length} class(es).`, "success");
      setIsSelectionMode(false);
      setSelectedClassIds([]);
      const targetPath = userRole === "teacher" ? "/teacher/sections" : "/adviser/sections";
      navigate(targetPath);
      setClassesReadVersion((v) => v + 1);
    } catch (err) {
      console.error("Batch restore error:", err);
      triggerToast(err.message || "Failed to restore classes.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const activeSelectedClassData = useMemo(() => {
    if (!activeSelectedClass) return null;

    return (
      { ...(classes.find((c) => c.id === activeSelectedClass.id || (c.subject_offering_id && activeSelectedClass.subject_offering_id && Number(c.subject_offering_id) === Number(activeSelectedClass.subject_offering_id))) || {}), ...activeSelectedClass }
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
          <div className="sections-header" style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 className="sections-title">{isArchived ? "Archived Classes" : "Assigned Classes"}</h1>
                <p className="sections-subtext">
                  {isArchived
                    ? "View and restore classes from previous school years or manually archived classes."
                    : "View all your assigned classes and their corresponding details."}
                </p>
              </div>

              {/* Header Right Actions: Hamburger Menu (+ Back button when on archived view) */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", position: "relative" }} ref={menuRef}>
                {isArchived && (
                  <button
                    type="button"
                    onClick={() => navigate(userRole === "teacher" ? "/teacher/sections" : "/adviser/sections")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#112D61",
                      backgroundColor: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      padding: "7px 14px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#e2e8f0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#f1f5f9";
                    }}
                    title="Back to Assigned Classes"
                  >
                    <span>← Back to Assigned Classes</span>
                  </button>
                )}

                {/* Hamburger menu button */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    aria-label="Class options menu"
                    title="Options"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      backgroundColor: isMenuOpen ? "#e2e8f0" : "#ffffff",
                      color: "#1e293b",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isMenuOpen) e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      if (!isMenuOpen) e.currentTarget.style.backgroundColor = "#ffffff";
                    }}
                  >
                    <Menu size={18} />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "42px",
                        backgroundColor: "#ffffff",
                        borderRadius: "12px",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)",
                        border: "1px solid #e2e8f0",
                        padding: "6px",
                        minWidth: "190px",
                        zIndex: 1000,
                      }}
                    >
                      {!isArchived ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              setSelectedClassIds([]);
                              setIsSelectionMode(true);
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 14px",
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "#334155",
                              border: "none",
                              background: "transparent",
                              borderRadius: "8px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f8fafc";
                              e.currentTarget.style.color = "#0f172a";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                              e.currentTarget.style.color = "#334155";
                            }}
                          >
                            <Archive size={16} style={{ color: "#64748b" }} />
                            <span>Archive Classes</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              navigate(userRole === "teacher" ? "/teacher/archived-classes" : "/adviser/archived-classes");
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 14px",
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "#334155",
                              border: "none",
                              background: "transparent",
                              borderRadius: "8px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f8fafc";
                              e.currentTarget.style.color = "#0f172a";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                              e.currentTarget.style.color = "#334155";
                            }}
                          >
                            <RotateCcw size={16} style={{ color: "#64748b" }} />
                            <span>Archived Classes</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              setSelectedClassIds([]);
                              setIsSelectionMode(true);
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 14px",
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "#16a34a",
                              border: "none",
                              background: "transparent",
                              borderRadius: "8px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f0fdf4";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <RotateCcw size={16} style={{ color: "#16a34a" }} />
                            <span>Restore Classes</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              navigate(userRole === "teacher" ? "/teacher/sections" : "/adviser/sections");
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 14px",
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "#334155",
                              border: "none",
                              background: "transparent",
                              borderRadius: "8px",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f8fafc";
                              e.currentTarget.style.color = "#0f172a";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "transparent";
                              e.currentTarget.style.color = "#334155";
                            }}
                          >
                            <Archive size={16} style={{ color: "#64748b" }} />
                            <span>Assigned Classes</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* In-Card Selection Action Bar */}
          {isSelectionMode && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                backgroundColor: isArchived ? "#f0fdf4" : "#eff6ff",
                border: isArchived ? "1.5px solid #86efac" : "1.5px solid #bfdbfe",
                borderRadius: "14px",
                padding: "12px 18px",
                marginBottom: "18px",
                boxShadow: "0 4px 14px rgba(17, 45, 97, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#1e293b",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={filteredAndSortedClasses.length > 0 && selectedClassIds.length === filteredAndSortedClasses.length}
                    onChange={toggleSelectAll}
                    style={{
                      width: "18px",
                      height: "18px",
                      cursor: "pointer",
                      accentColor: isArchived ? "#16a34a" : "#112D61",
                    }}
                  />
                  <span>Select All ({filteredAndSortedClasses.length})</span>
                </label>

                <span style={{ fontSize: "13px", fontWeight: 600, color: isArchived ? "#15803d" : "#1d4ed8" }}>
                  {selectedClassIds.length} of {filteredAndSortedClasses.length} class(es) selected
                </span>

                <span style={{ fontSize: "13px", color: "#64748b" }}>
                  (Click any card to select or deselect)
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedClassIds([]);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: actionLoading ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>

                {!isArchived ? (
                  <button
                    type="button"
                    disabled={actionLoading || selectedClassIds.length === 0}
                    onClick={handleConfirmBatchArchive}
                    style={{
                      padding: "8px 22px",
                      borderRadius: "10px",
                      border: "none",
                      backgroundColor: selectedClassIds.length === 0 ? "#94a3b8" : "#112D61",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: actionLoading || selectedClassIds.length === 0 ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: selectedClassIds.length === 0 ? "none" : "0 2px 4px rgba(17, 45, 97, 0.2)",
                    }}
                  >
                    <Archive size={15} />
                    <span>{actionLoading ? "Archiving..." : `Archive Selected (${selectedClassIds.length})`}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={actionLoading || selectedClassIds.length === 0}
                    onClick={handleConfirmBatchRestore}
                    style={{
                      padding: "8px 22px",
                      borderRadius: "10px",
                      border: "none",
                      backgroundColor: selectedClassIds.length === 0 ? "#94a3b8" : "#16a34a",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: actionLoading || selectedClassIds.length === 0 ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      boxShadow: selectedClassIds.length === 0 ? "none" : "0 2px 4px rgba(22, 163, 74, 0.2)",
                    }}
                  >
                    <RotateCcw size={15} />
                    <span>{actionLoading ? "Restoring..." : `Restore Selected (${selectedClassIds.length})`}</span>
                  </button>
                )}
              </div>
            </div>
          )}

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

              {hasActiveFilters && (
                <button
                  type="button"
                  className="sections-clear-filters"
                  onClick={clearFilters}
                  title="Clear all filters"
                >
                  <X size={13} /> Clear
                </button>
              )}
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

          {classesError && <div role="alert">{classesError}<button type="button" onClick={() => setClassesReadVersion(value => value + 1)}>Retry</button></div>}
          {loading ? (
            <PageSkeleton label={isArchived ? "Loading archived classes" : "Loading assigned classes"} layout="cards" rows={6} />
          ) : classesError ? null : filteredAndSortedClasses.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", backgroundColor: "#ffffff", borderRadius: "16px", color: "#64748b", border: "1px solid #eef2f6" }}>
              <p style={{ fontWeight: 600, fontSize: "16px", marginBottom: "4px" }}>
                {isArchived ? "No archived classes found" : "No assigned classes found"}
              </p>
              <p style={{ fontSize: "14px" }}>
                {isArchived ? "Archived classes from ended school years or manually archived classes will appear here." : "Try adjusting your search filters above."}
              </p>
            </div>
          ) : (
            <div className="classes-grid">
              {filteredAndSortedClasses.map((cls) => (
                <ClassCard
                  key={cls.id} cls={cls}
                  selectable={isSelectionMode}
                  selected={selectedClassIds.includes(cls.id)}
                  onToggleSelect={() => toggleSelectClass(cls.id)}
                  secondaryActionsDisabled={!(
                    (Number.isInteger(Number(cls.subject_offering_id || cls.offering_id)) && Number(cls.subject_offering_id || cls.offering_id) > 0)
                    || cls.isAdviser
                  )}
                  secondaryActionsDisabledReason="No teaching subject or advisory assignment is associated with this class."
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
          key={`att-${activeSelectedClass?.teacher_assignment_id || activeSelectedClass?.adviser_assignment_id || activeSelectedClass?.assignmentId || activeSelectedClass?.section_id || activeSelectedClass?.id || "default"}`}
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
            loading={!recordReadError && (gradingLoading || !Object.hasOwn(studentsBySection, activeSelectedClass.id))}
            onRetry={() => setRecordReadVersion(version => version + 1)}
          />
        )
      )}


    </div>
  );
}
