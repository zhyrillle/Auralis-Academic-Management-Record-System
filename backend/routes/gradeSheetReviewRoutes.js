const express = require('express');
const router = express.Router();
const GradeSheetReview = require('../models/GradeSheetReview');

router.get('/', async (req, res) => {
  try {
    const reviews = await GradeSheetReview.findAll();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const review = await GradeSheetReview.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Grade Sheet Review record not found' });
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await GradeSheetReview.create(req.body);
    res.status(201).json({ message: 'Review recorded successfully', review_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await GradeSheetReview.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await GradeSheetReview.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Grade Sheet Review record not found' });
    res.json({ message: 'Review record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;