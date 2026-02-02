import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sendOtp, verifyOtp } from "../api/auth";

const Login = () => {
  const [step, setStep] = useState("EMAIL"); // EMAIL | OTP
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const navigate = useNavigate();

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
    try {
      await sendOtp(email);
      setStep("OTP");
      setTimer(45); // Start 45s timer
    } catch (err) {
      console.error(err);
      alert("Please try again later");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await verifyOtp(email, otp);
      // Save JWT to localStorage (using accessToken to match api/auth.js)
      const token = res.data.accessToken || res.data.token;
      const role = res.data.role;

      localStorage.setItem("accessToken", token);
      localStorage.setItem("role", role);

      if (role === "ADMIN") {
        navigate("/admin");
      } else {
        navigate("/home");
      }
    } catch (err) {
      console.error(err);
      alert("Invalid or expired OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxInlineSize: "400px", margin: "2rem auto", padding: "2rem", border: "1px solid #ccc", borderRadius: "8px" }}>
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
          <button onClick={handleSendOtp} disabled={loading || !email} style={{ inlineSize: "100%", padding: "10px", cursor: "pointer" }}>
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </div>
      )}

      {step === "OTP" && (
        <div>
          <p style={{ textAlign: "center", marginBlockEnd: "1rem" }}>OTP sent if this email exists</p>
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
          <button onClick={handleVerifyOtp} disabled={otp.length !== 6 || loading} style={{ inlineSize: "100%", padding: "10px", cursor: "pointer", marginBlockEnd: "10px" }}>
            {loading ? "Verifying..." : "Verify OTP"}
          </button>

          <div style={{ textAlign: "center" }}>
            {timer > 0 ? (
              <span style={{ color: "gray" }}>Resend in {timer}s</span>
            ) : (
              <button onClick={handleSendOtp} disabled={loading} style={{ background: "none", border: "none", color: "blue", cursor: "pointer", textDecoration: "underline" }}>
                Resend OTP
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;