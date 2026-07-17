const db = require('../config/db');

const School = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM SCHOOL');
    return rows;
  },

  findById: async (id) => {
    const [rows] = await db.query('SELECT * FROM SCHOOL WHERE school_id = ?', [id]);
    return rows[0];
  },

  create: async (school) => {
    const { school_name, school_code, region, division, street, city, province, country, postal_code } = school;
    const [result] = await db.query(
      `INSERT INTO SCHOOL (school_name, school_code, region, division, street, city, province, country, postal_code) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [school_name, school_code, region, division, street, city, province, country, postal_code]
    );
    return result.insertId;
  },

  update: async (id, school) => {
    const { school_name, school_code, region, division, street, city, province, country, postal_code } = school;
    await db.query(
      `UPDATE SCHOOL SET school_name = ?, school_code = ?, region = ?, division = ?, street = ?, city = ?, province = ?, country = ?, postal_code = ? 
       WHERE school_id = ?`,
      [school_name, school_code, region, division, street, city, province, country, postal_code, id]
    );
  },

  delete: async (id) => {
    await db.query('DELETE FROM SCHOOL WHERE school_id = ?', [id]);
  }
};

module.exports = School;