const express = require('express');
const router = express.Router();
const SchoolYear = require('../models/SchoolYear');

router.get('/', async (req, res) => {
  try {
    const schoolYears = await SchoolYear.findAll();
    res.json(schoolYears);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newId = await SchoolYear.create(req.body);
    res.status(201).json({ message: 'School year created successfully', school_year_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;