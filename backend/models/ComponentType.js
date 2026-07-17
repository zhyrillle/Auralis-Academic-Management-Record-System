const db = require('../config/db');

const ComponentType = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM COMPONENT_TYPE');
    return rows;
  },

  create: async (component) => {
    const { component_name, percentage } = component;
    const [result] = await db.query(
      'INSERT INTO COMPONENT_TYPE (component_name, percentage) VALUES (?, ?)',
      [component_name, percentage]
    );
    return result.insertId;
  }
};

module.exports = ComponentType;