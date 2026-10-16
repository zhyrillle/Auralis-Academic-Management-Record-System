const test = require('node:test');
const assert = require('node:assert/strict');
const GradeTransmutationConfig = require('../models/GradeTransmutationConfig');

test('GradeTransmutationConfig official table conforms to DepEd SY 2026-2027 policy briefer', () => {
  const table = GradeTransmutationConfig.OFFICIAL_TABLE;

  // Total 42 tiers
  assert.equal(table.length, 42, 'Official table must contain 42 ranges');

  // Top tier
  assert.equal(table[0].min, '99.50');
  assert.equal(table[0].max, '100.00');
  assert.equal(table[0].transmuted, '100');

  // Passing threshold tier (75 requires 70.00 initial grade)
  const passingTier = table.find((t) => t.transmuted === '75');
  assert.ok(passingTier, 'Passing tier 75 must exist');
  assert.equal(passingTier.min, '70.00');
  assert.equal(passingTier.max, '72.99');

  // Lowest computed band
  const lowestBand = table.find((t) => t.min === '25.00' && t.max === '39.99');
  assert.ok(lowestBand, '25.00 - 39.99 tier must exist');
  assert.equal(lowestBand.transmuted, '60');

  // Default minimum band
  const defaultMinTier = table.find((t) => t.min === '0.00' && t.max === '24.00');
  assert.ok(defaultMinTier, '0.00 - 24.00 default minimum tier must exist');
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

test('GradeTransmutationConfig transmuteSync correctly matches boundary scores', () => {
  assert.equal(GradeTransmutationConfig.transmuteSync(100), 100);
  assert.equal(GradeTransmutationConfig.transmuteSync(99.5), 100);
  assert.equal(GradeTransmutationConfig.transmuteSync(99.49), 99);
  assert.equal(GradeTransmutationConfig.transmuteSync(70.0), 75);
  assert.equal(GradeTransmutationConfig.transmuteSync(69.99), 74);
  assert.equal(GradeTransmutationConfig.transmuteSync(39.99), 60);
  assert.equal(GradeTransmutationConfig.transmuteSync(24.0), 60);
  assert.equal(GradeTransmutationConfig.transmuteSync(0.0), 60);
  assert.equal(GradeTransmutationConfig.transmuteSync(-5), 60);
  assert.equal(GradeTransmutationConfig.transmuteSync(105), 100);
  assert.equal(GradeTransmutationConfig.transmuteSync(''), null);
});

test('GradeTransmutationConfig database operations: init, get, save, and reset', async () => {
  await GradeTransmutationConfig.initTable();

  // Initially reset to clean state
  await GradeTransmutationConfig.resetToDefault({ updated_by: null });
  const initial = await GradeTransmutationConfig.getConfig();
  assert.equal(initial.is_custom_enabled, false);
  assert.equal(initial.ranges.length, 42);

  // Save custom configuration
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

  // Reset back to default
  const reset = await GradeTransmutationConfig.resetToDefault({ updated_by: null });
  assert.equal(reset.is_custom_enabled, false);
  assert.equal(reset.ranges.length, 42);

  const resetActiveTiers = await GradeTransmutationConfig.getActiveTiers();
  assert.equal(resetActiveTiers.length, 42);
});

