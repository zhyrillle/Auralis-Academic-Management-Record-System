const db = require('../config/db');

const User = {
  findAll: async () => {
    const [rows] = await db.query('SELECT user_id, school_id, role, first_name, last_name, email, pfp FROM USER');
    return rows;
  },

  findByEmail: async (email) => {
    const [rows] = await db.query('SELECT * FROM USER WHERE email = ?', [email]);
    return rows[0];
  },

  create: async (user) => {
    const { school_id, role, first_name, last_name, middle_name, email, password, pfp } = user;
    const [result] = await db.query(
      `INSERT INTO USER (school_id, role, first_name, last_name, middle_name, email, password, pfp) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [school_id, role, first_name, last_name, middle_name, email, password, pfp]
    );
    return result.insertId;
  }
};

module.exports = User;