import AcademicTimeline from "./AcademicTimeline";
import UpcomingSchoolYear from "./UpcomingSchoolYear";
import "../../../../styles/GradingPeriodSettings.css";

export default function GradingPeriodSettings({
  schoolYearLabel,
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
  inheritedUpcomingPeriods,
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
        periods={periods}
        selectedPeriod={selectedPeriod}
        draft={periodDraft}
        validationMessage={validationMessage}
        onSelectPeriod={onSelectPeriod}
        onDraftChange={onPeriodDraftChange}
        onSave={onSavePeriod}
        onCancel={onCancelPeriodEdit}
      />

      <UpcomingSchoolYear
        schoolYear={upcomingSchoolYear}
        periods={upcomingPeriods}
        inheritedPeriods={inheritedUpcomingPeriods}
        onSave={onSaveUpcomingPeriods}
      />
    </div>
  );
}
