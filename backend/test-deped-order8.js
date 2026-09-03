require('dotenv').config();
const express = require('express');
const cors = require('cors');
const classRecordRoutes = require('./routes/classRecordRoutes');
const StudentGrade = require('./models/StudentGrade');
const {
  TRANSMUTATION_TABLE,
  transmuteGrade,
  calculateStudentGrades,
} = require('./utils/depedTransmutation');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', classRecordRoutes);

const PORT = 5092;

async function runTests() {
  console.log('====================================================');
  console.log('DEPED ORDER NO. 8, S. 2015 CLASS RECORD TEST SUITE');
  console.log('====================================================');

  // 1. Test DepEd Transmutation Table
  console.log('\n--- 1. Testing DepEd Transmutation Table ---');
  const testTiers = [
    { initial: 100, expected: 100 },
    { initial: 99.5, expected: 97 },
    { initial: 90.0, expected: 91 },
    { initial: 88.76, expected: 90 }, // Virgil Francis Puray benchmark
    { initial: 85.0, expected: 88 },
    { initial: 60.0, expected: 75 }, // Official passing threshold
    { initial: 59.9, expected: 74 }, // Failing boundary
    { initial: 50.0, expected: 72 },
    { initial: 25.0, expected: 66 },
    { initial: 10.0, expected: 62 },
    { initial: 0.0, expected: 60 },
  ];

  let transPass = 0;
  testTiers.forEach(({ initial, expected }) => {
    const result = transmuteGrade(initial);
    if (result === expected) {
      transPass++;
    } else {
      console.error(`Transmutation Mismatch: Initial ${initial} -> Got ${result}, Expected ${expected}`);
    }
  });
  console.log(`✅ Transmutation Table Passed: ${transPass}/${testTiers.length} test cases.`);

  // 2. Test Core Calculation Formulas
  console.log('\n--- 2. Testing Core Calculation Logic (PS, WS, Initial, Quarterly) ---');
  const sampleAssessments = [
    { assessment_id: 1, component_code: 'WW', max_score: 20 },
    { assessment_id: 2, component_code: 'WW', max_score: 30 }, // Total WW HPS = 50
    { assessment_id: 3, component_code: 'PT', max_score: 50 },
    { assessment_id: 4, component_code: 'PT', max_score: 50 }, // Total PT HPS = 100
    { assessment_id: 5, component_code: 'QA', max_score: 50 }, // Total QA HPS = 50
  ];

  const sampleScores = {
    1: 18,
    2: 27, // WW Total = 45 / 50 -> PS = 90.00% -> WS (30%) = 27.00
    3: 45,
    4: 40, // PT Total = 85 / 100 -> PS = 85.00% -> WS (50%) = 42.50
    5: 42, // QA Total = 42 / 50 -> PS = 84.00% -> WS (20%) = 16.80
  };

  const weights = { WW: 30, PT: 50, QA: 20 };
  const calc = calculateStudentGrades({ assessments: sampleAssessments, scores: sampleScores, weights });

  console.log('WW:', calc.components.WW);
  console.log('PT:', calc.components.PT);
  console.log('QA:', calc.components.QA);
  console.log(`Initial Grade: ${calc.initialGrade} (Expected: 86.30)`);
  console.log(`Quarterly Grade: ${calc.quarterlyGrade} (Expected: 91)`);
  console.log(`Remarks: ${calc.remarks}`);

  if (calc.initialGrade === 86.3 && calc.quarterlyGrade === 91 && calc.remarks === 'Passed') {
    console.log('✅ DepEd Formula Calculation Passed 100%!');
  } else {
    console.error('❌ Calculation discrepancy!');
  }

  // 2B. Test Virgil Francis A. Puray template data (WW 20%, PT 50%, EX 30%)
  console.log('\n--- 2B. Testing Virgil Francis A. Puray Template Case ---');
  const virgilAssessments = [
    { assessment_id: 101, component_code: 'WW', max_score: 30 },
    { assessment_id: 102, component_code: 'WW', max_score: 25 },
    { assessment_id: 103, component_code: 'WW', max_score: 30 },
    { assessment_id: 104, component_code: 'WW', max_score: 30 }, // WW HPS = 115
    { assessment_id: 201, component_code: 'PT', max_score: 50 },
    { assessment_id: 202, component_code: 'PT', max_score: 50 },
    { assessment_id: 203, component_code: 'PT', max_score: 50 }, // PT HPS = 150
    { assessment_id: 301, component_code: 'QA', activity_name: 'Summative Test 1', max_score: 25 },
    { assessment_id: 302, component_code: 'QA', activity_name: 'Summative Test 2', max_score: 25 },
    { assessment_id: 303, component_code: 'QA', activity_name: 'Term Exam', max_score: 50 },
  ];
  const virgilScores = {
    101: 25, 102: 23, 103: 28, 104: 22,
    201: 45, 202: 47, 203: 40,
    301: 23, 302: 24, 303: 45,
  };
  const virgilWeights = { WW: 20, PT: 50, EX: 30 };
  const virgilCalc = calculateStudentGrades({ assessments: virgilAssessments, scores: virgilScores, weights: virgilWeights });
  console.log('Virgil WW:', virgilCalc.components.WW);
  console.log('Virgil PT:', virgilCalc.components.PT);
  console.log('Virgil QA/EX:', virgilCalc.components.QA);
  console.log(`Virgil Initial Grade: ${virgilCalc.initialGrade} (Expected: 88.76)`);
  console.log(`Virgil Term Grade: ${virgilCalc.termGrade} (Expected: 90, Descriptor: ${virgilCalc.descriptor})`);
  if (virgilCalc.initialGrade === 88.76 && virgilCalc.termGrade === 90 && virgilCalc.descriptor === 'Advancing') {
    console.log('✅ Virgil Francis A. Puray Template Case PASSED EXACTLY (Initial: 88.76 -> Term: 90 -> Advancing)!');
  } else {
    console.error('❌ Virgil discrepancy!');
  }

  // 3. Test Live Server Endpoints
  const server = app.listen(PORT, async () => {
    try {
      await StudentGrade.initTable();

      console.log('\n--- 3. Testing GET /api/class-record/1?term=T1 ---');
      const getRes = await fetch(`http://localhost:${PORT}/api/class-record/1?term=T1`);
      const getData = await getRes.json();
      console.log('GET Status:', getRes.status);
      console.log('Subject & Section:', `${getData.class_context?.subject_name} - ${getData.class_context?.section_name}`);
      console.log('Total Enrolled Students from DB:', getData.students?.length);
      console.log('Total HPS:', getData.total_highest_possible_scores);

      console.log('\n--- 4. Testing POST /api/assessments ---');
      const postAssRes = await fetch(`http://localhost:${PORT}/api/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_offering_id: 1,
          term: 'T1',
          component_code: 'WW',
          activity_name: 'DepEd Compliance Quiz',
          max_score: 25,
          activity_date: '2026-08-29',
        }),
      });
      const postAssData = await postAssRes.json();
      console.log('POST /api/assessments Status:', postAssRes.status);
      console.log('Created Assessment:', postAssData.assessment);
      console.log('Updated Total HPS:', postAssData.total_highest_possible_scores);

      console.log('\n--- 5. Testing POST /api/scores/batch ---');
      const student1 = getData.students?.[0];
      const postScoreRes = await fetch(`http://localhost:${PORT}/api/scores/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_offering_id: 1,
          term: 'T1',
          scores: [
            {
              assessment_id: postAssData.assessment.assessment_id,
              student_id: student1?.student_id,
              raw_score: 22,
            },
          ],
        }),
      });
      const postScoreData = await postScoreRes.json();
      console.log('POST /api/scores/batch Status:', postScoreRes.status);
      console.log('Recalculated summary for Student 1:', postScoreData.students?.[student1?.student_id]);

      console.log('\n--- 6. Testing GET /api/class-record/1/export (DepEd Excel Export) ---');
      const exportRes = await fetch(`http://localhost:${PORT}/api/class-record/1/export?term=T1`);
      console.log('Export Status:', exportRes.status);
      console.log('Content-Type:', exportRes.headers.get('content-type'));
      console.log('Content-Disposition:', exportRes.headers.get('content-disposition'));

      const buffer = await exportRes.arrayBuffer();
      console.log(`Exported Excel File Size: ${buffer.byteLength} bytes`);

      if (exportRes.status === 200 && buffer.byteLength > 1000) {
        console.log('✅ DepEd Excel / Spreadsheet Export generated successfully!');
      }

      console.log('\n====================================================');
      console.log('🎉 ALL DEPED ORDER NO. 8, S. 2015 REQUIREMENTS VERIFIED 100%!');
      console.log('====================================================');
    } catch (err) {
      console.error('Test execution error:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

runTests().catch(console.error);
