const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
// This legacy suite must never change the application's configured database.
let config = { config_id: 1, is_custom_enabled: 0, ranges_json: null };
let saved;
const fixture = {
  beginTransaction: async () => { saved = structuredClone(config); },
  commit: async () => {}, rollback: async () => { config = structuredClone(saved); }, release() {},
  getConnection: async () => fixture,
  execute: async (sql, params = []) => {
    if (sql.includes('SELECT config_id')) return [[{ config_id: 1 }]];
    if (sql.includes('SELECT gtc.*')) return [[structuredClone(config)]];
    if (sql.includes('INSERT INTO GRADE_TRANSMUTATION_CONFIG')) {
      config = { ...config, is_custom_enabled: params[0], ranges_json: params[1] };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('CREATE TABLE') || sql.includes('INSERT INTO AUDIT_EVENT')) return [{ insertId: 1 }];
    throw Error('Unexpected transmutation fixture query: ' + sql);
  },
};
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  return name === '../config/db' ? fixture : originalLoad.call(this, name, parent, main);
};
const GradeTransmutationConfig = require('../models/GradeTransmutationConfig');
test.after(() => { Module._load = originalLoad; });

test('GradeTransmutationConfig official table conforms to DepEd Order No. 015, s. 2026 (SY 2026-2027)', () => {
  const table = GradeTransmutationConfig.OFFICIAL_TABLE;

  // Total 41 tiers
  assert.equal(table.length, 41, 'Official table must contain 41 ranges');

  // Top tier
  assert.equal(table[0].min, '99.50');
  assert.equal(table[0].max, '100.00');
  assert.equal(table[0].transmuted, '100');

  // Passing threshold tier (75 requires 70.00 initial grade)
  const passingTier = table.find((t) => t.transmuted === '75');
  assert.ok(passingTier, 'Passing tier 75 must exist');
  assert.equal(passingTier.min, '70.00');
  assert.equal(passingTier.max, '71.17');

  // Lowest computed band above minimum floor
  const lowestBand = table.find((t) => t.min === '4.68' && t.max === '9.34');
  assert.ok(lowestBand, '4.68 - 9.34 tier must exist');
  assert.equal(lowestBand.transmuted, '61');

  // Default minimum band
  const defaultMinTier = table.find((t) => t.min === '0.00' && t.max === '4.67');
  assert.ok(defaultMinTier, '0.00 - 4.67 default minimum tier must exist');
  assert.equal(defaultMinTier.transmuted, '60');
  assert.equal(defaultMinTier.label, 'default minimum');
});

test('GradeTransmutationConfig validateRanges detects overlaps and invalid ranges', () => {
  // Empty
  assert.match(GradeTransmutationConfig.validateRanges([]), /required/i);

  // Overlap
  const overlapping = [
    { min: '80.00', max: '90.00', transmuted: '90' },
    { min: '85.00', max: '95.00', transmuted: '95' },
  ];
  assert.match(GradeTransmutationConfig.validateRanges(overlapping), /overlap/i);

  // Min > Max
  const inverted = [
    { min: '90.00', max: '80.00', transmuted: '85' },
  ];
  assert.match(GradeTransmutationConfig.validateRanges(inverted), /cannot exceed maximum/i);

  // Out of bounds
  const outOfBounds = [
    { min: '-5.00', max: '50.00', transmuted: '60' },
  ];
  assert.match(GradeTransmutationConfig.validateRanges(outOfBounds), /between 0\.00 and 100\.00/i);

  // Valid non-overlapping
  const valid = [
    { min: '0.00', max: '69.99', transmuted: '70' },
    { min: '70.00', max: '100.00', transmuted: '85' },
  ];
  assert.equal(GradeTransmutationConfig.validateRanges(valid), null);
});

test('GradeTransmutationConfig transmuteSync matches boundary scores with explicit tiers and untransmuted without tiers', () => {
  const officialTiers = GradeTransmutationConfig.OFFICIAL_TABLE.map((t) => ({
    min: Number(t.min),
    max: Number(t.max),
    transmuted: Number(t.transmuted),
  }));

  // With explicit tiers provided
  assert.equal(GradeTransmutationConfig.transmuteSync(100, officialTiers), 100);
  assert.equal(GradeTransmutationConfig.transmuteSync(99.5, officialTiers), 100);
  assert.equal(GradeTransmutationConfig.transmuteSync(99.49, officialTiers), 99);
  assert.equal(GradeTransmutationConfig.transmuteSync(70.0, officialTiers), 75);
  assert.equal(GradeTransmutationConfig.transmuteSync(71.17, officialTiers), 75);
  assert.equal(GradeTransmutationConfig.transmuteSync(69.99, officialTiers), 74);
  assert.equal(GradeTransmutationConfig.transmuteSync(65.34, officialTiers), 74);
  assert.equal(GradeTransmutationConfig.transmuteSync(65.33, officialTiers), 73);
  assert.equal(GradeTransmutationConfig.transmuteSync(4.68, officialTiers), 61);
  assert.equal(GradeTransmutationConfig.transmuteSync(4.67, officialTiers), 60);
  assert.equal(GradeTransmutationConfig.transmuteSync(0.0, officialTiers), 60);
  assert.equal(GradeTransmutationConfig.transmuteSync(-5, officialTiers), 60);
  assert.equal(GradeTransmutationConfig.transmuteSync(105, officialTiers), 100);
  assert.equal(GradeTransmutationConfig.transmuteSync('', officialTiers), null);

  // Without custom enabled, grades are NOT transmuted
  assert.equal(GradeTransmutationConfig.transmuteSync(84.6), 85);
  assert.equal(GradeTransmutationConfig.transmuteSync(70.0), 70);
});

test('GradeTransmutationConfig database operations: init, get, save, and reset', async () => {
  await GradeTransmutationConfig.initTable();

  // Initially reset to clean state (custom OFF: grades are not transmuted)
  await GradeTransmutationConfig.resetToDefault({ updated_by: null });
  const initial = await GradeTransmutationConfig.getConfig();
  assert.equal(initial.is_custom_enabled, false);
  assert.equal(initial.ranges.length, 41);
  const inactiveTiers = await GradeTransmutationConfig.getActiveTiers();
  assert.equal(inactiveTiers, null);
  assert.equal(GradeTransmutationConfig.transmuteSync(84), 84); // Untransmuted

  // Save custom configuration (custom ON: grades are transmuted)
  const customRanges = [
    { id: 'c-1', min: '75.00', max: '100.00', transmuted: '90' },
    { id: 'c-2', min: '0.00', max: '74.99', transmuted: '70' },
  ];

  const saved = await GradeTransmutationConfig.saveConfig({
    is_custom_enabled: true,
    ranges: customRanges,
  });
  assert.equal(saved.is_custom_enabled, true);
  assert.equal(saved.ranges.length, 2);

  // Active tiers should reflect custom ranges
  const activeTiers = await GradeTransmutationConfig.getActiveTiers();
  assert.equal(activeTiers.length, 2);
  assert.equal(GradeTransmutationConfig.transmuteSync(80), 90);
  assert.equal(GradeTransmutationConfig.transmuteSync(70), 70);

  // Reset back to default (custom OFF: grades are not transmuted)
  const reset = await GradeTransmutationConfig.resetToDefault({ updated_by: null });
  assert.equal(reset.is_custom_enabled, false);
  assert.equal(reset.ranges.length, 41);

  const resetActiveTiers = await GradeTransmutationConfig.getActiveTiers();
  assert.equal(resetActiveTiers, null);
  assert.equal(GradeTransmutationConfig.transmuteSync(84.6), 85); // Untransmuted
});


