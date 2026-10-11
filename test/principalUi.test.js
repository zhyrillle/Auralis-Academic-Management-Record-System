import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Replace Vite's env expression and resolve the service's static preview-data import for Node.
async function client(name) {
  const source = await fs.readFile(new URL(`../frontend/src/services/${name}.js`, import.meta.url), 'utf8');
  const previewSource = await fs.readFile(new URL('../frontend/src/data/principalPerformancePreviewData.js', import.meta.url), 'utf8');
  const previewUrl = 'data:text/javascript;base64,' + Buffer.from(previewSource).toString('base64');
  return import('data:text/javascript;base64,' + Buffer.from(
    source.replaceAll('import.meta.env.VITE_API_BASE_URL', 'undefined')
      .replace('"../data/principalPerformancePreviewData"', JSON.stringify(previewUrl))).toString('base64'));
}
const { getSectionPerformance } = await client('principalPerformanceService');
const { getHistoricalComparison } = await client('principalAnalyticsService');
const years = [{ value: '2026-2027', label: 'SY 2026–2027' }];
const sectionResponse = { sections: [], bands: [], availableSchoolYears: years,
  availableGradeLevels: [8], summary: { averageGrade: 0, passRate: 0, failRate: 0,
    passingLearners: 0, failingLearners: 0, needsAttention: 0 } };
const historicalResponse = { term: 'overall', subjects: [{ id: 'english', label: 'English',
  primaryAverage: 81, comparisonAverage: 79 }], availableSchoolYears: years,
  primarySchoolYear: years[0], comparisonSchoolYear: { label: 'SY 2025–2026' } };
function response(t, data, status = 200) {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: status === 200, status, json: async () => data }));
}

test('By Sections accepts valid empty data without replacing it with invented records', async (t) => {
  response(t, sectionResponse);
  assert.strictEqual(await getSectionPerformance({}), sectionResponse);
});
test('By Sections rejects incomplete responses that previously crashed the page', async (t) => {
  response(t, { sections: [], bands: [] });
  await assert.rejects(getSectionPerformance({}), /response is incomplete/);
});
test('By Sections rejects rows without chart distributions', async (t) => {
  response(t, { ...sectionResponse, sections: [{ label: 'G8-A', section: 'A', gradeLevel: 8 }] });
  await assert.rejects(getSectionPerformance({}), /response is incomplete/);
});
test('By Sections retains the latest backend section schema, including valid zero distributions', async (t) => {
  const data = { ...sectionResponse, sections: [{ id: 'sec-19', sectionId: 'sec-19',
    rawSectionId: 19, label: 'G8-Banana', section: 'Banana', gradeLevel: 8,
    learners: 11, averageGrade: 0, passRate: 0, failRate: 0, status: 'No data',
    distribution: { needsAttention: 0, satisfactory: 0, verySatisfactory: 0, outstanding: 0 } }] };
  response(t, data);
  assert.strictEqual(await getSectionPerformance({}), data);
});
test('Historical Comparison accepts the existing aggregate-only API without inventing counts or rates', async (t) => {
  response(t, historicalResponse);
  const result = await getHistoricalComparison({});
  assert.strictEqual(result, historicalResponse);
  assert.equal(result.totalStudents, undefined);
  assert.equal(result.subjects[0].passRate, undefined);
});
test('Historical Comparison accepts successful empty results', async (t) => {
  response(t, { ...historicalResponse, subjects: [] });
  assert.deepEqual((await getHistoricalComparison({})).subjects, []);
});
test('Historical Comparison rejects missing year metadata', async (t) => {
  response(t, { subjects: historicalResponse.subjects });
  await assert.rejects(getHistoricalComparison({}), /response is incomplete/);
});
for (const [name, request] of [['By Sections', getSectionPerformance], ['Historical Comparison', getHistoricalComparison]]) {
  test(`${name} exposes HTTP failures instead of silently returning zero-data success`, async (t) => {
    response(t, { error: 'Unavailable' }, 500);
    await assert.rejects(request({}), /HTTP 500/);
  });
  test(`${name} exposes connection failures for Retry`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network unavailable'); });
    await assert.rejects(request({}), /Network unavailable/);
  });
}
