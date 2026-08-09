const express = require('express');
const router = express.Router();
const SchoolYear = require('../models/SchoolYear');

router.get('/', async (req, res) => {
  try {
    const years = await SchoolYear.findAll();
    res.json(years);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const year = await SchoolYear.findById(req.params.id);
    if (!year) return res.status(404).json({ message: 'School Year not found' });
    res.json(year);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await SchoolYear.create(req.body);
    res.status(201).json({ message: 'School Year created successfully', school_year_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SchoolYear.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SchoolYear.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'School Year not found' });
    res.json({ message: 'School Year deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;