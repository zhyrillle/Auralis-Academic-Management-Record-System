import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import logo from "../assets/auralis-logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ email, password });
  };

  return (
    <AuthLayout showPhoto={true}>
      <img
        src={logo}
        alt="Auralis"
        style={{ width: 120, display: "block", margin: "0 auto 20px" }}
      />
      <h2 className="auth-title" style={{ textAlign: "center" }}>LOGIN</h2>

      <form onSubmit={handleSubmit}>
        <label className="auth-field-label">Email</label>
        <input
          type="email"
          className="auth-input"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="auth-field-label">Password</label>
        <input
          type="password"
          className="auth-input"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <span className="forgot-link" onClick={() => navigate("/forgot-password")}>
          Forgot Password?
        </span>

        <button type="submit" className="btn-primary">SIGN IN</button>
      </form>
    </AuthLayout>
  );
}