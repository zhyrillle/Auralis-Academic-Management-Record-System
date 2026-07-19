import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import illustration from "../assets/reset-illustration.png";

export default function OtpVerify() {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const inputsRef = useRef([]);
  const navigate = useNavigate();

  const handleChange = (index, value) => {
    if (!/^[0-9]?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 3) {
      inputsRef.current[index + 1].focus();
    }
  };

  const handleVerify = () => {
    const code = otp.join("");
    console.log("Verifying:", code);
    navigate("/reset-password");
  };

  return (
    <AuthLayout illustration={illustration} hideRectangles pageType="recovery">
      <h2 className="auth-title">ENTER OTP CODE</h2>
      <p className="auth-subtitle">
        We've sent a verification code to your registered email. Enter the code below to
        securely access your account.
      </p>

      <div className="otp-inputs">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => (inputsRef.current[i] = el)}
            className="otp-box"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
          />
        ))}
      </div>

      <button className="btn-primary" onClick={handleVerify}>VERIFY</button>
      <span className="resend-link" onClick={() => console.log("Resend OTP")}>
        Resend Code
      </span>
    </AuthLayout>
  );
}