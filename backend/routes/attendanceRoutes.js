const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');

router.get('/student-section/:id', async (req, res) => {
  try {
    const records = await Attendance.getRecord(req.params.id);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { student_section_id, status } = req.body;
    const newId = await Attendance.logAttendance(student_section_id, status);
    res.status(201).json({ message: 'Attendance logged successfully', attendance_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;