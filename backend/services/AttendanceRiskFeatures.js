// Model attendance is not the SF9 late-to-absence conversion. Only recorded A
// contributes an absent day; P and L are attended days. Never infer a blank.
const NO_CLASS_REASONS = new Set(['HOLIDAY', 'SUSPENSION']);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sourceWeekdays({ sourceStart, sourceEnd, targetStart }) {
  if (![sourceStart, sourceEnd, targetStart].every(validDate)
    || sourceStart > sourceEnd || sourceEnd >= targetStart) return null;
  const start = Date.parse(`${sourceStart}T00:00:00Z`);
  const end = Date.parse(`${sourceEnd}T00:00:00Z`);
  if ((end - start) / 86400000 > 366) return null;
  const days = [];
  for (let time = start; time <= end; time += 86400000) {
    const day = new Date(time);
    if (![0, 6].includes(day.getUTCDay())) days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

function attendanceFeatures(learner, sheets, records, period) {
  const summary = { sourceStart: period.sourceStart, sourceEnd: period.sourceEnd,
    classDays: 0, recordedDays: 0, absentDays: 0, lateDays: 0, excludedDays: 0, missingDays: 0 };
  const unavailable = reason => ({ absenceRate: null, status: 'unavailable', reason, summary });
  const weekdays = sourceWeekdays(period);
  if (!weekdays || !weekdays.length) return unavailable('Attendance period boundaries need review.');
  const matchesSection = row => String(row.section_id) === String(learner.sectionId)
    && String(row.school_year_id) === String(learner.schoolYearId);
  const daySheets = new Map();
  const sheetDates = new Map();
  for (const sheet of sheets.filter(matchesSection)) {
    const date = sheet.attendance_date;
    if (!validDate(date)) return unavailable('Attendance dates need review.');
    if (date < period.sourceStart || date > period.sourceEnd) continue;
    if (!daySheets.has(date)) daySheets.set(date, []);
    daySheets.get(date).push(sheet);
    sheetDates.set(String(sheet.attendance_sheet_id), date);
    if (sheet.no_class_reason != null && !NO_CLASS_REASONS.has(sheet.no_class_reason)) {
      return unavailable('An attendance day marker needs review.');
    }
  }
  const noClassDates = new Set([...daySheets].filter(([, rows]) => rows.some(row => NO_CLASS_REASONS.has(row.no_class_reason)))
    .map(([date]) => date));
  const classDates = weekdays.filter(date => !noClassDates.has(date));
  summary.classDays = classDates.length;
  summary.excludedDays = weekdays.length - classDates.length;
  if (!classDates.length) return unavailable('No class days are available for this attendance period.');

  const ownByDate = new Map();
  const weekdaySet = new Set(weekdays);
  for (const record of records) {
    if (!matchesSection(record)) continue;
    const date = sheetDates.get(String(record.attendance_sheet_id));
    if (!date || noClassDates.has(date)) continue;
    // The current attendance UI has a Monday-Friday calendar. Do not silently
    // discard weekend classes or claim that their schedule has been verified.
    if (!weekdaySet.has(date)) return unavailable('Weekend class attendance requires a verified school calendar.');
    if (String(record.student_section_id) !== String(learner.studentSectionId)) continue;
    if (!ownByDate.has(date)) ownByDate.set(date, []);
    ownByDate.get(date).push(record.status);
  }
  let invalid = false, conflicting = false;
  for (const date of classDates) {
    const statuses = ownByDate.get(date) || [];
    if (!statuses.length) { summary.missingDays++; continue; }
    if (statuses.some(status => !['P', 'A', 'L'].includes(status))) {
      invalid = true; summary.missingDays++; continue;
    }
    const distinct = new Set(statuses);
    if (distinct.size !== 1) { conflicting = true; summary.missingDays++; continue; }
    summary.recordedDays++;
    if (statuses[0] === 'A') summary.absentDays++;
    if (statuses[0] === 'L') summary.lateDays++;
  }
  if (invalid) return unavailable('Some attendance entries are invalid or blank.');
  if (conflicting) return unavailable('Conflicting attendance entries for the same day need review.');
  if (summary.missingDays) return unavailable(`Attendance is incomplete for ${summary.missingDays} weekday${summary.missingDays === 1 ? '' : 's'} in the source term.`);
  return { absenceRate: summary.absentDays / summary.classDays, status: 'available', reason: null, summary };
}

async function loadAttendanceInputs(db, learners, period) {
  const result = new Map();
  if (!learners.length) return result;
  const yearId = learners[0].schoolYearId;
  if (learners.some(row => String(row.schoolYearId) !== String(yearId))) throw new Error('Attendance batch must use one school year.');
  const sections = [...new Set(learners.map(row => row.sectionId))];
  const placeholders = sections.map(() => '?').join(',');
  let sheets = [], records = [];
  if (sourceWeekdays(period)?.length) {
    const params = [yearId, period.sourceStart, period.sourceEnd, ...sections];
    // Read the adviser's SECTION attendance, not subject attendance. Dates are
    // DATE values, so return date strings rather than shifting them by timezone.
    [sheets] = await db.execute(`SELECT ash.attendance_sheet_id,
      DATE_FORMAT(ash.attendance_date, '%Y-%m-%d') AS attendance_date, ash.no_class_reason,
      saa.section_id, saa.school_year_id
      FROM ATTENDANCE_SHEET ash
      JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      WHERE saa.school_year_id = ? AND ash.attendance_scope = 'SECTION'
        AND ash.attendance_date BETWEEN ? AND ? AND saa.section_id IN (${placeholders})`, params);
    [records] = await db.execute(`SELECT a.attendance_id, a.attendance_sheet_id,
      a.student_section_id, a.status, ss.section_id, ss.school_year_id
      FROM ATTENDANCE a
      JOIN ATTENDANCE_SHEET ash ON ash.attendance_sheet_id = a.attendance_sheet_id
      JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      JOIN STUDENT_SECTION ss ON ss.student_section_id = a.student_section_id
        AND ss.section_id = saa.section_id AND ss.school_year_id = saa.school_year_id
      WHERE saa.school_year_id = ? AND ash.attendance_scope = 'SECTION'
        AND ash.attendance_date BETWEEN ? AND ? AND saa.section_id IN (${placeholders})`, params);
  }
  // Partition once; no per-learner database requests or repeated whole-school scans.
  const bySection = rows => {
    const groups = new Map();
    for (const row of rows) {
      const key = String(row.section_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return groups;
  };
  const sheetGroups = bySection(sheets), recordGroups = bySection(records);
  for (const learner of learners) result.set(String(learner.studentSectionId), attendanceFeatures(learner,
    sheetGroups.get(String(learner.sectionId)) || [], recordGroups.get(String(learner.sectionId)) || [], period));
  return result;
}

module.exports = { attendanceFeatures, loadAttendanceInputs, sourceWeekdays };
