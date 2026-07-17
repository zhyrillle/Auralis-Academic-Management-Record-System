const express = require('express');
const router = express.Router();
const Section = require('../models/Section');

router.get('/', async (req, res) => {
  try {
    const sections = await Section.findAll();
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newId = await Section.create(req.body);
    res.status(201).json({ message: 'Section created successfully', section_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;