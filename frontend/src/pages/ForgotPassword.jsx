import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import illustration from "../assets/reset-illustration.png";
import { forgotPassword } from "../services/userService";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleContinue = async (e) => {
    if (e) e.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(cleanEmail);
      sessionStorage.setItem("auralis_reset_email", cleanEmail);
      navigate("/otp", { state: { email: cleanEmail } });
    } catch (err) {
      setError(err.message || "Failed to send verification code. Please check your email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout illustration={illustration} hideRectangles pageType="recovery">
      <h2 className="auth-title">FORGOT<br />YOUR PASSWORD?</h2>
      <p className="auth-subtitle">
        Don't worry! Enter your email address for the OTP code to reset your password.
      </p>

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

      <form onSubmit={handleContinue}>
        <label className="auth-field-label">Registered Email</label>
        <input
          type="email"
          className="auth-input"
          placeholder="Enter your email"
          value={email}
          required
          disabled={loading}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError("");
          }}
        />

        <div className="btn-row">
          <button
            type="button"
            className="btn-secondary"
            disabled={loading}
            onClick={() => navigate("/")}
          >
            CANCEL
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? "SENDING..." : "CONTINUE"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}