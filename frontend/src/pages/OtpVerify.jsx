import { useRef, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import illustration from "../assets/reset-illustration.png";
import { verifyOtp, resendOtp } from "../services/userService";

export default function OtpVerify() {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const inputsRef = useRef([]);
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || sessionStorage.getItem("auralis_reset_email") || "";

  useEffect(() => {
    if (!email) {
      navigate("/forgot-password", { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChange = (index, value) => {
    const cleaned = value.replace(/\D/g, "");
    const char = cleaned.slice(-1);

    const newOtp = [...otp];
    newOtp[index] = char;
    setOtp(newOtp);
    if (error) setError("");

    if (char && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "Enter") {
      handleVerify();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim().replace(/\D/g, "");
    if (!pasted) return;

    const digits = pasted.slice(0, 4).split("");
    const newOtp = ["", "", "", ""];
    digits.forEach((d, i) => {
      newOtp[i] = d;
    });
    setOtp(newOtp);

    const focusIndex = Math.min(digits.length, 3);
    inputsRef.current[focusIndex]?.focus();
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setSuccessMsg("");

    const code = otp.join("").trim();
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code.");
      return;
    }

    setLoading(true);
    try {
      const data = await verifyOtp(email, code);
      sessionStorage.setItem("auralis_reset_token", data.resetToken);
      navigate("/reset-password", {
        state: { email, resetToken: data.resetToken },
      });
    } catch (err) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending || loading) return;
    setError("");
    setSuccessMsg("");
    setResending(true);

    try {
      await resendOtp(email);
      setSuccessMsg("A new verification code has been sent to your email.");
      setCooldown(60);
      setOtp(["", "", "", ""]);
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(err.message || "Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout illustration={illustration} hideRectangles pageType="recovery">
      <h2 className="auth-title">ENTER OTP CODE</h2>
      <p className="auth-subtitle">
        We've sent a verification code to{" "}
        <strong style={{ color: "#123062" }}>{email || "your registered email"}</strong>.
        Enter the code below to securely access your account.
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

      <form onSubmit={handleVerify}>
        <div className="otp-inputs" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              className="otp-box"
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={loading}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
            />
          ))}
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || resending}
        >
          {loading ? "VERIFYING..." : "VERIFY"}
        </button>

        <div style={{ textAlign: "center", marginTop: "16px" }}>
          {cooldown > 0 ? (
            <span style={{ fontSize: "13px", color: "#64748b" }}>
              Resend Code in {cooldown}s
            </span>
          ) : (
            <span
              className="resend-link"
              style={{
                cursor: resending ? "not-allowed" : "pointer",
                opacity: resending ? 0.6 : 1,
              }}
              onClick={handleResend}
            >
              {resending ? "Sending..." : "Resend Code"}
            </span>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: "12px" }}>
          <span
            style={{
              fontSize: "13px",
              color: "#123062",
              cursor: "pointer",
              textDecoration: "underline",
            }}
            onClick={() => navigate("/forgot-password")}
          >
            Change Email Address
          </span>
        </div>
      </form>
    </AuthLayout>
  );
}