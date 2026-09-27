const express = require('express');
const router = express.Router();
const GradeSheet = require('../models/GradeSheet');

router.get('/', async (req, res) => {
  try {
    const sheets = await GradeSheet.findAll();
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sheet = await GradeSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Grade Sheet not found' });
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await GradeSheet.create(req.body);
    res.status(201).json({ message: 'Grade Sheet created successfully', grade_sheet_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await GradeSheet.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await GradeSheet.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Grade Sheet not found' });
    res.json({ message: 'Grade Sheet deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
