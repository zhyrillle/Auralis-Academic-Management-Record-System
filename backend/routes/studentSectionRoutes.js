const express = require('express');
const router = express.Router();
const db = require('../config/db');
const StudentSection = require('../models/StudentSection');
const cloudSync = require('../services/cloudSyncService');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncStudentSectionsFromCloud();
    const enrollments = await StudentSection.findAll();
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/assign', async (req, res) => {
  try {
    const { student_id, section_id, school_year_id } = req.body;
    if (!student_id || !section_id) {
      return res.status(400).json({ error: 'student_id and section_id are required' });
    }
    const id = await StudentSection.assign(student_id, section_id, school_year_id);
    await cloudSync.forwardStudentAssignToCloud(student_id, section_id, school_year_id);
    res.json({ message: 'Student assigned successfully', student_section_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk-assign', async (req, res) => {
  try {
    const { student_ids, section_id, school_year_id } = req.body;
    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0 || !section_id) {
      return res.status(400).json({ error: 'student_ids (array) and section_id are required' });
    }
    const results = await StudentSection.bulkAssign(student_ids, section_id, school_year_id);
    if (db.cloudPool) {
      for (const sid of student_ids) {
        await cloudSync.forwardStudentAssignToCloud(sid, section_id, school_year_id);
      }
    }
    res.json({ message: 'Students assigned successfully', count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/unassign', async (req, res) => {
  try {
    const { student_id, section_id, school_year_id, student_section_id } = req.body;
    const success = await StudentSection.unassign(student_id, section_id, school_year_id, student_section_id);
    await cloudSync.forwardStudentUnassignToCloud(student_id, section_id, school_year_id, student_section_id);
    res.json({ message: 'Student unassigned successfully', success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/unassign', async (req, res) => {
  try {
    const { student_id, section_id, school_year_id, student_section_id } = req.body;
    const success = await StudentSection.unassign(student_id, section_id, school_year_id, student_section_id);
    await cloudSync.forwardStudentUnassignToCloud(student_id, section_id, school_year_id, student_section_id);
    res.json({ message: 'Student unassigned successfully', success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/eligible-students/:sectionId', async (req, res) => {
  try {
    await cloudSync.syncStudentSectionsFromCloud();
    const students = await StudentSection.getEligibleStudents(req.params.sectionId);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await cloudSync.syncStudentSectionsFromCloud();
    const enrollment = await StudentSection.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ message: 'Student Section record not found' });
    res.json(enrollment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await StudentSection.create(req.body);
    await cloudSync.forwardStudentAssignToCloud(req.body.student_id, req.body.section_id, req.body.school_year_id);
    res.status(201).json({ message: 'Student enrolled into section successfully', student_section_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await StudentSection.update(req.params.id, req.body);
    if (db.cloudPool) {
      try {
        const keys = Object.keys(req.body);
        const values = Object.values(req.body);
        const setClause = keys.map(key => `${key} = ?`).join(', ');
        await db.cloudPool.query(`UPDATE STUDENT_SECTION SET ${setClause} WHERE student_section_id = ?`, [...values, req.params.id]);
      } catch (cloudErr) {
        console.warn('[CloudStudentSection] Update dual-write failed:', cloudErr.message);
      }
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const enrollment = await StudentSection.findById(req.params.id);
    const success = await StudentSection.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Student Section record not found' });
    await cloudSync.forwardStudentUnassignToCloud(enrollment?.student_id, enrollment?.section_id, enrollment?.school_year_id, req.params.id);
    res.json({ message: 'Student Section record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;