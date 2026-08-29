const express = require('express');
const router = express.Router();
const AuditEvent = require('../models/AuditEvent');

router.get('/summary', async (req, res) => {
  try {
    const summary = await AuditEvent.getAccountSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const events = await AuditEvent.findAll();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await AuditEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Audit Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await AuditEvent.create(req.body);
    res.status(201).json({ message: 'Audit event logged successfully', audit_event_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await AuditEvent.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Audit Event not found' });
    res.json({ message: 'Audit Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;