const express = require('express');
const router = express.Router();
const db = require('../config/db');
const Attendance = require('../models/Attendance');
const AuditEvent = require('../models/AuditEvent');

router.get('/', async (req, res) => {
  try {
    const records = await Attendance.findAll();
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all attendance records for a specific sheet
router.get('/sheet/:sheetId', async (req, res) => {
  try {
    const records = await Attendance.findBySheetId(req.params.sheetId);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all attendance records for a section (all sheets + all students)
router.get('/section/:sectionId', async (req, res) => {
  try {
    const records = await Attendance.findBySectionId(req.params.sectionId);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST bulk-save multiple attendance records at once
router.post('/bulk-save', async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required' });
    }
    const ids = await Attendance.bulkUpsert(records);

    // Audit log attendance record
    try {
      const sheetId = records[0]?.attendance_sheet_id;
      if (sheetId) {
        const [sheetRows] = await db.execute(
          `SELECT ash.attendance_date, sec.section_name, saa.user_id, sy.starts_on, sy.ends_on
           FROM ATTENDANCE_SHEET ash
           LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON ash.adviser_assignment_id = saa.adviser_assignment_id
           LEFT JOIN SECTION sec ON saa.section_id = sec.section_id
           LEFT JOIN SCHOOL_YEAR sy ON saa.school_year_id = sy.school_year_id
           WHERE ash.attendance_sheet_id = ?`,
          [sheetId]
        );
        const secName = sheetRows[0]?.section_name || 'Section';
        const syLabel = sheetRows[0]?.starts_on && sheetRows[0]?.ends_on ? `${sheetRows[0].starts_on}–${sheetRows[0].ends_on}` : null;
        const actorUserId = req.headers['x-auralis-user-id'] || sheetRows[0]?.user_id || null;

        await AuditEvent.create({
          user_id: actorUserId ? Number(actorUserId) : null,
          actor_context: { source: 'user', acting_as: `Adviser — ${secName}`, role: 'adviser' },
          event_type: 'ATTENDANCE_RECORDED',
          module_name: 'ATTENDANCE',
          entity_type: 'ATTENDANCE_SHEET',
          entity_id: sheetId,
          metadata: {
            target: secName,
            section: secName,
            school_year: syLabel,
            summary: `Recorded daily attendance for Section ${secName}.`,
            impact: 'Low',
          },
        });
      }
    } catch (auditErr) {
      console.error('Failed to log attendance audit:', auditErr.message);
    }

    res.json({ message: 'Attendance saved successfully', ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await Attendance.create(req.body);
    res.status(201).json({ message: 'Attendance recorded successfully', attendance_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Attendance.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Attendance.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;