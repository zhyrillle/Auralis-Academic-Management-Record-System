const test = require('node:test');
const assert = require('node:assert/strict');

test('SF10 rating formula: simple average of 3 terms rounded', () => {
  const computeFinal = (t1, t2, t3) => {
    if (typeof t1 !== 'number' || typeof t2 !== 'number' || typeof t3 !== 'number') return null;
    return Math.round((t1 + t2 + t3) / 3);
  };

  // Standard case: 88, 90, 92 -> 90
  assert.equal(computeFinal(88, 90, 92), 90);

  // Rounding up: (85 + 85 + 86) / 3 = 85.333 -> 85
  assert.equal(computeFinal(85, 85, 86), 85);

  // Rounding up: (85 + 86 + 86) / 3 = 85.666 -> 86
  assert.equal(computeFinal(85, 86, 86), 86);

  // Incomplete term returns null
  assert.equal(computeFinal(85, 86, null), null);
  assert.equal(computeFinal(null, null, null), null);
});

test('SF10 MAPEH combined rating: simple average of MA and PEH rounded', () => {
  const computeMapehTerm = (ma, peh) => {
    if (typeof ma === 'number' && typeof peh === 'number') {
      return Math.round((ma + peh) / 2);
    }
    return ma ?? peh ?? null;
  };

  assert.equal(computeMapehTerm(88, 90), 89);
  assert.equal(computeMapehTerm(85, 86), 86); // 85.5 -> 86
  assert.equal(computeMapehTerm(85, null), 85);
});

test('SF10 General Average: averages main subjects and excludes sub-components from divisor', () => {
  const subjects = [
    { code: 'fil', isHeader: false, isSubSubject: false, final: 90 },
    { code: 'eng', isHeader: false, isSubSubject: false, final: 88 },
    { code: 'math', isHeader: false, isSubSubject: false, final: 85 },
    { code: 'sci', isHeader: false, isSubSubject: false, final: 87 },
    { code: 'ap', isHeader: false, isSubSubject: false, final: 91 },
    { code: 've', isHeader: false, isSubSubject: false, final: 92 },
    { code: 'tle', isHeader: false, isSubSubject: false, final: 89 },
    { code: 'mapeh', isHeader: true, isSubSubject: false, final: 88 },
    { code: 'music_arts', isHeader: false, isSubSubject: true, final: 88 },
    { code: 'pe_health', isHeader: false, isSubSubject: true, final: 88 }
  ];

  const mainSubjects = subjects.filter(s => !s.isHeader && !s.isSubSubject);
  assert.equal(mainSubjects.length, 7); // Filipino, English, Math, Science, AP, Values Ed, TLE

  // Plus MAPEH parent rating if it is evaluated as main subject
  // When MAPEH is counted as one of the 8 learning areas:
  const learningAreas = subjects.filter(s => !s.isSubSubject);
  assert.equal(learningAreas.length, 8); // 8 DepEd Core Learning Areas

  const sum = learningAreas.reduce((acc, s) => acc + s.final, 0);
  const genAvg = Math.round(sum / learningAreas.length);
  // (90 + 88 + 85 + 87 + 91 + 92 + 89 + 88) = 710 / 8 = 88.75 -> 89
  assert.equal(genAvg, 89);
  assert.equal(genAvg >= 75 ? 'Passed' : 'Failed', 'Passed');
});
