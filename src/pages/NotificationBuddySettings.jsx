import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import {
  getNotificationBuddyLabel,
  normalizeNotificationBuddyCharacter,
  NOTIFICATION_BUDDY_CHARACTERS
} from "../components/notificationBuddyConfig";
import { SETTINGS_KEY } from "./soundPrefs";
import "./Settings.css";

const normalizeVoiceGender = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male" || normalized === "female" || normalized === "auto") return normalized;
  if (normalized === "m") return "male";
  if (normalized === "f") return "female";
  return "auto";
};

const normalizeLangCode = (value) => String(value || "").trim().replace(/_/g, "-");

const pickGenderVoice = (voices, gender, targetLang = "en-US") => {
  const voiceGender = normalizeVoiceGender(gender);
  if (voiceGender === "auto") return null;
  const list = Array.isArray(voices) ? voices : [];
  if (!list.length) return null;

  const target = normalizeLangCode(targetLang);
  const base = target.split("-")[0]?.toLowerCase();
  const exactLang = list.filter((v) => normalizeLangCode(v?.lang).toLowerCase() === target.toLowerCase());
  const baseLang = list.filter((v) => normalizeLangCode(v?.lang).toLowerCase().startsWith(`${base}-`));
  const langVoices = exactLang.length ? exactLang : (baseLang.length ? baseLang : list);

  const femaleHints = ["female", "woman", "zira", "susan", "samantha", "heera", "kalpana"];
  const maleHints = ["male", "man", "david", "mark", "alex", "ravi", "hemant"];
  const hints = voiceGender === "female" ? femaleHints : maleHints;
  const match = langVoices.find((v) => hints.some((h) => String(v?.name || "").toLowerCase().includes(h)));
  return match || null;
};

const VOICE_RATE_OPTIONS = [
  { value: 0.85, label: "Slow" },
  { value: 1.0, label: "Normal" },
  { value: 1.15, label: "Fast" }
];

const VOICE_PITCH_OPTIONS = [
  { value: 0.9, label: "Low" },
  { value: 1.0, label: "Normal" },
  { value: 1.1, label: "High" }
];

const MOVE_SPEED_OPTIONS = [
  { value: "slow", label: "Slow" },
  { value: "medium", label: "Medium" },
  { value: "fast", label: "Fast" }
];

const DEFAULT_PREFS = {
  notificationBuddy: true,
  notificationBuddyCharacter: "Cat",
  notificationBuddyHideWhenEmpty: false,
  notificationBuddySpeed: "medium",
  notificationBuddyVoiceEnabled: true,
  notificationBuddyVoiceGender: "auto",
  notificationBuddyVoiceName: "",
  notificationBuddyVoiceRate: 1,
  notificationBuddyVoicePitch: 1
};

const readPrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { ...DEFAULT_PREFS, ...(parsed || {}) };
    return {
      ...merged,
      notificationBuddyCharacter: normalizeNotificationBuddyCharacter(merged.notificationBuddyCharacter),
      notificationBuddyVoiceGender: normalizeVoiceGender(merged.notificationBuddyVoiceGender)
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const writePrefs = (next) => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const base = parsed && typeof parsed === "object" ? parsed : {};
    const merged = {
      ...base,
      ...(next || {}),
      notificationBuddyCharacter: normalizeNotificationBuddyCharacter(
        next?.notificationBuddyCharacter ?? base?.notificationBuddyCharacter
      ),
      notificationBuddyVoiceGender: normalizeVoiceGender(
        next?.notificationBuddyVoiceGender ?? base?.notificationBuddyVoiceGender
      )
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage issues
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ss-settings-update"));
    }
  } catch {
    // ignore dispatch failures
  }
};

const readDisplayName = () => {
  const name = sessionStorage.getItem("name") || localStorage.getItem("name");
  const username = sessionStorage.getItem("username") || localStorage.getItem("username");
  const email = sessionStorage.getItem("email") || localStorage.getItem("email");
  const raw = String(name || "").trim() || String(username || "").trim() || String(email || "").split("@")[0];
  if (!raw) return "there";
  const safe = raw.replace(/[^\w\s.-]/g, "").trim();
  return safe || "there";
};

export default function NotificationBuddySettings() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(readPrefs);
  const [voices, setVoices] = useState([]);
  const displayName = useMemo(() => readDisplayName(), []);

  useEffect(() => {
    writePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    if (!window.speechSynthesis || typeof window.speechSynthesis.getVoices !== "function") return;
    const synth = window.speechSynthesis;
    const load = () => {
      const list = synth.getVoices();
      setVoices(Array.isArray(list) ? list : []);
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  const voiceOptions = useMemo(() => {
    const seen = new Set();
    return voices.filter((voice) => {
      const key = voice.voiceURI || voice.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [voices]);

  const previewVoice = () => {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      const text = `${displayName}, you have a new notification.`;
      const utter = new SpeechSynthesisUtterance(text);
      const preferredByName = voiceOptions.find(
        (voice) => voice.voiceURI === prefs.notificationBuddyVoiceName || voice.name === prefs.notificationBuddyVoiceName
      );
      const preferred = preferredByName || pickGenderVoice(voiceOptions, prefs.notificationBuddyVoiceGender, "en-US");
      if (preferred) utter.voice = preferred;
      utter.rate = Number(prefs.notificationBuddyVoiceRate) || 1;
      utter.pitch = Number(prefs.notificationBuddyVoicePitch) || 1;
      utter.lang = "en-US";
      synth.speak(utter);
    } catch {
      // ignore preview errors
    }
  };

  const setVoiceGender = (nextGender) => {
    const normalized = normalizeVoiceGender(nextGender);
    setPrefs((prev) => ({ ...prev, notificationBuddyVoiceGender: normalized }));
    if (normalized === "male" || normalized === "female") {
      api.post("/api/profile/me/notification-voice", { notificationVoice: normalized }).catch(() => {});
    }
  };

  return (
    <div className="settings-page settings-notification-buddy-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings")}>
            {"<"}
          </button>
          <div>
            <h1>Notification Character</h1>
            <p className="settings-subtitle">Pick your buddy, voice, and how it speaks to you.</p>
          </div>
        </header>

        <section className="settings-section">
          <h2>Buddy Switch</h2>
          <div className="settings-select-grid buddy-character-grid">
            <button
              type="button"
              className={prefs.notificationBuddy ? "active" : ""}
              onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddy: true }))}
            >
              On
            </button>
            <button
              type="button"
              className={!prefs.notificationBuddy ? "active" : ""}
              onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddy: false }))}
            >
              Off
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2>Hide When Empty</h2>
          <div className="settings-select-grid buddy-character-grid">
            <button
              type="button"
              className={prefs.notificationBuddyHideWhenEmpty ? "active" : ""}
              onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyHideWhenEmpty: true }))}
            >
              On
            </button>
            <button
              type="button"
              className={!prefs.notificationBuddyHideWhenEmpty ? "active" : ""}
              onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyHideWhenEmpty: false }))}
            >
              Off
            </button>
          </div>
          <p className="settings-note">Hide the buddy when there are no unread notifications.</p>
        </section>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Choose Character</h3>
          </header>
          <div className="settings-select-grid">
            {NOTIFICATION_BUDDY_CHARACTERS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={prefs.notificationBuddyCharacter === opt ? "active" : ""}
                onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyCharacter: opt }))}
              >
                {getNotificationBuddyLabel(opt)}
              </button>
            ))}
          </div>
          <p className="settings-note">Drag the buddy on screen to place it anywhere you want.</p>
          <p className="settings-note">Place sprites in `public/shimeji` to match your exact art.</p>
        </section>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Movement Speed</h3>
          </header>
          <div className="settings-select-grid">
            {MOVE_SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={prefs.notificationBuddySpeed === opt.value ? "active" : ""}
                onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddySpeed: opt.value }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="settings-note">Controls how fast the buddy walks around the screen.</p>
        </section>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Voice</h3>
          </header>
          <div className="settings-select-grid">
            <button
              type="button"
              className={prefs.notificationBuddyVoiceEnabled ? "active" : ""}
              onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyVoiceEnabled: true }))}
            >
              Voice On
            </button>
            <button
              type="button"
              className={!prefs.notificationBuddyVoiceEnabled ? "active" : ""}
              onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyVoiceEnabled: false }))}
            >
              Voice Off
            </button>
          </div>

          <div className="settings-select-grid">
            <button
              type="button"
              className={prefs.notificationBuddyVoiceGender === "male" ? "active" : ""}
              onClick={() => setVoiceGender("male")}
            >
              Male
            </button>
            <button
              type="button"
              className={prefs.notificationBuddyVoiceGender === "female" ? "active" : ""}
              onClick={() => setVoiceGender("female")}
            >
              Female
            </button>
            <button
              type="button"
              className={prefs.notificationBuddyVoiceGender === "auto" ? "active" : ""}
              onClick={() => setVoiceGender("auto")}
            >
              Auto
            </button>
          </div>
          <p className="settings-note">Gender is used only when Voice is set to Auto (default).</p>

          <div className="settings-select-grid">
            <label className="settings-voice-select">
              <span>Voice</span>
              <select
                value={prefs.notificationBuddyVoiceName}
                onChange={(event) =>
                  setPrefs((prev) => ({ ...prev, notificationBuddyVoiceName: event.target.value }))
                }
              >
                <option value="">Auto (default)</option>
                {voiceOptions.map((voice) => {
                  const key = voice.voiceURI || voice.name;
                  return (
                    <option key={key} value={key}>
                      {voice.name} ({voice.lang})
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <div className="settings-select-grid">
            {VOICE_RATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={Number(prefs.notificationBuddyVoiceRate) === opt.value ? "active" : ""}
                onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyVoiceRate: opt.value }))}
              >
                Speed: {opt.label}
              </button>
            ))}
          </div>

          <div className="settings-select-grid">
            {VOICE_PITCH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={Number(prefs.notificationBuddyVoicePitch) === opt.value ? "active" : ""}
                onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyVoicePitch: opt.value }))}
              >
                Pitch: {opt.label}
              </button>
            ))}
          </div>

          <button type="button" className="watch-later-shortcut" onClick={previewVoice}>
            Preview Voice
          </button>
          <p className="settings-note">Tip: browsers require one tap to allow speech audio.</p>
        </section>
      </div>
    </div>
  );
}
