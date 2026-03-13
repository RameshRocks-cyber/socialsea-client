import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { loginWithPassword, registerWithPassword } from "../api/auth";
import { clearAuthStorage } from "../auth";
import { persistProfileIdentity } from "../utils/profileRoute";
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

function persistAuthValue(key, value) {
  if (value == null) return;
  const safe = String(value);
  sessionStorage.setItem(key, safe);
  localStorage.setItem(key, safe);
}

export default function Login() {
  const navigate = useNavigate();
  const isLocalHost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [msg, setMsg] = useState("");

  const completeLogin = async (resData) => {
    const token = resData?.accessToken || resData?.token;
    const refreshToken = resData?.refreshToken || resData?.refresh_token;
    const userId = resData?.userId || resData?.user?.id;
    const role = normalizeRole(resData?.role || resData?.user?.role || (Array.isArray(resData?.roles) ? resData.roles[0] : null));

    if (!token) throw new Error("Login failed: token missing");

    clearAuthStorage();
    persistAuthValue("accessToken", token);
    persistAuthValue("token", token);
    if (userId != null) persistAuthValue("userId", userId);
    if (refreshToken) persistAuthValue("refreshToken", refreshToken);
    if (role) persistAuthValue("role", role);

    if (role === "ADMIN") {
      navigate("/admin");
      return;
    }

    try {
      const profileRes = await api.get("/api/profile/me");
      const profile = profileRes?.data || {};
      persistProfileIdentity(profile);
      const completed =
        Boolean(profile?.profileCompleted) ||
        Boolean(String(profile?.name || "").trim()) ||
        Boolean(String(profile?.profilePic || profile?.profilePicUrl || "").trim());
      persistAuthValue("profileCompleted", completed ? "true" : "false");
    } catch {
      persistAuthValue("profileCompleted", "false");
    }
    navigate("/profile-setup");
  };

  const onPasswordLogin = async (e) => {
    e.preventDefault();
    setMsg("");
    setShowQuickCreate(false);
    if (!identifier.trim() || !password) {
      setMsg("Username/email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await loginWithPassword({ identifier: identifier.trim(), password });
      await completeLogin(res?.data);
    } catch (err) {
      const text = parseErrorMessage(err, "Login failed. Check your credentials.");
      setMsg(text);
      if (isLocalHost && /invalid credentials/i.test(text)) {
        setShowQuickCreate(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const onQuickCreateAccount = async () => {
    setMsg("");
    if (!identifier.trim() || !password) {
      setMsg("Username/email and password are required.");
      return;
    }
    setCreatingAccount(true);
    try {
      const id = identifier.trim();
      const looksLikeEmail = id.includes("@");
      const res = await registerWithPassword({
        username: looksLikeEmail ? undefined : id,
        email: looksLikeEmail ? id : undefined,
        password
      });
      await completeLogin(res?.data);
    } catch (err) {
      setMsg(parseErrorMessage(err, "Could not create account with these credentials."));
    } finally {
      setCreatingAccount(false);
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
          <div className="auth-password-row">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

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
        {showQuickCreate && (
          <button type="button" className="auth-secondary-btn auth-quick-create-btn" onClick={onQuickCreateAccount} disabled={creatingAccount}>
            {creatingAccount ? "Creating account..." : "Create account & Log in (Local)"}
          </button>
        )}

        <p className="auth-foot">
          New here? <Link to="/register">Create account</Link>
        </p>
      </section>
    </div>
  );
}
