const express = require('express');
const router = express.Router();
const StudentSection = require('../models/StudentSection');

router.get('/', async (req, res) => {
  try {
    const enrollments = await StudentSection.findAll();
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const enrollment = await StudentSection.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ message: 'Student Section record not found' });
    res.json(enrollment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await StudentSection.create(req.body);
    res.status(201).json({ message: 'Student enrolled into section successfully', student_section_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await StudentSection.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await StudentSection.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Student Section record not found' });
    res.json({ message: 'Student Section record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;