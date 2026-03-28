import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SETTINGS_KEY } from "./soundPrefs";
import "./Settings.css";

const NOTIFICATION_CHARACTERS = [
  "Lion",
  "Dog",
  "Puppy",
  "Cat",
  "Panda",
  "Bunny",
  "Penguin",
  "Anime Hero",
  "Robot Cat",
  "Cartoon Kid"
];

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
  notificationBuddySpeed: "medium",
  notificationBuddyVoiceEnabled: true,
  notificationBuddyVoiceName: "",
  notificationBuddyVoiceRate: 1,
  notificationBuddyVoicePitch: 1
};

const readPrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_PREFS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const writePrefs = (next) => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const base = parsed && typeof parsed === "object" ? parsed : {};
    const merged = { ...base, ...(next || {}) };
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
      const preferred = voiceOptions.find(
        (voice) => voice.voiceURI === prefs.notificationBuddyVoiceName || voice.name === prefs.notificationBuddyVoiceName
      );
      if (preferred) utter.voice = preferred;
      utter.rate = Number(prefs.notificationBuddyVoiceRate) || 1;
      utter.pitch = Number(prefs.notificationBuddyVoicePitch) || 1;
      utter.lang = "en-US";
      synth.speak(utter);
    } catch {
      // ignore preview errors
    }
  };

  return (
    <div className="settings-page">
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

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Choose Character</h3>
          </header>
          <div className="settings-select-grid">
            {NOTIFICATION_CHARACTERS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={prefs.notificationBuddyCharacter === opt ? "active" : ""}
                onClick={() => setPrefs((prev) => ({ ...prev, notificationBuddyCharacter: opt }))}
              >
                {opt}
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
