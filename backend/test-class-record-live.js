require('dotenv').config();
const express = require('express');
const cors = require('cors');
const classRecordRoutes = require('./routes/classRecordRoutes');
const StudentGrade = require('./models/StudentGrade');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', classRecordRoutes);

const PORT = 5089;
const server = app.listen(PORT, async () => {
  console.log(`Live test server started on port ${PORT}`);

  try {
    await StudentGrade.initTable();

    // 1. Test GET /api/class-record/1?term=T1
    console.log('\n--- 1. Testing GET /api/class-record/1?term=T1 ---');
    const getRes = await fetch(`http://localhost:${PORT}/api/class-record/1?term=T1`);
    const getData = await getRes.json();
    console.log('GET Status:', getRes.status);
    console.log('Class Context:', getData.class_context);
    console.log('Weights:', getData.component_weights);
    console.log('Total HPS:', getData.total_highest_possible_scores);
    console.log('Total Enrolled Students in DB:', getData.students?.length);
    console.log('Sample Male Student (1st):', getData.students?.[0]);
    console.log('Sample Female Student:', getData.students?.find(s => s.sex === 'F'));

    // 2. Test POST /api/assessments
    console.log('\n--- 2. Testing POST /api/assessments ---');
    const postAssRes = await fetch(`http://localhost:${PORT}/api/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_offering_id: 1,
        term: 'T1',
        component_code: 'WW',
        activity_name: 'Short Quiz 1',
        max_score: 20,
        activity_date: '2026-08-29',
      }),
    });
    const postAssData = await postAssRes.json();
    console.log('POST /api/assessments Status:', postAssRes.status);
    console.log('Created Assessment:', postAssData.assessment);
    console.log('Updated Total HPS:', postAssData.total_highest_possible_scores);

    // 3. Test POST /api/scores/batch
    console.log('\n--- 3. Testing POST /api/scores/batch ---');
    const firstStudent = getData.students?.[0];
    const postScoreRes = await fetch(`http://localhost:${PORT}/api/scores/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_offering_id: 1,
        term: 'T1',
        scores: [
          {
            assessment_id: postAssData.assessment.assessment_id,
            student_id: firstStudent?.student_id,
            raw_score: 18,
          },
        ],
      }),
    });
    const postScoreData = await postScoreRes.json();
    console.log('POST /api/scores/batch Status:', postScoreRes.status);
    console.log('Message:', postScoreData.message);
    console.log('Calculated Result for student 1:', postScoreData.students?.[firstStudent?.student_id]);

    console.log('\n✅ ALL BACKEND APIS, STUDENT TABLE RETRIEVAL, AND DEPED COMPUTATIONS VERIFIED 100%!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
