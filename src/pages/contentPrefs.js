import { SETTINGS_KEY } from "./soundPrefs";

export const CONTENT_TYPE_OPTIONS = [
  { value: "general", label: "General" },
  { value: "study", label: "Study" },
  { value: "entertainment", label: "Entertainment" },
  { value: "social", label: "Social" },
  { value: "news", label: "News" },
  { value: "music", label: "Music" },
  { value: "mixes", label: "Mixes" },
  { value: "live", label: "Live" },
  { value: "comedy", label: "Comedy" },
  { value: "movies", label: "Movies" },
  { value: "gaming", label: "Gaming" },
  { value: "trending", label: "Trending" },
  { value: "education", label: "Education" },
  { value: "fitness", label: "Fitness" },
  { value: "vlog", label: "Vlog" },
  { value: "sports", label: "Sports" },
  { value: "technology", label: "Technology" },
  { value: "business", label: "Business" },
  { value: "lifestyle", label: "Lifestyle" }
];

export const DEFAULT_CONTENT_TYPES = CONTENT_TYPE_OPTIONS.map((opt) => opt.value);
const CONTENT_TYPE_SET = new Set(DEFAULT_CONTENT_TYPES);

export const normalizeContentTypeList = (value, fallback = DEFAULT_CONTENT_TYPES, allowEmpty = true) => {
  if (!Array.isArray(value)) return [...fallback];
  const cleaned = value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => CONTENT_TYPE_SET.has(item));
  const unique = Array.from(new Set(cleaned));
  if (!unique.length) return allowEmpty ? [] : [...fallback];
  const ordered = DEFAULT_CONTENT_TYPES.filter((item) => unique.includes(item));
  return ordered.length ? ordered : [...fallback];
};

export const getContentTypeLabel = (value) =>
  CONTENT_TYPE_OPTIONS.find((opt) => opt.value === value)?.label || value;

export const readContentTypePrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const contentTypes = normalizeContentTypeList(parsed?.contentTypes);
    return {
      contentTypes,
      defaultType: contentTypes[0] || DEFAULT_CONTENT_TYPES[0] || "study"
    };
  } catch {
    const contentTypes = [...DEFAULT_CONTENT_TYPES];
    return {
      contentTypes,
      defaultType: contentTypes[0] || "study"
    };
  }
};
