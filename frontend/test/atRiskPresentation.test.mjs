// Synthetic cached records only; no model worker, database or report writes.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createServer } from 'vite';

globalThis.localStorage = { getItem: () => null };
globalThis.window = { location: { origin: 'http://localhost' }, addEventListener: () => {}, console };
globalThis.document = { addEventListener: () => {}, visibilityState: 'visible' };
globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
const server = await createServer({ cacheDir: mkdtempSync(path.join(os.tmpdir(), 'auralis-risk-render-')),
  plugins: [{ name: 'stub-browser-only-report', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/pages/adviser/StudentSF9Page.jsx')) {
      return 'import React from "react"; export default function Report({student}) { return React.createElement("div", null, "Official report for "+student.name); }';
    }
  } }], server: { middlewareMode: true, ws: false }, appType: 'custom' });
try {
  const { loadCached, cacheKey } = await server.ssrLoadModule('/src/services/navigationCache.js');
  const { RISK_INPUT_POLICY, RISK_PREVIEW_CACHE, SECTION_DETAILS_CACHE } = await server.ssrLoadModule('/src/services/riskInputPolicy.js');
  const options = { schoolYears: [{ value: '2026-2027', label: 'SY 2026–2027' }], gradeLevels: [{ value: 'all', label: 'All Grade Levels' }, { value: '7', label: 'Grade 7' }, { value: '8', label: 'Grade 8' }] };
  const features = { previous_final_grade: 84, ww_pct: 80, pt_pct: 82, qa_pct: 75,
    phil_iri_literal_pct: 50, phil_iri_inferential_pct: 75, phil_iri_critical_pct: 0, phil_iri_unavailable: 0, absence_rate: 0.1 };
  const students = ['high', 'medium', 'low', 'low'].map((riskLevel, index) => ({
    id: String(index + 1), studentId: index + 1, studentSectionId: 501 + index, schoolYearId: 3,
    name: `Sample Learner ${index + 1}`, grade: 8, section: 'Demo', adviser: 'Demo Adviser',
    riskLevel, riskScore: 92.5 - index * 20, score: 0.925 - index * 0.2,
    sourceTerm: 'T1', targetTerm: 'T2', schoolYear: '2026-2027', modelInputs: features,
    screeningStatus: 'available', screeningAssessmentDate: '2026-06-15', attendanceStatus: 'available',
    attendanceSummary: { absentDays: 2, classDays: 20 }, flags: [],
  }));
  const payload = { summary: { lowRisk: 2, mediumRisk: 1, highRisk: 1, total: 4, unavailable: 2, totalEnglish: 6 },
    students, unavailable: [{ id: '5', grade: 8, name: 'Awaiting Learner', section: 'Demo', reason: 'English records incomplete.' },
      { id: '6', grade: 7, name: 'Incomplete Sources Learner', section: 'Demo', status: 'insufficient_data',
        missingSources: ['attendance', 'phil_iri'], reason: 'Attendance needed: 3 weekdays missing. PHIL-IRI needed: No screening recorded.' }],
    distribution: { low: { count: 2 }, medium: { count: 1 }, high: { count: 1 }, totalFlagged: 4 },
    gradeBreakdown: [{ grade: 'Grade 8', low: 2, medium: 1, high: 1 }] };
  await loadCached(cacheKey('risk:options'), async () => options);
  await loadCached(cacheKey('risk:preview:v3', { schoolYear: '2026-2027', term: 'T2' }), async () => ({ ...payload,
    students: [{ ...students[0], name: 'Stale Imputed Learner' }] }));
  await loadCached(cacheKey(RISK_PREVIEW_CACHE, { schoolYear: '2026-2027', term: 'T2' }), async () => payload);
  const render = (Page, url, route = '*') => renderToString(React.createElement(MemoryRouter, { initialEntries: [url] },
    React.createElement(Routes, null, React.createElement(Route, { path: route, element: React.createElement(Page) })))).replace(/<!-- -->/g, '');
  const base = '/principal/at-risk-students/prediction?schoolYear=2026-2027&term=T2&gradeLevel=all';
  const { default: Prediction } = await server.ssrLoadModule('/src/pages/principal/AtRiskPrediction.jsx');
  const prediction = render(Prediction, base);
  assert.equal((prediction.match(/class="ar-student-card"/g) || []).length, 3);
  assert.equal((prediction.match(/Review records for/g) || []).length, 3);
  assert.match(prediction, /High Risk/); assert.match(prediction, /Medium Risk/); assert.match(prediction, /Low Risk/);
  assert.doesNotMatch(prediction, /92\.5|risk score|Score ≤|Score ≥|Preliminary scores|Moderate Risk/);
  assert.match(prediction, /learners\/all/);
  assert.match(prediction, /Student Risk Review/);
  assert.doesNotMatch(prediction, /Stale Imputed Learner/, 'Old page-cache labels are not reused');
  assert.match(prediction, /English grades, attendance and PHIL-IRI are required/);
  assert.doesNotMatch(prediction, /inputs use training-data medians/);
  const { default: StudentRiskCard } = await server.ssrLoadModule('/src/components/at-risk/StudentRiskCard.jsx');
  const attendanceCard = renderToString(React.createElement(StudentRiskCard, { ...students[0],
    flags: [{ icon: 'calendar', label: 'Attendance: 2 absences / 54 class days' }] }));
  assert.match(attendanceCard, /Attendance: 2 absences \/ 54 class days/);
  assert.doesNotMatch(attendanceCard, /typical training value used/,
    'Available attendance is not relabeled as a substituted training value');
  assert.match(prediction, /aria-label="Subject: English"/);
  assert.match(prediction, /aria-label="Prediction period: Predicting Term 2"/);
  assert.match(prediction, /Based on Term 1 records/);
  assert.doesNotMatch(prediction, /Subject: Mathematics|Subject: Science/);
  await loadCached(cacheKey(RISK_PREVIEW_CACHE, { schoolYear: '2026-2027', term: 'T3' }), async () => ({
    ...payload, students: students.map(student => ({ ...student, sourceTerm: 'T2', targetTerm: 'T3' })),
  }));
  const targetTerm3 = render(Prediction, base.replace('term=T2', 'term=T3'));
  assert.match(targetTerm3, /aria-label="Prediction period: Predicting Term 3"/);
  assert.match(targetTerm3, /Based on Term 2 records/);
  assert.match(prediction, /complete previous-term attendance/);
  assert.doesNotMatch(prediction, /Attendance rates are still unverified/);
  assert.match(prediction, /OVERALL DISTRIBUTION/);
  assert.match(prediction, /Breakdown by Grade Level/);
  assert.doesNotMatch(prediction, /ar-risk-information-card|How it is assigned|Suggested follow-up/);
  assert(prediction.indexOf('ar-charts-row') < prediction.indexOf('ar-prediction-list-panel'), 'Learner predictions follows the charts');
  const { sidebarConfig } = await server.ssrLoadModule('/src/config/sidebarConfig.js');
  const riskNavigation = sidebarConfig.principal.find(item => item.title === 'At-Risk Students');
  assert.equal(riskNavigation.path, '/principal/at-risk-students');
  assert.equal(riskNavigation.submenu, undefined);
  const filtered = render(Prediction, base + '&risk=low&search=Sample%20Learner%204');
  assert.match(filtered, /Sample Learner 4/); assert.doesNotMatch(filtered, /Sample Learner 1/);
  const noMatches = render(Prediction, base + '&risk=high&search=NoMatch');
  assert.match(noMatches, /class="ar-preview-empty pa-empty-state"/);
  assert.match(noMatches, /lucide-search-x/);
  assert.match(noMatches, /No learners found/);
  assert.doesNotMatch(noMatches, /class="ar-student-card"/);
  assert.match(noMatches, /Breakdown by Grade Level/, 'A search only filters the learner list, not the charts');
  const noPredictions = render(Prediction, base.replace('gradeLevel=all', 'gradeLevel=7'));
  assert.match(noPredictions, /No predictions for this period/);
  assert.match(noPredictions, /lucide-chart-column/);
  assert.equal((noPredictions.match(/class="ar-preview-empty pa-empty-state"/g) || []).length, 2);
  assert.doesNotMatch(noPredictions, /ar-chart-card|ar-charts-row|grouped-bar-chart|OVERALL DISTRIBUTION/,
    'No-data view replaces both large chart placeholders with one compact EmptyState');
  const { default: Learners } = await server.ssrLoadModule('/src/pages/principal/AtRiskLearners.jsx');
  const list = render(Learners, '/principal/at-risk-students/prediction/learners/all?schoolYear=2026-2027&term=T2&gradeLevel=all', '/principal/at-risk-students/:origin/learners/:level');
  assert.equal((list.match(/Review records for/g) || []).length, 4);
  const recordsNeeded = render(Learners, '/principal/at-risk-students/prediction/learners/unavailable?schoolYear=2026-2027&term=T2&gradeLevel=7', '/principal/at-risk-students/:origin/learners/:level');
  assert.match(recordsNeeded, /Insufficient data/);
  assert.match(recordsNeeded, /Attendance needed: 3 weekdays missing/);
  assert.match(recordsNeeded, /PHIL-IRI needed: No screening recorded/);
  assert.doesNotMatch(recordsNeeded, /Awaiting Learner|ar-student-card|Review records for/);
  const noListMatches = render(Learners, '/principal/at-risk-students/prediction/learners/high?schoolYear=2026-2027&term=T2&gradeLevel=all&search=NoMatch', '/principal/at-risk-students/:origin/learners/:level');
  assert.match(noListMatches, /class="ar-preview-empty pa-empty-state"/);
  assert.match(noListMatches, /lucide-search-x/);
  const { getLearnerFilterPanelLayout } = await server.ssrLoadModule('/src/utils/riskPresentation.js');
  const desktopTrigger = { left: 1160, right: 1196, height: 36 };
  const desktopPanel = getLearnerFilterPanelLayout(desktopTrigger, 1440);
  assert.equal(desktopPanel.placement, 'left');
  assert.equal(desktopPanel.style.width, 660);
  assert.equal(desktopPanel.style.top, 0);
  assert.equal(desktopPanel.style.left + desktopPanel.style.width, -12, 'Panel sits beside, not below, the icon');
  for (const [viewport, triggerLeft] of [[1024, 760], [768, 490], [390, 140]]) {
    const panel = getLearnerFilterPanelLayout({ left: triggerLeft, right: triggerLeft + 36, height: 36 }, viewport);
    const absoluteLeft = triggerLeft + panel.style.left;
    assert(absoluteLeft >= 16, `Panel stays inside the left edge at ${viewport}px`);
    assert(absoluteLeft + panel.style.width <= viewport - 16, `Panel stays inside the right edge at ${viewport}px`);
  }
  assert.equal(getLearnerFilterPanelLayout({ left: 140, right: 176, height: 36 }, 390).placement, 'below');
  const legacyList = render(Learners, '/principal/at-risk-students/breakdown/learners/low?schoolYear=2026-2027&term=T2&gradeLevel=all', '/principal/at-risk-students/:origin/learners/:level');
  assert.match(legacyList, /href="\/principal\/at-risk-students\/prediction\?[^\"]*risk=low/);
  const { default: LearnerPredictionDialog } = await server.ssrLoadModule('/src/components/at-risk/LearnerPredictionDialog.jsx');
  const { predictionInputRows, predictionRecordGroups } = await server.ssrLoadModule('/src/utils/riskPresentation.js');
  const rows = predictionInputRows({ modelInputs: { ...features, absence_rate: null, phil_iri_literal_pct: null } });
  assert.equal(rows.find(row => row.key === 'absence_rate').value, 'Not available');
  assert(rows.every(row => !Object.hasOwn(row, 'status')), 'Learner-facing rows do not include developer statuses');
  assert.equal(rows.find(row => row.key === 'phil_iri_literal_pct').value, 'Not available');
  const zeros = predictionInputRows({ modelInputs: { ...features, phil_iri_literal_pct: 0, absence_rate: 0.1 } });
  assert.equal(zeros.find(row => row.key === 'phil_iri_literal_pct').value, '0%');
  assert.equal(zeros.find(row => row.key === 'absence_rate').value, '10%');
  const learnerReview = renderToString(React.createElement(MemoryRouter, null,
    React.createElement(LearnerPredictionDialog, { student: students[0], onClose: () => {} }))).replace(/<!-- -->/g, '');
  assert.match(learnerReview, /Term 1 source records/);
  assert.match(learnerReview, /Term 1 English grade/);
  assert.match(learnerReview, /Assessment components/);
  assert.match(learnerReview, /PHIL-IRI screening/);
  assert.equal((learnerReview.match(/class="ar-record-group"/g) || []).length, 4);
  assert.match(learnerReview, /Open learner report/);
  assert.match(learnerReview, /Predictions are advisory, not official grades/);
  assert.doesNotMatch(learnerReview, /Model input status|What needs checking|Training median used|ar-review-notice/);
  assert.doesNotMatch(learnerReview, /risk score|92\.5/, 'Review does not display numeric risk outputs');
  const completeAttendanceStudent = { ...students[0], sourceTerm: 'T2', attendanceStatus: 'available',
    attendanceSummary: { absentDays: 2, classDays: 20 }, modelInputs: { ...features, absence_rate: 0.1 } };
  const groups = predictionRecordGroups(completeAttendanceStudent);
  assert.deepEqual(groups.map(group => group.key), ['grade', 'assessments', 'screening', 'attendance']);
  assert.equal(groups[0].label, 'Term 2 English grade');
  assert.equal(groups[3].metrics[0].value, '2 absences / 20 class days');
  assert.equal(groups[3].metrics[1].value, '10%');
  const incompleteAttendance = predictionRecordGroups({ ...completeAttendanceStudent, attendanceStatus: 'unavailable',
    modelInputs: { ...features, absence_rate: null } }).find(group => group.key === 'attendance');
  assert.deepEqual(incompleteAttendance.metrics, [{ label: 'Absence rate', value: 'Not available' }],
    'Partial attendance counts and training medians are not presented as complete learner records');
  const noAbsences = predictionRecordGroups({ ...completeAttendanceStudent, attendanceSummary: { absentDays: 0, classDays: 20 },
    modelInputs: { ...features, absence_rate: 0 } }).find(group => group.key === 'attendance');
  assert.equal(noAbsences.metrics[0].value, '0 absences / 20 class days');
  assert.equal(noAbsences.metrics[1].value, '0%');
  const { learnerReportPath, learnerCountScale } = await server.ssrLoadModule('/src/utils/riskPresentation.js');
  const { filterRiskPreview } = await server.ssrLoadModule('/src/utils/filterRiskPreview.js');
  const awaitingGrade = filterRiskPreview(payload, '7');
  assert.equal(awaitingGrade.summary.total, 0);
  assert.equal(awaitingGrade.summary.unavailable, 1);
  assert.equal(awaitingGrade.summary.totalEnglish, 1);
  assert.equal(awaitingGrade.distribution.high.count, 0);
  const { missingRiskSourcesText } = await server.ssrLoadModule('/src/utils/riskPresentation.js');
  assert.equal(missingRiskSourcesText(['attendance', 'phil_iri']), 'Attendance and PHIL-IRI needed');

  // Exercise both real request services: old request-cache URLs must not be reused.
  const { getAtRiskPreview } = await server.ssrLoadModule('/src/services/atRiskPredictionApi.js');
  const { getSectionDetails } = await server.ssrLoadModule('/src/services/sectionDetailsService.js');
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => { requests.push(new URL(url)); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); };
  try {
    await loadCached(cacheKey('section-details:v3', { assignmentType: 'teaching', assignmentId: 1, term: 'T1', userId: 1 }),
      async () => ({ staleRisk: true }));
    await getAtRiskPreview({ schoolYear: '2026-2027', term: 'T2', inputPolicy: 'old-imputation' });
    const details = await getSectionDetails({ assignmentType: 'teaching', assignmentId: 1, term: 'T1', userId: 1 });
    assert.equal(details.staleRisk, undefined);
    assert.equal(requests.length, 2);
    assert(requests.every(url => url.searchParams.get('inputPolicy') === RISK_INPUT_POLICY));
    assert.notEqual(SECTION_DETAILS_CACHE, 'section-details:v3');
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(learnerCountScale(4), { maximum: 5, ticks: [0, 1, 2, 3, 4, 5] });
  for (const count of [0, 1, 5, 12, 40, 100, 999]) {
    const scale = learnerCountScale(count);
    assert(scale.maximum > count, `Axis leaves room above ${count} learners`);
    assert(scale.maximum >= 5);
    assert.equal(scale.ticks[0], 0);
    assert.equal(scale.ticks.at(-1), scale.maximum);
    assert(scale.ticks.every(Number.isInteger), 'Learner-count ticks are whole numbers');
    assert(scale.ticks.length <= 6, 'Axis avoids excessive tick labels');
  }
  const { default: GradeChart } = await server.ssrLoadModule('/src/components/at-risk/GradeLevelBreakdownChart.jsx');
  const chart = renderToString(React.createElement(GradeChart, {
    data: [{ grade: 'Grade 8', low: 4, medium: 0, high: 0 }], gradeLevels: options.gradeLevels,
  }));
  assert.match(chart, /Number of learners/);
  assert.match(chart, />5<\/text>/);
  assert.match(chart, /Grade 8, Low Risk: 4/, 'Actual count remains unchanged');
  const valueLabels = [...chart.matchAll(/<text class="grouped-bar-chart__value[^\"]*"[^>]*>(.*?)<\/text>/g)];
  assert.deepEqual(valueLabels.map(match => match[1]), ['4'], 'Only nonzero bars display value labels');
  const { default: GroupedBarChart } = await server.ssrLoadModule('/src/components/charts/GroupedBarChart.jsx');
  const sharedChart = renderToString(React.createElement(GroupedBarChart, { groups: [{
    id: 'demo', label: 'Demo', values: [{ id: 'zero', label: 'Zero', value: 0, color: '#123062' }],
  }], ariaLabel: 'Shared chart defaults' }));
  assert.match(sharedChart, /class="grouped-bar-chart__value"[^>]*>0<\/text>/,
    'Other charts keep their existing zero-label behavior by default');
  assert.equal(learnerReportPath({}), null);
  assert.match(learnerReportPath(students[0]), /studentId=1&schoolYearId=3&enrollmentId=501/);
  await loadCached(cacheKey('reports:catalog'), async () => ({ students: [{ student_id: 1, name: 'Sample Learner 1' }],
    sections: [{ section_id: 2, section_name: 'Demo', grade_level_id: 8, grade_level_name: 'Grade 8' }],
    enrollments: [{ student_id: 1, student_section_id: 501, section_id: 2, school_year_id: 3 }], grades: [],
    years: [{ school_year_id: 3, starts_on: '2026-06-01', ends_on: '2027-03-31' }], defaultSchoolYearId: '3' }));
  const { default: Reports } = await server.ssrLoadModule('/src/pages/principal/PrincipalReports.jsx');
  assert.match(render(Reports, learnerReportPath(students[0])), /Official report for Sample Learner 1/);
  assert.match(render(Reports, '/principal/reports?studentId=1&schoolYearId=99&enrollmentId=501'), /Learner report unavailable/);
  assert.match(render(Reports, '/principal/reports?studentId=1&schoolYearId=3&enrollmentId=999'), /Learner report unavailable/);
  process.stdout.write('PASS simplified learner review without developer-status areas, filter placement, empty states, dynamic learner axis and report links\n');
} finally { await server.close(); }
