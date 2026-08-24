const express = require('express');
const router = express.Router();
const TeacherAssignment = require('../models/TeacherAssignment');

router.get('/', async (req, res) => {
  try {
    const assignments = await TeacherAssignment.findAll();
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const UserAssignment = require('../models/UserAssignment');
    const assignments = await UserAssignment.getTeacherAssignments(req.params.userId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const assignment = await TeacherAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Teacher Assignment not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await TeacherAssignment.create(req.body);
    res.status(201).json({ message: 'Teacher assigned successfully', teacher_assignment_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await TeacherAssignment.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await TeacherAssignment.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Teacher Assignment not found' });
    res.json({ message: 'Teacher Assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;