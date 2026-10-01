import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import DropdownSelect from "../../components/common/DropdownSelect.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import SearchBar from "../../components/common/SearchBar.jsx";
import Toast from "../../components/common/Toast.jsx";
import MasterSheetSkeleton from "./MasterSheetSkeleton.jsx";
import {
  downloadMasterSheet,
  getMasterSheet,
  getMasterSheetOptions,
  normalizeMasterSheetError,
} from "../../services/masterSheetService.js";
import { getStoredUser } from "../../utils/auth.js";
import "../../styles/masterSheet.css";

const getUserId = (user) => user?.user_id || user?.id || null;
const emptyToast = { message: "", variant: "success", icon: null };

const formatSubmissionDeadline = (terms = []) => {
  const deadlines = terms
    .map((term) => ({
      deadline: term.submissionDeadlineAt,
      timestamp: new Date(term.submissionDeadlineAt).getTime(),
    }))
    .filter((term) => term.deadline && Number.isFinite(term.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!deadlines.length) return "Not set";

  const now = Date.now();
  const relevantDeadline =
    deadlines.find((term) => term.timestamp >= now) ||
    deadlines[deadlines.length - 1];

  return new Date(relevantDeadline.deadline).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const triggerBrowserDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export default function MasterSheet() {
  const currentUser = useMemo(() => getStoredUser(), []);
  const userId = getUserId(currentUser);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [masterSheet, setMasterSheet] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [toast, setToast] = useState(emptyToast);
  const masterSheetRef = useRef(null);
  const lastLoadedAssignmentIdRef = useRef("");
  const skipNextAssignmentLoadRef = useRef(false);

  const selectedAssignment = assignments.find(
    (assignment) =>
      String(assignment.adviserAssignmentId) === String(selectedAssignmentId),
  );
  const selectedSchoolYearId = selectedAssignment?.schoolYearId || "";
  const schoolYearOptions = useMemo(() => {
    const uniqueYears = new Map();
    assignments.forEach((assignment) => {
      if (!uniqueYears.has(assignment.schoolYearId)) {
        uniqueYears.set(assignment.schoolYearId, {
          value: assignment.schoolYearId,
          label: `${assignment.schoolYearLabel}${assignment.isCurrent ? " · Current" : ""}`,
        });
      }
    });
    return [...uniqueYears.values()];
  }, [assignments]);
  const assignmentsForSelectedYear = assignments.filter(
    (assignment) =>
      String(assignment.schoolYearId) === String(selectedSchoolYearId),
  );
  const sectionOptions = assignmentsForSelectedYear.map((assignment) => ({
    value: assignment.adviserAssignmentId,
    label: `${assignment.gradeLevel} · ${assignment.sectionName}`,
  }));

  const showToast = (message, variant = "success", icon = null) => {
    setToast({ message, variant, icon });
  };

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = window.setTimeout(() => setToast(emptyToast), 3400);
    return () => window.clearTimeout(timer);
  }, [toast.message]);

  const loadOptions = async () => {
    if (!userId) {
      setRequestError("Sign in again to view your Master Sheet.");
      setIsLoadingOptions(false);
      return;
    }
    setIsLoadingOptions(true);
    setRequestError("");
    try {
      const response = await getMasterSheetOptions(userId);
      const nextAssignments = response.assignments || [];
      setAssignments(nextAssignments);
      const preferred =
        nextAssignments.find((assignment) => assignment.isCurrent) ||
        nextAssignments[0];
      setSelectedAssignmentId(
        preferred ? String(preferred.adviserAssignmentId) : "",
      );
    } catch (error) {
      setRequestError(normalizeMasterSheetError(error));
    } finally {
      setIsLoadingOptions(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setRequestError("Sign in again to view your Master Sheet.");
        setIsLoadingOptions(false);
      });
      return () => {
        cancelled = true;
      };
    }

    getMasterSheetOptions(userId)
      .then((response) => {
        if (cancelled) return;
        const nextAssignments = response.assignments || [];
        setAssignments(nextAssignments);
        const preferred =
          nextAssignments.find((assignment) => assignment.isCurrent) ||
          nextAssignments[0];
        if (preferred) setIsLoadingSheet(true);
        setSelectedAssignmentId(
          preferred ? String(preferred.adviserAssignmentId) : "",
        );
      })
      .catch((error) => {
        if (!cancelled) setRequestError(normalizeMasterSheetError(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadMasterSheet = async () => {
    if (!selectedAssignmentId || !userId) {
      setMasterSheet(null);
      return;
    }
    setIsLoadingSheet(true);
    setRequestError("");
    try {
      const response = await getMasterSheet(selectedAssignmentId, userId);
      masterSheetRef.current = response;
      lastLoadedAssignmentIdRef.current = String(selectedAssignmentId);
      setMasterSheet(response);
      if (response.warnings?.length) {
        showToast(
          `Master Sheet loaded with ${response.warnings.length} data warning${response.warnings.length === 1 ? "" : "s"}. Incomplete grades remain blank.`,
          "warning",
          AlertTriangle,
        );
      }
    } catch (error) {
      masterSheetRef.current = null;
      setMasterSheet(null);
      setRequestError(normalizeMasterSheetError(error));
    } finally {
      setIsLoadingSheet(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!selectedAssignmentId || !userId)
      return () => {
        cancelled = true;
      };

    if (skipNextAssignmentLoadRef.current) {
      skipNextAssignmentLoadRef.current = false;
      setIsLoadingSheet(false);
      return () => {
        cancelled = true;
      };
    }

    getMasterSheet(selectedAssignmentId, userId)
      .then((response) => {
        if (cancelled) return;
        masterSheetRef.current = response;
        lastLoadedAssignmentIdRef.current = String(selectedAssignmentId);
        setMasterSheet(response);
        setRequestError("");
        if (response.warnings?.length) {
          setToast({
            message: `Master Sheet loaded with ${response.warnings.length} data warning${response.warnings.length === 1 ? "" : "s"}. Incomplete grades remain blank.`,
            variant: "warning",
            icon: AlertTriangle,
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message = normalizeMasterSheetError(error);
        if (masterSheetRef.current && lastLoadedAssignmentIdRef.current) {
          setToast({ message, variant: "error", icon: AlertTriangle });
          if (
            String(selectedAssignmentId) !== lastLoadedAssignmentIdRef.current
          ) {
            skipNextAssignmentLoadRef.current = true;
            setSelectedAssignmentId(lastLoadedAssignmentIdRef.current);
          }
        } else {
          masterSheetRef.current = null;
          setMasterSheet(null);
          setRequestError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSheet(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAssignmentId, userId]);

  const handleSchoolYearChange = (schoolYearId) => {
    const matchingAssignment = assignments.find(
      (assignment) => String(assignment.schoolYearId) === String(schoolYearId),
    );
    if (matchingAssignment) {
      setIsLoadingSheet(true);
      setSelectedAssignmentId(String(matchingAssignment.adviserAssignmentId));
    }
  };

  const handleAssignmentChange = (assignmentId) => {
    setIsLoadingSheet(true);
    setSelectedAssignmentId(String(assignmentId));
  };

  const handleDownload = async () => {
    if (!selectedAssignmentId || !userId || isDownloading) return;
    setIsDownloading(true);
    try {
      const { blob, filename } = await downloadMasterSheet(
        selectedAssignmentId,
        userId,
      );
      triggerBrowserDownload(blob, filename);
      showToast("Master Sheet downloaded successfully.");
    } catch (error) {
      showToast(normalizeMasterSheetError(error), "error", AlertTriangle);
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return masterSheet?.students || [];
    return (masterSheet?.students || []).filter(
      (student) =>
        student.displayName.toLowerCase().includes(query) ||
        student.lrn.toLowerCase().includes(query),
    );
  }, [masterSheet?.students, searchQuery]);

  const groupedStudents = {
    males: filteredStudents.filter((student) => student.sex === "M"),
    females: filteredStudents.filter((student) => student.sex === "F"),
    unspecified: filteredStudents.filter(
      (student) => student.sex === "UNSPECIFIED",
    ),
  };
  const subjects = masterSheet?.subjects || [];
  const submissionDeadline = formatSubmissionDeadline(masterSheet?.terms);
  const totalColumns = 2 + subjects.length * 4;

  const renderGroupHeader = (label, tone) => (
    <tr className={`ms-sex-header-row ms-sex-header-row--${tone}`}>
      <th scope="rowgroup" className="ms-sex-header-cell">
        {label}
      </th>
      <td
        colSpan={Math.max(totalColumns - 1, 1)}
        className="ms-sex-header-fill"
        aria-hidden="true"
      />
    </tr>
  );

  const renderStudentRows = (students, fallbackLabel) => {
    if (!students.length) {
      return (
        <tr>
          <td colSpan={totalColumns} className="ms-empty-row">
            No {fallbackLabel} learners match the current search.
          </td>
        </tr>
      );
    }

    return students.map((student) => (
      <tr key={student.studentSectionId} className="ms-student-row">
        <td className="ms-name-cell">
          {student.displayName}
          <span className="ms-lrn">LRN: {student.lrn || "Not recorded"}</span>
        </td>
        {subjects.map((subject) => {
          const grades = student.grades[subject.key] || {
            terms: [null, null, null],
            finalGrade: null,
          };
          return (
            <Fragment key={`${student.studentSectionId}-${subject.key}`}>
              {grades.terms.map((grade, index) => (
                <td
                  key={`${subject.key}-term-${index + 1}`}
                  className="ms-grade-cell"
                >
                  {grade ?? "—"}
                </td>
              ))}
              <td className="ms-final-cell">{grades.finalGrade ?? "—"}</td>
            </Fragment>
          );
        })}
        <td className="ms-gen-avg-cell">{student.generalAverage ?? "—"}</td>
      </tr>
    ));
  };

  const isInitialLoading =
    isLoadingOptions || (isLoadingSheet && !masterSheet);
  const isRefreshingSheet = isLoadingSheet && Boolean(masterSheet);

  if (isInitialLoading) {
    return (
      <div className="ms-container" aria-busy="true">
        <MasterSheetSkeleton />
      </div>
    );
  }

  return (
    <div className="ms-container" aria-busy={isRefreshingSheet}>
      <div className="ms-page-header">
        <div>
          <p className="ms-page-eyebrow">Adviser report</p>
          <h1>{masterSheet?.section?.name || "Master Sheet"}</h1>
          <p>
            {masterSheet
              ? `${masterSheet.section.gradeLevel} · SY ${masterSheet.schoolYear.label}`
              : "Review official term grades and download the DepEd-aligned workbook."}
          </p>
        </div>

        {assignments.length > 0 && (
          <div
            className="ms-selectors"
            aria-label="Master Sheet assignment selection"
          >
            <div className="ms-selector-field">
              <span>School year</span>
              <DropdownSelect
                label="School year"
                value={selectedSchoolYearId}
                options={schoolYearOptions}
                onChange={handleSchoolYearChange}
                disabled={isLoadingSheet}
              />
            </div>
            {assignmentsForSelectedYear.length > 1 && (
              <div className="ms-selector-field">
                <span>Advisory class</span>
                <DropdownSelect
                  label="Advisory class"
                  value={selectedAssignmentId}
                  options={sectionOptions}
                  onChange={handleAssignmentChange}
                  disabled={isLoadingSheet}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {requestError && (
        <div className="ms-feedback-card" role="alert">
          <EmptyState
            icon={FileSpreadsheet}
            title="Master Sheet unavailable"
            description={requestError}
            className="ms-empty-state"
          />
          <button
            type="button"
            className="ms-retry-btn"
            onClick={assignments.length ? loadMasterSheet : loadOptions}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {!requestError && assignments.length === 0 && (
        <div className="ms-feedback-card">
          <EmptyState
            icon={FileSpreadsheet}
            title="No advisory assignment found"
            description="A Master Sheet becomes available after you are assigned to a section for a school year."
            className="ms-empty-state"
          />
        </div>
      )}

      {!requestError &&
        masterSheet &&
        masterSheet.students.length === 0 && (
          <div className="ms-feedback-card">
            <EmptyState
              icon={FileSpreadsheet}
              title="No learners in this section"
              description="The section roster is empty for the selected school year."
              className="ms-empty-state"
            />
          </div>
        )}

      {!requestError && masterSheet?.students.length > 0 && (
        <div
          className={`ms-sheet-content ${isRefreshingSheet ? "ms-sheet-content--busy" : ""}`}
        >
          {isRefreshingSheet && (
            <div className="ms-refresh-overlay" role="status" aria-live="polite">
              <LoaderCircle size={20} className="ms-spin" aria-hidden="true" />
              <span>Loading selected Master Sheet…</span>
            </div>
          )}
          <div className="ms-controls-row">
            <div className="ms-summary">
              <span className="ms-summary__metric">
                <strong>{masterSheet.completeness.studentCount}</strong>
                <span>Learners</span>
              </span>
              <span className="ms-summary__metric">
                <strong>{masterSheet.completeness.completedTermGrades}</strong>/
                <strong>{masterSheet.completeness.expectedTermGrades}</strong>
                <span>Term grades complete</span>
              </span>
            </div>
            <div className="ms-control-actions">
              <fieldset
                className="ms-search-fieldset"
                disabled={isRefreshingSheet}
              >
                <SearchBar
                  query={searchQuery}
                  setQuery={setSearchQuery}
                  placeholder="Search student name or LRN..."
                />
              </fieldset>
              <button
                type="button"
                className="ms-download-btn"
                onClick={handleDownload}
                disabled={isDownloading || isRefreshingSheet}
              >
                {isDownloading ? (
                  <LoaderCircle
                    size={17}
                    className="ms-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Download size={17} aria-hidden="true" />
                )}
                <span>{isDownloading ? "Preparing…" : "Download XLSX"}</span>
              </button>
            </div>
          </div>

          <div className="ms-table-wrapper">
            <table className="ms-table">
              <thead>
                <tr className="ms-header-row-1">
                  <th className="ms-name-header-cell" rowSpan={3}>
                    Names of Learners
                  </th>
                  {subjects.map((subject) => (
                    <th
                      key={subject.key}
                      colSpan={4}
                      className="ms-subject-header"
                    >
                      {subject.label}
                    </th>
                  ))}
                  <th rowSpan={3} className="ms-gen-avg-header">
                    General Average
                  </th>
                </tr>
                <tr className="ms-header-row-2">
                  {subjects.map((subject) => (
                    <Fragment key={subject.key}>
                      <th colSpan={3} className="ms-term-group-header">
                        Term
                      </th>
                      <th rowSpan={2} className="ms-fg-header-cell">
                        Final Grade
                      </th>
                    </Fragment>
                  ))}
                </tr>
                <tr className="ms-header-row-3">
                  {subjects.map((subject) => (
                    <Fragment key={subject.key}>
                      <th className="ms-term-cell">1</th>
                      <th className="ms-term-cell">2</th>
                      <th className="ms-term-cell">3</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {renderGroupHeader("Male", "male")}
                {renderStudentRows(groupedStudents.males, "male")}
                {renderGroupHeader("Female", "female")}
                {renderStudentRows(groupedStudents.females, "female")}
                {groupedStudents.unspecified.length > 0 && (
                  <>
                    {renderGroupHeader("Unspecified", "unspecified")}
                    {renderStudentRows(
                      groupedStudents.unspecified,
                      "unspecified",
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <footer className="ms-submission-footer">
            <div className="ms-submission-footer__copy">
              <span className="ms-submission-footer__icon" aria-hidden="true">
                <FileSpreadsheet size={19} />
              </span>
              <div>
                <strong>Deadline: {submissionDeadline}</strong>
              </div>
            </div>
            <button
              type="button"
              className="ms-submit-btn"
              disabled
              title="Master Sheet submission is not available yet"
            >
              <Send size={16} aria-hidden="true" />
              Submit
            </button>
          </footer>
        </div>
      )}

      <Toast
        message={toast.message}
        variant={toast.variant}
        icon={toast.icon || undefined}
        onDismiss={() => setToast(emptyToast)}
      />
    </div>
  );
}
