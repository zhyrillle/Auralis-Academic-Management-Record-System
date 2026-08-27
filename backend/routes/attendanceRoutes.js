const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');

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