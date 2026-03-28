import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SETTINGS_KEY } from "./soundPrefs";
import { CONTENT_TYPE_OPTIONS, DEFAULT_CONTENT_TYPES, normalizeContentTypeList } from "./contentPrefs";
import "./Settings.css";

const readContentTypes = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeContentTypeList(parsed?.contentTypes || DEFAULT_CONTENT_TYPES);
  } catch {
    return [...DEFAULT_CONTENT_TYPES];
  }
};

const writeContentTypes = (nextTypes) => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const base = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
    base.contentTypes = nextTypes;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(base));
  } catch {
    // ignore storage failures
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ss-settings-update"));
  }
};

export default function SettingsContentTypes() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(readContentTypes);

  useEffect(() => {
    const refresh = () => setSelected(readContentTypes());
    window.addEventListener("ss-settings-update", refresh);
    return () => window.removeEventListener("ss-settings-update", refresh);
  }, []);

  const toggleType = (value) => {
    setSelected((prev) => {
      const set = new Set(normalizeContentTypeList(prev));
      if (set.has(value)) set.delete(value);
      else set.add(value);
      const next = normalizeContentTypeList(Array.from(set));
      writeContentTypes(next);
      return next;
    });
  };

  return (
    <div className="settings-page settings-content-types-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings")}>{"<"}</button>
          <div>
            <h1>Content Types</h1>
            <p className="settings-subtitle">Choose what shows up when you upload posts, reels, and live.</p>
          </div>
        </header>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Available types</h3>
            <button type="button" onClick={() => navigate("/settings")}>Close</button>
          </header>
          <div className="settings-select-grid">
            {CONTENT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`content-type-option ${selected.includes(opt.value) ? "active is-selected" : ""}`}
                onClick={() => toggleType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="settings-note">Turning all off keeps everything.</p>
        </section>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Selected types</h3>
          </header>
          {selected.length ? (
            <div className="settings-select-grid content-type-selected-grid">
              {CONTENT_TYPE_OPTIONS.filter((opt) => selected.includes(opt.value)).map((opt) => (
                <span key={`selected-${opt.value}`} className="content-type-chip">
                  {opt.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="settings-empty">All types will show because none are selected.</p>
          )}
        </section>
      </div>
    </div>
  );
}
