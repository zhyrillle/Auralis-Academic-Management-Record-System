const { getOptions, dateInManila } = require('./StudentMonitoringService');
const { DISCLAIMER, TIERS, tierForOccurrences } = require('./AttendanceInterventionPolicy');

const VERSION = 'attendance-monitoring-v5';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const addDays = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
const dayAfter = date => addDays(date, 1);
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const NO_CLASSES = new Set(['HOLIDAY', 'SUSPENSION']);

function scheduledDays(terms) {
  const sorted = [...terms].sort((a, b) => String(a.startsOn).localeCompare(String(b.startsOn)));
  if (sorted.length !== 3 || new Set(sorted.map(term => term.value)).size !== 3
    || !['T1', 'T2', 'T3'].every(code => sorted.some(term => term.value === code))) {
    throw fail('The school-year calendar needs review: configure three unique terms.', 409);
  }
  const dates = [];
  let previousEnd = '';
  for (const term of sorted) {
    if (!validDate(term.startsOn) || !validDate(term.endsOn) || term.startsOn > term.endsOn
      || term.startsOn < previousEnd || Date.parse(term.endsOn) - Date.parse(sorted[0].startsOn) > 400 * 86400000) {
      throw fail('The school-year calendar needs review: check term dates and overlaps.', 409);
    }
    for (let date = term.startsOn; date <= term.endsOn; date = dayAfter(date)) {
      if (![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) dates.push(date);
    }
    previousEnd = term.endsOn;
  }
  if (!dates.length) throw fail('No scheduled school days are configured for this school year.', 409);
  // Adjacent terms can meet on the same calendar date. It is one school day,
  // regardless of which term owns the precise handoff time.
  return [...new Set(dates)];
}

function groupMarks(records) {
  const marks = new Map();
  for (const record of records) {
    if (!marks.has(record.date)) marks.set(record.date, []);
    marks.get(record.date).push(record.status);
  }
  return marks;
}

function resolveMark(entries) {
  const status = entries[0];
  return ['P', 'A', 'L'].includes(status) && entries.every(value => value === status) ? status : null;
}

function summarizeLearner(learner, dates, exclusions, records, asOf) {
  const calendar = dates.filter(date => !exclusions.has(date));
  const elapsed = calendar.filter(date => date <= asOf);
  const marks = groupMarks(records);
  const missingDates = [], conflictingDates = [], incidents = [], months = new Map();
  let absent = 0, late = 0, present = 0, run = [], lastResolved = false;
  const finishRun = () => {
    if (run.length >= 3) incidents.push({ startsOn: run[0], endsOn: run.at(-1), days: run.length, dates: [...run] });
    run = [];
  };
  for (const date of elapsed) {
    const month = date.slice(0, 7);
    if (!months.has(month)) months.set(month, { month, expectedDays: 0, recordedDays: 0, absent: 0, late: 0, present: 0, absenceDates: [], lateDates: [] });
    const monthly = months.get(month);
    monthly.expectedDays++;
    const entries = marks.get(date) || [];
    const status = resolveMark(entries);
    if (!status) {
      (entries.length ? conflictingDates : missingDates).push(date);
      lastResolved = false;
      finishRun();
      continue;
    }
    lastResolved = true;
    monthly.recordedDays++;
    if (status === 'A') { absent++; monthly.absent++; monthly.absenceDates.push(date); run.push(date); }
    else {
      finishRun();
      if (status === 'L') { late++; monthly.late++; monthly.lateDates.push(date); }
      else { present++; monthly.present++; }
    }
  }
  const currentStreak = lastResolved ? run.length : null;
  finishRun();
  const longestStreak = Math.max(0, ...incidents.map(incident => incident.days), currentStreak || 0);
  // Include shorter historical streaks in the longest figure as well.
  let shortRun = 0, maximum = longestStreak;
  for (const date of elapsed) {
    const entries = marks.get(date) || [];
    shortRun = entries.length && entries.every(status => status === 'A') ? shortRun + 1 : 0;
    maximum = Math.max(maximum, shortRun);
  }
  const monthly = [...months.values()].map(row => ({ ...row, occurrences: row.absent }));
  const occurrences = absent;
  const interventionTier = !learner.reviewReason && calendar.length ? tierForOccurrences(occurrences) : null;
  const reasons = [];
  const incomplete = missingDates.length > 0 || conflictingDates.length > 0 || Boolean(learner.reviewReason) || calendar.length === 0;
  if (!calendar.length) reasons.push('No calculated school-year class days remain after exclusions. Review the calendar.');
  if (learner.reviewReason) reasons.push(learner.reviewReason);
  const level = learner.reviewReason || !calendar.length ? 'unavailable' : interventionTier ? `tier${interventionTier}` : elapsed.length ? 'none' : 'upcoming';
  return { ...learner, absent, late, present, occurrences, interventionTier,
    expectedDays: elapsed.length, recordedDays: absent + late + present, schoolYearDays: calendar.length,
    currentStreak, longestStreak: maximum, incidents, monthly, missingDates, conflictingDates,
    incomplete, level, reasons };
}

function publicLearner(student) {
  const { id, studentId, name, sectionId, section, grade, adviser, absent, late, present, occurrences, interventionTier, level, longestStreak } = student;
  return { id, studentId, name, sectionId, section, grade, adviser, absent, late, present, occurrences, interventionTier, level, longestStreak,
    monthly: student.monthly.map(({ month, absent, late, present, occurrences, absenceDates, lateDates }) =>
      ({ month, absent, late, present, occurrences, absenceDates, lateDates })) };
}

async function options(database, now = new Date()) {
  const source = await getOptions(database, now);
  return { version: VERSION, schoolYears: source.schoolYears, defaultSchoolYear: source.defaultSchoolYear, today: source.today };
}

async function getYearCalendar(database, schoolYear, now) {
  const available = await options(database, now);
  const year = available.schoolYears.find(row => row.value === String(schoolYear));
  if (!year) throw fail('Choose a configured school year.');
  const dates = scheduledDays(year.terms);
  return { year, dates, today: available.today };
}

async function loadLearners(database, schoolYearId) {
  const params = [Number(schoolYearId)];
  const [[roster], [sheets], [records]] = await Promise.all([
    database.execute(`SELECT ss.student_section_id, ss.student_id, ss.section_id, sec.section_name, gl.grade_level_name,
      CONCAT_WS(', ', st.last_name, CONCAT_WS(' ', st.first_name, st.middle_name)) AS name,
      (SELECT CONCAT_WS(' ', u.first_name, u.last_name) FROM SECTION_ADVISER_ASSIGNMENT saa
        JOIN USER u ON u.user_id = saa.user_id WHERE saa.section_id = ss.section_id AND saa.school_year_id = ss.school_year_id
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1) AS adviser
      FROM STUDENT_SECTION ss JOIN STUDENT st ON st.student_id = ss.student_id
      JOIN SECTION sec ON sec.section_id = ss.section_id JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      WHERE ss.school_year_id = ? ORDER BY st.last_name, st.first_name, ss.student_section_id`, params),
    database.execute(`SELECT ash.attendance_sheet_id, saa.section_id, ash.no_class_reason,
      DATE_FORMAT(ash.attendance_date, '%Y-%m-%d') AS date
      FROM ATTENDANCE_SHEET ash JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      WHERE saa.school_year_id = ? AND ash.attendance_scope = 'SECTION'`, params),
    database.execute(`SELECT a.student_section_id, a.status, saa.section_id,
      DATE_FORMAT(ash.attendance_date, '%Y-%m-%d') AS date
      FROM ATTENDANCE a JOIN ATTENDANCE_SHEET ash ON ash.attendance_sheet_id = a.attendance_sheet_id
      JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      JOIN STUDENT_SECTION ss ON ss.student_section_id = a.student_section_id
        AND ss.school_year_id = saa.school_year_id AND ss.section_id = saa.section_id
      WHERE saa.school_year_id = ? AND ash.attendance_scope = 'SECTION'`, params),
  ]);
  const exclusions = new Map(), byEnrollment = new Map(), byStudent = new Map();
  for (const sheet of sheets) {
    if (!exclusions.has(Number(sheet.section_id))) exclusions.set(Number(sheet.section_id), new Set());
    if (NO_CLASSES.has(sheet.no_class_reason)) exclusions.get(Number(sheet.section_id)).add(sheet.date);
  }
  for (const record of records) {
    if (!byEnrollment.has(Number(record.student_section_id))) byEnrollment.set(Number(record.student_section_id), []);
    byEnrollment.get(Number(record.student_section_id)).push(record);
  }
  for (const row of roster) {
    if (!byStudent.has(Number(row.student_id))) byStudent.set(Number(row.student_id), []);
    byStudent.get(Number(row.student_id)).push(row);
  }
  return [...byStudent.values()].map(rows => {
    const row = rows[0];
    const learner = { id: String(row.student_section_id), studentId: Number(row.student_id), name: row.name,
      sectionId: Number(row.section_id), section: row.section_name, grade: Number(String(row.grade_level_name).match(/\d+/)?.[0]),
      adviser: row.adviser || 'Not assigned', reviewReason: rows.length > 1 ? 'Multiple section enrollments need review.' : null };
    return { learner, exclusions: exclusions.get(learner.sectionId) || new Set(),
      records: rows.length > 1 ? [] : byEnrollment.get(Number(row.student_section_id)) || [] };
  });
}

async function preview(database, query, now = new Date(), { includeDiagnostics = false } = {}) {
  const { year, dates, today } = await getYearCalendar(database, query.schoolYear, now);
  const asOf = today < dates.at(-1) ? today : dates.at(-1);
  const students = (await loadLearners(database, year.value)).map(({ learner, exclusions, records }) =>
    summarizeLearner(learner, dates, exclusions, records, asOf));
  return { version: VERSION, context: { schoolYearId: Number(year.value), schoolYear: year.label, asOf,
    startsOn: dates[0], endsOn: dates.at(-1), hasStarted: dates[0] <= asOf },
  policy: { scope: 'SECTION', occurrenceBasis: 'absent', tiers: TIERS, disclaimer: DISCLAIMER,
    calendarBasis: 'Recorded adviser attendance on configured term weekdays, excluding saved holidays and suspensions.' },
  summary: { total: students.length, tiers: Object.fromEntries(TIERS.map(tier => [tier.tier, students.filter(row => row.interventionTier === tier.tier).length])) },
  students: students.map(publicLearner),
  // This switch is available to local developer scripts only; HTTP query
  // parameters are never forwarded here as service options.
  ...(includeDiagnostics ? { diagnostics: students.map(({ id, name, section, incomplete, missingDates, conflictingDates, expectedDays, recordedDays, reviewReason, currentStreak, longestStreak, incidents, reasons }) =>
    ({ id, name, section, incomplete, missingDates, conflictingDates, expectedDays, recordedDays, reviewReason, currentStreak, longestStreak, incidents, reasons })) } : {}) };
}

function mondayOf(date) {
  const day = new Date(date).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

async function weekly(database, query, now = new Date()) {
  const { year, dates, today } = await getYearCalendar(database, query.schoolYear, now);
  const currentMonday = mondayOf(today);
  const weeksByMonday = new Map();
  const weekByDate = new Map();
  for (const date of dates) {
    if (date > today) break;
    const startsOn = mondayOf(date);
    weekByDate.set(date, startsOn);
    if (!weeksByMonday.has(startsOn)) {
      weeksByMonday.set(startsOn, { startsOn, endsOn: addDays(startsOn, 4), isCurrent: startsOn === currentMonday });
    }
    weeksByMonday.get(startsOn).through = date;
  }
  const weeks = [...weeksByMonday.values()].reverse();
  const defaultWeek = weeks.find(week => week.endsOn < today) || weeks[0];
  const scopedLearners = weeks.length ? await loadLearners(database, year.value) : [];
  const students = scopedLearners.map(({ learner, exclusions, records }) => {
    const { reviewReason, ...profile } = learner;
    const attendanceByWeek = {};
    const marks = groupMarks(records);
    for (const [date, monday] of weekByDate) {
      const entries = marks.get(date);
      if (!entries || exclusions.has(date)) continue;
      const status = resolveMark(entries);
      if (status) {
        const week = attendanceByWeek[monday] ??= { absenceDates: [], lateDates: [] };
        if (status === 'A') week.absenceDates.push(date);
        if (status === 'L') week.lateDates.push(date);
      } else if (!Object.hasOwn(attendanceByWeek, monday)) {
        // A missing key means no marks. Null means the saved marks could not be counted.
        attendanceByWeek[monday] = null;
      }
    }
    return { ...profile, unavailable: Boolean(reviewReason), attendanceByWeek };
  });
  return { schoolYear: year.label, weeks, defaultWeek: defaultWeek?.startsOn || '', students };
}

module.exports = { VERSION, options, preview, weekly, scheduledDays, summarizeLearner, dateInManila };
