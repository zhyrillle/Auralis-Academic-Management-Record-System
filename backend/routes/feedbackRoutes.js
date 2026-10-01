const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');

router.get('/', async (req, res) => {
  try {
    const feedbackList = await Feedback.findAll();
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/evaluator/:userId', async (req, res) => {
  try {
    const feedbackList = await Feedback.findByEvaluatorId(req.params.userId);
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/evaluee/:userId', async (req, res) => {
  try {
    const feedbackList = await Feedback.findByEvalueeId(req.params.userId);
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/:userId', async (req, res) => {
  try {
    const stats = await Feedback.getEvalueeStats(req.params.userId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await Feedback.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Feedback entry not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { evaluator_id, evaluee_id } = req.body;
    if (evaluator_id && evaluee_id) {
      if (Number(evaluator_id) === Number(evaluee_id)) {
        return res.status(400).json({ error: 'You cannot give feedback to yourself.' });
      }
      const existing = await Feedback.checkExistingFeedback(evaluator_id, evaluee_id);
      if (existing) {
        return res.status(400).json({ error: 'You have already submitted feedback for this user.' });
      }
    }

    const id = await Feedback.create(req.body);
    res.status(201).json({ message: 'Feedback submitted successfully', feedback_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Feedback.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Feedback.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Feedback entry not found' });
    res.json({ message: 'Feedback entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;