const express = require('express');
const router = express.Router();
const db = require('../config/db');
const Feedback = require('../models/Feedback');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncFeedbackFromCloud();
    const feedbackList = await Feedback.findAll();
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/evaluator/:userId', async (req, res) => {
  try {
    await cloudSync.syncFeedbackFromCloud();
    const feedbackList = await Feedback.findByEvaluatorId(req.params.userId);
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/evaluee/:userId', async (req, res) => {
  try {
    await cloudSync.syncFeedbackFromCloud();
    const feedbackList = await Feedback.findByEvalueeId(req.params.userId);
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/:userId', async (req, res) => {
  try {
    await cloudSync.syncFeedbackFromCloud();
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

    let cloudId = null;
    if (db.cloudPool) {
      try {
        const [cRes] = await db.cloudPool.query(
          `INSERT INTO FEEDBACK (evaluator_id, evaluee_id, q1_rate, q2_rate, q3_rate, q4_rate, q5_rate, q6_rate, q7_rate, q8_rate, strengths_comments, improvements_comments, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            req.body.evaluator_id, req.body.evaluee_id, req.body.q1_rate, req.body.q2_rate, req.body.q3_rate,
            req.body.q4_rate, req.body.q5_rate, req.body.q6_rate, req.body.q7_rate, req.body.q8_rate,
            req.body.strengths_comments || null, req.body.improvements_comments || null, req.body.status || 'OPEN'
          ]
        );
        cloudId = cRes.insertId;
      } catch (cErr) {
        console.warn('[feedbackRoutes] Cloud authoritative insert failed:', cErr.message);
      }
    }

    let id;
    if (cloudId) {
      await db.execute(
        `INSERT INTO FEEDBACK (feedback_id, evaluator_id, evaluee_id, q1_rate, q2_rate, q3_rate, q4_rate, q5_rate, q6_rate, q7_rate, q8_rate, strengths_comments, improvements_comments, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           evaluator_id = VALUES(evaluator_id), evaluee_id = VALUES(evaluee_id),
           q1_rate = VALUES(q1_rate), q2_rate = VALUES(q2_rate), q3_rate = VALUES(q3_rate),
           q4_rate = VALUES(q4_rate), q5_rate = VALUES(q5_rate), q6_rate = VALUES(q6_rate),
           q7_rate = VALUES(q7_rate), q8_rate = VALUES(q8_rate),
           strengths_comments = VALUES(strengths_comments), improvements_comments = VALUES(improvements_comments),
           status = VALUES(status)`,
        [
          cloudId, req.body.evaluator_id, req.body.evaluee_id, req.body.q1_rate, req.body.q2_rate, req.body.q3_rate,
          req.body.q4_rate, req.body.q5_rate, req.body.q6_rate, req.body.q7_rate, req.body.q8_rate,
          req.body.strengths_comments || null, req.body.improvements_comments || null, req.body.status || 'OPEN'
        ]
      );
      id = cloudId;
    } else {
      id = await Feedback.create(req.body);
      cloudSync.forwardFeedbackToCloud(id, req.body).catch(() => {});
    }

    res.status(201).json({ message: 'Feedback submitted successfully', feedback_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Feedback.update(req.params.id, req.body);
    cloudSync.forwardFeedbackToCloud(req.params.id, req.body, true).catch(() => {});
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Feedback.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Feedback entry not found' });
    cloudSync.forwardFeedbackDeleteToCloud(req.params.id).catch(() => {});
    res.json({ message: 'Feedback entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;