const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const AttendanceSheet = require('../models/AttendanceSheet');
const { actorId } = require('../services/AuditDetailsService');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    cloudSync.syncAttendanceFromCloud().catch(() => {});
    const records = await Attendance.findAll();
    res.json(records);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET all attendance records for a specific sheet
router.get('/sheet/:sheetId', async (req, res) => {
  try {
    cloudSync.syncAttendanceFromCloud().catch(() => {});
    const records = await Attendance.findBySheetId(req.params.sheetId);
    res.json(records);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET all attendance records for a section, scoped to adviser or subject teacher
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

    const records = await Attendance.findBySectionId(req.params.sectionId, schoolYearId, options);
    res.json(records);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// POST save-remarks for a student's attendance record
router.post('/save-remarks', async (req, res) => {
  try {
    const { attendance_sheet_id, student_section_id, student_id, status, remarks } = req.body;
    const rawId = student_section_id || student_id;
    if (!attendance_sheet_id || !rawId) {
      return res.status(400).json({ error: 'attendance_sheet_id and student_section_id are required' });
    }
    const id = await Attendance.saveRemarks(attendance_sheet_id, rawId, remarks, status, actorId(req));
    cloudSync.forwardAttendanceSaveRemarksToCloud(attendance_sheet_id, rawId, remarks, status).catch(() => {});
    res.json({ message: 'Remarks saved successfully', attendance_id: id });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// POST bulk-save multiple attendance records at once
router.post('/bulk-save', async (req, res) => {
  try {
    const { records, section_id, adviser_assignment_id, teacher_assignment_id, attendance_scope, attendance_date, user_id } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required' });
    }

    const resolvedScope = attendance_scope || (teacher_assignment_id ? 'SUBJECT' : 'SECTION');
    const effectiveUserId = req.headers['x-auralis-user-id'] || user_id || null;

    // Auto-resolve attendance_sheet_id if records were saved offline before sheet creation
    let targetSheetId = records[0]?.attendance_sheet_id;
    if ((!targetSheetId || isNaN(Number(targetSheetId))) && (section_id || adviser_assignment_id || teacher_assignment_id) && attendance_date) {
      const sheetRes = await AttendanceSheet.findOrCreate({
        section_id: section_id ? Number(section_id) : undefined,
        adviser_assignment_id: adviser_assignment_id ? Number(adviser_assignment_id) : undefined,
        teacher_assignment_id: teacher_assignment_id ? Number(teacher_assignment_id) : undefined,
        attendance_scope: resolvedScope,
        attendance_date,
        user_id: effectiveUserId,
      });
      targetSheetId = sheetRes?.attendance_sheet_id;
    }

    if (targetSheetId) {
      records.forEach(r => {
        if (!r.attendance_sheet_id || isNaN(Number(r.attendance_sheet_id))) {
          r.attendance_sheet_id = targetSheetId;
        }
      });
    }

    const ids = await Attendance.bulkUpsert(records, actorId(req));
    cloudSync.forwardAttendanceBulkSaveToCloud(records).catch(() => {});

    res.json({ message: 'Attendance saved successfully', ids });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(record);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await Attendance.create(req.body, actorId(req));
    res.status(201).json({ message: 'Attendance recorded successfully', attendance_id: id });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Attendance.update(req.params.id, req.body, actorId(req));
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Attendance.delete(req.params.id, actorId(req));
    if (!success) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
