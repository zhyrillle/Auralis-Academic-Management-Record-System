const express = require('express');
const router = express.Router();
const db = require('../config/db');
const Student = require('../models/Student');
const cloudSync = require('../services/cloudSyncService');
const { encryptLrn, hashLrn } = require('../utils/encryption');

router.get('/', async (req, res) => {
  try {
    await cloudSync.syncStudentsFromCloud();
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
    await cloudSync.syncStudentsFromCloud();
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/lrn/:lrn', async (req, res) => {
  try {
    await cloudSync.syncStudentsFromCloud();
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

    if (db.cloudPool) {
      const encLrn = encryptLrn(cleanLrn);
      const lrnHash = hashLrn(cleanLrn);

      const [cloudExisting] = await db.cloudPool.query(
        'SELECT student_id FROM STUDENT WHERE lrn_hash = ? OR LRN = ?',
        [lrnHash, cleanLrn]
      );
      if (cloudExisting && cloudExisting.length > 0) {
        return res.status(400).json({ message: `A student with LRN ${cleanLrn} already exists in cloud database.` });
      }

      const bdate = cloudSync.formatDate(req.body.birthdate);

      // 1. Authoritative insert into Aiven Cloud first
      const [cloudResult] = await db.cloudPool.query(
        `INSERT INTO STUDENT (LRN, lrn_hash, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status, program_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          encLrn,
          lrnHash,
          String(first_name).trim(),
          req.body.middle_name ? String(req.body.middle_name).trim() : null,
          String(last_name).trim(),
          req.body.extension_name ? String(req.body.extension_name).trim() : null,
          bdate,
          req.body.sex || 'M',
          req.body.street || null,
          req.body.barangay || null,
          req.body.city || null,
          req.body.province || null,
          req.body.country || null,
          req.body.postal_code || null,
          req.body.status || 'ACTIVE',
          req.body.program_id || null,
        ]
      );
      const authoritativeId = cloudResult.insertId;

      // 2. Insert into local MySQL with authoritative ID
      await Student.initTable();
      await db.execute(
        `INSERT INTO STUDENT (student_id, LRN, lrn_hash, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status, program_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           LRN = VALUES(LRN),
           lrn_hash = VALUES(lrn_hash),
           first_name = VALUES(first_name),
           middle_name = VALUES(middle_name),
           last_name = VALUES(last_name),
           extension_name = VALUES(extension_name),
           birthdate = VALUES(birthdate),
           sex = VALUES(sex),
           street = VALUES(street),
           barangay = VALUES(barangay),
           city = VALUES(city),
           province = VALUES(province),
           country = VALUES(country),
           postal_code = VALUES(postal_code),
           status = VALUES(status),
           program_id = VALUES(program_id)`,
        [
          authoritativeId,
          encLrn,
          lrnHash,
          String(first_name).trim(),
          req.body.middle_name ? String(req.body.middle_name).trim() : null,
          String(last_name).trim(),
          req.body.extension_name ? String(req.body.extension_name).trim() : null,
          bdate,
          req.body.sex || 'M',
          req.body.street || null,
          req.body.barangay || null,
          req.body.city || null,
          req.body.province || null,
          req.body.country || null,
          req.body.postal_code || null,
          req.body.status || 'ACTIVE',
          req.body.program_id || null,
        ]
      );

      const createdStudent = await Student.findById(authoritativeId);
      return res.status(201).json({
        message: 'Student registered successfully',
        student_id: authoritativeId,
        student: createdStudent,
      });
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

    if (db.cloudPool) {
      try {
        const allowedKeys = [
          'LRN', 'first_name', 'middle_name', 'last_name', 'extension_name', 
          'birthdate', 'sex', 'street', 'barangay', 'city', 'province', 
          'country', 'postal_code', 'status', 'program_id'
        ];
        const updates = [];
        const values = [];

        for (const key of allowedKeys) {
          if (req.body[key] !== undefined) {
            if (key === 'LRN') {
              const clean = String(req.body.LRN).trim();
              updates.push('LRN = ?', 'lrn_hash = ?');
              values.push(encryptLrn(clean), hashLrn(clean));
            } else if (key === 'birthdate') {
              updates.push('birthdate = ?');
              values.push(cloudSync.formatDate(req.body.birthdate));
            } else {
              updates.push(`${key} = ?`);
              values.push(req.body[key] === '' ? null : req.body[key]);
            }
          }
        }

        if (updates.length > 0) {
          values.push(req.params.id);
          await db.cloudPool.query(`UPDATE STUDENT SET ${updates.join(', ')} WHERE student_id = ?`, values);
        }
      } catch (cloudErr) {
        console.warn('[CloudStudent] Update dual-write failed:', cloudErr.message);
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await Student.delete(req.params.id);
    if (!success) return res.status(404).json({ message: 'Student not found' });

    if (db.cloudPool) {
      try {
        const [cloudSsRows] = await db.cloudPool.query('SELECT student_section_id FROM STUDENT_SECTION WHERE student_id = ?', [req.params.id]).catch(() => [[]]);
        for (const ss of cloudSsRows) {
          await db.cloudPool.query('DELETE FROM ATTENDANCE WHERE student_section_id = ?', [ss.student_section_id]).catch(() => {});
          await db.cloudPool.query('DELETE FROM PHIL_IRI_ASSESSMENT WHERE student_section_id = ?', [ss.student_section_id]).catch(() => {});
          await db.cloudPool.query('DELETE FROM PHIL_IRI_SCREENING WHERE student_section_id = ?', [ss.student_section_id]).catch(() => {});
          await db.cloudPool.query('DELETE FROM SCORE WHERE student_section_id = ?', [ss.student_section_id]).catch(() => {});
        }
        await db.cloudPool.query('DELETE FROM STUDENT_GRADE WHERE student_id = ?', [req.params.id]).catch(() => {});
        await db.cloudPool.query('DELETE FROM STUDENT_SECTION WHERE student_id = ?', [req.params.id]).catch(() => {});
        await db.cloudPool.query('DELETE FROM STUDENT WHERE student_id = ?', [req.params.id]).catch(() => {});
      } catch (cloudErr) {
        console.warn('[CloudStudent] Delete dual-write failed:', cloudErr.message);
      }
    }

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;