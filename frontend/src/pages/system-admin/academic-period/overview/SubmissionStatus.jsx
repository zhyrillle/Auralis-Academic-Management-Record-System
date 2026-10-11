import { useRef, useState } from "react";
import { FilePenLine, LockKeyhole, Send } from "lucide-react";
import Badge from "../../../../components/common/Badge";
import ProgressBar from "../../../../components/common/ProgressBar";
import DropdownSelect from "../../../../components/common/DropdownSelect";

function SubjectRow({ subject, onSelect }) {
  return (
    <button
      type="button"
      className="submission-status__department-row"
      aria-label={`View ${subject.name} grade sheets`}
      aria-controls="grade-sheet-records"
      onClick={() => onSelect(subject)}
    >
      <div>
        <strong>{subject.name}</strong>
      </div>
      <strong>
        {subject.submitted} / {subject.total}
      </strong>
      <div className="submission-status__department-progress">
        {subject.total > 0 ? <ProgressBar
          className="grade-lock-progress"
          value={subject.progress}
          ariaLabel={`${subject.name} submission progress`}
        /> : <span className="submission-status__no-sheets">No sheets</span>}
        {subject.total > 0 && <strong>{subject.progress}%</strong>}
      </div>
    </button>
  );
}

function SubmissionRecordRow({ record }) {
  const workflowLabel =
    record.workflowStatus === "draft"
      ? "Draft"
      : record.workflowStatus === "submitted"
        ? "Submitted"
        : "Unknown status";
  const lockLabel =
    record.lockStatus === "term_locked"
      ? "Term locked"
      : record.lockStatus === "temporarily_reopened"
        ? "Temporary access"
        : ["editable", "open"].includes(record.lockStatus)
          ? "Not term locked"
          : "Lock status unavailable";

  return (
    <div className="submission-records__row">
      <div>
        <strong>{record.teacherName}</strong>
        <span>{record.department}</span>
      </div>
      <div>
        <strong>{record.subject}</strong>
        <span>
          {record.gradeLevel} {record.section}
        </span>
        <span>Sheet #{record.gradeSheetId}</span>
      </div>
      {record.workflowStatus === "draft" ? (
        <span className="submission-records__timestamp">
          Not currently submitted
        </span>
      ) : (
        <time>{record.submittedAt}</time>
      )}
      <div className="submission-records__state">
        <span
          className={`submission-records__status ${record.workflowStatus === "submitted" ? "is-submitted" : "is-draft"}`}
        >
          {workflowLabel}
        </span>
        <span className="submission-records__lock" title={lockLabel} aria-label={lockLabel}>
          {record.lockStatus === "term_locked" && (
            <LockKeyhole size={12} aria-hidden="true" />
          )}
          {record.lockStatus !== "term_locked" && lockLabel}
        </span>
      </div>
    </div>
  );
}

export default function SubmissionStatus({ term, departments, subjects = [], records = [] }) {
  const [recordFilter, setRecordFilter] = useState("submitted");
  const [departmentFilter, setDepartmentFilter] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState(null);
  const [lockedOnly, setLockedOnly] = useState(false);
  const recordsHeadingRef = useRef(null);
  const recordsSectionRef = useRef(null);
  const departmentOptions = [
    { value: "", label: "All departments" },
    ...Array.from(new Set([
      ...departments.map((department) => department.name),
      ...subjects.map((subject) => subject.department),
      ...records.map((record) => record.department),
    ].filter(Boolean))).sort((first, second) => first.localeCompare(second))
      .map((name) => ({ value: name, label: name })),
  ];
  const filteredRecords = records.filter(
    (record) =>
      (recordFilter === "all" || record.workflowStatus === recordFilter) &&
      (!departmentFilter || record.department === departmentFilter) &&
      (!subjectFilter || record.subjectId === subjectFilter.id) &&
      (!lockedOnly || record.lockStatus === "term_locked"),
  );
  const focusRecords = () => {
    window.requestAnimationFrame(() => {
      recordsSectionRef.current?.scrollIntoView({
        block: "start",
        behavior: "auto",
      });
      recordsHeadingRef.current?.focus({ preventScroll: true });
    });
  };
  const selectSummary = (filter) => {
    setRecordFilter(filter === "locked" ? "all" : filter);
    setDepartmentFilter(null);
    setSubjectFilter(null);
    setLockedOnly(filter === "locked");
    focusRecords();
  };
  const selectSubject = (subject) => {
    setSubjectFilter(subject);
    setDepartmentFilter(subject.department);
    setRecordFilter("all");
    setLockedOnly(false);
    focusRecords();
  };
  const totals = departments.reduce(
    (summary, department) => ({
      submitted: summary.submitted + department.submitted,
      expected: summary.expected + department.total,
    }),
    { submitted: 0, expected: 0 },
  );
  const completion = totals.expected
    ? Math.round((totals.submitted / totals.expected) * 100)
    : 0;
  const readiness = term.readiness || {};

  return (
    <section
      className="grade-lock-panel submission-status"
      aria-labelledby="submission-status-title"
    >
      <div className="submission-status__heading">
        <div>
          <h2 id="submission-status-title">Submission Status</h2>
          <p>{term.label} grading-sheet progress</p>
        </div>
        <Badge variant={term.status}>
          {term.label} &bull; {term.statusLabel}
        </Badge>
      </div>

      <div className="submission-status__summary">
        <div className="submission-status__completion">
          <span>Submitted</span>
          <strong>
            {totals.submitted} / {totals.expected}
          </strong>
          <ProgressBar
            className="grade-lock-progress"
            value={completion}
            ariaLabel={`${term.label} overall submission progress`}
          />
          <small>{completion}% complete</small>
        </div>

        <div className="submission-status__workflow-summary" role="group" aria-label="Grade sheet summaries">
          <button
            type="button"
            aria-label={`View ${readiness.draft || 0} draft grade sheets`}
            aria-controls="grade-sheet-records"
            onClick={() => selectSummary("draft")}
          >
            <span className="submission-status__summary-label">
              <FilePenLine size={15} aria-hidden="true" />
              Draft
            </span>
            <strong>{readiness.draft || 0}</strong>
          </button>
          <button
            type="button"
            aria-label={`View ${readiness.submitted || 0} submitted grade sheets`}
            aria-controls="grade-sheet-records"
            onClick={() => selectSummary("submitted")}
          >
            <span className="submission-status__summary-label">
              <Send size={15} aria-hidden="true" />
              Submitted
            </span>
            <strong>{readiness.submitted || 0}</strong>
          </button>
          <button
            type="button"
            aria-label={`View ${readiness.locked || 0} term-locked grade sheets`}
            aria-controls="grade-sheet-records"
            onClick={() => selectSummary("locked")}
          >
            <span className="submission-status__summary-label">
              <LockKeyhole size={15} aria-hidden="true" />
              Term locked
            </span>
            <strong>{readiness.locked || 0}</strong>
          </button>
        </div>
      </div>

      <div className="submission-status__details">
        <section aria-label="Subject submission progress">
          <div className="submission-status__labels" aria-hidden="true">
            <span>Subject</span>
            <span>Submitted</span>
            <span>Progress</span>
          </div>

          <div className="submission-status__departments">
            {subjects.length > 0 ? (
              subjects.map((subject) => (
                <SubjectRow key={subject.id} subject={subject} onSelect={selectSubject} />
              ))
            ) : (
              <p className="submission-status__empty">
                No available subjects were found for this academic period.
              </p>
            )}
          </div>
        </section>

        <section
          id="grade-sheet-records"
          ref={recordsSectionRef}
          aria-labelledby="submission-records-title"
        >
          <div className="submission-status__section-heading">
            <h3
              id="submission-records-title"
              tabIndex={-1}
              ref={recordsHeadingRef}
            >
              {recordFilter === "draft"
                ? "Draft grade sheets"
                : recordFilter === "submitted"
                  ? "Submitted grade sheets"
                  : lockedOnly ? "Term-locked grade sheets" : "All grade sheets"}
              {lockedOnly && recordFilter !== "all" && " · Term locked"}
              {subjectFilter ? ` · ${subjectFilter.name}` : departmentFilter && ` · ${departmentFilter}`}
            </h3>
            <span aria-label="Displayed grade sheet count">
              {filteredRecords.length}
            </span>
          </div>
          <div className="submission-records__filters">
            <div className="submission-records__workflow-filters" role="group" aria-label="Filter grade sheets">
            {[
              { value: "all", label: "All" },
              { value: "draft", label: "Draft" },
              { value: "submitted", label: "Submitted" },
            ].map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={recordFilter === filter.value}
                aria-controls="grade-sheet-records-list"
                onClick={() => setRecordFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
            </div>
            {subjectFilter && (
              <button type="button" className="submission-records__clear-scope" onClick={() => setSubjectFilter(null)}>
                All subjects
              </button>
            )}
            {lockedOnly && (
              <button
                type="button"
                className="submission-records__clear-scope"
                onClick={() => {
                  setLockedOnly(false);
                }}
              >
                All lock states
              </button>
            )}
            <div className="submission-records__department-filter">
            <label htmlFor="grade-sheet-department">Department</label>
            <DropdownSelect
              id="grade-sheet-department"
              label="Department"
              value={departmentFilter || ""}
              options={departmentOptions}
              onChange={(department) => {
                setDepartmentFilter(department || null);
                setSubjectFilter(null);
              }}
            />
            </div>
          </div>
          <div id="grade-sheet-records-list">
            {filteredRecords.length > 0 ? (
              <>
                <div className="submission-records__labels" aria-hidden="true">
                  <span>Teacher</span>
                  <span>Subject / Class</span>
                  <span>Submitted at</span>
                  <span>Workflow / Lock</span>
                </div>
                <div className="submission-records__list">
                  {filteredRecords.map((record) => (
                    <SubmissionRecordRow key={record.id} record={record} />
                  ))}
                </div>
              </>
            ) : (
              <p className="submission-status__empty">
                No {recordFilter === "all" ? "" : `${recordFilter} `}grade
                sheets were found for this term{subjectFilter ? ` for ${subjectFilter.name}` : departmentFilter ? ` in ${departmentFilter}` : ""}{lockedOnly ? " with a term lock" : ""}.
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
