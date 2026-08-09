const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');

router.get('/', async (req, res) => {
  try {
    const subjects = await Subject.findAll();
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ message: 'Subject not found' });
    res.json(subject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await Subject.create(req.body);
    res.status(201).json({ message: 'Subject created successfully', subject_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Subject.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Subject.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Subject not found' });
    res.json({ message: 'Subject deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;