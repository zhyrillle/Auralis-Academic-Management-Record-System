const express = require('express');
const router = express.Router();
const StudentSection = require('../models/StudentSection');

router.get('/', async (req, res) => {
  try {
    const mappings = await StudentSection.findAll();
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/assign', async (req, res) => {
  try {
    const { student_id, section_id, school_year_id } = req.body;
    const newId = await StudentSection.assignStudent(student_id, section_id, school_year_id);
    res.status(201).json({ message: 'Student assigned to section successfully', student_section_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;