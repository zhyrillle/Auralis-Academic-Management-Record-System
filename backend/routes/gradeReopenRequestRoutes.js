const express = require('express');
const router = express.Router();
const db = require('../config/db');
const GradeReopenRequest = require('../models/GradeReopenRequest');

router.get('/', async (req, res) => {
  try {
    console.log('[DEBUG ROUTE] GET /api/reopen-requests');
    const requests = await GradeReopenRequest.findAll();
    res.json(requests);
  } catch (err) {
    console.error('[ERROR ROUTE] GET /api/reopen-requests:', err.message, err.stack);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    console.log(`[DEBUG ROUTE] GET /api/reopen-requests/user/${req.params.userId}`);
    const requests = await GradeReopenRequest.findByUserId(req.params.userId);
    res.json(requests);
  } catch (err) {
    console.error(`[ERROR ROUTE] GET /api/reopen-requests/user/${req.params.userId}:`, err.message, err.stack);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const request = await GradeReopenRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Reopen Request not found' });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      teacher_assignment_id,
      term_id,
      file_size
    } = req.body;

    console.log('[DEBUG POST] /api/reopen-requests body:', req.body);

    // 1. Validate file size
    if (file_size && file_size > 10 * 1024 * 1024) {
      return res.status(400).json({
        error: 'File size exceeds maximum allowed limit of 10MB.'
      });
    }

    // 2. Validate teacher assignment
    if (!teacher_assignment_id) {
      return res.status(400).json({
        error: 'Teacher Assignment ID is required.'
      });
    }

    // 3. Validate term
    if (!term_id) {
      return res.status(400).json({
        error: 'Term ID is required.'
      });
    }

    // 4. Check existing request
    const existing =
      await GradeReopenRequest.checkExistingRequest(
        teacher_assignment_id
      );

    if (existing) {
      return res.status(400).json({
        error:
          'You have already submitted a reopening request for this section.'
      });
    }

    // 5. Copy request body
    const payload = { ...req.body };

    console.log(
      '========== GRADE SHEET RESOLUTION START =========='
    );

    console.log(
      'teacher_assignment_id:',
      teacher_assignment_id
    );

    console.log(
      'term_id:',
      term_id
    );

    // 6. ALWAYS resolve grade_sheet_id from the database
    const [gsRows] = await db.execute(
      `SELECT
         ta.teacher_assignment_id,
         ta.subject_offering_id,
         gs.grade_sheet_id,
         gs.term_id
       FROM TEACHER_ASSIGNMENT ta
       INNER JOIN GRADE_SHEET gs
         ON ta.subject_offering_id = gs.subject_offering_id
       WHERE ta.teacher_assignment_id = ?
         AND gs.term_id = ?
       LIMIT 1`,
      [teacher_assignment_id, term_id]
    );

    console.log(
      '========== GRADE SHEET LOOKUP RESULT =========='
    );

    console.log(gsRows);

    // 7. Make sure grade sheet exists
    if (gsRows.length === 0) {
      return res.status(400).json({
        error:
          'No grade sheet found for this teacher assignment and term.'
      });
    }

    // 8. Set the correct grade sheet ID
    payload.grade_sheet_id =
      gsRows[0].grade_sheet_id;

    console.log(
      '========== RESOLVED GRADE SHEET ID ==========',
      payload.grade_sheet_id
    );

    // 9. Remove frontend-only fields
    delete payload.user_id;
    delete payload.section_name;
    delete payload.section_id;
    delete payload.term_id;

    // 10. Format timestamp
    payload.requested_at = new Date()
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    console.log(
      '[DEBUG POST] Final payload to create:',
      payload
    );

    // 11. Insert request
    const id =
      await GradeReopenRequest.create(payload);

    res.status(201).json({
      message:
        'Reopen Request submitted successfully',
      request_id: id
    });

  } catch (err) {
    console.error(
      '[ERROR ROUTE] POST /api/reopen-requests:',
      err.message,
      err.stack
    );

    res.status(500).json({
      error: err.message
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await GradeReopenRequest.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await GradeReopenRequest.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Reopen Request not found' });
    res.json({ message: 'Reopen Request deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;