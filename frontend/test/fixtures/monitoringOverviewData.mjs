import { createRequire } from 'node:module';
const { TIERS, DISCLAIMER, tierForOccurrences } = createRequire(import.meta.url)('../../../backend/services/AttendanceInterventionPolicy.js');

export const riskSummary = (term = 'ALL') => ({ version: 'department-academic-risk-v2', context: { term },
  terms: [1, 2, 3].map(value => ({ value: `T${value}`, label: `Term ${value}` })),
  summary: { high: term === 'ALL' ? 8 : term === 'T1' ? 4 : 2, moderate: term === 'ALL' ? 9 : 3, low: term === 'ALL' ? 18 : 6, total: term === 'ALL' ? 35 : term === 'T1' ? 13 : 11, unavailable: 1, totalLearners: term === 'ALL' ? 36 : term === 'T1' ? 14 : 12 },
  byGrade: [{ grade: 8, high: term === 'ALL' ? 8 : term === 'T1' ? 4 : 2, moderate: term === 'ALL' ? 9 : 3, low: term === 'ALL' ? 18 : 6 }],
});

export const attendanceOptions = { version: 'attendance-monitoring-v5', defaultSchoolYear: '3',
  schoolYears: [{ value: '3', label: 'SY 2026–2027' }, { value: '2', label: 'SY 2025–2026' }] };
export function attendanceOverview(year = '3') {
  return { version: 'attendance-monitoring-v5', context: { schoolYear: year === '3' ? 'SY 2026–2027' : 'SY 2025–2026',
    schoolYearId: Number(year), asOf: '2026-11-13', hasStarted: true },
    policy: { tiers: TIERS, disclaimer: DISCLAIMER, occurrenceBasis: 'absent' },
    students: Array.from({ length: year === '3' ? 22 : 1 }, (_, i) => {
      const absent = i === 0 || i === 4 ? 5 : i === 1 ? 3 : i === 5 ? 41 : i === 6 ? 4 : i === 7 ? 6 : i === 8 ? 8 : 0;
      const late = i === 2 ? 3 : 0;
      const interventionTier = tierForOccurrences(absent);
      return {
        id: String(i + 500), name: year === '3' ? `Fixture Learner ${String(i + 1).padStart(2, '0')}` : 'Previous Year Learner',
        studentId: i + 1, grade: i % 2 ? 9 : 8, sectionId: i % 2 ? 8 : 7, section: i % 2 ? 'Fixture B' : 'Fixture A', adviser: 'Fixture Adviser',
        absent, late, present: 115 - absent - late, occurrences: absent, interventionTier,
        longestStreak: i === 0 || i === 4 ? 5 : i === 1 ? 3 : absent ? 1 : 0,
        level: interventionTier ? `tier${interventionTier}` : 'none',
        monthly: [20, 23, 21, 22, 22, 7].map((days, index) => {
          const month = `2026-${String(index + 6).padStart(2, '0')}`;
          const monthlyAbsent = i === 4 ? [2, 3, 0, 0, 0, 0][index] : i === 5 ? [10, 10, 10, 10, 1, 0][index] : index === 0 ? absent : 0;
          const monthlyLate = index === 0 ? late : 0;
          const absenceDates = i === 4 ? (index === 0 ? ['2026-06-29', '2026-06-30'] : index === 1 ? ['2026-07-01', '2026-07-02', '2026-07-03'] : [])
            : Array.from({ length: monthlyAbsent }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`);
          const lateDates = Array.from({ length: monthlyLate }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`);
          return { month, absent: monthlyAbsent, late: monthlyLate, present: days - monthlyAbsent - monthlyLate, occurrences: monthlyAbsent, absenceDates, lateDates };
        }),
      };
    }),
  };
}
