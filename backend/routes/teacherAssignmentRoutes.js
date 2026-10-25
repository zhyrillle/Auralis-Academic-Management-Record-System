const express = require('express');
const router = express.Router();
const db = require('../config/db');
const TeacherAssignment = require('../models/TeacherAssignment');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud();
    const assignments = await TeacherAssignment.findAll();
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud();
    const UserAssignment = require('../models/UserAssignment');
    const assignments = await UserAssignment.getTeacherAssignments(req.params.userId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const assignment = await TeacherAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Teacher Assignment not found' });
    res.json(assignment);
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
          `INSERT INTO TEACHER_ASSIGNMENT (user_id, subject_offering_id, assigned_from, assigned_until)
           VALUES (?, ?, ?, ?)`,
          [
            req.body.user_id,
            req.body.subject_offering_id,
            cloudSync.formatDate(req.body.assigned_from),
            cloudSync.formatDate(req.body.assigned_until),
          ]
        );
        cloudId = cloudRes.insertId;
      } catch (cErr) {
        console.warn('[teacherAssignmentRoutes] Cloud authoritative insert failed:', cErr.message);
      }
    }

    let id;
    if (cloudId) {
      await db.execute(
        `INSERT INTO TEACHER_ASSIGNMENT (teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           user_id = VALUES(user_id),
           subject_offering_id = VALUES(subject_offering_id),
           assigned_from = VALUES(assigned_from),
           assigned_until = VALUES(assigned_until)`,
        [
          cloudId,
          req.body.user_id,
          req.body.subject_offering_id,
          cloudSync.formatDate(req.body.assigned_from),
          cloudSync.formatDate(req.body.assigned_until),
        ]
      );
      id = cloudId;
    } else {
      id = await TeacherAssignment.create(req.body);
      cloudSync.forwardTeacherAssignmentToCloud(id, req.body).catch(() => {});
    }

    res.status(201).json({ message: 'Teacher assigned successfully', teacher_assignment_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await TeacherAssignment.update(req.params.id, req.body);
    cloudSync.forwardTeacherAssignmentToCloud(req.params.id, req.body, true).catch(() => {});
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await TeacherAssignment.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Teacher Assignment not found' });
    cloudSync.forwardTeacherAssignmentDeleteToCloud(req.params.id).catch(() => {});
    res.json({ message: 'Teacher Assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;