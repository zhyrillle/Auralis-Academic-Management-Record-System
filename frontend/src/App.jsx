import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import OtpVerify from "./pages/OtpVerify";
import ResetPassword from "./pages/ResetPassword";
import AdminDashboard from "./pages/system-admin/AdminDashboard";
import WSConfig from "./pages/system-admin/WSConfig";
import ManageUsers from "./pages/system-admin/ManageUsers";
import AcademicPeriod from "./pages/system-admin/AcademicPeriod";
import AdviserDashboard from "./pages/adviser/AdviserDashboard";
import DeptDashboard from "./pages/department-head/DeptDashboard";
import DeptClassRecord from "./pages/department-head/DeptClassRecord";
import PrincipalDashboard from "./pages/principal/PrincipalDashboard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import PerformanceReport from "./pages/adviser/PerformanceReport";
import PlaceholderPage from "./pages/PlaceholderPage";
import DashboardLayout from "./components/layout/DashboardLayout";
import AdviserSections from "./pages/adviser/AdviserSections";
import MasterSheet from "./pages/adviser/MasterSheet";
import AdviserFeedback from "./pages/adviser/AdviserFeedback";
import ProfilePage from "./pages/ProfilePage";
import AtRiskBreakdown from "./pages/principal/AtRiskBreakdown";
import AtRiskPrediction from "./pages/principal/AtRiskPrediction";
import PerformanceGradeLevels from "./pages/principal/PerformanceGradeLevels";
import PerformanceSections from "./pages/principal/PerformanceSections";
import PerformanceSubjects from "./pages/principal/PerformanceSubjects";
import PerformanceTeachers from "./pages/principal/PerformanceTeachers";
import PerformanceLowest from "./pages/principal/PerformanceLowest";
import TeacherFeedback from "./pages/principal/TeacherFeedback";
import SubjectPerformanceTrend from "./pages/principal/SubjectPerformanceTrend";
import HistoricalComparison from "./pages/principal/HistoricalComparison";
import GradeReopeningRequest from "./pages/adviser/GradeReopeningRequest";
import SectionDetails from "./pages/adviser/SectionDetails";
import AdviserNotifications from "./pages/adviser/AdviserNotifications";
import AttendanceSheet from "./pages/adviser/AttendanceSheet";
import { getStoredUser, setStoredUser } from "./utils/auth";

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());

  const handleLoginSuccess = (userObj) => {
    setUser(userObj);
  };

  const handleUserUpdated = (updatedUser) => {
    setStoredUser(updatedUser);
    setUser(updatedUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Login user={user} onLoginSuccess={handleLoginSuccess} />
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/otp" element={<OtpVerify />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected Dashboard Layout routes */}
        <Route
          element={
            <DashboardLayout user={user} onLogout={handleLogout} />
          }
        >
          {/* Shared profile route for every signed-in account */}
          <Route
            path="/profile"
            element={
              <ProfilePage
                user={user}
                onUserUpdated={handleUserUpdated}
              />
            }
          />

          {/* 1. System Administrator */}
          <Route path="/system-admin/dashboard" element={<AdminDashboard />} />
          <Route
            path="/system-admin/manage-users"
            element={<ManageUsers />}
          />
          <Route
            path="/system-admin/grading-periods"
            element={<AcademicPeriod user={user} />}
          />
          <Route path="/system-admin/ws-config" element={<WSConfig />} />

          {/* 2. Principal */}
          <Route path="/principal/dashboard" element={<PrincipalDashboard />} />
          <Route
            path="/principal/at-risk-students/prediction"
            element={<AtRiskPrediction />}
          />
          <Route
            path="/principal/at-risk-students/breakdown"
            element={<AtRiskBreakdown />}
          />
          <Route
            path="/principal/performance-level/grade-levels"
            element={<PerformanceGradeLevels />}
          />
          <Route
            path="/principal/performance-level/sections"
            element={<PerformanceSections />}
          />
          <Route
            path="/principal/performance-level/subjects"
            element={<PerformanceSubjects />}
          />
          <Route
            path="/principal/performance-level/teachers"
            element={<PerformanceTeachers />}
          />
          <Route
            path="/principal/performance-level/lowest-performers"
            element={<PerformanceLowest />}
          />
          <Route
            path="/principal/analytics/subject-trend"
            element={<SubjectPerformanceTrend />}
          />
          <Route
            path="/principal/analytics/historical-comparison"
            element={<HistoricalComparison />}
          />
          <Route path="/principal/reports" element={<PlaceholderPage />} />
          <Route path="/principal/feedback" element={<TeacherFeedback />} />

          {/* 3. Department Head */}
          <Route
            path="/department-head/dashboard"
            element={<DeptDashboard />}
          />
          <Route
            path="/department-head/class-records"
            element={<DeptClassRecord />}
          />

          {/* 4. Adviser */}
          <Route path="/adviser/dashboard" element={<AdviserDashboard />} />
          <Route path="/adviser/sections" element={<AdviserSections />} />
          <Route path="/adviser/sections/details" element={<SectionDetails />} />
          <Route
            path="/adviser/attendance"
            element={<AttendanceSheet />}
          />
          <Route path="/adviser/notifications" element={<AdviserNotifications />} />
          <Route path="/adviser/master-sheet" element={<MasterSheet />} />
          <Route path="/adviser/performance" element={<PerformanceReport />} />
          <Route path="/adviser/feedback" element={<AdviserFeedback />} />
          <Route path="/adviser/request" element={<GradeReopeningRequest />} />

          {/* 5. Subject Teacher */}
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route
            path="/teacher/sections"
            element={<AdviserSections userRole="teacher" />}
          />
          <Route
            path="/teacher/notifications"
            element={<AdviserNotifications userRole="teacher" />}
          />
          <Route
            path="/teacher/performance"
            element={<PerformanceReport userRole="teacher" />}
          />
          <Route
            path="/teacher/feedback"
            element={<AdviserFeedback userRole="teacher" />}
          />
          <Route
            path="/teacher/request"
            element={<GradeReopeningRequest />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
