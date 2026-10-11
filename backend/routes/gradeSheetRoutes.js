const express = require('express');
const router = express.Router();
const GradeSheet = require('../models/GradeSheet');

router.get('/', async (req, res) => {
  try {
    const sheets = await GradeSheet.findAll();
    res.json(sheets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sheet = await GradeSheet.findById(req.params.id);
    if (!sheet) return res.status(404).json({ message: 'Grade Sheet not found' });
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lifecycle writes belong to Class Record submission and authorized reopening.
// Generic CRUD must not manufacture sheets, unlock them, or erase their history.
function blockDirectMutation(req, res) {
  return res.status(405).json({
    code: 'WORKFLOW_REQUIRED',
    message: 'Use the Class Record and authorized reopening workflows to manage grade sheets.',
  });
}

router.post('/', blockDirectMutation);
router.put('/:id', blockDirectMutation);
router.delete('/:id', blockDirectMutation);

module.exports = router;
