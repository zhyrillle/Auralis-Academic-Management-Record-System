// Actual service contracts + SSR charts with synthetic HTTP only. No database.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { performance, trend, historical, feedbackSummary, feedbackLikert, feedbackComments, rawYears } from './fixtures/principalRecords.mjs';
globalThis.localStorage = { getItem: () => null };
globalThis.window = { location: { origin: 'http://localhost' }, addEventListener() {}, console };
const server = await createServer({ cacheDir: mkdtempSync(join(tmpdir(), 'auralis-principal-contract-')), server: { middlewareMode: true, ws: false }, appType: 'custom' });
try {
  const data = await server.ssrLoadModule('/src/services/principalData.js');
  const perf = await server.ssrLoadModule('/src/services/principalPerformanceService.js');
  const analytics = await server.ssrLoadModule('/src/services/principalAnalyticsService.js');
  const feedback = await server.ssrLoadModule('/src/services/principalFeedbackService.js');
  const calls = [];
  let status = 200, payload;
  globalThis.fetch = async url => { calls.push(new URL(url)); return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }); };
  for (const [fn, page] of [[perf.getGradeLevelPerformance, 'grade-levels'], [perf.getSectionPerformance, 'sections'], [perf.getSubjectPerformance, 'subjects'], [perf.getTeacherPerformance, 'teachers'], [perf.getLowestPerformers, 'lowest-performers']]) {
    payload = performance(page, {}, true);
    assert.deepEqual(await fn({ schoolYear: '2026-2027' }), payload);
    status = 500; await assert.rejects(fn({}), /Unable to load/); status = 200;
    payload = { recordsVersion: 2 }; await assert.rejects(fn({}), /incomplete records/);
    payload = performance(page); delete payload.recordsVersion; await assert.rejects(fn({}), /backend needs/);
  }
  payload = trend({}, true); assert.deepEqual(await analytics.getSubjectPerformanceTrend({}), payload);
  payload = trend(); assert.equal((await analytics.getSubjectPerformanceTrend({})).subjects[0].termAverages[0], 0);
  for (const missing of ['primary', 'comparison', 'both']) { payload = historical({}, missing); assert.deepEqual(await analytics.getHistoricalComparison({}), payload); }
  const feedbackCases = [[feedback.getTeacherFeedbackSummary, feedbackSummary], [feedback.getLikertEvaluationResults, feedbackLikert], [feedback.getTeacherFeedbackComments, feedbackComments]];
  for (const [fn, fixture] of feedbackCases) {
    payload = fixture(true); await fn('2026-2027');
    status = 503; await assert.rejects(fn('2026-2027'), /Unable to load/); status = 200;
    payload = { recordsVersion: 2 }; await assert.rejects(fn('2026-2027'), /incomplete records/);
  }
  payload = rawYears; const years = await data.getPrincipalSchoolYears();
  assert.equal(years[0].isCurrent, true); assert.equal(years[0].value, '2026-2027');
  payload = []; assert.deepEqual(await data.getPrincipalSchoolYears(), []);
  payload = '{bad json'; await assert.rejects(data.getPrincipalSchoolYears(), /unreadable/);
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(perf.getSubjectPerformance({}), /Failed to fetch/);
  assert(calls.every(url => url.searchParams.get('recordsVersion') === '2'), 'every underlying URL is versioned');
  const { cacheKey } = await server.ssrLoadModule('/src/services/navigationCache.js');
  assert.notEqual(data.principalCacheKey('performance:grades', {}), cacheKey('performance:grades', {}));
  for (const malformed of [null, '', ' ', false, [], {}, NaN, Infinity]) assert.equal(data.numeric(malformed), false);
  assert.equal(data.numeric(0), true); assert.equal(data.numeric('0'), true);
  const { mutedSeriesStyles } = await server.ssrLoadModule('/src/pages/principal/analytics/principalChartStyles.js');
  const roster = Array.from({ length: 40 }, (_, index) => ({ id: 'teacher-' + (index + 1) }));
  const teacherStyles = mutedSeriesStyles(roster);
  assert.equal(new Set([...teacherStyles.values()].map(style => style.color)).size, 40);
  for (const style of teacherStyles.values()) { assert.equal(style.dash, ''); assert.equal(style.marker, 'circle'); }
  const reorderedStyles = mutedSeriesStyles([...roster].reverse());
  for (const teacher of roster) assert.deepEqual(reorderedStyles.get(teacher.id), teacherStyles.get(teacher.id));
  const { default: LineChart } = await server.ssrLoadModule('/src/components/charts/LineChart.jsx');
  const html = renderToString(React.createElement(LineChart, { ariaLabel: 'test', labels: ['Term 1', 'Term 2', 'Term 3'], series: [{ id: 'a', label: 'English', color: '#123062', values: [{ value: 0 }, { value: null }, { value: 88 }] }] }));
  assert.match(html, />0<\/text>/); assert.match(html, />75<\/text>/);
  assert.match(html, /English, Term 1: 0/); assert.doesNotMatch(html, /English, Term 2:/);
  assert.equal((html.match(/class="line-chart__point/g) || []).length, 2);
  assert.doesNotMatch(html, /<polyline/, 'a missing middle term must not be bridged');
  const defaultAxis = renderToString(React.createElement(LineChart, { series: [] }));
  assert.match(defaultAxis, />65<\/text>/, 'the actual lower axis boundary is labeled');
  const { default: Distribution } = await server.ssrLoadModule('/src/components/at-risk/OverallDistributionChart.jsx');
  const emptyDonut = renderToString(React.createElement(Distribution, { data: {} }));
  assert.doesNotMatch(emptyDonut, /class="ar-risk-segment"/, 'no predictions must not generate three equal risk slices');
  const lowOnly = renderToString(React.createElement(Distribution, { data: { low: { count: 4 }, totalFlagged: 4 } }));
  assert.equal((lowOnly.match(/class="ar-risk-segment"/g) || []).length, 1);
  const { default: OverviewCard } = await server.ssrLoadModule('/src/pages/principal/analytics/AnalyticsStatCard.jsx');
  const overview = value => renderToString(React.createElement(OverviewCard, { label: 'Fixture', value, icon: () => null }));
  assert.match(overview('Araling Panlipunan'), /pa-stat-card__value--text/);
  assert.doesNotMatch(overview(11), /pa-stat-card__value--text/);
  assert.doesNotMatch(overview('91.5%'), /pa-stat-card__value--text/);
  console.log('PASS Principal contracts: empty/zero/error/malformed/versioned reads, configured years and gap-safe line charts');
} finally { await server.close(); }
