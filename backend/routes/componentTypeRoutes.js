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

router.get('/:id', async (req, res) => {
  try {
    const component = await ComponentType.findById(req.params.id);
    if (!component) return res.status(404).json({ message: 'Component Type not found' });
    res.json(component);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await ComponentType.create(req.body);
    res.status(201).json({ message: 'Component Type created successfully', component_type_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await ComponentType.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await ComponentType.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Component Type not found' });
    res.json({ message: 'Component Type deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;