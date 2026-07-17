const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

router.get('/user/:id', async (req, res) => {
  try {
    const notifications = await Notification.findByUserId(req.params.id);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const newId = await Notification.create(req.body);
    res.status(201).json({ message: 'Notification created successfully', notification_id: newId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    await Notification.markAsRead(req.params.id);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;