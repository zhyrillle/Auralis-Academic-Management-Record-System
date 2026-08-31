const express = require('express');
const router = express.Router();
const SectionAdviserAssignment = require('../models/SectionAdviserAssignment');

router.get('/', async (req, res) => {
  try {
    const advisers = await SectionAdviserAssignment.findAll();
    res.json(advisers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const assignments = await SectionAdviserAssignment.findByUserId(req.params.userId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/section/:sectionId', async (req, res) => {
  try {
    const assignments = await SectionAdviserAssignment.findBySectionId(req.params.sectionId);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const adviser = await SectionAdviserAssignment.findById(req.params.id);
    if (!adviser) return res.status(404).json({ message: 'Adviser Assignment not found' });
    res.json(adviser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await SectionAdviserAssignment.create(req.body);
    res.status(201).json({ message: 'Adviser assigned successfully', adviser_assignment_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SectionAdviserAssignment.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SectionAdviserAssignment.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Adviser Assignment not found' });
    res.json({ message: 'Adviser Assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;