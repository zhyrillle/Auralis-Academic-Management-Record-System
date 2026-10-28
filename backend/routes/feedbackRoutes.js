const express = require('express');
const router = express.Router();
const db = require('../config/db');
const Feedback = require('../models/Feedback');
const cloudSync = require('../services/cloudSyncService');

async function getFeedbackWindowStatus(specifiedSchoolYearId = null, overrideNow = null) {
  let syQuery = 'SELECT school_year_id, starts_on, ends_on, status FROM SCHOOL_YEAR';
  const syParams = [];
  if (specifiedSchoolYearId) {
    syQuery += ' WHERE school_year_id = ?';
    syParams.push(specifiedSchoolYearId);
  } else {
    syQuery += " ORDER BY CASE WHEN LOWER(status) IN ('ongoing', 'active') THEN 0 ELSE 1 END, starts_on DESC LIMIT 1";
  }

  const [syRows] = await db.execute(syQuery, syParams);
  const schoolYear = syRows[0];

  if (!schoolYear) {
    return {
      has_school_year: false,
      can_submit: false,
      status: 'CLOSED',
      message: 'No active school year found.',
    };
  }

  const [termRows] = await db.execute(
    'SELECT ends_at FROM ACADEMIC_TERM WHERE school_year_id = ? ORDER BY ends_at DESC LIMIT 1',
    [schoolYear.school_year_id]
  );
  const lastTerm = termRows[0];

  let schoolYearEndDate = null;
  if (lastTerm?.ends_at) {
    const tEnd = new Date(lastTerm.ends_at);
    if (!isNaN(tEnd.getTime())) schoolYearEndDate = tEnd;
  }
  if (!schoolYearEndDate && schoolYear.ends_on) {
    const raw = String(schoolYear.ends_on).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      schoolYearEndDate = new Date(`${raw.slice(0, 10)}T23:59:59.999Z`);
    } else {
      const yr = parseInt(raw, 10);
      if (!isNaN(yr)) {
        schoolYearEndDate = new Date(`${yr}-05-31T23:59:59.999Z`);
      }
    }
  }

  if (!schoolYearEndDate || isNaN(schoolYearEndDate.getTime())) {
    const nowFallback = new Date();
    schoolYearEndDate = new Date(nowFallback.getFullYear(), 4, 31, 23, 59, 59);
  }

  let schoolYearStartDate = null;
  if (schoolYear.starts_on) {
    const rawStart = String(schoolYear.starts_on).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(rawStart)) {
      schoolYearStartDate = new Date(`${rawStart.slice(0, 10)}T00:00:00.000Z`);
    } else {
      const sYr = parseInt(rawStart, 10);
      if (!isNaN(sYr)) schoolYearStartDate = new Date(`${sYr}-06-01T00:00:00.000Z`);
    }
  }

  // Deadline: 2 weeks (14 days) before school year ends
  const deadlineAt = new Date(schoolYearEndDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  deadlineAt.setHours(23, 59, 59, 999);

  // Window Opens: 2 weeks (14 days) before deadline (i.e. 28 days before school year ends)
  const windowOpensAt = new Date(deadlineAt.getTime() - 14 * 24 * 60 * 60 * 1000);
  windowOpensAt.setHours(0, 0, 0, 0);

  const now = overrideNow ? new Date(overrideNow) : new Date();
  const nowMs = now.getTime();

  let status = 'OPEN';
  let canSubmit = true;
  let daysRemaining = Math.max(0, Math.ceil((deadlineAt.getTime() - nowMs) / (1000 * 60 * 60 * 24)));
  let daysUntilOpen = 0;

  if (nowMs < windowOpensAt.getTime()) {
    status = 'UPCOMING';
    canSubmit = false;
    daysUntilOpen = Math.ceil((windowOpensAt.getTime() - nowMs) / (1000 * 60 * 60 * 24));
  } else if (nowMs > deadlineAt.getTime()) {
    status = 'CLOSED';
    canSubmit = false;
    daysRemaining = 0;
  }

  const startYr = schoolYear.starts_on ? String(schoolYear.starts_on).slice(0, 4) : '';
  const endYr = schoolYear.ends_on ? String(schoolYear.ends_on).slice(0, 4) : '';
  const syLabel = startYr && endYr ? `${startYr}–${endYr}` : (startYr || 'Current School Year');

  const formatDate = d => d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  return {
    has_school_year: true,
    school_year_id: schoolYear.school_year_id,
    school_year: syLabel,
    school_year_starts_on: schoolYearStartDate?.toISOString() || null,
    school_year_ends_on: schoolYearEndDate.toISOString(),
    window_opens_at: windowOpensAt.toISOString(),
    deadline_at: deadlineAt.toISOString(),
    status,
    can_submit: canSubmit,
    days_remaining: daysRemaining,
    days_until_open: daysUntilOpen,
    formatted_window_open: formatDate(windowOpensAt),
    formatted_deadline: formatDate(deadlineAt),
    formatted_school_year_end: formatDate(schoolYearEndDate),
  };
}

router.get('/window-status', async (req, res) => {
  try {
    const windowStatus = await getFeedbackWindowStatus(req.query.schoolYearId, req.query.overrideNow);
    res.json(windowStatus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const windowStatus = await getFeedbackWindowStatus(req.query.schoolYearId, req.query.overrideNow);
    res.json({ ...stats, window_status: windowStatus });
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

      // Check feedback window (2 weeks active window ending 2 weeks before school year ends)
      const windowStatus = await getFeedbackWindowStatus(req.body.school_year_id);
      if (!windowStatus.can_submit) {
        if (windowStatus.status === 'UPCOMING') {
          return res.status(403).json({
            error: `Peer feedback is currently closed. It opens once per school year from ${windowStatus.formatted_window_open} until the deadline on ${windowStatus.formatted_deadline}.`,
            code: 'FEEDBACK_WINDOW_UPCOMING',
            windowStatus,
          });
        } else {
          return res.status(403).json({
            error: `The deadline for peer feedback has passed for S.Y. ${windowStatus.school_year} (Deadline was ${windowStatus.formatted_deadline}).`,
            code: 'FEEDBACK_WINDOW_CLOSED',
            windowStatus,
          });
        }
      }

      // Enforce: Feedback only happens once per school year
      const existing = await Feedback.checkExistingFeedback(
        evaluator_id,
        evaluee_id,
        windowStatus.school_year_starts_on,
        windowStatus.school_year_ends_on
      );
      if (existing) {
        return res.status(400).json({
          error: `You have already submitted feedback for this user for S.Y. ${windowStatus.school_year}. Peer feedback can only be submitted once per school year.`,
        });
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