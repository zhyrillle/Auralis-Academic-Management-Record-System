const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const gradeTransmutationRoutes = require('../routes/gradeTransmutationRoutes');
const GradeTransmutationConfig = require('../models/GradeTransmutationConfig');

const app = express();
app.use(express.json());
app.use('/api/grade-transmutation', gradeTransmutationRoutes);

test('API endpoints for grade transmutation', async () => {
  await GradeTransmutationConfig.initTable();

  // Helper using node fetch on local server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/grade-transmutation`;

  try {
    // 1. GET /api/grade-transmutation
    const getRes = await fetch(baseUrl);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.ok(Array.isArray(getData.ranges));
    assert.ok(Array.isArray(getData.default_ranges));
    assert.equal(getData.default_ranges.length, 42);

    // 2. PUT /api/grade-transmutation with invalid ranges (overlapping)
    const badPutRes = await fetch(baseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_custom_enabled: true,
        ranges: [
          { min: '70.00', max: '80.00', transmuted: '75' },
          { min: '75.00', max: '90.00', transmuted: '85' },
        ],
      }),
    });
    assert.equal(badPutRes.status, 400);

    // 3. PUT /api/grade-transmutation with valid custom ranges
    const goodPutRes = await fetch(baseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_custom_enabled: true,
        ranges: [
          { min: '70.00', max: '100.00', transmuted: '85' },
          { min: '0.00', max: '69.99', transmuted: '70' },
        ],
      }),
    });
    assert.equal(goodPutRes.status, 200);
    const putData = await goodPutRes.json();
    assert.equal(putData.success, true);
    assert.equal(putData.config.is_custom_enabled, true);
    assert.equal(putData.config.ranges.length, 2);

    // 4. POST /api/grade-transmutation/reset
    const resetRes = await fetch(`${baseUrl}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.equal(resetData.success, true);
    assert.equal(resetData.config.is_custom_enabled, false);
    assert.equal(resetData.config.ranges.length, 42);
  } finally {
    server.close();
  }
});
