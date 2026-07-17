const express = require('express');
const router = express.Router();
const GradeSubmission = require('../models/GradeSubmission');

router.get('/', async (req, res) => {
  try {
    const submissions = await GradeSubmission.findAll();
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newId = await GradeSubmission.create(req.body);
    res.status(201).json({ message: 'Submission window created successfully', submission_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await GradeSubmission.updateStatus(req.params.id, status);
    res.json({ message: 'Submission status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;