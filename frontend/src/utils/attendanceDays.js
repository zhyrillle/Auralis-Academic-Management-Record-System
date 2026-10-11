export const NO_CLASS_LABELS = { HOLIDAY: 'Holiday', SUSPENSION: 'Classes suspended' };

export function noClassDaysFromSheets(sheets) {
  const days = {};
  for (const sheet of sheets) {
    const date = String(sheet.attendance_date || '').slice(0, 10);
    if (NO_CLASS_LABELS[sheet.no_class_reason]) days[date] = sheet.no_class_reason;
  }
  return days;
}

export function classDaysForMonth(schoolDays, noClassDays) {
  return schoolDays.filter(day => !noClassDays[day.dateStr]);
}
