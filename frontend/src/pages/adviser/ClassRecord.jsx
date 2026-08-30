import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Edit2,
  X,
  Layers,
  Lock,
} from "lucide-react";
import backIconUrl from "../../assets/backButton.svg";
import unavailableIconUrl from "../../assets/adviser-assets/unavailableicon.png";
import "../../styles/ClassRecord.css";
import {
  getClassRecord,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  saveScoresBatch,
  downloadClassRecordExcel,
  API_BASE_URL,
} from "../../services/classRecordApi";
import {
  calculateStudentGrades,
  DEFAULT_JHS_WEIGHTS,
} from "../../utils/depedTransmutation";
import DepEdClassRecordPrintModal from "../../components/DepEdClassRecordPrintModal";

const OFFLINE_KEY_PREFIX = "auralis_class_record_pending_";
const CACHE_KEY_PREFIX = "auralis_class_record_cache_";

export default function ClassRecord({ activeClass, onBack, onAttendance }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  // Term state (defaults to T1, synchronized with DB active term on load)
  const [activeTerm, setActiveTerm] = useState("T1");
  const userSelectedTermRef = useRef(false);

  // Dynamic Section ID Resolution
  const sectionId = useMemo(() => {
    return (
      activeClass?.section_id ||
      activeClass?.sectionId ||
      params.sectionId ||
      params.id ||
      location.state?.section_id ||
      location.state?.activeClass?.section_id ||
      (typeof activeClass?.id === "number" ? activeClass.id : null) ||
      (typeof activeClass?.id === "string" && !isNaN(Number(activeClass.id)) ? Number(activeClass.id) : null) ||
      (typeof activeClass?.id === "string" && activeClass.id.startsWith("sec-") ? Number(activeClass.id.replace("sec-", "")) : null) ||
      (typeof activeClass?.id === "string" && activeClass.id.startsWith("class-") ? Number(activeClass.id.replace("class-", "")) : null) ||
      null
    );
  }, [activeClass, params, location]);

  // Subject offering ID resolution (falls back to sectionId if offering is not explicitly assigned)
  const subjectOfferingId = useMemo(() => {
    return (
      activeClass?.subject_offering_id ||
      activeClass?.offering_id ||
      params.subjectOfferingId ||
      params.offeringId ||
      location.state?.subject_offering_id ||
      sectionId ||
      1
    );
  }, [activeClass, params, location, sectionId]);

  // Sync / Cloud state (Google Docs inspiration: "saved" | "saving" | "offline")
  const [syncStatus, setSyncStatus] = useState("saved");
  const [isExporting, setIsExporting] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // DepEd JHS Class Record Export state
  const [classContextData, setClassContextData] = useState(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // Term Lock & Availability state
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [loadedTermName, setLoadedTermName] = useState("");
  const [activeTermName, setActiveTermName] = useState("");

  // Component weights (WW %, PT %, QA %)
  const [weights, setWeights] = useState(DEFAULT_JHS_WEIGHTS);

  // Assessment Columns (Default initial count: 1 per component)
  const [writtenWorkColumns, setWrittenWorkColumns] = useState([
    { id: "ww1", assessment_id: null, label: "1", activity_name: "Written Work 1", max_score: 20 },
  ]);

  const [performanceTaskColumns, setPerformanceTaskColumns] = useState([
    { id: "pt1", assessment_id: null, label: "1", activity_name: "Performance Task 1", max_score: 50 },
  ]);

  const [quarterlyAssessmentHPS, setQuarterlyAssessmentHPS] = useState(50);
  const [quarterlyAssessmentId, setQuarterlyAssessmentId] = useState(null);

  // Exceeded HPS inline validation state
  const [errorTooltip, setErrorTooltip] = useState(null); // { cellKey: string, message: string }
  const errorTooltipTimerRef = useRef(null);

  const showErrorTooltip = (cellKey, message) => {
    if (errorTooltipTimerRef.current) clearTimeout(errorTooltipTimerRef.current);
    setErrorTooltip({ cellKey, message });
    errorTooltipTimerRef.current = setTimeout(() => {
      setErrorTooltip(null);
    }, 2500);
  };

  // Students & Grades state
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState({});
  const gradesRef = useRef(grades);
  gradesRef.current = grades;

  // Modals for Add & Edit Column
  const [modalState, setModalState] = useState({
    isOpen: false,
    mode: "add", // "add" | "edit"
    category: "WW", // "WW" | "PT"
    categoryLabel: "Written Works",
    columnId: null,
    assessmentId: null,
    title: "",
    maxScore: "20",
    date: "",
  });

  const saveTimerRef = useRef(null);
  const pendingQueueRef = useRef(new Map());
  const isFlushingRef = useRef(false);
  const hasPendingFlushRef = useRef(false);

  // Sync pending queue from localStorage on offering/term change
  useEffect(() => {
    pendingQueueRef.current.clear();
    try {
      const raw = localStorage.getItem(`${OFFLINE_KEY_PREFIX}${subjectOfferingId}_${activeTerm}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            const key = `${item.student_id}_${item.assessment_id}`;
            pendingQueueRef.current.set(key, item);
          });
        }
      }
    } catch {}
  }, [subjectOfferingId, activeTerm]);

  // Flush pending offline scores to backend immediately (atomic & concurrency safe)
  const flushPendingScores = useCallback(async () => {
    if (isLocked) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (pendingQueueRef.current.size === 0) {
      setSyncStatus("saved");
      return;
    }

    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }

    if (isFlushingRef.current) {
      hasPendingFlushRef.current = true;
      return;
    }

    isFlushingRef.current = true;
    setSyncStatus("saving");

    // Take snapshot of current queue entries
    const snapshot = Array.from(pendingQueueRef.current.entries());
    const payloadScores = snapshot.map(([k, v]) => v);

    try {
      await saveScoresBatch({
        subject_offering_id: subjectOfferingId,
        term: activeTerm,
        scores: payloadScores,
      });

      // Remove only items from the snapshot (preserves newer inputs)
      snapshot.forEach(([k]) => {
        pendingQueueRef.current.delete(k);
      });

      // Update localStorage
      const remaining = Array.from(pendingQueueRef.current.values());
      if (remaining.length === 0) {
        localStorage.removeItem(`${OFFLINE_KEY_PREFIX}${subjectOfferingId}_${activeTerm}`);
        setSyncStatus("saved");
      } else {
        localStorage.setItem(
          `${OFFLINE_KEY_PREFIX}${subjectOfferingId}_${activeTerm}`,
          JSON.stringify(remaining)
        );
      }

      // Update cache
      try {
        localStorage.setItem(
          `${CACHE_KEY_PREFIX}${subjectOfferingId}_${activeTerm}`,
          JSON.stringify({
            students,
            grades: gradesRef.current,
            weights,
            wwCols: writtenWorkColumns,
            ptCols: performanceTaskColumns,
          })
        );
      } catch {}
    } catch (err) {
      console.warn("Auto-save sync offline fallback:", err.message);
      setSyncStatus("offline");
    } finally {
      isFlushingRef.current = false;
      if (hasPendingFlushRef.current || pendingQueueRef.current.size > 0) {
        hasPendingFlushRef.current = false;
        flushPendingScores();
      }
    }
  }, [isLocked, subjectOfferingId, activeTerm, students, weights, writtenWorkColumns, performanceTaskColumns]);

  // Online / Offline window listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (!isLocked) {
        setSyncStatus("saving");
        flushPendingScores();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (!isLocked) {
        setSyncStatus("offline");
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isLocked, flushPendingScores]);

  // Flush pending saves on unmount / navigation
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (pendingQueueRef.current.size > 0 && navigator.onLine) {
        const payloadScores = Array.from(pendingQueueRef.current.values());
        try {
          fetch(`${API_BASE_URL}/scores/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject_offering_id: subjectOfferingId,
              term: activeTerm,
              scores: payloadScores,
            }),
            keepalive: true,
          });
          localStorage.removeItem(`${OFFLINE_KEY_PREFIX}${subjectOfferingId}_${activeTerm}`);
        } catch (e) {
          console.warn("Unmount keepalive sync error:", e);
        }
      }
    };
  }, [subjectOfferingId, activeTerm]);

  // Page reload / tab close beforeunload guard
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingQueueRef.current.size > 0 && navigator.onLine) {
        const payloadScores = Array.from(pendingQueueRef.current.values());
        const payload = JSON.stringify({
          subject_offering_id: subjectOfferingId,
          term: activeTerm,
          scores: payloadScores,
        });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(`${API_BASE_URL}/scores/batch`, blob);
        localStorage.removeItem(`${OFFLINE_KEY_PREFIX}${subjectOfferingId}_${activeTerm}`);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [subjectOfferingId, activeTerm]);

  // ============================================================
  // LOAD DATA FROM BACKEND OR LOCAL CACHE
  // ============================================================
  const loadClassRecord = useCallback(
    async (termToLoad) => {
      // 1. Reset current state immediately to clear stale students from previous sections
      setStudents([]);
      setGrades({});

      // 2. Fetch fresh data from backend with dynamic subjectOfferingId & sectionId
      try {
        const data = await getClassRecord(subjectOfferingId, termToLoad, sectionId);

        if (data && data.class_context) {
          setClassContextData(data.class_context);

          // Sync active ongoing term on initial load if user hasn't explicitly chosen one
          if (data.active_term && !userSelectedTermRef.current && data.active_term !== termToLoad) {
            setActiveTerm(data.active_term);
            return;
          }

          const isSheetLocked = Boolean(
            data.is_locked ?? (data.grade_sheet ? !data.grade_sheet.is_editable : false)
          );
          setIsLocked(isSheetLocked);
          setLockReason(data.lock_reason || (isSheetLocked ? "CLOSED_TERM" : ""));
          setLoadedTermName(data.current_term_name || data.term_name || termToLoad);
          if (data.active_term_name) setActiveTermName(data.active_term_name);

          if (data.component_weights) {
            setWeights(data.component_weights);
          }

          const wwCols = [];
          const ptCols = [];
          let qaHps = 50;
          let qaId = null;

          if (Array.isArray(data.assessments) && data.assessments.length > 0) {
            data.assessments.forEach((ass) => {
              const compCode = (ass.component_code || "").toUpperCase();
              const type = (ass.type || ass.assessment_type || "").toLowerCase();

              const isWW = compCode === "WW" || type === "writtenwork" || type === "writtenworks" || type.includes("written");
              const isPT = compCode === "PT" || type === "performancetask" || type === "performancetasks" || type.includes("performance");
              const isQA = compCode === "QA" || compCode === "STE" || type === "quarterlyassessment" || type === "quarterlyassessments" || type.includes("quarterly");

              const aId = ass.assessment_id || ass.activity_id;

              if (isWW) {
                wwCols.push({
                  id: `ww_${aId}`,
                  assessment_id: aId,
                  label: String(wwCols.length + 1),
                  activity_name: ass.activity_name || ass.title || `Written Work ${wwCols.length + 1}`,
                  max_score: Number(ass.max_score || ass.highest_possible_score || 20),
                  date: ass.activity_date,
                });
              } else if (isPT) {
                ptCols.push({
                  id: `pt_${aId}`,
                  assessment_id: aId,
                  label: String(ptCols.length + 1),
                  activity_name: ass.activity_name || ass.title || `Performance Task ${ptCols.length + 1}`,
                  max_score: Number(ass.max_score || ass.highest_possible_score || 50),
                  date: ass.activity_date,
                });
              } else if (isQA) {
                qaHps = Number(ass.max_score || ass.highest_possible_score || 50);
                qaId = aId;
              }
            });
          }

          if (wwCols.length > 0) setWrittenWorkColumns(wwCols);
          if (ptCols.length > 0) setPerformanceTaskColumns(ptCols);
          setQuarterlyAssessmentHPS(qaHps);
          setQuarterlyAssessmentId(qaId);

          if (Array.isArray(data.students)) {
            const loadedStudents = data.students.map((st) => ({
              id: String(st.student_id),
              student_id: st.student_id,
              student_section_id: st.student_section_id,
              lrn: st.LRN,
              firstName: st.first_name,
              lastName: st.last_name,
              middleName: st.middle_name,
              sex: st.sex,
            }));
            setStudents(loadedStudents);

            const newGrades = {};
            data.students.forEach((st) => {
              const rawScores = st.scores || {};
              const wwGrades = {};
              const ptGrades = {};
              let qaGrade = "";

              wwCols.forEach((col) => {
                const val = rawScores[col.assessment_id] !== undefined ? rawScores[col.assessment_id] : rawScores[col.id];
                wwGrades[col.id] = val !== undefined && val !== null ? val : "";
              });

              ptCols.forEach((col) => {
                const val = rawScores[col.assessment_id] !== undefined ? rawScores[col.assessment_id] : rawScores[col.id];
                ptGrades[col.id] = val !== undefined && val !== null ? val : "";
              });

              if (qaId && rawScores[qaId] !== undefined && rawScores[qaId] !== null) {
                qaGrade = rawScores[qaId];
              } else if (rawScores.qa !== undefined && rawScores.qa !== null) {
                qaGrade = rawScores.qa;
              }

              newGrades[String(st.student_id)] = {
                writtenWorks: wwGrades,
                performanceTasks: ptGrades,
                quarterlyAssessment: qaGrade,
              };
            });

            // Merge any offline pending scores that haven't been flushed yet
            const pendingList = Array.from(pendingQueueRef.current.values());
            if (pendingList.length > 0) {
              pendingList.forEach((item) => {
                const sId = String(item.student_id);
                if (newGrades[sId]) {
                  const wwCol = wwCols.find((c) => String(c.assessment_id) === String(item.assessment_id) || c.id === item.assessment_id);
                  if (wwCol) {
                    newGrades[sId].writtenWorks[wwCol.id] = item.raw_score !== null ? item.raw_score : "";
                  }
                  const ptCol = ptCols.find((c) => String(c.assessment_id) === String(item.assessment_id) || c.id === item.assessment_id);
                  if (ptCol) {
                    newGrades[sId].performanceTasks[ptCol.id] = item.raw_score !== null ? item.raw_score : "";
                  }
                  if (String(item.assessment_id) === String(qaId) || item.assessment_id === "qa") {
                    newGrades[sId].quarterlyAssessment = item.raw_score !== null ? item.raw_score : "";
                  }
                }
              });
            }

            setGrades(newGrades);

            if (pendingList.length > 0 && navigator.onLine) {
              flushPendingScores();
            }

            // Cache data in localStorage
            try {
              localStorage.setItem(
                `${CACHE_KEY_PREFIX}${subjectOfferingId}_${termToLoad}`,
                JSON.stringify({
                  students: loadedStudents,
                  grades: newGrades,
                  weights: data.component_weights,
                  wwCols,
                  ptCols,
                  qaId,
                  qaHps,
                  isLocked: isSheetLocked,
                })
              );
            } catch {}
          }

          setSyncStatus(isSheetLocked ? "locked" : "saved");
        }
      } catch (err) {
        console.warn("Offline or backend fallback:", err.message);
        setSyncStatus(navigator.onLine ? "saved" : "offline");
      }
    },
    [subjectOfferingId, sectionId]
  );

  useEffect(() => {
    if (subjectOfferingId || sectionId) {
      setStudents([]);
      setGrades({});
      loadClassRecord(activeTerm);
    }
  }, [subjectOfferingId, sectionId, activeTerm, loadClassRecord]);

  // Term switch handler with immediate flush
  const handleTermChange = (newTerm) => {
    if (newTerm === activeTerm) return;
    userSelectedTermRef.current = true;
    flushPendingScores();
    setActiveTerm(newTerm);
  };

  // Male & Female students separation
  const maleStudents = useMemo(() => students.filter((s) => s.sex === "M"), [students]);
  const femaleStudents = useMemo(() => students.filter((s) => s.sex === "F"), [students]);

  // Compute Total Highest Possible Scores
  const totalWW_HPS = useMemo(
    () => writtenWorkColumns.reduce((sum, col) => sum + Number(col.max_score || 0), 0),
    [writtenWorkColumns]
  );

  const totalPT_HPS = useMemo(
    () => performanceTaskColumns.reduce((sum, col) => sum + Number(col.max_score || 0), 0),
    [performanceTaskColumns]
  );

  // ============================================================
  // CONDITIONAL DISABLING FOR DOWNLOAD BUTTON
  // (Disabled if ANY score field for an active assessment is left blank/unfilled)
  // ============================================================
  const isDownloadDisabled = useMemo(() => {
    if (!students || students.length === 0) return true;
    if (writtenWorkColumns.length === 0 && performanceTaskColumns.length === 0) return true;

    for (const student of students) {
      const studentGradesObj = grades[student.id] || {};
      const ww = studentGradesObj.writtenWorks || {};
      const pt = studentGradesObj.performanceTasks || {};
      const qa = studentGradesObj.quarterlyAssessment;

      // Check all Written Works columns
      for (const col of writtenWorkColumns) {
        const val = ww[col.id];
        if (val === undefined || val === null || val === "" || isNaN(Number(val))) {
          return true; // Found blank/unencoded score
        }
      }

      // Check all Performance Tasks columns
      for (const col of performanceTaskColumns) {
        const val = pt[col.id];
        if (val === undefined || val === null || val === "" || isNaN(Number(val))) {
          return true; // Found blank/unencoded score
        }
      }

      // Check Quarterly Assessment
      if (qa === undefined || qa === null || qa === "" || isNaN(Number(qa))) {
        return true; // Found blank/unencoded QA score
      }
    }

    return false; // Complete non-null scores for all students!
  }, [students, grades, writtenWorkColumns, performanceTaskColumns]);

  // ============================================================
  // DEPED JHS EXPORT METADATA RESOLUTION
  // ============================================================
  const exportMetadata = useMemo(() => {
    const termLabelMap = {
      T1: "FIRST QUARTER",
      T2: "SECOND QUARTER",
      T3: "THIRD QUARTER",
      T4: "FOURTH QUARTER",
    };
    const quarterLabel =
      termLabelMap[activeTerm] ||
      (activeTerm.toUpperCase().includes("1")
        ? "FIRST QUARTER"
        : activeTerm.toUpperCase().includes("2")
        ? "SECOND QUARTER"
        : activeTerm.toUpperCase().includes("3")
        ? "THIRD QUARTER"
        : activeTerm.toUpperCase().includes("4")
        ? "FOURTH QUARTER"
        : `${activeTerm.toUpperCase()} QUARTER`);

    const rawGradeLevel =
      classContextData?.grade_level_name ||
      activeClass?.gradeLevel ||
      activeClass?.grade ||
      "Grade 10";
    const formattedGradeLevel = String(rawGradeLevel).toUpperCase().startsWith("GRADE")
      ? String(rawGradeLevel).toUpperCase()
      : `GRADE ${String(rawGradeLevel).toUpperCase()}`;
    const rawSection =
      classContextData?.section_name ||
      activeClass?.section_name ||
      activeClass?.sectionName ||
      "MAKAKALIKASAN";
    const gradeAndSection = `${formattedGradeLevel} - ${String(rawSection).toUpperCase()}`;

    let rawTeacher = classContextData?.teacher_name;
    if (!rawTeacher || rawTeacher.toLowerCase().includes("subject teacher")) {
      try {
        const storedUser = JSON.parse(localStorage.getItem("user") || "null");
        if (storedUser && (storedUser.first_name || storedUser.last_name)) {
          const parts = [
            storedUser.first_name,
            storedUser.middle_name,
            storedUser.last_name,
            storedUser.extension_name,
          ].filter(Boolean);
          rawTeacher = parts.join(" ");
        }
      } catch {}
    }
    if (!rawTeacher || rawTeacher.toLowerCase().includes("subject teacher")) {
      rawTeacher = activeClass?.teacher_name || activeClass?.teacherName || activeClass?.adviser || "";
    }
    const teacherName = rawTeacher ? String(rawTeacher).toUpperCase() : "";

    const rawSubject =
      classContextData?.subject_name ||
      activeClass?.subject_name ||
      activeClass?.subjectName ||
      activeClass?.subject ||
      "READING AND WRITING SKILLS";
    const subjectName = String(rawSubject).toUpperCase();

    const region = (classContextData?.region || activeClass?.region || "REGION X").toUpperCase();
    const division = (
      classContextData?.division ||
      activeClass?.division ||
      "GINGOOG CITY"
    ).toUpperCase();
    const schoolName = (
      classContextData?.school_name ||
      activeClass?.school_name ||
      "GINGOOG CITY COMPREHENSIVE NHS"
    ).toUpperCase();
    const schoolId =
      classContextData?.school_code ||
      activeClass?.school_code ||
      activeClass?.schoolId ||
      "304130";
    const schoolYear =
      classContextData?.school_year_label ||
      activeClass?.school_year ||
      activeClass?.schoolYear ||
      "2023-2024";

    return {
      region,
      division,
      schoolName,
      schoolId,
      schoolYear,
      quarterLabel,
      gradeAndSection,
      teacherName,
      subjectName,
      section: rawSection,
      subject: rawSubject,
      activeTerm,
    };
  }, [classContextData, activeClass, activeTerm]);

  // ============================================================
  // DEBOUNCED QUEUE AUTO-SAVER (Fast, non-blocking, concurrency safe)
  // ============================================================
  const queueScoreChange = useCallback(
    (assessmentId, studentId, studentSectionId, rawScore) => {
      if (isLocked) return;

      const key = `${studentId}_${assessmentId}`;
      const record = {
        assessment_id: assessmentId,
        student_id: studentId,
        student_section_id: studentSectionId,
        raw_score: rawScore === "" ? null : Number(rawScore),
      };

      pendingQueueRef.current.set(key, record);

      try {
        const allItems = Array.from(pendingQueueRef.current.values());
        if (allItems.length > 0) {
          localStorage.setItem(
            `${OFFLINE_KEY_PREFIX}${subjectOfferingId}_${activeTerm}`,
            JSON.stringify(allItems)
          );
        }
      } catch {}

      if (!navigator.onLine) {
        setSyncStatus("offline");
        return;
      }

      setSyncStatus("saving");

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushPendingScores();
      }, 350); // 350ms debounced auto-saver
    },
    [isLocked, subjectOfferingId, activeTerm, flushPendingScores]
  );

  const handleGradeChange = (studentId, category, columnId, value, colMaxScore, assessmentId) => {
    if (isLocked) return;

    const numVal = Number(value);
    const cellKey = `${studentId}_${columnId}`;
    const maxAllowed = Number(colMaxScore || 0);

    if (value !== "" && !isNaN(numVal) && numVal < 0) return;

    // Feature 1: Exceeded Highest Possible Score (HPS) Validation
    if (value !== "" && !isNaN(numVal) && maxAllowed > 0 && numVal > maxAllowed) {
      showErrorTooltip(cellKey, `Score cannot exceed ${maxAllowed}`);

      // Immediately clear/reset the invalid value so it cannot be saved
      setGrades((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [category]: {
            ...(prev[studentId]?.[category] || {}),
            [columnId]: "",
          },
        },
      }));

      const studentObj = students.find((s) => s.id === studentId || String(s.student_id) === studentId);
      if (studentObj) {
        queueScoreChange(
          assessmentId || columnId,
          studentObj.student_id,
          studentObj.student_section_id,
          ""
        );
      }
      return;
    }

    if (errorTooltip?.cellKey === cellKey) {
      setErrorTooltip(null);
    }

    setGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [category]: {
          ...(prev[studentId]?.[category] || {}),
          [columnId]: value,
        },
      },
    }));

    const studentObj = students.find((s) => s.id === studentId || String(s.student_id) === studentId);
    if (studentObj) {
      queueScoreChange(
        assessmentId || columnId,
        studentObj.student_id,
        studentObj.student_section_id,
        value
      );
    }
  };

  const handleSingleGradeChange = (studentId, field, value, maxScore, assessmentId) => {
    if (isLocked) return;

    const numVal = Number(value);
    const cellKey = `${studentId}_qa`;
    const maxAllowed = Number(maxScore || 0);

    if (value !== "" && !isNaN(numVal) && numVal < 0) return;

    // Feature 1: Exceeded Highest Possible Score (HPS) Validation for QA
    if (value !== "" && !isNaN(numVal) && maxAllowed > 0 && numVal > maxAllowed) {
      showErrorTooltip(cellKey, `Score cannot exceed ${maxAllowed}`);

      // Immediately clear/reset the invalid value so it cannot be saved
      setGrades((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: "",
        },
      }));

      const targetAssessmentId = assessmentId || quarterlyAssessmentId;
      const studentObj = students.find((s) => s.id === studentId || String(s.student_id) === studentId);
      if (studentObj) {
        queueScoreChange(
          targetAssessmentId || "qa",
          studentObj.student_id,
          studentObj.student_section_id,
          ""
        );
      }
      return;
    }

    if (errorTooltip?.cellKey === cellKey) {
      setErrorTooltip(null);
    }

    setGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value,
      },
    }));

    const targetAssessmentId = assessmentId || (field === "quarterlyAssessment" ? quarterlyAssessmentId : null);
    const studentObj = students.find((s) => s.id === studentId || String(s.student_id) === studentId);
    if (studentObj) {
      queueScoreChange(
        targetAssessmentId || "qa",
        studentObj.student_id,
        studentObj.student_section_id,
        value
      );
    }
  };

  // Immediate save on input blur
  const handleScoreBlur = () => {
    if (!isLocked) {
      flushPendingScores();
    }
  };

  // ============================================================
  // ADD / EDIT COLUMN MODAL
  // ============================================================
const formatToISODate = (val) => {
  if (!val) return "";
  const str = String(val).trim();
  if (str === "" || str === "null" || str === "undefined") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

  const openAddColumnModal = (category) => {
    if (isLocked) return;
    const isWW = category === "WW" || category === "writtenWorks" || category === "writtenWork";
    const currentCount = isWW ? writtenWorkColumns.length : performanceTaskColumns.length;
    setModalState({
      isOpen: true,
      mode: "add",
      category: isWW ? "WW" : "PT",
      categoryLabel: isWW ? "Written Work" : "Performance Task",
      columnId: null,
      assessmentId: null,
      title: isWW ? `Written Work ${currentCount + 1}` : `Performance Task ${currentCount + 1}`,
      maxScore: isWW ? "20" : "50",
      date: "",
    });
  };

  const openEditColumnModal = (column, category) => {
    if (isLocked) return;
    const isWW = category === "WW" || category === "writtenWorks" || category === "writtenWork";
    setModalState({
      isOpen: true,
      mode: "edit",
      category: isWW ? "WW" : "PT",
      categoryLabel: isWW ? "Written Work" : "Performance Task",
      columnId: column.id,
      assessmentId: column.assessment_id,
      title: column.activity_name || `${column.label}`,
      maxScore: String(column.max_score || 20),
      date: formatToISODate(column.date),
    });
  };

  const handleSaveModalColumn = async (e) => {
    e.preventDefault();
    if (isLocked) return;
    const { mode, category, columnId, assessmentId, title, maxScore, date } = modalState;
    const numMax = Number(maxScore);

    if (isNaN(numMax) || numMax <= 0) return;

    const safeDate = formatToISODate(date) || null;

    if (mode === "add") {
      try {
        const res = await createAssessment({
          subject_offering_id: subjectOfferingId,
          term: activeTerm,
          component_code: category,
          type: category === "WW" ? "writtenWork" : "performanceTask",
          activity_name: title,
          title: title,
          max_score: numMax,
          highest_possible_score: numMax,
          activity_date: safeDate,
        });

        const newAss = res.assessment;
        const newCol = {
          id: category === "WW" ? `ww_${newAss.assessment_id}` : `pt_${newAss.assessment_id}`,
          assessment_id: newAss.assessment_id,
          label: String(category === "WW" ? writtenWorkColumns.length + 1 : performanceTaskColumns.length + 1),
          activity_name: title,
          max_score: numMax,
          date: safeDate,
        };

        if (category === "WW") {
          setWrittenWorkColumns((prev) => [...prev, newCol]);
        } else {
          setPerformanceTaskColumns((prev) => [...prev, newCol]);
        }
      } catch (err) {
        const isWW = category === "WW";
        const newCol = {
          id: isWW ? `ww${writtenWorkColumns.length + 1}` : `pt${performanceTaskColumns.length + 1}`,
          assessment_id: Date.now(),
          label: String(isWW ? writtenWorkColumns.length + 1 : performanceTaskColumns.length + 1),
          activity_name: title,
          max_score: numMax,
          date: safeDate,
        };

        if (isWW) {
          setWrittenWorkColumns((prev) => [...prev, newCol]);
        } else {
          setPerformanceTaskColumns((prev) => [...prev, newCol]);
        }
      }
    } else {
      try {
        if (assessmentId) {
          const updatePayload = {
            activity_name: title,
            title: title,
            max_score: numMax,
            highest_possible_score: numMax,
          };
          if (safeDate) {
            updatePayload.activity_date = safeDate;
          }
          await updateAssessment(assessmentId, updatePayload);
        }

        if (category === "WW") {
          setWrittenWorkColumns((prev) =>
            prev.map((c) => (c.id === columnId ? { ...c, activity_name: title, max_score: numMax, date: safeDate } : c))
          );
        } else {
          setPerformanceTaskColumns((prev) =>
            prev.map((c) => (c.id === columnId ? { ...c, activity_name: title, max_score: numMax, date: safeDate } : c))
          );
        }
      } catch (err) {
        console.error("Error updating column:", err);
      }
    }

    setModalState((prev) => ({ ...prev, isOpen: false }));
  };

  const handleDeleteColumn = async (column, category) => {
    if (isLocked) return;
    if (!window.confirm(`Delete column "${column.activity_name || column.label}"?`)) return;

    try {
      if (column.assessment_id) {
        await deleteAssessment(column.assessment_id);
      }

      if (category === "WW") {
        setWrittenWorkColumns((prev) =>
          prev.filter((c) => c.id !== column.id).map((c, i) => ({ ...c, label: String(i + 1) }))
        );
      } else {
        setPerformanceTaskColumns((prev) =>
          prev.filter((c) => c.id !== column.id).map((c, i) => ({ ...c, label: String(i + 1) }))
        );
      }
    } catch (err) {
      console.error("Error deleting column:", err);
    }
  };

  // Download / Export handler: triggers DepEd standard landscape PDF preview and print
  const handleDownload = () => {
    if (isDownloadDisabled) return;
    setIsPdfModalOpen(true);
  };

  const isAvailable = activeTerm === "T1" || activeTerm === "T2" || activeTerm === "T3";
  const sectionName = activeClass?.sectionName || activeClass?.section_name || "Mahogany";

  return (
    <div className="class-record-page">
      {/* ============================================================
          HEADER (Exact original position with subtle Google Docs sync badge)
      ============================================================ */}
      <div className="class-record-header">
        <div className="class-record-title-area">
          <button className="class-record-back-btn" onClick={onBack} type="button" aria-label="Back">
            <img src={backIconUrl} alt="Back" />
          </button>
          <h1>Assigned Classes</h1>

          {/* GOOGLE DOCS STYLE AUTO-SAVE / OFFLINE / LOCKED INDICATOR */}
          <div
            className="gdocs-sync-status"
            title={
              isLocked
                ? `This class record belongs to a closed term (${loadedTermName || activeTerm}) and is read-only.`
                : syncStatus === "offline"
                ? "Working offline - changes will sync when online"
                : "All changes automatically saved"
            }
          >
            {isLocked ? (
              <span className="gdocs-status-item locked">
                <Lock size={14} />
                <span>Read-Only ({loadedTermName || activeTerm})</span>
              </span>
            ) : (
              <>
                {syncStatus === "saving" && (
                  <span className="gdocs-status-item saving">
                    <RefreshCw size={14} className="spin-icon" />
                    <span>Saving...</span>
                  </span>
                )}
                {syncStatus === "saved" && (
                  <span className="gdocs-status-item saved">
                    <Cloud size={15} />
                    <span>All changes saved to cloud</span>
                  </span>
                )}
                {syncStatus === "offline" && (
                  <span className="gdocs-status-item offline">
                    <CloudOff size={15} />
                    <span>Saved offline (Device)</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================
          SUBHEADER & ACTIONS (Exact original position: Attendance, Download, T1/T2/T3)
      ============================================================ */}
      <div className="class-record-subheader">
        <div>
          <h2>Section: {sectionName}</h2>
          <p>Input and manage student grades per term</p>
        </div>

        {/* ACTIONS + TERM BUTTONS */}
        <div className="class-record-actions">
          {/* ATTENDANCE WITH CONDITIONAL DISABLING */}
          <button
            type="button"
            className={`class-record-action-btn attendance-btn ${isLocked ? "disabled" : ""}`}
            onClick={
              isLocked
                ? undefined
                : onAttendance
                ? () => onAttendance(activeClass)
                : () => {
                    navigate("/adviser/attendance", { state: { activeClass } });
                  }
            }
            disabled={isLocked}
            title={isLocked ? "Attendance is unavailable for closed/locked terms." : "Attendance"}
          >
            <span className="action-icon">▰</span>
            Attendance
          </button>

          {/* DOWNLOAD WITH CONDITIONAL DISABLING */}
          <button
            type="button"
            className={`class-record-action-btn download-btn ${isDownloadDisabled ? "disabled" : ""}`}
            onClick={handleDownload}
            disabled={isDownloadDisabled}
            title={
              isDownloadDisabled
                ? "Please complete all student grades for this quarter before downloading the class record."
                : "Download Official DepEd JHS Class Record (PDF)"
            }
          >
            <span className="action-icon">↓</span>
            Download
          </button>

          {/* TERMS */}
          <div className="term-buttons">
            <button
              type="button"
              className={activeTerm === "T1" ? "term-btn active" : "term-btn"}
              onClick={() => handleTermChange("T1")}
            >
              T1
            </button>

            <button
              type="button"
              className={activeTerm === "T2" ? "term-btn active" : "term-btn"}
              onClick={() => handleTermChange("T2")}
            >
              T2
            </button>

            <button
              type="button"
              className={activeTerm === "T3" ? "term-btn active" : "term-btn"}
              onClick={() => handleTermChange("T3")}
            >
              T3
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          UNAVAILABLE STATE OR MAIN CLASS RECORD SPREADSHEET
      ============================================================ */}
      {!isAvailable ? (
        <div className="unavailable-state">
          <img src={unavailableIconUrl} alt="Unavailable" className="unavailable-icon" />
          <h3>This grading term is currently unavailable.</h3>
          <p>Access will be enabled once the official grading period begins.</p>
        </div>
      ) : (
        <div className="class-record-content">
          {/* LOCK BANNER FOR CLOSED / INACTIVE TERMS */}
          {isLocked && (
            <div className="class-record-lock-banner">
              <div className="lock-banner-left">
                <div className="lock-icon-circle">
                  <Lock size={16} />
                </div>
                <div className="lock-text">
                  <strong>Read-Only Mode:</strong> This class record belongs to a closed term ({loadedTermName || activeTerm}) and is read-only.
                </div>
              </div>
              <div className="lock-badge-tag">
                <Lock size={12} />
                <span>Term Locked</span>
              </div>
            </div>
          )}

          {/* TOTAL STUDENTS */}
          <div className="student-count">
            Total Students: {students.length}
          </div>

          {/* ==================================================
              TABLE
          ================================================== */}
          <div className="class-record-table-wrapper">
            <table className="class-record-table">
              {/* =================================================
                  TABLE HEADER
              ================================================= */}
              <thead>
                {/* ROW 1: MAIN HEADERS */}
                <tr>
                  <th rowSpan="2" className="number-header">
                    No.
                  </th>

                  <th rowSpan="2" className="lrn-header">
                    LRN
                  </th>

                  <th rowSpan="2" className="name-header">
                    Learners' Name
                  </th>

                  {/* WRITTEN WORKS */}
                  <th colSpan={writtenWorkColumns.length + 3} className="category-header">
                    <div className="category-title">
                      <span>Written Works ({weights.WW}%)</span>
                      <button
                        type="button"
                        className={`add-column-btn ${isLocked ? "disabled" : ""}`}
                        onClick={() => openAddColumnModal("WW")}
                        disabled={isLocked}
                        title={isLocked ? "Cannot add column in a locked term" : "Add Written Work Column"}
                      >
                        + Add
                      </button>
                    </div>
                  </th>

                  {/* PERFORMANCE TASKS */}
                  <th colSpan={performanceTaskColumns.length + 3} className="category-header">
                    <div className="category-title">
                      <span>Performance Tasks ({weights.PT}%)</span>
                      <button
                        type="button"
                        className={`add-column-btn ${isLocked ? "disabled" : ""}`}
                        onClick={() => openAddColumnModal("PT")}
                        disabled={isLocked}
                        title={isLocked ? "Cannot add column in a locked term" : "Add Performance Task Column"}
                      >
                        + Add
                      </button>
                    </div>
                  </th>

                  {/* QUARTERLY ASSESSMENT */}
                  <th colSpan="3" className="category-header">
                    Quarterly Assessment ({weights.QA}%)
                  </th>

                  {/* FINAL GRADES */}
                  <th rowSpan="2" className="grade-header">
                    Initial<br />Grade
                  </th>

                  <th rowSpan="2" className="grade-header">
                    Quarterly<br />Grade
                  </th>
                </tr>

                {/* ROW 2: SUB HEADERS */}
                <tr>
                  {/* WRITTEN WORKS */}
                  {writtenWorkColumns.map((column) => (
                    <th key={column.id} className="sub-header dynamic-col-header" title={column.activity_name || `Written Work ${column.label}`}>
                      <div className="col-header-inner">
                        <span>{column.label}</span>
                        {!isLocked && (
                          <div className="col-actions">
                            <button type="button" className="col-action-btn" onClick={() => openEditColumnModal(column, "WW")} title="Edit Column">
                              <Edit2 size={10} />
                            </button>
                            {writtenWorkColumns.length > 1 && (
                              <button type="button" className="col-action-btn col-delete-btn" onClick={() => handleDeleteColumn(column, "WW")} title="Delete Column">
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  ))}

                  <th className="sub-header total-header">Total</th>
                  <th className="sub-header">PS</th>
                  <th className="sub-header">WS</th>

                  {/* PERFORMANCE TASKS */}
                  {performanceTaskColumns.map((column) => (
                    <th key={column.id} className="sub-header dynamic-col-header" title={column.activity_name || `Performance Task ${column.label}`}>
                      <div className="col-header-inner">
                        <span>{column.label}</span>
                        {!isLocked && (
                          <div className="col-actions">
                            <button type="button" className="col-action-btn" onClick={() => openEditColumnModal(column, "PT")} title="Edit Column">
                              <Edit2 size={10} />
                            </button>
                            {performanceTaskColumns.length > 1 && (
                              <button type="button" className="col-action-btn col-delete-btn" onClick={() => handleDeleteColumn(column, "PT")} title="Delete Column">
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  ))}

                  <th className="sub-header total-header">Total</th>
                  <th className="sub-header">PS</th>
                  <th className="sub-header">WS</th>

                  {/* QUARTERLY ASSESSMENT */}
                  <th className="sub-header">1</th>
                  <th className="sub-header">PS</th>
                  <th className="sub-header">WS</th>
                </tr>

                {/* ROW 3: HIGHEST POSSIBLE SCORE (HPS) ROW */}
                <tr className="hps-row">
                  <td colSpan="3" className="hps-label-cell">
                    HIGHEST POSSIBLE SCORE
                  </td>

                  {/* WW HPS */}
                  {writtenWorkColumns.map((col) => (
                    <td key={col.id} className="hps-score-cell">
                      {col.max_score}
                    </td>
                  ))}
                  <td className="hps-score-cell hps-total-cell">{totalWW_HPS}</td>
                  <td className="hps-score-cell">100%</td>
                  <td className="hps-score-cell">{weights.WW}%</td>

                  {/* PT HPS */}
                  {performanceTaskColumns.map((col) => (
                    <td key={col.id} className="hps-score-cell">
                      {col.max_score}
                    </td>
                  ))}
                  <td className="hps-score-cell hps-total-cell">{totalPT_HPS}</td>
                  <td className="hps-score-cell">100%</td>
                  <td className="hps-score-cell">{weights.PT}%</td>

                  {/* QA HPS */}
                  <td className="hps-score-cell">{quarterlyAssessmentHPS}</td>
                  <td className="hps-score-cell">100%</td>
                  <td className="hps-score-cell">{weights.QA}%</td>

                  {/* FINAL GRADES HPS */}
                  <td className="hps-score-cell hps-final-cell">100</td>
                  <td className="hps-score-cell hps-final-cell">100</td>
                </tr>
              </thead>

              {/* =================================================
                  TABLE BODY
              ================================================= */}
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3 + writtenWorkColumns.length + 3 + performanceTaskColumns.length + 3 + 3 + 2}
                      style={{ textAlign: "center", padding: "40px 16px", color: "#64748b", fontWeight: 500 }}
                    >
                      No students currently enrolled in this section.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* MALE IDENTIFIER */}
                    <tr className="gender-divider-row">
                      <td colSpan="3" className="gender-divider-sticky-cell">
                        MALE {maleStudents.length > 0 ? `(${maleStudents.length})` : ""}
                      </td>
                      <td
                        colSpan={writtenWorkColumns.length + 3 + performanceTaskColumns.length + 3 + 3 + 2}
                        className="gender-divider-fill-cell"
                      />
                    </tr>

                    {/* MALE STUDENTS */}
                    {maleStudents.map((student, index) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        number={index + 1}
                        grades={grades}
                        writtenWorkColumns={writtenWorkColumns}
                        performanceTaskColumns={performanceTaskColumns}
                        quarterlyAssessmentHPS={quarterlyAssessmentHPS}
                        quarterlyAssessmentId={quarterlyAssessmentId}
                        weights={weights}
                        isLocked={isLocked}
                        errorTooltip={errorTooltip}
                        handleGradeChange={handleGradeChange}
                        handleSingleGradeChange={handleSingleGradeChange}
                        handleScoreBlur={handleScoreBlur}
                      />
                    ))}

                    {/* FEMALE IDENTIFIER */}
                    <tr className="gender-divider-row">
                      <td colSpan="3" className="gender-divider-sticky-cell">
                        FEMALE {femaleStudents.length > 0 ? `(${femaleStudents.length})` : ""}
                      </td>
                      <td
                        colSpan={writtenWorkColumns.length + 3 + performanceTaskColumns.length + 3 + 3 + 2}
                        className="gender-divider-fill-cell"
                      />
                    </tr>

                    {/* FEMALE STUDENTS */}
                    {femaleStudents.map((student, index) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        number={maleStudents.length + index + 1}
                        grades={grades}
                        writtenWorkColumns={writtenWorkColumns}
                        performanceTaskColumns={performanceTaskColumns}
                        quarterlyAssessmentHPS={quarterlyAssessmentHPS}
                        quarterlyAssessmentId={quarterlyAssessmentId}
                        weights={weights}
                        isLocked={isLocked}
                        errorTooltip={errorTooltip}
                        handleGradeChange={handleGradeChange}
                        handleSingleGradeChange={handleSingleGradeChange}
                        handleScoreBlur={handleScoreBlur}
                      />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
          MODERN ADD / EDIT COLUMN MODAL (Sleek popover/dialog)
      ============================================================ */}
      {modalState.isOpen && (
        <div className="class-record-modal-backdrop" onClick={() => setModalState((prev) => ({ ...prev, isOpen: false }))}>
          <div className="class-record-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <div className="modal-icon-badge">
                  <Layers size={18} />
                </div>
                <div>
                  <h3>{modalState.mode === "add" ? `Add ${modalState.categoryLabel} Column` : `Edit ${modalState.categoryLabel} Column`}</h3>
                  <p>Configure assessment details and Highest Possible Score</p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveModalColumn} className="modal-form">
              <div className="modal-body">
                <div className="form-group">
                  <label>Column Title / Assessment Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Quiz 1, Long Test, Unit Assessment"
                    className="modal-input"
                    value={modalState.title}
                    onChange={(e) => setModalState((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>Highest Possible Score (HPS)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 20"
                      className="modal-input"
                      value={modalState.maxScore}
                      onChange={(e) => setModalState((prev) => ({ ...prev, maxScore: e.target.value }))}
                    />
                    <span className="input-hint">Must be greater than 0</span>
                  </div>

                  <div className="form-group flex-1">
                    <label>Activity Date</label>
                    <input
                      type="date"
                      className="modal-input"
                      value={modalState.date}
                      onChange={(e) => setModalState((prev) => ({ ...prev, date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="modal-submit-btn">
                    {modalState.mode === "add" ? "Add Column" : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          DEPED JHS CLASS RECORD OFFICIAL PDF PREVIEW & PRINT MODAL
      ============================================================ */}
      <DepEdClassRecordPrintModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        metadata={exportMetadata}
        weights={weights}
        writtenWorkColumns={writtenWorkColumns}
        performanceTaskColumns={performanceTaskColumns}
        quarterlyAssessmentHPS={quarterlyAssessmentHPS}
        students={students}
        grades={grades}
      />
    </div>
  );
}

// ============================================================
// STUDENT ROW (DEPED ORDER NO. 8, S. 2015 REAL-TIME CALCULATIONS)
// ============================================================
function StudentRow({
  student,
  number,
  grades,
  writtenWorkColumns,
  performanceTaskColumns,
  quarterlyAssessmentHPS,
  quarterlyAssessmentId,
  weights,
  isLocked,
  errorTooltip,
  handleGradeChange,
  handleSingleGradeChange,
  handleScoreBlur,
}) {
  const studentGrades = grades[student.id] || {};
  const studentWW = studentGrades.writtenWorks || {};
  const studentPT = studentGrades.performanceTasks || {};
  const studentQA = studentGrades.quarterlyAssessment || "";

  // Real-time calculation with DepEd Transmutation Table
  const rowCalculation = useMemo(() => {
    return calculateStudentGrades({
      writtenWorks: studentWW,
      performanceTasks: studentPT,
      quarterlyAssessment: studentQA,
      writtenWorkColumns,
      performanceTaskColumns,
      quarterlyAssessmentHPS,
      weights,
    });
  }, [studentWW, studentPT, studentQA, writtenWorkColumns, performanceTaskColumns, quarterlyAssessmentHPS, weights]);

  return (
    <tr className="student-row">
      {/* NUMBER */}
      <td className="number-cell">{number}</td>

      {/* LRN */}
      <td className="lrn-cell">{student.lrn}</td>

      {/* NAME */}
      <td className="name-cell">
        {student.firstName} {student.lastName}
      </td>

      {/* WRITTEN WORKS */}
      {writtenWorkColumns.map((column) => {
        const val = studentWW[column.id];
        const numVal = Number(val);
        const cellKey = `${student.id}_${column.id}`;
        const isExceeded = errorTooltip?.cellKey === cellKey;
        const isScoreFailing = !isExceeded && val !== undefined && val !== "" && !isNaN(numVal) && column.max_score > 0 && numVal / column.max_score < 0.6;

        return (
          <td key={column.id} className={`grade-input-cell ${isScoreFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={column.max_score}
                value={val !== undefined ? val : ""}
                disabled={isLocked}
                readOnly={isLocked}
                className={`${isExceeded ? "exceeded-score-input" : ""} ${isScoreFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
                onChange={(e) =>
                  handleGradeChange(
                    student.id,
                    "writtenWorks",
                    column.id,
                    e.target.value,
                    column.max_score,
                    column.assessment_id
                  )
                }
                onBlur={handleScoreBlur}
                title={isLocked ? "This term is locked and read-only" : `Max: ${column.max_score}`}
              />
              {isExceeded && (
                <div className="score-exceeded-badge" role="alert">
                  {errorTooltip.message}
                </div>
              )}
            </div>
          </td>
        );
      })}

      <td className="computed-cell">{rowCalculation.writtenWorks.total}</td>
      <td className={`computed-cell ${rowCalculation.writtenWorks.isFailing ? "failing-metric" : ""}`}>
        {rowCalculation.writtenWorks.ps}
      </td>
      <td className="computed-cell">{rowCalculation.writtenWorks.ws}</td>

      {/* PERFORMANCE TASKS */}
      {performanceTaskColumns.map((column) => {
        const val = studentPT[column.id];
        const numVal = Number(val);
        const cellKey = `${student.id}_${column.id}`;
        const isExceeded = errorTooltip?.cellKey === cellKey;
        const isScoreFailing = !isExceeded && val !== undefined && val !== "" && !isNaN(numVal) && column.max_score > 0 && numVal / column.max_score < 0.6;

        return (
          <td key={column.id} className={`grade-input-cell ${isScoreFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={column.max_score}
                value={val !== undefined ? val : ""}
                disabled={isLocked}
                readOnly={isLocked}
                className={`${isExceeded ? "exceeded-score-input" : ""} ${isScoreFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
                onChange={(e) =>
                  handleGradeChange(
                    student.id,
                    "performanceTasks",
                    column.id,
                    e.target.value,
                    column.max_score,
                    column.assessment_id
                  )
                }
                onBlur={handleScoreBlur}
                title={isLocked ? "This term is locked and read-only" : `Max: ${column.max_score}`}
              />
              {isExceeded && (
                <div className="score-exceeded-badge" role="alert">
                  {errorTooltip.message}
                </div>
              )}
            </div>
          </td>
        );
      })}

      <td className="computed-cell">{rowCalculation.performanceTasks.total}</td>
      <td className={`computed-cell ${rowCalculation.performanceTasks.isFailing ? "failing-metric" : ""}`}>
        {rowCalculation.performanceTasks.ps}
      </td>
      <td className="computed-cell">{rowCalculation.performanceTasks.ws}</td>

      {/* QUARTERLY ASSESSMENT */}
      {(() => {
        const numQA = Number(studentQA);
        const cellKey = `${student.id}_qa`;
        const isExceeded = errorTooltip?.cellKey === cellKey;
        const isQAFailing = !isExceeded && studentQA !== "" && !isNaN(numQA) && quarterlyAssessmentHPS > 0 && numQA / quarterlyAssessmentHPS < 0.6;
        return (
          <td className={`grade-input-cell ${isQAFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={quarterlyAssessmentHPS}
                value={studentQA}
                disabled={isLocked}
                readOnly={isLocked}
                className={`${isExceeded ? "exceeded-score-input" : ""} ${isQAFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
                onChange={(e) =>
                  handleSingleGradeChange(
                    student.id,
                    "quarterlyAssessment",
                    e.target.value,
                    quarterlyAssessmentHPS,
                    quarterlyAssessmentId
                  )
                }
                onBlur={handleScoreBlur}
                title={isLocked ? "This term is locked and read-only" : `Max: ${quarterlyAssessmentHPS}`}
              />
              {isExceeded && (
                <div className="score-exceeded-badge" role="alert">
                  {errorTooltip.message}
                </div>
              )}
            </div>
          </td>
        );
      })()}

      <td className={`computed-cell ${rowCalculation.quarterlyAssessment.isFailing ? "failing-metric" : ""}`}>
        {rowCalculation.quarterlyAssessment.ps}
      </td>
      <td className="computed-cell">{rowCalculation.quarterlyAssessment.ws}</td>

      {/* INITIAL GRADE */}
      <td className="grade-input-cell final-grade-cell">
        <input
          type="text"
          readOnly
          value={rowCalculation.initialGrade !== "-" ? rowCalculation.initialGrade : ""}
          placeholder="-"
          className="computed-grade-display"
        />
      </td>

      {/* QUARTERLY GRADE - TARGETED FAILING HIGHLIGHT */}
      <td className={`grade-input-cell final-grade-cell ${rowCalculation.isFailing ? "failing-grade-cell" : ""}`}>
        <input
          type="text"
          readOnly
          value={rowCalculation.quarterlyGrade !== "-" ? rowCalculation.quarterlyGrade : ""}
          placeholder="-"
          className={`computed-grade-display ${rowCalculation.isFailing ? "failing-grade" : ""}`}
          title={rowCalculation.isFailing ? "Failing Quarterly Grade (< 75)" : "Quarterly Grade"}
        />
      </td>
    </tr>
  );
}