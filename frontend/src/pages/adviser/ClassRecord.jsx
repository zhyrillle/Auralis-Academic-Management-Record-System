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
import depedLogoUrl from "../../assets/deped_logo.png";
import depedWordmarkLogoUrl from "../../assets/deped-logo.gif";
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
  getGradeDescriptor,
} from "../../utils/depedTransmutation";
import { triggerClassRecordPrint } from "../../utils/exportClassRecordPdf";


export default function ClassRecord({ activeClass, onBack, onAttendance, onUpdateQuarterlyGrades }) {
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

  // Term Lock & Availability state
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [loadedTermName, setLoadedTermName] = useState("");
  const [activeTermName, setActiveTermName] = useState("");

  // Component weights (WW 20%, PT 50%, EX 30%)
  const [weights, setWeights] = useState(DEFAULT_JHS_WEIGHTS);

  // Assessment Columns (Default initial count: 1 per component)
  const [writtenWorkColumns, setWrittenWorkColumns] = useState([
    { id: "ww1", assessment_id: null, label: "1", activity_name: "Written Work 1", max_score: 30 },
  ]);

  const [performanceTaskColumns, setPerformanceTaskColumns] = useState([
    { id: "pt1", assessment_id: null, label: "1", activity_name: "Performance Task 1", max_score: 50 },
  ]);

  // Dynamic & Customizable Examinations (ST1: 25, ST2: 25, TE: 50, weights: 30, 30, 40)
  const [examConfig, setExamConfig] = useState({
    st1HPS: 25,
    st2HPS: 25,
    teHPS: 50,
    st1Weight: 30,
    st2Weight: 30,
    teWeight: 40,
    st1Id: null,
    st2Id: null,
    teId: null,
  });

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
    category: "WW", // "WW" | "PT" | "EX" | "EX_WEIGHT"
    categoryLabel: "Written Works",
    columnId: null,
    assessmentId: null,
    title: "",
    maxScore: "20",
    date: "",
    examKey: null,
  });

  const saveTimerRef = useRef(null);
  const pendingQueueRef = useRef(new Map());
  const isFlushingRef = useRef(false);
  const hasPendingFlushRef = useRef(false);
  // Wipe legacy localStorage class record cache keys once on mount
  useEffect(() => {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("auralis_class_record_")) {
          localStorage.removeItem(key);
        }
      });
    } catch {}
  }, []);

  // Flush pending scores to backend immediately (atomic & concurrency safe)
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

      // Remove only items whose queue record matches the sent snapshot
      // (preserves newer inputs typed while the save request was in flight!)
      snapshot.forEach(([k, sentItem]) => {
        if (pendingQueueRef.current.get(k) === sentItem) {
          pendingQueueRef.current.delete(k);
        }
      });

      if (pendingQueueRef.current.size === 0) {
        setSyncStatus("saved");
      }
    } catch (err) {
      console.warn("Auto-save sync error:", err.message);
      setSyncStatus("error");
    } finally {
      isFlushingRef.current = false;
      if (hasPendingFlushRef.current || pendingQueueRef.current.size > 0) {
        hasPendingFlushRef.current = false;
        flushPendingScores();
      }
    }
  }, [isLocked, subjectOfferingId, activeTerm]);

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
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [subjectOfferingId, activeTerm]);

  // ============================================================
  // LOAD DATA FROM BACKEND
  // ============================================================
  const loadClassRecord = useCallback(
    async (termToLoad) => {
      setStudents([]);
      setGrades({});

      // Fetch fresh data from backend with dynamic subjectOfferingId & sectionId
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
          let st1Ass = null;
          let st2Ass = null;
          let teAss = null;
          let qaHps = 50;
          let qaId = null;

          if (Array.isArray(data.assessments) && data.assessments.length > 0) {
            data.assessments.forEach((ass) => {
              const compCode = (ass.component_code || "").toUpperCase();
              const type = (ass.type || ass.assessment_type || "").toLowerCase();
              const name = String(ass.activity_name || ass.title || "").toUpperCase();

              const isWW = compCode === "WW" || type === "writtenwork" || type === "writtenworks" || type.includes("written");
              const isPT = compCode === "PT" || type === "performancetask" || type === "performancetasks" || type.includes("performance");
              const isQA = compCode === "QA" || compCode === "STE" || compCode === "EX" || type === "quarterlyassessment" || type.includes("exam") || type.includes("summative");

              const aId = ass.assessment_id || ass.activity_id;

              if (isWW) {
                wwCols.push({
                  id: `ww_${aId}`,
                  assessment_id: aId,
                  label: String(wwCols.length + 1),
                  activity_name: ass.activity_name || ass.title || `Written Work ${wwCols.length + 1}`,
                  max_score: Number(ass.max_score || ass.highest_possible_score || 30),
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
                if (name.includes("ST1") || name.includes("SUMMATIVE TEST 1") || name.includes("SUMMATIVE 1")) {
                  st1Ass = ass;
                } else if (name.includes("ST2") || name.includes("SUMMATIVE TEST 2") || name.includes("SUMMATIVE 2")) {
                  st2Ass = ass;
                } else {
                  teAss = ass;
                  qaHps = Number(ass.max_score || ass.highest_possible_score || 50);
                  qaId = aId;
                }
              }
            });
          }

          if (wwCols.length > 0) setWrittenWorkColumns(wwCols);
          if (ptCols.length > 0) setPerformanceTaskColumns(ptCols);
          setQuarterlyAssessmentHPS(qaHps);
          setQuarterlyAssessmentId(qaId);

          setExamConfig((prev) => ({
            ...prev,
            st1HPS: Number(st1Ass?.max_score || st1Ass?.highest_possible_score || prev.st1HPS || 25),
            st1Id: st1Ass?.assessment_id || st1Ass?.activity_id || prev.st1Id,
            st2HPS: Number(st2Ass?.max_score || st2Ass?.highest_possible_score || prev.st2HPS || 25),
            st2Id: st2Ass?.assessment_id || st2Ass?.activity_id || prev.st2Id,
            teHPS: Number(teAss?.max_score || teAss?.highest_possible_score || prev.teHPS || 50),
            teId: teAss?.assessment_id || teAss?.activity_id || prev.teId,
          }));

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
              const exGrades = { st1: "", st2: "", te: "" };

              wwCols.forEach((col) => {
                const val = rawScores[col.assessment_id] !== undefined ? rawScores[col.assessment_id] : rawScores[col.id];
                wwGrades[col.id] = val !== undefined && val !== null ? val : "";
              });

              ptCols.forEach((col) => {
                const val = rawScores[col.assessment_id] !== undefined ? rawScores[col.assessment_id] : rawScores[col.id];
                ptGrades[col.id] = val !== undefined && val !== null ? val : "";
              });

              // Resolve ST1, ST2, TE scores (bound to student model & raw assessment scores)
              if (st.examinations?.st1 !== undefined && st.examinations?.st1 !== null && st.examinations?.st1 !== "") {
                exGrades.st1 = st.examinations.st1;
              } else if (st1Ass && rawScores[st1Ass.assessment_id] !== undefined && rawScores[st1Ass.assessment_id] !== null) {
                exGrades.st1 = rawScores[st1Ass.assessment_id];
              } else if (rawScores.st1 !== undefined && rawScores.st1 !== null) {
                exGrades.st1 = rawScores.st1;
              }

              if (st.examinations?.st2 !== undefined && st.examinations?.st2 !== null && st.examinations?.st2 !== "") {
                exGrades.st2 = st.examinations.st2;
              } else if (st2Ass && rawScores[st2Ass.assessment_id] !== undefined && rawScores[st2Ass.assessment_id] !== null) {
                exGrades.st2 = rawScores[st2Ass.assessment_id];
              } else if (rawScores.st2 !== undefined && rawScores.st2 !== null) {
                exGrades.st2 = rawScores.st2;
              }

              if (st.examinations?.te !== undefined && st.examinations?.te !== null && st.examinations?.te !== "") {
                exGrades.te = st.examinations.te;
              } else if (teAss && rawScores[teAss.assessment_id] !== undefined && rawScores[teAss.assessment_id] !== null) {
                exGrades.te = rawScores[teAss.assessment_id];
              } else if (rawScores.te !== undefined && rawScores.te !== null) {
                exGrades.te = rawScores.te;
              } else if (rawScores.qa !== undefined && rawScores.qa !== null) {
                exGrades.te = rawScores.qa;
              }

              newGrades[String(st.student_id)] = {
                writtenWorks: wwGrades,
                performanceTasks: ptGrades,
                examinations: exGrades,
                quarterlyAssessment: exGrades.te !== undefined && exGrades.te !== null ? exGrades.te : "",
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
                  if (item.exam_key === "st1" || (st1Ass && String(item.assessment_id) === String(st1Ass.assessment_id)) || item.assessment_id === "st1") {
                    newGrades[sId].examinations.st1 = item.raw_score !== null ? item.raw_score : "";
                  }
                  if (item.exam_key === "st2" || (st2Ass && String(item.assessment_id) === String(st2Ass.assessment_id)) || item.assessment_id === "st2") {
                    newGrades[sId].examinations.st2 = item.raw_score !== null ? item.raw_score : "";
                  }
                  if (item.exam_key === "te" || (teAss && String(item.assessment_id) === String(teAss.assessment_id)) || item.assessment_id === "te" || item.assessment_id === "qa") {
                    newGrades[sId].examinations.te = item.raw_score !== null ? item.raw_score : "";
                    newGrades[sId].quarterlyAssessment = item.raw_score !== null ? item.raw_score : "";
                  }
                }
              });
            }

            setGrades(newGrades);

            if (pendingList.length > 0 && navigator.onLine) {
              flushPendingScores();
            }

          }

          setSyncStatus(isSheetLocked ? "locked" : "saved");
        }
      } catch (err) {
        console.warn("Error loading class record:", err.message);
        setSyncStatus("saved");
      }
    },
    [subjectOfferingId, sectionId]
  );

  useEffect(() => {
    if (subjectOfferingId || sectionId) {
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

  // Propagate quarterly grade to parent component (GradingSheet)
  const studentQuarterlyGradesMap = useMemo(() => {
    if (!students || students.length === 0) return {};
    const map = {};
    students.forEach((student) => {
      const studentGradesObj = grades[student.id] || {};
      const ww = studentGradesObj.writtenWorks || {};
      const pt = studentGradesObj.performanceTasks || {};
      const ex = studentGradesObj.examinations || {};

      const rowCalc = calculateStudentGrades({
        writtenWorks: ww,
        performanceTasks: pt,
        examinations: ex,
        quarterlyAssessment: ex.te || "",
        writtenWorkColumns,
        performanceTaskColumns,
        examConfig,
        weights,
      });

      const qg = rowCalc.termGrade !== "-" ? rowCalc.termGrade : (rowCalc.quarterlyGrade !== "-" ? rowCalc.quarterlyGrade : "");
      map[student.id] = qg;
      if (student.student_id) map[student.student_id] = qg;
      if (student.lrn) map[student.lrn] = qg;
    });
    return map;
  }, [students, grades, writtenWorkColumns, performanceTaskColumns, examConfig, weights]);

  useEffect(() => {
    if (typeof onUpdateQuarterlyGrades === "function" && Object.keys(studentQuarterlyGradesMap).length > 0) {
      onUpdateQuarterlyGrades(activeTerm, studentQuarterlyGradesMap);
    }
  }, [studentQuarterlyGradesMap, activeTerm, onUpdateQuarterlyGrades]);
  // ============================================================
  // CONDITIONAL DISABLING FOR DOWNLOAD BUTTON
  // ============================================================
  const isDownloadDisabled = useMemo(() => {
    if (!students || students.length === 0) return true;
    if (writtenWorkColumns.length === 0 && performanceTaskColumns.length === 0) return true;

    for (const student of students) {
      const studentGradesObj = grades[student.id] || {};
      const ww = studentGradesObj.writtenWorks || {};
      const pt = studentGradesObj.performanceTasks || {};
      const ex = studentGradesObj.examinations || {};

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

      // Check Examinations (ST1, ST2, TE)
      if (ex.st1 === undefined || ex.st1 === null || ex.st1 === "" || isNaN(Number(ex.st1))) return true;
      if (ex.st2 === undefined || ex.st2 === null || ex.st2 === "" || isNaN(Number(ex.st2))) return true;
      if (ex.te === undefined || ex.te === null || ex.te === "" || isNaN(Number(ex.te))) return true;
    }

    return false;
  }, [students, grades, writtenWorkColumns, performanceTaskColumns]);

  // ============================================================
  // DEPED JHS EXPORT METADATA RESOLUTION
  // ============================================================
  const exportMetadata = useMemo(() => {
    const termMap = {
      T1: { termTitle: "CLASS RECORD - TERM 1", termHeader: "FIRST TERM", quarterLabel: "FIRST QUARTER" },
      T2: { termTitle: "CLASS RECORD - TERM 2", termHeader: "SECOND TERM", quarterLabel: "SECOND QUARTER" },
      T3: { termTitle: "CLASS RECORD - TERM 3", termHeader: "THIRD TERM", quarterLabel: "THIRD QUARTER" },
      T4: { termTitle: "CLASS RECORD - TERM 4", termHeader: "FOURTH TERM", quarterLabel: "FOURTH QUARTER" },
    };
    const tInfo = termMap[activeTerm] || {
      termTitle: `CLASS RECORD - ${activeTerm.toUpperCase()}`,
      termHeader: `${activeTerm.toUpperCase()} TERM`,
      quarterLabel: `${activeTerm.toUpperCase()} QUARTER`,
    };

    const rawGradeLevel =
      classContextData?.grade_level_name ||
      activeClass?.gradeLevel ||
      activeClass?.grade ||
      "10";
    const gradeLevelDisplay = String(rawGradeLevel).replace(/[^0-9]/g, "") || String(rawGradeLevel);

    const rawSection =
      classContextData?.section_name ||
      activeClass?.section_name ||
      activeClass?.sectionName ||
      "MAKAKALIKASAN";
    const gradeAndSection = `GRADE ${gradeLevelDisplay} - ${String(rawSection).toUpperCase()}`;

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
    const teacherName = rawTeacher ? String(rawTeacher).toUpperCase() : "0";

    const rawSubject =
      classContextData?.subject_name ||
      activeClass?.subject_name ||
      activeClass?.subjectName ||
      activeClass?.subject ||
      "";
    const subjectName = rawSubject ? String(rawSubject).toUpperCase() : "0";

    const region = (classContextData?.region || activeClass?.region || "Region X");
    const division = (classContextData?.division || activeClass?.division || "GINGOOG");
    const schoolName = (classContextData?.school_name || activeClass?.school_name || "GINGOOG CITY COMPREHENSIVE NHS");
    const schoolId = (classContextData?.school_code || activeClass?.school_code || activeClass?.schoolId || "304130");
    const schoolYear = (classContextData?.school_year_label || activeClass?.school_year || activeClass?.schoolYear || "2026-2027");

    return {
      region,
      division,
      schoolName,
      schoolId,
      schoolYear,
      termTitle: tInfo.termTitle,
      termHeader: tInfo.termHeader,
      quarterLabel: tInfo.quarterLabel,
      gradeAndSection,
      gradeLevelDisplay,
      teacherName,
      subjectName,
      section: rawSection,
      activeTerm,
    };
  }, [classContextData, activeClass, activeTerm]);

  // Handle Examinations Score Change
  const handleExamScoreChange = (studentId, examKey, value, maxScore, assessmentId) => {
    if (isLocked) return;

    const numVal = Number(value);
    const cellKey = `${studentId}_${examKey}`;
    const maxAllowed = Number(maxScore || 0);

    if (value !== "" && !isNaN(numVal) && numVal < 0) return;

    if (value !== "" && !isNaN(numVal) && maxAllowed > 0 && numVal > maxAllowed) {
      showErrorTooltip(cellKey, `Score cannot exceed ${maxAllowed}`);

      setGrades((prev) => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          examinations: {
            ...(prev[studentId]?.examinations || {}),
            [examKey]: "",
          },
        },
      }));

      const studentObj = students.find((s) => s.id === studentId || String(s.student_id) === studentId);
      if (studentObj) {
        queueScoreChange(
          assessmentId || examKey,
          studentObj.student_id,
          studentObj.student_section_id,
          "",
          examKey
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
        examinations: {
          ...(prev[studentId]?.examinations || {}),
          [examKey]: value,
        },
        quarterlyAssessment: examKey === "te" ? value : prev[studentId]?.quarterlyAssessment,
      },
    }));

    const studentObj = students.find((s) => s.id === studentId || String(s.student_id) === studentId);
    if (studentObj) {
      queueScoreChange(
        assessmentId || examKey,
        studentObj.student_id,
        studentObj.student_section_id,
        value,
        examKey
      );
    }
  };

  const openEditExamModal = (examKey, defaultTitle, currentHps, assessmentId) => {
    if (isLocked) return;
    setModalState({
      isOpen: true,
      mode: "edit",
      category: "EX",
      categoryLabel: "Examinations",
      columnId: examKey,
      assessmentId: assessmentId || null,
      title: defaultTitle,
      maxScore: String(currentHps || 25),
      date: "",
      examKey,
    });
  };

  const openEditSubWeightModal = (weightKey, label, currentWeight) => {
    if (isLocked) return;
    setModalState({
      isOpen: true,
      mode: "edit",
      category: "EX_WEIGHT",
      categoryLabel: "Exam Sub-Weight",
      columnId: weightKey,
      assessmentId: null,
      title: label,
      maxScore: String(currentWeight || 30),
      date: "",
      examKey: weightKey,
    });
  };

  // ============================================================
  // DEBOUNCED QUEUE AUTO-SAVER (Fast, non-blocking, concurrency safe)
  // ============================================================
  const queueScoreChange = useCallback(
    (assessmentId, studentId, studentSectionId, rawScore, examKey = null) => {
      if (isLocked) return;

      const normalizedExamKey = examKey || (assessmentId === "st1" || assessmentId === "st2" || assessmentId === "te" ? assessmentId : null);
      const key = `${studentId}_${normalizedExamKey || assessmentId}`;
      const record = {
        assessment_id: assessmentId,
        exam_key: normalizedExamKey,
        student_id: studentId,
        student_section_id: studentSectionId,
        raw_score: rawScore === "" ? null : Number(rawScore),
      };

      pendingQueueRef.current.set(key, record);

      setSyncStatus("saving");

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushPendingScores();
      }, 700); // 700ms debounce ensures comfortable multi-digit score typing
    },
    [isLocked, flushPendingScores]
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

    if (category === "EX_WEIGHT") {
      if (modalState.examKey === "st1Weight") {
        setExamConfig((prev) => ({ ...prev, st1Weight: numMax }));
      } else if (modalState.examKey === "st2Weight") {
        setExamConfig((prev) => ({ ...prev, st2Weight: numMax }));
      } else if (modalState.examKey === "teWeight") {
        setExamConfig((prev) => ({ ...prev, teWeight: numMax }));
      }
      setModalState((prev) => ({ ...prev, isOpen: false }));
      return;
    }

    if (category === "EX") {
      if (modalState.examKey === "st1") {
        setExamConfig((prev) => ({ ...prev, st1HPS: numMax }));
      } else if (modalState.examKey === "st2") {
        setExamConfig((prev) => ({ ...prev, st2HPS: numMax }));
      } else if (modalState.examKey === "te") {
        setExamConfig((prev) => ({ ...prev, teHPS: numMax }));
      }

      try {
        if (assessmentId) {
          await updateAssessment(assessmentId, {
            activity_name: title,
            title: title,
            max_score: numMax,
            highest_possible_score: numMax,
          });
        } else {
          const res = await createAssessment({
            subject_offering_id: subjectOfferingId,
            term: activeTerm,
            component_code: "QA",
            type: "quarterlyAssessment",
            activity_name: title,
            title: title,
            max_score: numMax,
            highest_possible_score: numMax,
          });
          const newAss = res?.assessment;
          if (newAss) {
            if (modalState.examKey === "st1") setExamConfig((prev) => ({ ...prev, st1Id: newAss.assessment_id }));
            else if (modalState.examKey === "st2") setExamConfig((prev) => ({ ...prev, st2Id: newAss.assessment_id }));
            else if (modalState.examKey === "te") setExamConfig((prev) => ({ ...prev, teId: newAss.assessment_id }));
          }
        }
      } catch (err) {
        console.warn("Exam HPS updated locally:", err);
      }

      setModalState((prev) => ({ ...prev, isOpen: false }));
      return;
    }

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

  // Download / Export handler: directly triggers DepEd standard landscape PDF generation/print
  const handleDownload = () => {
    if (isDownloadDisabled) return;
    triggerClassRecordPrint({
      metadata: exportMetadata,
      weights,
      writtenWorkColumns,
      performanceTaskColumns,
      examConfig,
      quarterlyAssessmentHPS: examConfig.teHPS,
      students,
      grades,
      depedLogoUrl,
      depedWordmarkLogoUrl,
    });
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

          {/* ============================================================
              OFFICIAL CLASS RECORD TEMPLATE HEADER & METADATA
          ============================================================ */}
          <div className="cr-template-container">
            <div className="cr-template-header-wrap">
              <div className="cr-seal-wrap">
                <img src={depedLogoUrl} alt="DepEd Seal" className="cr-seal-img" />
              </div>

              <div className="cr-header-center">
                <h1 className="cr-main-title">{exportMetadata.termTitle}</h1>

                <div className="cr-meta-section">
                  {/* ROW 1: REGION | DIVISION | SCHOOL ID */}
                  <div className="cr-meta-row">
                    <div className="cr-meta-field">
                      <span className="cr-meta-label">REGION</span>
                      <div className="cr-meta-box box-md">{exportMetadata.region}</div>
                    </div>
                    <div className="cr-meta-field">
                      <span className="cr-meta-label">DIVISION</span>
                      <div className="cr-meta-box box-md">{exportMetadata.division}</div>
                    </div>
                    <div className="cr-meta-field">
                      <span className="cr-meta-label">SCHOOL ID</span>
                      <div className="cr-meta-box box-sm">{exportMetadata.schoolId}</div>
                    </div>
                  </div>

                  {/* ROW 2: SCHOOL NAME | SCHOOL YEAR */}
                  <div className="cr-meta-row">
                    <div className="cr-meta-field">
                      <span className="cr-meta-label">SCHOOL NAME</span>
                      <div className="cr-meta-box box-lg">{exportMetadata.schoolName}</div>
                    </div>
                    <div className="cr-meta-field">
                      <span className="cr-meta-label">SCHOOL YEAR</span>
                      <div className="cr-meta-box box-sm">{exportMetadata.schoolYear}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="cr-logo-wrap">
                <img src={depedWordmarkLogoUrl} alt="DepEd Wordmark" className="cr-wordmark-img" />
              </div>
            </div>

            {/* TOTAL STUDENTS COUNTER */}
            <div className="student-count" style={{ padding: "0 10px 8px" }}>
              Total Students: {students.length}
            </div>

            {/* ==================================================
                OFFICIAL TEMPLATE SPREADSHEET TABLE
            ================================================== */}
            {(() => {
              const wwColsCount = writtenWorkColumns.length + 3; // + Total, PS, WS
              const ptColsCount = performanceTaskColumns.length + 3; // + Total, PS, WS
              const exColsCount = 8; // ST1, ST2, TE, WS ST1, WS ST2, WS TE, PS, WS
              const totalTableCols = 2 + wwColsCount + ptColsCount + exColsCount + 3; // + No + Name + Initial + Term + Descriptor

              const wwHalf1 = Math.max(1, Math.floor(wwColsCount / 2));
              const wwHalf2 = Math.max(1, wwColsCount - wwHalf1);

              const ptHalf1 = Math.max(1, Math.floor(ptColsCount / 2));
              const ptHalf2 = Math.max(1, ptColsCount - ptHalf1);

              // Subject & Teacher spans covering exactly the component widths
              const subjColsCount = exColsCount + 3; // 8 EX columns + 3 Summary columns = 11 columns
              const subjHalf1 = 3;
              const subjHalf2 = Math.max(1, subjColsCount - subjHalf1);

              return (
                <div className="class-record-table-wrapper">
                  <table className="class-record-table">
                    {/* Fixed explicit column widths to prevent any shifting */}
                    <colgroup>
                      <col style={{ width: "40px", minWidth: "40px", maxWidth: "40px" }} />
                      <col style={{ width: "240px", minWidth: "240px", maxWidth: "240px" }} />
                      {writtenWorkColumns.map((col) => (
                        <col key={`col-ww-${col.id}`} style={{ width: "44px", minWidth: "44px" }} />
                      ))}
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      {performanceTaskColumns.map((col) => (
                        <col key={`col-pt-${col.id}`} style={{ width: "44px", minWidth: "44px" }} />
                      ))}
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "44px", minWidth: "44px" }} />
                      <col style={{ width: "44px", minWidth: "44px" }} />
                      <col style={{ width: "44px", minWidth: "44px" }} />
                      <col style={{ width: "50px", minWidth: "50px" }} />
                      <col style={{ width: "50px", minWidth: "50px" }} />
                      <col style={{ width: "50px", minWidth: "50px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "60px", minWidth: "60px" }} />
                      <col style={{ width: "60px", minWidth: "60px" }} />
                      <col style={{ width: "95px", minWidth: "95px" }} />
                    </colgroup>

                    <thead>
                      {/* ROW 1: TABLE INFORMATION HEADER */}
                      <tr>
                        {/* Cell 1: FIRST TERM (spans 4 header rows down to HPS, and 2 columns: index + learner name) */}
                        <th rowSpan={4} colSpan={2} className="cr-term-col">
                          {exportMetadata.termHeader}
                        </th>

                        {/* Cell 2: GRADE LEVEL */}
                        <th colSpan={wwHalf1} className="cr-info-label">
                          GRADE LEVEL
                        </th>

                        {/* Cell 3: 8 */}
                        <td colSpan={wwHalf2} className="cr-info-val">
                          {exportMetadata.gradeLevelDisplay || "0"}
                        </td>

                        {/* Cell 4: TEACHER (Must span 2 rows vertically) */}
                        <th rowSpan={2} colSpan={ptHalf1} className="cr-info-label">
                          TEACHER
                        </th>

                        {/* Cell 5: HARVEY BABIA (Spans 2 rows and merges across teacher value block) */}
                        <td rowSpan={2} colSpan={ptHalf2} className="cr-info-val">
                          {exportMetadata.teacherName || "0"}
                        </td>

                        {/* Cell 6: SUBJECT (Must span 2 rows vertically) */}
                        <th rowSpan={2} colSpan={subjHalf1} className="cr-info-label">
                          SUBJECT
                        </th>

                        {/* Cell 7: ENGLISH (Spans 2 rows vertically across EX and summary block) */}
                        <td rowSpan={2} colSpan={subjHalf2} className="cr-info-val">
                          {exportMetadata.subjectName || "0"}
                        </td>
                      </tr>

                      {/* ROW 2: SECTION */}
                      <tr>
                        {/* Cell 1: SECTION */}
                        <th colSpan={wwHalf1} className="cr-info-label">
                          SECTION
                        </th>

                        {/* Cell 2: Carrots */}
                        <td colSpan={wwHalf2} className="cr-info-val">
                          {exportMetadata.section || "0"}
                        </td>
                        {/* Note: TEACHER and SUBJECT span down from Row 1 via rowSpan={2} */}
                      </tr>

                      {/* ROW 3: COMPONENT HEADERS */}
                      <tr>
                        {/* Group 1 (WWs): WRITTEN / ORAL WORKS (WWs) (20%) */}
                        <th colSpan={wwColsCount} className="cr-comp-header">
                          <div className="cr-comp-title-wrap">
                            <span>WRITTEN / ORAL WORKS (WWs) ({weights.WW || 20}%)</span>
                            {!isLocked && (
                              <button
                                type="button"
                                className="add-column-btn"
                                onClick={() => openAddColumnModal("WW")}
                                title="Add Written Work Column"
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        </th>

                        {/* Group 2 (PTs): PRODUCT / PERFORMANCE TASKS (PTs) (50%) */}
                        <th colSpan={ptColsCount} className="cr-comp-header">
                          <div className="cr-comp-title-wrap">
                            <span>PRODUCT / PERFORMANCE TASKS (PTs) ({weights.PT || 50}%)</span>
                            {!isLocked && (
                              <button
                                type="button"
                                className="add-column-btn"
                                onClick={() => openAddColumnModal("PT")}
                                title="Add Performance Task Column"
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        </th>

                        {/* Group 3 (EXs): EXAMINATIONS (EXs) (30%) */}
                        <th colSpan={exColsCount} className="cr-comp-header">
                          <span>EXAMINATIONS (EXs) ({weights.EX || weights.QA || 30}%)</span>
                        </th>

                        {/* Summary Headers */}
                        <th rowSpan={2} className="cr-summary-header">
                          Initial<br />Grade
                        </th>
                        <th rowSpan={2} className="cr-summary-header">
                          Term<br />Grade
                        </th>
                        <th rowSpan={2} className="cr-summary-header descriptor-col">
                          Descriptor
                        </th>
                      </tr>

                      {/* ROW 4: SUB HEADERS */}
                      <tr>
                        {/* WW Column Headers: Individual numbers (1, 2, 3, ...), then Total, PS, WS */}
                        {writtenWorkColumns.map((column) => (
                          <th key={column.id} className="cr-sub-header dynamic-col-header" title={column.activity_name || `Written Work ${column.label}`}>
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
                        <th className="cr-sub-header">Total</th>
                        <th className="cr-sub-header">PS</th>
                        <th className="cr-sub-header">WS</th>

                        {/* PT Column Headers: Individual numbers (1, 2, ...), then Total, PS, WS */}
                        {performanceTaskColumns.map((column) => (
                          <th key={column.id} className="cr-sub-header dynamic-col-header" title={column.activity_name || `Performance Task ${column.label}`}>
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
                        <th className="cr-sub-header">Total</th>
                        <th className="cr-sub-header">PS</th>
                        <th className="cr-sub-header">WS</th>

                        {/* EX Column Headers: ST1, ST2, TE, WS ST1, WS ST2, WS TE, PS, WS */}
                        <th className="cr-sub-header">ST1</th>
                        <th className="cr-sub-header">ST2</th>
                        <th className="cr-sub-header">TE</th>
                        <th className="cr-sub-header wide-sub">WS ST1</th>
                        <th className="cr-sub-header wide-sub">WS ST2</th>
                        <th className="cr-sub-header wide-sub">WS TE</th>
                        <th className="cr-sub-header">PS</th>
                        <th className="cr-sub-header">WS</th>
                      </tr>

                      {/* ROW 5 (HPS Row): HIGHEST POSSIBLE SCORE */}
                      <tr className="hps-row">
                        <th colSpan={2} className="cr-hps-title-cell hps-label">
                          HIGHEST POSSIBLE SCORE
                        </th>

                        {/* WW HPS */}
                        {writtenWorkColumns.map((col) => (
                          <td
                            key={col.id}
                            className="cr-hps-cell editable-hps"
                            onClick={() => openEditColumnModal(col, "WW")}
                            title="Click to edit HPS"
                          >
                            {col.max_score}
                          </td>
                        ))}
                        <td className="cr-hps-cell">{totalWW_HPS}</td>
                        <td className="cr-hps-cell">100</td>
                        <td className="cr-hps-cell">{weights.WW || 20}%</td>

                        {/* PT HPS */}
                        {performanceTaskColumns.map((col) => (
                          <td
                            key={col.id}
                            className="cr-hps-cell editable-hps"
                            onClick={() => openEditColumnModal(col, "PT")}
                            title="Click to edit HPS"
                          >
                            {col.max_score}
                          </td>
                        ))}
                        <td className="cr-hps-cell">{totalPT_HPS}</td>
                        <td className="cr-hps-cell">100</td>
                        <td className="cr-hps-cell">{weights.PT || 50}%</td>

                        {/* EX HPS & WEIGHTS */}
                        <td
                          className="cr-hps-cell editable-hps"
                          onClick={() => openEditExamModal("st1", "Summative Test 1", examConfig.st1HPS, examConfig.st1Id)}
                          title="Click to edit ST1 HPS"
                        >
                          {examConfig.st1HPS}
                        </td>
                        <td
                          className="cr-hps-cell editable-hps"
                          onClick={() => openEditExamModal("st2", "Summative Test 2", examConfig.st2HPS, examConfig.st2Id)}
                          title="Click to edit ST2 HPS"
                        >
                          {examConfig.st2HPS}
                        </td>
                        <td
                          className="cr-hps-cell editable-hps"
                          onClick={() => openEditExamModal("te", "Term Exam", examConfig.teHPS, examConfig.teId)}
                          title="Click to edit Term Exam HPS"
                        >
                          {examConfig.teHPS}
                        </td>
                        <td
                          className="cr-hps-cell editable-hps"
                          onClick={() => openEditSubWeightModal("st1Weight", "WS ST1 Weight", examConfig.st1Weight)}
                          title="Click to edit WS ST1 Weight"
                        >
                          {examConfig.st1Weight}
                        </td>
                        <td
                          className="cr-hps-cell editable-hps"
                          onClick={() => openEditSubWeightModal("st2Weight", "WS ST2 Weight", examConfig.st2Weight)}
                          title="Click to edit WS ST2 Weight"
                        >
                          {examConfig.st2Weight}
                        </td>
                        <td
                          className="cr-hps-cell editable-hps"
                          onClick={() => openEditSubWeightModal("teWeight", "WS TE Weight", examConfig.teWeight)}
                          title="Click to edit WS TE Weight"
                        >
                          {examConfig.teWeight}
                        </td>
                        <td className="cr-hps-cell">100</td>
                        <td className="cr-hps-cell">{weights.EX || weights.QA || 30}%</td>

                        {/* SUMMARY COLUMNS IN HPS ROW */}
                        <td className="cr-hps-cell" />
                        <td className="cr-hps-cell" />
                        <td className="cr-hps-cell" />
                      </tr>
                    </thead>

                    {/* =================================================
                        TABLE BODY
                    ================================================= */}
                    <tbody>
                      {students.length === 0 ? (
                        <tr>
                          <td
                            colSpan={totalTableCols}
                            style={{ textAlign: "center", padding: "40px 16px", color: "#64748b", fontWeight: 500 }}
                          >
                            No students currently enrolled in this section.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {/* LEARNERS' NAMES DIVIDER ROW */}
                          <tr className="cr-learners-names-row">
                            <td colSpan={totalTableCols}>LEARNERS' NAMES</td>
                          </tr>

                          {/* MALE DIVIDER ROW */}
                          <tr className="cr-gender-row">
                            <td colSpan={totalTableCols}>
                              MALE {maleStudents.length > 0 ? `(${maleStudents.length})` : ""}
                            </td>
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
                              examConfig={examConfig}
                              weights={weights}
                              isLocked={isLocked}
                              errorTooltip={errorTooltip}
                              handleGradeChange={handleGradeChange}
                              handleExamScoreChange={handleExamScoreChange}
                              handleScoreBlur={handleScoreBlur}
                            />
                          ))}

                          {/* FEMALE DIVIDER ROW */}
                          <tr className="cr-gender-row">
                            <td colSpan={totalTableCols}>
                              FEMALE {femaleStudents.length > 0 ? `(${femaleStudents.length})` : ""}
                            </td>
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
                              examConfig={examConfig}
                              weights={weights}
                              isLocked={isLocked}
                              errorTooltip={errorTooltip}
                              handleGradeChange={handleGradeChange}
                              handleExamScoreChange={handleExamScoreChange}
                              handleScoreBlur={handleScoreBlur}
                            />
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ============================================================
          MODERN ADD / EDIT COLUMN MODAL
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
                  <h3>
                    {modalState.category === "EX"
                      ? `Edit ${modalState.title} HPS`
                      : modalState.category === "EX_WEIGHT"
                      ? `Edit ${modalState.title}`
                      : modalState.mode === "add"
                      ? `Add ${modalState.categoryLabel} Column`
                      : `Edit ${modalState.categoryLabel} Column`}
                  </h3>
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
                {modalState.category !== "EX_WEIGHT" && (
                  <div className="form-group">
                    <label>Column Title / Assessment Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Quiz 1, Long Test, Unit Assessment"
                      className="modal-input"
                      value={modalState.title}
                      onChange={(e) => setModalState((prev) => ({ ...prev, title: e.target.value }))}
                      disabled={modalState.category === "EX"}
                    />
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label>
                      {modalState.category === "EX_WEIGHT"
                        ? "Weight Percentage (%)"
                        : "Highest Possible Score (HPS)"}
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 25"
                      className="modal-input"
                      value={modalState.maxScore}
                      onChange={(e) => setModalState((prev) => ({ ...prev, maxScore: e.target.value }))}
                    />
                    <span className="input-hint">Must be greater than 0</span>
                  </div>

                  {modalState.category !== "EX" && modalState.category !== "EX_WEIGHT" && (
                    <div className="form-group flex-1">
                      <label>Activity Date</label>
                      <input
                        type="date"
                        className="modal-input"
                        value={modalState.date}
                        onChange={(e) => setModalState((prev) => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                  )}
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
                    {modalState.category === "EX" || modalState.category === "EX_WEIGHT"
                      ? "Save HPS"
                      : modalState.mode === "add"
                      ? "Add Column"
                      : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
  examConfig,
  weights,
  isLocked,
  errorTooltip,
  handleGradeChange,
  handleExamScoreChange,
  handleScoreBlur,
}) {
  const studentGrades = grades[student.id] || {};
  const studentWW = studentGrades.writtenWorks || {};
  const studentPT = studentGrades.performanceTasks || {};
  const studentEX = studentGrades.examinations || {
    st1: studentGrades.st1 || "",
    st2: studentGrades.st2 || "",
    te: studentGrades.te || studentGrades.quarterlyAssessment || "",
  };

  // Real-time calculation with DepEd Transmutation Table
  const rowCalculation = useMemo(() => {
    return calculateStudentGrades({
      writtenWorks: studentWW,
      performanceTasks: studentPT,
      examinations: studentEX,
      quarterlyAssessment: studentEX.te || "",
      writtenWorkColumns,
      performanceTaskColumns,
      examConfig,
      weights,
    });
  }, [studentWW, studentPT, studentEX, writtenWorkColumns, performanceTaskColumns, examConfig, weights]);

  return (
    <tr className="student-row">
      {/* NUMBER */}
      <td className="cr-student-num">{number}</td>

      {/* LEARNERS' NAME */}
      <td className="cr-student-name" title={`LRN: ${student.lrn || "N/A"}`}>
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
          <td key={column.id} className={`cr-score-input-cell ${isScoreFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={column.max_score}
                value={val !== undefined ? val : ""}
                disabled={isLocked}
                readOnly={isLocked}
                className={`cr-score-input ${isExceeded ? "exceeded-score-input" : ""} ${isScoreFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
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

      <td className="cr-calc-cell">{rowCalculation.writtenWorks.total}</td>
      <td className={`cr-calc-cell ${rowCalculation.writtenWorks.isFailing ? "failing-metric" : ""}`}>
        {rowCalculation.writtenWorks.ps}
      </td>
      <td className="cr-calc-cell">{rowCalculation.writtenWorks.ws}</td>

      {/* PERFORMANCE TASKS */}
      {performanceTaskColumns.map((column) => {
        const val = studentPT[column.id];
        const numVal = Number(val);
        const cellKey = `${student.id}_${column.id}`;
        const isExceeded = errorTooltip?.cellKey === cellKey;
        const isScoreFailing = !isExceeded && val !== undefined && val !== "" && !isNaN(numVal) && column.max_score > 0 && numVal / column.max_score < 0.6;

        return (
          <td key={column.id} className={`cr-score-input-cell ${isScoreFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={column.max_score}
                value={val !== undefined ? val : ""}
                disabled={isLocked}
                readOnly={isLocked}
                className={`cr-score-input ${isExceeded ? "exceeded-score-input" : ""} ${isScoreFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
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

      <td className="cr-calc-cell">{rowCalculation.performanceTasks.total}</td>
      <td className={`cr-calc-cell ${rowCalculation.performanceTasks.isFailing ? "failing-metric" : ""}`}>
        {rowCalculation.performanceTasks.ps}
      </td>
      <td className="cr-calc-cell">{rowCalculation.performanceTasks.ws}</td>

      {/* EXAMINATIONS: ST1 | ST2 | TE | WS ST1 | WS ST2 | WS TE | PS | WS */}
      {/* ST1 INPUT */}
      {(() => {
        const val = studentEX.st1;
        const numVal = Number(val);
        const cellKey = `${student.id}_st1`;
        const isExceeded = errorTooltip?.cellKey === cellKey;
        const isFailing = !isExceeded && val !== undefined && val !== "" && !isNaN(numVal) && examConfig.st1HPS > 0 && numVal / examConfig.st1HPS < 0.6;
        return (
          <td className={`cr-score-input-cell ${isFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={examConfig.st1HPS}
                value={val !== undefined && val !== null ? val : ""}
                disabled={isLocked}
                readOnly={isLocked}
                className={`cr-score-input ${isExceeded ? "exceeded-score-input" : ""} ${isFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
                onChange={(e) => handleExamScoreChange(student.id, "st1", e.target.value, examConfig.st1HPS, examConfig.st1Id)}
                onBlur={handleScoreBlur}
                title={isLocked ? "Locked" : `Max: ${examConfig.st1HPS}`}
              />
              {isExceeded && <div className="score-exceeded-badge">{errorTooltip.message}</div>}
            </div>
          </td>
        );
      })()}

      {/* ST2 INPUT */}
      {(() => {
        const val = studentEX.st2;
        const numVal = Number(val);
        const cellKey = `${student.id}_st2`;
        const isExceeded = errorTooltip?.cellKey === cellKey;
        const isFailing = !isExceeded && val !== undefined && val !== "" && !isNaN(numVal) && examConfig.st2HPS > 0 && numVal / examConfig.st2HPS < 0.6;
        return (
          <td className={`cr-score-input-cell ${isFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={examConfig.st2HPS}
                value={val !== undefined && val !== null ? val : ""}
                disabled={isLocked}
                readOnly={isLocked}
                className={`cr-score-input ${isExceeded ? "exceeded-score-input" : ""} ${isFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
                onChange={(e) => handleExamScoreChange(student.id, "st2", e.target.value, examConfig.st2HPS, examConfig.st2Id)}
                onBlur={handleScoreBlur}
                title={isLocked ? "Locked" : `Max: ${examConfig.st2HPS}`}
              />
              {isExceeded && <div className="score-exceeded-badge">{errorTooltip.message}</div>}
            </div>
          </td>
        );
      })()}

      {/* TE INPUT */}
      {(() => {
        const val = studentEX.te;
        const numVal = Number(val);
        const cellKey = `${student.id}_te`;
        const isExceeded = errorTooltip?.cellKey === cellKey;
        const isFailing = !isExceeded && val !== undefined && val !== "" && !isNaN(numVal) && examConfig.teHPS > 0 && numVal / examConfig.teHPS < 0.6;
        return (
          <td className={`cr-score-input-cell ${isFailing ? "failing-cell" : ""}`}>
            <div className="grade-input-wrapper">
              <input
                type="number"
                min="0"
                max={examConfig.teHPS}
                value={val !== undefined && val !== null ? val : ""}
                disabled={isLocked}
                readOnly={isLocked}
                className={`cr-score-input ${isExceeded ? "exceeded-score-input" : ""} ${isFailing ? "failing-input" : ""} ${isLocked ? "locked-input" : ""}`}
                onChange={(e) => handleExamScoreChange(student.id, "te", e.target.value, examConfig.teHPS, examConfig.teId)}
                onBlur={handleScoreBlur}
                title={isLocked ? "Locked" : `Max: ${examConfig.teHPS}`}
              />
              {isExceeded && <div className="score-exceeded-badge">{errorTooltip.message}</div>}
            </div>
          </td>
        );
      })()}

      {/* EX COMPUTED SUB-WEIGHTS */}
      <td className="cr-calc-cell">{rowCalculation.examinations.st1.ws}</td>
      <td className="cr-calc-cell">{rowCalculation.examinations.st2.ws}</td>
      <td className="cr-calc-cell">{rowCalculation.examinations.te.ws}</td>
      <td className={`cr-calc-cell ${rowCalculation.examinations.isFailing ? "failing-metric" : ""}`}>
        {rowCalculation.examinations.ps}
      </td>
      <td className="cr-calc-cell">{rowCalculation.examinations.ws}</td>

      {/* INITIAL GRADE */}
      <td className="cr-summary-cell">
        {rowCalculation.initialGrade !== "-" ? rowCalculation.initialGrade : ""}
      </td>

      {/* TERM GRADE */}
      <td className={`cr-summary-cell term-grade-cell ${rowCalculation.isFailing ? "failing-grade-cell" : ""}`}>
        {rowCalculation.termGrade !== "-" ? rowCalculation.termGrade : ""}
      </td>

      {/* DESCRIPTOR */}
      <td className="cr-descriptor-cell">
        {rowCalculation.descriptor !== "-" ? rowCalculation.descriptor : ""}
      </td>
    </tr>
  );
}