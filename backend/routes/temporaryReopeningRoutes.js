const express = require('express');
const router = express.Router();
const TemporaryReopening = require('../models/TemporaryReopening');

router.get('/', async (req, res) => {
  try {
    const reopenings = await TemporaryReopening.findAll();
    res.json(reopenings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const reopening = await TemporaryReopening.findById(req.params.id);
    if (!reopening) return res.status(404).json({ message: 'Temporary Reopening record not found' });
    res.json(reopening);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await TemporaryReopening.create(req.body);
    res.status(201).json({ message: 'Temporary reopening granted', temporary_reopening_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await TemporaryReopening.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await TemporaryReopening.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Temporary Reopening record not found' });
    res.json({ message: 'Temporary Reopening record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;