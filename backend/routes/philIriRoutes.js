const express = require('express');
const router = express.Router();
const PhilIriAssessment = require('../models/PhilIriAssessment');

// GET /api/phil-iri/coordinator/english (Dynamic English Department Coordinator from DB)
router.get('/coordinator/english', async (req, res) => {
  try {
    const [coordRows] = await require('../config/db').execute(`
      SELECT 
        u.first_name, 
        u.last_name, 
        u.middle_name,
        dh.appointed_from,
        dh.appointed_until
      FROM DEPARTMENT_HEAD dh
      JOIN DEPARTMENT d ON dh.department_id = d.department_id
      JOIN USER u ON dh.user_id = u.user_id
      WHERE UPPER(d.department_code) = 'ENG' OR UPPER(d.department_name) LIKE '%ENGLISH%'
      ORDER BY dh.appointed_until DESC, dh.department_head_id DESC
      LIMIT 1
    `);
    if (coordRows && coordRows.length > 0) {
      const c = coordRows[0];
      const m = c.middle_name ? ` ${c.middle_name.trim().charAt(0)}.` : '';
      return res.json({
        success: true,
        coordinator: {
          name: `${c.first_name || ''}${m} ${c.last_name || ''}`.trim().toUpperCase(),
          role: 'Master Teacher II - English Department Coordinator'
        }
      });
    }
    return res.json({
      success: true,
      coordinator: null
    });
  } catch (err) {
    console.error('Error fetching English coordinator:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/phil-iri/:sectionId
router.get('/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const testType = req.query.testType || 'PRE_TEST';
    const subjectOfferingId = req.query.subjectOfferingId || null;

    const records = await PhilIriAssessment.findBySection(sectionId, testType, subjectOfferingId);

    // Query assigned English Department Head dynamically from database
    let coordinator = null;
    try {
      const [coordRows] = await require('../config/db').execute(`
        SELECT 
          u.first_name, 
          u.last_name, 
          u.middle_name
        FROM DEPARTMENT_HEAD dh
        JOIN DEPARTMENT d ON dh.department_id = d.department_id
        JOIN USER u ON dh.user_id = u.user_id
        WHERE UPPER(d.department_code) = 'ENG' OR UPPER(d.department_name) LIKE '%ENGLISH%'
        ORDER BY dh.appointed_until DESC, dh.department_head_id DESC
        LIMIT 1
      `);
      if (coordRows && coordRows.length > 0) {
        const c = coordRows[0];
        const m = c.middle_name ? ` ${c.middle_name.trim().charAt(0)}.` : '';
        coordinator = {
          name: `${c.first_name || ''}${m} ${c.last_name || ''}`.trim().toUpperCase(),
          role: 'Master Teacher II - English Department Coordinator'
        };
      }
    } catch (coordErr) {
      console.warn('Could not fetch coordinator from database:', coordErr.message);
    }

    return res.json({
      success: true,
      tableReady: true,
      records: records || [],
      coordinator: coordinator
    });
  } catch (err) {
    console.error('Error fetching PHIL-IRI records:', err);
    // If the table has not yet been created in MySQL, report gracefully without throwing 500
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.json({
        success: true,
        tableReady: false,
        records: [],
        message: 'Table PHIL_IRI_ASSESSMENT does not exist yet in database.'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch PHIL-IRI records',
      details: err.message
    });
  }
});

// POST /api/phil-iri/batch
router.post('/batch', async (req, res) => {
  try {
    let { records, sectionId, subjectOfferingId, user_id } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, error: 'records array is required' });
    }

    let effectiveUserId = user_id || req.headers['x-auralis-user-id'] || null;

    // Auto-resolve subject_offering_id for English in this section if not passed
    let resolvedOfferingId = subjectOfferingId || null;
    if (!resolvedOfferingId && sectionId) {
      try {
        const [offeringRows] = await require('../config/db').execute(`
          SELECT so.subject_offering_id 
          FROM SUBJECT_OFFERING so 
          JOIN SUBJECT s ON so.subject_id = s.subject_id 
          WHERE so.section_id = ? AND (UPPER(s.subject_code) = 'ENG' OR UPPER(s.subject_name) LIKE '%ENGLISH%')
          LIMIT 1
        `, [sectionId]);
        if (offeringRows && offeringRows.length > 0) {
          resolvedOfferingId = offeringRows[0].subject_offering_id;
        }
      } catch (offErr) {
        console.warn('Could not auto-resolve subject_offering_id:', offErr.message);
      }
    }

    // Auto-resolve user_id from TEACHER_ASSIGNMENT or SECTION_ADVISER_ASSIGNMENT if not provided
    if (!effectiveUserId && resolvedOfferingId) {
      try {
        const [taRows] = await require('../config/db').execute(`
          SELECT user_id FROM TEACHER_ASSIGNMENT WHERE subject_offering_id = ? ORDER BY teacher_assignment_id DESC LIMIT 1
        `, [resolvedOfferingId]);
        if (taRows && taRows.length > 0 && taRows[0].user_id) {
          effectiveUserId = taRows[0].user_id;
        }
      } catch (taErr) {
        console.warn('Could not auto-resolve teacher user_id from TEACHER_ASSIGNMENT:', taErr.message);
      }
    }
    if (!effectiveUserId && sectionId) {
      try {
        const [saaRows] = await require('../config/db').execute(`
          SELECT user_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ? ORDER BY adviser_assignment_id DESC LIMIT 1
        `, [sectionId]);
        if (saaRows && saaRows.length > 0 && saaRows[0].user_id) {
          effectiveUserId = saaRows[0].user_id;
        }
      } catch (saaErr) {
        console.warn('Could not auto-resolve adviser user_id from SECTION_ADVISER_ASSIGNMENT:', saaErr.message);
      }
    }

    // Enrich each record with resolved subject_offering_id and user_id
    const enrichedRecords = records.map((rec) => ({
      ...rec,
      subject_offering_id: rec.subject_offering_id || resolvedOfferingId || null,
      user_id: rec.user_id || rec.recorded_by || effectiveUserId || null,
    }));

    const result = await PhilIriAssessment.upsertBatch(enrichedRecords);
    return res.json({
      success: true,
      tableReady: true,
      affectedRows: result.affectedRows
    });
  } catch (err) {
    console.error('Error saving PHIL-IRI batch:', err);
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(400).json({
        success: false,
        tableReady: false,
        error: 'PHIL_IRI_ASSESSMENT table not yet applied in MySQL database.'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to save PHIL-IRI records',
      details: err.message
    });
  }
});

module.exports = router;
