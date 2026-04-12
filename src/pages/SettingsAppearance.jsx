import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COLOR_THEME_OPTIONS, readTheme, setTheme, readCustomThemeColors, setCustomThemeColors } from "../theme";
import { recordAccountHistoryEntry } from "../services/activityStore";
import "./Settings.css";

export default function SettingsAppearance() {
  const navigate = useNavigate();
  const [colorTheme, setColorThemeState] = useState(readTheme);
  const [customThemeColors, setCustomThemeColorsState] = useState(readCustomThemeColors);
  const themeReadyRef = useRef(false);

  const colorThemeLabel = useMemo(() => {
    const match = COLOR_THEME_OPTIONS.find((option) => option.id === colorTheme);
    return match ? match.label : "Dark";
  }, [colorTheme]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setTheme(colorTheme);
    if (themeReadyRef.current) {
      recordAccountHistoryEntry({
        action: "Appearance",
        detail: `Theme changed to ${colorThemeLabel}`,
        source: "settings"
      });
    } else {
      themeReadyRef.current = true;
    }
  }, [colorTheme, colorThemeLabel]);

  useEffect(() => {
    setCustomThemeColors(customThemeColors);
  }, [customThemeColors]);

  const onThemePick = (nextTheme) => {
    if (nextTheme === colorTheme) return;
    setColorThemeState(nextTheme);
  };

  const updateCustomColor = (key, value) => {
    setCustomThemeColorsState((prev) => {
      const next = { ...prev, [key]: value };
      recordAccountHistoryEntry({
        action: "Appearance",
        detail: `Custom ${key} color updated`,
        source: "settings"
      });
      return next;
    });
  };

  return (
    <div className="settings-page settings-appearance-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings")}>
            {"<"}
          </button>
          <div>
            <h1>Appearance</h1>
            <p className="settings-subtitle">Choose your mode, accent theme and custom colors.</p>
          </div>
        </header>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Color Theme</h3>
          </header>

          <div className="settings-theme-mode">
            <button
              type="button"
              className={colorTheme === "black" ? "active" : ""}
              onClick={() => onThemePick("black")}
            >
              Dark
            </button>
            <button
              type="button"
              className={colorTheme === "white" ? "active" : ""}
              onClick={() => onThemePick("white")}
            >
              Light
            </button>
          </div>

          <p className="settings-theme-note">Switch between dark and light mode, then pick an accent below.</p>

          <div className="settings-select-grid">
            {COLOR_THEME_OPTIONS.filter((theme) => theme.id !== "black" && theme.id !== "white").map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={colorTheme === theme.id ? "active" : ""}
                onClick={() => onThemePick(theme.id)}
              >
                {theme.label}
              </button>
            ))}
          </div>

          {colorTheme === "custom" && (
            <div className="settings-custom-theme">
              <label>
                <span>Primary</span>
                <input type="color" value={customThemeColors.accent} onChange={(e) => updateCustomColor("accent", e.target.value)} />
              </label>
              <label>
                <span>Secondary</span>
                <input type="color" value={customThemeColors.accent2} onChange={(e) => updateCustomColor("accent2", e.target.value)} />
              </label>
              <label>
                <span>Background</span>
                <input type="color" value={customThemeColors.bg} onChange={(e) => updateCustomColor("bg", e.target.value)} />
              </label>
              <label>
                <span>Surface</span>
                <input type="color" value={customThemeColors.bgSoft} onChange={(e) => updateCustomColor("bgSoft", e.target.value)} />
              </label>
              <label>
                <span>Border</span>
                <input type="color" value={customThemeColors.border} onChange={(e) => updateCustomColor("border", e.target.value)} />
              </label>
              <label>
                <span>Text</span>
                <input type="color" value={customThemeColors.text} onChange={(e) => updateCustomColor("text", e.target.value)} />
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
