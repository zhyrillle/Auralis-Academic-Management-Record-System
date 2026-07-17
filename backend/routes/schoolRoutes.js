const express = require('express');
const router = express.Router();
const School = require('../models/School');

router.get('/', async (req, res) => {
  try {
    const schools = await School.findAll();
    res.json(schools);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json(school);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newSchoolId = await School.create(req.body);
    res.status(201).json({ message: 'School created successfully', school_id: newSchoolId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;