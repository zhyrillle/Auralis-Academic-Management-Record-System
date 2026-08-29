const TRANSMUTATION_THRESHOLDS = [
  [100, 100], [98.4, 99], [96.8, 98], [95.2, 97], [93.6, 96],
  [92, 95], [90.4, 94], [88.8, 93], [87.2, 92], [85.6, 91],
  [84, 90], [82.4, 89], [80.8, 88], [79.2, 87], [77.6, 86],
  [76, 85], [74.4, 84], [72.8, 83], [71.2, 82], [69.6, 81],
  [68, 80], [66.4, 79], [64.8, 78], [63.2, 77], [61.6, 76],
  [60, 75], [56, 74], [52, 73], [48, 72], [44, 71], [40, 70],
  [36, 69], [32, 68], [28, 67], [24, 66], [20, 65], [16, 64],
  [12, 63], [8, 62], [4, 61], [0, 60],
];

const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const transmuteInitialGrade = (initialGrade) => {
  const numericGrade = asNumber(initialGrade);
  if (numericGrade === null || numericGrade < 0 || numericGrade > 100) return null;

  const threshold = TRANSMUTATION_THRESHOLDS.find(([minimum]) => numericGrade >= minimum);
  return threshold ? threshold[1] : null;
};

const incompleteResult = (reason) => ({
  complete: false,
  initialGrade: null,
  termGrade: null,
  components: [],
  reason,
});

const computeTermGrade = ({ weights = [], activities = [], studentSectionId }) => {
  if (!studentSectionId) return incompleteResult("STUDENT_SECTION_MISSING");
  if (!weights.length) return incompleteResult("WEIGHTS_MISSING");

  const weightByComponent = new Map();
  for (const weight of weights) {
    const componentTypeId = Number(weight.component_type_id);
    const percentage = asNumber(weight.percentage);
    if (!componentTypeId || percentage === null || percentage <= 0) {
      return incompleteResult("INVALID_WEIGHTS");
    }
    if (weightByComponent.has(componentTypeId)) {
      return incompleteResult("DUPLICATE_WEIGHTS");
    }
    weightByComponent.set(componentTypeId, percentage);
  }

  const totalWeight = [...weightByComponent.values()].reduce((sum, value) => sum + value, 0);
  if (Math.abs(totalWeight - 100) > 0.01) return incompleteResult("INVALID_WEIGHT_TOTAL");

  const activeActivities = activities.filter(
    (activity) => String(activity.status || "ACTIVE").toUpperCase() === "ACTIVE",
  );
  const activitiesByComponent = new Map();
  for (const activity of activeActivities) {
    const componentTypeId = Number(activity.component_type_id);
    if (!weightByComponent.has(componentTypeId)) continue;
    if (!activitiesByComponent.has(componentTypeId)) activitiesByComponent.set(componentTypeId, []);
    activitiesByComponent.get(componentTypeId).push(activity);
  }

  const componentResults = [];
  let initialGrade = 0;

  for (const [componentTypeId, weight] of weightByComponent.entries()) {
    const componentActivities = activitiesByComponent.get(componentTypeId) || [];
    if (!componentActivities.length) return incompleteResult("COMPONENT_ACTIVITY_MISSING");

    let earned = 0;
    let possible = 0;

    for (const activity of componentActivities) {
      const highestPossibleScore = asNumber(activity.highest_possible_score);
      if (highestPossibleScore === null || highestPossibleScore <= 0) {
        return incompleteResult("INVALID_HIGHEST_SCORE");
      }

      const studentScores = (activity.scores || []).filter(
        (score) => Number(score.student_section_id) === Number(studentSectionId),
      );
      if (studentScores.length !== 1) {
        return incompleteResult(studentScores.length > 1 ? "DUPLICATE_SCORES" : "SCORE_MISSING");
      }

      const score = studentScores[0];
      const status = String(score.score_status || "NOT_ENCODED").toUpperCase();
      if (status === "EXCUSED") continue;
      if (status === "NOT_ENCODED") return incompleteResult("SCORE_NOT_ENCODED");

      const rawScore = status === "MISSING" ? 0 : asNumber(score.raw_score);
      if (rawScore === null || rawScore < 0 || rawScore > highestPossibleScore) {
        return incompleteResult("INVALID_RAW_SCORE");
      }

      earned += rawScore;
      possible += highestPossibleScore;
    }

    if (possible <= 0) return incompleteResult("COMPONENT_FULLY_EXCUSED");

    const percentageScore = (earned / possible) * 100;
    const weightedScore = percentageScore * (weight / 100);
    componentResults.push({
      componentTypeId,
      earned,
      possible,
      percentageScore,
      weight,
      weightedScore,
    });
    initialGrade += weightedScore;
  }

  const termGrade = transmuteInitialGrade(initialGrade);
  if (termGrade === null) return incompleteResult("TRANSMUTATION_FAILED");

  return {
    complete: true,
    initialGrade: Number(initialGrade.toFixed(2)),
    termGrade,
    components: componentResults,
    reason: null,
  };
};

module.exports = {
  TRANSMUTATION_THRESHOLDS,
  transmuteInitialGrade,
  computeTermGrade,
};
