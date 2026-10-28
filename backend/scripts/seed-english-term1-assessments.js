const db = require('../config/db');

async function seedEnglishTerm1() {
  console.log('====================================================');
  console.log('🌱 SEEDING ENGLISH TERM 1 & HISTORICAL DATA');
  console.log('====================================================');

  // 1. Identify School Year 2026-2027 (school_year_id = 1) and Terms
  const [sy26] = await db.execute(`SELECT school_year_id FROM SCHOOL_YEAR WHERE starts_on = 2026 OR starts_on LIKE '2026%' LIMIT 1`);
  const syId = sy26[0]?.school_year_id || 1;

  const [terms] = await db.execute(`SELECT term_id, term_name FROM ACADEMIC_TERM WHERE school_year_id = ?`, [syId]);
  const term1 = terms.find(t => t.term_name === '1st' || t.term_name === 'T1' || t.term_id === 1);
  const term2 = terms.find(t => t.term_name === '2nd' || t.term_name === 'T2' || t.term_id === 3);

  if (!term1) throw new Error('Term 1 not found in ACADEMIC_TERM');
  const t1Id = term1.term_id;
  const t2Id = term2 ? term2.term_id : 3;

  console.log(`📍 Using SY ID ${syId} | Term 1 ID: ${t1Id} | Term 2 ID: ${t2Id}`);

  // 2. Fetch all English offerings in SY 2026-2027
  const [offerings] = await db.execute(`
    SELECT so.subject_offering_id, so.subject_id, so.section_id, sec.section_name, sec.grade_level_id, gl.grade_level_name
    FROM SUBJECT_OFFERING so
    JOIN SUBJECT sub ON sub.subject_id = so.subject_id
    JOIN SECTION sec ON sec.section_id = so.section_id
    JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
    WHERE so.school_year_id = ? AND (UPPER(sub.subject_code) IN ('ENG', 'ENGLISH') OR UPPER(sub.subject_name) = 'ENGLISH')
    ORDER BY sec.section_name
  `, [syId]);

  console.log(`Found ${offerings.length} English offerings in SY 2026-2027.`);

  // 3. For each offering, ensure Term 1 grade sheet exists and is SUBMITTED & TERM_LOCKED
  for (const off of offerings) {
    let [sheets] = await db.execute(`
      SELECT grade_sheet_id, workflow_status, lock_status
      FROM GRADE_SHEET
      WHERE subject_offering_id = ? AND term_id = ?
    `, [off.subject_offering_id, t1Id]);

    let sheetId;
    if (sheets.length === 0) {
      const [res] = await db.execute(`
        INSERT INTO GRADE_SHEET (subject_offering_id, term_id, workflow_status, lock_status)
        VALUES (?, ?, 'SUBMITTED', 'TERM_LOCKED')
      `, [off.subject_offering_id, t1Id]);
      sheetId = res.insertId;
      console.log(`  + Created Term 1 Grade Sheet ${sheetId} for ${off.section_name} (${off.grade_level_name})`);
    } else {
      sheetId = sheets[0].grade_sheet_id;
      await db.execute(`
        UPDATE GRADE_SHEET
        SET workflow_status = 'SUBMITTED', lock_status = 'TERM_LOCKED'
        WHERE grade_sheet_id = ?
      `, [sheetId]);
      console.log(`  ✓ Updated Term 1 Grade Sheet ${sheetId} to SUBMITTED & TERM_LOCKED for ${off.section_name}`);
    }

    // Check if Term 2 has activities & scores to copy
    const [t2Sheets] = await db.execute(`
      SELECT grade_sheet_id FROM GRADE_SHEET WHERE subject_offering_id = ? AND term_id = ?
    `, [off.subject_offering_id, t2Id]);

    if (t2Sheets.length > 0) {
      const t2SheetId = t2Sheets[0].grade_sheet_id;
      const [t2Acts] = await db.execute(`
        SELECT ga.activity_id, ga.subj_comp_weight_id, ga.activity_name, ga.highest_possible_score, ga.status
        FROM GRADE_ACTIVITY ga
        WHERE ga.grade_sheet_id = ?
      `, [t2SheetId]);

      if (t2Acts.length >= 3) {
        // Check existing T1 activities
        const [t1Acts] = await db.execute(`SELECT activity_id FROM GRADE_ACTIVITY WHERE grade_sheet_id = ?`, [sheetId]);
        if (t1Acts.length === 0) {
          // Copy activities and scores from T2 to T1
          for (const a of t2Acts) {
            const [actRes] = await db.execute(`
              INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, status)
              VALUES (?, ?, ?, ?, ?)
            `, [sheetId, a.subj_comp_weight_id, a.activity_name, a.highest_possible_score, a.status || 'ACTIVE']);
            const newActId = actRes.insertId;

            // Copy scores
            const [t2Scores] = await db.execute(`
              SELECT student_section_id, raw_score, score_status
              FROM SCORE
              WHERE activity_id = ?
            `, [a.activity_id]);

            for (const s of t2Scores) {
              await db.execute(`
                INSERT INTO SCORE (activity_id, student_section_id, raw_score, score_status)
                VALUES (?, ?, ?, ?)
              `, [newActId, s.student_section_id, s.raw_score, s.score_status || 'ENCODED']);
            }
          }
          console.log(`    -> Copied ${t2Acts.length} activities and scores from T2 to T1 for ${off.section_name}`);
        }
      }
    }

    // If T1 still doesn't have activities, create standard 5 activities and encode scores for enrolled students
    const [checkActs] = await db.execute(`
      SELECT ga.activity_id, ga.activity_name, ct.component_code
      FROM GRADE_ACTIVITY ga
      JOIN SUBJECT_COMPONENT_WEIGHT cw ON cw.subj_comp_weight_id = ga.subj_comp_weight_id
      JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id
      WHERE ga.grade_sheet_id = ?
    `, [sheetId]);

    const examKeys = new Set();
    checkActs.forEach(a => {
      const name = a.activity_name.toUpperCase();
      if (name.includes('SUMMATIVE 1') || name.includes('SUMMATIVE TEST 1') || name.includes('ST1')) examKeys.add('ST1');
      if (name.includes('SUMMATIVE 2') || name.includes('SUMMATIVE TEST 2') || name.includes('ST2')) examKeys.add('ST2');
      if (name.includes('TERM EXAM') || name.includes('TE')) examKeys.add('TE');
    });

    const [compWeights] = await db.execute(`
      SELECT cw.subj_comp_weight_id, ct.component_code
      FROM SUBJECT_COMPONENT_WEIGHT cw
      JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id
      WHERE cw.subject_id = ? AND cw.school_year_id = ?
    `, [off.subject_id, syId]);

    const weightMap = {};
    compWeights.forEach(w => { weightMap[w.component_code] = w.subj_comp_weight_id; });

    // Required template activities
    const template = [
      { name: 'Written Work 1', comp: 'WW', hps: 20 },
      { name: 'Performance Task 1', comp: 'PT', hps: 50 },
      { name: 'Summative Test 1', comp: weightMap['STE'] ? 'STE' : 'QA', hps: 30 },
      { name: 'Summative Test 2', comp: weightMap['STE'] ? 'STE' : 'QA', hps: 30 },
      { name: 'Term Exam', comp: weightMap['STE'] ? 'STE' : 'QA', hps: 40 },
    ];

    if (examKeys.size < 3 || checkActs.length < 5) {
      // Find enrolled students in this section
      const [students] = await db.execute(`
        SELECT ss.student_section_id, ss.student_id, st.first_name, st.last_name
        FROM STUDENT_SECTION ss
        JOIN STUDENT st ON st.student_id = ss.student_id
        WHERE ss.section_id = ? AND ss.school_year_id = ?
      `, [off.section_id, syId]);

      if (students.length > 0) {
        // Clear old incomplete activities if any
        if (checkActs.length > 0) {
          const oldIds = checkActs.map(a => a.activity_id);
          await db.execute(`DELETE FROM SCORE WHERE activity_id IN (${oldIds.join(',')})`);
          await db.execute(`DELETE FROM GRADE_ACTIVITY WHERE activity_id IN (${oldIds.join(',')})`);
        }

        console.log(`    -> Creating 5 complete activities for ${students.length} students in ${off.section_name}...`);
        for (const t of template) {
          const weightId = weightMap[t.comp] || weightMap['WW'] || Object.values(weightMap)[0];
          const [actRes] = await db.execute(`
            INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, status)
            VALUES (?, ?, ?, ?, 'ACTIVE')
          `, [sheetId, weightId, t.name, t.hps]);
          const newActId = actRes.insertId;

          // Seed scores for each student
          for (let i = 0; i < students.length; i++) {
            const st = students[i];
            const seed = (st.student_id * 17 + i * 13) % 100;
            let factor;
            if (seed < 20) factor = 0.55 + (seed % 10) * 0.01;      // High risk / failing
            else if (seed < 50) factor = 0.70 + (seed % 15) * 0.01; // Medium risk
            else factor = 0.85 + (seed % 15) * 0.01;                // Low risk

            const rawScore = Math.max(0, Math.min(t.hps, Math.round(t.hps * factor)));
            await db.execute(`
              INSERT INTO SCORE (activity_id, student_section_id, raw_score, score_status)
              VALUES (?, ?, ?, 'ENCODED')
            `, [newActId, st.student_section_id, rawScore]);
          }
        }
      }
    }

    // Now calculate and update official STUDENT_GRADE for Term 1
    const [enrolled] = await db.execute(`
      SELECT ss.student_section_id, ss.student_id
      FROM STUDENT_SECTION ss
      WHERE ss.section_id = ? AND ss.school_year_id = ?
    `, [off.section_id, syId]);

    for (let i = 0; i < enrolled.length; i++) {
      const st = enrolled[i];
      const seed = (st.student_id * 17 + i * 13) % 100;
      let qGrade;
      if (seed < 20) qGrade = 68.0 + (seed % 6);
      else if (seed < 50) qGrade = 75.0 + (seed % 6);
      else qGrade = 82.0 + (seed % 14);

      await db.execute(`
        INSERT INTO STUDENT_GRADE (subject_offering_id, student_id, student_section_id, term, quarterly_grade, initial_grade)
        VALUES (?, ?, ?, 'T1', ?, ?)
        ON DUPLICATE KEY UPDATE
          quarterly_grade = VALUES(quarterly_grade),
          initial_grade = VALUES(initial_grade)
      `, [off.subject_offering_id, st.student_id, st.student_section_id, qGrade, qGrade - 2]);
    }
  }

  console.log('\n✅ English Term 1 activities, scores, and quarterly grades are fully populated and locked.');

  // =========================================================================
  // 4. Seed SY 2025-2026 Historical Baseline Data for Historical Comparison
  // =========================================================================
  console.log('\n----------------------------------------------------');
  console.log('📊 CHECKING SY 2025-2026 HISTORICAL COMPARISON DATA');
  console.log('----------------------------------------------------');

  const [sy25] = await db.execute(`SELECT school_year_id FROM SCHOOL_YEAR WHERE starts_on = 2025 OR starts_on LIKE '2025%' LIMIT 1`);
  if (sy25.length > 0) {
    const sy25Id = sy25[0].school_year_id;
    const [existing25Grades] = await db.execute(`
      SELECT COUNT(*) as count
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
      WHERE so.school_year_id = ?
    `, [sy25Id]);

    if (existing25Grades[0].count === 0) {
      console.log(`Creating baseline historical offerings & grades for SY 2025-2026 (SY ID ${sy25Id})...`);

      const [allSubjects] = await db.execute(`SELECT subject_id, subject_name FROM SUBJECT`);
      const [allSections] = await db.execute(`SELECT section_id FROM SECTION LIMIT 6`);
      const [sampleStudents] = await db.execute(`SELECT student_id FROM STUDENT LIMIT 50`);

      let offeringCount = 0;
      let gradeCount = 0;

      for (const sub of allSubjects) {
        for (const sec of allSections) {
          const [soRes] = await db.execute(`
            INSERT INTO SUBJECT_OFFERING (subject_id, section_id, school_year_id)
            VALUES (?, ?, ?)
          `, [sub.subject_id, sec.section_id, sy25Id]);
          const soId = soRes.insertId;
          offeringCount++;

          for (let sIdx = 0; sIdx < Math.min(sampleStudents.length, 15); sIdx++) {
            const stId = sampleStudents[sIdx].student_id;
            const baseGrade = 80 + ((sub.subject_id * 7 + sIdx * 5) % 15);
            for (const t of ['T1', 'T2', 'T3']) {
              const variance = (t === 'T1' ? -1 : t === 'T3' ? 2 : 0);
              const qG = Math.min(98, Math.max(70, baseGrade + variance));
              await db.execute(`
                INSERT INTO STUDENT_GRADE (subject_offering_id, student_id, term, quarterly_grade, initial_grade)
                VALUES (?, ?, ?, ?, ?)
              `, [soId, stId, t, qG, qG - 1.5]);
              gradeCount++;
            }
          }
        }
      }
      console.log(`✅ Created ${offeringCount} offerings and ${gradeCount} historical grades for SY 2025-2026.`);
    } else {
      console.log(`SY 2025-2026 already has ${existing25Grades[0].count} grades.`);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 SEEDING COMPLETE! Testing At-Risk Prediction API...');
  console.log('====================================================');
}

seedEnglishTerm1()
  .then(async () => {
    const AtRiskPrediction = require('../models/AtRiskPrediction');
    const preview = await AtRiskPrediction.getPreview({ schoolYear: '2026-2027', term: 'T2', gradeLevel: 'all' });
    console.log('PREDICTION PREVIEW VERIFIED:');
    console.log(`  Eligible Learners: ${preview.summary.eligible}`);
    console.log(`  Low Risk: ${preview.summary.lowRisk}`);
    console.log(`  Medium Risk: ${preview.summary.mediumRisk}`);
    console.log(`  High Risk: ${preview.summary.highRisk}`);
    console.log(`  Unavailable: ${preview.summary.unavailable}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
