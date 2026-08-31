const express = require('express');
const router = express.Router();
const Score = require('../models/Score');

const db = require('../config/db');

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
    const { activity_id, raw_score } = req.body;
    if (activity_id && raw_score !== undefined && raw_score !== null && raw_score !== '') {
      const numScore = Number(raw_score);
      const [acts] = await db.execute('SELECT highest_possible_score FROM GRADE_ACTIVITY WHERE activity_id = ?', [activity_id]);
      if (acts.length > 0 && numScore > Number(acts[0].highest_possible_score)) {
        return res.status(400).json({ error: `Score (${numScore}) cannot exceed Highest Possible Score (${acts[0].highest_possible_score}).` });
      }
    }
    const id = await Score.create(req.body);
    res.status(201).json({ message: 'Score recorded successfully', score_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { raw_score } = req.body;
    if (raw_score !== undefined && raw_score !== null && raw_score !== '') {
      const numScore = Number(raw_score);
      const [existing] = await db.execute(
        `SELECT s.score_id, ga.highest_possible_score 
         FROM SCORE s 
         JOIN GRADE_ACTIVITY ga ON ga.activity_id = s.activity_id 
         WHERE s.score_id = ?`,
        [req.params.id]
      );
      if (existing.length > 0 && numScore > Number(existing[0].highest_possible_score)) {
        return res.status(400).json({ error: `Score (${numScore}) cannot exceed Highest Possible Score (${existing[0].highest_possible_score}).` });
      }
    }
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