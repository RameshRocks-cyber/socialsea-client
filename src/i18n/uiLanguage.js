import api from "../api/axios";
import { DEFAULT_LANGUAGE_KEY, LANGUAGE_OPTIONS, normalizeLanguageKey } from "./languages";

const SETTINGS_KEY = "socialsea_settings_v1";
const GOOGLE_CONTAINER_ID = "google_translate_element";
const GOOGLE_SCRIPT_SRC = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
const COOKIE_NAME = "googtrans";

let googleTranslateReadyPromise = null;

const isLikelyIpHost = (hostname) => /^\d{1,3}(\.\d{1,3}){3}$/.test(String(hostname || "").trim());

const safeDispatchSettingsUpdate = () => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("ss-settings-update"));
  } catch {
    // ignore dispatch failures
  }
};

export const readPreferredLanguageSetting = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeLanguageKey(parsed?.preferredLanguage);
  } catch {
    return DEFAULT_LANGUAGE_KEY;
  }
};

export const writePreferredLanguageSetting = (nextLanguage) => {
  const next = normalizeLanguageKey(nextLanguage);
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const payload = {
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      preferredLanguage: next
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ preferredLanguage: next }));
    } catch {
      // ignore storage failures
    }
  }
  return next;
};

const setCookie = (name, value, domain) => {
  if (typeof document === "undefined") return;
  const parts = [`${name}=${value}`, "path=/", "SameSite=Lax"];
  if (domain) parts.push(`domain=${domain}`);
  document.cookie = parts.join("; ");
};

const expireCookie = (name, domain) => {
  if (typeof document === "undefined") return;
  const parts = [`${name}=`, "path=/", "expires=Thu, 01 Jan 1970 00:00:00 GMT", "SameSite=Lax"];
  if (domain) parts.push(`domain=${domain}`);
  document.cookie = parts.join("; ");
};

const setGoogleTranslateCookie = (lang) => {
  if (typeof window === "undefined") return;
  const target = normalizeLanguageKey(lang);
  const cookieValue = `/en/${target}`;
  const hostname = String(window.location.hostname || "").trim();

  setCookie(COOKIE_NAME, cookieValue);

  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && !isLikelyIpHost(hostname) && hostname.includes(".")) {
    setCookie(COOKIE_NAME, cookieValue, `.${hostname}`);
  }
};

const clearGoogleTranslateCookie = () => {
  if (typeof window === "undefined") return;
  const hostname = String(window.location.hostname || "").trim();

  expireCookie(COOKIE_NAME);

  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && !isLikelyIpHost(hostname) && hostname.includes(".")) {
    expireCookie(COOKIE_NAME, `.${hostname}`);
  }
};

const ensureGoogleContainer = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(GOOGLE_CONTAINER_ID)) return;
  const el = document.createElement("div");
  el.id = GOOGLE_CONTAINER_ID;
  el.style.display = "none";
  document.body.appendChild(el);
};

const waitForTranslateCombo = () => new Promise((resolve) => {
  if (typeof document === "undefined") {
    resolve(null);
    return;
  }

  const existing = document.querySelector("select.goog-te-combo");
  if (existing) {
    resolve(existing);
    return;
  }

  const startedAt = Date.now();
  const timer = setInterval(() => {
    const combo = document.querySelector("select.goog-te-combo");
    if (combo) {
      clearInterval(timer);
      resolve(combo);
      return;
    }
    if (Date.now() - startedAt > 10000) {
      clearInterval(timer);
      resolve(null);
    }
  }, 200);
});

const ensureGoogleTranslateReady = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(false);
  }

  if (googleTranslateReadyPromise) return googleTranslateReadyPromise;

  googleTranslateReadyPromise = new Promise((resolve) => {
    ensureGoogleContainer();

    const finalize = async () => {
      const combo = await waitForTranslateCombo();
      resolve(Boolean(combo));
    };

    if (window.google?.translate?.TranslateElement) {
      try {
        new window.google.translate.TranslateElement(
          {
            pageLanguage: "en",
            includedLanguages: LANGUAGE_OPTIONS.map((opt) => opt.key).join(","),
            autoDisplay: false
          },
          GOOGLE_CONTAINER_ID
        );
      } catch {
        // ignore init errors
      }
      finalize();
      return;
    }

    window.googleTranslateElementInit = () => {
      try {
        if (window.google?.translate?.TranslateElement) {
          new window.google.translate.TranslateElement(
            {
              pageLanguage: "en",
              includedLanguages: LANGUAGE_OPTIONS.map((opt) => opt.key).join(","),
              autoDisplay: false
            },
            GOOGLE_CONTAINER_ID
          );
        }
      } catch {
        // ignore init errors
      }
      finalize();
    };

    const existingScript = document.querySelector("script[data-ss-google-translate]");
    if (existingScript) {
      finalize();
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = GOOGLE_SCRIPT_SRC;
    script.dataset.ssGoogleTranslate = "1";
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return googleTranslateReadyPromise;
};

const applyGoogleTranslate = async (lang) => {
  const target = normalizeLanguageKey(lang);
  const ok = await ensureGoogleTranslateReady();
  if (!ok) return false;
  const combo = document.querySelector("select.goog-te-combo");
  if (!(combo instanceof HTMLSelectElement)) return false;

  // Some builds don't include the source language in the dropdown.
  // In that case, only set non-English targets here.
  if (target === "en") {
    combo.value = "";
    combo.dispatchEvent(new Event("change"));
    return true;
  }

  combo.value = target;
  combo.dispatchEvent(new Event("change"));
  return true;
};

const isTranslateActive = () => {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  if (!html) return false;
  return html.classList.contains("translated-ltr") || html.classList.contains("translated-rtl");
};

export const applyUiLanguage = async (language, { persist = false, allowReload = false } = {}) => {
  if (typeof document === "undefined") return false;

  const target = normalizeLanguageKey(language);
  document.documentElement.lang = target;

  if (persist) {
    writePreferredLanguageSetting(target);
    safeDispatchSettingsUpdate();
  }

  if (target === "en") {
    clearGoogleTranslateCookie();
    if (allowReload && isTranslateActive()) {
      window.location.reload();
    }
    return true;
  }

  setGoogleTranslateCookie(target);
  const applied = await applyGoogleTranslate(target);

  if (!applied && allowReload) {
    window.location.reload();
    return false;
  }

  return applied;
};

export const applyUiLanguageFromStorage = async ({ allowReload = false } = {}) => {
  const lang = readPreferredLanguageSetting();
  return applyUiLanguage(lang, { allowReload });
};

export const syncPreferredLanguageFromBackend = async () => {
  try {
    const res = await api.get("/api/profile/me/language", {
      timeout: 2500,
      suppressAuthRedirect: true
    });
    const value = res?.data?.preferredLanguage;
    if (typeof value !== "string" || !value.trim()) return null;
    const next = writePreferredLanguageSetting(value);
    safeDispatchSettingsUpdate();
    await applyUiLanguage(next);
    return next;
  } catch {
    return null;
  }
};
