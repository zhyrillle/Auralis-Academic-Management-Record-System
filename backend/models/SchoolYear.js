const db = require('../config/db');

const SchoolYear = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM SCHOOL_YEAR');
    return rows;
  },

  create: async (schoolYear) => {
    const { start_year, end_year, term, curriculum } = schoolYear;
    const [result] = await db.query(
      'INSERT INTO SCHOOL_YEAR (start_year, end_year, term, curriculum) VALUES (?, ?, ?, ?)',
      [start_year, end_year, term, curriculum]
    );
    return result.insertId;
  }
};

module.exports = SchoolYear;