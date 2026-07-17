const express = require('express');
const router = express.Router();
const GradeLevel = require('../models/GradeLevel');

router.get('/', async (req, res) => {
  try {
    const gradeLevels = await GradeLevel.findAll();
    res.json(gradeLevels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const gradeLevel = await GradeLevel.findById(req.params.id);
    if (!gradeLevel) return res.status(404).json({ error: 'Grade level not found' });
    res.json(gradeLevel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { grade_level_name } = req.body;
    if (!grade_level_name) return res.status(400).json({ error: 'Grade level name is required' });
    const newId = await GradeLevel.create(grade_level_name);
    res.status(201).json({ message: 'Grade level created successfully', grade_level_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await GradeLevel.delete(req.params.id);
    res.json({ message: 'Grade level deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;