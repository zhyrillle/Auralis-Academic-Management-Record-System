const express = require('express');
const router = express.Router();
const db = require('../config/db');
const SchoolYear = require('../models/SchoolYear');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncAcademicCalendarFromCloud();
    const years = await SchoolYear.findAll();
    res.json(years);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await cloudSync.syncAcademicCalendarFromCloud();
    const year = await SchoolYear.findById(req.params.id);
    if (!year) return res.status(404).json({ message: 'School Year not found' });
    res.json(year);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (db.cloudPool) {
      const { school_id, starts_on, ends_on, curriculum, status } = req.body;
      const [cloudRes] = await db.cloudPool.query(
        `INSERT INTO SCHOOL_YEAR (school_id, starts_on, ends_on, curriculum, status) VALUES (?, ?, ?, ?, ?)`,
        [school_id, starts_on, ends_on, curriculum, status || 'upcoming']
      );
      const authoritativeId = cloudRes.insertId;

      await db.execute(
        `INSERT INTO SCHOOL_YEAR (school_year_id, school_id, starts_on, ends_on, curriculum, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           school_id = VALUES(school_id),
           starts_on = VALUES(starts_on),
           ends_on = VALUES(ends_on),
           curriculum = VALUES(curriculum),
           status = VALUES(status)`,
        [authoritativeId, school_id, starts_on, ends_on, curriculum, status || 'upcoming']
      );

      return res.status(201).json({ message: 'School Year created successfully', school_year_id: authoritativeId });
    }

    const id = await SchoolYear.create(req.body);
    res.status(201).json({ message: 'School Year created successfully', school_year_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SchoolYear.update(req.params.id, req.body);

    if (db.cloudPool) {
      const keys = Object.keys(req.body);
      const values = Object.values(req.body);
      if (keys.length > 0) {
        const setClause = keys.map((k) => `${k} = ?`).join(', ');
        await db.cloudPool.query(`UPDATE SCHOOL_YEAR SET ${setClause} WHERE school_year_id = ?`, [...values, req.params.id]).catch(() => {});
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SchoolYear.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'School Year not found' });

    if (db.cloudPool) {
      await db.cloudPool.query('DELETE FROM SCHOOL_YEAR WHERE school_year_id = ?', [req.params.id]).catch(() => {});
    }

    res.json({ message: 'School Year deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;