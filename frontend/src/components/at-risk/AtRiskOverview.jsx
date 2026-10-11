import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import DropdownSelect from "../common/DropdownSelect";
import AnalyticsStatCard from "../../pages/principal/analytics/AnalyticsStatCard";
import PredictionInfoButton from "./PredictionInfoButton";
import {
  RISK_BANDS,
  TERM_OPTIONS,
  learnerListPath,
} from "../../utils/riskPresentation";
import "../../styles/principalAnalytics.css";

export function AtRiskFilters({ preview, children }) {
  const disabled = preview.loading || !preview.options;
  const predictionTerms = TERM_OPTIONS.map(option => ({
    value: option.id,
    label: `Predicting Term ${option.id.slice(1)}`,
  }));
  const sourceTerm = preview.term === "T3" ? "Term 2" : "Term 1";
  return (
    <div className="ar-filter-toolbar ar-review-navigation" aria-label="Prediction navigation">
      <div className="ar-filter-info"><PredictionInfoButton /></div>
      <div className="ar-filter-row">
      <div className="ar-review-period-controls">
        <div className="ar-review-nav-field">
          <span>Subject</span>
          <DropdownSelect label="Subject" value="english"
            options={[{ value: "english", label: "English" }]}
            onChange={() => {}} disabled={disabled}
            title="English is the only supported prediction subject." />
        </div>
        <div className="ar-review-nav-field ar-review-target-field">
          <span>Prediction period</span>
          <DropdownSelect label="Prediction period" value={preview.term}
            options={predictionTerms} onChange={preview.setTerm} disabled={disabled} />
        </div>
      </div>
      <div className="ar-filter-group">
        {children ?? <div className="ar-review-nav-field">
          <span>Grade level</span>
          <DropdownSelect
            label="Grade Level"
            value={preview.gradeLevel}
            options={preview.options?.gradeLevels || []}
            placeholder="All Grade Levels"
            onChange={preview.setGradeLevel}
            disabled={disabled}
          />
        </div>}
        <div className="ar-review-nav-field">
          <span>School year</span>
          <DropdownSelect
            label="School Year"
            value={preview.schoolYear}
            options={preview.options?.schoolYears || []}
            placeholder="School Year"
            onChange={preview.setSchoolYear}
            disabled={disabled}
          />
        </div>
      </div>
      </div>
      <p className="ar-review-source-period" aria-live="polite">Based on {sourceTerm} records · English only</p>
    </div>
  );
}

export function AtRiskStats({ data, loading }) {
  return (
    <div className="ar-stats-row" aria-busy={loading}>
      {RISK_BANDS.map((band) => (
        <AnalyticsStatCard
          key={band.level}
          label={band.label}
          value={loading ? "—" : (data?.summary[band.key] ?? "—")}
          description={band.caption}
          tone={band.tone}
          icon={band.icon}
        />
      ))}
      <AnalyticsStatCard
        label="Learners with predictions"
        value={loading ? "—" : (data?.summary.total ?? "—")}
        description={
          data
            ? `Of ${data.summary.totalEnglish} English learners`
            : "English only"
        }
        icon={Users}
      />
    </div>
  );
}

export function AtRiskAvailability({ data, origin, filterQuery }) {
  if (!data?.summary.unavailable) return null;
  return (
    <div className="ar-record-availability">
      <span>
        {data.summary.unavailable} learners awaiting complete records · Not
        assigned a prediction
      </span>
      <Link to={learnerListPath(origin, "unavailable", filterQuery)}>
        View records needed
      </Link>
    </div>
  );
}
