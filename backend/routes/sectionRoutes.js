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

// GET /api/sections/grade-level/subjects - Get all subjects offered across all grade levels
router.get('/grade-level/subjects', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud().catch(() => {});
    const subjects = await Section.findAllGradeLevelSubjects();
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sections/grade-level/:gradeLevelId/subjects - Get subjects offered in this grade level
router.get('/grade-level/:gradeLevelId/subjects', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud().catch(() => {});
    const subjects = await Section.findSubjectsByGradeLevel(req.params.gradeLevelId);
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sections/grade-level/:gradeLevelId/subjects - Add subject(s) across sections of this grade level
router.post('/grade-level/:gradeLevelId/subjects', async (req, res) => {
  try {
    const { subject_ids, section_id, section_type, school_year_id } = req.body;
    const result = await Section.addSubjectsToGradeLevel(req.params.gradeLevelId, {
      subject_ids,
      section_id: section_id || null,
      section_type: section_type || 'all',
      school_year_id,
    });
    res.status(201).json({
      message: `Added subject(s) across ${result.sections_affected} section(s).`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sections/grade-level/:gradeLevelId/subjects/:subjectId - Drop a subject across sections of this grade level
router.delete('/grade-level/:gradeLevelId/subjects/:subjectId', async (req, res) => {
  try {
    const section_type = req.body?.section_type || req.query.section_type || 'all';
    const section_id = req.body?.section_id || req.query.section_id || null;
    const school_year_id = req.body?.school_year_id || null;
    const result = await Section.dropSubjectFromGradeLevel(req.params.gradeLevelId, req.params.subjectId, {
      section_id,
      section_type,
      school_year_id,
    });
    if (result.blocked_count > 0 && result.dropped_count === 0) {
      return res.status(400).json({
        error: `Cannot drop this subject because grades or scores are already recorded in section(s): ${result.blocked_sections.join(', ')}.`,
      });
    }
    res.json({
      message: `Dropped subject from ${result.dropped_count} section(s).` +
        (result.blocked_count > 0 ? ` (${result.blocked_count} section(s) skipped due to existing recorded grades).` : ''),
      ...result,
    });
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
      const { section_name, name, grade_level_id, level, program_id, is_specialized, subject_ids, school_year_id } = req.body;
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

      // 3. Attach default subjects
      try {
        await Section.attachDefaultSubjects(authoritativeId, finalProgId, finalIsSpec, subject_ids, school_year_id);
      } catch (soErr) {
        console.warn('Failed to auto-attach subjects to cloud section:', soErr.message);
      }

      return res.status(201).json({ message: 'Section created successfully', section_id: authoritativeId });
    }

    const id = await Section.create(req.body);
    res.status(201).json({ message: 'Section created successfully', section_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sections/:id/subjects - Get all subjects offered for this section
router.get('/:id/subjects', async (req, res) => {
  try {
    await cloudSync.syncAcademicAssignmentsFromCloud().catch(() => {});
    const schoolYearId = req.query.schoolYearId || req.query.school_year_id || null;
    if (schoolYearId !== null && (!Number.isSafeInteger(Number(schoolYearId)) || Number(schoolYearId) <= 0)) {
      return res.status(400).json({ error: 'Choose a valid school year.' });
    }
    const subjects = await Section.findSubjectsBySection(req.params.id, schoolYearId);
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sections/:id/subjects - Dynamically add subject(s) to a section
router.post('/:id/subjects', async (req, res) => {
  try {
    const sectionId = req.params.id;
    const { subject_id, subject_ids, school_year_id } = req.body;
    const targetIds = Array.isArray(subject_ids) && subject_ids.length > 0 
      ? subject_ids.map(Number) 
      : (subject_id ? [Number(subject_id)] : []);

    if (!targetIds.length) return res.status(400).json({ error: 'subject_id or subject_ids is required' });

    let finalSchoolYearId = school_year_id;
    if (!finalSchoolYearId) {
      finalSchoolYearId = await Section.getActiveSchoolYearId();
    }

    const createdIds = [];
    for (const subId of targetIds) {
      // Check if offering already exists
      const [existing] = await db.execute(
        `SELECT subject_offering_id FROM SUBJECT_OFFERING WHERE section_id = ? AND subject_id = ? AND school_year_id = ? LIMIT 1`,
        [sectionId, subId, finalSchoolYearId]
      );
      if (existing.length > 0) continue;

      let cloudId = null;
      if (db.cloudPool) {
        try {
          const [cloudSec] = await db.cloudPool.query(
            `SELECT section_id FROM SECTION WHERE section_id = ? LIMIT 1`,
            [sectionId]
          );
          if (cloudSec.length > 0) {
            const [cloudRes] = await db.cloudPool.query(
              `INSERT INTO SUBJECT_OFFERING (subject_id, section_id, school_year_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE subject_offering_id = LAST_INSERT_ID(subject_offering_id)`,
              [subId, sectionId, finalSchoolYearId]
            );
            cloudId = cloudRes.insertId;
          }
        } catch (cErr) {
          console.warn('[CloudSection] Add subject offering cloud insert failed:', cErr.message);
        }
      }

      let newId;
      if (cloudId) {
        await db.execute(
          `INSERT INTO SUBJECT_OFFERING (subject_offering_id, subject_id, section_id, school_year_id)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             subject_id = VALUES(subject_id),
             section_id = VALUES(section_id),
             school_year_id = VALUES(school_year_id)`,
          [cloudId, subId, sectionId, finalSchoolYearId]
        );
        newId = cloudId;
      } else {
        const [localRes] = await db.execute(
          `INSERT INTO SUBJECT_OFFERING (subject_id, section_id, school_year_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE subject_offering_id = LAST_INSERT_ID(subject_offering_id)`,
          [subId, sectionId, finalSchoolYearId]
        );
        newId = localRes.insertId;
      }
      createdIds.push(newId);
    }

    res.status(201).json({
      message: `Added ${createdIds.length} subject(s) to section successfully`,
      count: createdIds.length,
      subject_offering_ids: createdIds,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sections/:id/subjects/default - Auto-assign default curriculum subjects to an existing section
router.post('/:id/subjects/default', async (req, res) => {
  try {
    const section = await Section.findById(req.params.id);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const result = await Section.attachDefaultSubjects(
      req.params.id,
      section.program_id,
      section.is_specialized,
      req.body.subject_ids,
      req.body.school_year_id
    );

    res.json({ message: `Assigned ${result.count} subjects to section.`, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sections/:id/subjects/:offeringId - Remove a subject offering from a section
router.delete('/:id/subjects/:offeringId', async (req, res) => {
  try {
    const { id: sectionId, offeringId } = req.params;

    // Safety check: check if any grades or scores exist for this subject offering
    const [scoreCheck] = await db.execute(
      `SELECT score_id FROM SCORE s
       INNER JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = s.teacher_assignment_id
       WHERE ta.subject_offering_id = ? LIMIT 1`,
      [offeringId]
    ).catch(() => [[]]);

    const [gradeCheck] = await db.execute(
      `SELECT student_grade_id FROM STUDENT_GRADE WHERE subject_offering_id = ? LIMIT 1`,
      [offeringId]
    ).catch(() => [[]]);

    if (scoreCheck.length > 0 || gradeCheck.length > 0) {
      return res.status(400).json({
        error: 'Cannot remove this subject offering because grades or scores are already recorded for it.'
      });
    }

    if (db.cloudPool) {
      try {
        await db.cloudPool.query(`DELETE FROM TEACHER_ASSIGNMENT WHERE subject_offering_id = ?`, [offeringId]).catch(() => {});
        await db.cloudPool.query(`DELETE FROM SUBJECT_OFFERING WHERE subject_offering_id = ? AND section_id = ?`, [offeringId, sectionId]).catch(() => {});
      } catch (cErr) {
        console.warn('[CloudSection] Delete subject offering cloud failed:', cErr.message);
      }
    }

    await db.execute(`DELETE FROM TEACHER_ASSIGNMENT WHERE subject_offering_id = ?`, [offeringId]).catch(() => {});
    const [result] = await db.execute(`DELETE FROM SUBJECT_OFFERING WHERE subject_offering_id = ? AND section_id = ?`, [offeringId, sectionId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Subject offering not found for this section' });
    }

    res.json({ message: 'Subject removed from section successfully' });
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
        await Section.deleteCascade(db.cloudPool, req.params.id);
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
