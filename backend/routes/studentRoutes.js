const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

router.get('/', async (req, res) => {
  try {
    const students = await Student.findAll();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/meta/programs', async (req, res) => {
  try {
    const programs = await Student.findAllPrograms();
    res.json(programs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/programs', async (req, res) => {
  try {
    const programs = await Student.findAllPrograms();
    res.json(programs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lrn/:lrn', async (req, res) => {
  try {
    const student = await Student.findByLRN(req.params.lrn);
    if (!student) return res.status(404).json({ message: 'Student LRN not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { LRN, first_name, last_name } = req.body;
    if (!LRN || !String(LRN).trim()) {
      return res.status(400).json({ message: 'Learner Reference Number (LRN) is required.' });
    }
    const cleanLrn = String(LRN).trim();
    if (!/^\d{12}$/.test(cleanLrn)) {
      return res.status(400).json({ message: 'LRN must be exactly 12 numeric digits.' });
    }
    if (!first_name || !String(first_name).trim()) {
      return res.status(400).json({ message: 'First name is required.' });
    }
    if (!last_name || !String(last_name).trim()) {
      return res.status(400).json({ message: 'Last name is required.' });
    }

    const existing = await Student.findByLRN(cleanLrn);
    if (existing) {
      return res.status(400).json({ message: `A student with LRN ${cleanLrn} already exists.` });
    }

    const payload = {
      ...req.body,
      LRN: cleanLrn,
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      middle_name: req.body.middle_name ? String(req.body.middle_name).trim() : null,
      extension_name: req.body.extension_name ? String(req.body.extension_name).trim() : null,
    };

    const id = await Student.create(payload);
    const createdStudent = await Student.findById(id);
    res.status(201).json({
      message: 'Student registered successfully',
      student_id: id,
      student: createdStudent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Student.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Student.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Student not found' });
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;