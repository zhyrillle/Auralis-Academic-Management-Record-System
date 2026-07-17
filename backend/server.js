require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const schoolRoutes = require('./routes/schoolRoutes');
const gradeLevelRoutes = require('./routes/gradeLevelRoutes');
const studentRoutes = require('./routes/studentRoutes');
const schoolYearRoutes = require('./routes/schoolYearRoutes');
const componentTypeRoutes = require('./routes/componentTypeRoutes');
const userRoutes = require('./routes/userRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const gradeSubmissionRoutes = require('./routes/gradeSubmissionRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const studentSectionRoutes = require('./routes/studentSectionRoutes');
const scoreRoutes = require('./routes/scoreRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const gradeReopenRequestRoutes = require('./routes/gradeReopenRequestRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');

app.use('/api/schools', schoolRoutes);
app.use('/api/grade-levels', gradeLevelRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/school-years', schoolYearRoutes);
app.use('/api/component-types', componentTypeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sections', sectionRoutes);
app.use('/api/submissions', gradeSubmissionRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/student-sections', studentSectionRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reopen-requests', gradeReopenRequestRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feedback', feedbackRoutes);

app.get('/', (req, res) => {
  res.json({ status: "Backend API is running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`📡 API Server running on http://localhost:${PORT}`);
});