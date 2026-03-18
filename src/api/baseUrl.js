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

function isLoopbackHost(host) {
  const value = String(host || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1";
}

function isFrontendLikeHost(host) {
  const value = String(host || "").toLowerCase();
  return (
    value === "socialsea.co.in" ||
    value === "www.socialsea.co.in" ||
    value.endsWith(".netlify.app")
  );
}

function isPrivateIpHost(host) {
  const value = String(host || "").trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const parts = value.split(".").map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function getApiBaseUrl() {
  const forcedUrl = normalizeApiUrl(import.meta.env.VITE_API_BASE_URL);

  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").toLowerCase();
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    const isLanHost = isPrivateIpHost(host);
    const forcedHost = hostFromUrl(forcedUrl);

    if (forcedUrl) {
      // In local/LAN development, prefer local/private backends to avoid accidentally
      // routing SOS live traffic to a public server with stale state.
      const canUseForcedInDev =
        forcedUrl.startsWith("/") || isLoopbackHost(forcedHost) || isPrivateIpHost(forcedHost);
      if (!(isLocalHost || isLanHost) || canUseForcedInDev) {
        return forcedUrl;
      }
    }

    if (isFrontendLikeHost(host)) {
      // Deployed frontend should target the API host directly.
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      if (envUrl && !isFrontendLikeHost(envHost)) {
        return envUrl;
      }
      return "https://api.socialsea.co.in";
    }
    if (isLocalHost) {
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      // In local dev, prefer local backend/proxy by default.
      if (!envUrl || envUrl.startsWith("/") || isFrontendLikeHost(envHost)) {
        return "http://localhost:8080";
      }
      return envUrl;
    }
    if (isLanHost) {
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      if (envUrl && !isFrontendLikeHost(envHost) && !isLoopbackHost(envHost)) {
        return envUrl;
      }
      return `http://${host}:8080`;
    }
  }

  if (forcedUrl) return forcedUrl;

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
