const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

router.get('/', async (req, res) => {
  try {
    const students = await Student.findAll();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newStudentId = await Student.create(req.body);
    res.status(201).json({ message: 'Student created successfully', student_id: newStudentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;