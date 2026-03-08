export const SETTINGS_KEY = "socialsea_settings_v1";
export const DEFAULT_CUSTOM_RINGTONE_URL = "";
export const DEFAULT_CUSTOM_RINGTONE_NAME = "My Song";
export const DEFAULT_CUSTOM_RINGTONE_START_SEC = 18;
export const DEFAULT_CUSTOM_RINGTONE_DURATION_SEC = 20;

export const NOTIFICATION_SOUND_OPTIONS = [
  { value: "classic", label: "Classic" },
  { value: "soft", label: "Soft" },
  { value: "digital", label: "Digital" },
  { value: "sparkle", label: "Sparkle" },
  { value: "bubble", label: "Bubble Pop" },
  { value: "twinkle", label: "Twinkle" },
  { value: "pop", label: "Candy Pop" },
  { value: "off", label: "Off" }
];

export const RINGTONE_OPTIONS = [
  { value: "classic", label: "Classic Ring" },
  { value: "bell", label: "Bell Ring" },
  { value: "pulse", label: "Pulse Ring" },
  { value: "marimba", label: "Marimba" },
  { value: "chime", label: "Dream Chime" },
  { value: "birdsong", label: "Birdsong" },
  { value: "custom", label: "My Song" },
  { value: "off", label: "Off" }
];

export const DEFAULT_SOUND_PREFS = {
  notificationSound: "classic",
  ringtoneSound: "classic",
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
    const ringtoneSound =
      rawRingtoneSound === "custom" && !hasAnyCustomSource ? "classic" : rawRingtoneSound;
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
