import { useState } from "react";
import AcademicTimeline from "./AcademicTimeline";
import UpcomingSchoolYear from "./UpcomingSchoolYear";
import "../../../../styles/GradingPeriodSettings.css";

export default function GradingPeriodSettings({
  userId,
  schoolYearId,
  schoolYearLabel,
  isReadOnly = false,
  periods,
  initialSelectedPeriodId,
  upcomingSchoolYear,
  upcomingPeriods,
  suggestedUpcomingPeriods,
  onRefresh,
  onToast,
}) {
  const [selectedPeriodId, setSelectedPeriodId] = useState(
    initialSelectedPeriodId,
  );
  const timelineVersion = periods
    .map(
      (period) =>
        `${period.id}:${period.status}:${period.startDate}:${period.endDate}:${period.deadlineDate}:${period.deadlineTime}`,
    )
    .join("|");

  return (
    <div className="grade-lock-view grade-lock-view--settings">
      <div className="grade-lock-settings-intro">
        <div className="grade-lock-settings-intro__scope">
          <span>School year scope</span>
          <strong>{schoolYearLabel}</strong>
        </div>
        <p>
          Timeline changes apply to grading sheets within this school year.
          Completed periods remain preserved.
        </p>
      </div>

      <AcademicTimeline
        key={timelineVersion}
        userId={userId}
        schoolYearId={schoolYearId}
        isReadOnly={isReadOnly}
        periods={periods}
        initialSelectedPeriodId={selectedPeriodId}
        onSelectedPeriodChange={setSelectedPeriodId}
        onRefresh={onRefresh}
        onToast={onToast}
      />

      {upcomingSchoolYear && (
        <UpcomingSchoolYear
          userId={userId}
          activeSchoolYearId={schoolYearId}
          schoolYear={upcomingSchoolYear}
          periods={upcomingPeriods}
          suggestedPeriods={suggestedUpcomingPeriods}
          onRefresh={onRefresh}
          onToast={onToast}
        />
      )}
    </div>
  );
}
