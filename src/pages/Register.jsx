import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerWithPassword, sendOtp } from "../api/auth";
import "./AuthScreen.css";

function parseErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
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

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState("");
  const [otpInfo, setOtpInfo] = useState("");

  const requestOtp = async () => {
    setMsg("");
    setSuccess("");
    setOtpInfo("");
    const cleanContact = contact.trim();
    if (!cleanContact) {
      setMsg("Enter email or mobile number to receive OTP.");
      return;
    }

    setOtpLoading(true);
    try {
      const res = await sendOtp(cleanContact);
      const receivedOtp = String(res?.data?.debugOtp || "").trim();
      const deliveryFailed = Boolean(res?.data?.deliveryFailed);
      const channel = String(res?.data?.channel || "").toLowerCase();
      const channelLabel = channel === "sms" ? "SMS" : "email";
      if (receivedOtp) {
        setOtp(receivedOtp);
        setOtpInfo(
          deliveryFailed
            ? `${channelLabel} delivery failed. Using fallback OTP: ${receivedOtp}`
            : `OTP sent via ${channelLabel}. Debug OTP: ${receivedOtp}`
        );
      } else {
        setOtpInfo(
          deliveryFailed
            ? `OTP generated but ${channelLabel} delivery failed. Try again.`
            : `OTP sent via ${channelLabel}.`
        );
      }
    } catch (err) {
      setMsg(parseErrorMessage(err, "Failed to send OTP."));
    } finally {
      setOtpLoading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setSuccess("");

    if (!username.trim()) {
      setMsg("Username is required.");
      return;
    }
    if (username.trim().length < 3) {
      setMsg("Username must be at least 3 characters.");
      return;
    }
    if (!password || password.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const cleanedContact = contact.trim();
      const looksLikeEmail = cleanedContact.includes("@");
      await registerWithPassword({
        username: username.trim(),
        email: cleanedContact ? (looksLikeEmail ? cleanedContact : null) : null,
        phoneNumber: cleanedContact ? (!looksLikeEmail ? cleanedContact : null) : null,
        password,
        otp: otp.trim() || null
      });
      setSuccess("Account created. You can login now.");
      setTimeout(() => navigate("/login"), 700);
    } catch (err) {
      setMsg(parseErrorMessage(err, "Registration failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen auth-register">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />

      <section className="auth-card-new">
        <div className="auth-brand">
          <img src="/logo.png?v=3" alt="SocialSea" className="auth-logo" />
          <h1>Create SocialSea Account</h1>
          <p>Choose a username and password</p>
        </div>

        <form className="auth-form-new" onSubmit={onSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your username"
            autoComplete="username"
          />

          <label htmlFor="contact">Email or mobile number (optional)</label>
          <input
            id="contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="name@email.com or mobile number"
            autoComplete="on"
          />

          <div className="auth-inline-row">
            <div>
              <label htmlFor="otp">OTP (if required)</label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="enter OTP"
                autoComplete="one-time-code"
              />
            </div>
            <button type="button" className="auth-secondary-btn" onClick={requestOtp} disabled={otpLoading}>
              {otpLoading ? "Sending..." : "Send OTP"}
            </button>
          </div>

          <label htmlFor="password">Password</label>
          <div className="auth-password-row">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="minimum 6 characters"
              autoComplete="new-password"
              className="auth-password-input"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <label htmlFor="confirmPassword">Confirm password</label>
          <div className="auth-password-row">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="repeat password"
              autoComplete="new-password"
              className="auth-password-input"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button type="submit" className="auth-primary-btn" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        {msg && <p className="auth-error">{msg}</p>}
        {otpInfo && <p className="auth-success">{otpInfo}</p>}
        {success && <p className="auth-success">{success}</p>}

        <p className="auth-foot">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </section>
    </div>
  );
}
