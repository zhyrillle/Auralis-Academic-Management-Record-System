const db = require('../config/db');

class SubjectComponentWeight {
  static async findConfiguration(schoolYearId) {
    const [rows] = await db.execute(
      `SELECT
         s.subject_id,
         s.subject_name,
         s.subject_code,
         ct.component_type_id,
         ct.component_code,
         ct.component_name,
         scw.subj_comp_weight_id,
         scw.percentage
       FROM SUBJECT AS s
       CROSS JOIN COMPONENT_TYPE AS ct
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT AS scw
         ON scw.subject_id = s.subject_id
        AND scw.component_type_id = ct.component_type_id
        AND scw.school_year_id = ?
       WHERE s.status = 'ACTIVE'
          OR EXISTS (
            SELECT 1
            FROM SUBJECT_COMPONENT_WEIGHT AS historical_scw
            WHERE historical_scw.subject_id = s.subject_id
              AND historical_scw.school_year_id = ?
          )
       ORDER BY s.subject_name, ct.component_type_id`,
      [schoolYearId, schoolYearId]
    );
    return rows;
  }

  static async inheritFromPreviousSchoolYear(schoolYearId) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [targetRows] = await connection.execute(
        `SELECT school_year_id, starts_on, status
         FROM SCHOOL_YEAR
         WHERE school_year_id = ?
         FOR UPDATE`,
        [schoolYearId]
      );

      if (targetRows.length === 0) {
        const notFoundError = new Error('School year not found.');
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const targetSchoolYear = targetRows[0];
      if (String(targetSchoolYear.status).toLowerCase() !== 'ongoing') {
        const statusError = new Error(
          'Weights can only be inherited into the ongoing school year.'
        );
        statusError.statusCode = 409;
        throw statusError;
      }

      const [previousRows] = await connection.execute(
        `SELECT sy.school_year_id
         FROM SCHOOL_YEAR AS sy
         WHERE sy.starts_on < ?
           AND EXISTS (
             SELECT 1
             FROM SUBJECT_COMPONENT_WEIGHT AS scw
             WHERE scw.school_year_id = sy.school_year_id
           )
         ORDER BY sy.starts_on DESC, sy.school_year_id DESC
         LIMIT 1`,
        [targetSchoolYear.starts_on]
      );

      if (previousRows.length === 0) {
        await connection.commit();
        return { inherited_from_school_year_id: null, inserted_count: 0 };
      }

      const sourceSchoolYearId = previousRows[0].school_year_id;
      const [duplicateRows] = await connection.execute(
        `SELECT subject_id, component_type_id, COUNT(*) AS duplicate_count
         FROM SUBJECT_COMPONENT_WEIGHT
         WHERE school_year_id = ?
         GROUP BY subject_id, component_type_id
         HAVING COUNT(*) > 1
         LIMIT 1`,
        [sourceSchoolYearId]
      );

      if (duplicateRows.length > 0) {
        const duplicateError = new Error(
          'The previous school year contains duplicate component-weight records.'
        );
        duplicateError.statusCode = 409;
        throw duplicateError;
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO SUBJECT_COMPONENT_WEIGHT (
           subject_id,
           component_type_id,
           school_year_id,
           percentage
         )
         SELECT
           source_scw.subject_id,
           source_scw.component_type_id,
           ?,
           source_scw.percentage
         FROM SUBJECT_COMPONENT_WEIGHT AS source_scw
         JOIN SUBJECT AS s
           ON s.subject_id = source_scw.subject_id
          AND s.status = 'ACTIVE'
         WHERE source_scw.school_year_id = ?
           AND NOT EXISTS (
             SELECT 1
             FROM SUBJECT_COMPONENT_WEIGHT AS target_scw
             WHERE target_scw.subject_id = source_scw.subject_id
               AND target_scw.component_type_id = source_scw.component_type_id
               AND target_scw.school_year_id = ?
           )`,
        [schoolYearId, sourceSchoolYearId, schoolYearId]
      );

      await connection.commit();
      return {
        inherited_from_school_year_id: Number(sourceSchoolYearId),
        inserted_count: insertResult.affectedRows,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async saveConfiguration(schoolYearId, weights) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      for (const weight of weights) {
        const [existingRows] = await connection.execute(
          `SELECT subj_comp_weight_id
           FROM SUBJECT_COMPONENT_WEIGHT
           WHERE subject_id = ?
             AND component_type_id = ?
             AND school_year_id = ?
           FOR UPDATE`,
          [weight.subject_id, weight.component_type_id, schoolYearId]
        );

        if (existingRows.length > 1) {
          const duplicateError = new Error(
            'Duplicate component-weight records exist for a subject and school year.'
          );
          duplicateError.statusCode = 409;
          throw duplicateError;
        }

        if (existingRows.length === 1) {
          await connection.execute(
            `UPDATE SUBJECT_COMPONENT_WEIGHT
             SET percentage = ?
             WHERE subj_comp_weight_id = ?`,
            [weight.percentage, existingRows[0].subj_comp_weight_id]
          );
        } else {
          await connection.execute(
            `INSERT INTO SUBJECT_COMPONENT_WEIGHT (
               subject_id,
               component_type_id,
               school_year_id,
               percentage
             ) VALUES (?, ?, ?, ?)`,
            [
              weight.subject_id,
              weight.component_type_id,
              schoolYearId,
              weight.percentage,
            ]
          );
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.findConfiguration(schoolYearId);
  }

  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SUBJECT_COMPONENT_WEIGHT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SUBJECT_COMPONENT_WEIGHT WHERE subj_comp_weight_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { subject_id, component_type_id, school_year_id, percentage } = data;
    const [result] = await db.execute(
      `INSERT INTO SUBJECT_COMPONENT_WEIGHT (subject_id, component_type_id, school_year_id, percentage) 
       VALUES (?, ?, ?, ?)`,
      [subject_id, component_type_id, school_year_id, percentage]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SUBJECT_COMPONENT_WEIGHT SET ${setClause} WHERE subj_comp_weight_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SUBJECT_COMPONENT_WEIGHT WHERE subj_comp_weight_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = SubjectComponentWeight;
