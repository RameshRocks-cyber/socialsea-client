export const COLOR_THEME_KEY = "socialsea_color_theme_v1";
export const CUSTOM_THEME_KEY = "socialsea_custom_theme_v1";

export const COLOR_THEME_OPTIONS = [
  { id: "black", label: "Default" },
  { id: "mankind", label: "Mankind" },
  { id: "ocean", label: "Ocean" },
  { id: "pink", label: "Pink" },
  { id: "yellow", label: "Yellow" },
  { id: "blue", label: "Blue" },
  { id: "white", label: "White" },
  { id: "custom", label: "Custom" },
];

const DEFAULT_CUSTOM_THEME = {
  accent: "#9f6f4a",
  accent2: "#c4955b",
  bg: "#16110d",
  bgSoft: "#231a14",
  border: "#8d6a4a",
  text: "#f2e7da",
};

const OCEAN_THEME = {
  accent: "#2a72c4",
  accent2: "#1ca89f",
  bg: "#031022",
  bgSoft: "#082344",
  border: "#5a97c7",
  text: "#e2f2ff",
};

const VALID_THEME_IDS = new Set(COLOR_THEME_OPTIONS.map((x) => x.id));

export const normalizeTheme = (value) => {
  const id = String(value || "").trim().toLowerCase();
  return VALID_THEME_IDS.has(id) ? id : "black";
};

export const readTheme = () => {
  try {
    const raw = localStorage.getItem(COLOR_THEME_KEY);
    return normalizeTheme(raw || "black");
  } catch {
    return "black";
  }
};

const normalizeHex = (value, fallback) => {
  const raw = String(value || "").trim();
  return /^#([A-Fa-f0-9]{6})$/.test(raw) ? raw : fallback;
};

export const readCustomThemeColors = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      accent: normalizeHex(parsed?.accent, DEFAULT_CUSTOM_THEME.accent),
      accent2: normalizeHex(parsed?.accent2, DEFAULT_CUSTOM_THEME.accent2),
      bg: normalizeHex(parsed?.bg, DEFAULT_CUSTOM_THEME.bg),
      bgSoft: normalizeHex(parsed?.bgSoft, DEFAULT_CUSTOM_THEME.bgSoft),
      border: normalizeHex(parsed?.border, DEFAULT_CUSTOM_THEME.border),
      text: normalizeHex(parsed?.text, DEFAULT_CUSTOM_THEME.text),
    };
  } catch {
    return { ...DEFAULT_CUSTOM_THEME };
  }
};

const applyCustomThemeVars = (colors) => {
  const body = document.body;
  body.style.setProperty("--ss-theme-accent", colors.accent);
  body.style.setProperty("--ss-theme-accent-2", colors.accent2);
  body.style.setProperty("--ss-theme-bg", colors.bg);
  body.style.setProperty("--ss-theme-bg-soft", colors.bgSoft);
  body.style.setProperty("--ss-theme-border", `${colors.border}88`);
  body.style.setProperty("--ss-theme-text", colors.text);
};

const clearCustomThemeVars = () => {
  const body = document.body;
  body.style.removeProperty("--ss-theme-accent");
  body.style.removeProperty("--ss-theme-accent-2");
  body.style.removeProperty("--ss-theme-bg");
  body.style.removeProperty("--ss-theme-bg-soft");
  body.style.removeProperty("--ss-theme-border");
  body.style.removeProperty("--ss-theme-text");
};

export const applyTheme = (value) => {
  if (typeof document === "undefined") return "black";
  const id = normalizeTheme(value);
  const body = document.body;

  body.classList.remove(
    "ss-themed",
    "ss-theme-pink",
    "ss-theme-yellow",
    "ss-theme-black",
    "ss-theme-mankind",
    "ss-theme-white",
    "ss-theme-blue"
  );

  clearCustomThemeVars();

  if (id !== "blue") {
    body.classList.add("ss-themed");
  }

  if (["mankind", "pink", "yellow", "black", "white"].includes(id)) {
    body.classList.add(`ss-theme-${id}`);
  }

  if (id === "ocean") {
    applyCustomThemeVars(OCEAN_THEME);
  }

  if (id === "custom") {
    body.classList.add("ss-themed");
    applyCustomThemeVars(readCustomThemeColors());
  }

  body.dataset.ssTheme = id;
  return id;
};

export const setTheme = (value) => {
  const id = normalizeTheme(value);
  try {
    localStorage.setItem(COLOR_THEME_KEY, id);
  } catch {
    // ignore storage issues
  }
  applyTheme(id);
  return id;
};

export const setCustomThemeColors = (nextColors) => {
  const merged = {
    ...DEFAULT_CUSTOM_THEME,
    ...(nextColors || {}),
  };

  const safe = {
    accent: normalizeHex(merged.accent, DEFAULT_CUSTOM_THEME.accent),
    accent2: normalizeHex(merged.accent2, DEFAULT_CUSTOM_THEME.accent2),
    bg: normalizeHex(merged.bg, DEFAULT_CUSTOM_THEME.bg),
    bgSoft: normalizeHex(merged.bgSoft, DEFAULT_CUSTOM_THEME.bgSoft),
    border: normalizeHex(merged.border, DEFAULT_CUSTOM_THEME.border),
    text: normalizeHex(merged.text, DEFAULT_CUSTOM_THEME.text),
  };

  try {
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(safe));
  } catch {
    // ignore storage issues
  }

  if (normalizeTheme(readTheme()) === "custom") {
    applyCustomThemeVars(safe);
  }

  return safe;
};

export const applyStoredTheme = () => applyTheme(readTheme());
