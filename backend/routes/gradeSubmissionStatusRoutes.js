const router = require('express').Router();
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');
const GradeSubmissionStatusService = require('../services/GradeSubmissionStatusService');
const fail = (res, error) => res.status(error.statusCode || 500).json({
  message: error.statusCode ? error.message : 'Unable to load submission status. Please retry.',
});
router.get('/', (req, res, next) => resolveCurrentUser(req, res, error => error ? fail(res, error) : next()), async (req, res) => {
  try {
    const data = await GradeSubmissionStatusService.read(req.query, req.currentUser);
    res.set('Cache-Control', 'no-store');
    return res.json(data);
  } catch (error) { return fail(res, error); }
});
module.exports = router;
