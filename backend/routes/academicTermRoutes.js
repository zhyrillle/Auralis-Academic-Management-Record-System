const express = require('express');
const router = express.Router();
const AcademicTerm = require('../models/AcademicTerm');

router.get('/', async (req, res) => {
  try {
    const terms = await AcademicTerm.findAll();
    res.json(terms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/school-year/:schoolYearId', async (req, res) => {
  try {
    const terms = await AcademicTerm.findBySchoolYear(req.params.schoolYearId);
    res.json(terms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const term = await AcademicTerm.findById(req.params.id);
    if (!term) return res.status(404).json({ message: 'Academic Term not found' });
    res.json(term);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await AcademicTerm.create(req.body);
    res.status(201).json({ message: 'Academic Term created successfully', term_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await AcademicTerm.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await AcademicTerm.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Academic Term not found' });
    res.json({ message: 'Academic Term deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;