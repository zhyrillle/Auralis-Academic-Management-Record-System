const express = require('express');
const router = express.Router();
const GradeActivity = require('../models/GradeActivity');

router.get('/', async (req, res) => {
  try {
    const activities = await GradeActivity.findAll();
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const activity = await GradeActivity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Activity not found' });
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await GradeActivity.create(req.body);
    res.status(201).json({ message: 'Grade Activity created successfully', activity_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await GradeActivity.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await GradeActivity.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Activity not found' });
    res.json({ message: 'Grade Activity deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;