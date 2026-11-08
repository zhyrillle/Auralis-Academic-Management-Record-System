const { getTransmutedGrade, resolveComponentWeights, weightsFromRows } = require('../utils/depedTransmutation');

const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const number = value => value === null || value === undefined || value === '' || typeof value === 'boolean'
  ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const academicBand = grade => grade < 75 ? 'high' : grade < 80 ? 'moderate' : 'low';
const examKey = name => /\b(ST1|SUMMATIVE\s*(?:TEST\s*)?1)\b/i.test(name) ? 'ST1'
  : /\b(ST2|SUMMATIVE\s*(?:TEST\s*)?2)\b/i.test(name) ? 'ST2'
    : /\b(TE|TERM\s*EXAM|QUARTERLY\s*ASSESSMENT)\b/i.test(name) ? 'TE' : null;

// A monitoring preview only: never writes grades or changes submission calculations.
function computeProgress({ activities = [], weightRows = [], transmutationConfig = null, isMapeh = false, asOf }) {
  const result = { status: 'needs_records', riskLevel: null, provisional: true, progress: null, gradePreview: null,
    weightedPoints: 0, availableWeight: 0, recordedActivities: 0, pendingActivities: 0,
    excusedActivities: 0, futureActivities: 0, components: [], reasons: [] };
  const resolved = resolveComponentWeights(weightsFromRows(weightRows), isMapeh);
  if (resolved.error) return { ...result, status: 'review', reasons: ['Saved subject weights are missing, duplicated, or invalid. Review WS Config.'] };
  const groups = new Map((isMapeh ? ['MA', 'PEH'] : ['SUBJECT']).map(key => [key, {
    label: key === 'MA' ? 'Music & Arts' : key === 'PEH' ? 'PE & Health' : null,
    WW: [], PT: [], EX: [],
  }]));
  const seen = new Set();
  for (const row of activities) {
    if (row.activity_date && asOf && row.activity_date > asOf) { result.futureActivities++; continue; }
    const key = String(row.activity_id);
    if (seen.has(key)) { result.reasons.push('Duplicate activity scores need review.'); continue; }
    seen.add(key);
    const status = row.score_status || (row.score_id ? 'ENCODED' : 'NOT_ENCODED');
    if (status === 'EXCUSED') { result.excusedActivities++; continue; }
    if (!row.score_id || status === 'NOT_ENCODED') { result.pendingActivities++; continue; }
    const maximum = number(row.highest_possible_score);
    const score = status === 'MISSING' ? 0 : number(row.raw_score);
    if (!['ENCODED', 'MISSING'].includes(status) || maximum === null || maximum <= 0
      || score === null || score < 0 || score > maximum) {
      result.reasons.push('An encoded activity score or highest possible score is invalid.'); continue;
    }
    const code = ['EX', 'QA', 'STE'].includes(row.component_code) ? 'EX' : row.component_code;
    const group = groups.get(isMapeh ? row.mapeh_component : 'SUBJECT');
    if (!group || !['WW', 'PT', 'EX'].includes(code)) {
      result.reasons.push('An activity has an invalid subject component.'); continue;
    }
    const exam = code === 'EX' ? examKey(row.activity_name || '') : null;
    if (code === 'EX' && (!exam || group.EX.some(item => item.exam === exam))) {
      result.reasons.push('Examination activities must identify distinct ST1, ST2, and TE records.'); continue;
    }
    group[code].push({ score, maximum, exam, missing: status === 'MISSING' });
    result.recordedActivities++;
  }
  if (result.reasons.length) return { ...result, status: 'review', reasons: [...new Set(result.reasons)] };
  const previews = [];
  for (const group of groups.values()) {
    let points = 0, available = 0;
    for (const code of ['WW', 'PT', 'EX']) {
      const entries = group[code], weight = resolved.weights[code];
      const earned = entries.reduce((sum, item) => sum + item.score, 0);
      const possible = entries.reduce((sum, item) => sum + item.maximum, 0);
      let percent = possible ? earned / possible * 100 : null;
      let representedWeight = entries.length ? weight : 0;
      let contribution = percent === null ? 0 : percent * weight / 100;
      if (code === 'EX' && entries.length) {
        if (isMapeh) {
          // The existing MAPEH grade pools exam points; three exam stages share coverage.
          representedWeight = weight * entries.length / 3;
          contribution = percent * representedWeight / 100;
        } else {
          const shares = { ST1: 30, ST2: 30, TE: 40 };
          representedWeight = entries.reduce((sum, entry) => sum + weight * shares[entry.exam] / 100, 0);
          contribution = entries.reduce((sum, entry) => sum + entry.score / entry.maximum * weight * shares[entry.exam] / 100, 0);
          percent = representedWeight ? contribution / representedWeight * 100 : null;
        }
      }
      points += contribution; available += representedWeight;
      result.components.push({ key: `${group.label || 'subject'}-${code}`, group: group.label, code,
        earned, possible, percent: percent === null ? null : round(percent), weight,
        weightedPoints: round(contribution), availableWeight: round(representedWeight),
        activityCount: entries.length, confirmedMissing: entries.filter(entry => entry.missing).length });
    }
    result.weightedPoints += points / groups.size;
    result.availableWeight += available / groups.size;
    if (available > 0) {
      const preview = getTransmutedGrade(round(points / available * 100), null, transmutationConfig);
      if (number(preview) === null || preview < 0 || preview > 100) {
        return { ...result, status: 'review', reasons: ['The configured transmutation table did not produce a valid preview.'] };
      }
      previews.push(preview);
    }
  }
  if (!previews.length || !result.availableWeight) return { ...result, reasons: ['No valid score in a component with a positive weight has been recorded.'] };
  result.progress = round(result.weightedPoints / result.availableWeight * 100);
  // Complete MAPEH keeps the existing average of its two separately converted grades.
  result.gradePreview = isMapeh ? Math.round(previews.reduce((sum, grade) => sum + grade, 0) / previews.length) : previews[0];
  result.weightedPoints = round(result.weightedPoints);
  result.availableWeight = round(result.availableWeight);
  result.status = 'available';
  result.riskLevel = academicBand(result.gradePreview);
  if (result.pendingActivities) result.reasons.push(`${result.pendingActivities} activity score(s) are unrecorded and excluded from this preview.`);
  if (isMapeh && previews.length < 2) result.reasons.push('Only one MAPEH component currently has recorded scores.');
  return result;
}

module.exports = { computeProgress, academicBand, examKey };
