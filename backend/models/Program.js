const db = require('../config/db');

class Program {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM PROGRAM ORDER BY is_specialized DESC, program_code ASC');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM PROGRAM WHERE program_id = ?', [id]);
    return rows[0];
  }
}

module.exports = Program;
