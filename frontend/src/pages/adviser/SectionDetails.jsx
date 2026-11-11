import PageSkeleton, { SkeletonCards, SkeletonContent, SkeletonValue } from '../../components/common/PageSkeleton.jsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowDownNarrowWide, Eye, RefreshCw, Users } from "lucide-react";

import EmptyState from "../../components/common/EmptyState.jsx";
import Badge from "../../components/common/Badge.jsx";
import SearchBar from "../../components/common/SearchBar.jsx";
import SelectFilter from "../../components/common/SelectFilter.jsx";
import TermToggleGroup from "../../components/common/TermToggleGroup.jsx";
import PredictionInfoButton from "../../components/at-risk/PredictionInfoButton.jsx";
import { RISK_BANDS, missingRiskSourcesText } from "../../utils/riskPresentation.js";
import { getStoredUser } from "../../utils/auth.js";
import { getSectionGrade, getSectionRisk } from '../../utils/sectionDetailsPresentation.js';
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
  const [pendingTerm, setPendingTerm] = useState(null);
  const [pendingMode, setPendingMode] = useState(null);
  const [error, setError] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("T1");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [sortAscending, setSortAscending] = useState(true);
  const [activeSf9Student, setActiveSf9Student] = useState(null);
  const [showPredictHelp, setShowPredictHelp] = useState(false);
  const predictHelpId = useId();

  const isSectionAdviser = useMemo(() => {
    if (typeof isAdviser === "boolean") return isAdviser;
    if (typeof activeSection?.isAdviser === "boolean") return activeSection.isAdviser;
    if (data?.context?.assignmentType) return data.context.assignmentType === "advisory";
    if (data?.assignmentType) return data.assignmentType === "advisory";
    if (data?.meta?.assignmentType) return data.meta.assignmentType === "advisory";
    if (activeSection?.assignmentType) return activeSection.assignmentType === "advisory";
    if (activeSection?.classType) return String(activeSection.classType).toLowerCase().includes("advisory");
    return false;
  }, [data, activeSection, isAdviser]);

  const assignmentType = activeSection?.assignmentType
    || (isSectionAdviser ? "advisory" : "teaching");
  const assignmentId = activeSection?.assignmentId
    || activeSection?.adviser_assignment_id
    || activeSection?.teacher_assignment_id
    || activeSection?.assignment_id
    || activeSection?.section_id
    || activeSection?.sectionId
    || activeSection?.id;

  const showRiskColumn = assignmentType === 'teaching';
  const sameAssignment = data?.context?.assignmentType === assignmentType
    && Number(data?.context?.assignmentId) === Number(assignmentId);
  const isEnglishTeachingClass = showRiskColumn && sameAssignment && data?.capabilities?.predictionApplicable === true;
  const riskMode = data?.context?.riskMode || (showRiskColumn ? 'monitoring' : 'advisory');
  const predicting = riskMode === 'prediction';
  const changingContext = Boolean(pendingTerm || pendingMode);
  const predictDisabled = changingContext || (!predicting && !data?.capabilities?.predictionReady);
  const predictHelpLabel = changingContext ? 'Loading term records'
    : predictDisabled ? data?.capabilities?.predictionUnavailableLabel || 'Prediction unavailable'
      : predicting ? 'Showing next-term prediction' : 'Predict next term';
  const predictHelpText = changingContext ? 'Please wait while this term’s records load.'
    : predictDisabled ? data?.capabilities?.predictionUnavailableReason || 'Complete and submit this term’s grades first.'
      : predicting ? 'Turn Predict off to return to this term’s running performance.'
        : 'View the next-term English prediction using this term’s submitted records.';
  const monitoringBands = [{ level: 'low', label: 'Low Risk' }, { level: 'moderate', label: 'Moderate Risk' }, { level: 'high', label: 'High Risk' }];
  const riskBands = (pendingMode || riskMode) === 'prediction' ? RISK_BANDS : monitoringBands;
  const incompleteCount = showRiskColumn && !predicting ? data?.summary?.missingDisplayGradeCount : data?.summary?.incompleteGradeCount;
  const termLabel = pendingTerm ? `Term ${pendingTerm.slice(1)}` : data?.context?.selectedTerm?.label || `Term ${selectedTerm.slice(1)}`;
  const sortOptions = [
    { label: "Student Name", value: "name" },
    { label: `${termLabel} Grade`, value: "termGrade" },
  ];
  const tableMode = showRiskColumn ? "english" : isSectionAdviser ? "advisory" : "teaching";

  const [initialLoading, setInitialLoading] = useState(
    Boolean(activeSection && assignmentId && userId),
  );

  const dataRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const failedTermRef = useRef(null);
  const failedModeRef = useRef(null);

  const loadDetails = useCallback(async (term, force = false, mode = 'monitoring') => {
    if (!assignmentId || !assignmentType || !userId) return;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const hasRetainedContent = Boolean(dataRef.current);

    setError("");
    setInitialLoading(!hasRetainedContent);
    setUpdating(hasRetainedContent);
    setPendingTerm(hasRetainedContent && term !== dataRef.current?.context?.selectedTerm?.code ? term : null);
    const requestedViewMode = assignmentType === 'advisory' ? 'advisory' : mode;
    setPendingMode(hasRetainedContent && requestedViewMode !== dataRef.current?.context?.riskMode ? requestedViewMode : null);

    try {
      const nextData = await getSectionDetails({
        assignmentType,
        assignmentId,
        term,
        riskMode: mode,
        userId,
        force,
      });
      if (requestSequence !== requestSequenceRef.current) return;
      if (nextData.context.riskMode !== dataRef.current?.context?.riskMode
        || term !== dataRef.current?.context?.selectedTerm?.code) setSelectedRisk(null);
      dataRef.current = nextData;
      failedTermRef.current = null;
      failedModeRef.current = null;
      setData(nextData);
      setSelectedTerm(term);
      if (!nextData.capabilities?.atRiskAvailable) setSelectedRisk(null);
    } catch (requestError) {
      if (requestSequence !== requestSequenceRef.current) return;
      failedTermRef.current = term;
      failedModeRef.current = mode;
      setError(normalizeSectionDetailsError(requestError));
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setInitialLoading(false);
        setUpdating(false);
        setPendingTerm(null);
        setPendingMode(null);
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
      failedModeRef.current = null;
      setData(null);
      setError("");
      setSelectedTerm("T1");
      setSearchQuery("");
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
        || learner.name.toLowerCase().includes(query);
      const risk = getSectionRisk(learner, riskMode);
      const matchesRisk = !selectedRisk || (risk?.status === "available" && risk.riskLevel === selectedRisk);
      return matchesSearch && matchesRisk;
    });

    return [...result].sort((left, right) => {
      if (sortBy === "termGrade") {
        const leftGrade = Number.isFinite(getSectionGrade(left, riskMode)) ? getSectionGrade(left, riskMode) : null;
        const rightGrade = Number.isFinite(getSectionGrade(right, riskMode)) ? getSectionGrade(right, riskMode) : null;
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
  }, [data, riskMode, searchQuery, selectedRisk, sortAscending, sortBy]);

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

  const handleActionClick = (learner, initialTab = "personal") => {
    const tab = isSectionAdviser ? initialTab : "personal";
    if (onViewStudent) onViewStudent(learner, tab);
    else setActiveSf9Student({
      studentId: learner.studentId,
      studentSectionId: learner.studentSectionId,
      name: learner.name,
      schoolYearId: data?.context?.schoolYear?.id,
      schoolYear: data?.context?.schoolYear?.label,
      section: data?.context?.sectionName,
      gradeLevel: data?.context?.gradeLevel,
      initialTab: tab,
      isAdviser: isSectionAdviser,
      // SF9 determines its own year-end standing; a selected-term honor is not a final award.
    });
  };

  if (activeSf9Student) {
    return (
      <StudentSF9Page
        student={activeSf9Student}
        initialTab={activeSf9Student.initialTab || "personal"}
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

  const pageControls = (<div className="toolbar-row">
        <div className="section-details-search">
          <SearchBar query={searchQuery} setQuery={setSearchQuery} placeholder="Search student..." />
        </div>

        <div className="toolbar-right">
          {isEnglishTeachingClass && <span className="section-predict-help"
            tabIndex={predictDisabled ? 0 : undefined}
            aria-label={predictDisabled ? 'Why prediction is unavailable' : undefined}
            aria-describedby={showPredictHelp ? predictHelpId : undefined}
            onMouseEnter={() => setShowPredictHelp(true)} onMouseLeave={() => setShowPredictHelp(false)}
            onFocus={() => setShowPredictHelp(true)} onBlur={() => setShowPredictHelp(false)}
            onKeyDown={event => { if (event.key === 'Escape') setShowPredictHelp(false); }}>
            <button type="button" role="switch" aria-checked={(pendingMode || riskMode) === 'prediction'}
            className={`section-predict-toggle${(pendingMode || riskMode) === 'prediction' ? ' active' : ''}`}
            disabled={predictDisabled} aria-describedby={showPredictHelp ? predictHelpId : undefined}
            onClick={() => loadDetails(selectedTerm, false, predicting ? 'monitoring' : 'prediction')}>
            <span className="section-predict-track" aria-hidden="true" />Predict
            </button>
            {showPredictHelp && <span className="section-predict-tooltip" role="tooltip" id={predictHelpId}>
              <strong>{predictHelpLabel}</strong><span>{predictHelpText}</span>
            </span>}
          </span>}
          {showRiskColumn && <div className="section-filter-block">
            <span className="section-filter-label">{(pendingMode || riskMode) === 'prediction' ? 'Predicted risk' : 'Current-term risk'}</span>
            <div className="filter-segmented-group" aria-label="Filter by risk level">
              {riskBands.map(({ level, label }) => (
                <button key={level} type="button" className={`filter-rect-btn ${selectedRisk === level ? "active" : ""}`}
                  disabled={changingContext || !data?.capabilities?.atRiskAvailable} aria-pressed={selectedRisk === level}
                  onClick={() => setSelectedRisk(current => current === level ? null : level)}>
                  {label.replace(" Risk", "")}
                </button>
              ))}
            </div>
          </div>}
        </div>
      </div>);

  if ((initialLoading && !data) || (data && !sameAssignment)) return <SectionDetailsSkeleton onBack={backAction} controls={pageControls} recordControls={<><SelectFilter value={sortBy} onChange={setSortBy} options={sortOptions} minWidth="150px" /><TermToggleGroup selectedTerm={selectedTerm} onSelectTerm={loadDetails} /></>} />;

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
          <button className="section-details-retry-btn" type="button" onClick={() => loadDetails(failedTermRef.current || "T1", true, failedModeRef.current || 'monitoring')}>
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="section-details-page">
      <SectionDetailsHeader onBack={backAction} />

      <div className="section-details-context" aria-label="Selected class context">
        <strong>{data?.context?.gradeLevel} – {data?.context?.sectionName}</strong>
        <span>{data?.context?.subject?.name || "Advisory average"}</span>
        <span>{data?.context?.schoolYear?.label}</span>
        <button className="section-details-refresh" type="button" onClick={() => loadDetails(selectedTerm, true, predicting ? 'prediction' : 'monitoring')} disabled={updating} aria-label="Refresh grades and statuses" title="Refresh grades and statuses">
          <RefreshCw size={16} aria-hidden="true" />Refresh
        </button>
      </div>

      {isEnglishTeachingClass && <div className="section-details-status-note" role="status">
        <div aria-hidden="true" />
        <PredictionInfoButton />
      </div>}

      {data?.notice && <div className="section-details-info-banner" role="status">{data.notice}</div>}
      <SkeletonContent loading={changingContext} skeleton={<SkeletonCards count={5} />}>
      <div className="kpi-summary-grid kpi-summary-grid--grades-only">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="kpi-card">
            <span className="kpi-label">{kpi.label}</span>
            <span className={`kpi-count ${kpi.colorClass}`}>{kpi.count}</span>
            <span className="kpi-range">{kpi.range}</span>
          </div>
        ))}
      </div>

      </SkeletonContent>
      {pageControls}

      {error && (
        <div className="section-details-error-banner" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error} The previous records remain visible.</span>
          <button type="button" onClick={() => loadDetails(failedTermRef.current || selectedTerm, true, failedModeRef.current || riskMode)}>Retry</button>
        </div>
      )}

      {!changingContext && data?.warnings?.length > 0 && (
        <details className="section-details-warning">
          <summary>{data.warnings.length} grade-data warning{data.warnings.length === 1 ? "" : "s"}</summary>
          <ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}

      <div className="table-container-card">
        <div className="table-sub-header">
          <div className="total-students-label">
            {changingContext ? <SkeletonValue label="Loading learner summary" /> : <>Showing {filteredLearners.length} of {data?.summary?.learnerCount || 0} learners
            {incompleteCount > 0 && (
              <span className="incomplete-count"> · {incompleteCount} {showRiskColumn && !predicting ? 'records needed' : 'incomplete'}</span>
            )}</>}
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

            <TermToggleGroup selectedTerm={pendingTerm || selectedTerm} onSelectTerm={loadDetails} />
          </div>
        </div>

        <SkeletonContent loading={changingContext} skeleton={<PageSkeleton label="Loading selected term records" columns={5} />} >
        {data?.summary?.learnerCount === 0 ? (
          <EmptyState
            className="section-details-table-empty"
            icon={Users}
            title="No learners are enrolled"
            description="This assignment does not have an active roster for the selected school year."
          />
        ) : (
          <div className="section-details-table-scroll">
            <table className={`section-data-table section-data-table--${tableMode}${showRiskColumn && isSectionAdviser ? " section-data-table--with-adviser-actions" : ""}`}>
              <thead>
                <tr>
                  <th className="text-center section-number-column">No.</th>
                  <th className="text-left section-name-column">Student Name</th>
                  {showRiskColumn && <th className="text-center section-risk-column">At-risk Status{predicting && <span className="section-status-detail">English · Term {data?.riskContext?.targetTerm?.slice(1)}</span>}</th>}
                  <th className="text-center section-grade-column" title={showRiskColumn && !predicting ? 'Running grade preview from recorded activities; not an official submitted grade.' : 'Submitted term grade.'}>{termLabel} Grade</th>
                  <th className="text-center section-action-column">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLearners.length > 0 ? filteredLearners.map((learner, index) => {
                  const risk = getSectionRisk(learner, riskMode), grade = getSectionGrade(learner, riskMode);
                  return (
                  <tr key={learner.studentSectionId}>
                    <td className="text-center">{index + 1}</td>
                    <td className="text-left section-learner-name">{learner.name}</td>
                    {showRiskColumn && <td className="text-center">
                      <Badge className={`badge-rect ${risk?.status === "available"
                        ? `badge-risk-${risk.riskLevel === "high" ? "atrisk" : risk.riskLevel === 'moderate' ? 'medium' : risk.riskLevel}`
                        : "badge-risk-unavailable"}`}
                        title={risk?.reason
                          || missingRiskSourcesText(risk?.missingSources)
                          || 'Preliminary next-term English risk; not an official grade.'}>
                        {risk?.label || 'Records needed'}
                      </Badge>
                    </td>}
                    <td className={`text-center ${!Number.isFinite(grade) ? "grade-incomplete" : ""}`}>
                      {Number.isFinite(grade) ? grade : showRiskColumn ? '—' : 'Incomplete'}
                    </td>
                    <td className="text-center section-action-cell">
                      <div className="section-actions-wrapper">
                        <button
                          type="button"
                          onClick={() => handleActionClick(learner, "personal")}
                          className="action-eye-btn"
                          title="View Student Profile"
                          aria-label={`View ${learner.name} profile`}
                        >
                          <Eye size={16} />
                        </button>
                        {isSectionAdviser && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleActionClick(learner, "sf9")}
                              className="action-sf-btn action-sf9-btn"
                              title="View Official SF9 Form"
                              aria-label={`View SF9 for ${learner.name}`}
                            >
                              SF9
                            </button>
                            <button
                              type="button"
                              onClick={() => handleActionClick(learner, "sf10")}
                              className="action-sf-btn action-sf10-btn"
                              title="View Official SF10 Form"
                              aria-label={`View SF10 for ${learner.name}`}
                            >
                              SF10
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ); }) : (
                  <tr>
                    <td colSpan={4 + Number(showRiskColumn)} className="section-details-no-results">
                      No learners match the current search and status filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        </SkeletonContent>
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
