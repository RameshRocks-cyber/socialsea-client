import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Settings.css";

const SETTINGS_KEY = "socialsea_settings_v1";

const readAccountPrivacy = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    const value = parsed?.accountPrivate;
    return typeof value === "boolean" ? value : true;
  } catch {
    return true;
  }
};

const writeAccountPrivacy = (next) => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const payload = { ...(parsed || {}), accountPrivate: next };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accountPrivate: next }));
  }
};

export default function SettingsPrivacy() {
  const navigate = useNavigate();
  const [accountPrivate, setAccountPrivateState] = useState(readAccountPrivacy);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    writeAccountPrivacy(accountPrivate);
  }, [accountPrivate]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPrivacy = async () => {
      try {
        const res = await api.get("/api/profile/me");
        const data = res?.data?.user || res?.data || {};
        const value = data?.privateAccount ?? data?.accountPrivate;
        if (!cancelled && typeof value === "boolean") {
          setAccountPrivateState(value);
        }
      } catch {
        // keep local preference if backend is unavailable
      }
    };
    loadPrivacy();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAccountPrivacy = async (next) => {
    if (busy || next === accountPrivate) return;
    setAccountPrivateState(next);
    setBusy(true);
    try {
      await api.post("/api/profile/me/privacy", { privateAccount: next });
    } catch {
      // Keep local selection if the backend is unavailable
    } finally {
      setBusy(false);
      navigate("/settings", { replace: true });
    }
  };

  return (
    <div className="settings-page settings-privacy-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings", { replace: true })}>
            {"<"}
          </button>
          <div>
            <h1>Account Privacy</h1>
            <p className="settings-subtitle">Choose who can see your content.</p>
          </div>
        </header>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Privacy</h3>
          </header>
          <div className="settings-select-grid">
            <button
              type="button"
              className={accountPrivate ? "active" : ""}
              onClick={() => setAccountPrivacy(true)}
              disabled={busy}
            >
              Private
            </button>
            <button
              type="button"
              className={!accountPrivate ? "active" : ""}
              onClick={() => setAccountPrivacy(false)}
              disabled={busy}
            >
              Public
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
