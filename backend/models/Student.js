const db = require('../config/db');

const Student = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM STUDENT');
    return rows;
  },

  findByLrn: async (lrn) => {
    const [rows] = await db.query('SELECT * FROM STUDENT WHERE LRN = ?', [lrn]);
    return rows[0];
  },

  create: async (student) => {
    const { LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code } = student;
    const [result] = await db.query(
      `INSERT INTO STUDENT (LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code]
    );
    return result.insertId;
  },

  update: async (id, student) => {
    const { first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code } = student;
    await db.query(
      `UPDATE STUDENT SET first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, birthdate = ?, sex = ?, street = ?, barangay = ?, city = ?, province = ?, country = ?, postal_code = ? 
       WHERE student_id = ?`,
      [first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, id]
    );
  }
};

module.exports = Student;