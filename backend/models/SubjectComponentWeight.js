const db = require('../config/db');
const AuditDetails = require('../services/AuditDetailsService');

async function logWeights(connection, schoolYearId, before, after, actor, inheritedFrom = null) {
  const [years] = await connection.execute('SELECT school_year_id, starts_on, ends_on FROM SCHOOL_YEAR WHERE school_year_id IN (?, ?)', [schoolYearId, inheritedFrom || schoolYearId]);
  const schoolYear = AuditDetails.yearLabel(years.find(row => Number(row.school_year_id) === Number(schoolYearId)));
  await AuditDetails.record(connection, { actor, before: AuditDetails.weightSnapshot(before), after: AuditDetails.weightSnapshot(after),
    actor_context: actor ? { acting_as: 'System Administrator' } : {},
    event_type: inheritedFrom ? 'SUBJECT_WEIGHTS_INHERITED' : 'SUBJECT_WEIGHTS_UPDATED', module_name: 'WS_CONFIGURATION',
    entity_type: 'SUBJECT_COMPONENT_WEIGHT', entity_id: schoolYearId, metadata: {
      target: schoolYear ? `Subject weights · ${schoolYear}` : 'Subject weights', school_year: schoolYear,
      inherited_from: inheritedFrom ? AuditDetails.yearLabel(years.find(row => Number(row.school_year_id) === Number(inheritedFrom))) : null,
      summary: inheritedFrom ? 'Inherited subject component weights from the previous school year.' : 'Updated subject component weights.' } });
}

class SubjectComponentWeight {
  static async findConfiguration(schoolYearId, executor = db) {
    const [rows] = await executor.execute(
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
       ORDER BY s.subject_name, ct.component_type_id`,
      [schoolYearId]
    );
    return rows;
  }

  static async inheritFromPreviousSchoolYear(schoolYearId, actor = null) {
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

      const before = await this.findConfiguration(schoolYearId, connection);
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

      await logWeights(connection, schoolYearId, before, await this.findConfiguration(schoolYearId, connection), actor, sourceSchoolYearId);
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

  static async saveConfiguration(schoolYearId, weights, actor = null) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute('SELECT school_year_id FROM SCHOOL_YEAR WHERE school_year_id = ? FOR UPDATE', [schoolYearId]);
      const before = await this.findConfiguration(schoolYearId, connection);
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

      await logWeights(connection, schoolYearId, before, await this.findConfiguration(schoolYearId, connection), actor);
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

  static async mutateRecord(id, data, actor = null, remove = false) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [old] = id ? await connection.execute('SELECT * FROM SUBJECT_COMPONENT_WEIGHT WHERE subj_comp_weight_id = ? FOR UPDATE', [id]) : [[]];
      if (id && !old[0]) { await connection.commit(); return remove ? false : null; }
      const years = [...new Set([old[0]?.school_year_id, data?.school_year_id].filter(Boolean).map(Number))];
      const snapshots = new Map();
      for (const year of years.sort((a, b) => a - b)) {
        await connection.execute('SELECT school_year_id FROM SCHOOL_YEAR WHERE school_year_id = ? FOR UPDATE', [year]);
        snapshots.set(year, await this.findConfiguration(year, connection));
      }
      let resultId = id;
      if (remove) await connection.execute('DELETE FROM SUBJECT_COMPONENT_WEIGHT WHERE subj_comp_weight_id = ?', [id]);
      else if (id) {
        const keys = Object.keys(data).filter(key => ['subject_id', 'component_type_id', 'school_year_id', 'percentage'].includes(key));
        if (keys.length) await connection.execute(`UPDATE SUBJECT_COMPONENT_WEIGHT SET ${keys.map(key => `${key} = ?`).join(', ')} WHERE subj_comp_weight_id = ?`, [...keys.map(key => data[key]), id]);
      } else {
        const [result] = await connection.execute('INSERT INTO SUBJECT_COMPONENT_WEIGHT (subject_id, component_type_id, school_year_id, percentage) VALUES (?, ?, ?, ?)',
          [data.subject_id, data.component_type_id, data.school_year_id, data.percentage]);
        resultId = result.insertId;
      }
      for (const year of years) await logWeights(connection, year, snapshots.get(year), await this.findConfiguration(year, connection), actor);
      const [rows] = remove ? [[]] : await connection.execute('SELECT * FROM SUBJECT_COMPONENT_WEIGHT WHERE subj_comp_weight_id = ?', [resultId]);
      await connection.commit();
      return remove ? true : id ? rows[0] : resultId;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  static async create(data, actor = null) { return this.mutateRecord(null, data, actor); }
  static async update(id, data, actor = null) { return this.mutateRecord(id, data, actor); }
  static async delete(id, actor = null) { return this.mutateRecord(id, null, actor, true); }

}

module.exports = SubjectComponentWeight;
