const express = require('express');
const router = express.Router();
const GradeLevel = require('../models/GradeLevel');

router.get('/', async (req, res) => {
  try {
    const levels = await GradeLevel.findAll();
    res.json(levels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const level = await GradeLevel.findById(req.params.id);
    if (!level) return res.status(404).json({ message: 'Grade Level not found' });
    res.json(level);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await GradeLevel.create(req.body);
    res.status(201).json({ message: 'Grade Level created successfully', grade_level_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await GradeLevel.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await GradeLevel.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Grade Level not found' });
    res.json({ message: 'Grade Level deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;