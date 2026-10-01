const express = require('express');
const router = express.Router();
const SubjectComponentWeight = require('../models/SubjectComponentWeight');
const SchoolYear = require('../models/SchoolYear');
const AuditEvent = require('../models/AuditEvent');

const isPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

const validateConfiguration = (weights) => {
  if (!Array.isArray(weights) || weights.length === 0) {
    return 'At least one subject weight is required.';
  }

  const totalsBySubject = new Map();
  const componentsBySubject = new Map();

  for (const weight of weights) {
    if (!isPositiveInteger(weight.subject_id) || !isPositiveInteger(weight.component_type_id)) {
      return 'Every weight must have a valid subject and component type.';
    }

    const percentage = Number(weight.percentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      return 'Every percentage must be between 0 and 100.';
    }

    const subjectId = Number(weight.subject_id);
    const componentId = Number(weight.component_type_id);
    const componentKey = `${subjectId}:${componentId}`;
    const subjectComponents = componentsBySubject.get(subjectId) || new Set();

    if (subjectComponents.has(componentKey)) {
      return 'A component type may only appear once per subject.';
    }

    subjectComponents.add(componentKey);
    componentsBySubject.set(subjectId, subjectComponents);
    totalsBySubject.set(subjectId, (totalsBySubject.get(subjectId) || 0) + percentage);
  }

  for (const total of totalsBySubject.values()) {
    if (Math.abs(total - 100) > 0.001) {
      return 'Component weights for every subject must total exactly 100%.';
    }
  }

  return null;
};

router.get('/configuration/:schoolYearId', async (req, res) => {
  if (!isPositiveInteger(req.params.schoolYearId)) {
    return res.status(400).json({ error: 'Invalid school year ID.' });
  }

  try {
    const rows = await SubjectComponentWeight.findConfiguration(
      Number(req.params.schoolYearId)
    );
    res.json({ school_year_id: Number(req.params.schoolYearId), rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/configuration/:schoolYearId/inherit', async (req, res) => {
  if (!isPositiveInteger(req.params.schoolYearId)) {
    return res.status(400).json({ error: 'Invalid school year ID.' });
  }

  try {
    const result = await SubjectComponentWeight.inheritFromPreviousSchoolYear(
      Number(req.params.schoolYearId)
    );

    const actorId = req.headers['x-auralis-user-id'] ? Number(req.headers['x-auralis-user-id']) : null;
    await AuditEvent.create({
      user_id: actorId,
      actor_context: { source: actorId ? 'user' : 'system', acting_as: 'System Administrator' },
      event_type: 'SUBJECT_WEIGHTS_INHERITED',
      module_name: 'WS_CONFIGURATION',
      entity_type: 'SUBJECT_COMPONENT_WEIGHT',
      entity_id: Number(req.params.schoolYearId),
      after_data: { school_year_id: Number(req.params.schoolYearId), inserted_count: result.inserted_count },
      metadata: {
        school_year: `SY ${req.params.schoolYearId}`,
        summary: 'Inherited component weights from previous school year.',
        impact: 'Medium',
      },
    }).catch((err) => console.error('Failed to log weight inherit audit:', err.message));

    res.json({
      message:
        result.inserted_count > 0
          ? 'Component weights inherited from the previous school year.'
          : 'No additional component weights needed to be inherited.',
      school_year_id: Number(req.params.schoolYearId),
      ...result,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/configuration/:schoolYearId', async (req, res) => {
  if (!isPositiveInteger(req.params.schoolYearId)) {
    return res.status(400).json({ error: 'Invalid school year ID.' });
  }

  const validationError = validateConfiguration(req.body.weights);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const schoolYear = await SchoolYear.findById(
      Number(req.params.schoolYearId)
    );

    if (!schoolYear) {
      return res.status(404).json({ error: 'School year not found.' });
    }

    if (String(schoolYear.status).toLowerCase() !== 'ongoing') {
      return res.status(409).json({
        error: 'Only the ongoing school-year configuration can be edited.',
      });
    }

    const rows = await SubjectComponentWeight.saveConfiguration(
      Number(req.params.schoolYearId),
      req.body.weights.map((weight) => ({
        subject_id: Number(weight.subject_id),
        component_type_id: Number(weight.component_type_id),
        percentage: Number(weight.percentage),
      }))
    );

    const actorId = req.headers['x-auralis-user-id'] ? Number(req.headers['x-auralis-user-id']) : null;
    await AuditEvent.create({
      user_id: actorId,
      actor_context: { source: actorId ? 'user' : 'system', acting_as: 'System Administrator' },
      event_type: 'SUBJECT_WEIGHTS_UPDATED',
      module_name: 'WS_CONFIGURATION',
      entity_type: 'SUBJECT_COMPONENT_WEIGHT',
      entity_id: Number(req.params.schoolYearId),
      after_data: { school_year_id: Number(req.params.schoolYearId), count: rows.length },
      metadata: {
        school_year: `SY ${req.params.schoolYearId}`,
        summary: 'Updated subject component weights configuration.',
        impact: 'Medium',
      },
    }).catch((err) => console.error('Failed to log weight update audit:', err.message));

    res.json({
      message: 'Component weights saved successfully.',
      school_year_id: Number(req.params.schoolYearId),
      rows,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const weights = await SubjectComponentWeight.findAll();
    res.json(weights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const weight = await SubjectComponentWeight.findById(req.params.id);
    if (!weight) return res.status(404).json({ message: 'Weight configuration not found' });
    res.json(weight);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await SubjectComponentWeight.create(req.body);
    res.status(201).json({ message: 'Component weight configured successfully', subj_comp_weight_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await SubjectComponentWeight.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await SubjectComponentWeight.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Weight configuration not found' });
    res.json({ message: 'Component weight deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
