const express = require('express');
const router = express.Router();
const School = require('../models/School');

router.get('/', async (req, res) => {
  try {
    const schools = await School.findAll();
    res.json(schools);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });
    res.json(school);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await School.create(req.body);
    res.status(201).json({ message: 'School created successfully', school_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await School.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await School.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'School not found' });
    res.json({ message: 'School deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;