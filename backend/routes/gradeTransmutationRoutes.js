const express = require('express');
const router = express.Router();
const GradeTransmutationConfig = require('../models/GradeTransmutationConfig');
const AuditEvent = require('../models/AuditEvent');

const getActorId = (req) => {
  if (req.currentUser?.user_id) return req.currentUser.user_id;
  const headerId = req.headers['x-auralis-user-id'];
  if (headerId && Number.isInteger(Number(headerId)) && Number(headerId) > 0) {
    return Number(headerId);
  }
  if (req.body?.user_id && Number.isInteger(Number(req.body.user_id))) {
    return Number(req.body.user_id);
  }
  return null;
};

// GET /api/grade-transmutation
// Fetches the active grade transmutation settings (custom or DepEd official default)
router.get('/', async (req, res) => {
  try {
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

    try {
      await AuditEvent.create({
        user_id: actorId,
        actor_context: { source: actorId ? 'user' : 'system', acting_as: 'System Administrator' },
        event_type: 'GRADE_TRANSMUTATION_UPDATED',
        module_name: 'GRADE_TRANSMUTATION',
        entity_type: 'GRADE_TRANSMUTATION_CONFIG',
        entity_id: 1,
        previous_state: null,
        new_state: { is_custom_enabled: saved.is_custom_enabled, rangesCount: saved.ranges.length },
        summary: saved.is_custom_enabled
          ? `Updated custom grade transmutation table (${saved.ranges.length} ranges).`
          : 'Reverted grade transmutation to official DepEd default table.',
      });
    } catch (auditErr) {
      console.warn('Failed to record audit event for grade transmutation:', auditErr.message);
    }

    return res.json({
      success: true,
      message: saved.is_custom_enabled
        ? 'Custom grade transmutation table saved successfully.'
        : 'Reverted to official DepEd default transmutation table.',
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

    try {
      await AuditEvent.create({
        user_id: actorId,
        actor_context: { source: actorId ? 'user' : 'system', acting_as: 'System Administrator' },
        event_type: 'GRADE_TRANSMUTATION_RESET',
        module_name: 'GRADE_TRANSMUTATION',
        entity_type: 'GRADE_TRANSMUTATION_CONFIG',
        entity_id: 1,
        previous_state: null,
        new_state: { is_custom_enabled: false },
        summary: 'Reset grade transmutation table to official DepEd SY 2026-2027 default.',
      });
    } catch (auditErr) {
      console.warn('Failed to record audit event for grade transmutation reset:', auditErr.message);
    }

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
