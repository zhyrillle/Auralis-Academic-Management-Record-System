import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { resetPassword } from "../services/userService";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const email =
    location.state?.email || sessionStorage.getItem("auralis_reset_email") || "";
  const resetToken =
    location.state?.resetToken ||
    sessionStorage.getItem("auralis_reset_token") ||
    "";

  useEffect(() => {
    if (!email || !resetToken) {
      navigate("/forgot-password", { replace: true });
    }
  }, [email, resetToken, navigate]);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!newPassword || !confirmPassword) {
      setError("Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      const data = await resetPassword(email, resetToken, newPassword);
      setSuccessMsg(
        data.message || "Your password has been successfully reset! Redirecting to login..."
      );

      sessionStorage.removeItem("auralis_reset_email");
      sessionStorage.removeItem("auralis_reset_token");

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 1800);
    } catch (err) {
      setError(
        err.message || "Failed to reset password. Your reset session may have expired."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout hideRectangles pageType="recovery">
      <h2 className="auth-title">RESET YOUR<br />PASSWORD</h2>
      <p className="auth-subtitle">Please enter your new password below.</p>

      {error && (
        <div style={{
          color: "#ef4444",
          backgroundColor: "#fee2e2",
          padding: "10px 14px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "13px",
          lineHeight: "1.4",
          textAlign: "center"
        }}>
          {error}
        </div>
      )}

      {successMsg && (
        <div style={{
          color: "#15803d",
          backgroundColor: "#dcfce7",
          padding: "10px 14px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "13px",
          lineHeight: "1.4",
          textAlign: "center"
        }}>
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSave}>
        <label className="auth-field-label">New Password</label>
        <input
          type="password"
          className="auth-input"
          placeholder="Enter your new password (min. 6 chars)"
          value={newPassword}
          disabled={loading || !!successMsg}
          required
          onChange={(e) => {
            setNewPassword(e.target.value);
            if (error) setError("");
          }}
        />

        <label className="auth-field-label">Confirm Password</label>
        <input
          type="password"
          className="auth-input"
          placeholder="Confirm your new password"
          value={confirmPassword}
          disabled={loading || !!successMsg}
          required
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (error) setError("");
          }}
        />

        <div className="btn-row">
          <button
            type="button"
            className="btn-secondary"
            disabled={loading || !!successMsg}
            onClick={() => navigate("/")}
          >
            CANCEL
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !!successMsg}
          >
            {loading ? "SAVING..." : "SAVE"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}