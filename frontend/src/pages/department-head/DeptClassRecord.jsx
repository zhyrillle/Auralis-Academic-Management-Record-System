import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Lock,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect.jsx";
import SearchBar from "../../components/common/SearchBar.jsx";
import Toast from "../../components/common/Toast.jsx";
import depedLogoUrl from "../../assets/deped_logo.png";
import depedWordmarkLogoUrl from "../../assets/deped-logo.gif";
import {
  getDeptFilterOptions,
  getDeptClassRecord,
  downloadDeptClassRecord,
} from "../../services/deptHeadClassRecordApi.js";
import {
  getClassRecord,
  downloadClassRecordExcel,
} from "../../services/classRecordApi.js";
import {
  calculateStudentGrades,
  DEFAULT_JHS_WEIGHTS,
} from "../../utils/depedTransmutation.js";
import { getStoredUser } from "../../utils/auth.js";
import "../../styles/ClassRecord.css";
import "../../styles/masterSheet.css";
import "../../styles/deptClassRecord.css";

const EMPTY_SCORES = Object.freeze({});
const getUserId = (user) => user?.user_id || user?.id || user?.user?.user_id || user?.user?.id || 4;
const emptyToast = { message: "", variant: "success", icon: null };

const formatGradeLevelLabel = (name) => {
  if (!name) return "Grade Level";
  const str = String(name).trim();
  if (/^g\d+$/i.test(str)) {
    return `Grade ${str.replace(/[^0-9]/g, "")}`;
  }
  return str;
};

const formatSubmissionDeadline = (terms = []) => {
  if (!terms || !terms.length) return "Oct 15, 2026";
  const deadlines = terms
    .map((term) => ({
      deadline: term.submissionDeadlineAt,
      timestamp: new Date(term.submissionDeadlineAt).getTime(),
    }))
    .filter((term) => term.deadline && Number.isFinite(term.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!deadlines.length) return "Oct 15, 2026";

  const now = Date.now();
  const relevantDeadline =
    deadlines.find((term) => term.timestamp >= now) ||
    deadlines[deadlines.length - 1];

  return new Date(relevantDeadline.deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Default fallback columns if a class has no assessment entries yet
const DEFAULT_WW_COLUMNS = [
  { id: "ww_1", assessment_id: "ww_1", label: "1", activity_name: "Written Work 1", max_score: 20 },
  { id: "ww_2", assessment_id: "ww_2", label: "2", activity_name: "Written Work 2", max_score: 25 },
  { id: "ww_3", assessment_id: "ww_3", label: "3", activity_name: "Written Work 3", max_score: 20 },
  { id: "ww_4", assessment_id: "ww_4", label: "4", activity_name: "Written Work 4", max_score: 20 },
];

const DEFAULT_PT_COLUMNS = [
  { id: "pt_1", assessment_id: "pt_1", label: "1", activity_name: "Performance Task 1", max_score: 50 },
  { id: "pt_2", assessment_id: "pt_2", label: "2", activity_name: "Performance Task 2", max_score: 40 },
  { id: "pt_3", assessment_id: "pt_3", label: "3", activity_name: "Performance Task 3", max_score: 50 },
  { id: "pt_4", assessment_id: "pt_4", label: "4", activity_name: "Performance Task 4", max_score: 40 },
];

export default function DeptClassRecord() {
  const currentUser = useMemo(() => getStoredUser(), []);
  const effectiveUserId = useMemo(() => getUserId(currentUser), [currentUser]);

  // Loading States
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toast, setToast] = useState(emptyToast);

  // Filters State
  const [filterData, setFilterData] = useState(null);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("1");
  const [selectedGradeLevelId, setSelectedGradeLevelId] = useState("all");
  const [selectedSectionId, setSelectedSectionId] = useState("1");
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);

  // Term & Subject Component State
  const [activeTerm, setActiveTerm] = useState("T1");
  const [mapehComponent, setMapehComponent] = useState("MA");
  const [searchQuery, setSearchQuery] = useState("");

  // Record Payload States
  const [classRecordPayload, setClassRecordPayload] = useState(null);
  const [deptRecordMeta, setDeptRecordMeta] = useState(null);
  const [activeOfferingId, setActiveOfferingId] = useState(null);

  // Department name strictly locked
  const departmentName = useMemo(() => {
    return (
      filterData?.department?.name ||
      deptRecordMeta?.department?.name ||
      currentUser?.department_name ||
      currentUser?.department ||
      "English"
    );
  }, [filterData, deptRecordMeta, currentUser]);

  // Department subjects strictly locked to Department Head's department
  const deptSubjects = useMemo(() => {
    if (filterData?.subjects?.length) {
      return filterData.subjects;
    }
    return [{ subjectId: 3, code: "ENG", name: "English" }];
  }, [filterData]);

  // Initialize selected subject if not yet set
  useEffect(() => {
    if (!selectedSubjectId && deptSubjects.length > 0) {
      setSelectedSubjectId(String(deptSubjects[0].subjectId));
    }
  }, [deptSubjects, selectedSubjectId]);

  // MAPEH subject detection
  const isMapeh = useMemo(() => {
    const currentSubj = deptSubjects.find(
      (s) => String(s.subjectId) === String(selectedSubjectId)
    );
    const subName = (currentSubj?.name || currentSubj?.code || departmentName || "").toLowerCase();
    return (
      subName.includes("mapeh") ||
      subName.includes("music") ||
      subName.includes("arts") ||
      subName.includes("physical education") ||
      subName.includes("health")
    );
  }, [deptSubjects, selectedSubjectId, departmentName]);

  // 1. Load Filter Options on mount
  useEffect(() => {
    let isCancelled = false;

    async function loadOptions() {
      setIsLoadingOptions(true);
      try {
        const options = await getDeptFilterOptions(effectiveUserId);
        if (isCancelled) return;

        if (options && options.sections && options.sections.length > 0) {
          setFilterData(options);

          // Find current or first school year
          const currentSy = options.schoolYears.find((sy) => sy.isCurrent) || options.schoolYears[0];
          if (currentSy) {
            setSelectedSchoolYearId(String(currentSy.id));
          }

          // Default to first section (e.g. Mahogany)
          if (options.sections[0]) {
            setSelectedSectionId(String(options.sections[0].sectionId));
          }

          // Default to first subject under department
          if (options.subjects && options.subjects.length > 0) {
            setSelectedSubjectId(String(options.subjects[0].subjectId));
          }
        }
      } catch (err) {
        console.warn("Could not load department filter options:", err);
      } finally {
        if (!isCancelled) {
          setIsLoadingOptions(false);
        }
      }
    }

    loadOptions();

    return () => {
      isCancelled = true;
    };
  }, [effectiveUserId]);

  // 2. Fetch Class Record whenever section, school year, subject, term, or mapeh component changes
  useEffect(() => {
    if (!selectedSectionId) return;

    let isCancelled = false;

    async function loadFullRecord() {
      setIsLoadingRecord(true);
      try {
        // Step A: Fetch department context & find offeringId for the section
        const deptData = await getDeptClassRecord({
          sectionId: selectedSectionId,
          schoolYearId: selectedSchoolYearId || "1",
          userId: effectiveUserId,
        });

        if (isCancelled) return;
        setDeptRecordMeta(deptData);

        // Find subject offering for the selected subject
        const foundSubj = (deptData?.subjects || []).find(
          (s) => String(s.subjectId) === String(selectedSubjectId)
        ) || deptData?.subjects?.[0];

        const offeringId = foundSubj?.subjectOfferingId || null;
        setActiveOfferingId(offeringId);

        // Step B: Load official class record payload from backend class-record endpoint
        const targetOfferingOrZero = offeringId || 0;
        const recordData = await getClassRecord(
          targetOfferingOrZero,
          activeTerm,
          selectedSectionId,
          isMapeh ? mapehComponent : null,
          selectedSubjectId
        );

        if (isCancelled) return;
        if (recordData) {
          setClassRecordPayload(recordData);
        }
      } catch (err) {
        console.warn("Error fetching department class record:", err);
      } finally {
        if (!isCancelled) {
          setIsLoadingRecord(false);
        }
      }
    }

    loadFullRecord();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedSectionId,
    selectedSchoolYearId,
    selectedSubjectId,
    activeTerm,
    mapehComponent,
    isMapeh,
    effectiveUserId,
  ]);

  // Dropdown Options
  const schoolYearOptions = useMemo(() => {
    if (filterData?.schoolYears?.length) {
      return filterData.schoolYears.map((sy) => ({
        value: String(sy.id),
        label: `SY ${sy.label}${sy.isCurrent ? " (Current)" : ""}`,
      }));
    }
    return [
      { value: "1", label: "SY 2026-2027 (Current)" },
      { value: "2", label: "SY 2025-2026" },
      { value: "3", label: "SY 2027-2028" },
    ];
  }, [filterData]);

  const gradeLevelOptions = useMemo(() => {
    if (filterData?.gradeLevels?.length) {
      return [
        { value: "all", label: "All Grade Levels" },
        ...filterData.gradeLevels.map((gl) => ({
          value: String(gl.id),
          label: formatGradeLevelLabel(gl.name),
        })),
      ];
    }
    return [
      { value: "all", label: "All Grade Levels" },
      { value: "1", label: "Grade 7" },
      { value: "2", label: "Grade 8" },
      { value: "3", label: "Grade 9" },
      { value: "4", label: "Grade 10" },
    ];
  }, [filterData]);

  const filteredSections = useMemo(() => {
    const list = filterData?.sections || [
      { sectionId: 1, sectionName: "Mahogany", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 2, sectionName: "Narra", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 7, sectionName: "Molave", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 17, sectionName: "Tanguile", gradeLevelId: 1, gradeLevelName: "G7" },
      { sectionId: 8, sectionName: "Honesty", gradeLevelId: 2, gradeLevelName: "G8" },
      { sectionId: 9, sectionName: "Fortitude", gradeLevelId: 2, gradeLevelName: "G8" },
      { sectionId: 10, sectionName: "Wisdom", gradeLevelId: 2, gradeLevelName: "G8" },
      { sectionId: 11, sectionName: "Opal", gradeLevelId: 3, gradeLevelName: "G9" },
      { sectionId: 12, sectionName: "Sapphire", gradeLevelId: 3, gradeLevelName: "G9" },
      { sectionId: 13, sectionName: "Emerald", gradeLevelId: 3, gradeLevelName: "G9" },
      { sectionId: 14, sectionName: "Jupiter", gradeLevelId: 4, gradeLevelName: "G10" },
      { sectionId: 15, sectionName: "Saturn", gradeLevelId: 4, gradeLevelName: "G10" },
      { sectionId: 16, sectionName: "Venus", gradeLevelId: 4, gradeLevelName: "G10" },
    ];

    if (selectedGradeLevelId === "all") return list;
    return list.filter(
      (sec) => String(sec.gradeLevelId) === String(selectedGradeLevelId)
    );
  }, [filterData, selectedGradeLevelId]);

  const sectionOptions = useMemo(() => {
    return filteredSections.map((sec) => ({
      value: String(sec.sectionId),
      label: `${formatGradeLevelLabel(sec.gradeLevelName)} - ${sec.sectionName}`,
    }));
  }, [filteredSections]);

  const handleSchoolYearChange = (syId) => {
    setSelectedSchoolYearId(syId);
  };

  const handleGradeLevelChange = (glId) => {
    setSelectedGradeLevelId(glId);
    const newFiltered =
      glId === "all"
        ? filterData?.sections || []
        : (filterData?.sections || []).filter(
            (sec) => String(sec.gradeLevelId) === String(glId)
          );
    if (newFiltered.length > 0) {
      const stillValid = newFiltered.some(
        (sec) => String(sec.sectionId) === String(selectedSectionId)
      );
      if (!stillValid) {
        setSelectedSectionId(String(newFiltered[0].sectionId));
      }
    }
  };

  const handleSectionChange = (secId) => {
    setSelectedSectionId(secId);
  };

  const handleSubjectChange = (subjId) => {
    setSelectedSubjectId(subjId);
  };

  // Metadata resolution
  const currentSectionMeta = useMemo(() => {
    const found = filteredSections.find(
      (s) => String(s.sectionId) === String(selectedSectionId)
    );
    if (found) {
      return {
        sectionName: found.sectionName,
        gradeLevel: formatGradeLevelLabel(found.gradeLevelName),
      };
    }
    return {
      sectionName: deptRecordMeta?.section?.name || classRecordPayload?.class_context?.section_name || "Mahogany",
      gradeLevel: formatGradeLevelLabel(
        deptRecordMeta?.section?.gradeLevel || classRecordPayload?.class_context?.grade_level_name || "Grade 7"
      ),
    };
  }, [filteredSections, selectedSectionId, deptRecordMeta, classRecordPayload]);

  const effectiveSubjectName = useMemo(() => {
    const match = deptSubjects.find((s) => String(s.subjectId) === String(selectedSubjectId));
    return (
      match?.name ||
      classRecordPayload?.class_context?.subject_name ||
      deptRecordMeta?.subjects?.[0]?.label ||
      departmentName ||
      "English"
    );
  }, [deptSubjects, selectedSubjectId, classRecordPayload, deptRecordMeta, departmentName]);

  // Submission deadline indicator
  const submissionDeadline = useMemo(() => {
    return formatSubmissionDeadline(deptRecordMeta?.terms);
  }, [deptRecordMeta?.terms]);

  // Parse Assessments & Columns
  const { writtenWorkColumns, performanceTaskColumns, examConfig, effectiveWeights } = useMemo(() => {
    const data = classRecordPayload;
    const targetComp = data?.mapeh_component || (isMapeh ? mapehComponent : null);

    const wwCols = [];
    const ptCols = [];
    let st1Ass = null;
    let st2Ass = null;
    let teAss = null;

    if (Array.isArray(data?.assessments) && data.assessments.length > 0) {
      data.assessments.forEach((ass) => {
        if (ass.status === "ARCHIVED") return;
        if (isMapeh && ass.mapeh_component && targetComp && ass.mapeh_component !== targetComp) {
          return;
        }

        const compCode = (ass.component_code || "").toUpperCase();
        const type = (ass.type || ass.assessment_type || "").toLowerCase();
        const name = String(ass.activity_name || ass.title || "").toUpperCase();

        const isWW =
          compCode === "WW" ||
          type === "writtenwork" ||
          type === "writtenworks" ||
          type.includes("written") ||
          /\b(written|quiz|ww)\b/i.test(name);

        const isPT =
          !isWW && (
            compCode === "PT" ||
            type === "performancetask" ||
            type === "performancetasks" ||
            type.includes("performance") ||
            /\b(performance|task|pt)\b/i.test(name)
          );

        const isQA =
          !isWW && !isPT && (
            compCode === "QA" ||
            compCode === "STE" ||
            compCode === "EX" ||
            type === "quarterlyassessment" ||
            type.includes("exam") ||
            type.includes("summative") ||
            /\b(summative|term\s*exam|quarterly|st1|st2|te|exam)\b/i.test(name)
          );

        const aId = ass.assessment_id || ass.activity_id;

        if (isWW) {
          wwCols.push({
            id: `ww_${aId}`,
            assessment_id: aId,
            label: String(wwCols.length + 1),
            activity_name: ass.activity_name || ass.title || `Written Work ${wwCols.length + 1}`,
            max_score: Number(ass.max_score ?? ass.highest_possible_score ?? 25),
          });
        } else if (isPT) {
          ptCols.push({
            id: `pt_${aId}`,
            assessment_id: aId,
            label: String(ptCols.length + 1),
            activity_name: ass.activity_name || ass.title || `Performance Task ${ptCols.length + 1}`,
            max_score: Number(ass.max_score ?? ass.highest_possible_score ?? 50),
          });
        } else if (isQA) {
          if (/\b(st1|summative\s*test\s*1|summative\s*1)\b/i.test(name)) {
            st1Ass = ass;
          } else if (/\b(st2|summative\s*test\s*2|summative\s*2)\b/i.test(name)) {
            st2Ass = ass;
          } else if (/\b(te|term\s*exam|quarterly|exam)\b/i.test(name) || !teAss) {
            teAss = ass;
          }
        } else {
          wwCols.push({
            id: `ww_${aId}`,
            assessment_id: aId,
            label: String(wwCols.length + 1),
            activity_name: ass.activity_name || ass.title || `Written Work ${wwCols.length + 1}`,
            max_score: Number(ass.max_score ?? ass.highest_possible_score ?? 25),
          });
        }
      });
    }

    // Fallback default columns if no assessments were added yet
    const resolvedWW = wwCols.length > 0 ? wwCols : DEFAULT_WW_COLUMNS;
    const resolvedPT = ptCols.length > 0 ? ptCols : DEFAULT_PT_COLUMNS;

    let st1W = Number(data?.exam_config?.st1Weight !== undefined ? data.exam_config.st1Weight : (isMapeh ? 25 : 30));
    let st2W = Number(data?.exam_config?.st2Weight !== undefined ? data.exam_config.st2Weight : (isMapeh ? 25 : 30));
    let teW = Number(data?.exam_config?.teWeight !== undefined ? data.exam_config.teWeight : (isMapeh ? 25 : 40));
    if (!isMapeh && st1W === 20 && st2W === 20 && teW === 60) {
      st1W = 30;
      st2W = 30;
      teW = 40;
    }

    const config = {
      st1Weight: isMapeh ? 6.67 : st1W,
      st2Weight: isMapeh ? 6.67 : st2W,
      teWeight: isMapeh ? 6.66 : teW,
      st1HPS: Number(st1Ass?.max_score || st1Ass?.highest_possible_score || data?.exam_config?.st1HPS || (isMapeh ? 25 : 25)),
      st2HPS: Number(st2Ass?.max_score || st2Ass?.highest_possible_score || data?.exam_config?.st2HPS || (isMapeh ? 25 : 25)),
      teHPS: Number(teAss?.max_score || teAss?.highest_possible_score || data?.exam_config?.teHPS || (isMapeh ? 25 : 50)),
    };

    // Component Weights
    const weights = data?.component_weights || (
      isMapeh
        ? DEFAULT_JHS_WEIGHTS.MAPEH
        : DEFAULT_JHS_WEIGHTS.ENGLISH || { WW: 30, PT: 50, EX: 20 }
    );

    return {
      writtenWorkColumns: resolvedWW,
      performanceTaskColumns: resolvedPT,
      examConfig: config,
      effectiveWeights: weights,
    };
  }, [classRecordPayload, isMapeh, mapehComponent]);

  // HPS Totals
  const totalWW_HPS = useMemo(() => {
    return writtenWorkColumns.reduce((acc, c) => acc + (Number(c.max_score) || 0), 0);
  }, [writtenWorkColumns]);

  const totalPT_HPS = useMemo(() => {
    return performanceTaskColumns.reduce((acc, c) => acc + (Number(c.max_score) || 0), 0);
  }, [performanceTaskColumns]);

  // Students & Score Extraction
  const { studentsList, gradesMap } = useMemo(() => {
    const rawStudents = classRecordPayload?.students || deptRecordMeta?.students || [];
    if (!rawStudents.length) {
      return { studentsList: [], gradesMap: {} };
    }

    const gMap = {};
    const parsedStudents = rawStudents.map((st) => {
      const sId = String(st.student_id || st.studentId);
      const rawScores = st.scores || {};
      const wwGrades = {};
      const ptGrades = {};
      const exGrades = { st1: "", st2: "", te: "" };

      writtenWorkColumns.forEach((col) => {
        const val = rawScores[col.assessment_id] !== undefined ? rawScores[col.assessment_id] : rawScores[col.id];
        wwGrades[col.id] = val !== undefined && val !== null ? val : "";
      });

      performanceTaskColumns.forEach((col) => {
        const val = rawScores[col.assessment_id] !== undefined ? rawScores[col.assessment_id] : rawScores[col.id];
        ptGrades[col.id] = val !== undefined && val !== null ? val : "";
      });

      if (st.examinations?.st1 !== undefined && st.examinations?.st1 !== null && st.examinations?.st1 !== "") {
        exGrades.st1 = st.examinations.st1;
      } else if (rawScores.st1 !== undefined && rawScores.st1 !== null) {
        exGrades.st1 = rawScores.st1;
      }

      if (st.examinations?.st2 !== undefined && st.examinations?.st2 !== null && st.examinations?.st2 !== "") {
        exGrades.st2 = st.examinations.st2;
      } else if (rawScores.st2 !== undefined && rawScores.st2 !== null) {
        exGrades.st2 = rawScores.st2;
      }

      if (st.examinations?.te !== undefined && st.examinations?.te !== null && st.examinations?.te !== "") {
        exGrades.te = st.examinations.te;
      } else if (rawScores.te !== undefined && rawScores.te !== null) {
        exGrades.te = rawScores.te;
      } else if (rawScores.qa !== undefined && rawScores.qa !== null) {
        exGrades.te = rawScores.qa;
      }

      gMap[sId] = {
        savedSummary: st.saved_summary || st.savedSummary,
        writtenWorks: wwGrades,
        performanceTasks: ptGrades,
        examinations: exGrades,
        quarterlyAssessment: exGrades.te,
      };

      const first = st.first_name || st.firstName || "";
      const last = st.last_name || st.lastName || "";
      const middle = st.middle_name || st.middleName || "";
      const midInitial = middle ? ` ${middle.charAt(0)}.` : "";

      return {
        id: sId,
        studentId: sId,
        lrn: st.LRN || st.lrn || "—",
        firstName: first,
        lastName: last,
        displayName: st.displayName || `${last}, ${first}${midInitial}`.trim(),
        sex: String(st.sex || "M").toUpperCase().startsWith("F") ? "F" : "M",
      };
    });

    return { studentsList: parsedStudents, gradesMap: gMap };
  }, [classRecordPayload?.students, deptRecordMeta?.students, writtenWorkColumns, performanceTaskColumns]);

  // Real-time Search Filter
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return studentsList;
    return studentsList.filter(
      (st) =>
        (st.displayName && st.displayName.toLowerCase().includes(q)) ||
        `${st.firstName} ${st.lastName}`.toLowerCase().includes(q) ||
        (st.lrn && String(st.lrn).includes(q))
    );
  }, [studentsList, searchQuery]);

  // Group by Gender
  const maleStudents = useMemo(() => {
    return filteredStudents.filter((s) => s.sex === "M");
  }, [filteredStudents]);

  const femaleStudents = useMemo(() => {
    return filteredStudents.filter((s) => s.sex === "F");
  }, [filteredStudents]);

  // Institutional Header Metadata
  const exportMetadata = useMemo(() => {
    const ctx = classRecordPayload?.class_context;
    const termNum = activeTerm.replace(/[^0-9]/g, "") || "1";
    const syObj = filterData?.schoolYears?.find((s) => String(s.id) === String(selectedSchoolYearId));

    return {
      termTitle: `CLASS RECORD - TERM ${termNum}`,
      termHeader: `CLASS RECORD - TERM ${termNum}`,
      region: ctx?.region || deptRecordMeta?.school?.region || "Region X - Northern Mindanao",
      division: ctx?.division || deptRecordMeta?.school?.division || "Gingoog City",
      schoolId: ctx?.school_code || deptRecordMeta?.school?.code || "304033",
      schoolName: ctx?.school_name || deptRecordMeta?.school?.name || "Gingoog City Comprehensive National High School",
      schoolYear: ctx?.school_year_label || syObj?.label || "2026-2027",
      gradeLevelDisplay: currentSectionMeta.gradeLevel,
      teacherName: ctx?.teacher_name || "Unassigned Teacher",
      subjectName: effectiveSubjectName,
      section: currentSectionMeta.sectionName,
    };
  }, [classRecordPayload?.class_context, deptRecordMeta, filterData, selectedSchoolYearId, activeTerm, currentSectionMeta, effectiveSubjectName]);

  // Download Handler (Official Excel XLSX)
  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      if (activeOfferingId) {
        await downloadClassRecordExcel(activeOfferingId, activeTerm, isMapeh ? mapehComponent : null);
      } else {
        const { blob, filename } = await downloadDeptClassRecord({
          sectionId: selectedSectionId,
          schoolYearId: selectedSchoolYearId,
          userId: effectiveUserId,
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }

      setToast({
        message: "Department class record spreadsheet downloaded successfully.",
        variant: "success",
        icon: FileSpreadsheet,
      });
    } catch (err) {
      setToast({
        message: err.message || "Failed to download class record spreadsheet.",
        variant: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Helper to compute a student's row
  const getStudentCalculation = useCallback(
    (student) => {
      const studentGrades = gradesMap[student.id] || EMPTY_SCORES;
      const studentWW = studentGrades.writtenWorks || EMPTY_SCORES;
      const studentPT = studentGrades.performanceTasks || EMPTY_SCORES;
      const studentEX = studentGrades.examinations || {
        st1: "",
        st2: "",
        te: "",
      };

      return {
        studentWW,
        studentPT,
        studentEX,
        calc: calculateStudentGrades({
          writtenWorks: studentWW,
          performanceTasks: studentPT,
          examinations: studentEX,
          quarterlyAssessment: studentEX.te ?? "",
          savedSummary: studentGrades.savedSummary,
          writtenWorkColumns,
          performanceTaskColumns,
          examConfig,
          weights: effectiveWeights,
          isMapeh: Boolean(isMapeh),
          isMapehSubject: Boolean(isMapeh),
        }),
      };
    },
    [gradesMap, writtenWorkColumns, performanceTaskColumns, examConfig, effectiveWeights, isMapeh]
  );

  return (
    <div className="class-record-page dept-class-record-page">
      {/* Toast Feedback */}
      <Toast
        message={toast.message}
        variant={toast.variant}
        icon={toast.icon}
        onClose={() => setToast(emptyToast)}
      />

      {/* 1. TOP HEADER & MULTI-FILTERS BAR */}
      <div className="dept-cr-top-header">
        <div className="ms-page-header">
          <div>
            <p className="ms-page-eyebrow">ACADEMIC MONITORING</p>
            <h1>Class Records</h1>
            <p>
              Department of {departmentName} — Official DepEd e-Class Record View
            </p>
          </div>

          {/* Selectors: School Year, Year Level, Section, Department Subject */}
          <div
            className="ms-selectors"
            aria-label="Department Head class record filters"
          >
            <div className="ms-selector-field">
              <span>School year</span>
              <DropdownSelect
                label="School year"
                value={selectedSchoolYearId}
                options={schoolYearOptions}
                onChange={handleSchoolYearChange}
                disabled={isLoadingOptions || isLoadingRecord}
              />
            </div>

            <div className="ms-selector-field">
              <span>Year level</span>
              <DropdownSelect
                label="Year level"
                value={selectedGradeLevelId}
                options={gradeLevelOptions}
                onChange={handleGradeLevelChange}
                disabled={isLoadingOptions || isLoadingRecord}
              />
            </div>

            <div className="ms-selector-field">
              <span>Section</span>
              <DropdownSelect
                label="Section"
                value={selectedSectionId}
                options={sectionOptions}
                onChange={handleSectionChange}
                disabled={isLoadingOptions || isLoadingRecord}
              />
            </div>

            {deptSubjects.length > 1 && (
              <div className="ms-selector-field">
                <span>Subject</span>
                <DropdownSelect
                  label="Subject"
                  value={selectedSubjectId}
                  options={deptSubjects.map((s) => ({
                    value: String(s.subjectId),
                    label: s.name,
                  }))}
                  onChange={handleSubjectChange}
                  disabled={isLoadingOptions || isLoadingRecord}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. SUBHEADER & CONTROLS ROW (Section Info, View-Only Badge, Search Bar, Download, Term Pills) */}
      <div className="dept-cr-subheader">
        <div className="dept-cr-section-info">
          <h2>Section: {currentSectionMeta.sectionName}</h2>
          <div className="dept-cr-meta-badges">
            <span className="dept-cr-badge dept-badge-subject">
              Subject: {effectiveSubjectName}
            </span>
            <span className="dept-cr-badge dept-badge-viewonly">
              <Lock size={12} /> View-Only (Monitoring Mode)
            </span>
          </div>
        </div>

        <div className="dept-cr-controls-wrap">
          {/* MAPEH Sub-Component Toggle (if subject is MAPEH) */}
          {isMapeh && (
            <div
              className="mapeh-component-toggle"
              role="group"
              aria-label="MAPEH Component Filter"
            >
              <button
                type="button"
                className={`mapeh-toggle-btn ${mapehComponent === "MA" ? "active" : ""}`}
                onClick={() => setMapehComponent("MA")}
              >
                Music & Arts
              </button>
              <button
                type="button"
                className={`mapeh-toggle-btn ${mapehComponent === "PEH" ? "active" : ""}`}
                onClick={() => setMapehComponent("PEH")}
              >
                PE & Health
              </button>
            </div>
          )}

          {/* Interactive Row: SearchBar + [Download & Term Buttons Group] */}
          <div className="dept-cr-interactive-row">
            <div className="dept-cr-search-box">
              <SearchBar
                query={searchQuery}
                setQuery={setSearchQuery}
                placeholder="Search by student name or LRN..."
              />
            </div>

            <div className="dept-cr-btn-group">
              <button
                type="button"
                className="dept-cr-download-btn"
                onClick={handleDownload}
                disabled={isDownloading || isLoadingRecord}
                title="Download official DepEd Excel spreadsheet"
              >
                {isDownloading ? (
                  <LoaderCircle size={15} className="spin-icon" />
                ) : (
                  <span className="action-icon">↓</span>
                )}
                <span>{isDownloading ? "Downloading…" : "Download"}</span>
              </button>

              <div className="term-buttons">
                <button
                  type="button"
                  className={activeTerm === "T1" ? "term-btn active" : "term-btn"}
                  onClick={() => setActiveTerm("T1")}
                >
                  T1
                </button>
                <button
                  type="button"
                  className={activeTerm === "T2" ? "term-btn active" : "term-btn"}
                  onClick={() => setActiveTerm("T2")}
                >
                  T2
                </button>
                <button
                  type="button"
                  className={activeTerm === "T3" ? "term-btn active" : "term-btn"}
                  onClick={() => setActiveTerm("T3")}
                >
                  T3
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. OFFICIAL CLASS RECORD TEMPLATE CONTAINER */}
      <div className="cr-template-container">
        {/* INSTITUTIONAL HEADER & METADATA */}
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
            <img
              src={depedWordmarkLogoUrl}
              alt="DepEd Wordmark"
              className="cr-wordmark-img"
            />
          </div>
        </div>

        {/* TOTAL STUDENTS COUNTER */}
        <div className="student-count">
          Total Students: {filteredStudents.length}
        </div>

        {/* ==================================================
            OFFICIAL TEMPLATE SPREADSHEET TABLE
        ================================================== */}
        {(() => {
          const wwColsCount = writtenWorkColumns.length + 3; // + Total, PS, WS
          const ptColsCount = performanceTaskColumns.length + 3; // + Total, PS, WS
          const exColsCount = isMapeh ? 6 : 8; // MAPEH: ST1, ST2, TE, Total, PS, WS. Standard: ST1, ST2, TE, WS ST1, WS ST2, WS TE, PS, WS
          const totalTableCols = 2 + wwColsCount + ptColsCount + exColsCount + 3; // + No + Name + Initial + Term + Descriptor

          const wwHalf1 = Math.max(1, Math.floor(wwColsCount / 2));
          const wwHalf2 = Math.max(1, wwColsCount - wwHalf1);

          const ptHalf1 = Math.max(1, Math.floor(ptColsCount / 2));
          const ptHalf2 = Math.max(1, ptColsCount - ptHalf1);

          const subjColsCount = exColsCount + 3;
          const subjHalf1 = 3;
          const subjHalf2 = Math.max(1, subjColsCount - subjHalf1);

          return (
            <div className="class-record-table-wrapper">
              <table className="class-record-table">
                {/* Fixed column widths to match adviser template */}
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
                  {isMapeh ? (
                    <>
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                    </>
                  ) : (
                    <>
                      <col style={{ width: "50px", minWidth: "50px" }} />
                      <col style={{ width: "50px", minWidth: "50px" }} />
                      <col style={{ width: "50px", minWidth: "50px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                      <col style={{ width: "48px", minWidth: "48px" }} />
                    </>
                  )}
                  <col style={{ width: "60px", minWidth: "60px" }} />
                  <col style={{ width: "60px", minWidth: "60px" }} />
                  <col style={{ width: "95px", minWidth: "95px" }} />
                </colgroup>

                {/* =================================================
                    TABLE HEADER
                ================================================= */}
                <thead>
                  {/* ROW 1: TABLE INFORMATION HEADER */}
                  <tr>
                    {/* Cell 1: FIRST TERM (spans 4 header rows down to HPS, and 2 columns: index + learner name) */}
                    <th
                      rowSpan={4}
                      colSpan={2}
                      className={`cr-term-col ${isMapeh ? "mapeh-term-col" : ""}`}
                    >
                      {exportMetadata.termHeader}
                    </th>

                    {/* Cell 2: GRADE LEVEL */}
                    <th colSpan={wwHalf1} className="cr-info-label">
                      GRADE LEVEL
                    </th>

                    {/* Cell 3: Grade Level Value */}
                    <td colSpan={wwHalf2} className="cr-info-val">
                      {exportMetadata.gradeLevelDisplay || "Grade 7"}
                    </td>

                    {/* Cell 4: TEACHER (Spans 2 rows vertically) */}
                    <th rowSpan={2} colSpan={ptHalf1} className="cr-info-label">
                      TEACHER
                    </th>

                    {/* Cell 5: Teacher Name */}
                    <td rowSpan={2} colSpan={ptHalf2} className="cr-info-val">
                      {exportMetadata.teacherName || "Unassigned"}
                    </td>

                    {/* Cell 6: SUBJECT (Spans 2 rows vertically) */}
                    <th rowSpan={2} colSpan={subjHalf1} className="cr-info-label">
                      SUBJECT
                    </th>

                    {/* Cell 7: Subject Name (Strictly Department Subject) */}
                    <td rowSpan={2} colSpan={subjHalf2} className="cr-info-val">
                      {exportMetadata.subjectName || "English"}
                    </td>
                  </tr>

                  {/* ROW 2: SECTION */}
                  <tr>
                    <th colSpan={wwHalf1} className="cr-info-label">
                      SECTION
                    </th>
                    <td colSpan={wwHalf2} className="cr-info-val">
                      {exportMetadata.section || "Mahogany"}
                    </td>
                  </tr>

                  {/* ROW 3: COMPONENT HEADERS */}
                  <tr>
                    {/* Group 1: WRITTEN / ORAL WORKS */}
                    <th colSpan={wwColsCount} className="cr-comp-header">
                      <div className="cr-comp-title-wrap">
                        <span>
                          {isMapeh
                            ? "WRITTEN / ORAL WORKS (20%)"
                            : `WRITTEN / ORAL WORKS (${effectiveWeights.WW ?? 30}%)`}
                        </span>
                      </div>
                    </th>

                    {/* Group 2: PRODUCT / PERFORMANCE TASKS */}
                    <th colSpan={ptColsCount} className="cr-comp-header">
                      <div className="cr-comp-title-wrap">
                        <span>
                          {isMapeh
                            ? "PRODUCT / PERFORMANCE TASKS (60%)"
                            : `PRODUCT / PERFORMANCE TASKS (${effectiveWeights.PT ?? 50}%)`}
                        </span>
                      </div>
                    </th>

                    {/* Group 3: EXAMINATIONS */}
                    <th colSpan={exColsCount} className="cr-comp-header">
                      <span>
                        {isMapeh
                          ? "SUMMATIVE TESTS AND TERM EXAMINATIONS (20%)"
                          : `EXAMINATIONS (${effectiveWeights.EX ?? effectiveWeights.QA ?? 20}%)`}
                      </span>
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
                    {/* WW Columns */}
                    {writtenWorkColumns.map((column) => (
                      <th
                        key={column.id}
                        className="cr-sub-header dynamic-col-header"
                        title={column.activity_name || `Written Work ${column.label}`}
                      >
                        <div className="col-header-inner">
                          <span>{column.label}</span>
                        </div>
                      </th>
                    ))}
                    <th className="cr-sub-header">Total</th>
                    <th className="cr-sub-header">PS</th>
                    <th className="cr-sub-header">WS</th>

                    {/* PT Columns */}
                    {performanceTaskColumns.map((column) => (
                      <th
                        key={column.id}
                        className="cr-sub-header dynamic-col-header"
                        title={column.activity_name || `Performance Task ${column.label}`}
                      >
                        <div className="col-header-inner">
                          <span>{column.label}</span>
                        </div>
                      </th>
                    ))}
                    <th className="cr-sub-header">Total</th>
                    <th className="cr-sub-header">PS</th>
                    <th className="cr-sub-header">WS</th>

                    {/* EX Columns */}
                    <th className="cr-sub-header">ST1</th>
                    <th className="cr-sub-header">ST2</th>
                    <th className="cr-sub-header">TE</th>
                    {isMapeh ? (
                      <>
                        <th className="cr-sub-header">Total</th>
                        <th className="cr-sub-header">PS</th>
                        <th className="cr-sub-header">WS</th>
                      </>
                    ) : (
                      <>
                        <th className="cr-sub-header wide-sub">WS ST1</th>
                        <th className="cr-sub-header wide-sub">WS ST2</th>
                        <th className="cr-sub-header wide-sub">WS TE</th>
                        <th className="cr-sub-header">PS</th>
                        <th className="cr-sub-header">WS</th>
                      </>
                    )}
                  </tr>

                  {/* ROW 5 (HPS Row): HIGHEST POSSIBLE SCORE */}
                  <tr className="hps-row">
                    <th colSpan={2} className="cr-hps-title-cell hps-label">
                      HIGHEST POSSIBLE SCORE
                    </th>

                    {/* WW HPS */}
                    {writtenWorkColumns.map((col) => (
                      <td key={col.id} className="cr-hps-cell dept-readonly-hps">
                        {col.max_score}
                      </td>
                    ))}
                    <td className="cr-hps-cell">{totalWW_HPS}</td>
                    <td className="cr-hps-cell">{isMapeh ? "100.00" : "100"}</td>
                    <td className="cr-hps-cell">{effectiveWeights.WW ?? 30}%</td>

                    {/* PT HPS */}
                    {performanceTaskColumns.map((col) => (
                      <td key={col.id} className="cr-hps-cell dept-readonly-hps">
                        {col.max_score}
                      </td>
                    ))}
                    <td className="cr-hps-cell">{totalPT_HPS}</td>
                    <td className="cr-hps-cell">{isMapeh ? "100.00" : "100"}</td>
                    <td className="cr-hps-cell">{effectiveWeights.PT ?? 50}%</td>

                    {/* EX HPS & WEIGHTS */}
                    <td className="cr-hps-cell dept-readonly-hps">
                      {examConfig.st1HPS}
                    </td>
                    <td className="cr-hps-cell dept-readonly-hps">
                      {examConfig.st2HPS}
                    </td>
                    <td className="cr-hps-cell dept-readonly-hps">
                      {examConfig.teHPS}
                    </td>

                    {isMapeh ? (
                      <>
                        <td className="cr-hps-cell">
                          {Number(examConfig.st1HPS || 25) +
                            Number(examConfig.st2HPS || 25) +
                            Number(examConfig.teHPS || 25)}
                        </td>
                        <td className="cr-hps-cell">100.00</td>
                        <td className="cr-hps-cell">
                          {effectiveWeights.EX ?? effectiveWeights.QA ?? 20}%
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="cr-hps-cell dept-readonly-hps">
                          {examConfig.st1Weight}
                        </td>
                        <td className="cr-hps-cell dept-readonly-hps">
                          {examConfig.st2Weight}
                        </td>
                        <td className="cr-hps-cell dept-readonly-hps">
                          {examConfig.teWeight}
                        </td>
                        <td className="cr-hps-cell">100</td>
                        <td className="cr-hps-cell">
                          {effectiveWeights.EX ?? effectiveWeights.QA ?? 20}%
                        </td>
                      </>
                    )}

                    {/* Summary columns in HPS row */}
                    <td className="cr-hps-cell" />
                    <td className="cr-hps-cell" />
                    <td className="cr-hps-cell" />
                  </tr>
                </thead>

                {/* =================================================
                    TABLE BODY (Male and Female Student Rows)
                ================================================= */}
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={totalTableCols}
                        style={{
                          textAlign: "center",
                          padding: "40px 16px",
                          color: "#64748b",
                          fontWeight: 500,
                        }}
                      >
                        {isLoadingRecord
                          ? "Loading class record data…"
                          : "No students currently enrolled or matching search in this section."}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* LEARNERS' NAMES DIVIDER */}
                      <tr className="cr-learners-names-row">
                        <td colSpan={2} className="cr-learners-names-sticky-cell">
                          LEARNERS' NAMES
                        </td>
                        <td
                          colSpan={totalTableCols - 2}
                          className="cr-learners-names-fill-cell"
                          aria-hidden="true"
                        />
                      </tr>

                      {/* MALE DIVIDER */}
                      <tr className="cr-gender-row">
                        <td colSpan={2} className="cr-gender-sticky-cell">
                          MALE {maleStudents.length > 0 ? `(${maleStudents.length})` : "(0)"}
                        </td>
                        <td
                          colSpan={totalTableCols - 2}
                          className="cr-gender-fill-cell"
                          aria-hidden="true"
                        />
                      </tr>

                      {/* MALE STUDENTS */}
                      {maleStudents.map((student, index) => {
                        const { studentWW, studentPT, studentEX, calc } = getStudentCalculation(student);

                        return (
                          <tr key={student.id} className="student-row">
                            <td className="cr-student-num">{index + 1}</td>
                            <td
                              className="cr-student-name"
                              title={`LRN: ${student.lrn || "N/A"}`}
                            >
                              {student.displayName || `${student.lastName}, ${student.firstName}`}
                            </td>

                            {/* Written Works (Read-Only) */}
                            {writtenWorkColumns.map((col) => {
                              const val = studentWW[col.id];
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                col.max_score > 0 &&
                                numVal / col.max_score < 0.6;

                              return (
                                <td
                                  key={col.id}
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="cr-calc-cell">{calc.writtenWorks.total}</td>
                            <td
                              className={`cr-calc-cell ${calc.writtenWorks.isFailing ? "failing-metric" : ""}`}
                            >
                              {calc.writtenWorks.ps}
                            </td>
                            <td className="cr-calc-cell">{calc.writtenWorks.ws}</td>

                            {/* Performance Tasks (Read-Only) */}
                            {performanceTaskColumns.map((col) => {
                              const val = studentPT[col.id];
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                col.max_score > 0 &&
                                numVal / col.max_score < 0.6;

                              return (
                                <td
                                  key={col.id}
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="cr-calc-cell">{calc.performanceTasks.total}</td>
                            <td
                              className={`cr-calc-cell ${calc.performanceTasks.isFailing ? "failing-metric" : ""}`}
                            >
                              {calc.performanceTasks.ps}
                            </td>
                            <td className="cr-calc-cell">{calc.performanceTasks.ws}</td>

                            {/* Examinations (Read-Only) */}
                            {/* ST1 */}
                            {(() => {
                              const val = studentEX.st1;
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                examConfig.st1HPS > 0 &&
                                numVal / examConfig.st1HPS < 0.6;
                              return (
                                <td
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })()}

                            {/* ST2 */}
                            {(() => {
                              const val = studentEX.st2;
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                examConfig.st2HPS > 0 &&
                                numVal / examConfig.st2HPS < 0.6;
                              return (
                                <td
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })()}

                            {/* TE */}
                            {(() => {
                              const val = studentEX.te;
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                examConfig.teHPS > 0 &&
                                numVal / examConfig.teHPS < 0.6;
                              return (
                                <td
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })()}

                            {/* EX Computations */}
                            {isMapeh ? (
                              <>
                                <td className="cr-calc-cell">
                                  {calc.examinations.totalRaw}
                                </td>
                                <td
                                  className={`cr-calc-cell ${calc.examinations.isFailing ? "failing-metric" : ""}`}
                                >
                                  {calc.examinations.ps}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.ws}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="cr-calc-cell">
                                  {calc.examinations.st1?.ws ?? "—"}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.st2?.ws ?? "—"}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.te?.ws ?? "—"}
                                </td>
                                <td
                                  className={`cr-calc-cell ${calc.examinations.isFailing ? "failing-metric" : ""}`}
                                >
                                  {calc.examinations.ps}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.ws}
                                </td>
                              </>
                            )}

                            {/* Initial Grade */}
                            <td className="cr-summary-cell">
                              {calc.initialGrade !== "-" ? calc.initialGrade : ""}
                            </td>

                            {/* Term Grade */}
                            <td
                              className={`cr-summary-cell term-grade-cell ${calc.isFailing ? "failing-grade-cell" : ""}`}
                            >
                              {calc.termGrade !== "-" ? calc.termGrade : ""}
                            </td>

                            {/* Descriptor */}
                            <td className="cr-descriptor-cell">
                              {calc.descriptor !== "-" ? calc.descriptor : ""}
                            </td>
                          </tr>
                        );
                      })}

                      {/* FEMALE DIVIDER */}
                      <tr className="cr-gender-row">
                        <td colSpan={2} className="cr-gender-sticky-cell">
                          FEMALE {femaleStudents.length > 0 ? `(${femaleStudents.length})` : "(0)"}
                        </td>
                        <td
                          colSpan={totalTableCols - 2}
                          className="cr-gender-fill-cell"
                          aria-hidden="true"
                        />
                      </tr>

                      {/* FEMALE STUDENTS */}
                      {femaleStudents.map((student, index) => {
                        const { studentWW, studentPT, studentEX, calc } = getStudentCalculation(student);

                        return (
                          <tr key={student.id} className="student-row">
                            <td className="cr-student-num">
                              {maleStudents.length + index + 1}
                            </td>
                            <td
                              className="cr-student-name"
                              title={`LRN: ${student.lrn || "N/A"}`}
                            >
                              {student.displayName || `${student.lastName}, ${student.firstName}`}
                            </td>

                            {/* Written Works (Read-Only) */}
                            {writtenWorkColumns.map((col) => {
                              const val = studentWW[col.id];
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                col.max_score > 0 &&
                                numVal / col.max_score < 0.6;

                              return (
                                <td
                                  key={col.id}
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="cr-calc-cell">{calc.writtenWorks.total}</td>
                            <td
                              className={`cr-calc-cell ${calc.writtenWorks.isFailing ? "failing-metric" : ""}`}
                            >
                              {calc.writtenWorks.ps}
                            </td>
                            <td className="cr-calc-cell">{calc.writtenWorks.ws}</td>

                            {/* Performance Tasks (Read-Only) */}
                            {performanceTaskColumns.map((col) => {
                              const val = studentPT[col.id];
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                col.max_score > 0 &&
                                numVal / col.max_score < 0.6;

                              return (
                                <td
                                  key={col.id}
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="cr-calc-cell">{calc.performanceTasks.total}</td>
                            <td
                              className={`cr-calc-cell ${calc.performanceTasks.isFailing ? "failing-metric" : ""}`}
                            >
                              {calc.performanceTasks.ps}
                            </td>
                            <td className="cr-calc-cell">{calc.performanceTasks.ws}</td>

                            {/* Examinations (Read-Only) */}
                            {/* ST1 */}
                            {(() => {
                              const val = studentEX.st1;
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                examConfig.st1HPS > 0 &&
                                numVal / examConfig.st1HPS < 0.6;
                              return (
                                <td
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })()}

                            {/* ST2 */}
                            {(() => {
                              const val = studentEX.st2;
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                examConfig.st2HPS > 0 &&
                                numVal / examConfig.st2HPS < 0.6;
                              return (
                                <td
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })()}

                            {/* TE */}
                            {(() => {
                              const val = studentEX.te;
                              const numVal = Number(val);
                              const isFailing =
                                val !== undefined &&
                                val !== "" &&
                                !isNaN(numVal) &&
                                examConfig.teHPS > 0 &&
                                numVal / examConfig.teHPS < 0.6;
                              return (
                                <td
                                  className={`cr-score-input-cell read-only-score ${isFailing ? "failing-cell" : ""}`}
                                >
                                  <span className="dept-cr-score-val">
                                    {val !== undefined && val !== "" ? val : "—"}
                                  </span>
                                </td>
                              );
                            })()}

                            {/* EX Computations */}
                            {isMapeh ? (
                              <>
                                <td className="cr-calc-cell">
                                  {calc.examinations.totalRaw}
                                </td>
                                <td
                                  className={`cr-calc-cell ${calc.examinations.isFailing ? "failing-metric" : ""}`}
                                >
                                  {calc.examinations.ps}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.ws}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="cr-calc-cell">
                                  {calc.examinations.st1?.ws ?? "—"}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.st2?.ws ?? "—"}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.te?.ws ?? "—"}
                                </td>
                                <td
                                  className={`cr-calc-cell ${calc.examinations.isFailing ? "failing-metric" : ""}`}
                                >
                                  {calc.examinations.ps}
                                </td>
                                <td className="cr-calc-cell">
                                  {calc.examinations.ws}
                                </td>
                              </>
                            )}

                            {/* Initial Grade */}
                            <td className="cr-summary-cell">
                              {calc.initialGrade !== "-" ? calc.initialGrade : ""}
                            </td>

                            {/* Term Grade */}
                            <td
                              className={`cr-summary-cell term-grade-cell ${calc.isFailing ? "failing-grade-cell" : ""}`}
                            >
                              {calc.termGrade !== "-" ? calc.termGrade : ""}
                            </td>

                            {/* Descriptor */}
                            <td className="cr-descriptor-cell">
                              {calc.descriptor !== "-" ? calc.descriptor : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* 4. SUBMISSION DEADLINE FOOTER */}
      <footer className="ms-submission-footer dept-cr-footer">
        <div className="ms-submission-footer__copy">
          <span className="ms-submission-footer__icon" aria-hidden="true">
            <FileSpreadsheet size={19} />
          </span>
          <div>
            <strong>Grade Submission Deadline: {submissionDeadline}</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}
