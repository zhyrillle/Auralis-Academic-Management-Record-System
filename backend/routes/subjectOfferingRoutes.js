const express = require('express');
const router = express.Router();
const db = require('../config/db');
const SubjectOffering = require('../models/SubjectOffering');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud();
    const offerings = await SubjectOffering.findAll();
    res.json(offerings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const offering = await SubjectOffering.findById(req.params.id);
    if (!offering) return res.status(404).json({ message: 'Subject Offering not found' });
    res.json(offering);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    let cloudId = null;
    if (db.cloudPool) {
      try {
        const [cloudRes] = await db.cloudPool.query(
          `INSERT INTO SUBJECT_OFFERING (subject_id, section_id, school_year_id)
           VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE subject_offering_id = LAST_INSERT_ID(subject_offering_id)`,
          [req.body.subject_id, req.body.section_id, req.body.school_year_id]
        );
        cloudId = cloudRes.insertId;
      } catch (cErr) {
        console.warn('[subjectOfferingRoutes] Cloud authoritative insert failed:', cErr.message);
      }
    }

    let id;
    if (cloudId) {
      await db.execute(
        `INSERT INTO SUBJECT_OFFERING (subject_offering_id, subject_id, section_id, school_year_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           subject_id = VALUES(subject_id),
           section_id = VALUES(section_id),
           school_year_id = VALUES(school_year_id)`,
        [cloudId, req.body.subject_id, req.body.section_id, req.body.school_year_id]
      );
      id = cloudId;
    } else {
      id = await SubjectOffering.create(req.body);
      cloudSync.forwardSubjectOfferingToCloud(id, req.body).catch(() => {});
    }

    res.status(201).json({ message: 'Subject Offering created successfully', subject_offering_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SubjectOffering.update(req.params.id, req.body);
    cloudSync.forwardSubjectOfferingToCloud(req.params.id, req.body, true).catch(() => {});
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SubjectOffering.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Subject Offering not found' });
    cloudSync.forwardSubjectOfferingDeleteToCloud(req.params.id).catch(() => {});
    res.json({ message: 'Subject Offering deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;