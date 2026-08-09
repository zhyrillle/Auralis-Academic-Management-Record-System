const express = require('express');
const router = express.Router();
const SubjectOffering = require('../models/SubjectOffering');

router.get('/', async (req, res) => {
  try {
    const offerings = await SubjectOffering.findAll();
    res.json(offerings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const offering = await SubjectOffering.findById(req.params.id);
    if (!offering) return res.status(404).json({ message: 'Subject Offering not found' });
    res.json(offering);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await SubjectOffering.create(req.body);
    res.status(201).json({ message: 'Subject Offering created successfully', subject_offering_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SubjectOffering.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SubjectOffering.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Subject Offering not found' });
    res.json({ message: 'Subject Offering deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;