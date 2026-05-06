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
  return value === "socialsea.co.in" || value === "www.socialsea.co.in" || value.endsWith(".netlify.app");
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

function stripQueryAndHash(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");
  const endIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);
  return (endIndex >= 0 ? raw.slice(0, endIndex) : raw).trim();
}

function looksLikeMediaFileName(value) {
  const clean = stripQueryAndHash(value);
  if (!clean) return false;
  const fileName = clean.split("/").pop() || "";
  if (!fileName || fileName.includes(" ")) return false;
  return /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv|mp3|wav|aac|m4a|jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(
    fileName
  );
}

function normalizeRelativePath(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";

  const queryIndex = raw.indexOf("?");
  const hashIndex = raw.indexOf("#");
  const splitIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);

  const barePath = (splitIndex >= 0 ? raw.slice(0, splitIndex) : raw).replace(/^\/+/, "");
  const suffix = splitIndex >= 0 ? raw.slice(splitIndex) : "";
  if (!barePath) return "";

  if (raw.startsWith("/")) {
    const normalized = `/${barePath}`;
    if (/^\/(api|uploads)\//i.test(normalized)) {
      return `${normalized}${suffix}`;
    }
    if (!barePath.includes("/") && looksLikeMediaFileName(barePath)) {
      return `/uploads/${barePath}${suffix}`;
    }
    return `${normalized}${suffix}`;
  }

  if (/^uploads\//i.test(barePath)) {
    return `/${barePath}${suffix}`;
  }
  if (!barePath.includes("/") && looksLikeMediaFileName(barePath)) {
    return `/uploads/${barePath}${suffix}`;
  }
  return `/${barePath}${suffix}`;
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
    const isNetlifyHost = host.endsWith(".netlify.app");
    const allowLegacySocialSeaApi =
      String(import.meta.env?.VITE_ALLOW_LEGACY_SOCIALSEA_API || "")
        .trim()
        .toLowerCase() === "true";
    const isLegacySocialSeaApiHost = (value) => {
      const normalized = String(value || "").trim().toLowerCase();
      return (
        normalized === "api.socialsea.co.in" ||
        normalized === "socialsea.co.in" ||
        normalized === "www.socialsea.co.in"
      );
    };
    const shouldIgnoreLegacyHostedUrl = (url) => {
      if (!isNetlifyHost || allowLegacySocialSeaApi) return false;
      const targetHost = hostFromUrl(url);
      return isLegacySocialSeaApiHost(targetHost);
    };

    // Local development should never be forced to legacy hosted frontend APIs.
    // This prevents accidental .env values (socialsea.co.in) from breaking local profile/feed calls.
    const forcedHost = hostFromUrl(forcedUrl);
    const forcedLooksHostedFrontend = isFrontendLikeHost(forcedHost);
    const shouldIgnoreForcedOnLocalHost = isLocalHost && forcedLooksHostedFrontend;

    // Explicit override wins in all non-local environments and for valid local overrides.
    if (forcedUrl && !shouldIgnoreLegacyHostedUrl(forcedUrl) && !shouldIgnoreForcedOnLocalHost) {
      persistAuthBaseUrl(forcedUrl);
      return forcedUrl;
    }

    if (isFrontendLikeHost(host)) {
      // Deployed frontend should target the API host directly.
      const envUrl = normalizeApiUrl(import.meta.env.VITE_API_URL);
      const envHost = hostFromUrl(envUrl);
      if (envUrl && !shouldIgnoreLegacyHostedUrl(envUrl) && !isFrontendLikeHost(envHost)) {
        persistAuthBaseUrl(envUrl);
        return envUrl;
      }
      if (isNetlifyHost) {
        persistAuthBaseUrl("/api");
        return "/api";
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
  if (/^\/\//.test(path)) {
    return `https:${path}`;
  }
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      const host = url.hostname.toLowerCase();
      const pathWithQueryAndHash = `${url.pathname || ""}${url.search || ""}${url.hash || ""}`;
      const normalizedAbsolutePath = normalizeRelativePath(pathWithQueryAndHash);
      const absolutePathPart = stripQueryAndHash(pathWithQueryAndHash).replace(/^\/+/, "");
      const hasSinglePathSegment = Boolean(absolutePathPart) && !absolutePathPart.includes("/");
      const shouldNormalizeFrontendMediaPath =
        isFrontendLikeHost(host) &&
        (
          /^\/api\/uploads\//i.test(pathWithQueryAndHash) ||
          /^\/uploads\//i.test(pathWithQueryAndHash) ||
          (hasSinglePathSegment && looksLikeMediaFileName(absolutePathPart))
        );
      const shouldRebase =
        isLoopbackHost(host) ||
        isPrivateIpHost(host);
      if (shouldNormalizeFrontendMediaPath) {
        path = normalizedAbsolutePath.replace(/^\/api\/uploads\//i, "/uploads/");
      } else if (shouldRebase) {
        path = pathWithQueryAndHash;
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
  let normalizedPath = normalizeRelativePath(path);
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
