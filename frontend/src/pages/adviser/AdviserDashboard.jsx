import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Download,
  AlertCircle,
} from "lucide-react";

// Auth
import { getStoredUser } from "../../utils/auth";

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

  const handleDownloadDoc = (docType) => {
    alert(`Generating and downloading ${docType}...`);
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
                  title="Download SF9 Report Card"
                  onClick={() => handleDownloadDoc("SF9 Report Card")}
                >
                  <Download size={15} />
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
                  title="Download SF10 Permanent Record"
                  onClick={() => handleDownloadDoc("SF10 Permanent Record")}
                >
                  <Download size={15} />
                </button>
              </div>
            </div>

            <button
              type="button"
              className="adviser-dashboard__bulk-download-btn"
              onClick={() => handleDownloadDoc("Bulk Documents")}
            >
              Bulk Download
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
    </div>
  );
}