import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import JSZip from "jszip";

// Auth
import { getStoredUser } from "../../utils/auth";

// Exporters & Assets
import { exportSf9Pdf } from "../../utils/exportSf9Pdf";
import { exportSf10Excel } from "../../utils/exportSf10Excel";
import depedLogo from "../../assets/deped_logo.png";
import gccnhsLogo from "../../assets/gccnhs_logo.png";
import Toast from "../../components/common/Toast.jsx";

// Student & Report Services
import { getStudentSF9Details } from "../../services/studentSf9Service";
import { getStudentSF10Details } from "../../services/reportService";
import { getAdviserSections, getStudentsBySection } from "../../services/sectionService";
import { getSectionDetails } from "../../services/sectionDetailsService";

// Services
import {
  getAdviserSummary,
  getSubjectPerformance,
  getAssignedClasses,
  getGradeRangeDistribution,
  getAttendanceTrend,
  getTestExamAnalysis,
  getSubjectAreaPerformance,
  getCoreValuesComparison,
  checkAdviserRole,
} from "../../services/adviserDashboardService";

// Custom Adviser Visual Components
import AdviserStatCard from "../../components/adviser/AdviserStatCard";
import AdviserEntryProgressGauge from "../../components/adviser/AdviserEntryProgressGauge";
import AdviserSubjectBarChart from "../../components/adviser/AdviserSubjectBarChart";
import AdviserClassCard from "../../components/adviser/AdviserClassCard";
import AdviserRadarChart from "../../components/adviser/AdviserRadarChart";
import AdviserAttendanceWaveChart from "../../components/adviser/AdviserAttendanceWaveChart";
import AdviserTestExamAnalysis from "../../components/adviser/AdviserTestExamAnalysis";
import AdviserSubjectAreaHBarChart from "../../components/adviser/AdviserSubjectAreaHBarChart";
import AdviserCoreValuesDonut from "../../components/adviser/AdviserCoreValuesDonut";

// Banner Asset
import bannerArt from "../../assets/adviser-banner-illustration.png";

// Scoped Stylesheet
import "../../styles/AdviserDashboard.css";

export default function AdviserDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());

  // Role flag: strictly determined by presence in SECTION_ADVISER_ASSIGNMENT
  const [isAdviser, setIsAdviser] = useState(() => {
    const user = getStoredUser();
    return Boolean(user?.is_adviser || user?.isAdviser);
  });

  // Loading states
  const [loading, setLoading] = useState(true);

  // Term & Filter State per widget
  const [subjectTerm, setSubjectTerm] = useState("T1");
  const [radarTerm, setRadarTerm] = useState("T1");
  const [radarSection, setRadarSection] = useState("All");
  const [testTerm, setTestTerm] = useState("T1");
  const [testSection, setTestSection] = useState("All");
  const [subjectAreaTerm, setSubjectAreaTerm] = useState("T1");
  const [coreValuesTerm, setCoreValuesTerm] = useState("T1");

  // Data States (Defaults to 0 / empty)
  const [summary, setSummary] = useState({
    sectionAverage: "0%",
    sectionAverageDiff: "0% from Q1",
    lowestPerformingSection: "—",
    lowestPerformingSectionNote: "No data",
    atRiskStudentsCount: 0,
    atRiskStudentsNote: "Across all sections",
    entryProgress: 0,
    totalClasses: 0,
    totalStudents: 0,
    pendingSubmissions: 0,
    submittedGrades: 0,
  });
  const [subjectPerformance, setSubjectPerformance] = useState([]);
  const [assignedClasses, setAssignedClasses] = useState([]);
  const [gradeDistribution, setGradeDistribution] = useState([0, 0, 0, 0, 0]);
  const [attendanceTrend, setAttendanceTrend] = useState([
    { week: "Week 1", count: 0 },
    { week: "Week 2", count: 0 },
    { week: "Week 3", count: 0 },
    { week: "Week 4", count: 0 },
    { week: "Week 5", count: 0 },
  ]);
  const [testExamData, setTestExamData] = useState(null);
  const [subjectAreaData, setSubjectAreaData] = useState([]);
  const [coreValuesData, setCoreValuesData] = useState([]);

  // Compute available sections list from teacher's assigned classes
  const availableSections = useMemo(() => {
    const sectionNames = assignedClasses
      .map((c) => c.sectionName || c.section)
      .filter(Boolean);
    const unique = Array.from(new Set(sectionNames));
    return ["All", ...unique];
  }, [assignedClasses]);

  // Dynamic greeting calculation
  const getGreeting = () => {
    if (!currentUser) return "Hello!";
    const firstName =
      currentUser.first_name ||
      (currentUser.name ? currentUser.name.trim().split(" ")[0] : "");
    return firstName ? `Hello, ${firstName}!` : "Hello!";
  };

  // Initial Load & Role Determination
  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setLoading(true);
      const userId = currentUser?.user_id || currentUser?.id;

      try {
        // Parallel fetch for dashboard metrics and role status
        const [
          roleRes,
          sumRes,
          classesRes,
          attendRes,
          subjPerfRes,
          gradeDistRes,
          testRes,
          subjAreaRes,
          coreRes,
        ] = await Promise.all([
          checkAdviserRole(userId),
          getAdviserSummary(userId),
          getAssignedClasses(userId),
          getAttendanceTrend(userId),
          getSubjectPerformance(subjectTerm, userId),
          getGradeRangeDistribution(radarSection, radarTerm, userId),
          getTestExamAnalysis(testTerm, testSection, userId),
          getSubjectAreaPerformance(subjectAreaTerm, userId),
          getCoreValuesComparison(coreValuesTerm, userId),
        ]);

        if (isMounted) {
          // Strictly apply SECTION_ADVISER_ASSIGNMENT determination
          const resolvedIsAdviser =
            typeof sumRes?.isAdviser === "boolean"
              ? sumRes.isAdviser
              : typeof roleRes?.isAdviser === "boolean"
              ? roleRes.isAdviser
              : false;

          setIsAdviser(resolvedIsAdviser);
          setSummary(sumRes || {});
          setAssignedClasses(classesRes || []);
          setAttendanceTrend(attendRes || []);
          setSubjectPerformance(subjPerfRes || []);
          setGradeDistribution(gradeDistRes || [0, 0, 0, 0, 0]);
          setTestExamData(testRes);
          setSubjectAreaData(subjAreaRes || []);
          setCoreValuesData(coreRes || []);
        }
      } catch (err) {
        console.error("Error loading adviser dashboard data:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Update Subject Performance on term switch
  useEffect(() => {
    const userId = currentUser?.user_id || currentUser?.id;
    getSubjectPerformance(subjectTerm, userId).then((res) =>
      setSubjectPerformance(res || []),
    );
  }, [subjectTerm, currentUser]);

  // Update Radar on term / section switch
  useEffect(() => {
    const userId = currentUser?.user_id || currentUser?.id;
    getGradeRangeDistribution(radarSection, radarTerm, userId).then((res) =>
      setGradeDistribution(res || [0, 0, 0, 0, 0]),
    );
  }, [radarSection, radarTerm, currentUser]);

  // Update Test/Exam on term / section switch
  useEffect(() => {
    const userId = currentUser?.user_id || currentUser?.id;
    getTestExamAnalysis(testTerm, testSection, userId).then(setTestExamData);
  }, [testTerm, testSection, currentUser]);

  // Update Subject Area on term switch (Advisers only)
  useEffect(() => {
    if (!isAdviser) return;
    const userId = currentUser?.user_id || currentUser?.id;
    getSubjectAreaPerformance(subjectAreaTerm, userId).then((res) =>
      setSubjectAreaData(res || []),
    );
  }, [subjectAreaTerm, currentUser, isAdviser]);

  // Update Core Values on term switch (Advisers only)
  useEffect(() => {
    if (!isAdviser) return;
    const userId = currentUser?.user_id || currentUser?.id;
    getCoreValuesComparison(coreValuesTerm, userId).then((res) =>
      setCoreValuesData(res || []),
    );
  }, [coreValuesTerm, currentUser, isAdviser]);

  const handleContinueEntry = (selected) => {
    const cls =
      typeof selected === "object"
        ? selected
        : assignedClasses.find(
            (c) => c.section === selected || c.sectionName === selected,
          ) || { section_name: selected };
    const sectionId = cls.section_id || 1;
    const subjectId = cls.subject_offering_id || cls.subject_id || 1;
    navigate(`/class-record/${sectionId}/${subjectId}`, {
      state: { activeClass: cls },
    });
  };

  const handleSelectSection = (item) => {
    if (!item) return;
    const matchingClass =
      assignedClasses.find(
        (c) =>
          c.section_id === item?.section_id ||
          c.section === item?.section ||
          c.sectionName === item?.section,
      ) || item;

    const assignmentType =
      item.assignmentType ||
      matchingClass.assignmentType ||
      (item.isAdviser ? "advisory" : "teaching");

    const assignmentId =
      item.assignmentId ||
      matchingClass.assignmentId ||
      item.adviser_assignment_id ||
      item.teacher_assignment_id ||
      matchingClass.adviser_assignment_id ||
      matchingClass.teacher_assignment_id ||
      matchingClass.section_id ||
      item.section_id;

    const targetSection = {
      ...matchingClass,
      ...item,
      assignmentType,
      assignmentId,
      section_id: item.section_id || matchingClass.section_id,
      sectionName: item.sectionName || item.section || matchingClass.sectionName || matchingClass.section,
    };

    navigate(
      `/adviser/sections/details?sectionId=${encodeURIComponent(
        targetSection.section_id || ""
      )}&assignmentId=${encodeURIComponent(assignmentId || "")}&assignmentType=${encodeURIComponent(
        assignmentType
      )}`,
      {
        state: { section: targetSection, activeClass: targetSection },
      }
    );
  };

  const toastTimerRef = useRef(null);
  const [downloadingDoc, setDownloadingDoc] = useState(null);
  const [toast, setToast] = useState({ message: "", variant: "info", icon: null, persistent: false });

  const showToast = (message, variant = "info", icon = null, persistent = false) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast({ message, variant, icon, persistent });

    // Only set auto-dismiss timer for non-persistent toasts (e.g. final success or error message)
    if (!persistent && (variant === "success" || variant === "error")) {
      toastTimerRef.current = setTimeout(() => {
        setToast({ message: "", variant: "info", icon: null, persistent: false });
        toastTimerRef.current = null;
      }, 5000);
    }
  };

  const handleDownloadDoc = async (docType) => {
    if (downloadingDoc) return;
    setDownloadingDoc(docType);

    const isSF9 = docType === "SF9 Report Card";
    const isSF10 = docType === "SF10 Permanent Record";
    const isBulk = docType === "Bulk Documents" || (!isSF9 && !isSF10);

    const docLabel = isSF9 ? "SF9 Report Cards" : isSF10 ? "SF10 Permanent Records" : "SF9 & SF10 Documents";
    showToast(`Preparing ${docLabel} bulk download...`, "info", Loader2, true);

    try {
      const userId = currentUser?.user_id || currentUser?.id;

      // 1. Locate the logged-in user's advisory class
      let advClass = assignedClasses.find(
        (c) =>
          c.isAdviser === true ||
          c.assignmentType === "advisory" ||
          (typeof c.classType === "string" && c.classType.toLowerCase().includes("advisory"))
      );

      if (!advClass && userId) {
        try {
          const sections = await getAdviserSections(userId);
          if (Array.isArray(sections) && sections.length > 0) {
            advClass =
              sections.find(
                (s) =>
                  s.isAdviser === true ||
                  (typeof s.classType === "string" && s.classType.toLowerCase().includes("advisory"))
              ) || sections[0];
          }
        } catch (e) {
          console.warn("Could not fetch adviser sections:", e);
        }
      }

      if (!advClass && assignedClasses.length > 0) {
        advClass = assignedClasses[0];
      }

      if (!advClass) {
        throw new Error("No Advisory Class found for your account.");
      }

      const sectionId = advClass.section_id || advClass.id;
      const sectionName = advClass.sectionName || advClass.section || "Advisory_Class";
      const cleanSectionName = String(sectionName).trim().replace(/[^a-zA-Z0-9_-]/g, "_");

      // 2. Fetch students enrolled in this advisory class
      showToast(`Loading students for section ${sectionName}...`, "info", Loader2, true);
      let students = [];

      if (sectionId) {
        try {
          students = await getStudentsBySection(sectionId);
        } catch (e) {
          console.warn("getStudentsBySection failed, trying getSectionDetails:", e);
        }
      }

      const assignmentId =
        advClass.assignmentId ||
        advClass.adviser_assignment_id ||
        advClass.section_id;

      if ((!students || students.length === 0) && assignmentId && userId) {
        try {
          const details = await getSectionDetails({
            assignmentType: "advisory",
            assignmentId,
            userId,
            term: "T1",
          });
          if (details?.learners && Array.isArray(details.learners)) {
            students = details.learners;
          }
        } catch (e) {
          console.warn("getSectionDetails failed:", e);
        }
      }

      if (!students || students.length === 0) {
        throw new Error(`No students found in advisory section ${sectionName}.`);
      }

      showToast(`Generating documents for ${students.length} students...`, "info", Loader2, true);

      // 3. Initialize ZIP and folder structure
      const zip = new JSZip();
      const sf9Folder = isBulk ? zip.folder("SF9") : zip;
      const sf10Folder = isBulk ? zip.folder("SF10") : zip;

      const usedSf9Names = new Set();
      const usedSf10Names = new Set();

      const makeUniqueName = (base, ext, set) => {
        let name = `${base}.${ext}`;
        let counter = 1;
        while (set.has(name)) {
          name = `${base}_${counter}.${ext}`;
          counter++;
        }
        set.add(name);
        return name;
      };

      let successCount = 0;

      // 4. Sequentially process each student to prevent memory spikes & provide clear progress
      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const studentIdentifier =
          student.student_id ||
          student.studentId ||
          student.student_section_id ||
          student.studentSectionId ||
          student.lrn ||
          student.id;

        const lastName = String(
          student.lastName ||
          student.last_name ||
          (student.name ? student.name.split(",")[0] : "STUDENT")
        ).trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "") || "STUDENT";

        const firstName = String(
          student.firstName ||
          student.first_name ||
          (student.name && student.name.includes(",") ? student.name.split(",")[1].trim().split(/\s+/)[0] : "")
        ).trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");

        const studentBaseName = firstName ? `${lastName}_${firstName}` : lastName;

        showToast(
          `Generating documents (${i + 1}/${students.length}): ${student.name || `${lastName}, ${firstName}`}...`,
          "info",
          Loader2,
          true
        );

        // --- Generate SF9 if requested ---
        if (isSF9 || isBulk) {
          try {
            let sf9Data = null;
            if (studentIdentifier) {
              try {
                sf9Data = await getStudentSF9Details(studentIdentifier, {
                  schoolYearId: advClass.schoolYearId || advClass.school_year_id,
                });
              } catch (sf9FetchErr) {
                console.warn(`Could not fetch dynamic SF9 data for student ${studentIdentifier}:`, sf9FetchErr);
              }
            }

            const studentProfile = {
              ...(sf9Data?.studentProfile || {}),
              name: sf9Data?.studentProfile?.name || student.name || `${lastName}, ${firstName}`.trim(),
              lrn: sf9Data?.studentProfile?.lrn || student.lrn || "",
              gradeLevel: sf9Data?.studentProfile?.gradeLevel || advClass.gradeLevel || advClass.grade_level_name || "",
              grade: sf9Data?.studentProfile?.grade || advClass.gradeLevel || advClass.grade_level_name || "",
              section: sf9Data?.studentProfile?.section || advClass.sectionName || advClass.section || sectionName,
              program: sf9Data?.studentProfile?.program || advClass.program_name || advClass.program || "",
              sex: sf9Data?.studentProfile?.sex || student.sex || "",
              age: sf9Data?.studentProfile?.age ?? student.age ?? "",
              schoolYear: sf9Data?.studentProfile?.schoolYear || advClass.schoolYear || advClass.school_year || "",
            };

            const sf9Result = await exportSf9Pdf({
              studentProfile,
              grades: sf9Data?.grades || [],
              performanceDescriptors: sf9Data?.performanceDescriptors || [],
              attendanceData: sf9Data?.attendanceData || {
                months: ["Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
                classDays: new Array(11).fill(0),
                daysPresent: new Array(11).fill(0),
                daysAbsent: new Array(11).fill(0),
              },
              comments: { term1: "", term2: "", term3: "" },
              depedLogo,
              gccnhsLogo,
              skipDownload: true,
            });

            if (sf9Result?.blob) {
              const uniqueSf9FileName = makeUniqueName(`${studentBaseName}_SF9`, "pdf", usedSf9Names);
              sf9Folder.file(uniqueSf9FileName, sf9Result.blob);
              successCount++;
            }
          } catch (sf9Err) {
            console.error(`Error generating SF9 for student ${studentIdentifier}:`, sf9Err);
          }
        }

        // --- Generate SF10 if requested ---
        if (isSF10 || isBulk) {
          try {
            let sf10Data = null;
            if (studentIdentifier) {
              try {
                sf10Data = await getStudentSF10Details(studentIdentifier);
              } catch (sf10FetchErr) {
                console.warn(`Could not fetch dynamic SF10 data for student ${studentIdentifier}:`, sf10FetchErr);
              }
            }

            const sf10StudentProp = {
              ...student,
              studentId: student.student_id || student.id,
              studentSectionId: student.student_section_id || student.studentSectionId,
              lrn: student.lrn,
              name: student.name || `${lastName}, ${firstName}`.trim(),
              section: advClass.sectionName || advClass.section || sectionName,
              gradeLevel: advClass.gradeLevel || advClass.grade_level_name || "",
            };

            const uniqueSf10FileName = makeUniqueName(`${studentBaseName}_SF10`, "xlsx", usedSf10Names);

            const sf10Result = await exportSf10Excel({
              student: sf10StudentProp,
              sf10Data,
              fileName: uniqueSf10FileName,
              skipDownload: true,
            });

            const sf10Blob = sf10Result?.blob || sf10Result?.buffer;
            if (sf10Blob) {
              sf10Folder.file(uniqueSf10FileName, sf10Blob);
              successCount++;
            }
          } catch (sf10Err) {
            console.error(`Error generating SF10 for student ${studentIdentifier}:`, sf10Err);
          }
        }
      }

      if (successCount === 0) {
        throw new Error("No document files could be generated.");
      }

      // 5. Compress and download ZIP
      showToast("Compressing files into ZIP archive...", "info", Loader2, true);
      const zipBlob = await zip.generateAsync({ type: "blob" });

      const zipFileName = isSF9
        ? `${cleanSectionName}_All_SF9_Report_Cards.zip`
        : isSF10
        ? `${cleanSectionName}_All_SF10_Permanent_Records.zip`
        : `${cleanSectionName}_All_Documents_SF9_SF10.zip`;

      if (typeof window !== "undefined" && window.document) {
        const url = window.URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }

      showToast(`Successfully downloaded ${zipFileName}!`, "success", CheckCircle2, false);
    } catch (err) {
      console.error("Bulk document download error:", err);
      showToast(err.message || "Failed to download documents. Please try again.", "error", AlertCircle, false);
    } finally {
      setDownloadingDoc(null);
    }
  };

  return (
    <div className={`adviser-dashboard__container ${!isAdviser ? "adviser-dashboard__container--teacher-view" : ""}`}>
      {/* 1. Header with Title */}
      <header className="adviser-dashboard__header">
        <h1 className="adviser-dashboard__title">Dashboard</h1>
      </header>

      {/* 2. Top Hero Grid (Banner, Stat Cards, Quick Actions [Adviser only], Gauge, Subject Bar Chart) */}
      <section className="adviser-dashboard__top-grid">
        {/* Left Column */}
        <div className="adviser-dashboard__top-left-col">
          {/* Welcome Banner */}
          <div className="adviser-dashboard__welcome-banner">
            <div className="adviser-dashboard__banner-content">
              <h2 className="adviser-dashboard__greeting">{getGreeting()}</h2>
              <p className="adviser-dashboard__greeting-sub">
                Here's an overview of today's academic activities.
              </p>
            </div>
            
            {/* Decorative stationery doodles (background layer, middle band) */}
            <svg
              className="adviser-dashboard__banner-doodles"
              viewBox="0 0 600 140"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
              focusable="false"
            >
              {/* Faint dotted notebook lines */}
              <g stroke="#B45309" strokeOpacity="0.14" strokeWidth="1" strokeDasharray="2 6">
                <line x1="0" y1="34" x2="600" y2="34" />
                <line x1="0" y1="62" x2="600" y2="62" />
                <line x1="0" y1="90" x2="600" y2="90" />
                <line x1="0" y1="118" x2="600" y2="118" />
              </g>

              {/* Ruler (angled along bottom) */}
              <g transform="translate(250 112) rotate(-8)" opacity="0.5">
                <rect x="0" y="0" width="150" height="18" rx="3" fill="#FFFBEB" stroke="#D97706" strokeWidth="1.2" />
                {Array.from({ length: 15 }).map((_, i) => (
                  <line
                    key={i}
                    x1={8 + i * 9.5}
                    y1="0"
                    x2={8 + i * 9.5}
                    y2={i % 5 === 0 ? 9 : 5}
                    stroke="#B45309"
                    strokeWidth="1"
                  />
                ))}
              </g>

              {/* Large pencil */}
              <g className="adviser-dashboard__doodle-float" opacity="0.55">
                <g transform="translate(300 18) rotate(32)">
                  <rect x="0" y="0" width="14" height="10" rx="3" fill="#F472B6" />
                  <rect x="0" y="10" width="14" height="6" fill="#94A3B8" />
                  <rect x="0" y="16" width="14" height="52" fill="#F59E0B" />
                  <line x1="4.5" y1="16" x2="4.5" y2="68" stroke="#D97706" strokeWidth="1" />
                  <line x1="9.5" y1="16" x2="9.5" y2="68" stroke="#D97706" strokeWidth="1" />
                  <polygon points="0,68 14,68 7,82" fill="#FDE68A" />
                  <polygon points="5,78 9,78 7,83" fill="#334155" />
                </g>
              </g>

              {/* Small pencil */}
              <g className="adviser-dashboard__doodle-float adviser-dashboard__doodle-float--delay" opacity="0.45">
                <g transform="translate(408 30) rotate(-28)">
                  <rect x="0" y="0" width="10" height="7" rx="2" fill="#FB7185" />
                  <rect x="0" y="7" width="10" height="4" fill="#94A3B8" />
                  <rect x="0" y="11" width="10" height="36" fill="#EA580C" />
                  <line x1="5" y1="11" x2="5" y2="47" stroke="#C2410C" strokeWidth="0.8" />
                  <polygon points="0,47 10,47 5,57" fill="#FDE68A" />
                  <polygon points="3.5,54 6.5,54 5,58" fill="#334155" />
                </g>
              </g>

              {/* Eraser */}
              <g className="adviser-dashboard__doodle-float" opacity="0.55">
                <g transform="translate(355 62) rotate(-14)">
                  <rect x="0" y="0" width="34" height="18" rx="4" fill="#FBCFE8" stroke="#DB2777" strokeWidth="1" />
                  <rect x="20" y="0" width="14" height="18" rx="0" fill="#FFFFFF" opacity="0.85" />
                  <rect x="20" y="0" width="14" height="18" rx="4" fill="none" stroke="#DB2777" strokeWidth="1" />
                </g>
              </g>

              {/* Paper clip */}
              <path
                d="M 256 20 L 256 52 A 7 7 0 0 0 270 52 L 270 26 A 4 4 0 0 0 262 26 L 262 50"
                fill="none"
                stroke="#78716C"
                strokeOpacity="0.5"
                strokeWidth="2"
                strokeLinecap="round"
                transform="rotate(-18 263 36)"
              />

              {/* Sparkles & stars */}
              <g fill="#D97706" opacity="0.55">
                <path d="M 282 86 l 3 6 l 6 3 l -6 3 l -3 6 l -3 -6 l -6 -3 l 6 -3 Z" />
                <path d="M 440 92 l 2 4 l 4 2 l -4 2 l -2 4 l -2 -4 l -4 -2 l 4 -2 Z" />
                <path d="M 392 16 l 2 4 l 4 2 l -4 2 l -2 4 l -2 -4 l -4 -2 l 4 -2 Z" />
                <circle cx="336" cy="22" r="2" />
                <circle cx="426" cy="70" r="1.6" />
                <circle cx="240" cy="78" r="1.6" />
              </g>
            </svg>

            <div className="adviser-dashboard__banner-art-wrap">
              <img
                src={bannerArt}
                alt="Adviser illustration"
                className="adviser-dashboard__banner-img"
              />
            </div>
          </div>

          {/* 3 KPI Stat Cards Row */}
          <div className="adviser-dashboard__stat-row">
            <AdviserStatCard
              title="Section Average"
              value={summary?.sectionAverage ?? "0%"}
              subtitle={summary?.sectionAverageDiff ?? "0% from Q1"}
              subtitleType="positive"
              loading={loading}
            />
            <AdviserStatCard
              title="Lowest Performing Sec..."
              value={summary?.lowestPerformingSection ?? "—"}
              subtitle={summary?.lowestPerformingSectionNote ?? "No data"}
              subtitleType="warning"
              loading={loading}
            />
            <AdviserStatCard
              title="At-Risk Students"
              value={summary?.atRiskStudentsCount ?? 0}
              subtitle={summary?.atRiskStudentsNote ?? "Across assigned classes"}
              subtitleType="default"
              accentColor="#EF4444"
              loading={loading}
            />
          </div>

        </div>
      </section>

      <section className="adviser-dashboard__performance-row">
        {/* Entry Progress Semi-Circle Gauge Card */}
        <AdviserEntryProgressGauge
          progress={summary?.entryProgress ?? 0}
          loading={loading}
        />

        {/* Section Performance Breakdown Bar Chart */}
        <AdviserSubjectBarChart
          data={subjectPerformance}
          term={subjectTerm}
          onTermChange={setSubjectTerm}
          onSelectSection={handleSelectSection}
          loading={loading}
        />

        {/* Quick Actions Card (Advisers only) */}
        {isAdviser && (
          <div className="adviser-dashboard__quick-actions-card">
            <h3 className="adviser-dashboard__quick-actions-title">
              Quick actions
            </h3>
            <p className="adviser-dashboard__quick-actions-desc">
              Generate official government documents
            </p>

            <div className="adviser-dashboard__quick-action-items">
              <div className="adviser-dashboard__doc-item">
                <div className="adviser-dashboard__doc-left">
                  <FileText size={18} className="adviser-dashboard__doc-icon" />
                  <span className="adviser-dashboard__doc-name">
                    SF9 Report Card
                  </span>
                </div>
                <button
                  type="button"
                  className="adviser-dashboard__doc-download-btn"
                  title="Download All SF9 Report Cards (ZIP)"
                  onClick={() => handleDownloadDoc("SF9 Report Card")}
                  disabled={Boolean(downloadingDoc)}
                >
                  {downloadingDoc === "SF9 Report Card" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Download size={15} />
                  )}
                </button>
              </div>

              <div className="adviser-dashboard__doc-item">
                <div className="adviser-dashboard__doc-left">
                  <FileText size={18} className="adviser-dashboard__doc-icon" />
                  <span className="adviser-dashboard__doc-name">
                    SF10 Permanent Record
                  </span>
                </div>
                <button
                  type="button"
                  className="adviser-dashboard__doc-download-btn"
                  title="Download All SF10 Permanent Records (ZIP)"
                  onClick={() => handleDownloadDoc("SF10 Permanent Record")}
                  disabled={Boolean(downloadingDoc)}
                >
                  {downloadingDoc === "SF10 Permanent Record" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Download size={15} />
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              className="adviser-dashboard__bulk-download-btn"
              onClick={() => handleDownloadDoc("Bulk Documents")}
              disabled={Boolean(downloadingDoc)}
            >
              {downloadingDoc === "Bulk Documents" ? (
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <Loader2 size={15} className="animate-spin" />
                  Downloading All Documents (ZIP)...
                </span>
              ) : (
                "Bulk Download"
              )}
            </button>
          </div>
        )}
      </section>

      {/* 3. Assigned Classes Section */}
      <section className="adviser-dashboard__assigned-section">
        <h2 className="adviser-dashboard__section-heading">Assigned Classes</h2>
        <div className="adviser-dashboard__assigned-classes-grid">
          {/* Class Cards List */}
          {assignedClasses && assignedClasses.length > 0 ? (
            <div className="adviser-dashboard__class-cards-track">
              {assignedClasses.map((cls) => (
                <AdviserClassCard
                  key={cls.id || cls.section_id || cls.section}
                  cls={cls}
                  section={cls.section || cls.sectionName}
                  subject={cls.subject}
                  studentCount={cls.studentCount}
                  entryProgress={cls.entryProgress}
                  status={cls.status}
                  onContinueEntry={handleContinueEntry}
                />
              ))}
            </div>
          ) : (
            <div className="adviser-dashboard__no-classes-card">
              <AlertCircle size={20} className="adviser-dashboard__no-classes-icon" />
              <span>No assigned classes yet. Unable to display data.</span>
            </div>
          )}

          {/* Side Mini Stat Cards */}
          <div className="adviser-dashboard__assigned-stats-col">
            <AdviserStatCard
              title="Pending Submissions"
              value={summary?.pendingSubmissions ?? 0}
              accentColor="#FF6B00"
              topBorderColor="#FF6B00"
              loading={loading}
            />
            <AdviserStatCard
              title="Submitted Grades"
              value={summary?.submittedGrades ?? 0}
              accentColor="#10B981"
              topBorderColor="#10B981"
              loading={loading}
            />
          </div>
        </div>
      </section>

      {/* 4. Middle Row (Grade Range Radar & Attendance Trend Wave + Totals) */}
      <section className="adviser-dashboard__mid-grid">
        {/* Left: Grade Range Distribution Radar */}
        <AdviserRadarChart
          data={gradeDistribution}
          term={radarTerm}
          onTermChange={setRadarTerm}
          section={radarSection}
          onSectionChange={setRadarSection}
          sections={availableSections}
          loading={loading}
        />

        {/* Right: Attendance Trend Wave & Totals */}
        <div className="adviser-dashboard__mid-right-col">
          <AdviserAttendanceWaveChart
            data={attendanceTrend}
            loading={loading}
          />

          <div className="adviser-dashboard__totals-row">
            <AdviserStatCard
              title="Total Classes"
              value={summary?.totalClasses ?? 0}
              loading={loading}
            />
            <AdviserStatCard
              title="Total Students"
              value={summary?.totalStudents ?? 0}
              loading={loading}
            />
          </div>
        </div>
      </section>

      {/* 5. Test/Exam Result Analysis */}
      <section className="adviser-dashboard__test-section">
        <h2 className="adviser-dashboard__section-heading">
          Test/Exam Result Analysis
        </h2>
        <AdviserTestExamAnalysis
          data={testExamData}
          term={testTerm}
          onTermChange={setTestTerm}
          section={testSection}
          onSectionChange={setTestSection}
          sections={availableSections}
          loading={loading}
        />
      </section>

      {/* 6. Bottom Row: Subject Area Performance & Core Values Donut (Advisers only) */}
      {isAdviser && (
        <section className="adviser-dashboard__bottom-grid">
          <AdviserSubjectAreaHBarChart
            data={subjectAreaData}
            term={subjectAreaTerm}
            onTermChange={setSubjectAreaTerm}
            loading={loading}
          />

        </section>
      )}

      {/* Toast Notification */}
      {toast.message && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          icon={toast.icon}
          persistent={toast.persistent}
          onDismiss={downloadingDoc ? undefined : () => {
            if (toastTimerRef.current) {
              clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
            }
            setToast({ message: "", variant: "info", icon: null, persistent: false });
          }}
        />
      )}
    </div>
  );
}