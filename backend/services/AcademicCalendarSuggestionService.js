const CALENDAR_RULE = Object.freeze({
  version: 'three-term-calendar-v1',
  label: 'Calendar-based suggestion',
  summary: [
    'Term 1 starts on the first Monday of June and ends on the first Friday of September.',
    'Term 2 starts the following Monday and ends on the second Friday of December.',
    'Term 3 starts on the first Monday of January and ends on the last Friday of March.',
    'Submission deadlines are suggested seven days after each term ends.',
  ],
});

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const first = utcDate(year, monthIndex, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, monthIndex, 1 + offset + ((occurrence - 1) * 7));
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const last = utcDate(year, monthIndex + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, monthIndex, last.getUTCDate() - offset);
}

function toSqlDateTime(date, hours = 0, minutes = 0, seconds = 0) {
  const value = new Date(date);
  value.setUTCHours(hours, minutes, seconds, 0);
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function createSuggestedTerm({
  schoolYearId,
  termName,
  start,
  end,
}) {
  const deadline = addDays(end, 7);
  const reopeningClose = addDays(deadline, 7);

  return {
    school_year_id: schoolYearId,
    term_name: termName,
    starts_at: toSqlDateTime(start),
    ends_at: toSqlDateTime(end, 23, 59, 59),
    grade_submission_deadline_at: toSqlDateTime(deadline, 17),
    reopening_requests_open_at: toSqlDateTime(deadline, 17),
    reopening_requests_close_at: toSqlDateTime(reopeningClose, 23, 59, 59),
    status: 'upcoming',
    suggestion_rule_version: CALENDAR_RULE.version,
  };
}

function buildSuggestedTerms(startYear, schoolYearId = null) {
  const firstYear = Number(startYear);
  if (!Number.isInteger(firstYear)) {
    throw new TypeError('A valid school-year start year is required.');
  }

  const termOneStart = nthWeekdayOfMonth(firstYear, 5, 1, 1);
  const termOneEnd = nthWeekdayOfMonth(firstYear, 8, 5, 1);
  const termTwoStart = addDays(termOneEnd, 3);
  const termTwoEnd = nthWeekdayOfMonth(firstYear, 11, 5, 2);
  const termThreeStart = nthWeekdayOfMonth(firstYear + 1, 0, 1, 1);
  const termThreeEnd = lastWeekdayOfMonth(firstYear + 1, 2, 5);

  return [
    createSuggestedTerm({
      schoolYearId,
      termName: '1st',
      start: termOneStart,
      end: termOneEnd,
    }),
    createSuggestedTerm({
      schoolYearId,
      termName: '2nd',
      start: termTwoStart,
      end: termTwoEnd,
    }),
    createSuggestedTerm({
      schoolYearId,
      termName: '3rd',
      start: termThreeStart,
      end: termThreeEnd,
    }),
  ];
}

module.exports = {
  CALENDAR_RULE,
  buildSuggestedTerms,
};
