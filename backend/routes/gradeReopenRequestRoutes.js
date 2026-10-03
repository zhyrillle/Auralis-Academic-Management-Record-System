const express = require('express');
const GradeReopenRequest = require('../models/GradeReopenRequest');
const GradingPeriodService = require('../services/GradingPeriodService');
const { resolveCurrentUser, requireSystemAdmin } = require('../middleware/resolveCurrentUser');
const uploadRequestFile = require('../middleware/uploadRequestFile');
const { uploadRequestFile: uploadToCloudinary } = require('../services/requestFileStorage');
const router = express.Router();

router.use(resolveCurrentUser);
function handleError(error, res) {
  const status = error.status || 500;
  if (status === 500) console.error('Reopening request failed:', error.message);
  return res.status(status).json({ code: error.code || 'REOPENING_REQUEST_ERROR',
    error: status === 500 ? 'The reopening request could not be completed.' : error.message });
}

router.get('/', requireSystemAdmin, async (_req, res) => {
  try { return res.json(await GradeReopenRequest.findAll()); }
  catch (error) { return handleError(error, res); }
});

router.get('/user/:userId', async (req, res) => {
  if (Number(req.params.userId) !== Number(req.currentUser.user_id)
      && req.currentUser.normalized_role !== 'system_admin') {
    return res.status(403).json({ error: 'You can only view your own requests.' });
  }
  try { return res.json(await GradeReopenRequest.findByUserId(req.params.userId)); }
  catch (error) { return handleError(error, res); }
});

router.get('/:id', async (req, res) => {
  try {
    const request = req.currentUser.normalized_role === 'system_admin'
      ? await GradeReopenRequest.findById(req.params.id)
      : (await GradeReopenRequest.findByUserId(req.currentUser.user_id))
        .find(row => Number(row.request_id) === Number(req.params.id));
    if (!request) return res.status(404).json({ error: 'Reopening request not found.' });
    return res.json(request);
  } catch (error) { return handleError(error, res); }
});

// Keep multipart attachments, but use exactly the same policy and transaction as the JSON endpoint.
router.post('/', (req, res, next) => {
  uploadRequestFile.array('supporting_file', 10)(req, res, error => {
    if (error) return res.status(400).json({ error: error.message });
    return next();
  });
}, async (req, res) => {
  try {
    const eligibility = await GradingPeriodService.getReopeningEligibility(req.body.grade_sheet_id, req.currentUser.user_id);
    if (!eligibility.eligible) {
      return res.status(409).json({ code: eligibility.reason, error: 'This grade sheet is not accepting reopening requests.' });
    }
    if (typeof req.body.reason !== 'string' || !req.body.reason.trim() || req.body.reason.trim().length > 1000) {
      return res.status(400).json({ error: 'Provide a reason of 1 to 1000 characters.' });
    }
    const files = req.files || [];
    const uploads = [];
    for (const file of files) uploads.push(await uploadToCloudinary(file.buffer, file.originalname));
    const request = await GradingPeriodService.createReopeningRequest(
      req.body.grade_sheet_id, req.body.reason, req.currentUser, {
        file_name: files.map(file => file.originalname).join(', ') || null,
        file_path: uploads.map(file => file.secureUrl).join(', ') || null,
        file_type: files.map(file => file.mimetype).join(', ') || null,
        file_size: files.reduce((sum, file) => sum + file.size, 0) || null,
      },
    );
    return res.status(201).json({ message: 'Reopening request submitted.', request_id: request.request_id, request });
  } catch (error) { return handleError(error, res); }
});

router.put('/:id', async (req, res) => {
  if (Object.keys(req.body).length !== 1 || req.body.status !== 'CANCELLED') {
    return res.status(409).json({ code: 'WORKFLOW_REQUIRED', error: 'Use the authorized approval or denial workflow. Only cancellation is supported here.' });
  }
  try { return res.json(await GradingPeriodService.cancelReopeningRequest(req.params.id, req.currentUser)); }
  catch (error) { return handleError(error, res); }
});

router.delete('/:id', (_req, res) => res.status(405).json({
  code: 'WORKFLOW_REQUIRED', error: 'Reopening history cannot be deleted. Cancel a pending request instead.',
}));
module.exports = router;
