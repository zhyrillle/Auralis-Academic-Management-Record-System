export function filterRiskPreview(data, gradeLevel) {
  if (!data || gradeLevel === 'all') return data;
  const students = data.students.filter(row => String(row.grade) === String(gradeLevel));
  const unavailable = data.unavailable.filter(row => String(row.grade) === String(gradeLevel));
  const counts = Object.fromEntries(['low', 'medium', 'high'].map(level => [
    level, students.filter(row => row.riskLevel === level).length,
  ]));
  return { ...data, students, unavailable,
    summary: { ...data.summary, lowRisk: counts.low, mediumRisk: counts.medium, highRisk: counts.high,
      total: students.length, eligible: students.length, unavailable: unavailable.length,
      totalEnglish: students.length + unavailable.length },
    distribution: { ...Object.fromEntries(Object.entries(counts).map(([level, count]) => [
      level, { count, percent: students.length ? Math.round(count / students.length * 100) : 0 },
    ])), totalFlagged: students.length },
    gradeBreakdown: data.gradeBreakdown.filter(row => String(row.grade).match(/\d+/)?.[0] === String(gradeLevel)),
  };
}
