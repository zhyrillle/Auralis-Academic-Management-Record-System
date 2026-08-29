const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');

// GET /api/principal/feedback/summary
router.get('/summary', async (req, res) => {
  try {
    const { term, schoolYear } = req.query;
    const summary = await Feedback.getPrincipalFeedbackSummary(term, schoolYear);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/principal/feedback/likert-results
router.get('/likert-results', async (req, res) => {
  try {
    const { term, schoolYear } = req.query;
    const data = await Feedback.getPrincipalLikertResults(term, schoolYear);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/principal/feedback/comments
router.get('/comments', async (req, res) => {
  try {
    const { term, schoolYear, query } = req.query;
    const data = await Feedback.getPrincipalFeedbackComments(term, schoolYear, query);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
