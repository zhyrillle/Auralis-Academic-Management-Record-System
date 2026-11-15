const express = require('express');
const db = require('../config/db');
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');
const service = require('../services/AttendanceMonitoringService');
const router = express.Router();
router.use(resolveCurrentUser);
router.use((req, res, next) => req.currentUser?.normalized_role === 'principal' ? next()
  : res.status(403).json({ message: 'Only the Principal can view Attendance Monitoring.' }));
const read = action => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await action(req)); }
  catch (error) { res.status(error.status || 503).json({ message: error.status ? error.message : 'Attendance monitoring could not be loaded. Please retry.' }); }
};
router.get('/options', read(() => service.options(db)));
router.get('/preview', read(req => service.preview(db, req.query)));
module.exports = router;
