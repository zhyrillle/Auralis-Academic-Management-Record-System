const router = require('express').Router();
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');
const { PhilIriScreening } = require('../models/PhilIriScreening');
const cloudSync = require('../services/cloudSyncService');

router.use(resolveCurrentUser);

function fail(res, error) {
  if (error.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({ tableReady: false, message: 'Screening score storage is not set up yet. Ask the administrator to apply the screening migration.' });
  }
  return res.status(error.status || 500).json({ message: error.status ? error.message : 'Screening scores could not be saved or loaded. Please retry.' });
}

router.get('/:sectionId', async (req, res) => {
  try {
    await cloudSync.syncPhilIriFromCloud();
    const records = await PhilIriScreening.findBySection(req.params.sectionId, req.query.schoolYearId, req.currentUser);
    res.set('Cache-Control', 'no-store');
    return res.json({ records, tableReady: true });
  } catch (error) { return fail(res, error); }
});

router.post('/:sectionId', async (req, res) => {
  try {
    const payload = { ...req.body, sectionId: req.params.sectionId };
    const result = await PhilIriScreening.saveBatch(payload, req.currentUser);
    cloudSync.forwardPhilIriScreeningBatchToCloud(payload, req.currentUser?.user_id).catch(() => {});
    return res.json({ success: true, affectedRows: result.affectedRows });
  } catch (error) { return fail(res, error); }
});

module.exports = router;
