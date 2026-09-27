const express = require('express');
const router = express.Router();
const Section = require('../models/Section');
const classRecordRoutes = require('./classRecordRoutes');

router.get('/', async (req, res) => {
  try {
    const sections = await Section.findAll();
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/adviser/:userId', async (req, res) => {
  try {
    const sections = await Section.findAdviserSections(req.params.userId);
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/students', async (req, res) => {
  try {
    const subjectOfferingId = req.query.subject_offering_id || req.query.subjectOfferingId || null;
    const subjectId = req.query.subject_id || req.query.subjectId || null;
    const subjectName = req.query.subject_name || req.query.subjectName || req.query.subject || null;

    if (subjectOfferingId && classRecordRoutes.syncOfferingGradesInternal) {
      await classRecordRoutes.syncOfferingGradesInternal(subjectOfferingId, 'T1');
      await classRecordRoutes.syncOfferingGradesInternal(subjectOfferingId, 'T2');
      await classRecordRoutes.syncOfferingGradesInternal(subjectOfferingId, 'T3');
    }

    const students = await Section.findStudentsBySection(req.params.id, subjectOfferingId, subjectId, subjectName);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const section = await Section.findById(req.params.id);
    if (!section) return res.status(404).json({ message: 'Section not found' });
    res.json(section);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await Section.create(req.body);
    res.status(201).json({ message: 'Section created successfully', section_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Section.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Section.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Section not found' });
    res.json({ message: 'Section deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;