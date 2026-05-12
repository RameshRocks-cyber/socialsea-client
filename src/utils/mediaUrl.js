import { toApiUrl } from "../api/baseUrl";

const isPlaceholderMediaToken = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  if (
    lower === "null" ||
    lower === "undefined" ||
    lower === "none" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "nan"
  ) {
    return true;
  }
  const compact = raw.replace(/\s+/g, "");
  if (!/[/:.#?]/.test(raw) && /^[a-z]{1,2}$/i.test(compact)) {
    return true;
  }
  const withoutHost = raw.replace(/^https?:\/\/[^/]+/i, "");
  const cleanPath = withoutHost.split(/[?#]/)[0] || "";
  if (/^\/?api\/[a-z]{1,2}$/i.test(cleanPath)) return true;
  if (/^\/?[a-z]{1,2}$/i.test(cleanPath)) return true;
  return false;
};

export const resolveMediaUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw || isPlaceholderMediaToken(raw)) return "";
  if (/^(blob:|data:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return toApiUrl(raw);
};
