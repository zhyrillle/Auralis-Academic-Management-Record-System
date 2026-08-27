const nodemailer = require("nodemailer");

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  const isGmail = process.env.EMAIL_SERVICE === "gmail" || (user && user.includes("@gmail.com"));
  if (isGmail && user && pass) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  return null;
}

/**
 * Sends a password reset OTP verification email to the user.
 * Falls back cleanly to console output if SMTP credentials are not configured.
 *
 * @param {string} email - Destination email address
 * @param {string} otpCode - 4-digit OTP code
 * @param {string} [userName] - User's name (optional)
 * @returns {Promise<{ delivered: boolean, mode: 'smtp' | 'console' }>}
 */
async function sendPasswordResetOtpEmail(email, otpCode, userName = "User") {
  const transporter = createTransporter();
  const fromAddress = process.env.EMAIL_FROM || '"Auralis Academic Management" <no-reply@auralis.edu>';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f9; padding: 40px 20px; color: #1e293b;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background-color: #123062; padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1.5px;">AURALIS</h1>
            <p style="color: #ADC4EB; margin: 6px 0 0; font-size: 13px; letter-spacing: 0.5px;">Academic Management Record System</p>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding: 32px 28px;">
            <h2 style="font-size: 20px; color: #123062; margin-top: 0; margin-bottom: 12px; font-weight: 600;">Password Reset Request</h2>
            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
              Hello ${userName || "User"},<br/>
              We received a request to reset the password for your Auralis account. Use the 4-digit verification code below to complete your request:
            </p>

            <!-- OTP Box -->
            <div style="background-color: #f0f4fc; border: 1.5px dashed #ADC4EB; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
              <div style="font-size: 34px; font-weight: 800; letter-spacing: 12px; color: #123062; padding-left: 12px;">
                ${otpCode}
              </div>
              <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">
                This code will expire in <strong>10 minutes</strong>.
              </p>
            </div>

            <p style="font-size: 13px; line-height: 1.6; color: #64748b; margin: 20px 0 0;">
              If you did not request this password reset, please ignore this email or notify your system administrator immediately.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
              &copy; ${new Date().getFullYear()} Auralis Academic Management System. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </div>
  `;

  const textContent = `
Auralis - Password Reset Code
=============================
Hello ${userName || "User"},

We received a request to reset your password. Use the verification code below:

Verification Code: ${otpCode}

This code is valid for 10 minutes.
If you did not request this, please ignore this message.
`;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: email,
        subject: "Auralis - Password Reset Verification Code",
        text: textContent,
        html: htmlContent,
      });

      console.log(`✉️ Password reset OTP email sent successfully via SMTP to: ${email}`);
      return { delivered: true, mode: "smtp" };
    } catch (err) {
      console.error(`⚠️ SMTP dispatch error to ${email}:`, err.message);
      console.log(`[FALLBACK CONSOLE LOG] OTP for ${email}: ${otpCode}`);
      return { delivered: true, mode: "console" };
    }
  } else {
    // If SMTP is not configured, log clearly in terminal for development
    console.log(`
┌────────────────────────────────────────────────────────┐
│ 🔐 [AURALIS PASSWORD RESET OTP]                        │
│ Destination : ${email.padEnd(40)} │
│ OTP Code    : ${otpCode.padEnd(40)} │
│ Validity    : 10 minutes                               │
└────────────────────────────────────────────────────────┘
    `);
    return { delivered: true, mode: "console" };
  }
}

/**
 * Helper to check and log email service status on server startup.
 */
function logEmailServiceStatus() {
  const transporter = createTransporter();
  if (transporter) {
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    console.log(`✉️ Email Service: Active (Sending emails via ${user})`);
  } else {
    console.log("✉️ Email Service: Development Mode (OTPs will print directly to this terminal console).");
  }
}

module.exports = {
  sendPasswordResetOtpEmail,
  logEmailServiceStatus,
};

