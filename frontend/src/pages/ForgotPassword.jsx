import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import illustration from "../assets/reset-illustration.png";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();

  const handleContinue = () => {
    console.log("Send OTP to:", email);
    navigate("/otp");
  };

  return (
    <AuthLayout illustration={illustration} hideRectangles>
      <h2 className="auth-title">FORGOT<br />YOUR PASSWORD?</h2>
      <p className="auth-subtitle">
        Don't worry! Enter your email address for the OTP code to reset your password.
      </p>

      <label className="auth-field-label">Registered Email</label>
      <input
        type="email"
        className="auth-input"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <div className="btn-row">
        <button className="btn-secondary" onClick={() => navigate("/")}>CANCEL</button>
        <button className="btn-primary" onClick={handleContinue}>CONTINUE</button>
      </div>
    </AuthLayout>
  );
}