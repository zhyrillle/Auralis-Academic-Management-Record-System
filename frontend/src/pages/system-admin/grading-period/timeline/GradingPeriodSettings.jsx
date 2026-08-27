import AcademicTimeline from "./AcademicTimeline";
import UpcomingSchoolYear from "./UpcomingSchoolYear";
import "../../../../styles/GradingPeriodSettings.css";

export default function GradingPeriodSettings({
  schoolYearLabel,
  isReadOnly = false,
  periods,
  selectedPeriod,
  periodDraft,
  validationMessage,
  onSelectPeriod,
  onPeriodDraftChange,
  onSavePeriod,
  onCancelPeriodEdit,
  upcomingSchoolYear,
  upcomingPeriods,
  suggestedUpcomingPeriods,
  onSaveUpcomingPeriods,
}) {
  return (
    <div className="grade-lock-view grade-lock-view--settings">
      <div className="grade-lock-settings-intro">
        <div>
          <span>School year scope</span>
          <strong>{schoolYearLabel}</strong>
        </div>
        <p>
          Timeline changes apply to grading sheets within this school year.
          Completed periods remain preserved.
        </p>
      </div>

      <AcademicTimeline
        isReadOnly={isReadOnly}
        periods={periods}
        selectedPeriod={selectedPeriod}
        draft={periodDraft}
        validationMessage={validationMessage}
        onSelectPeriod={onSelectPeriod}
        onDraftChange={onPeriodDraftChange}
        onSave={onSavePeriod}
        onCancel={onCancelPeriodEdit}
      />

      {upcomingSchoolYear && (
        <UpcomingSchoolYear
          schoolYear={upcomingSchoolYear}
          periods={upcomingPeriods}
          suggestedPeriods={suggestedUpcomingPeriods}
          onSave={onSaveUpcomingPeriods}
        />
      )}
    </div>
  );
}
