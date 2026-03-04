import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { loginWithPassword } from "../api/auth";
import { clearAuthStorage } from "../auth";
import "./AuthScreen.css";

function parseErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) {
    const text = data.trim();
    if (/^\s*<!doctype html/i.test(text) || /<html[\s>]/i.test(text)) {
      return "Server route mismatch (received HTML instead of API JSON). Please retry in a few seconds.";
    }
    return text;
  }
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

function normalizeRole(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const noPrefix = raw.startsWith("ROLE_") ? raw.slice(5) : raw;
  return noPrefix.toUpperCase();
}

export default function Login() {
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const completeLogin = async (resData) => {
    const token = resData?.accessToken || resData?.token;
    const refreshToken = resData?.refreshToken || resData?.refresh_token;
    const userId = resData?.userId || resData?.user?.id;
    const role = normalizeRole(resData?.role || resData?.user?.role || (Array.isArray(resData?.roles) ? resData.roles[0] : null));

    if (!token) throw new Error("Login failed: token missing");

    clearAuthStorage();
    sessionStorage.setItem("accessToken", token);
    sessionStorage.setItem("token", token);
    if (userId != null) sessionStorage.setItem("userId", String(userId));
    if (refreshToken) sessionStorage.setItem("refreshToken", refreshToken);
    if (role) sessionStorage.setItem("role", role);

    if (role === "ADMIN") {
      navigate("/admin");
      return;
    }

    try {
      const profileRes = await api.get("/api/profile/me");
      const profile = profileRes?.data || {};
      const completed =
        Boolean(profile?.profileCompleted) ||
        Boolean(String(profile?.name || "").trim()) ||
        Boolean(String(profile?.profilePic || profile?.profilePicUrl || "").trim());
      sessionStorage.setItem("profileCompleted", completed ? "true" : "false");
    } catch {
      sessionStorage.setItem("profileCompleted", "false");
    }
    navigate("/profile-setup");
  };

  const onPasswordLogin = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!identifier.trim() || !password) {
      setMsg("Username/email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await loginWithPassword({ identifier: identifier.trim(), password });
      await completeLogin(res?.data);
    } catch (err) {
      setMsg(parseErrorMessage(err, "Login failed. Check your credentials."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen auth-login">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />

      <section className="auth-card-new">
        <div className="auth-brand">
          <img src="/logo.png?v=3" alt="SocialSea" className="auth-logo" />
          <h1>SocialSea</h1>
          <p>Sign in with username or email</p>
        </div>

        <form className="auth-form-new" onSubmit={onPasswordLogin}>
          <label htmlFor="identifier">Username or email</label>
          <input
            id="identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="username or name@email.com"
            autoComplete="username"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />

          <div className="auth-forgot-row">
            <Link to="/forgot-password" className="auth-forgot-link">
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="auth-primary-btn" disabled={loading}>
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>

        {msg && <p className="auth-error">{msg}</p>}

        <p className="auth-foot">
          New here? <Link to="/register">Create account</Link>
        </p>
      </section>
    </div>
  );
}
