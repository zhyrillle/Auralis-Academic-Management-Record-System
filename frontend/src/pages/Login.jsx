import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import logo from "../assets/auralis-logo.png";
import {
  setStoredUser,
  getRoleDefaultPath,
  saveOfflineCredentials,
  verifyOfflineCredentials,
  hasOfflineAccount,
} from "../utils/auth";
import { warmUserOfflineData } from "../services/offlineCacheWarmer";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export default function Login({ user, onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false
  );
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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

    // 1. Offline Mode Check
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const offlineUser = await verifyOfflineCredentials(email, password);
      if (offlineUser) {
        setStoredUser(offlineUser);
        if (onLoginSuccess) {
          onLoginSuccess(offlineUser);
        }
        const targetPath = getRoleDefaultPath(offlineUser.role);
        if (targetPath && targetPath !== "/") {
          navigate(targetPath);
          return;
        }
      }
      if (hasOfflineAccount(email)) {
        setError("Incorrect password for offline sign-in.");
      } else {
        setError("You are currently offline. Please connect to the internet at least once on this device to enable offline access.");
      }
      return;
    }

    // 2. Online Mode Login with Network Error Fallback
    try {
      const response = await fetch(`${API_BASE_URL}/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || "Invalid email or password.");
      }

      // Handle response structure (whether response is { user: {...} } or directly {...})
      const userObj = data.user || data;

      // Save credentials for subsequent offline logins
      await saveOfflineCredentials(userObj, email, password);

      setStoredUser(userObj);

      // Trigger background offline cache warming
      if (
        userObj.role === "adviser" ||
        userObj.is_adviser ||
        userObj.role === "subject_teacher" ||
        userObj.role === "teacher"
      ) {
        const uid = userObj.user_id || userObj.id;
        if (uid) {
          warmUserOfflineData(uid).catch(() => {});
        }
      }

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
      // If network fetch failed (e.g. server unreachable or connection dropped mid-request)
      const isNetError =
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("NetworkError") ||
        err.message?.includes("Network request failed") ||
        err.name === "TypeError";

      if (isNetError) {
        const offlineUser = await verifyOfflineCredentials(email, password);
        if (offlineUser) {
          setStoredUser(offlineUser);
          if (onLoginSuccess) {
            onLoginSuccess(offlineUser);
          }
          const targetPath = getRoleDefaultPath(offlineUser.role);
          if (targetPath && targetPath !== "/") {
            navigate(targetPath);
            return;
          }
        }
        if (hasOfflineAccount(email)) {
          setError("Incorrect password for offline sign-in.");
        } else {
          setError("Cannot reach the server. Please check your internet connection or sign in on this device while online first.");
        }
        return;
      }

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

      {isOffline && (
        <div style={{ color: "#b45309", backgroundColor: "#fef3c7", padding: "8px 12px", borderRadius: "6px", marginBottom: "15px", fontSize: "13px", textAlign: "center", border: "1px solid #fde68a" }}>
          ⚡ <strong>Offline Mode:</strong> You can sign in using an account previously used on this device.
        </div>
      )}

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
