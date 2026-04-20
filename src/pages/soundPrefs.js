export const SETTINGS_KEY = "socialsea_settings_v1";
export const DEFAULT_CUSTOM_RINGTONE_URL = "";
export const DEFAULT_CUSTOM_RINGTONE_NAME = "My Song";
export const DEFAULT_CUSTOM_RINGTONE_START_SEC = 18;
export const DEFAULT_CUSTOM_RINGTONE_DURATION_SEC = 20;

export const NOTIFICATION_SOUND_OPTIONS = [
  { value: "classic", label: "Aurora Ping" },
  { value: "soft", label: "Velvet Chime" },
  { value: "digital", label: "Circuit Glow" },
  { value: "sparkle", label: "Diamond Spark" },
  { value: "bubble", label: "Skyline Rise" },
  { value: "twinkle", label: "Choir Lift" },
  { value: "pop", label: "Birdsong Grove" },
  { value: "zen", label: "Water Garden" },
  { value: "off", label: "Off" }
];

export const RINGTONE_OPTIONS = [
  { value: "bell", label: "Cinematic Descent" },
  { value: "pulse", label: "Ocean Breeze" },
  { value: "marimba", label: "Dawn Chorus" },
  { value: "chime", label: "Waterfall Haven" },
  { value: "birdsong", label: "Calm Signature" },
  { value: "cinematic", label: "Nebula Rise" },
  { value: "custom", label: "My Song" },
  { value: "off", label: "Off" }
];

export const NOTIFICATION_SOUND_URLS = {
  classic: "/sounds/premium-pack/calm-piano-logo.mp3",
  soft: "/sounds/premium-pack/elegant-logo-chime.mp3",
  digital: "/sounds/premium-pack/neon-circuit-hum.mp3",
  sparkle: "/sounds/premium-pack/diamond-cinematic-hit.mp3",
  bubble: "/sounds/premium-pack/corporate-rise-whoosh.mp3",
  twinkle: "/sounds/premium-pack/heavenly-choir-swell.mp3",
  pop: "/sounds/premium-pack/little-birds-grove.wav",
  zen: "/sounds/premium-pack/water-birds-ambience.wav"
};

export const RINGTONE_SOUND_URLS = {
  classic: "/sounds/premium-pack/midnight-pulse-loop.mp3",
  bell: "/sounds/premium-pack/cinematic-descent-whoosh.mp3",
  pulse: "/sounds/premium-pack/ocean-birds-loop.wav",
  marimba: "/sounds/premium-pack/little-birds-grove.wav",
  chime: "/sounds/premium-pack/water-birds-ambience.wav",
  birdsong: "/sounds/premium-pack/calm-piano-logo.mp3",
  cinematic: "/sounds/premium-pack/diamond-cinematic-hit.mp3"
};

export const DEFAULT_SOUND_PREFS = {
  notificationSound: "classic",
  ringtoneSound: "bell",
  customRingtoneDataUrl: "",
  customRingtoneName: DEFAULT_CUSTOM_RINGTONE_NAME,
  customRingtoneUrl: DEFAULT_CUSTOM_RINGTONE_URL,
  customRingtoneStartSec: DEFAULT_CUSTOM_RINGTONE_START_SEC,
  customRingtoneDurationSec: DEFAULT_CUSTOM_RINGTONE_DURATION_SEC
};

const validNotificationSound = (value) =>
  NOTIFICATION_SOUND_OPTIONS.some((opt) => opt.value === value);

const validRingtoneSound = (value) =>
  RINGTONE_OPTIONS.some((opt) => opt.value === value);

export const readSoundPrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const notificationSound = String(parsed?.notificationSound || DEFAULT_SOUND_PREFS.notificationSound);
    const hasAnyCustomSource = Boolean(
      String(parsed?.customRingtoneDataUrl || "").trim() || String(parsed?.customRingtoneUrl || "").trim()
    );
    const rawRingtoneSound = String(parsed?.ringtoneSound || DEFAULT_SOUND_PREFS.ringtoneSound);
    const normalizedRingtoneSound = rawRingtoneSound === "classic" ? "bell" : rawRingtoneSound;
    const ringtoneSound =
      normalizedRingtoneSound === "custom" && !hasAnyCustomSource ? "bell" : normalizedRingtoneSound;
    const customRingtoneDataUrl = String(parsed?.customRingtoneDataUrl || "");
    const customRingtoneName = String(parsed?.customRingtoneName || DEFAULT_CUSTOM_RINGTONE_NAME);
    const customRingtoneUrl = String(parsed?.customRingtoneUrl || DEFAULT_CUSTOM_RINGTONE_URL);
    const customRingtoneStartSec = Number(parsed?.customRingtoneStartSec);
    const customRingtoneDurationSec = Number(parsed?.customRingtoneDurationSec);
    return {
      notificationSound: validNotificationSound(notificationSound)
        ? notificationSound
        : DEFAULT_SOUND_PREFS.notificationSound,
      ringtoneSound: validRingtoneSound(ringtoneSound) ? ringtoneSound : DEFAULT_SOUND_PREFS.ringtoneSound,
      customRingtoneDataUrl,
      customRingtoneName,
      customRingtoneUrl,
      customRingtoneStartSec: Number.isFinite(customRingtoneStartSec) && customRingtoneStartSec >= 0
        ? customRingtoneStartSec
        : DEFAULT_CUSTOM_RINGTONE_START_SEC,
      customRingtoneDurationSec: Number.isFinite(customRingtoneDurationSec) && customRingtoneDurationSec > 1
        ? customRingtoneDurationSec
        : DEFAULT_CUSTOM_RINGTONE_DURATION_SEC
    };
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
};

export const writeSoundPrefs = (nextPrefs) => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = { ...(parsed && typeof parsed === "object" ? parsed : {}), ...(nextPrefs || {}) };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore localStorage failures
  }
};

export const getSoundLabel = (type, value) => {
  const pool = type === "ringtone" ? RINGTONE_OPTIONS : NOTIFICATION_SOUND_OPTIONS;
  if (type === "ringtone" && value === "custom") {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const name = String(parsed?.customRingtoneName || "").trim();
      return name ? `My Song (${name})` : "My Song";
    } catch {
      return "My Song";
    }
  }
  return pool.find((item) => item.value === value)?.label || pool[0]?.label || "";
};
