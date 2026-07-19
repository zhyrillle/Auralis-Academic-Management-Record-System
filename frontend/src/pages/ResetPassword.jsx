import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  const handleSave = () => {
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    console.log("Saving new password");
    navigate("/");
  };

  return (
    <AuthLayout hideRectangles pageType="recovery">
      <h2 className="auth-title">RESET YOUR<br />PASSWORD</h2>
      <p className="auth-subtitle">Please enter your new password below.</p>

      <label className="auth-field-label">New Password</label>
      <input
        type="password"
        className="auth-input"
        placeholder="Enter your password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />

      <label className="auth-field-label">Confirm Password</label>
      <input
        type="password"
        className="auth-input"
        placeholder="Confirm password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      <div className="btn-row">
        <button className="btn-secondary" onClick={() => navigate("/")}>CANCEL</button>
        <button className="btn-primary" onClick={handleSave}>SAVE</button>
      </div>
    </AuthLayout>
  );
}