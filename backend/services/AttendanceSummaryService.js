const dateKey = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const excludedDates = sheets => new Set(sheets.filter(sheet => sheet.no_class_reason).map(sheet => dateKey(sheet.attendance_date)));

function monthlyNoClassCounts(sheets, startsOn, endsOn) {
  const startYear = Number(dateKey(startsOn).slice(0, 4));
  const endYear = Number(dateKey(endsOn).slice(0, 4));
  const counts = new Array(11).fill(0);
  for (const date of excludedDates(sheets)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const day = new Date(`${date}T00:00:00Z`);
    if ([0, 6].includes(day.getUTCDay())) continue;
    const month = day.getUTCMonth();
    const index = month >= 5 ? month - 5 : month <= 3 ? month + 7 : -1;
    if (index < 0 || day.getUTCFullYear() !== (month >= 5 ? startYear : endYear)) continue;
    counts[index]++;
  }
  return counts;
}

module.exports = { dateKey, excludedDates, monthlyNoClassCounts };
