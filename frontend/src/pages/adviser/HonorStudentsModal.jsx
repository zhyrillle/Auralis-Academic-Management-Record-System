import { useMemo, useState } from "react";
import {
  Award,
  Sparkles,
  Download,
  Printer,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Search,
  X,
} from "lucide-react";
import OverlayPanel from "../../components/common/OverlayPanel.jsx";
import { exportHonorStudentsPdf } from "../../utils/exportHonorStudentsPdf.js";
import "../../styles/honorStudentsModal.css";

const FILTER_OPTIONS = [
  { key: "ALL", label: "All" },
  { key: "WITH_HIGHEST_HONORS", label: "Highest" },
  { key: "WITH_HIGH_HONORS", label: "High" },
  { key: "WITH_HONORS", label: "With" },
];

export default function HonorStudentsModal({
  isOpen,
  onClose,
  students = [],
  subjects = [],
  section,
  schoolYear,
  adviserName = "",
  principalName = "",
}) {
  const [selectedFilter, setSelectedFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Compute overall grade completion statistics across the entire section roster
  const completionStats = useMemo(() => {
    const subjectList = subjects || [];
    const totalSubjects = subjectList.length;
    let completeCount = 0;

    (students || []).forEach((student) => {
      // In MasterSheetService, student.generalAverage is only non-null
      // when all subject terms are complete and numeric.
      const hasValidGenAvg =
        typeof student.generalAverage === "number" &&
        Number.isFinite(student.generalAverage);

      if (totalSubjects > 0) {
        let subjectComplete = 0;
        subjectList.forEach((subj) => {
          const gradeObj = student.grades?.[subj.key];
          const terms = gradeObj?.terms || [];
          const finalGrade = gradeObj?.finalGrade;

          if (
            terms.length === 3 &&
            terms.every((t) => typeof t === "number" && Number.isFinite(t)) &&
            typeof finalGrade === "number" &&
            Number.isFinite(finalGrade)
          ) {
            subjectComplete += 1;
          }
        });

        if (subjectComplete === totalSubjects && hasValidGenAvg) {
          completeCount += 1;
        }
      } else if (hasValidGenAvg) {
        completeCount += 1;
      }
    });

    const totalStudents = (students || []).length;
    const isFinalized = totalStudents > 0 && completeCount === totalStudents;
    const pendingCount = Math.max(0, totalStudents - completeCount);
    const completionPercent =
      totalStudents > 0 ? Math.round((completeCount / totalStudents) * 100) : 0;

    return {
      completeCount,
      totalStudents,
      isFinalized,
      pendingCount,
      completionPercent,
    };
  }, [students, subjects]);

  // Compute honor status for each student and filter down strictly to honor awardees
  const honorStudents = useMemo(() => {
    const subjectList = subjects || [];
    const results = [];

    (students || []).forEach((student) => {
      // Must have complete general average
      if (
        typeof student.generalAverage !== "number" ||
        !Number.isFinite(student.generalAverage)
      ) {
        return;
      }

      let hasBelow85 = false;
      let hasFailing = false;

      // If subject list exists, ensure no final grade below 85
      if (subjectList.length > 0) {
        subjectList.forEach((subj) => {
          const gradeObj = student.grades?.[subj.key];
          const finalGrade = gradeObj?.finalGrade;

          if (typeof finalGrade === "number" && Number.isFinite(finalGrade)) {
            if (finalGrade < 75) hasFailing = true;
            if (finalGrade < 85) hasBelow85 = true;
          } else {
            hasBelow85 = true; // Incomplete subject grade disqualifies
          }
        });
      }

      const genAvg = Math.round(student.generalAverage);
      let status = null;
      let statusLabel = "";

      // DepEd Order 36, s. 2016: Academic Excellence Award requires no final grade below 85
      if (!hasBelow85 && !hasFailing) {
        if (genAvg >= 98) {
          status = "WITH_HIGHEST_HONORS";
          statusLabel = "With Highest Honors";
        } else if (genAvg >= 95) {
          status = "WITH_HIGH_HONORS";
          statusLabel = "With High Honors";
        } else if (genAvg >= 90) {
          status = "WITH_HONORS";
          statusLabel = "With Honors";
        }
      }

      // Only include if student earned an honor award
      if (status) {
        results.push({
          ...student,
          status,
          statusLabel,
          genAvgDisplay: genAvg,
          numericAverage: genAvg,
        });
      }
    });

    // Sort descending by General Average, then alphabetically by Name
    return results.sort((a, b) => {
      if (b.numericAverage !== a.numericAverage) {
        return b.numericAverage - a.numericAverage;
      }
      return (a.displayName || "").localeCompare(b.displayName || "");
    });
  }, [students, subjects]);

  // Compute counts for the 3 tiers
  const metrics = useMemo(() => {
    let highest = 0;
    let high = 0;
    let withHonors = 0;

    honorStudents.forEach((s) => {
      if (s.status === "WITH_HIGHEST_HONORS") highest += 1;
      else if (s.status === "WITH_HIGH_HONORS") high += 1;
      else if (s.status === "WITH_HONORS") withHonors += 1;
    });

    return { highest, high, withHonors, total: honorStudents.length };
  }, [honorStudents]);

  // Filtered list based on active pill and search query
  const displayedStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return honorStudents.filter((student) => {
      const matchesSearch =
        !query || student.displayName?.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (selectedFilter === "ALL") return true;
      return student.status === selectedFilter;
    });
  }, [honorStudents, searchQuery, selectedFilter]);

  // Download PDF Handler
  const handleDownloadPdf = async () => {
    if (isExporting || isPrinting || honorStudents.length === 0) return;
    setIsExporting(true);
    try {
      const { blob, filename } = await exportHonorStudentsPdf({
        honorStudents,
        section,
        schoolYear,
        adviserName,
        principalName,
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate Honor Students PDF:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Print PDF Handler
  const handlePrintPdf = async () => {
    if (isExporting || isPrinting || honorStudents.length === 0) return;
    setIsPrinting(true);
    try {
      const { blob } = await exportHonorStudentsPdf({
        honorStudents,
        section,
        schoolYear,
        adviserName,
        principalName,
      });

      const blobUrl = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch {
          window.open(blobUrl, "_blank");
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            URL.revokeObjectURL(blobUrl);
          }, 60000);
        }
      };
    } catch (err) {
      console.error("Failed to print Honor Students PDF:", err);
    } finally {
      setIsPrinting(false);
    }
  };

  const renderBadge = (student) => {
    switch (student.status) {
      case "WITH_HIGHEST_HONORS":
        return (
          <span className="ms-honors-badge ms-honors-badge--highest">
            <Sparkles size={12} aria-hidden="true" />
            With Highest Honors
          </span>
        );
      case "WITH_HIGH_HONORS":
        return (
          <span className="ms-honors-badge ms-honors-badge--high">
            <Sparkles size={12} aria-hidden="true" />
            With High Honors
          </span>
        );
      case "WITH_HONORS":
      default:
        return (
          <span className="ms-honors-badge ms-honors-badge--with">
            <Sparkles size={12} aria-hidden="true" />
            With Honors
          </span>
        );
    }
  };

  const isActionDisabled = isPrinting || isExporting || honorStudents.length === 0;

  const disabledWarningMessage =
    isPrinting || isExporting
      ? "Generating document, please wait..."
      : honorStudents.length === 0
        ? !completionStats.isFinalized
          ? `Warning: Term grades across all subjects are incomplete (${completionStats.pendingCount} students pending). No honor students qualify yet.`
          : "Warning: No students in this section qualify for academic honors."
        : "";

  const title = "Honor Students";
  const eyebrow = section?.name
    ? `${section?.gradeLevel || ""} · ${section.name}${schoolYear?.label ? ` (SY ${schoolYear.label})` : ""}`
    : "Academic Excellence Awardees";

  return (
    <OverlayPanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      description="Official end-of-year academic excellence awardees based on complete term grades from all subjects and general averages."
      variant="modal"
      className="ms-honors-modal"
      footer={
        <button type="button" className="ms-honors-close-btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="ms-honors-modal-body">
        {/* Status notice banner indicating whether the honor list is finalized */}
        <div
          className={`ms-honors-status-banner ${completionStats.isFinalized
            ? "ms-honors-status-banner--finalized"
            : "ms-honors-status-banner--pending"
            }`}
          role="status"
        >
          {completionStats.isFinalized ? (
            <CheckCircle2 size={18} className="ms-honors-banner-icon ms-honors-banner-icon--finalized" aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} className="ms-honors-banner-icon ms-honors-banner-icon--pending" aria-hidden="true" />
          )}
          <div className="ms-honors-banner-text">
            {completionStats.isFinalized ? (
              <>
                <strong>Honor list finalized:</strong> All {completionStats.totalStudents} enrolled learners have complete grades across all subjects and terms recorded.
              </>
            ) : (
              <>
                <strong>Honor list not yet finalized:</strong> {completionStats.completeCount} of {completionStats.totalStudents} learners have complete grades ({completionStats.pendingCount} pending). Rankings and awardees are finalized only when all term grades from all subjects are completed.
              </>
            )}
          </div>
        </div>

        {/* Metric cards (4 cards: Highest, High, With Honors, Grade Completion) */}
        <div className="ms-honors-summary-grid">
          <div className="ms-honors-summary-card ms-honors-summary-card--highest">
            <span className="ms-honors-metric-label">Highest Honors</span>
            <span className="ms-honors-metric-value">{metrics.highest}</span>
            <span className="ms-honors-metric-sub">Average 98 – 100</span>
          </div>

          <div className="ms-honors-summary-card ms-honors-summary-card--high">
            <span className="ms-honors-metric-label">High Honors</span>
            <span className="ms-honors-metric-value">{metrics.high}</span>
            <span className="ms-honors-metric-sub">Average 95 – 97</span>
          </div>

          <div className="ms-honors-summary-card ms-honors-summary-card--with">
            <span className="ms-honors-metric-label">With Honors</span>
            <span className="ms-honors-metric-value">{metrics.withHonors}</span>
            <span className="ms-honors-metric-sub">Average 90 – 94</span>
          </div>

          <div
            className={`ms-honors-summary-card ${completionStats.isFinalized
              ? "ms-honors-summary-card--finalized"
              : "ms-honors-summary-card--pending-card"
              }`}
          >
            <span className="ms-honors-metric-label">Grade Completion</span>
            <span className="ms-honors-metric-value">
              {completionStats.completeCount} / {completionStats.totalStudents}
            </span>
            <span className="ms-honors-metric-sub">
              {completionStats.isFinalized
                ? "All grades complete · Finalized"
                : `${completionStats.pendingCount} pending completion`}
            </span>
            <div className="ms-honors-mini-progress">
              <div
                className={`ms-honors-mini-progress-fill ${completionStats.isFinalized
                  ? "ms-honors-mini-progress-fill--finalized"
                  : "ms-honors-mini-progress-fill--pending"
                  }`}
                style={{ width: `${completionStats.completionPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Toolbar: Filters, Search, Print and Download */}
        <div className="ms-honors-toolbar">
          <div className="ms-honors-filters" role="group" aria-label="Honor Standing Filter">
            {FILTER_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`ms-honors-filter-btn ${selectedFilter === key ? "active" : ""}`}
                aria-pressed={selectedFilter === key}
                onClick={() => setSelectedFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="ms-honors-actions">
            {/* Purpose-built compact search bar */}
            <div className="ms-honors-search-box">
              <Search size={14} className="ms-honors-search-icon" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search honor student..."
                aria-label="Search honor student"
                className="ms-honors-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="ms-honors-search-clear"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Print button with warning tooltip and not-allowed cursor on disabled */}
            <div
              className={`ms-honors-action-wrapper ${isActionDisabled ? "ms-honors-action-wrapper--disabled" : ""
                }`}
            >
              <button
                type="button"
                className="ms-honors-btn-print"
                onClick={handlePrintPdf}
                disabled={isActionDisabled}
                aria-label={disabledWarningMessage || "Print official list of honor students"}
              >
                {isPrinting ? <Loader2 size={14} className="ms-spin" /> : <Printer size={14} />}
                <span>{isPrinting ? "Printing…" : "Print"}</span>
              </button>
              {isActionDisabled && disabledWarningMessage && (
                <div className="ms-honors-action-tooltip" role="tooltip">
                  <AlertTriangle size={13} className="ms-honors-tooltip-warn-icon" aria-hidden="true" />
                  <span>{disabledWarningMessage}</span>
                </div>
              )}
            </div>

            {/* Download button with warning tooltip and not-allowed cursor on disabled */}
            <div
              className={`ms-honors-action-wrapper ${isActionDisabled ? "ms-honors-action-wrapper--disabled" : ""
                }`}
            >
              <button
                type="button"
                className="ms-honors-btn-download"
                onClick={handleDownloadPdf}
                disabled={isActionDisabled}
                aria-label={disabledWarningMessage || "Download PDF of honor students"}
              >
                {isExporting ? <Loader2 size={14} className="ms-spin" /> : <Download size={14} />}
                <span>{isExporting ? "Downloading…" : "Download PDF"}</span>
              </button>
              {isActionDisabled && disabledWarningMessage && (
                <div className="ms-honors-action-tooltip" role="tooltip">
                  <AlertTriangle size={13} className="ms-honors-tooltip-warn-icon" aria-hidden="true" />
                  <span>{disabledWarningMessage}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="ms-honors-table-wrap">
          <table className="ms-honors-table">
            <thead>
              <tr>
                <th className="ms-honors-num-col">No.</th>
                <th>Student Name</th>
                <th className="ms-honors-avg-col">General Average</th>
                <th className="ms-honors-status-col">Honor Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedStudents.length > 0 ? (
                displayedStudents.map((student, index) => (
                  <tr key={student.studentSectionId || student.studentId || index}>
                    <td className="ms-honors-num-col">{index + 1}</td>
                    <td>
                      <span className="ms-honors-student-name">{student.displayName}</span>
                    </td>
                    <td className="ms-honors-avg-col">
                      <span className="ms-honors-gen-avg">
                        {student.genAvgDisplay}
                      </span>
                    </td>
                    <td className="ms-honors-status-col">
                      {renderBadge(student)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="ms-honors-empty-row">
                    {honorStudents.length === 0 ? (
                      <div className="ms-honors-empty-state">
                        {!completionStats.isFinalized ? (
                          <>
                            <AlertTriangle size={24} className="ms-honors-empty-icon ms-honors-empty-icon--warn" />
                            <p className="ms-honors-empty-title">Term Grades Still Pending</p>
                            <p className="ms-honors-empty-desc">
                              {completionStats.completeCount} of {completionStats.totalStudents} learners have complete grades.
                              Academic excellence honors are evaluated only when all grades from all subjects across all terms are completed.
                            </p>
                          </>
                        ) : (
                          <>
                            <Award size={24} className="ms-honors-empty-icon ms-honors-empty-icon--neutral" />
                            <p className="ms-honors-empty-title">No Academic Honors Qualified</p>
                            <p className="ms-honors-empty-desc">
                              All term grades are recorded, but no learners in this section met the criteria
                              (General Average ≥ 90 with no subject grade below 85).
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="ms-honors-empty-state">
                        <Search size={24} className="ms-honors-empty-icon ms-honors-empty-icon--neutral" />
                        <p className="ms-honors-empty-title">No Matching Students Found</p>
                        <p className="ms-honors-empty-desc">
                          No honor students match &ldquo;{searchQuery}&rdquo; under the selected filter.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OverlayPanel>
  );
}