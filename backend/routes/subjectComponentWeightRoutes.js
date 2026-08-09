const express = require('express');
const router = express.Router();
const SubjectComponentWeight = require('../models/SubjectComponentWeight');

router.get('/', async (req, res) => {
  try {
    const weights = await SubjectComponentWeight.findAll();
    res.json(weights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const weight = await SubjectComponentWeight.findById(req.params.id);
    if (!weight) return res.status(404).json({ message: 'Weight configuration not found' });
    res.json(weight);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await SubjectComponentWeight.create(req.body);
    res.status(201).json({ message: 'Component weight configured successfully', subj_comp_weight_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SubjectComponentWeight.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SubjectComponentWeight.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Weight configuration not found' });
    res.json({ message: 'Component weight deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;