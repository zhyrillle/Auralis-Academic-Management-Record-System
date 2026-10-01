const express = require('express');
const GradingPeriodService = require('../services/GradingPeriodService');
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
    const context = await GradingPeriodService.getContext(req.query.school_year_id);
    return res.json(context);
  } catch (error) {
    return handleError(error, res);
  }
});

router.post('/terms', requireSystemAdmin, async (req, res) => {
  try {
    const term = await GradingPeriodService.createTerm(req.body, req.currentUser);
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
    return res.json({ gradeSheets });
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
    return res.status(201).json({ message: 'Reopening request submitted.', request });
  } catch (error) {
    return handleError(error, res);
  }
});

module.exports = router;
