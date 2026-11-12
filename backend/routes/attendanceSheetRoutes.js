const express = require('express');
const router = express.Router();
const AttendanceSheet = require('../models/AttendanceSheet');
const AttendanceDayService = require('../services/AttendanceDayService');
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    cloudSync.syncAttendanceFromCloud().catch(() => {});
    const sheets = await AttendanceSheet.findAll();
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all sheets for a specific adviser assignment (for building the date grid)
router.get('/adviser/:adviserAssignmentId', async (req, res) => {
  try {
    cloudSync.syncAttendanceFromCloud().catch(() => {});
    const sheets = await AttendanceSheet.findByAdviserAssignmentId(req.params.adviserAssignmentId);
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all sheets for a specific teacher assignment (for building the date grid)
router.get('/teacher/:teacherAssignmentId', async (req, res) => {
  try {
    cloudSync.syncAttendanceFromCloud().catch(() => {});
    const sheets = await AttendanceSheet.findByTeacherAssignmentId(req.params.teacherAssignmentId);
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all sheets for a specific section, scoped to adviser or subject teacher
router.get('/section/:sectionId', async (req, res) => {
  try {
    cloudSync.syncAttendanceFromCloud().catch(() => {});
    const schoolYearId = req.query.schoolYearId;
    if (schoolYearId !== undefined && !/^[1-9]\d*$/.test(String(schoolYearId))) return res.status(400).json({ error: 'Invalid school year.' });

    const options = {
      attendance_scope: req.query.attendance_scope || req.query.scope,
      adviser_assignment_id: req.query.adviser_assignment_id || req.query.adviserAssignmentId,
      teacher_assignment_id: req.query.teacher_assignment_id || req.query.teacherAssignmentId,
      user_id: req.query.user_id || req.query.userId || req.headers['x-auralis-user-id'] || null,
    };

    const sheets = await AttendanceSheet.findBySectionId(req.params.sectionId, schoolYearId, options);
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST find or create a sheet for a given date + adviser assignment or section
router.post('/find-or-create', async (req, res) => {
  try {
    const { section_id, adviser_assignment_id, teacher_assignment_id, attendance_scope = 'SECTION', attendance_date, user_id } = req.body;
    if ((!section_id && !adviser_assignment_id && !teacher_assignment_id) || !attendance_date) {
      return res.status(400).json({ error: 'section_id or adviser_assignment_id and attendance_date are required' });
    }
    const result = await AttendanceSheet.findOrCreate({
      section_id,
      adviser_assignment_id,
      teacher_assignment_id,
      attendance_scope,
      attendance_date,
      user_id,
    });
    if (result && result.attendance_sheet_id) {
      cloudSync.forwardAttendanceSheetToCloud(result.attendance_sheet_id, req.body).catch(() => {});
    }
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sheet = await AttendanceSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Attendance Sheet not found' });
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/no-classes', resolveCurrentUser, async (req, res) => {
  try {
    const result = await AttendanceDayService.setNoClasses({
      sheetId: req.params.id, reason: req.body.reason,
      confirmExistingRecords: req.body.confirmExistingRecords,
      userId: req.currentUser.user_id,
    });
    cloudSync.forwardAttendanceSheetNoClassesToCloud(req.params.id, req.body.reason).catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await AttendanceSheet.create(req.body);
    cloudSync.forwardAttendanceSheetToCloud(id, req.body).catch(() => {});
    res.status(201).json({ message: 'Attendance Sheet created successfully', attendance_sheet_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await AttendanceSheet.update(req.params.id, req.body);
    cloudSync.forwardAttendanceSheetToCloud(req.params.id, req.body).catch(() => {});
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await AttendanceSheet.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Attendance Sheet not found' });
    const db = require('../config/db');
    if (db.cloudPool) db.cloudPool.query('DELETE FROM ATTENDANCE_SHEET WHERE attendance_sheet_id = ?', [req.params.id]).catch(() => {});
    res.json({ message: 'Attendance Sheet deleted successfully' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
