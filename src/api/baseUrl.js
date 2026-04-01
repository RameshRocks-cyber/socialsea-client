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

function persistAuthBaseUrl(base) {
  const value = String(base || "").trim();
  if (typeof window === "undefined" || !value) return;
  try {
    localStorage.setItem("socialsea_auth_base_url", value);
    sessionStorage.setItem("socialsea_auth_base_url", value);
  } catch {
    // ignore storage failures
  }
}

export function getApiBaseUrl() {
  const forcedUrl = normalizeApiUrl(import.meta.env.VITE_API_BASE_URL);

  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").toLowerCase();
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    const isLanHost = isPrivateIpHost(host);

    // Explicit override must win in all environments (including local dev).
    // This avoids accidental fallback to localhost when a remote backend is intended.
    if (forcedUrl) {
      persistAuthBaseUrl(forcedUrl);
      return forcedUrl;
    }

    if (isFrontendLikeHost(host)) {
      // Deployed frontend should target the API host directly.
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      if (envUrl && !isFrontendLikeHost(envHost)) {
        persistAuthBaseUrl(envUrl);
        return envUrl;
      }
      persistAuthBaseUrl("https://api.socialsea.co.in");
      return "https://api.socialsea.co.in";
    }
    if (isLocalHost) {
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      // In local dev, prefer local backend/proxy by default.
      if (!envUrl || envUrl.startsWith("/") || isFrontendLikeHost(envHost)) {
        persistAuthBaseUrl("http://localhost:8080");
        return "http://localhost:8080";
      }
      persistAuthBaseUrl(envUrl);
      return envUrl;
    }
    if (isLanHost) {
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      if (envUrl && !isFrontendLikeHost(envHost) && !isLoopbackHost(envHost)) {
        persistAuthBaseUrl(envUrl);
        return envUrl;
      }
      persistAuthBaseUrl(`http://${host}:8080`);
      return `http://${host}:8080`;
    }
  }

  if (forcedUrl) {
    persistAuthBaseUrl(forcedUrl);
    return forcedUrl;
  }

  const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
  if (envUrl) {
    persistAuthBaseUrl(envUrl);
    return envUrl;
  }

  persistAuthBaseUrl("https://socialsea.co.in");
  return "https://socialsea.co.in";
}

export function toApiUrl(path = "") {
  const base = getApiBaseUrl();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      const host = url.hostname.toLowerCase();
      const shouldRebase =
        isLoopbackHost(host) ||
        isPrivateIpHost(host) ||
        isFrontendLikeHost(host);
      if (shouldRebase) {
        const rebased = `${url.pathname}${url.search}${url.hash}`;
        path = rebased;
      } else if (url.pathname.startsWith("/api/uploads/")) {
        url.pathname = url.pathname.replace("/api/uploads/", "/uploads/");
        return url.toString();
      } else {
        return path;
      }
    } catch {
      return path;
    }
  }
  const baseTrimmed = String(base || "").replace(/\/+$/, "");
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath.startsWith("/api/uploads/")) {
    normalizedPath = normalizedPath.replace("/api/uploads/", "/uploads/");
  }
  if (baseTrimmed.endsWith("/api")) {
    if (normalizedPath.startsWith("/uploads/")) {
      return `${baseTrimmed.replace(/\/api$/, "")}${normalizedPath}`;
    }
    if (normalizedPath.startsWith("/api/")) {
      return `${baseTrimmed}${normalizedPath.replace(/^\/api/, "")}`;
    }
  }
  if (baseTrimmed === "/api" && normalizedPath.startsWith("/uploads/")) {
    return normalizedPath;
  }
  return `${baseTrimmed}${normalizedPath}`;
}
