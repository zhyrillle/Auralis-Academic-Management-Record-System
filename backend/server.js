require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '7mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const schoolRoutes = require('./routes/schoolRoutes');
const schoolYearRoutes = require('./routes/schoolYearRoutes');
const academicTermRoutes = require('./routes/academicTermRoutes');
const userRoutes = require('./routes/userRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const departmentHeadRoutes = require('./routes/departmentHeadRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const gradeLevelRoutes = require('./routes/gradeLevelRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const studentRoutes = require('./routes/studentRoutes');
const componentTypeRoutes = require('./routes/componentTypeRoutes');
const subjectOfferingRoutes = require('./routes/subjectOfferingRoutes');
const teacherAssignmentRoutes = require('./routes/teacherAssignmentRoutes');
const adviserAssignmentRoutes = require('./routes/adviserAssignmentRoutes');
const studentSectionRoutes = require('./routes/studentSectionRoutes');
const subjectComponentWeightRoutes = require('./routes/subjectComponentWeightRoutes');
const gradeSheetRoutes = require('./routes/gradeSheetRoutes');
const gradeActivityRoutes = require('./routes/gradeActivityRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const gradeSheetReviewRoutes = require('./routes/gradeSheetReviewRoutes');
const gradeReopenRequestRoutes = require('./routes/gradeReopenRequestRoutes');
const temporaryReopeningRoutes = require('./routes/temporaryReopeningRoutes');
const attendanceSheetRoutes = require('./routes/attendanceSheetRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const auditEventRoutes = require('./routes/auditEventRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const departmentHeadDashboardRoutes = require('./routes/departmentHeadDashboard.routes');

app.use('/api/schools', schoolRoutes);
app.use('/api/school-years', schoolYearRoutes);
app.use('/api/academic-terms', academicTermRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/department-heads', departmentHeadRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/grade-levels', gradeLevelRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/component-types', componentTypeRoutes);
app.use('/api/subject-offerings', subjectOfferingRoutes);
app.use('/api/teacher-assignments', teacherAssignmentRoutes);
app.use('/api/section-adviser-assignments', adviserAssignmentRoutes);
app.use('/api/student-sections', studentSectionRoutes);
app.use('/api/subject-component-weights', subjectComponentWeightRoutes);
app.use('/api/grade-sheets', gradeSheetRoutes);
app.use('/api/grade-activities', gradeActivityRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/grade-sheet-reviews', gradeSheetReviewRoutes);
app.use('/api/reopen-requests', gradeReopenRequestRoutes);
app.use('/api/temporary-reopenings', temporaryReopeningRoutes);
app.use('/api/attendance-sheets', attendanceSheetRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/audit-logs', auditEventRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/department-head', departmentHeadDashboardRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'Backend API is running' });
});

const PORT = process.env.PORT || 5000;

const { migratePlaintextPasswords } = require('./utils/passwordUtils');
const { logEmailServiceStatus } = require('./services/emailService');

app.listen(PORT, async () => {
  console.log(`API Server running on http://localhost:${PORT}`);
  try {
    await migratePlaintextPasswords();
    logEmailServiceStatus();
  } catch (initErr) {
    console.error("Startup initialization warning:", initErr.message);
  }
});
