const express = require('express');
const router = express.Router();
const Score = require('../models/Score');

router.get('/', async (req, res) => {
  try {
    const scores = await Score.findAll();
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const score = await Score.findById(req.params.id);
    if (!score) return res.status(404).json({ message: 'Score entry not found' });
    res.json(score);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await Score.create(req.body);
    res.status(201).json({ message: 'Score recorded successfully', score_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Score.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Score.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Score entry not found' });
    res.json({ message: 'Score deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;