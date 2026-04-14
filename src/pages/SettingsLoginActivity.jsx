import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { logout } from "../auth";
import "./Settings.css";

const parseLocalDateTime = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [y, m, d, hh = 0, mm = 0, ss = 0, ns = 0] = value;
    if (!y || !m || !d) return null;
    const ms = Number(ns) ? Math.floor(Number(ns) / 1e6) : 0;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss), ms);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) return null;
    return date;
  }
  return null;
};

const formatWhen = (value) => {
  const date = parseLocalDateTime(value);
  if (!date) return "";
  return date.toLocaleString();
};

const normalizePolicy = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "REJECT") return "Reject new login";
  if (raw === "EVICT_OLDEST") return "Sign out oldest device";
  return raw || "—";
};

export default function SettingsLoginActivity() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busySessionId, setBusySessionId] = useState("");
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [maxDevices, setMaxDevices] = useState(2);
  const [policy, setPolicy] = useState("");

  const activeCount = useMemo(
    () => (Array.isArray(sessions) ? sessions.filter((s) => s?.active).length : 0),
    [sessions]
  );

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.get("/api/security/sessions");
      const payload = res?.data || {};
      setMaxDevices(Number(payload?.maxDevices || 2) || 2);
      setPolicy(normalizePolicy(payload?.policy));
      if (Array.isArray(payload?.sessions)) {
        setSessions(payload.sessions);
      } else {
        setSessions([]);
        setError("Backend returned an unexpected response. Please retry.");
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        logout();
        return;
      }
      if (status === 404) {
        setError("Backend does not support login activity yet. Restart/update backend and retry.");
        return;
      }
      if (!status) {
        setError("Cannot reach backend API. Start backend on http://localhost:8080 and retry.");
        return;
      }
      setError("Could not load login activity. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    load();
  }, []);

  const revokeSession = async (sessionId, { isCurrent } = {}) => {
    const sid = String(sessionId || "").trim();
    if (!sid || busy) return;
    setBusy(true);
    setBusySessionId(sid);
    setError("");
    try {
      await api.post(`/api/security/sessions/revoke/${encodeURIComponent(sid)}`);
      if (isCurrent) {
        logout();
        return;
      }
      await load();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        logout();
        return;
      }
      setError("Could not sign out this device. Please retry.");
    } finally {
      setBusy(false);
      setBusySessionId("");
    }
  };

  const revokeOthers = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/api/security/sessions/revoke-others");
      await load();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        logout();
        return;
      }
      setError("Could not sign out other devices. Please retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page settings-login-activity-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings", { replace: true })}>
            {"<"}
          </button>
          <div>
            <h1>Login activity</h1>
            <p className="settings-subtitle">See and manage devices signed into your account.</p>
          </div>
        </header>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Devices</h3>
            <div>
              <button type="button" onClick={revokeOthers} disabled={busy || loading || activeCount <= 1}>
                Sign out others
              </button>
            </div>
          </header>

          <p className="settings-note">
            Limit: {maxDevices} devices. Policy: {policy}. Active right now: {activeCount}.
          </p>

          {error && <p className="settings-empty">{error}</p>}
          {loading && <p className="settings-empty">Loading login activity...</p>}

          {!error && !loading && (!Array.isArray(sessions) || sessions.length === 0) && (
            <p className="settings-empty">No sessions found yet.</p>
          )}

          {!loading &&
            Array.isArray(sessions) &&
            sessions.map((session) => {
              const sid = String(session?.sessionId || "").trim();
              const titleBase = session?.deviceName || "Device";
              const current = Boolean(session?.current);
              const active = Boolean(session?.active);
              const deviceHint = String(session?.deviceIdHint || "").trim();
              const ip = String(session?.ipAddress || "").trim();
              const seenAt = session?.lastSeenAt || session?.createdAt;
              const statusLabel = current ? "This device" : active ? "Active" : "Signed out";
              const subtitleBits = [
                deviceHint ? `ID ${deviceHint}` : "",
                ip ? `IP ${ip}` : "",
                seenAt ? `Last seen ${formatWhen(seenAt)}` : "",
              ].filter(Boolean);

              return (
                <article
                  key={sid || `${deviceHint}-${ip}-${String(seenAt || "")}`}
                  className={`ss-session-card ${current ? "is-current" : ""} ${active ? "is-active" : "is-revoked"}`}
                >
                  <div className="ss-session-meta">
                    <div className="ss-session-title">
                      <strong>{titleBase}</strong>
                      <span className={`ss-session-badge ${current ? "badge-current" : active ? "badge-active" : "badge-revoked"}`}>
                        {statusLabel}
                      </span>
                    </div>
                    {subtitleBits.length > 0 && <div className="ss-session-sub">{subtitleBits.join(" • ")}</div>}
                    {session?.userAgent && <div className="ss-session-ua">{String(session.userAgent)}</div>}
                  </div>

                  <div className="ss-session-actions">
                    {active && (
                      <button
                        type="button"
                        className="settings-remove"
                        disabled={busy || !sid || (busySessionId && busySessionId !== sid)}
                        onClick={() => revokeSession(sid, { isCurrent: current })}
                        title={current ? "Sign out this device" : "Sign out this device"}
                      >
                        {busySessionId === sid ? "Signing out..." : current ? "Sign out" : "Sign out"}
                      </button>
                    )}
                    {!active && <span className="ss-session-muted">Signed out</span>}
                  </div>
                </article>
              );
            })}
        </section>
      </div>
    </div>
  );
}
