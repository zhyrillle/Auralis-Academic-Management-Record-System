import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import logo from "../assets/auralis-logo.png";
import { setStoredUser, getRoleDefaultPath } from "../utils/auth";

export default function Login({ user, onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user && user.role) {
      const dest = getRoleDefaultPath(user.role);
      navigate(dest, { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("http://localhost:5000/api/users/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Login failed");
      }

      // Handle response structure (whether response is { user: {...} } or directly {...})
      const userObj = data.user || data;
      setStoredUser(userObj);

      if (onLoginSuccess) {
        onLoginSuccess(userObj);
      }

      const targetPath = getRoleDefaultPath(userObj.role);
      if (targetPath && targetPath !== "/") {
        navigate(targetPath);
      } else {
        setError("Unknown user role mapped to this account.");
      }

    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <AuthLayout showPhoto={true} pageType="login">
      <img
        src={logo}
        alt="Auralis"
        style={{ width: 120, display: "block", margin: "0 auto 20px" }}
      />
      <h2 className="auth-title" style={{ textAlign: "center" }}>LOGIN</h2>

      {error && (
        <div style={{ color: "#ef4444", backgroundColor: "#fee2e2", padding: "10px", borderRadius: "6px", marginBottom: "15px", fontSize: "14px", textAlign: "center" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label className="auth-field-label">Email</label>
        <input
          type="email"
          className="auth-input"
          placeholder="Enter your email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="auth-field-label">Password</label>
        <input
          type="password"
          className="auth-input"
          placeholder="Enter your password"
          value={password}
          required
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
