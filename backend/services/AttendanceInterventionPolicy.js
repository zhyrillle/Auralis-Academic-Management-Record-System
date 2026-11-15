// Read-only reference supplied by the school's Progressive Corrective Action
// and Intervention Matrix. No actions, assignments, or case records are created.
const DISCLAIMER = 'Numerical thresholds serve only as monitoring and intervention guides. They do not constitute an automatic or mechanical basis for suspension or any disciplinary sanction. Any measure requires case-by-case assessment, due process, and applicable DepEd rules.';

const TIERS = [
  {
    tier: 1, minimum: 1, maximum: 3, range: '1–3 occurrences',
    guidance: 'Adviser verbal reminder or warning, attendance record documentation, and discussion with the learner.',
  },
  {
    tier: 2, minimum: 4, maximum: 4, range: '4 occurrences',
    guidance: 'LFO written notice or reprimand, an anecdotal record, a learner conference, and identification of barriers to regular attendance.',
  },
  {
    tier: 3, minimum: 5, maximum: 5, range: '5 occurrences',
    guidance: 'Parent/guardian conference facilitated by the Guidance Designate and LFO, and a learner support/intervention plan. The matrix includes a potential 1-day suspension only when legally and procedurally warranted, subject to due process and applicable DepEd rules.',
  },
  {
    tier: 4, minimum: 6, maximum: 7, range: '6–7 occurrences',
    guidance: 'Parent/guardian conference and review or revision of the intervention plan. The matrix includes a potential suspension of up to 2 days only when legally and procedurally warranted, subject to due process and applicable DepEd rules.',
  },
  {
    tier: 5, minimum: 8, maximum: 10, range: '8–10 occurrences',
    guidance: 'Parent/guardian conference, strengthened learner support, and intensified attendance monitoring. The matrix includes a potential suspension of up to 3 days only when legally and procedurally warranted, subject to due process and applicable DepEd rules.',
  },
  {
    tier: 6, minimum: 11, maximum: null, range: '11+ occurrences',
    guidance: 'Formal parent/guardian conference, case assessment, an intervention plan, and continued monitoring by multiple appropriate school personnel. The matrix includes a potential suspension of up to 5 days only when legally and procedurally warranted, subject to due process and applicable DepEd rules.',
  },
];

function tierForOccurrences(occurrences) {
  if (!Number.isSafeInteger(occurrences) || occurrences < 0) throw new TypeError('Attendance occurrences must be a non-negative whole number.');
  return TIERS.find(tier => occurrences >= tier.minimum && (tier.maximum == null || occurrences <= tier.maximum))?.tier ?? null;
}

module.exports = { DISCLAIMER, TIERS, tierForOccurrences };
