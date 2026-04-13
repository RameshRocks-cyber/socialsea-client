export const DEFAULT_LANGUAGE_KEY = "en";

export const LANGUAGE_OPTIONS = [
  { key: "en", label: "English" },
  { key: "es", label: "Spanish" },
  { key: "fr", label: "French" },
  { key: "de", label: "German" },
  { key: "it", label: "Italian" },
  { key: "pt", label: "Portuguese" },
  { key: "nl", label: "Dutch" },
  { key: "ru", label: "Russian" },
  { key: "ar", label: "Arabic" },
  { key: "tr", label: "Turkish" },
  { key: "id", label: "Indonesian" },
  { key: "vi", label: "Vietnamese" },
  { key: "th", label: "Thai" },
  { key: "ja", label: "Japanese" },
  { key: "ko", label: "Korean" },
  { key: "zh-cn", label: "Chinese (Simplified)" },
  { key: "zh-tw", label: "Chinese (Traditional)" },
  { key: "sw", label: "Swahili" },
  { key: "uk", label: "Ukrainian" },
  { key: "pl", label: "Polish" },
  { key: "hi", label: "Hindi" },
  { key: "ur", label: "Urdu" },
  { key: "bn", label: "Bengali" },
  { key: "mr", label: "Marathi" },
  { key: "gu", label: "Gujarati" },
  { key: "pa", label: "Punjabi" },
  { key: "te", label: "Telugu" },
  { key: "ta", label: "Tamil" },
  { key: "kn", label: "Kannada" },
  { key: "ml", label: "Malayalam" }
];

export const normalizeLanguageKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_LANGUAGE_KEY;
  const normalized = raw.replace("_", "-").toLowerCase();
  const primary = normalized.split("-")[0] || normalized;
  if (LANGUAGE_OPTIONS.some((opt) => opt.key === normalized)) return normalized;
  if (LANGUAGE_OPTIONS.some((opt) => opt.key === primary)) return primary;
  return DEFAULT_LANGUAGE_KEY;
};

export const getLanguageLabel = (value) => {
  const key = normalizeLanguageKey(value);
  return LANGUAGE_OPTIONS.find((opt) => opt.key === key)?.label || "English";
};
