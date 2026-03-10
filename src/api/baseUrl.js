function normalizeApiUrl(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return value.replace(/\/+$/, "");

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

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isFrontendLikeHost(host) {
  const value = String(host || "").toLowerCase();
  return (
    value === "socialsea.co.in" ||
    value === "www.socialsea.co.in" ||
    value.endsWith(".netlify.app")
  );
}

export function getApiBaseUrl() {
  const forcedUrl = normalizeApiUrl(import.meta.env.VITE_API_BASE_URL);
  if (forcedUrl) return forcedUrl;

  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").toLowerCase();
    if (isFrontendLikeHost(host)) {
      // Always prefer same-origin proxy for deployed frontend hosts.
      return "/api";
    }
    if (host === "localhost" || host === "127.0.0.1") {
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      // In local dev, prefer local backend by default.
      if (!envUrl || envUrl.startsWith("/") || isFrontendLikeHost(envHost)) {
        return "http://localhost:8080";
      }
      return envUrl;
    }
  }

  const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
  if (envUrl) return envUrl;

  return "https://socialsea.co.in";
}

export function toApiUrl(path = "") {
  const base = getApiBaseUrl();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
