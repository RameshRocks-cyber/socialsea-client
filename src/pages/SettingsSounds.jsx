import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  NOTIFICATION_SOUND_OPTIONS,
  RINGTONE_OPTIONS,
  NOTIFICATION_SOUND_URLS,
  RINGTONE_SOUND_URLS,
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

  const stopPreviewAudio = () => {
    try {
      if (customPreviewAudioRef.current) {
        customPreviewAudioRef.current.pause();
        customPreviewAudioRef.current.currentTime = 0;
      }
    } catch {
      // ignore preview playback errors
    }
  };

  const playPresetPreview = (url, durationMs = 2200, volume = 0.95) => {
    const src = String(url || "").trim();
    if (!src) return;
    stopPreviewAudio();
    try {
      const audio = new Audio(src);
      customPreviewAudioRef.current = audio;
      audio.volume = volume;
      audio.currentTime = 0;
      void audio.play();
      window.setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // ignore
        }
      }, Math.max(700, durationMs));
    } catch {
      // ignore preview playback errors
    }
  };

  const previewNotificationSound = (profile) => {
    if (profile === "off") return;
    const url = NOTIFICATION_SOUND_URLS[String(profile || "").trim()];
    if (url) {
      playPresetPreview(url, 2000, 0.95);
      return;
    }
    // Fallback for unknown old profiles.
    void playTone(820, 120, 0.08, "triangle", 0);
    void playTone(980, 120, 0.07, "triangle", 140);
  };

  const previewRingtone = (profile) => {
    if (profile === "off") return;
    if (profile === "custom") {
      const src = String(prefs.customRingtoneDataUrl || prefs.customRingtoneUrl || "").trim();
      if (!src) return;
      const startSec = Math.max(0, Number(prefs.customRingtoneStartSec) || 0);
      const durationSec = Math.max(2, Number(prefs.customRingtoneDurationSec) || 20);
      try {
        if (!customPreviewAudioRef.current) {
          customPreviewAudioRef.current = new Audio(src);
        }
        const audio = customPreviewAudioRef.current;
        if (audio.src !== src) audio.src = src;
        audio.currentTime = startSec;
        void audio.play();
        window.setTimeout(() => {
          try {
            audio.pause();
          } catch {
            // ignore
          }
        }, durationSec * 1000);
      } catch {
        // ignore preview playback errors
      }
      return;
    }
    const url = RINGTONE_SOUND_URLS[String(profile || "").trim()];
    if (url) {
      playPresetPreview(url, 5200, 0.95);
      return;
    }
    // Fallback for unknown old profiles.
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
        customRingtoneName: file.name || "Custom ringtone",
        customRingtoneUrl: "",
        customRingtoneStartSec: 0,
        customRingtoneDurationSec: 20
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
      customRingtoneName: "",
      customRingtoneUrl: "",
      customRingtoneStartSec: 0,
      customRingtoneDurationSec: 20
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
            <p className="settings-subtitle">Craft your signature vibe with premium notification tones and cinematic ringtones.</p>
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
            <h3>Notification Sound Pack</h3>
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
            <h3>Ringtone Collection</h3>
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
