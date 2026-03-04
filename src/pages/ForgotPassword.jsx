import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword, resetPasswordWithOtp } from "../api/auth";
import "./AuthScreen.css";

function parseErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    const candidates = [data.message, data.error, data.details, data.title];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  const generic = err?.message;
  if (typeof generic === "string" && generic.trim()) return generic;
  return fallback;
}

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const onSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!identifier.trim()) {
      setError("Email or username is required.");
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(identifier.trim());
      setOtpSent(true);
      setSuccess("OTP sent. Enter OTP and your new password.");
    } catch (err) {
      setError(parseErrorMessage(err, "Failed to send OTP."));
    } finally {
      setLoading(false);
    }
  };

  const onResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!identifier.trim()) {
      setError("Email or username is required.");
      return;
    }
    if (!otp.trim()) {
      setError("OTP is required.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetPasswordWithOtp({
        identifier: identifier.trim(),
        otp: otp.trim(),
        newPassword,
      });
      setSuccess("Password reset successful. You can log in now.");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(parseErrorMessage(err, "Failed to reset password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />

      <section className="auth-card-new">
        <div className="auth-brand">
          <img src="/logo.png?v=3" alt="SocialSea" className="auth-logo" />
          <h1>Forgot password</h1>
          <p>Enter your username or email to reset your password</p>
        </div>

        <form className="auth-form-new" onSubmit={onSendOtp}>
          <label htmlFor="identifier">Username or email</label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="username or name@email.com"
            autoComplete="username"
          />

          <button type="submit" className="auth-primary-btn" disabled={loading}>
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </form>

        {otpSent && (
          <form className="auth-form-new auth-otp-form" onSubmit={onResetPassword}>
            <label htmlFor="otp">OTP</label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter OTP"
              autoComplete="one-time-code"
            />

            <label htmlFor="newPassword">New password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
            />

            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />

            <button type="submit" className="auth-primary-btn" disabled={loading}>
              {loading ? "Updating..." : "Reset password"}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="auth-success">{success}</p>}

        <p className="auth-foot">
          Remembered it? <Link to="/login">Back to login</Link>
        </p>
      </section>
    </div>
  );
}
