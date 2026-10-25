const express = require('express');
const router = express.Router();
const db = require('../config/db');
const Section = require('../models/Section');
const cloudSync = require('../services/cloudSyncService');


router.get('/', async (req, res) => {
  try {
    await cloudSync.syncSectionsFromCloud();
    const sections = await Section.findAll();
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/adviser/:userId', async (req, res) => {
  try {
    await cloudSync.syncSectionsFromCloud();
    const sections = await Section.findAdviserSections(req.params.userId);
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/students', async (req, res) => {
  try {
    await cloudSync.syncStudentSectionsFromCloud();

    const subjectOfferingId = req.query.subject_offering_id || req.query.subjectOfferingId || null;
    const subjectId = req.query.subject_id || req.query.subjectId || null;
    const subjectName = req.query.subject_name || req.query.subjectName || req.query.subject || null;

    const students = await Section.findStudentsBySection(req.params.id, subjectOfferingId, subjectId, subjectName);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await cloudSync.syncSectionsFromCloud();
    const section = await Section.findById(req.params.id);
    if (!section) return res.status(404).json({ message: 'Section not found' });
    res.json(section);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (db.cloudPool) {
      const { section_name, name, grade_level_id, level, program_id, is_specialized } = req.body;
      const finalName = (section_name || name || '').trim();
      const finalGradeLevelId = await Section.resolveGradeLevelId(grade_level_id, level);
      const finalIsSpec = is_specialized ? 1 : 0;
      const finalProgId = finalIsSpec ? (program_id ? Number(program_id) : 1) : 4;

      // 1. Authoritative cloud insert
      const [cloudResult] = await db.cloudPool.query(
        `INSERT INTO SECTION (section_name, grade_level_id, program_id, is_specialized) VALUES (?, ?, ?, ?)`,
        [finalName, finalGradeLevelId, finalProgId, finalIsSpec]
      );
      const authoritativeId = cloudResult.insertId;

      // 2. Local insert with authoritative ID
      await db.execute(
        `INSERT INTO SECTION (section_id, section_name, grade_level_id, program_id, is_specialized)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           section_name = VALUES(section_name),
           grade_level_id = VALUES(grade_level_id),
           program_id = VALUES(program_id),
           is_specialized = VALUES(is_specialized)`,
        [authoritativeId, finalName, finalGradeLevelId, finalProgId, finalIsSpec]
      );

      return res.status(201).json({ message: 'Section created successfully', section_id: authoritativeId });
    }

    const id = await Section.create(req.body);
    res.status(201).json({ message: 'Section created successfully', section_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await Section.update(req.params.id, req.body);

    if (db.cloudPool) {
      try {
        const { section_name, name, grade_level_id, level, program_id, is_specialized } = req.body;
        const finalName = (section_name || name || '').trim();
        const updates = [];
        const values = [];

        if (finalName) {
          updates.push('section_name = ?');
          values.push(finalName);
        }
        if (grade_level_id !== undefined || level !== undefined) {
          const finalGradeLevelId = await Section.resolveGradeLevelId(grade_level_id, level);
          updates.push('grade_level_id = ?');
          values.push(finalGradeLevelId);
        }

        const finalIsSpec = is_specialized !== undefined ? (is_specialized ? 1 : 0) : null;
        let finalProgId = program_id !== undefined ? (program_id ? Number(program_id) : null) : null;

        if (finalIsSpec !== null) {
          updates.push('is_specialized = ?');
          values.push(finalIsSpec);
          if (finalIsSpec === 1) {
            finalProgId = finalProgId || 1;
            updates.push('program_id = ?');
            values.push(finalProgId);
          } else {
            finalProgId = 4;
            updates.push('program_id = ?');
            values.push(4);
          }
        } else if (program_id !== undefined) {
          updates.push('program_id = ?');
          values.push(program_id || 4);
        }

        if (updates.length > 0) {
          values.push(req.params.id);
          await db.cloudPool.query(`UPDATE SECTION SET ${updates.join(', ')} WHERE section_id = ?`, values);
        }

        if (finalProgId !== null) {
          await db.cloudPool.query(`
            UPDATE STUDENT s
            JOIN STUDENT_SECTION ss ON ss.student_id = s.student_id
            SET s.program_id = ?
            WHERE ss.section_id = ?
          `, [finalProgId, req.params.id]).catch(() => {});
        }
      } catch (cloudErr) {
        console.warn('[CloudSection] Update dual-write failed:', cloudErr.message);
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Section.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Section not found' });

    if (db.cloudPool) {
      try {
        await db.cloudPool.query('DELETE FROM STUDENT_SECTION WHERE section_id = ?', [req.params.id]).catch(() => {});
        await db.cloudPool.query('DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ?', [req.params.id]).catch(() => {});
        await db.cloudPool.query('DELETE FROM SUBJECT_OFFERING WHERE section_id = ?', [req.params.id]).catch(() => {});
        await db.cloudPool.query('DELETE FROM SECTION WHERE section_id = ?', [req.params.id]).catch(() => {});
      } catch (cloudErr) {
        console.warn('[CloudSection] Delete dual-write failed:', cloudErr.message);
      }
    }

    res.json({ message: 'Section deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
