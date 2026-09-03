import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDownNarrowWide, Eye, RefreshCw, Users } from "lucide-react";

import EmptyState from "../../components/common/EmptyState.jsx";
import SearchBar from "../../components/common/SearchBar.jsx";
import SelectFilter from "../../components/common/SelectFilter.jsx";
import TermToggleGroup from "../../components/common/TermToggleGroup.jsx";
import { getStoredUser } from "../../utils/auth.js";
import {
  getSectionDetails,
  normalizeSectionDetailsError,
} from "../../services/sectionDetailsService.js";
import StudentSF9Page from "./StudentSF9Page.jsx";
import SectionDetailsSkeleton from "./SectionDetailsSkeleton.jsx";
import backIconUrl from "../../assets/backButton.svg";

import "../../styles/sectionDetails.css";

const SORT_OPTIONS = [
  { label: "Student Name", value: "name" },
  { label: "LRN", value: "lrn" },
  { label: "Term Grade", value: "termGrade" },
];

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
  UNAVAILABLE: "Unavailable",
};

export default function SectionDetails({
  student,
  section,
  isAdviser,
  userRole = "adviser",
  onBack,
  onViewStudent,
}) {
  const activeSection = section || (student?.sectionName ? student : null);
  const currentUser = useMemo(() => getStoredUser(), []);
  const userId = currentUser?.user_id || currentUser?.id;

  const isSectionAdviser = useMemo(() => {
    if (activeSection?.assignmentType) return activeSection.assignmentType === "advisory";
    if (typeof isAdviser === "boolean") return isAdviser;
    if (typeof activeSection?.isAdviser === "boolean") return activeSection.isAdviser;
    return userRole === "adviser";
  }, [activeSection, isAdviser, userRole]);

  const assignmentType = activeSection?.assignmentType
    || (isSectionAdviser ? "advisory" : "teaching");
  const assignmentId = activeSection?.assignmentId
    || activeSection?.adviser_assignment_id
    || activeSection?.teacher_assignment_id;

  const [data, setData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(
    Boolean(activeSection && assignmentId && userId),
  );
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("T1");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHonor, setSelectedHonor] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [sortAscending, setSortAscending] = useState(true);
  const [activeSf9Student, setActiveSf9Student] = useState(null);

  const dataRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const failedTermRef = useRef(null);

  const loadDetails = useCallback(async (term) => {
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
      });
      if (requestSequence !== requestSequenceRef.current) return;
      dataRef.current = nextData;
      failedTermRef.current = null;
      setData(nextData);
      setSelectedTerm(term);
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
        || String(learner.lrn || "").toLowerCase().includes(query);
      const matchesHonor = !selectedHonor || learner.honorStatus === selectedHonor;
      return matchesSearch && matchesHonor;
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
  }, [data, searchQuery, selectedHonor, sortAscending, sortBy]);

  const kpiCards = useMemo(() => {
    const bands = data?.summary?.performanceBands || {};
    return [
      ...PERFORMANCE_BANDS.map(({ key, colorClass }) => ({
        label: bands[key]?.label || key,
        count: bands[key]?.count ?? 0,
        range: bands[key]?.range || "—",
        colorClass,
      })),
      {
        label: "At-risk",
        count: "—",
        range: "Soon",
        colorClass: "atrisk unavailable",
      },
    ];
  }, [data]);

  const handleActionClick = (learner) => {
    if (onViewStudent) onViewStudent(learner);
    else setActiveSf9Student(learner);
  };

  const handleHonorToggle = (honorKey) => {
    setSelectedHonor((current) => current === honorKey ? null : honorKey);
  };

  const renderHonorBadge = (status) => {
    const classNames = {
      WITH_HONORS: "badge-honor-with",
      WITH_HIGH_HONORS: "badge-honor-high",
      WITH_HIGHEST_HONORS: "badge-honor-highest",
      NONE: "badge-honor-none",
      UNAVAILABLE: "badge-honor-unavailable",
    };
    return (
      <span className={`badge-rect ${classNames[status] || "badge-honor-unavailable"}`}>
        {HONOR_LABELS[status] || "Unavailable"}
      </span>
    );
  };

  if (activeSf9Student) {
    return (
      <StudentSF9Page
        student={activeSf9Student}
        userRole={userRole}
        onBack={() => setActiveSf9Student(null)}
      />
    );
  }

  const backAction = onBack || (() => window.history.back());

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

  if (initialLoading && !data) return <SectionDetailsSkeleton onBack={backAction} />;

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
          <button className="section-details-retry-btn" type="button" onClick={() => loadDetails(failedTermRef.current || "T1")}>
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
      </div>

      <div className="kpi-summary-grid">
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
          <SearchBar query={searchQuery} setQuery={setSearchQuery} placeholder="Search student or LRN..." />
        </div>

        <div className="toolbar-right">
          <div className="filter-segmented-group filter-segmented-group--disabled" aria-label="At-risk filter unavailable">
            {["Low", "Medium", "High"].map((label) => (
              <button key={label} type="button" className="filter-rect-btn" disabled title="At-risk assessments are not available yet">
                {label}
              </button>
            ))}
          </div>

          {isSectionAdviser && (
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
          )}
        </div>
      </div>

      {error && (
        <div className="section-details-error-banner" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error} The previous term remains visible.</span>
          <button type="button" onClick={() => loadDetails(failedTermRef.current || selectedTerm)}>Retry</button>
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
              <SelectFilter value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} minWidth="150px" />
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
            <table className="section-data-table">
              <thead>
                <tr>
                  <th className="text-center section-number-column">No.</th>
                  <th className="text-left section-lrn-column">LRN</th>
                  <th className="text-left section-name-column">Student Name</th>
                  <th className="text-center section-risk-column">At-risk Status</th>
                  <th className="text-center section-grade-column">Term Grade</th>
                  {isSectionAdviser && <th className="text-center section-honor-column">Honor Status</th>}
                  <th className="text-center section-action-column">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLearners.length > 0 ? filteredLearners.map((learner, index) => (
                  <tr key={learner.studentSectionId}>
                    <td className="text-center">{index + 1}</td>
                    <td className="text-left student-lrn">{learner.lrn || "—"}</td>
                    <td className="text-left student-name">{learner.name}</td>
                    <td className="text-center">
                      <span className="badge-rect badge-risk-unavailable">Soon</span>
                    </td>
                    <td className={`text-center ${learner.gradeState === "INCOMPLETE" ? "grade-incomplete" : ""}`}>
                      {Number.isFinite(learner.termGrade) ? learner.termGrade : "Incomplete"}
                    </td>
                    {isSectionAdviser && <td className="text-center">{renderHonorBadge(learner.honorStatus)}</td>}
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
                    <td colSpan={isSectionAdviser ? 7 : 6} className="section-details-no-results">
                      No learners match the current search and honor filters.
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
        <button className="back-btn" onClick={onBack} title="Back to Classes" type="button">
          <img src={backIconUrl} alt="Back" width={17} height={17} />
        </button>
        <h1 className="section-details-title">
          <button type="button" onClick={onBack}>Assigned Classes</button>
        </h1>
      </div>
    </div>
  );
}
