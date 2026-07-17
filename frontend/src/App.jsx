import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import OtpVerify from "./pages/OtpVerify";
import ResetPassword from "./pages/ResetPassword";
import AdminDashboard from "./pages/system-admin/AdminDashboard";
import AdviserDashboard from "./pages/adviser/AdviserDashboard";
import DeptDashboard from "./pages/department-head/DeptDashboard";
import PrincipalDashboard from "./pages/principal/PrincipalDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Authentication routes */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/otp" element={<OtpVerify />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* 2. Dashboard routes */}
        <Route path="/system-admin/dashboard" element={<AdminDashboard />} />
        <Route path="/adviser/dashboard" element={<AdviserDashboard />} />
        <Route path="/department-head/dashboard" element={<DeptDashboard />} />
        <Route path="/principal/dashboard" element={<PrincipalDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}