// Render the real PHIL-IRI page and exercise its API with in-memory responses only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value) };
globalThis.window = { location: { origin: 'http://localhost' }, console,
  addEventListener: () => {}, atob: globalThis.atob, btoa: globalThis.btoa };
globalThis.fetch = async () => ({ ok: false, status: 503 });
const server = await createServer({ cacheDir: mkdtempSync(path.join(os.tmpdir(), 'auralis-phil-iri-test-')),
  server: { middlewareMode: true, ws: false }, appType: 'custom' });

try {
  const { default: Page } = await server.ssrLoadModule('/src/pages/adviser/PhilIri.jsx');
  const api = await server.ssrLoadModule('/src/services/philIriApi.js');

  await test('only Screening and Post-Test tabs render, with Screening selected by default', () => {
    const html = renderToString(React.createElement(MemoryRouter, { initialEntries: ['/adviser/phil-iri'] },
      React.createElement(Page, { activeClass: { section_id: 2, subject_offering_id: 20, section_name: 'Demo' } })));
    assert.match(html, /role="tab" aria-selected="true"[^>]*>Screening Test/);
    assert.match(html, /role="tab" aria-selected="false"[^>]*>Post-Test/);
    assert.doesNotMatch(html, /Pre-Test|PRE – TEST RESULT/);
    assert.match(html, /phil-iri-document-skeleton/);
  });

  await test('Post-Test reads send the enrollment year and cannot reuse another year’s offline cache', async () => {
    storage.set('phil_iri_2_POST_TEST', JSON.stringify({ records: [{ student_section_id: 99 }] }));
    storage.set('phil_iri_2_POST_TEST_sy_2', JSON.stringify({ records: [{ student_section_id: 88 }] }));
    let requested;
    globalThis.fetch = async url => { requested = url; return { ok: false, status: 503 }; };
    const result = await api.getPhilIriRecords(2, undefined, 20, 3);
    assert.match(requested, /testType=POST_TEST/);
    assert.match(requested, /subjectOfferingId=20/);
    assert.match(requested, /schoolYearId=3/);
    assert.deepEqual(result.records, []);
  });

  await test('Post-Test saves keep the school year in the server payload and offline backup', async () => {
    let payload;
    globalThis.fetch = async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ success: true, tableReady: true }) };
    };
    const records = [{ student_section_id: 4, test_type: 'POST_TEST' }];
    const saved = await api.savePhilIriBatch({ sectionId: 2, subjectOfferingId: 20, schoolYearId: 3,
      userId: 5, records });
    assert.equal(payload.schoolYearId, 3);
    assert.equal(payload.records[0].test_type, 'POST_TEST');
    assert.equal(saved.source, 'database');
    assert.deepEqual(JSON.parse(storage.get('phil_iri_2_POST_TEST_sy_3')).records, records);
    assert.equal(JSON.parse(storage.get('phil_iri_2_POST_TEST')).records[0].student_section_id, 99);
  });
} finally { await server.close(); }
