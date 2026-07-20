import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import OtpVerify from "./pages/OtpVerify";
import ResetPassword from "./pages/ResetPassword";
import AdminDashboard from "./pages/system-admin/AdminDashboard";
import AdviserDashboard from "./pages/adviser/AdviserDashboard";
import DeptDashboard from "./pages/department-head/DeptDashboard";
import PrincipalDashboard from "./pages/principal/PrincipalDashboard";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import PlaceholderPage from "./pages/PlaceholderPage";
import DashboardLayout from "./components/layout/DashboardLayout";
import AdviserSections from "./pages/adviser/AdviserSections";

export default function App() {
  const [user, setUser] = useState({
    role: "principal",
    name: "Harvey Babia",
  });

  const handleRoleChange = (newRole) => {
    let name = "Harvey Babia";
    const roleLower = newRole.toLowerCase();
    if (roleLower === "system-admin" || roleLower === "admin") {
      name = "Admin User";
    } else if (roleLower === "department-head" || roleLower === "departmenthead") {
      name = "Jolly Bee";
    }
    setUser({
      role: newRole,
      name,
    });
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication routes */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/otp" element={<OtpVerify />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected Dashboard Layout routes */}
        <Route element={<DashboardLayout user={user} onRoleChange={handleRoleChange} />}>
          
          {/* 1. System Administrator */}
          <Route path="/system-admin/dashboard" element={<AdminDashboard />} />
          <Route path="/system-admin/manage-users" element={<PlaceholderPage />} />
          <Route path="/system-admin/grade-lock" element={<PlaceholderPage />} />
          <Route path="/system-admin/ws-config" element={<PlaceholderPage />} />

          {/* 2. Principal */}
          <Route path="/principal/dashboard" element={<PrincipalDashboard />} />
          <Route path="/principal/at-risk-students/prediction" element={<PlaceholderPage />} />
          <Route path="/principal/at-risk-students/breakdown" element={<PlaceholderPage />} />
          <Route path="/principal/performance-level/grade-levels" element={<PlaceholderPage />} />
          <Route path="/principal/performance-level/sections" element={<PlaceholderPage />} />
          <Route path="/principal/performance-level/subjects" element={<PlaceholderPage />} />
          <Route path="/principal/performance-level/teachers" element={<PlaceholderPage />} />
          <Route path="/principal/performance-level/lowest-performers" element={<PlaceholderPage />} />
          <Route path="/principal/analytics/subject-trend" element={<PlaceholderPage />} />
          <Route path="/principal/analytics/historical-comparison" element={<PlaceholderPage />} />
          <Route path="/principal/reports" element={<PlaceholderPage />} />
          <Route path="/principal/feedback" element={<PlaceholderPage />} />

          {/* 3. Department Head */}
          <Route path="/department-head/dashboard" element={<DeptDashboard />} />
          <Route path="/department-head/class-records" element={<PlaceholderPage />} />

          {/* 4. Adviser */}
          <Route path="/adviser/dashboard" element={<AdviserDashboard />} />
          <Route path="/adviser/sections" element={<AdviserSections />} />
          <Route path="/adviser/notifications" element={<PlaceholderPage />} />
          <Route path="/adviser/master-sheet" element={<PlaceholderPage />} />
          <Route path="/adviser/performance" element={<PlaceholderPage />} />
          <Route path="/adviser/feedback" element={<PlaceholderPage />} />
          <Route path="/adviser/request" element={<PlaceholderPage />} />

          {/* 5. Subject Teacher */}
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route path="/teacher/sections" element={<PlaceholderPage />} />
          <Route path="/teacher/notifications" element={<PlaceholderPage />} />
          <Route path="/teacher/performance" element={<PlaceholderPage />} />
          <Route path="/teacher/feedback" element={<PlaceholderPage />} />
          <Route path="/teacher/request" element={<PlaceholderPage />} />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}