const express = require('express');
const TemporaryReopening = require('../models/TemporaryReopening');
const { resolveCurrentUser, requireSystemAdmin } = require('../middleware/resolveCurrentUser');
const router = express.Router();

router.use(resolveCurrentUser, requireSystemAdmin);
router.get('/', async (_req, res) => {
  try { return res.json(await TemporaryReopening.findAll()); }
  catch (_error) { return res.status(500).json({ error: 'Temporary access records could not be loaded.' }); }
});
router.get('/:id', async (req, res) => {
  try {
    const reopening = await TemporaryReopening.findById(req.params.id);
    if (!reopening) return res.status(404).json({ error: 'Temporary access record not found.' });
    return res.json(reopening);
  } catch (_error) { return res.status(500).json({ error: 'Temporary access record could not be loaded.' }); }
});

// Creating, extending or deleting access directly would bypass request review and sheet locking.
for (const [method, route] of [['post', '/'], ['put', '/:id'], ['delete', '/:id']]) {
  router[method](route, (_req, res) => res.status(405).json({
    code: 'WORKFLOW_REQUIRED', error: 'Use the Academic Period request approval workflow to grant temporary access.',
  }));
}
module.exports = router;
