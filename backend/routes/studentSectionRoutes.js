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

router.post('/assign', async (req, res) => {
  try {
    const { student_id, section_id, school_year_id } = req.body;
    if (!student_id || !section_id) {
      return res.status(400).json({ error: 'student_id and section_id are required' });
    }
    const id = await StudentSection.assign(student_id, section_id, school_year_id);
    res.json({ message: 'Student assigned successfully', student_section_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-assign', async (req, res) => {
  try {
    const { student_ids, section_id, school_year_id } = req.body;
    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0 || !section_id) {
      return res.status(400).json({ error: 'student_ids (array) and section_id are required' });
    }
    const results = await StudentSection.bulkAssign(student_ids, section_id, school_year_id);
    res.json({ message: 'Students assigned successfully', count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/unassign', async (req, res) => {
  try {
    const { student_id, section_id, school_year_id, student_section_id } = req.body;
    const success = await StudentSection.unassign(student_id, section_id, school_year_id, student_section_id);
    res.json({ message: 'Student unassigned successfully', success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/unassign', async (req, res) => {
  try {
    const { student_id, section_id, school_year_id, student_section_id } = req.body;
    const success = await StudentSection.unassign(student_id, section_id, school_year_id, student_section_id);
    res.json({ message: 'Student unassigned successfully', success });
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