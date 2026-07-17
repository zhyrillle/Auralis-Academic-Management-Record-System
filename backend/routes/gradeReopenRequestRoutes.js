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

router.post('/', async (req, res) => {
  try {
    const newId = await GradeReopenRequest.create(req.body);
    res.status(201).json({ message: 'Reopen request submitted successfully', request_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const { status, reopen_until } = req.body; // status: 'approved' | 'declined'
    await GradeReopenRequest.updateStatus(req.params.id, status, reopen_until);
    res.json({ message: `Request status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;