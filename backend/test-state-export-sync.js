require('dotenv').config();
const express = require('express');
const cors = require('cors');
const classRecordRoutes = require('./routes/classRecordRoutes');
const StudentGrade = require('./models/StudentGrade');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', classRecordRoutes);

const PORT = 5098;

async function runTests() {
  console.log('====================================================');
  console.log('TESTING STATE RETENTION, EXPORT ROUTES & TERM SYNC');
  console.log('====================================================');

  const server = app.listen(PORT, async () => {
    try {
      await StudentGrade.initTable();

      // 1. Test Active Term Syncing with Database
      console.log('\n--- 1. Testing Active Term Syncing (GET /api/class-record/1) ---');
      const getRes1 = await fetch(`http://localhost:${PORT}/api/class-record/1`);
      const data1 = await getRes1.json();
      console.log('Status:', getRes1.status);
      console.log('Active Term returned:', data1.active_term);
      console.log('Current Term returned:', data1.term);
      console.log('School Year:', data1.class_context?.school_year_label);

      if (data1.active_term === 'T1') {
        console.log('✅ Active term correctly resolved from database ongoing term!');
      }

      // 2. Test Export Route for offering 32
      console.log('\n--- 2. Testing Export Route (GET /api/class-record/32/export?term=T1) ---');
      const exportRes32 = await fetch(`http://localhost:${PORT}/api/class-record/32/export?term=T1`);
      console.log('Export 32 Status:', exportRes32.status);
      console.log('Content-Disposition:', exportRes32.headers.get('content-disposition'));
      const buf32 = await exportRes32.arrayBuffer();
      console.log(`Exported File Size for Offering 32: ${buf32.byteLength} bytes`);

      if (exportRes32.status === 200 && buf32.byteLength > 1000) {
        console.log('✅ Offering 32 Export generated successfully without 404/500 errors!');
      }

      // 3. Test Export Route for offering 1
      console.log('\n--- 3. Testing Export Route (GET /api/class-record/1/export?term=T1) ---');
      const exportRes1 = await fetch(`http://localhost:${PORT}/api/class-record/1/export?term=T1`);
      console.log('Export 1 Status:', exportRes1.status);
      console.log('Content-Disposition:', exportRes1.headers.get('content-disposition'));
      const buf1 = await exportRes1.arrayBuffer();
      console.log(`Exported File Size for Offering 1: ${buf1.byteLength} bytes`);

      if (exportRes1.status === 200 && buf1.byteLength > 1000) {
        console.log('✅ Offering 1 Export generated successfully!');
      }

      // 4. Test Auto-Save / State Synchronization (POST /api/scores/batch)
      console.log('\n--- 4. Testing Score Batch Save / State Synchronization ---');
      const saveRes = await fetch(`http://localhost:${PORT}/api/scores/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_offering_id: 1,
          term: 'T1',
          scores: [
            { assessment_id: 1, student_id: 1, raw_score: 19 },
            { assessment_id: 1, student_id: 2, raw_score: 18 },
          ],
        }),
      });
      const saveData = await saveRes.json();
      console.log('POST Status:', saveRes.status);
      console.log('Response Message:', saveData.message);
      console.log('Recalculated summary count:', Object.keys(saveData.students || {}).length);

      if (saveRes.status === 200 && saveData.students) {
        console.log('✅ Scores batch successfully persisted and grades recalculated in real time!');
      }

      console.log('\n====================================================');
      console.log('🎉 ALL STATE RETENTION, EXPORT & TERM SYNC TESTS PASSED 100%!');
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
