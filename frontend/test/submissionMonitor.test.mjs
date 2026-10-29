import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
try {
  const { default: Table } = await server.ssrLoadModule('/src/components/dashboard/SubmissionMonitorTable.jsx');
  const row = { subjectOfferingId: 88, teacher: 'Demo Teacher', subject: 'English', gradeSection: 'G7 - Carrots',
    status: 'Overdue', completion: 33, submittedTerms: 1, expectedTerms: 3, overdueTerms: 1, lateTerms: 0 };
  const render = props => renderToStaticMarkup(React.createElement(Table, { data: [row], term: '', onTermChange() {}, ...props }));
  await test('table shows subject, actual submission fraction and overdue count', () => {
    const html = render({});
    for (const text of ['Subject', 'English', 'Submission Progress', '1 of 3 submitted', '33%', '1 overdue', 'All Terms']) assert.ok(html.includes(text), text);
    assert.match(html, /aria-valuenow="33"/);
    assert.doesNotMatch(html, /40%/);
  });
  await test('failure replaces stale rows with retry, rather than the empty state', () => {
    const html = render({ error: new Error('Unavailable'), onRetry() {} });
    assert.match(html, /role="alert"/);
    assert.match(html, /Retry submissions/);
    assert.doesNotMatch(html, /Demo Teacher|No submissions match/);
  });
  await test('loading, empty, no-term and late states are distinct', () => {
    assert.match(render({ loading: true }), /Loading submissions/);
    assert.match(render({ data: [] }), /colSpan="5"|colspan="5"/);
    assert.match(render({ data: [] }), /No submissions match/);
    const noTerms = render({ data: [{ ...row, expectedTerms: 0, completion: null, status: 'Not configured' }] });
    assert.match(noTerms, /No configured terms/);
    assert.doesNotMatch(noTerms, /role="progressbar"/);
    assert.match(render({ data: [{ ...row, status: 'Submitted late', lateTerms: 1, overdueTerms: 0 }] }), /1 submitted late/);
  });
} finally {
  await server.close();
}
