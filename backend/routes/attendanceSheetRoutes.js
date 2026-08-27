const express = require('express');
const router = express.Router();
const AttendanceSheet = require('../models/AttendanceSheet');

router.get('/', async (req, res) => {
  try {
    const sheets = await AttendanceSheet.findAll();
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all sheets for a specific adviser assignment (for building the date grid)
router.get('/adviser/:adviserAssignmentId', async (req, res) => {
  try {
    const sheets = await AttendanceSheet.findByAdviserAssignmentId(req.params.adviserAssignmentId);
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST find or create a sheet for a given date + adviser assignment
router.post('/find-or-create', async (req, res) => {
  try {
    const { adviser_assignment_id, attendance_scope, attendance_date } = req.body;
    if (!adviser_assignment_id || !attendance_scope || !attendance_date) {
      return res.status(400).json({ error: 'adviser_assignment_id, attendance_scope, and attendance_date are required' });
    }
    const result = await AttendanceSheet.findOrCreate({ adviser_assignment_id, attendance_scope, attendance_date });
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

router.post('/', async (req, res) => {
  try {
    const id = await AttendanceSheet.create(req.body);
    res.status(201).json({ message: 'Attendance Sheet created successfully', attendance_sheet_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await AttendanceSheet.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await AttendanceSheet.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Attendance Sheet not found' });
    res.json({ message: 'Attendance Sheet deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;