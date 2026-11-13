const express = require('express');
const router = express.Router();
const GradeTransmutationConfig = require('../models/GradeTransmutationConfig');
const { actorId: getActorId } = require('../services/AuditDetailsService');
const cloudSync = require('../services/cloudSyncService');

// GET /api/grade-transmutation
// Fetches the active grade transmutation settings (custom or DepEd official default)
router.get('/', async (req, res) => {
  try {
    await cloudSync.syncGradeTransmutationFromCloud();
    const config = await GradeTransmutationConfig.getConfig();
    return res.json(config);
  } catch (error) {
    console.error('Error fetching grade transmutation config:', error);
    return res.status(500).json({ error: error.message || 'Failed to load grade transmutation configuration.' });
  }
});

// PUT /api/grade-transmutation
// Saves custom grade ranges or toggles custom transmutation status
router.put('/', async (req, res) => {
  try {
    const { is_custom_enabled, ranges } = req.body;
    const actorId = getActorId(req);

    const saved = await GradeTransmutationConfig.saveConfig({
      is_custom_enabled,
      ranges,
      updated_by: actorId,
    });

    await cloudSync.forwardGradeTransmutationToCloud(saved);


    return res.json({
      success: true,
      message: saved.is_custom_enabled
        ? 'Custom grade transmutation table saved successfully.'
        : 'Grade transmutation turned off. Grades will not be transmuted.',
      config: saved,
    });
  } catch (error) {
    console.error('Error saving grade transmutation config:', error);
    return res.status(error.statusCode || 400).json({
      error: error.message || 'Failed to save grade transmutation configuration.',
    });
  }
});

// POST /api/grade-transmutation/reset
// Resets configuration directly to official DepEd SY 2026-2027 defaults
router.post('/reset', async (req, res) => {
  try {
    const actorId = getActorId(req);
    const resetConfig = await GradeTransmutationConfig.resetToDefault({ updated_by: actorId });

    await cloudSync.forwardGradeTransmutationToCloud(resetConfig);


    return res.json({
      success: true,
      message: 'Grade transmutation reset to official DepEd default.',
      config: resetConfig,
    });
  } catch (error) {
    console.error('Error resetting grade transmutation config:', error);
    return res.status(500).json({
      error: error.message || 'Failed to reset grade transmutation configuration.',
    });
  }
});

module.exports = router;
