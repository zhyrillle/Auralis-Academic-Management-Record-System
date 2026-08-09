const express = require('express');
const router = express.Router();
const GradeReopenRequest = require('../models/GradeReopenRequest');

router.get('/', async (req, res) => {
  try {
    const requests = await GradeReopenRequest.findAll();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const request = await GradeReopenRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Reopen Request not found' });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await GradeReopenRequest.create(req.body);
    res.status(201).json({ message: 'Reopen Request submitted successfully', request_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await GradeReopenRequest.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await GradeReopenRequest.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Reopen Request not found' });
    res.json({ message: 'Reopen Request deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;