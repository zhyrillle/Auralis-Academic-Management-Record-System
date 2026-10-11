const express = require('express');
const router = express.Router();
const AtRiskPrediction = require('../models/AtRiskPrediction');
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');

// The existing temporary identity boundary is not a substitute for production session authentication.
router.use(resolveCurrentUser);
router.use((req, res, next) => {
  if (!['principal', 'system_admin'].includes(req.currentUser?.normalized_role)) {
    return res.status(403).json({ code: 'PRINCIPAL_REQUIRED', message: 'Only the Principal or System Administrator can view this research preview.' });
  }
  next();
});

function handle(action) {
  return async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await action(req.query));
    } catch (error) {
      res.status(error.status || 503).json({ code: error.code || 'PREDICTION_UNAVAILABLE',
        message: error.status ? error.message : 'Prediction unavailable. The English source records could not be loaded. Check the database connection and schema.' });
    }
  };
}

router.get('/options', handle(() => AtRiskPrediction.getOptions()));
router.get('/preview', handle(query => AtRiskPrediction.getPreview(query)));
router.get('/summary', handle(query => AtRiskPrediction.getSummary(query)));
router.get('/students', handle(query => {
  if (query.riskLevel && !['low', 'medium', 'high'].includes(query.riskLevel)) {
    throw Object.assign(new Error('Choose a valid risk band.'), { status: 400, code: 'INVALID_RISK_BAND' });
  }
  if (query.limit && !/^[1-9]\d{0,3}$/.test(query.limit)) {
    throw Object.assign(new Error('Choose a valid learner limit.'), { status: 400, code: 'INVALID_LIMIT' });
  }
  return AtRiskPrediction.getStudentsByRiskLevel(query);
}));
router.get('/breakdown', handle(query => AtRiskPrediction.getBreakdownData(query)));

module.exports = router;
