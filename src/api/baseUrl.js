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
  const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
  if (envUrl) {
    const envHost = hostFromUrl(envUrl);
    const currentHost =
      typeof window !== "undefined" ? String(window.location.hostname || "").toLowerCase() : "";
    // Prevent accidental config where VITE_API_URL points to frontend host,
    // which returns index.html for API paths.
    if (!(envHost && envHost === currentHost && isFrontendLikeHost(envHost))) {
      return envUrl;
    }
  }

  // Safe defaults
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (isFrontendLikeHost(host)) {
      // Use Netlify same-origin proxy to avoid CORS/domain allowlist issues.
      return "/api";
    }
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8080";
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
