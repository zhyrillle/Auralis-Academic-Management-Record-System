const otpStore = new Map();

class OtpStore {
  static createOtp(email, otpCode, expiryMinutes = 10) {
    const cleanEmail = String(email).trim().toLowerCase();

    const existing = otpStore.get(cleanEmail);
    if (existing && existing.timer) {
      clearTimeout(existing.timer);
    }

    const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

    const timer = setTimeout(() => {
      otpStore.delete(cleanEmail);
    }, expiryMinutes * 60 * 1000);

    if (timer.unref) timer.unref();

    otpStore.set(cleanEmail, {
      email: cleanEmail,
      otpCode: String(otpCode).trim(),
      expiresAt,
      isVerified: false,
      resetToken: null,
      timer,
    });
  }

  /**
   * Validates an unverified, non-expired OTP code.
   */
  static findValidOtp(email, otpCode) {
    const cleanEmail = String(email).trim().toLowerCase();
    const entry = otpStore.get(cleanEmail);

    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.invalidate(cleanEmail);
      return null;
    }
    if (entry.isVerified) return null;
    if (entry.otpCode !== String(otpCode).trim()) return null;

    return entry;
  }

  /**
   * Marks OTP as verified and sets the cryptographically secure reset token.
   */
  static markVerified(email, resetToken) {
    const cleanEmail = String(email).trim().toLowerCase();
    const entry = otpStore.get(cleanEmail);
    if (entry) {
      entry.isVerified = true;
      entry.resetToken = String(resetToken).trim();
    }
  }

  /**
   * Validates a verified, non-expired reset token.
   */
  static findValidResetToken(email, resetToken) {
    const cleanEmail = String(email).trim().toLowerCase();
    const entry = otpStore.get(cleanEmail);

    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.invalidate(cleanEmail);
      return null;
    }
    if (!entry.isVerified) return null;
    if (entry.resetToken !== String(resetToken).trim()) return null;

    return entry;
  }

  /**
   * Cleans up the OTP entry for the email once password reset is complete.
   */
  static invalidate(email) {
    const cleanEmail = String(email).trim().toLowerCase();
    const entry = otpStore.get(cleanEmail);
    if (entry && entry.timer) {
      clearTimeout(entry.timer);
    }
    otpStore.delete(cleanEmail);
  }
}

module.exports = OtpStore;
