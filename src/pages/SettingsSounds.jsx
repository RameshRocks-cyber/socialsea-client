import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  NOTIFICATION_SOUND_OPTIONS,
  RINGTONE_OPTIONS,
  getSoundLabel,
  readSoundPrefs,
  writeSoundPrefs
} from "./soundPrefs";
import "./Settings.css";
import "./SettingsSounds.css";

export default function SettingsSounds() {
  const navigate = useNavigate();
  const audioCtxRef = useRef(null);
  const customPreviewAudioRef = useRef(null);
  const [prefs, setPrefs] = useState(readSoundPrefs);

  useEffect(() => {
    writeSoundPrefs(prefs);
  }, [prefs]);

  const ensureAudioContext = () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtxRef.current = new Ctx();
    return audioCtxRef.current;
  };

  const playTone = async (frequency = 700, durationMs = 160, gainValue = 0.05, type = "sine", delayMs = 0) => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    window.setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      osc.start(now);
      osc.stop(now + durationMs / 1000);
    }, Math.max(0, delayMs));
  };

  const previewNotificationSound = (profile) => {
    if (profile === "off") return;
    if (profile === "soft") {
      void playTone(620, 130, 0.06, "sine", 0);
      void playTone(760, 140, 0.06, "sine", 150);
      return;
    }
    if (profile === "digital") {
      void playTone(980, 95, 0.08, "square", 0);
      void playTone(1240, 95, 0.08, "square", 110);
      return;
    }
    if (profile === "sparkle") {
      void playTone(740, 90, 0.08, "triangle", 0);
      void playTone(980, 90, 0.08, "triangle", 120);
      void playTone(1320, 120, 0.06, "sine", 240);
      return;
    }
    if (profile === "bubble") {
      void playTone(420, 80, 0.09, "sine", 0);
      void playTone(520, 85, 0.08, "sine", 90);
      void playTone(640, 95, 0.08, "triangle", 180);
      return;
    }
    if (profile === "twinkle") {
      void playTone(880, 85, 0.08, "sine", 0);
      void playTone(1175, 85, 0.07, "sine", 110);
      void playTone(1568, 100, 0.06, "sine", 220);
      return;
    }
    if (profile === "pop") {
      void playTone(360, 65, 0.09, "square", 0);
      void playTone(960, 105, 0.08, "triangle", 90);
      return;
    }
    void playTone(820, 120, 0.08, "triangle", 0);
    void playTone(980, 120, 0.07, "triangle", 140);
  };

  const previewRingtone = (profile) => {
    if (profile === "off") return;
    if (profile === "custom") {
      const src = String(prefs.customRingtoneDataUrl || "").trim();
      if (!src) return;
      try {
        if (!customPreviewAudioRef.current) {
          customPreviewAudioRef.current = new Audio(src);
        }
        const audio = customPreviewAudioRef.current;
        if (audio.src !== src) audio.src = src;
        audio.currentTime = 0;
        void audio.play();
      } catch {
        // ignore preview playback errors
      }
      return;
    }
    if (profile === "bell") {
      void playTone(700, 200, 0.2, "sine", 0);
      void playTone(880, 200, 0.2, "sine", 210);
      return;
    }
    if (profile === "pulse") {
      void playTone(560, 240, 0.2, "triangle", 0);
      void playTone(620, 240, 0.18, "triangle", 260);
      return;
    }
    if (profile === "marimba") {
      void playTone(523, 180, 0.16, "sine", 0);
      void playTone(659, 180, 0.15, "sine", 210);
      void playTone(784, 220, 0.14, "sine", 420);
      return;
    }
    if (profile === "chime") {
      void playTone(660, 220, 0.16, "triangle", 0);
      void playTone(990, 260, 0.14, "triangle", 250);
      return;
    }
    if (profile === "birdsong") {
      void playTone(940, 120, 0.12, "sine", 0);
      void playTone(1260, 120, 0.11, "sine", 140);
      void playTone(1020, 140, 0.11, "sine", 290);
      return;
    }
    void playTone(640, 320, 0.22, "square", 0);
    void playTone(760, 360, 0.2, "square", 280);
  };

  const onPickNotification = (value) => {
    setPrefs((prev) => ({ ...prev, notificationSound: value }));
    previewNotificationSound(value);
  };

  const onPickRingtone = (value) => {
    setPrefs((prev) => ({ ...prev, ringtoneSound: value }));
    previewRingtone(value);
  };

  const onCustomRingtonePicked = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPrefs((prev) => ({
        ...prev,
        ringtoneSound: "custom",
        customRingtoneDataUrl: dataUrl,
        customRingtoneName: file.name || "Custom ringtone"
      }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const clearCustomRingtone = () => {
    try {
      if (customPreviewAudioRef.current) {
        customPreviewAudioRef.current.pause();
        customPreviewAudioRef.current.currentTime = 0;
      }
    } catch {
      // ignore
    }
    setPrefs((prev) => ({
      ...prev,
      ringtoneSound: prev.ringtoneSound === "custom" ? "classic" : prev.ringtoneSound,
      customRingtoneDataUrl: "",
      customRingtoneName: ""
    }));
  };

  return (
    <div className="settings-page settings-sounds-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings")}>
            {"<"}
          </button>
          <div>
            <h1>Sounds</h1>
            <p className="settings-subtitle">Choose cute notification tones and your ringtone. Saved in localStorage.</p>
          </div>
        </header>

        <section className="settings-section">
          <h2>Current Selection</h2>
          <div className="settings-sound-summary">
            <p>
              Notification: <strong>{getSoundLabel("notification", prefs.notificationSound)}</strong>
            </p>
            <p>
              Ringtone: <strong>{getSoundLabel("ringtone", prefs.ringtoneSound)}</strong>
            </p>
          </div>
        </section>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Cute Notification Sounds</h3>
          </header>
          <div className="settings-select-grid">
            {NOTIFICATION_SOUND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={prefs.notificationSound === opt.value ? "active" : ""}
                onClick={() => onPickNotification(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="watch-later-shortcut"
            onClick={() => previewNotificationSound(prefs.notificationSound)}
          >
            Play Notification Preview
          </button>
        </section>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Ringtone</h3>
          </header>
          <div className="settings-custom-ringtone-row">
            <label className="settings-custom-ringtone-upload">
              Upload My Song
              <input type="file" accept="audio/*" onChange={onCustomRingtonePicked} />
            </label>
            {!!prefs.customRingtoneDataUrl && (
              <button type="button" className="settings-custom-ringtone-clear" onClick={clearCustomRingtone}>
                Remove Song
              </button>
            )}
          </div>
          {!!prefs.customRingtoneName && (
            <p className="settings-custom-ringtone-name">
              Current song: <strong>{prefs.customRingtoneName}</strong>
            </p>
          )}
          <div className="settings-select-grid">
            {RINGTONE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={prefs.ringtoneSound === opt.value ? "active" : ""}
                onClick={() => onPickRingtone(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" className="watch-later-shortcut" onClick={() => previewRingtone(prefs.ringtoneSound)}>
            Play Ringtone Preview
          </button>
        </section>
      </div>
    </div>
  );
}
