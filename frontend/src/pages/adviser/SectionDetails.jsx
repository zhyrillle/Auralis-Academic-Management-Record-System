import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowDownNarrowWide, Eye, RefreshCw, Users } from "lucide-react";

import EmptyState from "../../components/common/EmptyState.jsx";
import Badge from "../../components/common/Badge.jsx";
import SearchBar from "../../components/common/SearchBar.jsx";
import SelectFilter from "../../components/common/SelectFilter.jsx";
import TermToggleGroup from "../../components/common/TermToggleGroup.jsx";
import PredictionInfoButton from "../../components/at-risk/PredictionInfoButton.jsx";
import { RISK_BANDS } from "../../utils/riskPresentation.js";
import { getStoredUser } from "../../utils/auth.js";
import {
  getSectionDetails,
  normalizeSectionDetailsError,
} from "../../services/sectionDetailsService.js";
import StudentSF9Page from "./StudentSF9Page.jsx";
import SectionDetailsSkeleton from "./SectionDetailsSkeleton.jsx";
import BackButton from "../../components/common/BackButton";

import "../../styles/sectionDetails.css";
import "../../styles/modelPreview.css";

const PERFORMANCE_BANDS = [
  { key: "ADVANCING", colorClass: "advancing" },
  { key: "BENCHMARKING", colorClass: "benchmarking" },
  { key: "CONNECTING", colorClass: "connecting" },
  { key: "DEVELOPING", colorClass: "developing" },
  { key: "EMERGING", colorClass: "emerging" },
];

const HONOR_FILTERS = [
  { key: "WITH_HONORS", label: "With" },
  { key: "WITH_HIGH_HONORS", label: "High" },
  { key: "WITH_HIGHEST_HONORS", label: "Highest" },
];

const HONOR_LABELS = {
  WITH_HONORS: "With Honors",
  WITH_HIGH_HONORS: "With High Honors",
  WITH_HIGHEST_HONORS: "With Highest Honors",
  NONE: "None",
  AWAITING_GRADES: "Awaiting grades",
  NEEDS_REVIEW: "Needs review",
  UNAVAILABLE: "Awaiting grades",
};

export default function SectionDetails({
  student,
  section,
  isAdviser,
  userRole = "adviser",
  onBack,
  onViewStudent,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const querySection = useMemo(() => {
    const secId = searchParams.get("sectionId");
    const asgnId = searchParams.get("assignmentId");
    const asgnType = searchParams.get("assignmentType");
    if (!secId && !asgnId) return null;
    return {
      section_id: secId ? Number(secId) || secId : null,
      sectionId: secId ? Number(secId) || secId : null,
      assignmentId: asgnId ? Number(asgnId) || asgnId : null,
      assignmentType: asgnType || undefined,
    };
  }, [searchParams]);

  const activeSection =
    section ||
    location.state?.section ||
    location.state?.activeClass ||
    (student?.sectionName ? student : null) ||
    querySection;
  const currentUser = useMemo(() => getStoredUser(), []);
  const userId = currentUser?.user_id || currentUser?.id;

  const [data, setData] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("T1");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHonor, setSelectedHonor] = useState(null);
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [sortAscending, setSortAscending] = useState(true);
  const [activeSf9Student, setActiveSf9Student] = useState(null);

  const isSectionAdviser = useMemo(() => {
    if (data?.context?.assignmentType) return data.context.assignmentType === "advisory";
    if (data?.assignmentType) return data.assignmentType === "advisory";
    if (data?.meta?.assignmentType) return data.meta.assignmentType === "advisory";
    if (activeSection?.assignmentType) return activeSection.assignmentType === "advisory";
    if (typeof activeSection?.isAdviser === "boolean") return activeSection.isAdviser;
    if (activeSection?.classType) return String(activeSection.classType).startsWith("Advisory Class");
    if (typeof isAdviser === "boolean") return isAdviser;
    return userRole === "adviser";
  }, [data, activeSection, isAdviser, userRole]);

  const assignmentType = activeSection?.assignmentType
    || (isSectionAdviser ? "advisory" : "teaching");
  const assignmentId = activeSection?.assignmentId
    || activeSection?.adviser_assignment_id
    || activeSection?.teacher_assignment_id
    || activeSection?.assignment_id
    || activeSection?.section_id
    || activeSection?.sectionId
    || activeSection?.id;

  const isEnglishTeachingClass = !isSectionAdviser && data?.capabilities?.atRiskApplicable === true;
  const showEnglishRisk = isEnglishTeachingClass && selectedTerm !== "T3";
  const termLabel = data?.context?.selectedTerm?.label || `Term ${selectedTerm.slice(1)}`;
  const sortOptions = [
    { label: "Student Name", value: "name" },
    { label: `${termLabel} Grade`, value: "termGrade" },
  ];
  const tableMode = isSectionAdviser ? "advisory" : showEnglishRisk ? "english" : "teaching";

  const [initialLoading, setInitialLoading] = useState(
    Boolean(activeSection && assignmentId && userId),
  );

  const dataRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const failedTermRef = useRef(null);

  const loadDetails = useCallback(async (term, force = false) => {
    if (!assignmentId || !assignmentType || !userId) return;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const hasRetainedContent = Boolean(dataRef.current);

    setError("");
    setInitialLoading(!hasRetainedContent);
    setUpdating(hasRetainedContent);

    try {
      const nextData = await getSectionDetails({
        assignmentType,
        assignmentId,
        term,
        userId,
        force,
      });
      if (requestSequence !== requestSequenceRef.current) return;
      dataRef.current = nextData;
      failedTermRef.current = null;
      setData(nextData);
      setSelectedTerm(term);
      if (!nextData.capabilities?.atRiskAvailable) setSelectedRisk(null);
    } catch (requestError) {
      if (requestSequence !== requestSequenceRef.current) return;
      failedTermRef.current = term;
      setError(normalizeSectionDetailsError(requestError));
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setInitialLoading(false);
        setUpdating(false);
      }
    }
  }, [assignmentId, assignmentType, userId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      requestSequenceRef.current += 1;
      dataRef.current = null;
      failedTermRef.current = null;
      setData(null);
      setError("");
      setSelectedTerm("T1");
      setSearchQuery("");
      setSelectedHonor(null);
      setSelectedRisk(null);
      if (assignmentId && assignmentType && userId) loadDetails("T1");
    });
    return () => {
      active = false;
      requestSequenceRef.current += 1;
    };
  }, [assignmentId, assignmentType, loadDetails, userId]);

  const filteredLearners = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const result = (data?.learners || []).filter((learner) => {
      const matchesSearch = !query
        || learner.name.toLowerCase().includes(query)
      const matchesHonor = !selectedHonor || learner.honorStatus === selectedHonor;
      const matchesRisk = !selectedRisk || (learner.riskAssessment?.status === "available"
        && learner.riskAssessment.riskLevel === selectedRisk);
      return matchesSearch && matchesHonor && matchesRisk;
    });

    return [...result].sort((left, right) => {
      if (sortBy === "termGrade") {
        const leftGrade = Number.isFinite(left.termGrade) ? left.termGrade : null;
        const rightGrade = Number.isFinite(right.termGrade) ? right.termGrade : null;
        if (leftGrade === null && rightGrade === null) return 0;
        if (leftGrade === null) return 1;
        if (rightGrade === null) return -1;
        return sortAscending ? leftGrade - rightGrade : rightGrade - leftGrade;
      }

      const leftValue = String(left[sortBy] || "").toLowerCase();
      const rightValue = String(right[sortBy] || "").toLowerCase();
      return sortAscending
        ? leftValue.localeCompare(rightValue)
        : rightValue.localeCompare(leftValue);
    });
  }, [data, searchQuery, selectedHonor, selectedRisk, sortAscending, sortBy]);

  const kpiCards = useMemo(() => {
    const bands = data?.summary?.performanceBands || {};
    return [
      ...PERFORMANCE_BANDS.map(({ key, colorClass }) => ({
        label: bands[key]?.label || key,
        count: bands[key]?.count ?? 0,
        range: bands[key]?.range || "—",
        colorClass,
      })),
    ];
  }, [data]);

  const handleActionClick = (learner) => {
    if (onViewStudent) onViewStudent(learner);
    else setActiveSf9Student({
      studentId: learner.studentId,
      studentSectionId: learner.studentSectionId,
      name: learner.name,
      schoolYearId: data.context.schoolYear.id,
      schoolYear: data.context.schoolYear.label,
      section: data.context.sectionName,
      gradeLevel: data.context.gradeLevel,
      // SF9 determines its own year-end standing; a selected-term honor is not a final award.
    });
  };

  const handleHonorToggle = (honorKey) => {
    setSelectedHonor((current) => current === honorKey ? null : honorKey);
  };

  const renderHonorBadge = (learner) => {
    const status = learner.honorStatus;
    const classNames = {
      WITH_HONORS: "badge-honor-with",
      WITH_HIGH_HONORS: "badge-honor-high",
      WITH_HIGHEST_HONORS: "badge-honor-highest",
      NONE: "badge-honor-none",
      UNAVAILABLE: "badge-honor-unavailable",
      AWAITING_GRADES: "badge-honor-unavailable",
      NEEDS_REVIEW: "badge-honor-unavailable",
    };
    const hasCompletionDetails = learner.gradeState !== "COMPLETE" && Boolean(learner.gradeSummary);
    const tooltipId = `honor-completion-${learner.studentSectionId}`;
    return (
      <span className="section-honor-status"
        tabIndex={hasCompletionDetails ? 0 : undefined}
        aria-describedby={hasCompletionDetails ? tooltipId : undefined}>
        <Badge className={`badge-rect ${classNames[status] || "badge-honor-unavailable"}`}>
          {HONOR_LABELS[status] || "Awaiting grades"}
        </Badge>
        {hasCompletionDetails && (
          <span className="section-honor-tooltip" id={tooltipId} role="tooltip">
            {learner.gradeSummary.completeSubjects} / {learner.gradeSummary.requiredSubjects} subjects ready
          </span>
        )}
      </span>
    );
  };

  if (activeSf9Student) {
    return (
      <StudentSF9Page
        student={activeSf9Student}
        isAdviser={isSectionAdviser}
        userRole={userRole}
        onBack={() => setActiveSf9Student(null)}
      />
    );
  }

  const backAction = onBack || (() => navigate(-1));

  if (!activeSection || !assignmentId) {
    return (
      <div className="section-details-page">
        <SectionDetailsHeader onBack={backAction} />
        <div className="section-details-state-card">
          <EmptyState
            className="section-details-state"
            icon={Users}
            title="Select an assigned class"
            description="Open Section Details from an advisory or teaching class to view its official grades."
          />
        </div>
      </div>
    );
  }

  if (initialLoading && !data) return <SectionDetailsSkeleton onBack={backAction} isAdvisory={isSectionAdviser} />;

  if (error && !data) {
    return (
      <div className="section-details-page">
        <SectionDetailsHeader onBack={backAction} />
        <div className="section-details-state-card">
          <EmptyState
            className="section-details-state section-details-state--error"
            icon={AlertCircle}
            title="Section Details could not be loaded"
            description={error}
          />
          <button className="section-details-retry-btn" type="button" onClick={() => loadDetails(failedTermRef.current || "T1", true)}>
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`section-details-page ${updating ? "is-updating" : ""}`}>
      <SectionDetailsHeader onBack={backAction} />

      <div className="section-details-context" aria-label="Selected class context">
        <strong>{data?.context?.gradeLevel} – {data?.context?.sectionName}</strong>
        <span>{data?.context?.subject?.name || "Advisory average"}</span>
        <span>{data?.context?.schoolYear?.label}</span>
        <button className="section-details-refresh" type="button" onClick={() => loadDetails(selectedTerm, true)} disabled={updating} aria-label="Refresh grades and statuses" title="Refresh grades and statuses">
          <RefreshCw size={16} aria-hidden="true" />Refresh
        </button>
      </div>

      {(isSectionAdviser || isEnglishTeachingClass) && <div className="section-details-status-note" role="status">
        {isSectionAdviser
          ? <div><p>Honor standing uses complete, submitted or locked {data?.context?.selectedTerm?.label} grades with every learning area passed. It is a term standing, not a year-end award.</p></div>
          : <div aria-hidden="true" />}
        {isEnglishTeachingClass && <PredictionInfoButton />}
      </div>}

      <div className="kpi-summary-grid kpi-summary-grid--grades-only">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="kpi-card">
            <span className="kpi-label">{kpi.label}</span>
            <span className={`kpi-count ${kpi.colorClass}`}>{kpi.count}</span>
            <span className="kpi-range">{kpi.range}</span>
          </div>
        ))}
      </div>

      <div className="toolbar-row">
        <div className="section-details-search">
          <SearchBar query={searchQuery} setQuery={setSearchQuery} placeholder="Search student..." />
        </div>

        <div className="toolbar-right">
          {showEnglishRisk && <div className="section-filter-block">
            <span className="section-filter-label">English risk{data?.riskContext?.targetTerm ? ` · Term ${data.riskContext.targetTerm.slice(1)}` : ""}</span>
            <div className="filter-segmented-group" aria-label="English risk filter">
              {RISK_BANDS.map(({ level, label }) => (
                <button key={level} type="button" className={`filter-rect-btn ${selectedRisk === level ? "active" : ""}`}
                  disabled={!data?.capabilities?.atRiskAvailable} aria-pressed={selectedRisk === level}
                  onClick={() => setSelectedRisk(current => current === level ? null : level)}>
                  {label.replace(" Risk", "")}
                </button>
              ))}
            </div>
          </div>}

          {isSectionAdviser && (
            <div className="section-filter-block">
              <span className="section-filter-label">Honor standing · {data?.context?.selectedTerm?.label}</span>
              <div className="filter-segmented-group" aria-label="Honor standing filter">
                {HONOR_FILTERS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleHonorToggle(key)}
                    className={`filter-rect-btn ${selectedHonor === key ? "active" : ""}`}
                    aria-pressed={selectedHonor === key}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="section-details-error-banner" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error} The previous term remains visible.</span>
          <button type="button" onClick={() => loadDetails(failedTermRef.current || selectedTerm, true)}>Retry</button>
        </div>
      )}

      {data?.warnings?.length > 0 && (
        <details className="section-details-warning">
          <summary>{data.warnings.length} grade-data warning{data.warnings.length === 1 ? "" : "s"}</summary>
          <ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}

      <div className="table-container-card">
        <div className="table-sub-header">
          <div className="total-students-label">
            Showing {filteredLearners.length} of {data?.summary?.learnerCount || 0} learners
            {data?.summary?.incompleteGradeCount > 0 && (
              <span className="incomplete-count"> · {data.summary.incompleteGradeCount} incomplete</span>
            )}
          </div>

          <div className="sub-header-controls">
            <div className="sort-wrapper">
              <span className="sort-label">Sort:</span>
              <SelectFilter value={sortBy} onChange={setSortBy} options={sortOptions} minWidth="150px" />
              <button
                type="button"
                className="sort-order-btn"
                onClick={() => setSortAscending((current) => !current)}
                title="Toggle sorting order"
                aria-label={sortAscending ? "Sort descending" : "Sort ascending"}
              >
                <ArrowDownNarrowWide
                  size={20}
                  style={{ transform: sortAscending ? "none" : "rotate(180deg)" }}
                />
              </button>
            </div>

            <TermToggleGroup selectedTerm={selectedTerm} onSelectTerm={loadDetails} />
          </div>
        </div>

        {data?.summary?.learnerCount === 0 ? (
          <EmptyState
            className="section-details-table-empty"
            icon={Users}
            title="No learners are enrolled"
            description="This assignment does not have an active roster for the selected school year."
          />
        ) : (
          <div className="section-details-table-scroll">
            <table className={`section-data-table section-data-table--${tableMode}`}>
              <thead>
                <tr>
                  <th className="text-center section-number-column">No.</th>
                  <th className="text-left section-name-column">Student Name</th>
                  {showEnglishRisk && <th className="text-center section-risk-column">At-risk Status<span className="section-status-detail">English{data?.riskContext?.targetTerm ? ` · Term ${data.riskContext.targetTerm.slice(1)}` : ""}</span></th>}
                  <th className="text-center section-grade-column">{termLabel} Grade</th>
                  {isSectionAdviser && <th className="text-center section-honor-column">Honor Status</th>}
                  <th className="text-center section-action-column">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLearners.length > 0 ? filteredLearners.map((learner, index) => (
                  <tr key={learner.studentSectionId}>
                    <td className="text-center">{index + 1}</td>
                    <td className="text-left section-learner-name">{learner.name}</td>
                    {showEnglishRisk && <td className="text-center" title={learner.riskAssessment?.reason || "Preliminary next-term English risk; not an official grade."}>
                      <Badge className={`badge-rect ${learner.riskAssessment?.status === "available"
                        ? `badge-risk-${learner.riskAssessment.riskLevel === "high" ? "atrisk" : learner.riskAssessment.riskLevel}`
                        : "badge-risk-unavailable"}`}>
                        {learner.riskAssessment?.label || "Awaiting records"}
                      </Badge>
                    </td>}
                    <td className={`text-center ${learner.gradeState === "INCOMPLETE" ? "grade-incomplete" : ""}`}>
                      {Number.isFinite(learner.termGrade) ? learner.termGrade : "Incomplete"}
                    </td>
                    {isSectionAdviser && <td className="text-center">{renderHonorBadge(learner)}</td>}
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => handleActionClick(learner)}
                        className="action-eye-btn"
                        title="View Student Details"
                        aria-label={`View ${learner.name}`}
                      >
                        <Eye size={20} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5 + Number(isSectionAdviser) + Number(showEnglishRisk)} className="section-details-no-results">
                      No learners match the current search and status filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {updating && (
          <div className="section-details-busy-overlay" role="status" aria-live="polite">
            <span className="section-details-spinner" />
            <span className="sr-only">Updating Section Details</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionDetailsHeader({ onBack }) {
  return (
    <div className="section-details-header-bar">
      <div className="section-details-title-area">
        <BackButton onClick={onBack} label="Back to Classes" />
        <h1 className="section-details-title">
          <button type="button" onClick={onBack}>Assigned Classes</button>
        </h1>
      </div>
    </div>
  );
}
