import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { LANGUAGE_OPTIONS, getLanguageLabel, normalizeLanguageKey } from "../i18n/languages";
import { applyUiLanguage, readPreferredLanguageSetting, writePreferredLanguageSetting } from "../i18n/uiLanguage";
import { recordAccountHistoryEntry } from "../services/activityStore";
import "./Settings.css";

export default function SettingsLanguage() {
  const navigate = useNavigate();
  const [languageKey, setLanguageKey] = useState(readPreferredLanguageSetting);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const languageLabel = useMemo(() => getLanguageLabel(languageKey), [languageKey]);
  const filteredLanguages = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return LANGUAGE_OPTIONS;
    return LANGUAGE_OPTIONS.filter((opt) => {
      const label = String(opt.label || "").toLowerCase();
      const key = String(opt.key || "").toLowerCase();
      return label.includes(q) || key.includes(q);
    });
  }, [query]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLanguage = async () => {
      try {
        const res = await api.get("/api/profile/me/language", { timeout: 2500 });
        const value = res?.data?.preferredLanguage;
        if (cancelled) return;
        if (typeof value === "string" && value.trim()) {
          const next = normalizeLanguageKey(value);
          setLanguageKey(next);
          writePreferredLanguageSetting(next);
        }
      } catch {
        // keep local preference if backend is unavailable
      }
    };
    loadLanguage();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = async (next) => {
    const picked = normalizeLanguageKey(next);
    if (busy) return;
    if (picked === languageKey) {
      navigate("/settings", { replace: true });
      return;
    }

    setLanguageKey(picked);
    writePreferredLanguageSetting(picked);
    recordAccountHistoryEntry({
      action: "Language",
      detail: `Changed to ${getLanguageLabel(picked)}`,
      source: "settings"
    });

    setBusy(true);
    try {
      await api.post("/api/profile/me/language", { preferredLanguage: picked });
    } catch {
      // Keep local selection if the backend is unavailable
    } finally {
      setBusy(false);
    }

    await applyUiLanguage(picked, { allowReload: true });
    navigate("/settings", { replace: true });
  };

  return (
    <div className="settings-page settings-language-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings", { replace: true })}>
            {"<"}
          </button>
          <div>
            <h1>Language</h1>
            <p className="settings-subtitle">Current: {languageLabel}</p>
          </div>
        </header>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Choose language</h3>
          </header>

          <input
            type="text"
            className="settings-user-search"
            placeholder="Search language"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="settings-select-grid">
            {filteredLanguages.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={languageKey === opt.key ? "active" : ""}
                onClick={() => setLanguage(opt.key)}
                disabled={busy}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
