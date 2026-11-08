const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness() {
  const sheets = [];
  const attendance = [];
  let nextSheetId = 100;
  let nextAttId = 500;

  const mockDb = {
    execute: async (sql, params = []) => {
      // Find or create sheet queries
      if (sql.includes('FROM ATTENDANCE_SHEET') && sql.includes('teacher_assignment_id = ?') && sql.includes("attendance_scope = 'SUBJECT'")) {
        const [taId, d] = params;
        const found = sheets.filter(s => s.teacher_assignment_id === taId && s.attendance_date === d && s.attendance_scope === 'SUBJECT');
        return [found];
      }
      if (sql.includes('FROM ATTENDANCE_SHEET') && sql.includes('adviser_assignment_id = ?') && sql.includes("attendance_scope = 'SECTION'")) {
        const [saaId, d] = params;
        const found = sheets.filter(s => s.adviser_assignment_id === saaId && s.attendance_date === d && s.attendance_scope === 'SECTION');
        return [found];
      }
      if (sql.includes('INSERT INTO ATTENDANCE_SHEET (teacher_assignment_id, attendance_scope, attendance_date)')) {
        const [taId, d] = params;
        const id = nextSheetId++;
        sheets.push({ attendance_sheet_id: id, teacher_assignment_id: taId, adviser_assignment_id: null, attendance_scope: 'SUBJECT', attendance_date: d, no_class_reason: null });
        return [{ insertId: id }];
      }
      if (sql.includes('INSERT INTO ATTENDANCE_SHEET (adviser_assignment_id, attendance_scope, attendance_date)')) {
        const [saaId, d] = params;
        const id = nextSheetId++;
        sheets.push({ attendance_sheet_id: id, teacher_assignment_id: null, adviser_assignment_id: saaId, attendance_scope: 'SECTION', attendance_date: d, no_class_reason: null });
        return [{ insertId: id }];
      }

      // Query sheets by section
      if (sql.includes('FROM ATTENDANCE_SHEET ash') && sql.includes("ash.attendance_scope = 'SUBJECT'")) {
        const taId = params[1];
        const res = sheets.filter(s => s.attendance_scope === 'SUBJECT' && (!taId || s.teacher_assignment_id === taId));
        return [res];
      }
      if (sql.includes('FROM ATTENDANCE_SHEET ash') && sql.includes("ash.attendance_scope = 'SECTION'")) {
        const saaId = params[1];
        const res = sheets.filter(s => s.attendance_scope === 'SECTION' && (!saaId || s.adviser_assignment_id === saaId));
        return [res];
      }

      // Query attendance records by section
      if (sql.includes('FROM ATTENDANCE a') && sql.includes("ash.attendance_scope = 'SUBJECT'")) {
        const taId = params[1];
        const matchedSheetIds = new Set(sheets.filter(s => s.attendance_scope === 'SUBJECT' && (!taId || s.teacher_assignment_id === taId)).map(s => s.attendance_sheet_id));
        const res = attendance.filter(a => matchedSheetIds.has(a.attendance_sheet_id));
        return [res];
      }
      if (sql.includes('FROM ATTENDANCE a') && sql.includes("ash.attendance_scope = 'SECTION'")) {
        const saaId = params[1];
        const matchedSheetIds = new Set(sheets.filter(s => s.attendance_scope === 'SECTION' && (!saaId || s.adviser_assignment_id === saaId)).map(s => s.attendance_sheet_id));
        const res = attendance.filter(a => matchedSheetIds.has(a.attendance_sheet_id));
        return [res];
      }

      // Resolve student section id
      if (sql.includes('SELECT student_section_id FROM STUDENT_SECTION WHERE student_section_id = ?')) {
        return [[{ student_section_id: params[0] }]];
      }

      // Upsert attendance
      if (sql.includes('INSERT INTO ATTENDANCE') && sql.includes('ON DUPLICATE KEY UPDATE')) {
        const [sheetId, studentSecId, status, remarks] = params;
        const existing = attendance.find(a => a.attendance_sheet_id === sheetId && a.student_section_id === studentSecId);
        if (existing) {
          existing.status = status;
          existing.remarks = remarks;
          return [{ insertId: 0 }];
        } else {
          const id = nextAttId++;
          attendance.push({ attendance_id: id, attendance_sheet_id: sheetId, student_section_id: studentSecId, status, remarks });
          return [{ insertId: id }];
        }
      }

      if (sql.includes('SELECT attendance_id FROM ATTENDANCE WHERE attendance_sheet_id = ? AND student_section_id = ?')) {
        const [sheetId, studentSecId] = params;
        const found = attendance.filter(a => a.attendance_sheet_id === sheetId && a.student_section_id === studentSecId);
        return [found];
      }

      return [[]];
    },
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      execute: async (sql, params) => mockDb.execute(sql, params),
    }),
  };

  const loadModule = (filePath) => {
    const mod = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), {
      module: mod,
      exports: mod.exports,
      require: (dep) => {
        if (dep === '../config/db') return mockDb;
        if (dep === '../services/AttendanceDayService') return {
          withWritableSheet: async (sheetId, fn) => fn(await mockDb.getConnection()),
        };
        return require(dep);
      },
      console,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Error,
      isNaN,
    });
    return mod.exports;
  };

  const AttendanceSheet = loadModule(path.join(__dirname, '../models/AttendanceSheet.js'));
  const Attendance = loadModule(path.join(__dirname, '../models/Attendance.js'));

  return { sheets, attendance, AttendanceSheet, Attendance, mockDb };
}

test('Subject Teacher and Adviser attendance sheets remain separate for the same section and date', async () => {
  const { sheets, attendance, AttendanceSheet, Attendance } = createHarness();
  const date = '2026-11-07';
  const sectionId = 8; // Section Honesty

  // 1. Subject Teacher Harvey Babia (teacher_assignment_id: 39) opens Science attendance and marks student 101 Present
  const teacherSheetRes = await AttendanceSheet.findOrCreate({
    section_id: sectionId,
    teacher_assignment_id: 39,
    attendance_scope: 'SUBJECT',
    attendance_date: date,
    user_id: 3,
  });
  assert.equal(teacherSheetRes.created, true);
  const teacherSheetId = teacherSheetRes.attendance_sheet_id;

  await Attendance.upsert(teacherSheetId, 101, 'P', 'Teacher Babia: Present in Science');

  // 2. Adviser Angelo Binonggo (adviser_assignment_id: 46) opens Advisory attendance for Section Honesty and marks student 101 Absent
  const adviserSheetRes = await AttendanceSheet.findOrCreate({
    section_id: sectionId,
    adviser_assignment_id: 46,
    attendance_scope: 'SECTION',
    attendance_date: date,
    user_id: 42,
  });
  assert.equal(adviserSheetRes.created, true);
  const adviserSheetId = adviserSheetRes.attendance_sheet_id;

  // The two sheets MUST have different sheet IDs!
  assert.notEqual(teacherSheetId, adviserSheetId);

  await Attendance.upsert(adviserSheetId, 101, 'A', 'Adviser Binonggo: Absent whole day');

  // 3. Verify sheets list
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].attendance_scope, 'SUBJECT');
  assert.equal(sheets[0].teacher_assignment_id, 39);
  assert.equal(sheets[1].attendance_scope, 'SECTION');
  assert.equal(sheets[1].adviser_assignment_id, 46);

  // 4. Verify teacher records query does not see adviser records
  const teacherRecords = await Attendance.findBySectionId(sectionId, 1, {
    attendance_scope: 'SUBJECT',
    teacher_assignment_id: 39,
  });
  assert.equal(teacherRecords.length, 1);
  assert.equal(teacherRecords[0].status, 'P');
  assert.equal(teacherRecords[0].remarks, 'Teacher Babia: Present in Science');

  // 5. Verify adviser records query does not see teacher records
  const adviserRecords = await Attendance.findBySectionId(sectionId, 1, {
    attendance_scope: 'SECTION',
    adviser_assignment_id: 46,
  });
  assert.equal(adviserRecords.length, 1);
  assert.equal(adviserRecords[0].status, 'A');
  assert.equal(adviserRecords[0].remarks, 'Adviser Binonggo: Absent whole day');
});

test('Re-accessing an existing sheet finds the correct teacher or adviser sheet without recreating or crossing over', async () => {
  const { AttendanceSheet } = createHarness();
  const date = '2026-11-07';

  const t1 = await AttendanceSheet.findOrCreate({
    section_id: 8,
    teacher_assignment_id: 39,
    attendance_scope: 'SUBJECT',
    attendance_date: date,
    user_id: 3,
  });
  const a1 = await AttendanceSheet.findOrCreate({
    section_id: 8,
    adviser_assignment_id: 46,
    attendance_scope: 'SECTION',
    attendance_date: date,
    user_id: 42,
  });

  const t2 = await AttendanceSheet.findOrCreate({
    section_id: 8,
    teacher_assignment_id: 39,
    attendance_scope: 'SUBJECT',
    attendance_date: date,
    user_id: 3,
  });
  const a2 = await AttendanceSheet.findOrCreate({
    section_id: 8,
    adviser_assignment_id: 46,
    attendance_scope: 'SECTION',
    attendance_date: date,
    user_id: 42,
  });

  assert.equal(t2.created, false);
  assert.equal(t2.attendance_sheet_id, t1.attendance_sheet_id);

  assert.equal(a2.created, false);
  assert.equal(a2.attendance_sheet_id, a1.attendance_sheet_id);
});

