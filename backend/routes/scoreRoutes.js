const express = require('express');
const router = express.Router();
const Score = require('../models/Score');

router.get('/student-section/:id', async (req, res) => {
  try {
    const scores = await Score.findByStudentSection(req.params.id);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newId = await Score.create(req.body);
    res.status(201).json({ message: 'Score record created successfully', score_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/lock/subject/:id', async (req, res) => {
  try {
    await Score.lockScores(req.params.id);
    res.json({ message: 'Scores locked successfully for this subject' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;