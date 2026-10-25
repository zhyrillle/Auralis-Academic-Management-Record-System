const express = require('express');
const router = express.Router();
const db = require('../config/db');
const SectionAdviserAssignment = require('../models/SectionAdviserAssignment');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud();
    const advisers = await SectionAdviserAssignment.findAll();
    res.json(advisers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud();
    const assignments = await SectionAdviserAssignment.findByUserId(req.params.userId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/section/:sectionId', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud();
    const assignments = await SectionAdviserAssignment.findBySectionId(req.params.sectionId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const adviser = await SectionAdviserAssignment.findById(req.params.id);
    if (!adviser) return res.status(404).json({ message: 'Adviser Assignment not found' });
    res.json(adviser);
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
          `INSERT INTO SECTION_ADVISER_ASSIGNMENT (section_id, school_year_id, user_id, assigned_from, assigned_until)
           VALUES (?, ?, ?, ?, ?)`,
          [
            req.body.section_id,
            req.body.school_year_id,
            req.body.user_id,
            cloudSync.formatDate(req.body.assigned_from),
            cloudSync.formatDate(req.body.assigned_until),
          ]
        );
        cloudId = cloudRes.insertId;
      } catch (cErr) {
        console.warn('[adviserAssignmentRoutes] Cloud authoritative insert failed:', cErr.message);
      }
    }

    let id;
    if (cloudId) {
      await db.execute(
        `INSERT INTO SECTION_ADVISER_ASSIGNMENT (adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           section_id = VALUES(section_id),
           school_year_id = VALUES(school_year_id),
           user_id = VALUES(user_id),
           assigned_from = VALUES(assigned_from),
           assigned_until = VALUES(assigned_until)`,
        [
          cloudId,
          req.body.section_id,
          req.body.school_year_id,
          req.body.user_id,
          cloudSync.formatDate(req.body.assigned_from),
          cloudSync.formatDate(req.body.assigned_until),
        ]
      );
      id = cloudId;
    } else {
      id = await SectionAdviserAssignment.create(req.body);
      cloudSync.forwardAdviserAssignmentToCloud(id, req.body).catch(() => {});
    }

    res.status(201).json({ message: 'Adviser assigned successfully', adviser_assignment_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SectionAdviserAssignment.update(req.params.id, req.body);
    cloudSync.forwardAdviserAssignmentToCloud(req.params.id, req.body, true).catch(() => {});
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SectionAdviserAssignment.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Adviser Assignment not found' });
    cloudSync.forwardAdviserAssignmentDeleteToCloud(req.params.id).catch(() => {});
    res.json({ message: 'Adviser Assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;