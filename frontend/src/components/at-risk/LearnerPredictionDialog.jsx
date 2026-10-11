import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { RISK_BANDS, learnerReportPath, predictionRecordGroups } from '../../utils/riskPresentation';

export default function LearnerPredictionDialog({ student, onClose }) {
  const dialog = useRef(null);
  const location = useLocation();
  useEffect(() => {
    const node = dialog.current;
    if (student && !node.open) node.showModal();
    if (!student && node.open) node.close();
  }, [student]);
  const band = RISK_BANDS.find(item => item.level === student?.riskLevel);
  const reportPath = student && learnerReportPath(student);
  return <dialog ref={dialog} className="ar-prediction-info-dialog ar-learner-detail-dialog ar-record-review-dialog"
    aria-labelledby="learner-prediction-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
    {student && <div className="ar-prediction-info-content">
      <header><div><h2 id="learner-prediction-title">{student.name}</h2>
        <p>Grade {student.grade} · Section {student.section} · Adviser: {student.adviser}</p></div>
        <button type="button" aria-label="Close learner review" onClick={() => dialog.current.close()}><X size={20} /></button>
      </header>
      <div className="ar-review-summary"><span className={`ar-risk-label ar-review-risk-${band?.level || 'unavailable'}`}>{band?.label || 'Unavailable'}</span>
        <span>English · {student.sourceTerm?.replace('T', 'Term ')} records → {student.targetTerm?.replace('T', 'Term ')} prediction · SY {student.schoolYear}</span>
      </div>
      <section aria-label="Source records"><h3>{student.sourceTerm?.replace('T', 'Term ') || 'Previous term'} source records</h3>
        <p className="ar-records-caption">Missing values are marked “Not available”.</p>
        <div className="ar-record-groups">{predictionRecordGroups(student).map(group => (
          <div className="ar-record-group" key={group.key}>
            <h4>{group.label}</h4>
            <div className="ar-record-group-values"><dl>{group.metrics.map(metric => <div key={metric.label}>
              <dt>{metric.label}</dt><dd>{metric.value}</dd>
            </div>)}</dl>{group.note && <p>{group.note}</p>}</div>
          </div>
        ))}</div>
      </section>
      <p className="ar-record-review-caution">These records help you review the label; they are not a feature-by-feature explanation of the model’s decision. Predictions are advisory, not official grades.</p>
      <div className="ar-review-footer">
        {reportPath ? <Link className="ar-review-report-link" to={reportPath} state={{ returnTo: location.pathname + location.search }}>
          <ExternalLink size={15} aria-hidden="true" />Open learner report
        </Link> : <span className="ar-review-report-unavailable">Report link unavailable. Refresh the prediction after the backend update.</span>}
        <button type="button" className="ar-prediction-info-done" onClick={() => dialog.current.close()}>Done</button>
      </div>
    </div>}
  </dialog>;
}
