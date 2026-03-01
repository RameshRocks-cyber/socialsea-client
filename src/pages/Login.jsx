import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sendOtp, verifyOtp } from "../api/auth";
import api from "../api/axios";

const Login = () => {
  const showDevOtp = import.meta.env.DEV && String(import.meta.env.VITE_SHOW_DEV_OTP || "false") === "true";
  const [step, setStep] = useState("EMAIL"); // EMAIL | OTP
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [debugOtp, setDebugOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();

  const isProfileComplete = (profile) => {
    const explicit = Boolean(profile?.profileCompleted);
    const hasName = Boolean(String(profile?.name || "").trim());
    const hasPic = Boolean(String(profile?.profilePic || profile?.profilePicUrl || "").trim());
    return explicit || hasName || hasPic;
  };

  // Timer logic
  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (timer > 0) return;

    // Validate email format
    if (!email || !email.includes("@")) {
      alert("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setMsg("");
    setDebugOtp("");
    try {
      const res = await sendOtp(email);
      const serverOtp =
        res?.data?.debugOtp ||
        res?.data?.devOtp ||
        res?.data?.otp ||
        res?.data?.data?.debugOtp ||
        "";
      if (serverOtp && showDevOtp) {
        setDebugOtp(String(serverOtp));
      }
      setStep("OTP");
      setTimer(45); // Start 45s timer
    } catch (err) {
      console.error(err);
      setMsg("Send OTP failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const res = await verifyOtp(email, otp);
      // Save JWT to localStorage (using accessToken to match api/auth.js)
      const token = res.data.accessToken || res.data.token;
      const refreshToken = res.data.refreshToken || res.data.refresh_token;
      const userId = res.data.userId || res.data.user?.id;
      const normalizeRole = (roleValue) => {
        if (!roleValue) return null;
        const raw = String(roleValue).trim();
        const noPrefix = raw.startsWith("ROLE_") ? raw.slice(5) : raw;
        return noPrefix.toUpperCase();
      };
      const role = normalizeRole(
        res.data.role ||
          res.data.user?.role ||
          (Array.isArray(res.data.roles) ? res.data.roles[0] : null)
      );

      if (!token) {
        setMsg("Login failed: token missing from server response");
        return;
      }

      localStorage.setItem("accessToken", token);
      localStorage.setItem("token", token);
      sessionStorage.setItem("accessToken", token);
      sessionStorage.setItem("token", token);
      if (userId != null) {
        localStorage.setItem("userId", String(userId));
        sessionStorage.setItem("userId", String(userId));
      }
      if (refreshToken) {
        localStorage.setItem("refreshToken", refreshToken);
      }
      if (role) {
        localStorage.setItem("role", role);
      }

      if (role === "ADMIN") {
        navigate("/admin");
      } else {
        try {
          const profileRes = await api.get("/api/profile/me");
          const completed = isProfileComplete(profileRes?.data);
          localStorage.setItem("profileCompleted", completed ? "true" : "false");
          if (completed) {
            navigate("/feed");
          } else {
            navigate("/profile-setup");
          }
        } catch {
          navigate("/profile-setup");
        }
      }
    } catch (err) {
      console.error(err);
      setMsg("Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      style={{ maxInlineSize: "400px", margin: "2rem auto", padding: "2rem", border: "1px solid #ccc", borderRadius: "8px" }}
    >
      <h2 style={{ textAlign: "center", marginBlockEnd: "1.5rem" }}>
        {step === "EMAIL" ? "Login" : "Verify OTP"}
      </h2>

      {step === "EMAIL" && (
        <div>
          <input
            type="email"
            placeholder="Enter Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={{ inlineSize: "100%", padding: "10px", marginBlockEnd: "10px", boxSizing: "border-box" }}
          />
          <button type="button" onClick={handleSendOtp} disabled={loading || !email} style={{ inlineSize: "100%", padding: "10px", cursor: "pointer" }}>
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </div>
      )}

      {step === "OTP" && (
        <div>
          <p style={{ textAlign: "center", marginBlockEnd: "1rem" }}>OTP sent if this email exists</p>
          {showDevOtp && debugOtp && (
            <p style={{ textAlign: "center", marginBlockEnd: "0.75rem", color: "#0a7a2f", fontWeight: 600 }}>
              Dev OTP: {debugOtp}
            </p>
          )}
          <input
            type="text"
            value={otp}
            onChange={(e) => {
              const val = e.target.value;
              if (/^\d*$/.test(val) && val.length <= 6) setOtp(val);
            }}
            maxLength={6}
            inputMode="numeric"
            autoFocus
            placeholder="000000"
            disabled={loading}
            style={{ inlineSize: "100%", padding: "10px", marginBlockEnd: "10px", textAlign: "center", letterSpacing: "5px", fontSize: "1.2rem", boxSizing: "border-box" }}
          />
          <button type="button" onClick={handleVerifyOtp} disabled={otp.length !== 6 || loading} style={{ inlineSize: "100%", padding: "10px", cursor: "pointer", marginBlockEnd: "10px" }}>
            {loading ? "Verifying..." : "Verify OTP"}
          </button>

          <div style={{ textAlign: "center" }}>
            {timer > 0 ? (
              <span style={{ color: "gray" }}>Resend in {timer}s</span>
            ) : (
              <button type="button" onClick={handleSendOtp} disabled={loading} style={{ background: "none", border: "none", color: "blue", cursor: "pointer", textDecoration: "underline" }}>
                Resend OTP
              </button>
            )}
          </div>
        </div>
      )}
      {msg && <p style={{ marginTop: "1rem", color: "#ff6b6b", textAlign: "center" }}>{msg}</p>}
    </form>
  );
};

export default Login;
