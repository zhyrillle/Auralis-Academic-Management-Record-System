const express = require('express');
const router = express.Router();
const DepartmentHead = require('../models/DepartmentHead');

router.get('/', async (req, res) => {
  try {
    const heads = await DepartmentHead.findAll();
    res.json(heads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const head = await DepartmentHead.findById(req.params.id);
    if (!head) return res.status(404).json({ message: 'Department Head assignment not found' });
    res.json(head);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await DepartmentHead.create(req.body);
    res.status(201).json({ message: 'Department Head appointed successfully', department_head_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await DepartmentHead.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await DepartmentHead.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Department Head assignment not found' });
    res.json({ message: 'Department Head assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;