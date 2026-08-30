const db = require("../config/db");

class GradeActivity {
  static async findAll() {
    const [rows] = await db.execute("SELECT * FROM GRADE_ACTIVITY");
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute(
      "SELECT * FROM GRADE_ACTIVITY WHERE activity_id = ?",
      [id],
    );
    return rows[0];
  }

  static async create(data) {
    const {
      grade_sheet_id,
      subj_comp_weight_id,
      activity_name,
      highest_possible_score,
      activity_date,
      status,
    } = data;

    const [result] = await db.execute(
      `INSERT INTO GRADE_ACTIVITY (
      grade_sheet_id,
      subj_comp_weight_id,
      activity_name,
      highest_possible_score,
      activity_date,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, NOW(6))`,
      [
        grade_sheet_id,
        subj_comp_weight_id,
        activity_name,
        highest_possible_score,
        activity_date,
        status || "ACTIVE",
      ],
    );

    return result.insertId;
  }

  static async update(id, data) {
    const updateFields = [];
    const updateValues = [];

    if (data.activity_name !== undefined) {
      updateFields.push('activity_name = ?');
      updateValues.push(data.activity_name);
    }
    if (data.highest_possible_score !== undefined || data.max_score !== undefined) {
      const score = data.highest_possible_score !== undefined ? data.highest_possible_score : data.max_score;
      updateFields.push('highest_possible_score = ?');
      updateValues.push(Number(score));
    }
    if (data.activity_date !== undefined) {
      let dateVal = null;
      if (data.activity_date && String(data.activity_date).trim() !== '') {
        const str = String(data.activity_date).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          dateVal = str;
        } else {
          const d = new Date(str);
          if (!isNaN(d.getTime())) {
            try { dateVal = d.toISOString().slice(0, 10); } catch {}
          }
        }
      }
      updateFields.push(`activity_date = CASE 
        WHEN ? IS NOT NULL AND ? != '' THEN ? 
        ELSE COALESCE(activity_date, CURRENT_DATE) 
      END`);
      updateValues.push(dateVal, dateVal, dateVal);
    }
    if (data.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(data.status);
    }

    if (updateFields.length > 0) {
      await db.execute(
        `UPDATE GRADE_ACTIVITY SET ${updateFields.join(', ')}, updated_at = NOW(6) WHERE activity_id = ?`,
        [...updateValues, id],
      );
    }
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute(
      "DELETE FROM GRADE_ACTIVITY WHERE activity_id = ?",
      [id],
    );
    return result.affectedRows > 0;
  }
}

module.exports = GradeActivity;
