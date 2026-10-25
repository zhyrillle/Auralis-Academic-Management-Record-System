const express = require('express');
const db = require('../config/db');
const GradingPeriodService = require('../services/GradingPeriodService');
const cloudSync = require('../services/cloudSyncService');
const {
  resolveCurrentUser,
  requireSystemAdmin,
} = require('../middleware/resolveCurrentUser');

const router = express.Router();

function handleError(error, res) {
  const status = error.status || 500;
  return res.status(status).json({
    code: error.code || 'GRADING_PERIOD_ERROR',
    message: status === 500 ? 'The Grading Period request could not be completed.' : error.message,
  });
}

router.use(resolveCurrentUser);

router.get('/context', requireSystemAdmin, async (req, res) => {
  try {
    await cloudSync.syncAcademicCalendarFromCloud();
    const context = await GradingPeriodService.getContext(req.query.school_year_id);
    return res.json(context);
  } catch (error) {
    return handleError(error, res);
  }
});

router.post('/terms', requireSystemAdmin, async (req, res) => {
  try {
    const term = await GradingPeriodService.createTerm(req.body, req.currentUser);

    if (db.cloudPool && term) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      await db.cloudPool.query(
        `INSERT INTO ACADEMIC_TERM (term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, reopening_requests_open_at, reopening_requests_close_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           term_name = VALUES(term_name),
           starts_at = VALUES(starts_at),
           ends_at = VALUES(ends_at),
           grade_submission_deadline_at = VALUES(grade_submission_deadline_at),
           status = VALUES(status)`,
        [
          term.term_id,
          term.school_year_id,
          term.term_name,
          toSqlDt(term.starts_at),
          toSqlDt(term.ends_at),
          toSqlDt(term.grade_submission_deadline_at),
          toSqlDt(term.reopening_requests_open_at),
          toSqlDt(term.reopening_requests_close_at),
          term.status,
        ]
      ).catch((err) => console.warn('[CloudTerm] Create dual-write failed:', err.message));
    }

    return res.status(201).json({ message: 'Grading period created.', term });
  } catch (error) {
    return handleError(error, res);
  }
});

router.patch('/terms/:termId/timeline', requireSystemAdmin, async (req, res) => {
  try {
    const term = await GradingPeriodService.updateTimeline(
      req.params.termId,
      req.body,
      req.currentUser
    );

    if (db.cloudPool && term) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      await db.cloudPool.query(
        `UPDATE ACADEMIC_TERM
         SET starts_at = ?,
             ends_at = ?,
             grade_submission_deadline_at = ?,
             status = ?
         WHERE term_id = ?`,
        [
          toSqlDt(term.starts_at),
          toSqlDt(term.ends_at),
          toSqlDt(term.grade_submission_deadline_at),
          term.status,
          req.params.termId,
        ]
      ).catch((err) => console.warn('[CloudTerm] Timeline dual-write failed:', err.message));
    }

    return res.json({ message: 'Grading period timeline updated.', term });
  } catch (error) {
    return handleError(error, res);
  }
});

router.patch('/reopening-requests/:requestId/approve', requireSystemAdmin, async (req, res) => {
  try {
    const reopening = await GradingPeriodService.approveRequest(
      req.params.requestId,
      req.body,
      req.currentUser
    );
    cloudSync.forwardReopenRequestStatusToCloud(req.params.requestId, 'APPROVED', req.currentUser?.user_id).catch(() => {});
    if (reopening) cloudSync.forwardTemporaryReopeningToCloud(reopening).catch(() => {});
    return res.json({ message: 'Temporary reopening approved.', reopening });
  } catch (error) {
    return handleError(error, res);
  }
});

router.patch('/reopening-requests/:requestId/deny', requireSystemAdmin, async (req, res) => {
  try {
    const request = await GradingPeriodService.denyRequest(
      req.params.requestId,
      req.body,
      req.currentUser
    );
    cloudSync.forwardReopenRequestStatusToCloud(req.params.requestId, 'DENIED', req.currentUser?.user_id).catch(() => {});
    return res.json({ message: 'Reopening request denied.', request });
  } catch (error) {
    return handleError(error, res);
  }
});

router.get('/temporary-reopenings/:reopeningId/activity', requireSystemAdmin, async (req, res) => {
  try {
    const events = await GradingPeriodService.getReopeningActivity(req.params.reopeningId);
    return res.json({ events });
  } catch (error) {
    return handleError(error, res);
  }
});

router.get('/grade-sheets/:gradeSheetId/reopening-eligibility', async (req, res) => {
  try {
    const eligibility = await GradingPeriodService.getReopeningEligibility(
      req.params.gradeSheetId,
      req.currentUser.user_id
    );
    return res.json(eligibility);
  } catch (error) {
    return handleError(error, res);
  }
});

router.get('/grade-sheets/reopening-options', async (req, res) => {
  try {
    const gradeSheets = await GradingPeriodService.getReopeningOptions(
      req.currentUser.user_id
    );
    return res.json({
      gradeSheets,
      defaultSchoolYearId: GradingPeriodService.getReopeningDefaultSchoolYear(gradeSheets),
    });
  } catch (error) {
    return handleError(error, res);
  }
});

router.post('/grade-sheets/:gradeSheetId/reopening-requests', async (req, res) => {
  try {
    const request = await GradingPeriodService.createReopeningRequest(
      req.params.gradeSheetId,
      req.body.reason,
      req.currentUser
    );
    cloudSync.forwardReopenRequestToCloud(request).catch(() => {});
    return res.status(201).json({ message: 'Reopening request submitted.', request });
  } catch (error) {
    return handleError(error, res);
  }
});

module.exports = router;
