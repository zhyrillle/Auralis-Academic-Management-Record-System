const express = require('express');
const router = express.Router();
const User = require('../models/User');
const SectionAdviserAssignment = require('../models/SectionAdviserAssignment');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if the user is assigned as an adviser in SECTION_ADVISER_ASSIGNMENT or SECTION table
    const adviserAssignments = await SectionAdviserAssignment.findByUserId(user.user_id);
    if (adviserAssignments && adviserAssignments.length > 0) {
      user.is_adviser = true;
      user.adviser_assignment = adviserAssignments[0];
      user.role = 'adviser';
    }

    res.json({ message: 'Login successful', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await User.create(req.body);
    res.status(201).json({ message: 'User created successfully', user_id: id });
  } catch (err) {
    if (err.message.includes('Invalid role')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const adviserAssignments = await SectionAdviserAssignment.findByUserId(user.user_id);
    if (adviserAssignments && adviserAssignments.length > 0) {
      user.is_adviser = true;
      user.adviser_assignment = adviserAssignments[0];
      user.role = 'adviser';
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await User.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('Invalid role')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await User.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;