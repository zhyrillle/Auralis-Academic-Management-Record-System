const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const cloudSync = require('../services/cloudSyncService');

// GET /api/principal/feedback/summary
router.get('/summary', async (req, res) => {
  try {
    await cloudSync.syncFeedbackFromCloud();
    const { schoolYear } = req.query;
    const summary = await Feedback.getPrincipalFeedbackSummary(schoolYear);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Unable to load Principal feedback. Please retry.' });
  }
});

// GET /api/principal/feedback/likert-results
router.get('/likert-results', async (req, res) => {
  try {
    const { schoolYear } = req.query;
    const data = await Feedback.getPrincipalLikertResults(schoolYear);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Unable to load Principal feedback. Please retry.' });
  }
});

// GET /api/principal/feedback/comments
router.get('/comments', async (req, res) => {
  try {
    const { schoolYear, query } = req.query;
    const data = await Feedback.getPrincipalFeedbackComments(schoolYear, query);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Unable to load Principal feedback. Please retry.' });
  }
});

module.exports = router;
