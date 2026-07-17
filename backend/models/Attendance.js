const db = require('../config/db');

const Attendance = {
  getRecord: async (studentSectionId) => {
    const [rows] = await db.query('SELECT * FROM ATTENDANCE WHERE student_section_id = ?', [studentSectionId]);
    return rows;
  },

  logAttendance: async (student_section_id, status) => {
    const [result] = await db.query(
      'INSERT INTO ATTENDANCE (student_section_id, status) VALUES (?, ?)',
      [student_section_id, status]
    );
    return result.insertId;
  }
};

module.exports = Attendance;