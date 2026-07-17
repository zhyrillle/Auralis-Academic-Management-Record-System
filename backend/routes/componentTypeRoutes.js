const express = require('express');
const router = express.Router();
const ComponentType = require('../models/ComponentType');

router.get('/', async (req, res) => {
  try {
    const components = await ComponentType.findAll();
    res.json(components);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newId = await ComponentType.create(req.body);
    res.status(201).json({ message: 'Component type created successfully', component_type_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;