const express = require('express');
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');
const { DeptHeadMonitoringService: service } = require('../services/DeptHeadMonitoringService');
const { getSummary: getAcademicRiskSummary } = require('../services/DepartmentAcademicRiskService');
const db = require('../config/db');
const router = express.Router();
router.use(resolveCurrentUser);
const read = handler => async (req, res) => {
  try { res.json(await handler(req)); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'These records could not be loaded. Please try again.' }); }
};
router.get('/context', read(req => service.context(req.currentUser)));
router.get('/academic-risk', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
  read(req => getAcademicRiskSummary(db, req.currentUser, req.query)));
router.get('/sections', read(req => service.sections(req.currentUser, req.query.schoolYearId)));
router.get('/phil-iri', read(req => service.philIri(req.currentUser, req.query.schoolYearId)));
router.get('/phil-iri/:sectionId', read(req => service.philIri(req.currentUser, req.query.schoolYearId, req.params.sectionId)));
module.exports = router;
