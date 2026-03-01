function normalizeApiUrl(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) return "";

  // Handle accidental Netlify value like: VITE_API_URL=https://api.socialsea.co.in
  if (value.includes("VITE_API_URL=")) {
    value = value.split("VITE_API_URL=").pop() || "";
  }

  value = value.trim().replace(/^['"]|['"]$/g, "");
  if (!value) return "";

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
  if (envUrl) return envUrl;

  // Safe defaults
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "socialsea.co.in" || host === "www.socialsea.co.in") {
      return "https://api.socialsea.co.in";
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://43.205.213.14:8080";
    }
  }

  return "https://api.socialsea.co.in";
}

export function toApiUrl(path = "") {
  const base = getApiBaseUrl();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

