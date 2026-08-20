import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RotateCcw,
} from "lucide-react";
import Badge from "../../../../components/common/Badge";
import ProgressBar from "../../../../components/common/ProgressBar";

function DepartmentRow({ department }) {
  return (
    <div className="submission-status__department-row">
      <div>
        <strong>{department.name}</strong>
        {department.overdue > 0 && (
          <span>
            <AlertTriangle size={12} aria-hidden="true" />
            {department.overdue} overdue
          </span>
        )}
      </div>
      <strong>
        {department.submitted} / {department.total}
      </strong>
      <div className="submission-status__department-progress">
        <ProgressBar
          className="grade-lock-progress"
          value={department.progress}
          ariaLabel={`${department.name} submission progress`}
        />
        <strong>{department.progress}%</strong>
      </div>
    </div>
  );
}

export default function SubmissionStatus({ term, departments }) {
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
  const approvedCount =
    (readiness.approved || 0) + (readiness.finalized || 0);

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

        <dl className="submission-status__workflow-summary">
          <div>
            <dt>
              <Clock3 size={15} aria-hidden="true" />
              Adviser review
            </dt>
            <dd>{readiness.awaitingReview || 0}</dd>
          </div>
          <div>
            <dt>
              <RotateCcw size={15} aria-hidden="true" />
              Returned
            </dt>
            <dd>{readiness.returned || 0}</dd>
          </div>
          <div>
            <dt>
              <CheckCircle2 size={15} aria-hidden="true" />
              Approved / finalized
            </dt>
            <dd>{approvedCount}</dd>
          </div>
        </dl>
      </div>

      <div className="submission-status__labels" aria-hidden="true">
        <span>Department / Subject</span>
        <span>Submitted</span>
        <span>Progress</span>
      </div>

      <div className="submission-status__departments">
        {departments.length > 0 ? (
          departments.map((department) => (
            <DepartmentRow key={department.id} department={department} />
          ))
        ) : (
          <p className="submission-status__empty">
            No subject offerings have been prepared for this grading period.
          </p>
        )}
      </div>
    </section>
  );
}
