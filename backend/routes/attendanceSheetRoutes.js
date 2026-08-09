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