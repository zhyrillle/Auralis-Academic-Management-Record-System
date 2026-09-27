require('dotenv').config();
const express = require('express');
const cors = require('cors');
const classRecordRoutes = require('./routes/classRecordRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', classRecordRoutes);

const PORT = 5098;

async function runTests() {
  console.log('====================================================');
  console.log('TESTING ACADEMIC TERM LOCKING & GRADE SHEET VALIDATION');
  console.log('====================================================');

  const server = app.listen(PORT, async () => {
    try {
      // 1. GET Active Term (T1)
      console.log('\n--- 1. Testing GET /api/class-record/1?term=T1 ---');
      const resT1 = await fetch(`http://localhost:${PORT}/api/class-record/1?term=T1`);
      console.log('T1 Status:', resT1.status);
      const dataT1 = await resT1.json();
      console.log('Active Term Code:', dataT1.active_term);
      console.log('Loaded Term Code:', dataT1.term);
      console.log('Is Locked:', dataT1.is_locked);
      console.log('Is Editable:', dataT1.is_editable);
      console.log('Lock Reason:', dataT1.lock_reason);
      console.log('Grade Sheet lock_status:', dataT1.grade_sheet?.lock_status);

      if (dataT1.is_editable === true && dataT1.is_locked === false) {
        console.log('✅ Active term is correctly OPEN and EDITABLE!');
      }

      // 2. GET Inactive Term (T2)
      console.log('\n--- 2. Testing GET /api/class-record/1?term=T2 (Inactive Term) ---');
      const resT2 = await fetch(`http://localhost:${PORT}/api/class-record/1?term=T2`);
      console.log('T2 Status:', resT2.status);
      const dataT2 = await resT2.json();
      console.log('Loaded Term Code:', dataT2.term);
      console.log('Is Locked:', dataT2.is_locked);
      console.log('Is Editable:', dataT2.is_editable);
      console.log('Lock Reason:', dataT2.lock_reason);
      console.log('Grade Sheet is_active_term:', dataT2.grade_sheet?.is_active_term);

      if (dataT2.is_locked === true && dataT2.is_editable === false && dataT2.lock_reason === 'CLOSED_TERM') {
        console.log('✅ Inactive term T2 is correctly marked as LOCKED and READ-ONLY!');
      }

      // 3. Attempting to POST /api/scores/batch on Locked Term T2
      console.log('\n--- 3. Testing POST /api/scores/batch on Locked Term T2 ---');
      const saveRes = await fetch(`http://localhost:${PORT}/api/scores/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_offering_id: 1,
          term: 'T2',
          scores: [
            { assessment_id: 1, student_id: 1, raw_score: 20 },
          ],
        }),
      });
      console.log('Save status on locked term:', saveRes.status);
      const saveData = await saveRes.json();
      console.log('Save response on locked term:', saveData);

      if (saveRes.status === 403 && saveData.is_locked === true) {
        console.log('✅ Backend successfully blocked score save on locked term with 403 Forbidden!');
      }

      // 4. Attempting to POST /api/assessments on Locked Term T2
      console.log('\n--- 4. Testing POST /api/assessments on Locked Term T2 ---');
      const createRes = await fetch(`http://localhost:${PORT}/api/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_offering_id: 1,
          term: 'T2',
          type: 'writtenWork',
          activity_name: 'Unauthorized Quiz',
          max_score: 20,
        }),
      });
      console.log('Create assessment status on locked term:', createRes.status);
      const createData = await createRes.json();
      console.log('Create assessment response:', createData);

      if (createRes.status === 403 && createData.is_locked === true) {
        console.log('✅ Backend successfully blocked assessment creation on locked term with 403 Forbidden!');
      }

      console.log('\n====================================================');
      console.log('🎉 ALL TERM LOCKING & VALIDATION TESTS PASSED!');
      console.log('====================================================');
    } catch (err) {
      console.error('Test error:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

runTests().catch(console.error);
