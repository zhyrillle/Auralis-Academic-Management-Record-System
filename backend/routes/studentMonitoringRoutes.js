const express = require('express');
const db = require('../config/db');
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');
const service = require('../services/StudentMonitoringService');
const router = express.Router();

router.use(resolveCurrentUser);
router.use((req, res, next) => req.currentUser?.normalized_role === 'principal' ? next()
  : res.status(403).json({ message: 'Only the Principal can view Student Monitoring.' }));

const read = action => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await action(req)); }
  catch (error) {
    if (!error.status) console.error('[StudentMonitoring]', error.message);
    res.status(error.status || 503).json({ message: error.status ? error.message : 'Student monitoring records could not be loaded. Please retry.' });
  }
};
router.get('/options', read(() => service.getOptions(db)));
router.get('/preview', read(req => service.getPreview(db, req.query)));
module.exports = router;
