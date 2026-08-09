const db = require('../config/db');

class Student {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM STUDENT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM STUDENT WHERE student_id = ?', [id]);
    return rows[0];
  }

  static async findByLRN(lrn) {
    const [rows] = await db.execute('SELECT * FROM STUDENT WHERE LRN = ?', [lrn]);
    return rows[0];
  }

  static async create(data) {
    const { LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status } = data;
    const [result] = await db.execute(
      `INSERT INTO STUDENT (LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status || 'ACTIVE']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE STUDENT SET ${setClause} WHERE student_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM STUDENT WHERE student_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Student;