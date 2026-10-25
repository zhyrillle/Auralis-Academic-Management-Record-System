const express = require('express');
const router = express.Router();
const db = require('../config/db');
const AcademicTerm = require('../models/AcademicTerm');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncAcademicCalendarFromCloud();
    const terms = await AcademicTerm.findAll();
    res.json(terms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/school-year/:schoolYearId', async (req, res) => {
  try {
    await cloudSync.syncAcademicCalendarFromCloud();
    const terms = await AcademicTerm.findBySchoolYear(req.params.schoolYearId);
    res.json(terms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await cloudSync.syncAcademicCalendarFromCloud();
    const term = await AcademicTerm.findById(req.params.id);
    if (!term) return res.status(404).json({ message: 'Academic Term not found' });
    res.json(term);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);

    if (db.cloudPool) {
      const { school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, reopening_requests_open_at, reopening_requests_close_at, status } = req.body;
      const [cloudRes] = await db.cloudPool.query(
        `INSERT INTO ACADEMIC_TERM (school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, reopening_requests_open_at, reopening_requests_close_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          school_year_id,
          term_name,
          toSqlDt(starts_at),
          toSqlDt(ends_at),
          toSqlDt(grade_submission_deadline_at),
          toSqlDt(reopening_requests_open_at),
          toSqlDt(reopening_requests_close_at),
          status || 'upcoming',
        ]
      );
      const authoritativeId = cloudRes.insertId;

      await db.execute(
        `INSERT INTO ACADEMIC_TERM (term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, reopening_requests_open_at, reopening_requests_close_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           school_year_id = VALUES(school_year_id),
           term_name = VALUES(term_name),
           starts_at = VALUES(starts_at),
           ends_at = VALUES(ends_at),
           grade_submission_deadline_at = VALUES(grade_submission_deadline_at),
           reopening_requests_open_at = VALUES(reopening_requests_open_at),
           reopening_requests_close_at = VALUES(reopening_requests_close_at),
           status = VALUES(status)`,
        [
          authoritativeId,
          school_year_id,
          term_name,
          toSqlDt(starts_at),
          toSqlDt(ends_at),
          toSqlDt(grade_submission_deadline_at),
          toSqlDt(reopening_requests_open_at),
          toSqlDt(reopening_requests_close_at),
          status || 'upcoming',
        ]
      );

      return res.status(201).json({ message: 'Academic Term created successfully', term_id: authoritativeId });
    }

    const id = await AcademicTerm.create(req.body);
    res.status(201).json({ message: 'Academic Term created successfully', term_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await AcademicTerm.update(req.params.id, req.body);

    if (db.cloudPool) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      const allowed = ['term_name', 'starts_at', 'ends_at', 'grade_submission_deadline_at', 'reopening_requests_open_at', 'reopening_requests_close_at', 'status'];
      const updates = [];
      const values = [];

      for (const k of allowed) {
        if (req.body[k] !== undefined) {
          updates.push(`${k} = ?`);
          values.push(
            ['starts_at', 'ends_at', 'grade_submission_deadline_at', 'reopening_requests_open_at', 'reopening_requests_close_at'].includes(k)
              ? toSqlDt(req.body[k])
              : req.body[k]
          );
        }
      }

      if (updates.length > 0) {
        values.push(req.params.id);
        await db.cloudPool.query(`UPDATE ACADEMIC_TERM SET ${updates.join(', ')} WHERE term_id = ?`, values).catch(() => {});
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await AcademicTerm.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Academic Term not found' });

    if (db.cloudPool) {
      await db.cloudPool.query('DELETE FROM ACADEMIC_TERM WHERE term_id = ?', [req.params.id]).catch(() => {});
    }

    res.json({ message: 'Academic Term deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;