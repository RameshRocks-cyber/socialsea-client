import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FiBell,
  FiCamera,
  FiChevronDown,
  FiHome,
  FiImage,
  FiMessageSquare,
  FiRotateCcw,
  FiSettings,
  FiSlash,
  FiUser,
  FiMap,
  FiVideo,
  FiX
} from "react-icons/fi";
import { FaGraduationCap } from "react-icons/fa";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { pingChatPresence } from "../api/chatPresence";
import { connectUserNotifications } from "../ws";
import "./Navbar.css";

const ITEMS = [
  { to: "/feed", icon: FiHome, label: "Feed", match: (p) => p === "/feed" },
  { to: "/reels", icon: FiVideo, label: "Reels", match: (p) => p === "/reels" },
  { to: "/chat", icon: FiMessageSquare, label: "Chat", match: (p) => p === "/chat" || p.startsWith("/chat/") },
  { to: "/notifications", icon: FiBell, label: "Alerts", match: (p) => p === "/notifications" },
  { to: "/profile/me", icon: FiUser, label: "Profile", match: (p) => p.startsWith("/profile") },
];
const CALL_ACCEPT_TARGET_KEY = "socialsea_call_accept_target_v1";
const CALL_SIGNAL_LOCAL_KEY = "socialsea_call_signal_local_v1";
const CALL_SIGNAL_CHANNEL = "socialsea-call-signal";
const CALL_SIGNAL_MAX_AGE_MS = 45000;
const CHAT_THREAD_READ_STATE_KEY = "socialsea_chat_thread_read_state_v1";
const SETTINGS_KEY = "socialsea_settings_v1";
const SOS_SIGNAL_KEY = "socialsea_sos_signal_v1";
const SOS_SIGNAL_CHANNEL = "socialsea_sos_signal_channel_v1";
const SOS_SESSION_KEY = "socialsea_sos_session_v1";
const SOS_OWN_STOP_AT_KEY = "socialsea_sos_own_stop_at_v1";
const SOS_LAST_SIGNAL_ID_KEY = "socialsea_sos_last_signal_id_v1";
const SOS_LAST_SESSION_SIG_KEY = "socialsea_sos_last_session_sig_v1";
const SOS_LAST_NOTIFICATION_ID_KEY = "socialsea_sos_last_notification_id_v1";
const TRAFFIC_LAST_NOTIFICATION_ID_KEY = "socialsea_traffic_last_notification_id_v1";
const SOS_NAV_CACHE_KEY = "socialsea_sos_nav_cache_v1";
const SOS_SUPPRESSED_ALERTS_KEY = "socialsea_sos_suppressed_alerts_v1";
const SOS_SUPPRESSED_ALERTS_AT_KEY = "socialsea_sos_suppressed_alerts_at_v1";
const SOS_SEEN_ALERTS_KEY = "socialsea_sos_seen_alerts_v1";
const SOS_POPUP_POS_KEY = "socialsea_sos_popup_pos_v1";
const SOS_ALERT_SUPPRESS_TTL_MS = 5 * 60 * 1000;
const SOS_SIGNAL_STALE_MS = 2 * 60 * 1000;
const SOS_ALERT_STALE_MINUTES = Number(import.meta.env.VITE_EMERGENCY_ALERT_STALE_MINUTES || 180);
const SOS_ALERT_STALE_MS =
  Number.isFinite(SOS_ALERT_STALE_MINUTES) && SOS_ALERT_STALE_MINUTES > 0
    ? SOS_ALERT_STALE_MINUTES * 60 * 1000
    : 0;
const SOS_EMERGENCY_POLL_MS = Number(import.meta.env.VITE_SOS_EMERGENCY_POLL_MS || 2500);
const SOS_NOTIFICATION_POLL_MS = Number(import.meta.env.VITE_SOS_NOTIFICATION_POLL_MS || 5000);
const TRAFFIC_NOTIFICATION_POLL_MS = Number(import.meta.env.VITE_TRAFFIC_NOTIFICATION_POLL_MS || 5500);
const allowSelfEmergencyPopup = (() => {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").toLowerCase().trim();
  return host === "localhost" || host === "127.0.0.1";
})();
const uniqueNonEmpty = (arr) =>
  arr.filter((v, i) => {
    if (!v) return false;
    return arr.indexOf(v) === i;
  });

const isLoopbackHost = (host) => {
  const value = String(host || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1";
};

const isPrivateIpHost = (host) => {
  const value = String(host || "").trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const parts = value.split(".").map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

const BAD_EMERGENCY_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "43.205.213.14",
  "socialsea.co.in",
  "www.socialsea.co.in"
]);

const ALLOWED_EMERGENCY_HOSTS = (() => {
  const raw = String(import.meta.env.VITE_EMERGENCY_HOST_ALLOWLIST || "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
})();

const ENV_EMERGENCY_HOSTS = (() => {
  const candidates = [
    import.meta.env.VITE_DEV_PROXY_TARGET,
    import.meta.env.VITE_API_URL,
    import.meta.env.VITE_API_BASE_URL
  ];
  const toHost = (value) => {
    const raw = String(value || "").trim();
    if (!raw || raw.startsWith("/")) return "";
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      return new URL(withScheme).hostname.toLowerCase();
    } catch {
      return "";
    }
  };
  return new Set(candidates.map(toHost).filter(Boolean));
})();

const allowLocalEmergencyHosts =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());

const isEmergencyHostAllowed = (host) => {
  const value = String(host || "").trim().toLowerCase();
  if (!value) return false;
  return ALLOWED_EMERGENCY_HOSTS.has(value);
};

const normalizeEmergencyBase = (rawBase) => {
  const value = String(rawBase || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value === "/api") return "";
  if (value.startsWith("/")) return value;
  if (!/^https?:\/\//i.test(value)) return "";
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (
      BAD_EMERGENCY_HOSTS.has(host) &&
      !allowLocalEmergencyHosts &&
      !isEmergencyHostAllowed(host) &&
      !ENV_EMERGENCY_HOSTS.has(host)
    ) {
      return "";
    }
  } catch {
    return "";
  }
  return value;
};

const emergencyBaseCandidates = () => {
  const isLocalDev =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
  const isHttpsPage =
    typeof window !== "undefined" &&
    String(window.location.protocol || "").toLowerCase() === "https:";
  const runtimeHost =
    typeof window !== "undefined" ? String(window.location.hostname || "").trim() : "";
  const runtimeHostBase =
    runtimeHost && (isLoopbackHost(runtimeHost) || isPrivateIpHost(runtimeHost))
      ? `http://${runtimeHost}:8080`
      : "";
  const storedBase =
    typeof window !== "undefined"
      ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
      : "";
  const rawList = uniqueNonEmpty(
    isLocalDev
      ? [
          "http://localhost:8080",
          "http://127.0.0.1:8080"
        ]
      : [
          getApiBaseUrl(),
          api.defaults.baseURL,
          storedBase,
          import.meta.env.VITE_API_URL,
          runtimeHostBase,
        ]
  );

  const list = uniqueNonEmpty(rawList.map(normalizeEmergencyBase).filter(Boolean));
  return list.filter((base) => !(isHttpsPage && /^http:\/\//i.test(String(base || ""))));
};

const buildEmergencyUrls = (suffix) => {
  const path = String(suffix || "").replace(/^\/+/, "");
  const urls = [`/api/emergency/${path}`];
  for (const rawBase of emergencyBaseCandidates()) {
    const base = String(rawBase || "").trim().replace(/\/+$/, "");
    if (!base) continue;
    if (base === "/api") {
      urls.push(`/api/emergency/${path}`);
      continue;
    }
    if (base.startsWith("/")) {
      urls.push(`${base}/api/emergency/${path}`);
      continue;
    }
    if (/\/api$/i.test(base)) {
      urls.push(`${base}/emergency/${path}`);
      urls.push(`${base.replace(/\/api$/i, "")}/api/emergency/${path}`);
      continue;
    }
    urls.push(`${base}/api/emergency/${path}`);
    urls.push(`${base}/emergency/${path}`);
  }
  return uniqueNonEmpty(urls);
};

const normalizeLiveUrl = (rawUrl, fallbackAlertId = "") => {
  const raw = String(rawUrl || "").trim();
  const fallbackId = String(fallbackAlertId || "").trim();
  const appOrigin = typeof window !== "undefined" ? String(window.location.origin || "").replace(/\/+$/, "") : "";

  const toLivePath = (id) => {
    const safeId = String(id || "").trim();
    if (!safeId) return "";
    const path = `/sos/live/${encodeURIComponent(safeId)}`;
    return appOrigin ? `${appOrigin}${path}` : path;
  };

  if (!raw) return toLivePath(fallbackId);

  try {
    const parsed = new URL(raw, appOrigin || "http://localhost");
    const liveMatch = parsed.pathname.match(/\/sos\/live\/([^/?#]+)/i);
    if (liveMatch?.[1]) return toLivePath(decodeURIComponent(liveMatch[1]));

    const genericSosMatch = parsed.pathname.match(/\/sos\/(?!navigate\/)([^/?#]+)/i);
    if (genericSosMatch?.[1]) return toLivePath(decodeURIComponent(genericSosMatch[1]));
  } catch {
    // keep original URL if parsing fails
  }

  return raw;
};

const extractAlertIdFromUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  const match = value.match(/\/sos\/(?:live|navigate)\/([^/?#]+)/i);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(String(match[1]).trim());
  } catch {
    return String(match[1]).trim();
  }
};

const readShowSosInNavbar = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.showSosInNavbar === "boolean") return parsed.showSosInNavbar;
    return true;
  } catch {
    return true;
  }
};

const readStudyModeReels = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.studyModeReels);
  } catch {
    return false;
  }
};

const readTrafficAlertsEnabled = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.trafficAlerts === "boolean") return parsed.trafficAlerts;
    return false;
  } catch {
    return false;
  }
};

const readAmbulanceNavigationEnabled = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ambulanceNavigation === "boolean") return parsed.ambulanceNavigation;
    return false;
  } catch {
    return false;
  }
};

const readSessionValue = (key) => {
  try {
    return String(sessionStorage.getItem(key) || "");
  } catch {
    return "";
  }
};

const toArrayPayload = (payload, depth = 0) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object" || depth > 3) return [];
  const keys = ["content", "items", "users", "conversations", "messages", "results", "data", "result", "payload"];
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = toArrayPayload(value, depth + 1);
      if (nested.length > 0) return nested;
    }
  }
  const values = Object.values(payload);
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
};

const readChatUnreadFromThreadState = () => {
  try {
    const raw = localStorage.getItem(CHAT_THREAD_READ_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return 0;
    return Object.values(parsed).reduce((sum, entry) => {
      const unread = Math.max(0, Math.floor(Number(entry?.unread || 0)));
      return sum + unread;
    }, 0);
  } catch {
    return 0;
  }
};

const sumUnreadFromConversations = (rows) =>
  (Array.isArray(rows) ? rows : []).reduce((sum, item) => {
    const unread = Number(
      item?.unreadCount ??
        item?.unread ??
        item?.unreadMessages ??
        item?.unreadMessageCount ??
        item?.unread_message_count ??
        0
    );
    return sum + (Number.isFinite(unread) && unread > 0 ? Math.floor(unread) : 0);
  }, 0);

const toEpochMs = (value) => {
  if (value == null || value === "") return 0;
  const raw = Number(value);
  if (Number.isFinite(raw)) {
    return raw > 1000000000000 ? raw : raw * 1000;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const readAlertTimestampMs = (alert) => {
  if (!alert || typeof alert !== "object") return 0;
  const candidate =
    alert?.updatedAt ??
    alert?.lastUpdatedAt ??
    alert?.startedAt ??
    alert?.createdAt ??
    alert?.triggeredAt ??
    alert?.raisedAt ??
    alert?.timestamp ??
    alert?.at ??
    alert?.time ??
    alert?.lastActiveAt ??
    alert?.lastSeenAt ??
    alert?.lastHeartbeatAt ??
    alert?.heartbeatAt ??
    alert?.eventAt ??
    alert?.alertAt;
  return toEpochMs(candidate);
};

const isSosSessionStale = (session) => {
  if (!SOS_ALERT_STALE_MS || !session || typeof session !== "object") return false;
  const updatedMs = toEpochMs(
    session?.updatedAt ?? session?.lastUpdatedAt ?? session?.startedAt ?? session?.createdAt ?? session?.triggeredAt
  );
  return updatedMs > 0 && Date.now() - updatedMs > SOS_ALERT_STALE_MS;
};

const isSessionActive = (session) => Boolean(session?.active) && !isSosSessionStale(session);

const readSuppressedAlertIds = () => {
  try {
    const raw = sessionStorage.getItem(SOS_SUPPRESSED_ALERTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((id) => String(id || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
};

const readSuppressedAlertTimestamps = () => {
  try {
    const raw = sessionStorage.getItem(SOS_SUPPRESSED_ALERTS_AT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next = {};
    Object.entries(parsed).forEach(([key, value]) => {
      const id = String(key || "").trim();
      const ts = Number(value);
      if (!id || !Number.isFinite(ts) || ts <= 0) return;
      next[id] = ts;
    });
    return next;
  } catch {
    return {};
  }
};

const readSeenAlertIds = () => {
  try {
    const raw = sessionStorage.getItem(SOS_SEEN_ALERTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((id) => String(id || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
};

const readIsSosActive = () => {
  try {
    const raw = localStorage.getItem(SOS_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.active) && !isSosSessionStale(parsed);
  } catch {
    return false;
  }
};

const SNAP_LENSES = [
  { id: "off", label: "Off", badge: "⦿", thumb: "linear-gradient(135deg, #131313, #282828)", filter: "none", mask: "" },
  { id: "natural", label: "Natural", badge: "🍃", thumb: "linear-gradient(135deg, #50755f, #9ed8a0)", filter: "none", mask: "" },
  {
    id: "colorful",
    label: "Colorful",
    badge: "🎨",
    thumb: "linear-gradient(135deg, #19a6ff, #7ce2ff 55%, #5adb88)",
    filter: "saturate(1.62) contrast(1.18) brightness(1.06)",
    mask: ""
  },
  {
    id: "cartoon",
    label: "Cartoon",
    badge: "🧩",
    thumb: "linear-gradient(135deg, #6f5eff, #f08dff)",
    filter: "contrast(1.34) saturate(1.34) brightness(1.08)",
    mask: ""
  },
  {
    id: "girl",
    label: "Girl",
    badge: "💖",
    thumb: "linear-gradient(135deg, #ff94ca, #ffa3a3)",
    filter: "brightness(1.1) saturate(1.16) sepia(0.08) hue-rotate(-10deg)",
    mask: ""
  },
  {
    id: "kawaii",
    label: "Kawaii",
    badge: "🎀",
    thumb: "linear-gradient(135deg, #ffd6ea, #ffeabf)",
    filter: "brightness(1.12) saturate(1.2) hue-rotate(-8deg)",
    maskType: "emoji-float",
    emojiPackIds: ["kawaii", "hearts", "sparkle"]
  },
  {
    id: "angel",
    label: "Angel",
    badge: "😇",
    thumb: "linear-gradient(135deg, #e6f5ff, #fff3d8)",
    filter: "brightness(1.1) contrast(1.04) saturate(1.05)",
    maskType: "emoji-float",
    emojiPackIds: ["angel", "sparkle"]
  },
  {
    id: "party",
    label: "Party",
    badge: "🥳",
    thumb: "linear-gradient(135deg, #ffcf7a, #ff7adf)",
    filter: "brightness(1.08) saturate(1.24) contrast(1.06)",
    maskType: "emoji-float",
    emojiPackIds: ["party", "sparkle"]
  },
  {
    id: "mood",
    label: "Mood",
    badge: "😌",
    thumb: "linear-gradient(135deg, #c7d2ff, #ffd1f2)",
    filter: "brightness(1.06) saturate(1.12) hue-rotate(-4deg)",
    maskType: "emoji-float",
    emojiPackIds: ["mood", "hearts", "sparkle"]
  },
  {
    id: "glow",
    label: "Glow",
    badge: "✨",
    thumb: "linear-gradient(135deg, #ffe3f2, #ffd7a8)",
    filter: "brightness(1.12) contrast(1.05) saturate(1.18) hue-rotate(-6deg)",
    mask: "✨"
  },
  {
    id: "blush",
    label: "Blush",
    badge: "💗",
    thumb: "linear-gradient(135deg, #ffb6d5, #ffd1e8)",
    filter: "brightness(1.08) saturate(1.22) hue-rotate(-12deg)",
    mask: "💗"
  },
  {
    id: "sparkle",
    label: "Sparkle",
    badge: "✦",
    thumb: "linear-gradient(135deg, #e9f4ff, #fbe6ff)",
    filter: "brightness(1.1) contrast(1.04) saturate(1.1)",
    mask: "✨✨"
  },
  {
    id: "crown",
    label: "Crown",
    badge: "👑",
    thumb: "linear-gradient(135deg, #ffe29a, #f7c15a)",
    filter: "contrast(1.08) saturate(1.12) brightness(1.06)",
    mask: "👑"
  },
  {
    id: "butterfly",
    label: "Butterfly",
    badge: "🦋",
    thumb: "linear-gradient(135deg, #9ad0ff, #e1b3ff)",
    filter: "saturate(1.2) brightness(1.05)",
    mask: "🦋"
  },
  {
    id: "bunny",
    label: "Bunny",
    badge: "🐰",
    thumb: "linear-gradient(135deg, #ffe5f0, #ffc7dd)",
    filter: "brightness(1.08) saturate(1.16) hue-rotate(-6deg)",
    mask: "🐰"
  },
  {
    id: "pastel",
    label: "Pastel",
    badge: "☁",
    thumb: "linear-gradient(135deg, #d6f4ff, #ffe4f6)",
    filter: "brightness(1.05) saturate(1.05) contrast(0.98) hue-rotate(8deg)",
    mask: "☁"
  },
  {
    id: "dream",
    label: "Dream",
    badge: "🌙",
    thumb: "linear-gradient(135deg, #9fa7ff, #f5b3ff)",
    filter: "brightness(1.1) contrast(1.06) saturate(1.1) hue-rotate(-8deg)",
    mask: "🌙"
  },
  {
    id: "cartoon-dog",
    label: "Cartoon Dog",
    badge: "🐶",
    thumb: "linear-gradient(135deg, #f7c896, #f2a35f)",
    filter: "contrast(1.35) saturate(1.45) brightness(1.08)",
    mask: "🐶",
    maskAnchor: "center",
    maskScale: 2.25
  },
  {
    id: "dog-face",
    label: "Dog Face",
    badge: "🐾",
    thumb: "linear-gradient(135deg, #f3c08b, #eaa763)",
    filter: "contrast(1.2) saturate(1.25) brightness(1.05)",
    mask: "🐶",
    maskAnchor: "center",
    maskScale: 2.9
  },
  {
    id: "cartoon-cat",
    label: "Cartoon Cat",
    badge: "🐱",
    thumb: "linear-gradient(135deg, #f7d49a, #f5b65d)",
    filter: "contrast(1.32) saturate(1.42) brightness(1.07)",
    mask: "🐱",
    maskAnchor: "center",
    maskScale: 2.2
  },
  {
    id: "boy",
    label: "Boy",
    badge: "♂",
    thumb: "linear-gradient(135deg, #59a4ff, #7ed0ff)",
    filter: "contrast(1.12) saturate(0.92) hue-rotate(8deg)",
    mask: ""
  },
  {
    id: "aging",
    label: "Aging",
    badge: "⏳",
    thumb: "linear-gradient(135deg, #ae8f75, #d0bda3)",
    filter: "sepia(0.28) contrast(1.16) grayscale(0.18)",
    mask: ""
  },
  { id: "cat", label: "Cat", badge: "CAT", thumb: "linear-gradient(135deg, #f7ab56, #f9d179)", filter: "none", mask: "🐱" },
  { id: "dog", label: "Dog", badge: "DOG", thumb: "linear-gradient(135deg, #c48f63, #e5cb9f)", filter: "none", mask: "🐶" }
];

const SNAP_TOOLS = [
  { id: "text", label: "Aa", title: "Add text" },
  { id: "loop", label: "∞", title: "Auto emoji" },
  { id: "sparkle", label: "✧", title: "Sparkle" },
  { id: "flip", label: "⌄", title: "Flip camera" }
];

const EMOJI_PACKS = [
  { id: "kawaii", label: "Kawaii", emojis: ["🎀", "🌸", "💗", "✨", "🫧", "💖"] },
  { id: "hearts", label: "Hearts", emojis: ["💗", "💖", "💞", "💕", "💘", "❤️"] },
  { id: "sparkle", label: "Sparkle", emojis: ["✨", "✦", "✧", "🌟", "💫", "🫧"] },
  { id: "angel", label: "Angel", emojis: ["😇", "👼", "✨", "☁", "🕊️", "💗"] },
  { id: "party", label: "Party", emojis: ["🥳", "🎉", "🎊", "✨", "💃", "🪩"] },
  { id: "mood", label: "Mood", emojis: ["😌", "😊", "🫶", "💫", "🌙", "✨"] }
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const myUserId = String(sessionStorage.getItem("userId") || localStorage.getItem("userId") || "").trim();
  const myEmail = String(sessionStorage.getItem("email") || localStorage.getItem("email") || "").trim().toLowerCase();
  const myName = String(sessionStorage.getItem("name") || localStorage.getItem("name") || "").trim();
  const myUsername = String(sessionStorage.getItem("username") || localStorage.getItem("username") || "").trim().toLowerCase();
  const onChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const onChatConversationRoute =
    location.pathname.startsWith("/chat/") && !location.pathname.startsWith("/chat/requests");
  const isOnSosRoute = location.pathname.startsWith("/sos");
  const isOnAmbulanceRoute = location.pathname === "/ambulance" || location.pathname.startsWith("/ambulance/");
  const profileTarget = "/profile/me";
  const [incomingCall, setIncomingCall] = useState(null);
  const [showSosInNavbar, setShowSosInNavbar] = useState(readShowSosInNavbar);
  const [studyModeReels, setStudyModeReels] = useState(readStudyModeReels);
  const [trafficAlertsEnabled, setTrafficAlertsEnabled] = useState(readTrafficAlertsEnabled);
  const [ambulanceNavigationEnabled, setAmbulanceNavigationEnabled] = useState(readAmbulanceNavigationEnabled);
  const [sosActive, setSosActive] = useState(readIsSosActive);
  const [sosPopup, setSosPopup] = useState(null);
  const [sosPopupPos, setSosPopupPos] = useState(() => {
    try {
      const raw = localStorage.getItem(SOS_POPUP_POS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    } catch {
      return null;
    }
  });
  const [trafficPopup, setTrafficPopup] = useState(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(() => readChatUnreadFromThreadState());
  const [sosUserLocation, setSosUserLocation] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false);
  const [cameraHighRes, setCameraHighRes] = useState(true);
  const [cameraMirrorFront, setCameraMirrorFront] = useState(true);
  const [cameraGridOn, setCameraGridOn] = useState(false);
  const [showLensTray, setShowLensTray] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [capturePreview, setCapturePreview] = useState(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [faceBox, setFaceBox] = useState(null);
  const [emojiPackId, setEmojiPackId] = useState("kawaii");
  const [snapTextOpen, setSnapTextOpen] = useState(false);
  const [snapText, setSnapText] = useState("");
  const [snapTextColor, setSnapTextColor] = useState("#ffffff");
  const [snapTextSize, setSnapTextSize] = useState(28);
  const [autoEmojiRotate, setAutoEmojiRotate] = useState(true);
  const [sparkleOn, setSparkleOn] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const faceDetectorRef = useRef(null);
  const faceDetectTimerRef = useRef(0);
  const faceMotionRef = useRef({ x: 0, y: 0, size: 0 });
  const snapTextInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraHighResRef = useRef(cameraHighRes);
  const [sparkleSeeds] = useState(() =>
    Array.from({ length: 12 }, (_, idx) => ({
      id: `sparkle-${idx}`,
      left: Math.round(Math.random() * 1000) / 10,
      top: Math.round(Math.random() * 1000) / 10,
      size: Math.round(10 + Math.random() * 16),
      delay: Math.round(Math.random() * 20) / 10
    }))
  );
  const [activeLensId, setActiveLensId] = useState("colorful");
  const [profileNavPic, setProfileNavPic] = useState("");
  const seenSignalRef = useRef(new Set());
  const incomingCallRef = useRef(null);
  const sosTapRef = useRef({ count: 0, lastAt: 0 });
  const sosPopupRef = useRef(null);
  const sosPopupDragRef = useRef({ active: false, offsetX: 0, offsetY: 0 });
  const sosPopupPosRef = useRef(sosPopupPos);
  const seenEmergencyAlertsRef = useRef(new Set());
  const seenLocalSignalsRef = useRef(new Set());
  const seenSessionSignalsRef = useRef(new Set());
  const seenNotificationIdsRef = useRef(new Set());
  const seenAlertIdsRef = useRef(readSeenAlertIds());
  const suppressedAlertIdsRef = useRef(readSuppressedAlertIds());
  const suppressedAlertAtRef = useRef(readSuppressedAlertTimestamps());
  const activeAlertIdsRef = useRef(new Set());
  const ownSosStopUntilRef = useRef(0);
  const sosEmergencyMissesRef = useRef(0);
  const sosLastActiveAtRef = useRef(0);
  const sosPopupStickyRef = useRef(false);
  const sosPopupStickyIdRef = useRef("");
  const popupStateRef = useRef(null);
  const popupMetaRef = useRef({ fingerprint: "", shownAt: 0 });
  const sosSignalChannelRef = useRef(null);
  const sosUserLocationRef = useRef(null);
  const sosLocationWatchRef = useRef(null);
  const sosLocationPromptRef = useRef(false);
  const lastHandledSignalIdRef = useRef(readSessionValue(SOS_LAST_SIGNAL_ID_KEY));
  const lastHandledSessionSigRef = useRef(readSessionValue(SOS_LAST_SESSION_SIG_KEY));
  const lastEmergencyNotificationIdRef = useRef(readSessionValue(SOS_LAST_NOTIFICATION_ID_KEY));
  const lastTrafficNotificationIdRef = useRef(readSessionValue(TRAFFIC_LAST_NOTIFICATION_ID_KEY));
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const items = ITEMS.map((item) => {
    if (item.label === "Profile") return { ...item, to: profileTarget };
    if (item.to === "/reels") {
      if (ambulanceNavigationEnabled) {
        return {
          ...item,
          to: "/ambulance",
          label: "Navigation",
          match: (p) => p === "/ambulance" || p.startsWith("/ambulance/"),
          icon: FiMap
        };
      }
      return {
        ...item,
        icon: studyModeReels ? FaGraduationCap : item.icon
      };
    }
    return item;
  });

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    const syncLocalUnread = () => {
      setChatUnreadCount(readChatUnreadFromThreadState());
    };
    syncLocalUnread();
    const onStorage = (event) => {
      if (!event || !event.key || event.key === CHAT_THREAD_READ_STATE_KEY) {
        syncLocalUnread();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncLocalUnread);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", syncLocalUnread);
    };
  }, []);

  useEffect(() => {
    if (!myUserId) return undefined;
    let disposed = false;
    let busy = false;
    const pollUnread = async () => {
      if (disposed || busy) return;
      busy = true;
      try {
        const res = await api.get("/api/chat/conversations", {
          params: { page: 0, size: 200 },
          timeout: 6500,
          suppressAuthRedirect: true,
        });
        const conversations = toArrayPayload(res?.data);
        const serverUnread = sumUnreadFromConversations(conversations);
        const localUnread = readChatUnreadFromThreadState();
        const nextCount = Math.max(localUnread, serverUnread);
        if (!disposed) setChatUnreadCount(nextCount);
      } catch {
        if (!disposed) setChatUnreadCount(readChatUnreadFromThreadState());
      } finally {
        busy = false;
      }
    };
    pollUnread();
    const timer = setInterval(pollUnread, 12000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [myUserId]);

  useEffect(() => {
    sosPopupPosRef.current = sosPopupPos;
  }, [sosPopupPos]);

  const persistSosPopupPos = (pos) => {
    try {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        localStorage.removeItem(SOS_POPUP_POS_KEY);
        return;
      }
      localStorage.setItem(SOS_POPUP_POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }));
    } catch {
      // ignore storage failures
    }
  };

  const resetSosPopupPos = () => {
    sosPopupPosRef.current = null;
    setSosPopupPos(null);
    persistSosPopupPos(null);
  };

  const startSosPopupDrag = (event) => {
    const popup = sosPopupRef.current;
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const point = event?.touches?.[0] || event?.changedTouches?.[0] || event;
    if (!point) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    sosPopupDragRef.current.active = true;
    sosPopupDragRef.current.offsetX = point.clientX - rect.left;
    sosPopupDragRef.current.offsetY = point.clientY - rect.top;
    if (!sosPopupPosRef.current) {
      const next = { x: rect.left, y: rect.top };
      sosPopupPosRef.current = next;
      setSosPopupPos(next);
    }
  };

  useEffect(() => {
    const handleMove = (event) => {
      if (!sosPopupDragRef.current.active) return;
      const point = event?.touches?.[0] || event?.changedTouches?.[0] || event;
      if (!point) return;
      event.preventDefault?.();
      const popup = sosPopupRef.current;
      if (!popup) return;
      const rect = popup.getBoundingClientRect();
      const padding = 8;
      const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
      const maxY = Math.max(padding, window.innerHeight - rect.height - padding);
      const nextX = Math.min(maxX, Math.max(padding, point.clientX - sosPopupDragRef.current.offsetX));
      const nextY = Math.min(maxY, Math.max(padding, point.clientY - sosPopupDragRef.current.offsetY));
      const next = { x: nextX, y: nextY };
      sosPopupPosRef.current = next;
      setSosPopupPos(next);
    };

    const handleEnd = () => {
      if (!sosPopupDragRef.current.active) return;
      sosPopupDragRef.current.active = false;
      persistSosPopupPos(sosPopupPosRef.current);
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setShowSosInNavbar(readShowSosInNavbar());
      setStudyModeReels(readStudyModeReels());
      setTrafficAlertsEnabled(readTrafficAlertsEnabled());
      setAmbulanceNavigationEnabled(readAmbulanceNavigationEnabled());
    };
    const onStorage = (event) => {
      if (!event || event.key === SETTINGS_KEY) refresh();
    };
    window.addEventListener("ss-settings-update", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ss-settings-update", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!myUserId && !myEmail) return undefined;
    const pingPresence = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        await pingChatPresence({ timeoutMs: 4000 });
      } catch {
        // ignore presence ping failures
      }
    };
    pingPresence();
    const timer = setInterval(pingPresence, 60000);
    const onFocus = () => pingPresence();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [myUserId, myEmail]);

  useEffect(() => {
    if (!myUserId && !myEmail) {
      setProfileNavPic("");
      return undefined;
    }

    let cancelled = false;
    const loadProfilePic = async () => {
      try {
        const res = await api.get("/api/profile/me");
        const payload = res?.data || {};
        const rawPic =
          payload?.profilePicUrl ||
          payload?.profilePic ||
          payload?.avatarUrl ||
          payload?.avatar ||
          "";
        const nextPic = rawPic ? toApiUrl(rawPic) : "";
        if (!cancelled) setProfileNavPic(String(nextPic || "").trim());
      } catch {
        if (!cancelled) setProfileNavPic("");
      }
    };

    loadProfilePic();
    window.addEventListener("focus", loadProfilePic);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadProfilePic);
    };
  }, [myUserId, myEmail, location.pathname]);

  useEffect(() => {
    cameraHighResRef.current = cameraHighRes;
  }, [cameraHighRes]);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const onPosition = (pos) => {
      const next = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: Date.now()
      };
      sosUserLocationRef.current = next;
      setSosUserLocation(next);
    };
    const onError = () => {};
    const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    });
    sosLocationWatchRef.current = watchId;
    return () => {
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      sosLocationWatchRef.current = null;
    };
  }, []);

  const matchesReporterIdentity = ({ reporterEmail, reporterUserId, reporterName } = {}) => {
    const sessionReporterEmail = String(reporterEmail || "").trim().toLowerCase();
    const sessionReporterUserId = String(reporterUserId || "").trim();
    const sessionReporterName = String(reporterName || "").trim().toLowerCase();
    if (myUserId && sessionReporterUserId && myUserId === sessionReporterUserId) return true;
    if (myEmail && sessionReporterEmail && myEmail.toLowerCase() === sessionReporterEmail) return true;
    if (!myUserId && !myEmail && myName && sessionReporterName && myName.toLowerCase() === sessionReporterName) {
      return true;
    }
    if (!myUserId && !myEmail && myUsername && sessionReporterName && myUsername === sessionReporterName) {
      return true;
    }
    return false;
  };

  const matchesCurrentSessionUser = (session) =>
    matchesReporterIdentity({
      reporterEmail: session?.reporterEmail,
      reporterUserId: session?.reporterUserId,
      reporterName: session?.reporterName
    });

  const isOwnBrowserSession = (session) => {
    if (!session?.triggeredByCurrentBrowser) return false;
    const currentKnown = Boolean(myUserId || myEmail);
    if (!currentKnown) return true;
    return matchesCurrentSessionUser(session);
  };

  const isOwnEmergency = ({ reporterEmail, reporterUserId } = {}) => {
    try {
      const raw = localStorage.getItem(SOS_SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        const sessionReporterEmail = String(session?.reporterEmail || "").trim().toLowerCase();
        const sessionReporterUserId = String(session?.reporterUserId || "").trim();
        const incomingEmail = String(reporterEmail || "").trim().toLowerCase();
        const incomingUserId = String(reporterUserId || "").trim();
        // Only suppress on this browser if the local SOS session matches the current user.
        const currentKnown = Boolean(myUserId || myEmail);
        if (session?.triggeredByCurrentBrowser && (!currentKnown || matchesCurrentSessionUser(session))) {
          return true;
        }
        if (
          isSessionActive(session) &&
          ((sessionReporterEmail && incomingEmail && sessionReporterEmail === incomingEmail) ||
            (sessionReporterUserId && incomingUserId && sessionReporterUserId === incomingUserId))
        ) {
          return true;
        }
      }
    } catch {
      // ignore storage issues
    }
    return false;
  };

  useEffect(() => {
    setShowSosInNavbar(readShowSosInNavbar());
  }, [location.pathname]);

  useEffect(() => {
    const onStorage = (event) => {
      if (!event || event.key === SETTINGS_KEY) {
        setShowSosInNavbar(readShowSosInNavbar());
      }
      if (!event || event.key === SOS_SESSION_KEY) {
        setSosActive(readIsSosActive());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setSosActive(readIsSosActive()), 1200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Chat page handles call inbox polling itself; avoid draining the same inbox twice.
    if (!myUserId || onChatRoute) return undefined;
    let disposed = false;

    const normalizeName = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return "User";
      const local = raw.includes("@") ? raw.split("@")[0] : raw;
      return local
        .replace(/[._-]+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
    };

    const pollCalls = async () => {
      try {
        const res = await api.get("/api/calls/inbox");
        if (disposed) return;
        const list = Array.isArray(res.data) ? res.data : [];

        const toSignalMs = (signal) => {
          const rawTs = signal?.timestamp ?? signal?.at ?? signal?.createdAt ?? signal?.updatedAt ?? 0;
          const parsedTs = Number(rawTs);
          if (Number.isFinite(parsedTs)) {
            return parsedTs > 1000000000000 ? parsedTs : parsedTs * 1000;
          }
          const asDate = new Date(String(rawTs || "")).getTime();
          return Number.isFinite(asDate) ? asDate : 0;
        };

        const terminalTypes = new Set(["hangup", "reject", "busy", "answer", "accepted", "ended"]);
        const latestTerminalByPeer = new Map();
        for (const signal of list) {
          const type = String(signal?.type || "").toLowerCase();
          const fromId = String(signal?.fromUserId || "");
          if (!fromId || !terminalTypes.has(type)) continue;
          const signalMs = toSignalMs(signal);
          const prev = latestTerminalByPeer.get(fromId) || 0;
          if (signalMs >= prev) latestTerminalByPeer.set(fromId, signalMs);
        }

        const activeIncoming = incomingCallRef.current;
        if (activeIncoming?.fromUserId) {
          const staleSignal = list.find((signal) => {
            const type = String(signal?.type || "").toLowerCase();
            const fromId = String(signal?.fromUserId || "");
            return (
              fromId === String(activeIncoming.fromUserId) &&
              terminalTypes.has(type)
            );
          });
          if (staleSignal) {
            setIncomingCall(null);
          }
        }

        for (const signal of list) {
          const type = String(signal?.type || "").toLowerCase();
          const fromId = String(signal?.fromUserId || "");
          const isOffer = type === "offer" || type === "livekit-invite";
          if (!isOffer || !fromId || fromId === String(myUserId)) continue;
          const signalMs = toSignalMs(signal);
          if (signalMs > 0 && Date.now() - signalMs > CALL_SIGNAL_MAX_AGE_MS) continue;
          const terminalMs = latestTerminalByPeer.get(fromId) || 0;
          if ((terminalMs > 0 && signalMs <= terminalMs) || (terminalMs > 0 && signalMs <= 0)) continue;
          const signature = `${type}|${fromId}|${signal?.timestamp || ""}|${signal?.roomId || ""}|${signal?.sdp || ""}`;
          if (seenSignalRef.current.has(signature)) continue;
          seenSignalRef.current.add(signature);
          if (seenSignalRef.current.size > 800) seenSignalRef.current.clear();
          setIncomingCall({
            fromUserId: fromId,
            fromName: normalizeName(signal?.fromName || signal?.fromEmail || `User ${fromId}`),
            mode: signal?.mode === "video" ? "video" : "audio",
            sdp: typeof signal?.sdp === "string" ? signal.sdp : "",
            roomId: typeof signal?.roomId === "string" ? signal.roomId : "",
            provider: type === "livekit-invite" ? "livekit" : "webrtc",
            at: signalMs || Date.now()
          });
          break;
        }
      } catch {
        // ignore transient poll failures
      }
    };

    pollCalls();
    const timer = setInterval(pollCalls, 1200);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [myUserId, onChatRoute]);

  useEffect(() => {
    // On chat screen, Chat.jsx owns call UI/signals. Keep navbar banner closed there.
    if (onChatRoute && incomingCall) {
      setIncomingCall(null);
    }
  }, [onChatRoute, incomingCall]);

  useEffect(() => {
    const terminalTypes = new Set(["hangup", "reject", "busy", "answer", "accepted", "ended"]);

    const maybeCloseFromSignal = (signal) => {
      if (!signal || !incomingCall?.fromUserId) return;
      const type = String(signal?.type || "").toLowerCase();
      const fromId = String(signal?.fromUserId || signal?.fromId || "");
      const toId = String(signal?.toUserId || signal?.toId || "");
      const meId = String(myUserId || "");
      const peerId = String(incomingCall.fromUserId || "");
      const fromPeerToMe = fromId === peerId && (!meId || !toId || toId === meId);
      const fromMeToPeer = fromId === meId && toId === peerId;
      if (terminalTypes.has(type) && (fromPeerToMe || fromMeToPeer)) {
        setIncomingCall(null);
      }
    };

    const onStorage = (event) => {
      if (event?.key !== CALL_SIGNAL_LOCAL_KEY || !event?.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        maybeCloseFromSignal(payload?.signal || payload);
      } catch {
        // ignore malformed signal payload
      }
    };

    let channel = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(CALL_SIGNAL_CHANNEL);
        channel.addEventListener("message", (event) => {
          const data = event?.data;
          if (!data || data.kind !== "call-signal") return;
          maybeCloseFromSignal(data.signal);
        });
      } catch {
        channel = null;
      }
    }

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (channel) {
        channel.close();
      }
    };
  }, [incomingCall?.fromUserId, myUserId]);

  const persistCallAcceptTarget = (call, { autoAccept } = {}) => {
    if (!call?.fromUserId) return;
    try {
      const payload = {
        fromUserId: String(call.fromUserId),
        fromName: String(call.fromName || "User"),
        mode: call.mode === "video" ? "video" : "audio",
        sdp: String(call.sdp || ""),
        roomId: String(call.roomId || ""),
        provider: String(call.provider || ""),
        at: Number(call.at || 0) || Date.now(),
        autoAccept: autoAccept === true
      };
      sessionStorage.setItem(CALL_ACCEPT_TARGET_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage issues
    }
  };

  const openIncomingCall = () => {
    if (!incomingCall?.fromUserId) return;
    persistCallAcceptTarget(incomingCall, { autoAccept: false });
    setIncomingCall(null);
    navigate(`/chat/${incomingCall.fromUserId}`);
  };

  const acceptIncomingCall = () => {
    if (!incomingCall?.fromUserId) return;
    persistCallAcceptTarget(incomingCall, { autoAccept: true });
    setIncomingCall(null);
    navigate(`/chat/${incomingCall.fromUserId}`);
  };


  useEffect(() => {
    if (!incomingCall?.at) return undefined;
    const timer = setTimeout(() => setIncomingCall(null), 35000);
    return () => clearTimeout(timer);
  }, [incomingCall?.fromUserId, incomingCall?.at]);
  const declineIncomingCall = async () => {
    if (!incomingCall?.fromUserId) return;
    try {
      await api.post(`/api/calls/signal/${incomingCall.fromUserId}`, {
        type: "reject",
        mode: incomingCall.mode || "audio"
      });
    } catch {
      // ignore; still hide banner locally
    }
    setIncomingCall(null);
  };

  const requestLocationForSos = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            at: Date.now()
          };
          resolve(next);
        },
        (err) => reject(err),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 1500
        }
      );
    });

  const hasSosLocation = () => {
    const lat = Number(sosUserLocationRef.current?.latitude);
    const lon = Number(sosUserLocationRef.current?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon);
  };

  const onSosTap = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!hasSosLocation()) {
      if (sosLocationPromptRef.current) return;
      sosLocationPromptRef.current = true;
      showSosPopup("Allow location access to enable SOS.");
      try {
        const point = await requestLocationForSos();
        sosUserLocationRef.current = point;
        setSosUserLocation(point);
        sosTapRef.current = { count: 0, lastAt: 0 };
        showSosPopup("Location captured. Tap SOS again to start emergency flow.");
      } catch {
        showSosPopup("Location is required for SOS. Please allow location permission.");
      } finally {
        sosLocationPromptRef.current = false;
      }
      return;
    }
    const now = Date.now();
    const prev = sosTapRef.current;
    const count = now - prev.lastAt <= 2200 ? prev.count + 1 : 1;
    sosTapRef.current = { count, lastAt: now };

    if (count === 1) {
      showSosPopup("SOS ready. Tap 2 more times to send emergency alert.");
      return;
    }
    if (count === 2) {
      showSosPopup("One more tap. SOS will be sent now.");
      return;
    }

    sosTapRef.current = { count: 0, lastAt: 0 };
    showSosPopup("ok bee Brave Help is on the way");
    navigate("/sos?arm=1");
  };

  useEffect(() => {
    if (!sosPopup) return undefined;
    const popupData = typeof sosPopup === "string" ? buildSosPopupPayload(sosPopup) : sosPopup;
    if (popupData?.isEmergency) return undefined;
    const timer = setTimeout(() => setSosPopup(null), 9000);
    return () => clearTimeout(timer);
  }, [sosPopup]);

  useEffect(() => {
    popupStateRef.current = sosPopup;
  }, [sosPopup]);

  useEffect(() => {
    const path = String(location.pathname || "");
    const match = path.match(/\/sos\/(?:live|navigate)\/([^/]+)/i);
    if (!match?.[1]) return;
    const openedAlertId = normalizeAlertId(match[1]);
    if (!openedAlertId) return;
    suppressAlert(openedAlertId);
    sosPopupStickyRef.current = false;
    sosPopupStickyIdRef.current = "";
    const currentId = normalizeAlertId(popupStateRef.current?.alertId || popupStateRef.current?.dedupeKey);
    if (!currentId || currentId === openedAlertId) {
      setSosPopup(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    try {
      const stored = Number(sessionStorage.getItem(SOS_OWN_STOP_AT_KEY) || localStorage.getItem(SOS_OWN_STOP_AT_KEY) || 0);
      if (Number.isFinite(stored) && stored > Date.now()) {
        ownSosStopUntilRef.current = stored;
      } else {
        ownSosStopUntilRef.current = 0;
      }
    } catch {
      ownSosStopUntilRef.current = 0;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const syncOwnSosStopState = () => {
      if (disposed) return;
      try {
        const raw = localStorage.getItem(SOS_SESSION_KEY);
        if (!raw) {
          // No local SOS session; do not dismiss remote emergency popups.
          return;
        }
        const session = JSON.parse(raw);
        const isOwnSession =
          isOwnBrowserSession(session) ||
          isOwnEmergency({ reporterEmail: session?.reporterEmail, reporterUserId: session?.reporterUserId });
        if (!isOwnSession) return;
        if (isSessionActive(session)) {
          ownSosStopUntilRef.current = 0;
          try {
            sessionStorage.removeItem(SOS_OWN_STOP_AT_KEY);
            localStorage.removeItem(SOS_OWN_STOP_AT_KEY);
          } catch {
            // ignore storage issues
          }
          return;
        }
        const until = Date.now() + 45000;
        ownSosStopUntilRef.current = until;
        setSosPopup(null);
        try {
          sessionStorage.setItem(SOS_OWN_STOP_AT_KEY, String(until));
          localStorage.setItem(SOS_OWN_STOP_AT_KEY, String(until));
        } catch {
          // ignore storage issues
        }
      } catch {
        // ignore parse/storage issues
      }
    };

    syncOwnSosStopState();
    const timer = setInterval(syncOwnSosStopState, 700);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [location.pathname]);

  useEffect(() => {
    const readEpoch = (value) => {
      const t = new Date(value || "").getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const processSignal = (payload, options = {}) => {
      if (!payload || typeof payload !== "object") return;
      if (options.requireFresh) {
        const atMs = readEpoch(payload.at);
        if (!atMs || Date.now() - atMs > 120000) return;
      }
      const signalId = String(payload.id || payload.alertId || `${payload.type || "sos"}_${payload.at || ""}`);
      if (!signalId || seenLocalSignalsRef.current.has(signalId)) return;
      if (signalId === lastHandledSignalIdRef.current) return;

      seenLocalSignalsRef.current.add(signalId);
      if (seenLocalSignalsRef.current.size > 1000) seenLocalSignalsRef.current.clear();
      lastHandledSignalIdRef.current = signalId;
      try {
        sessionStorage.setItem(SOS_LAST_SIGNAL_ID_KEY, signalId);
      } catch {
        // ignore storage issues
      }

      const kind = String(payload.type || "").toLowerCase();
      const resolvedAlertId = String(payload.alertId || payload.localAlertId || "").trim();
      const signalReporterEmail = payload.reporterEmail || payload.senderEmail;
      const signalReporterUserId = payload.reporterUserId || payload.senderUserId;
      if (kind === "triggered" || kind === "triggered-local" || kind === "active" || kind === "triggering") {
        sosLastActiveAtRef.current = Date.now();
      }
      if (kind === "stopped") {
          const isOwnStopped =
            (Boolean(payload?.triggeredByCurrentBrowser) &&
              matchesReporterIdentity({ reporterEmail: signalReporterEmail, reporterUserId: signalReporterUserId })) ||
            isOwnEmergency({ reporterEmail: signalReporterEmail, reporterUserId: signalReporterUserId });
          if (isOwnStopped) {
            const until = Date.now() + 45000;
            ownSosStopUntilRef.current = until;
          try {
            sessionStorage.setItem(SOS_OWN_STOP_AT_KEY, String(until));
            localStorage.setItem(SOS_OWN_STOP_AT_KEY, String(until));
          } catch {
            // ignore storage issues
          }
        }
          suppressAlert(resolvedAlertId);
          sosPopupStickyRef.current = false;
          sosPopupStickyIdRef.current = "";
          setSosPopup(null);
          return;
        }
      if (resolvedAlertId && isAlertSuppressed(resolvedAlertId)) {
        setSosPopup(null);
        return;
      }
      const withinRadius = isWithinSosRadius({
        latitude: payload.latitude,
        longitude: payload.longitude,
        radiusMeters: payload.radiusMeters
      });
      if (!withinRadius) return;
      showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
        isEmergency: true,
        alertId: resolvedAlertId || undefined,
        reporterEmail: signalReporterEmail,
        reporterUserId: signalReporterUserId,
        liveUrl: payload.liveUrl || payload.streamUrl || payload.liveStreamUrl || payload.stream,
        navigateUrl: payload.navigateUrl,
        mapsUrl: payload.mapsUrl,
        latitude: payload.latitude,
        longitude: payload.longitude,
        radiusMeters: payload.radiusMeters
      });
    };

    const onStorage = (event) => {
      if (event?.key === SOS_SIGNAL_KEY && event.newValue) {
        try {
          processSignal(JSON.parse(event.newValue));
        } catch {
          // ignore malformed events
        }
      }

      if (event?.key === SOS_SESSION_KEY && event.newValue) {
        try {
          const session = JSON.parse(event.newValue);
          const isActive = isSessionActive(session);
          if (!isActive) {
            const stoppedId = normalizeAlertId(session?.alertId || session?.alertDisplayId);
            if (stoppedId) {
              suppressAlert(stoppedId);
            }
            const isOwnStoppedSession =
              isOwnBrowserSession(session) ||
              isOwnEmergency({ reporterEmail: session?.reporterEmail, reporterUserId: session?.reporterUserId });
            if (isOwnStoppedSession) {
              setSosPopup(null);
              return;
            }
            const currentId = normalizeAlertId(popupStateRef.current?.alertId);
            if (currentId && stoppedId && currentId === stoppedId) {
              setSosPopup(null);
            }
            return;
          }
          if (isAlertSuppressed(session?.alertId || session?.alertDisplayId)) {
            setSosPopup(null);
            return;
          }
          const sig = `${session?.startedAt || ""}|${session?.updatedAt || ""}|${session?.alertId || ""}`;
          if (!sig.trim() || seenSessionSignalsRef.current.has(sig)) return;
          if (sig === lastHandledSessionSigRef.current) return;
          seenSessionSignalsRef.current.add(sig);
          if (seenSessionSignalsRef.current.size > 300) seenSessionSignalsRef.current.clear();
          lastHandledSessionSigRef.current = sig;
          try {
            sessionStorage.setItem(SOS_LAST_SESSION_SIG_KEY, sig);
          } catch {
            // ignore storage issues
          }
          showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
            isEmergency: true,
            alertId: session?.alertId || session?.alertDisplayId,
            reporterEmail: session?.reporterEmail,
            reporterUserId: session?.reporterUserId,
            latitude: session?.lastLocation?.latitude,
            longitude: session?.lastLocation?.longitude
          });
        } catch {
          // ignore malformed session events
        }
      }
    };

    const onBroadcastMessage = (event) => {
      processSignal(event?.data);
    };

    const pollLatestSignal = () => {
      try {
        const raw = localStorage.getItem(SOS_SIGNAL_KEY);
        if (!raw) return;
        const payload = JSON.parse(raw);
        const atMs = readEpoch(payload?.at || payload?.timestamp);
        if (SOS_SIGNAL_STALE_MS > 0 && atMs && Date.now() - atMs > SOS_SIGNAL_STALE_MS) {
          try {
            localStorage.removeItem(SOS_SIGNAL_KEY);
          } catch {
            // ignore storage issues
          }
          return;
        }
        processSignal(payload, { requireFresh: true });
      } catch {
        // ignore parse/storage issues
      }

      try {
        const rawSession = localStorage.getItem(SOS_SESSION_KEY);
        if (!rawSession) return;
        const session = JSON.parse(rawSession);
        if (!isSessionActive(session)) {
          const stoppedId = normalizeAlertId(session?.alertId || session?.alertDisplayId);
          if (stoppedId) {
            suppressAlert(stoppedId);
          }
          const isOwnStoppedSession =
            isOwnBrowserSession(session) ||
            isOwnEmergency({ reporterEmail: session?.reporterEmail, reporterUserId: session?.reporterUserId });
          if (isOwnStoppedSession) {
            setSosPopup(null);
            return;
          }
          const currentId = normalizeAlertId(popupStateRef.current?.alertId);
          if (currentId && stoppedId && currentId === stoppedId) {
            setSosPopup(null);
          }
          return;
        }
        if (isAlertSuppressed(session?.alertId || session?.alertDisplayId)) {
          setSosPopup(null);
          return;
        }
        const updatedAtMs = readEpoch(session?.updatedAt || session?.startedAt);
        if (!updatedAtMs) return;
        const sig = `${session?.startedAt || ""}|${session?.updatedAt || ""}|${session?.alertId || ""}`;
        if (!sig.trim() || seenSessionSignalsRef.current.has(sig)) return;
        if (sig === lastHandledSessionSigRef.current) return;
        seenSessionSignalsRef.current.add(sig);
        if (seenSessionSignalsRef.current.size > 300) seenSessionSignalsRef.current.clear();
        lastHandledSessionSigRef.current = sig;
        try {
          sessionStorage.setItem(SOS_LAST_SESSION_SIG_KEY, sig);
        } catch {
          // ignore storage issues
        }
        showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
          isEmergency: true,
          alertId: session?.alertId || session?.alertDisplayId,
          reporterEmail: session?.reporterEmail,
          reporterUserId: session?.reporterUserId,
          latitude: session?.lastLocation?.latitude,
          longitude: session?.lastLocation?.longitude
        });
      } catch {
        // ignore parse/storage issues
      }
    };

    window.addEventListener("storage", onStorage);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        sosSignalChannelRef.current = new BroadcastChannel(SOS_SIGNAL_CHANNEL);
        sosSignalChannelRef.current.addEventListener("message", onBroadcastMessage);
      }
    } catch {
      sosSignalChannelRef.current = null;
    }

    pollLatestSignal();
    const pollTimer = setInterval(pollLatestSignal, 1000);

    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(pollTimer);
      if (sosSignalChannelRef.current) {
        sosSignalChannelRef.current.removeEventListener("message", onBroadcastMessage);
        sosSignalChannelRef.current.close();
        sosSignalChannelRef.current = null;
      }
    };
  }, [location.pathname]);

  useEffect(() => {
    let disposed = false;

    const normalizeAlerts = (data) => {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.alerts)) return data.alerts;
      if (Array.isArray(data?.alerts?.items)) return data.alerts.items;
      if (Array.isArray(data?.alerts?.rows)) return data.alerts.rows;
      if (Array.isArray(data?.activeAlerts)) return data.activeAlerts;
      if (Array.isArray(data?.nearbyAlerts)) return data.nearbyAlerts;
      if (Array.isArray(data?.nearby)) return data.nearby;
      if (Array.isArray(data?.sosAlerts)) return data.sosAlerts;
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.result)) return data.result;
      if (Array.isArray(data?.payload)) return data.payload;
      if (Array.isArray(data?.result?.alerts)) return data.result.alerts;
      if (Array.isArray(data?.payload?.alerts)) return data.payload.alerts;
      if (data?.alert && typeof data.alert === "object") return [data.alert];
      if (data?.activeAlert && typeof data.activeAlert === "object") return [data.activeAlert];
      if (data && typeof data === "object" && (data.active || data.alertId || data.alertDisplayId || data.latitude || data.longitude || data.reporterEmail)) {
        return [data];
      }
      return [];
    };

    const normalizeActiveValue = (value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value > 0;
      if (typeof value === "string") {
        const trimmed = value.trim().toLowerCase();
        if (!trimmed) return undefined;
        if (["false", "0", "no", "inactive", "stopped", "stop", "ended", "closed", "resolved", "cancelled", "canceled"].includes(trimmed)) {
          return false;
        }
        if (["true", "1", "yes", "active", "open", "live", "started", "triggered", "ongoing"].includes(trimmed)) {
          return true;
        }
      }
      return undefined;
    };

    const isAlertActive = (alert) => {
      if (!alert || typeof alert !== "object") return false;
      const statusText = String(
        alert?.status ||
          alert?.state ||
          alert?.alertStatus ||
          alert?.sosStatus ||
          ""
      )
        .trim()
        .toLowerCase();
      if (statusText) {
        if (/(stopp?ed|ended|closed|resolved|inactive|cancelled|canceled|completed|expired)/i.test(statusText)) {
          return false;
        }
        if (/(active|open|live|triggered|ongoing|started)/i.test(statusText)) {
          return true;
        }
      }
      if (alert?.stoppedAt || alert?.endedAt || alert?.resolvedAt || alert?.closedAt) return false;
      const direct = normalizeActiveValue(
        alert?.active ??
          alert?.isActive ??
          alert?.activeAlert ??
          alert?.enabled ??
          alert?.isLive ??
          alert?.inProgress
      );
      if (typeof direct === "boolean") return direct;
      const updatedMs = readAlertTimestampMs(alert);
      if (SOS_ALERT_STALE_MS > 0 && updatedMs && Date.now() - updatedMs > SOS_ALERT_STALE_MS) return false;
      return true;
    };

    const requestEmergencyData = async (suffix) => {
      let res = null;
      let lastError = null;
      const urls = buildEmergencyUrls(suffix);
      const suffixText = String(suffix || "").toLowerCase();
      const isPublicEmergencyEndpoint = suffixText === "active";
      const params = buildEmergencyQueryParams();
      const mergedParams = params ? { ...params, includeReporter: true, includeNearby: true } : { includeReporter: true };
      const authToken =
        sessionStorage.getItem("accessToken") ||
        sessionStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        localStorage.getItem("token") ||
        "";
      const hasAuthToken = Boolean(authToken && authToken !== "null" && authToken !== "undefined");
      for (const url of urls) {
        const baseURL = /^https?:\/\//i.test(url) ? undefined : api.defaults.baseURL;
        const path = /^https?:\/\//i.test(url) ? url : url;
        try {
          res = await api.get(path, {
            baseURL,
            suppressAuthRedirect: true,
            skipRefresh: isPublicEmergencyEndpoint,
            params: mergedParams,
            timeout: 4500
          });
          break;
        } catch (err) {
          lastError = err;
          const status = Number(err?.response?.status || 0);
          if ((status === 401 || status === 403) && isPublicEmergencyEndpoint && hasAuthToken) {
            try {
              res = await api.get(path, {
                baseURL,
                suppressAuthRedirect: true,
                skipAuth: true,
                skipRefresh: true,
                params: mergedParams,
                timeout: 4500
              });
              break;
            } catch (retryErr) {
              lastError = retryErr;
            }
          }
          if (!(status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || status >= 500 || !status)) {
            throw err;
          }
        }
      }
      if (!res) throw lastError || new Error("Emergency endpoint unavailable");
      return res?.data;
    };

    const pollEmergency = async () => {
      try {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (isTriggeredByCurrentBrowser()) return;
        const payloads = [];
        try {
          payloads.push(await requestEmergencyData("active"));
        } catch {
          // ignore emergency polling errors; avoid hitting invalid assist/active endpoint
        }
        if (!payloads.length) return;

        if (disposed) return;
        const alerts = payloads.flatMap((data) => normalizeAlerts(data));
        const activeAlerts = alerts.filter((a) => isAlertActive(a));
        activeAlertIdsRef.current = new Set(
          activeAlerts
            .map((a) => String(a?.alertId || a?.alertDisplayId || "").trim())
            .filter(Boolean)
        );
        if (activeAlerts.length) {
          sosEmergencyMissesRef.current = 0;
          sosLastActiveAtRef.current = Date.now();
        } else {
          sosEmergencyMissesRef.current += 1;
        }
        const activeKeys = new Set(activeAlerts.map((a) => buildEmergencyDedupeKey(a)).filter(Boolean));
        const currentPopup = popupStateRef.current;
        const currentPopupKey = normalizeAlertId(currentPopup?.dedupeKey || currentPopup?.alertId);

        // Close stale emergency popup when backend responds with no active alerts.
        if (!activeAlerts.length && currentPopup?.isEmergency) {
          if (readIsSosActive()) {
            sosEmergencyMissesRef.current = 0;
            return;
          }
          const lastActiveAt = sosLastActiveAtRef.current;
          if (lastActiveAt && Date.now() - lastActiveAt < 4000) {
            return;
          }
          if (currentPopupKey) suppressAlert(currentPopupKey);
          sosEmergencyMissesRef.current = 3;
          sosPopupStickyRef.current = false;
          sosPopupStickyIdRef.current = "";
          setSosPopup(null);
          return;
        }
        if (currentPopup?.isEmergency && currentPopupKey && activeKeys.size && !activeKeys.has(currentPopupKey)) {
          // Active alert set no longer includes the current popup; clear it so a fresh alert can show.
          sosPopupStickyRef.current = false;
          sosPopupStickyIdRef.current = "";
          setSosPopup(null);
        }

        for (const a of alerts) {
          const isActiveAlert = isAlertActive(a);
          const id = String(a?.alertId || a?.alertDisplayId || "").trim();
          const reporter = String(a?.reporterEmail || "").trim().toLowerCase();
          const dedupeKey = buildEmergencyDedupeKey(a);
          if (!isActiveAlert) {
            if (id) suppressAlert(id);
            const currentKey = normalizeAlertId(popupStateRef.current?.dedupeKey || popupStateRef.current?.alertId);
            if (dedupeKey && currentKey && dedupeKey === currentKey) {
              setSosPopup(null);
            }
            continue;
          }
          if (!dedupeKey) continue;
          if (!allowSelfEmergencyPopup && reporter && myEmail && reporter === myEmail.toLowerCase() && isTriggeredByCurrentBrowser()) continue;
          if (isAlertSuppressed(id)) continue;
          if (!isAlertForCurrentUser(a)) continue;
          const currentKey = normalizeAlertId(popupStateRef.current?.dedupeKey || popupStateRef.current?.alertId);
          if (currentKey && dedupeKey === currentKey) continue;
          seenEmergencyAlertsRef.current.add(dedupeKey);
          showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
            isEmergency: true,
            alertId: id,
            dedupeKey,
            reporterEmail: reporter,
            reporterUserId: a?.reporterUserId,
            liveUrl: a?.liveUrl || a?.streamUrl || a?.liveStreamUrl || a?.stream,
            navigateUrl: a?.navigateUrl || a?.locationUrl,
            mapsUrl: a?.mapsUrl,
            latitude: a?.latitude ?? a?.lastLocation?.latitude,
            longitude: a?.longitude ?? a?.lastLocation?.longitude,
            radiusMeters: a?.radiusMeters ?? a?.radius ?? a?.radiusKm
          });
          break;
        }
      } catch (err) {
        // keep polling; auth/session can recover later on mobile browsers
      }
    };

    pollEmergency();
    const timer = setInterval(pollEmergency, Math.max(1200, SOS_EMERGENCY_POLL_MS));
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [myUserId, location.pathname]);

  useEffect(() => {
    const authToken =
      sessionStorage.getItem("accessToken") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      "";
    if (!authToken || authToken === "null" || authToken === "undefined") return undefined;
    let disposed = false;

    const pollEmergencyNotifications = async () => {
      try {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (isTriggeredByCurrentBrowser()) return;
        const res = await api.get("/api/notifications", {
          suppressAuthRedirect: true,
          skipAuth: false,
          timeout: 4500,
          params: { limit: 50 }
        });
        if (disposed) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        const emergencyCandidates = list
          .filter((item) => isEmergencyNotification(item))
          .sort((a, b) => {
            const aTime = new Date(a?.createdAt || 0).getTime();
            const bTime = new Date(b?.createdAt || 0).getTime();
            return bTime - aTime;
          });
        const emergency = emergencyCandidates.find((item) => !item?.read) || emergencyCandidates[0];
        if (!emergency) return;
        if (myEmail) {
          if (
            !allowSelfEmergencyPopup &&
            String(emergency?.actorEmail || "").trim().toLowerCase() === myEmail.toLowerCase() &&
            isTriggeredByCurrentBrowser()
          ) {
            return;
          }
        }
        const notifId = String(emergency?.id || "").trim();
        const createdAtMs = new Date(emergency?.createdAt || 0).getTime();
        let resolvedAlertId = resolveNotificationAlertId(emergency);
        if (!resolvedAlertId && activeAlertIdsRef.current.size === 1) {
          resolvedAlertId = Array.from(activeAlertIdsRef.current)[0] || "";
        }
        const notifAlertId = String(resolvedAlertId || emergency?.alertId || emergency?.id || "").trim();
        if (notifAlertId && activeAlertIdsRef.current.size > 0 && !activeAlertIdsRef.current.has(notifAlertId)) {
          if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 2 * 60 * 1000) {
            return;
          }
        }
        if (isAlertSuppressed(notifAlertId) || isAlertSuppressed(notifId)) return;
        if (emergency?.read) return;
        if (notifId && notifId === lastEmergencyNotificationIdRef.current) return;
        if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 30 * 60 * 1000) return;

        lastEmergencyNotificationIdRef.current = notifId || "";
        try {
          sessionStorage.setItem(SOS_LAST_NOTIFICATION_ID_KEY, notifId || "");
        } catch {
          // ignore storage issues
        }

        showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
          isEmergency: true,
          alertId: notifAlertId || undefined,
          dedupeKey: notifAlertId || notifId || emergency?.alertId,
          reporterEmail: emergency?.actorEmail,
          reporterUserId: emergency?.actorUserId,
          liveUrl: emergency?.liveUrl,
          navigateUrl: emergency?.navigateUrl,
          mapsUrl: emergency?.mapsUrl
        });
      } catch {
        // ignore notification polling errors
      }
    };

    pollEmergencyNotifications();
    const timer = setInterval(pollEmergencyNotifications, Math.max(2500, SOS_NOTIFICATION_POLL_MS));
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [myEmail, myUserId]);

  useEffect(() => {
    const authToken =
      sessionStorage.getItem("accessToken") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      "";
    if (!authToken || authToken === "null" || authToken === "undefined") return undefined;
    if (!myEmail) return undefined;
    let disposed = false;

    const stripTrailingPunct = (value) => String(value || "").replace(/[),.;]+$/g, "");
    const extractFirstUrl = (text, predicate) => {
      const urls = String(text || "").match(/https?:\/\/\S+/gi) || [];
      for (const url of urls) {
        const cleaned = stripTrailingPunct(url);
        if (predicate(cleaned)) return cleaned;
      }
      return "";
    };
    const extractFirstEmail = (text) => {
      const match = String(text || "").match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
      return match?.[0] ? String(match[0]).trim().toLowerCase() : "";
    };

    const disconnect = connectUserNotifications(myEmail, (payload) => {
      if (disposed) return;
      if (!payload || typeof payload !== "object") return;
      if (!isEmergencyNotification(payload)) return;
      if (payload?.read) return;
      if (isTriggeredByCurrentBrowser()) return;

      const notifId = String(payload?.id || "").trim();
      if (notifId && notifId === lastEmergencyNotificationIdRef.current) return;

      const createdAtMs = new Date(payload?.createdAt || 0).getTime();
      if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 30 * 60 * 1000) return;

      const rawMessage = String(payload?.message || payload?.title || "").trim();
      if (!rawMessage) return;

      const liveUrl = extractFirstUrl(rawMessage, (url) => /\/sos\/live\//i.test(url));
      const navigateUrl = extractFirstUrl(rawMessage, (url) => /\/sos\/navigate\//i.test(url));
      const mapsUrl = extractFirstUrl(rawMessage, (url) => /maps\.google\.com|google\.com\/maps/i.test(url));
      const reporterEmail = extractFirstEmail(rawMessage);
      const alertId = extractAlertIdFromUrl(liveUrl) || extractAlertIdFromUrl(navigateUrl) || "";

      lastEmergencyNotificationIdRef.current = notifId || "";
      try {
        sessionStorage.setItem(SOS_LAST_NOTIFICATION_ID_KEY, notifId || "");
      } catch {
        // ignore storage issues
      }

      showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
        isEmergency: true,
        alertId: alertId || undefined,
        dedupeKey: alertId || notifId || undefined,
        reporterEmail: reporterEmail || undefined,
        liveUrl: liveUrl || undefined,
        navigateUrl: navigateUrl || undefined,
        mapsUrl: mapsUrl || undefined
      });
    });

    return () => {
      disposed = true;
      try {
        disconnect?.();
      } catch {
        // ignore teardown errors
      }
    };
  }, [myEmail]);

  useEffect(() => {
    if (!trafficAlertsEnabled) return undefined;
    const authToken =
      sessionStorage.getItem("accessToken") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token") ||
      "";
    if (!authToken || authToken === "null" || authToken === "undefined") return undefined;

    let disposed = false;

    const stripUrls = (value) =>
      String(value || "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const isTrafficNotification = (item) => {
      const kind = String(item?.kind || "").toLowerCase();
      const type = String(item?.type || "").toLowerCase();
      if (kind === "traffic" || type === "traffic") return true;
      const title = String(item?.title || "");
      const message = String(item?.message || "");
      return /give way|ambulance nearby|traffic alert/i.test(`${title} ${message}`);
    };

    const pollTrafficNotifications = async () => {
      try {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        // Don't stack above the emergency SOS popup.
        if (popupStateRef.current?.isEmergency) return;

        const res = await api.get("/api/notifications", {
          suppressAuthRedirect: true,
          skipAuth: false,
          timeout: 4500,
          params: { limit: 50 }
        });
        if (disposed) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        const trafficCandidates = list
          .filter((item) => isTrafficNotification(item))
          .sort((a, b) => {
            const aTime = new Date(a?.createdAt || 0).getTime();
            const bTime = new Date(b?.createdAt || 0).getTime();
            return bTime - aTime;
          });

        const traffic = trafficCandidates.find((item) => !item?.read) || null;
        if (!traffic || traffic?.read) return;

        const notifId = String(traffic?.id || "").trim();
        if (!notifId) return;
        if (notifId === lastTrafficNotificationIdRef.current) return;

        const createdAtMs = new Date(traffic?.createdAt || 0).getTime();
        if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 15 * 60 * 1000) return;

        lastTrafficNotificationIdRef.current = notifId;
        try {
          sessionStorage.setItem(TRAFFIC_LAST_NOTIFICATION_ID_KEY, notifId);
        } catch {
          // ignore storage errors
        }

        const mapsUrl = String(traffic?.mapsUrl || traffic?.routeUrl || traffic?.spotUrl || "").trim();
        const routeUrl = String(traffic?.routeUrl || "").trim();
        const spotUrl = String(traffic?.spotUrl || "").trim();
        const title = String(traffic?.title || "Ambulance Nearby").trim() || "Ambulance Nearby";
        const text =
          stripUrls(traffic?.message) ||
          "Ambulance approaching nearby. Please give way.";

        setTrafficPopup({
          id: notifId,
          title,
          text,
          mapsUrl,
          routeUrl,
          spotUrl
        });
      } catch {
        // ignore traffic notification polling errors
      }
    };

    pollTrafficNotifications();
    const timer = setInterval(pollTrafficNotifications, Math.max(3000, TRAFFIC_NOTIFICATION_POLL_MS));
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [trafficAlertsEnabled, myEmail, myUserId]);

  useEffect(() => {
    let disposed = false;

    const forceFromActiveSession = () => {
      try {
        const raw = localStorage.getItem(SOS_SESSION_KEY);
        if (!raw) {
          return;
        }
        const session = JSON.parse(raw);
        if (!isSessionActive(session)) {
          sosEmergencyMissesRef.current = 3;
          sosPopupStickyRef.current = false;
          sosPopupStickyIdRef.current = "";
          const stoppedId = normalizeAlertId(session?.alertId || session?.alertDisplayId);
          const isOwnStoppedSession =
            isOwnBrowserSession(session) ||
            isOwnEmergency({ reporterEmail: session?.reporterEmail, reporterUserId: session?.reporterUserId });
          if (isOwnStoppedSession) {
            setSosPopup(null);
            return;
          }
          const currentId = normalizeAlertId(popupStateRef.current?.alertId);
          if (!currentId || !stoppedId || currentId === stoppedId) setSosPopup(null);
          return;
        }
        const fallbackAlertId = session?.alertId || session?.alertDisplayId || "";
        if (isAlertSuppressed(fallbackAlertId)) return;
        if (disposed) return;
        sosEmergencyMissesRef.current = 0;
        showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
          isEmergency: true,
          alertId: fallbackAlertId || undefined,
          dedupeKey: fallbackAlertId || "session_active",
          reporterEmail: session?.reporterEmail,
          reporterUserId: session?.reporterUserId,
          latitude: session?.lastLocation?.latitude,
          longitude: session?.lastLocation?.longitude
        });
      } catch {
        // ignore parsing/storage issues
      }
    };

    forceFromActiveSession();
    const timer = setInterval(forceFromActiveSession, 1200);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [location.pathname, isOnSosRoute]);

  const stopCameraStream = () => {
    const stream = cameraStreamRef.current;
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
    }
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  };

  const closeCameraStudio = () => {
    setCameraOpen(false);
    setCameraReady(false);
    setCameraLoading(false);
    setCameraSettingsOpen(false);
    setCapturePreview(null);
    setCaptureBusy(false);
    setFaceBox(null);
    setCameraError("");
    setSnapTextOpen(false);
    setTorchOn(false);
    stopCameraStream();
  };

  const openCameraStudio = async (forcedFacing, options = {}) => {
    const { forceOpen = false } = options;
    if (cameraOpen && !forceOpen) {
      closeCameraStudio();
      return;
    }
    if (cameraOpen && forceOpen) {
      stopCameraStream();
      setCameraReady(false);
      setCameraLoading(true);
      setCapturePreview(null);
    }
    setCameraError("");
    setCameraReady(false);
    setCameraLoading(true);
    setCameraBusy(true);
    setCameraOpen(true);
    try {
      const isSecure =
        window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      if (!isSecure) {
        throw new Error("Camera needs HTTPS. Open this site with https:// or localhost.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera is not supported in this browser.");
      }
      const getCameraStream = async (facingMode, preferHighRes = true) => {
        const preferred = String(facingMode || "user");
        const targetWidth = preferHighRes ? 1280 : 640;
        const targetHeight = preferHighRes ? 720 : 480;
        const exactConstraints = {
          audio: false,
          video: { facingMode: { exact: preferred }, width: { ideal: targetWidth }, height: { ideal: targetHeight } }
        };
        const idealConstraints = {
          audio: false,
          video: { facingMode: preferred, width: { ideal: targetWidth }, height: { ideal: targetHeight } }
        };
        try {
          return await navigator.mediaDevices.getUserMedia(exactConstraints);
        } catch {
          try {
            return await navigator.mediaDevices.getUserMedia(idealConstraints);
          } catch {
            return await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          }
        }
      };
      const facing = forcedFacing || cameraFacing;
      const stream = await getCameraStream(facing, cameraHighResRef.current);
      cameraStreamRef.current = stream;
      requestAnimationFrame(() => {
        const video = cameraVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        video.onloadedmetadata = () => {
          setCameraReady(true);
        };
        video.onloadeddata = () => {
          setCameraReady(true);
        };
        video.play?.()
          .then(() => setCameraReady(true))
          .catch(() => {
            setCameraError("Tap the video area once to start the camera.");
          });
      });
    } catch (err) {
      const msg = String(err?.message || "");
      if (/notallowed|denied|permission/i.test(msg)) {
        setCameraError("Camera permission blocked. Allow camera access and try again.");
      } else if (/notfound|no device/i.test(msg)) {
        setCameraError("No camera device found.");
      } else if (msg) {
        setCameraError(msg);
      } else {
        setCameraError("Camera access denied or unavailable.");
      }
      setCameraReady(false);
    } finally {
      setCameraBusy(false);
      setCameraLoading(false);
    }
  };

  useEffect(() => {
    window.__ssOpenCameraStudio = (payload = {}) => {
      openCameraStudio(payload?.facing, { forceOpen: true });
    };
    return () => {
      if (window.__ssOpenCameraStudio) delete window.__ssOpenCameraStudio;
    };
  }, [openCameraStudio]);

  useEffect(() => () => {
    const stream = cameraStreamRef.current;
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
    }
    cameraStreamRef.current = null;
  }, []);

  const applyTorch = async (enabled) => {
    const stream = cameraStreamRef.current;
    const track = stream?.getVideoTracks?.()[0];
    if (!track || typeof track.applyConstraints !== "function") return false;
    const caps = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
    if (!caps || !caps.torch) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: Boolean(enabled) }] });
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!cameraOpen) return;
    void applyTorch(torchOn);
  }, [torchOn, cameraOpen]);

  const activeLens = SNAP_LENSES.find((x) => x.id === activeLensId) || SNAP_LENSES[0];
  const cameraFilterCss = activeLens?.filter || "none";
  const activeEmojiPack =
    EMOJI_PACKS.find((pack) => pack.id === emojiPackId) || EMOJI_PACKS[0];

  const getEmojiOverlayItems = () => {
    const pack = activeEmojiPack || EMOJI_PACKS[0];
    const emojis = pack?.emojis || ["✨"];
    const baseOffsets = [
      { x: -0.18, y: -0.2 },
      { x: 0, y: -0.26 },
      { x: 0.18, y: -0.2 },
      { x: -0.22, y: -0.05 },
      { x: 0.22, y: -0.05 },
      { x: -0.12, y: 0.1 },
      { x: 0.12, y: 0.1 }
    ];
    return baseOffsets.map((offset, idx) => ({
      key: `${pack.id}-${idx}`,
      emoji: emojis[idx % emojis.length],
      offset
    }));
  };

  const normalizeFaceBox = (faceLike, video) => {
    const box = faceLike?.boundingBox || faceLike;
    if (!box || !video) return null;
    const videoWidth = Number(video.videoWidth || 0);
    const videoHeight = Number(video.videoHeight || 0);
    if (!videoWidth || !videoHeight) return null;
    const x = Number(box.x ?? box.left ?? 0);
    const y = Number(box.y ?? box.top ?? 0);
    const width = Number(box.width ?? 0);
    const height = Number(box.height ?? 0);
    if (!width || !height) return null;
    return { x, y, width, height, videoWidth, videoHeight };
  };

  useEffect(() => {
    if (!cameraOpen || !cameraReady) return undefined;
    if (typeof window === "undefined" || !("FaceDetector" in window)) return undefined;

    let cancelled = false;
    const detector =
      faceDetectorRef.current || new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    faceDetectorRef.current = detector;

    const detectLoop = async () => {
      if (cancelled) return;
      const video = cameraVideoRef.current;
      if (!video || video.readyState < 2) {
        faceDetectTimerRef.current = window.setTimeout(detectLoop, 300);
        return;
      }
      try {
        const faces = await detector.detect(video);
        const face = faces && faces.length ? faces[0] : null;
        const normalized = normalizeFaceBox(face, video);
        setFaceBox(normalized || null);
        if (normalized && autoEmojiRotate) {
          const cx = normalized.x + normalized.width / 2;
          const cy = normalized.y + normalized.height / 2;
          const size = normalized.width * normalized.height;
          const last = faceMotionRef.current;
          const dx = Math.abs(cx - last.x);
          const dy = Math.abs(cy - last.y);
          const ds = Math.abs(size - last.size);
          faceMotionRef.current = { x: cx, y: cy, size };
          if (dx + dy + ds * 0.00002 > 10) {
            const packChoices = activeLens?.emojiPackIds || EMOJI_PACKS.map((p) => p.id);
            const nextId = packChoices[Math.floor(Math.random() * packChoices.length)] || "kawaii";
            setEmojiPackId(nextId);
          }
        }
      } catch {
        setFaceBox(null);
      }
      faceDetectTimerRef.current = window.setTimeout(detectLoop, 260);
    };

    detectLoop();
    return () => {
      cancelled = true;
      if (faceDetectTimerRef.current) {
        clearTimeout(faceDetectTimerRef.current);
        faceDetectTimerRef.current = 0;
      }
    };
  }, [cameraOpen, cameraReady, autoEmojiRotate, activeLens?.id]);

  useEffect(() => {
    if (!cameraOpen || !autoEmojiRotate || activeLens?.maskType !== "emoji-float") return undefined;
    const packChoices = activeLens?.emojiPackIds || EMOJI_PACKS.map((p) => p.id);
    if (!packChoices.length) return undefined;
    const timer = setInterval(() => {
      const nextId = packChoices[Math.floor(Math.random() * packChoices.length)] || "kawaii";
      setEmojiPackId(nextId);
    }, 2600);
    return () => clearInterval(timer);
  }, [cameraOpen, activeLens?.id, autoEmojiRotate]);

  useEffect(() => {
    if (!snapTextOpen) return undefined;
    const timer = setTimeout(() => {
      snapTextInputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [snapTextOpen]);

  const handleSnapTool = (toolId) => {
    if (toolId === "text") {
      setSnapTextOpen((prev) => !prev);
      return;
    }
    if (toolId === "loop") {
      setAutoEmojiRotate((prev) => !prev);
      return;
    }
    if (toolId === "sparkle") {
      setSparkleOn((prev) => !prev);
      return;
    }
    if (toolId === "flip") {
      const next = cameraFacing === "user" ? "environment" : "user";
      setCameraFacing(next);
      if (cameraOpen) {
        void openCameraStudio(next, { forceOpen: true });
      }
    }
  };

  const buildCaptureFileName = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `socialsea-${stamp}.jpg`;
  };

  const captureSnapshot = async () => {
    if (captureBusy) return;
    setCaptureBusy(true);
    setCameraError("");
    try {
      const video = cameraVideoRef.current;
      if (!video || video.readyState < 2) {
        setCameraError("Camera not ready yet.");
        return;
      }
      const width = Number(video.videoWidth || 0) || 720;
      const height = Number(video.videoHeight || 0) || 1280;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCameraError("Could not capture photo.");
        return;
      }
      const shouldMirror = cameraFacing === "user" && cameraMirrorFront;
      ctx.save();
      if (shouldMirror) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      if (cameraFilterCss && cameraFilterCss !== "none") {
        ctx.filter = cameraFilterCss;
      }
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();

      if (snapText) {
        ctx.save();
        ctx.filter = "none";
        ctx.fillStyle = snapTextColor || "#ffffff";
        ctx.font = `${Math.max(18, Number(snapTextSize) || 28)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(snapText, width / 2, height - 36);
        ctx.restore();
      }

      const fileName = buildCaptureFileName();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const file = blob ? new File([blob], fileName, { type: "image/jpeg" }) : null;
      setCapturePreview({ dataUrl, blob, file, fileName, createdAt: Date.now() });
    } finally {
      setCaptureBusy(false);
    }
  };

  const downloadCapture = () => {
    if (!capturePreview?.blob) return;
    const url = URL.createObjectURL(capturePreview.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = capturePreview.fileName || "socialsea-photo.jpg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shareCapture = async () => {
    try {
      if (!capturePreview) return;
      if (navigator.share && capturePreview.file) {
        await navigator.share({
          files: [capturePreview.file],
          title: "SocialSea Photo"
        });
        return;
      }
      setCameraError("Sharing is not supported on this device.");
    } catch (err) {
      setCameraError(err?.message || "Sharing failed.");
    }
  };

  const clearCapture = () => {
    setCapturePreview(null);
  };

  const openGalleryPicker = () => {
    galleryInputRef.current?.click();
  };

  const handleGalleryPick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setCapturePreview({ dataUrl, blob: file, file, fileName: file.name, createdAt: Date.now() });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const toggleTorch = async () => {
    const next = !torchOn;
    setTorchOn(next);
    if (next) {
      const ok = await applyTorch(true);
      if (!ok) {
        setTorchOn(false);
        setCameraError("Flash/torch not supported on this device.");
      }
    } else {
      await applyTorch(false);
    }
  };

  const switchCamera = async () => {
    const next = cameraFacing === "user" ? "environment" : "user";
    setCameraFacing(next);
    if (cameraOpen) {
      await openCameraStudio(next, { forceOpen: true });
    }
  };

  const toggleCameraSettings = () => {
    setCameraSettingsOpen((prev) => !prev);
  };

  const toggleHighRes = (next) => {
    cameraHighResRef.current = next;
    setCameraHighRes(next);
    if (cameraOpen) {
      void openCameraStudio(cameraFacing, { forceOpen: true });
    }
  };

  const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  useEffect(() => {
    const handler = () => {
      void openCameraStudio();
    };
    window.addEventListener("ss:open-camera", handler);
    return () => window.removeEventListener("ss:open-camera", handler);
  }, [openCameraStudio]);

  const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const r = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
  };

  const resolveRadiusMeters = (alertLike = {}) => {
    const rawMeters = toFiniteNumber(alertLike?.radiusMeters ?? alertLike?.radius);
    if (rawMeters != null) return rawMeters;
    const rawKm = toFiniteNumber(alertLike?.radiusKm ?? alertLike?.radius_km);
    if (rawKm != null) return rawKm * 1000;
    return 5000;
  };

  const buildEmergencyQueryParams = () => {
    const user = sosUserLocationRef.current;
    const lat = toFiniteNumber(user?.latitude);
    const lon = toFiniteNumber(user?.longitude);
    if (lat == null || lon == null) return null;
    const radiusMeters = 5000;
    const radiusKm = radiusMeters / 1000;
    return {
      lat,
      lon,
      latitude: lat,
      longitude: lon,
      radiusMeters,
      radiusKm
    };
  };

  const isAlertForCurrentUser = (alertLike = {}) => {
    const nearby = Array.isArray(alertLike?.nearbyUsers) ? alertLike.nearbyUsers : [];
    if (nearby.length > 0) {
      const matched = nearby.some((u) => {
        const uid = String(u?.id || u?.userId || "").trim();
        const email = String(u?.email || u?.reporterEmail || u?.userEmail || "").trim().toLowerCase();
        const name = String(u?.name || u?.username || "").trim().toLowerCase();
        if (myUserId && uid && uid === String(myUserId)) return true;
        if (myEmail && email && email === String(myEmail).toLowerCase()) return true;
        if (!myUserId && !myEmail && myName && name && name === myName.toLowerCase()) return true;
        if (!myUserId && !myEmail && myUsername && name && name === myUsername) return true;
        return false;
      });
      if (matched) return true;
      const user = sosUserLocationRef.current;
      if (user?.latitude != null && user?.longitude != null) {
        return isWithinSosRadius(alertLike);
      }
      return true;
    }
    return isWithinSosRadius(alertLike);
  };

  const isWithinSosRadius = (alertLike = {}) => {
    const user = sosUserLocationRef.current;
    const userLat = toFiniteNumber(user?.latitude);
    const userLon = toFiniteNumber(user?.longitude);
    const alertLat = toFiniteNumber(alertLike?.latitude ?? alertLike?.lat ?? alertLike?.lastLocation?.latitude);
    const alertLon = toFiniteNumber(alertLike?.longitude ?? alertLike?.lon ?? alertLike?.lastLocation?.longitude);
    if (userLat == null || userLon == null || alertLat == null || alertLon == null) return true;
    const radius = resolveRadiusMeters(alertLike);
    const distance = haversineDistanceMeters(userLat, userLon, alertLat, alertLon);
    return distance <= radius;
  };

  const normalizeAlertId = (value) => String(value || "").trim();
  const buildEmergencyDedupeKey = (alertLike = {}) => {
    const id = normalizeAlertId(alertLike?.alertId || alertLike?.alertDisplayId);
    if (id) return id;
    const reporter =
      String(alertLike?.reporterUserId || "").trim() ||
      String(alertLike?.reporterEmail || "").trim().toLowerCase() ||
      "unknown";
    const startedAt =
      String(alertLike?.startedAt || alertLike?.createdAt || alertLike?.at || "").trim();
    if (startedAt) {
      return `active_${reporter}_${startedAt}`.replace(/\s+/g, "_");
    }
    const lat = String(alertLike?.latitude ?? alertLike?.lastLocation?.latitude ?? "").trim();
    const lon = String(alertLike?.longitude ?? alertLike?.lastLocation?.longitude ?? "").trim();
    return `active_${reporter}_${lat}_${lon}`.replace(/\s+/g, "_");
  };

  const isEmergencyNotification = (item) => {
    const kind = String(item?.kind || "").toLowerCase();
    const type = String(item?.type || "").toLowerCase();
    if (kind === "emergency" || type === "emergency") return true;
    const title = String(item?.title || "");
    const message = String(item?.message || "");
    return /sos|emergency|panic|alert nearby/i.test(`${title} ${message}`);
  };

  const resolveNotificationAlertId = (emergency) => {
    const direct = String(emergency?.alertId || "").trim();
    if (direct) return direct;
    const fromLive = extractAlertIdFromUrl(emergency?.liveUrl);
    if (fromLive) return fromLive;
    const fromNavigate = extractAlertIdFromUrl(emergency?.navigateUrl);
    if (fromNavigate) return fromNavigate;
    return "";
  };
  const readOwnStoppedSessionState = () => {
    try {
      const raw = localStorage.getItem(SOS_SESSION_KEY);
      if (!raw) return { isOwnStopped: false, isRecentOwnStop: false, alertId: "" };
      const session = JSON.parse(raw);
      const isOwn =
        isOwnBrowserSession(session) ||
        isOwnEmergency({ reporterEmail: session?.reporterEmail, reporterUserId: session?.reporterUserId });
      if (!isOwn || isSessionActive(session)) return { isOwnStopped: false, isRecentOwnStop: false, alertId: "" };
      const updatedMs = new Date(session?.updatedAt || session?.stoppedAt || "").getTime();
      const isRecent = Number.isFinite(updatedMs) && Date.now() - updatedMs < 120000;
      return {
        isOwnStopped: true,
        isRecentOwnStop: Boolean(isRecent),
        alertId: normalizeAlertId(session?.alertId || session?.alertDisplayId)
      };
    } catch {
      return { isOwnStopped: false, isRecentOwnStop: false, alertId: "" };
    }
  };

  const isTriggeredByCurrentBrowser = () => {
    try {
      const raw = localStorage.getItem(SOS_SESSION_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw);
      if (!session?.triggeredByCurrentBrowser || !isSessionActive(session)) return false;
      const currentKnown = Boolean(myUserId || myEmail);
      if (!currentKnown) return true;
      return matchesCurrentSessionUser(session);
    } catch {
      return false;
    }
  };

  const persistSuppressedAlerts = () => {
    try {
      sessionStorage.setItem(
        SOS_SUPPRESSED_ALERTS_KEY,
        JSON.stringify(Array.from(suppressedAlertIdsRef.current).slice(-500))
      );
      const entries = Object.entries(suppressedAlertAtRef.current || {})
        .slice(-500)
        .reduce((acc, [key, value]) => {
          const id = String(key || "").trim();
          const ts = Number(value);
          if (!id || !Number.isFinite(ts) || ts <= 0) return acc;
          acc[id] = ts;
          return acc;
        }, {});
      sessionStorage.setItem(SOS_SUPPRESSED_ALERTS_AT_KEY, JSON.stringify(entries));
    } catch {
      // ignore storage issues
    }
  };

  const unsuppressAlert = (alertId) => {
    const id = normalizeAlertId(alertId);
    if (!id) return;
    suppressedAlertIdsRef.current.delete(id);
    delete suppressedAlertAtRef.current[id];
    persistSuppressedAlerts();
  };

  const isAlertSuppressed = (alertId) => {
    const id = normalizeAlertId(alertId);
    if (!id || !suppressedAlertIdsRef.current.has(id)) return false;
    const suppressedAt = Number(suppressedAlertAtRef.current?.[id] || 0);
    if (!Number.isFinite(suppressedAt) || suppressedAt <= 0) {
      // Legacy suppressed entries without timestamps should not block new SOS forever.
      unsuppressAlert(id);
      return false;
    }
    if (Date.now() - suppressedAt > SOS_ALERT_SUPPRESS_TTL_MS) {
      unsuppressAlert(id);
      return false;
    }
    return true;
  };

  const isAlertSeen = (alertId) => {
    const id = normalizeAlertId(alertId);
    return Boolean(id) && seenAlertIdsRef.current.has(id);
  };

  const markAlertSeen = (alertId) => {
    const id = normalizeAlertId(alertId);
    if (!id) return;
    seenAlertIdsRef.current.add(id);
    try {
      sessionStorage.setItem(
        SOS_SEEN_ALERTS_KEY,
        JSON.stringify(Array.from(seenAlertIdsRef.current).slice(-1000))
      );
    } catch {
      // ignore storage issues
    }
  };

  const suppressAlert = (alertId) => {
    const id = normalizeAlertId(alertId);
    if (!id) return;
    markAlertSeen(id);
    suppressedAlertIdsRef.current.add(id);
    suppressedAlertAtRef.current[id] = Date.now();
    persistSuppressedAlerts();
  };

  const buildSosPopupPayload = (message, options = {}) => {
    const text = String(message || "").trim();
    const idText = String(options.alertId || "").trim();
    const lat = toFiniteNumber(options.latitude);
    const lon = toFiniteNumber(options.longitude);
    const origin = typeof window !== "undefined" ? String(window.location.origin || "").replace(/\/+$/, "") : "";

    const liveUrl = normalizeLiveUrl(options.liveUrl, idText);
    const navParams = new URLSearchParams();
    if (lat != null) navParams.set("lat", String(lat));
    if (lon != null) navParams.set("lon", String(lon));
    if (options.reporterEmail) navParams.set("reporter", String(options.reporterEmail));
    if (liveUrl) navParams.set("live", liveUrl);
    if (options.mapsUrl) navParams.set("maps", String(options.mapsUrl));
    const localNavigateUrl =
      idText || lat != null || lon != null
        ? `${origin}/sos/navigate/${encodeURIComponent(idText || "active")}${navParams.toString() ? `?${navParams.toString()}` : ""}`
        : "";
    const locationUrl =
      String(options.locationUrl || "").trim() ||
      localNavigateUrl ||
      String(options.navigateUrl || "").trim() ||
      String(options.mapsUrl || "").trim() ||
      (lat != null && lon != null ? `https://www.google.com/maps?q=${lat},${lon}` : "");

    return {
      text,
      alertId: idText || "",
      dedupeKey: String(options?.dedupeKey || idText || "").trim(),
      isEmergency:
        Boolean(options.isEmergency) ||
        /\bemergency\b/i.test(text) ||
        /\btriggered\s+sos\b/i.test(text) ||
        /\bsos\s+is\s+active\b/i.test(text),
      showActions:
        (Boolean(options.isEmergency) || /^\s*\[EMERGENCY\]/i.test(text)) &&
        Boolean(idText || liveUrl || locationUrl),
      liveUrl,
      locationUrl
    };
  };

  const showSosPopup = (message, options = {}) => {
    const nextPopup = buildSosPopupPayload(message, options);
    const routeAlertMatch = String(location.pathname || "").match(/\/sos\/(?:live|navigate)\/([^/]+)/i);
    const routeAlertId = normalizeAlertId(routeAlertMatch?.[1]);
    const nextKey = normalizeAlertId(nextPopup?.dedupeKey || nextPopup?.alertId);
    const popupAlertId = normalizeAlertId(
      nextPopup?.alertId ||
        extractAlertIdFromUrl(nextPopup?.liveUrl) ||
        extractAlertIdFromUrl(nextPopup?.locationUrl)
    );
    const reporterEmail = String(options?.reporterEmail || "").trim().toLowerCase();
    const reporterUserId = String(options?.reporterUserId || "").trim();
    const popupAlertKey = normalizeAlertId(nextPopup?.alertId || nextPopup?.dedupeKey || popupAlertId);
    const isOwnReporter =
      (reporterEmail && myEmail && reporterEmail === myEmail.toLowerCase()) ||
      (reporterUserId && myUserId && reporterUserId === myUserId);
    if (
      nextPopup?.isEmergency &&
      routeAlertId &&
      ((nextKey && routeAlertId === nextKey) || (popupAlertId && routeAlertId === popupAlertId))
    ) {
      suppressAlert(routeAlertId);
      setSosPopup(null);
      return;
    }
    if (nextPopup?.isEmergency && !allowSelfEmergencyPopup && isOwnReporter) {
      if (popupAlertKey) suppressAlert(popupAlertKey);
      setSosPopup(null);
      return;
    }
    if (nextPopup?.isEmergency && isTriggeredByCurrentBrowser()) {
      setSosPopup(null);
      return;
    }
    if (nextPopup?.isEmergency && ownSosStopUntilRef.current > Date.now()) {
      setSosPopup(null);
      return;
    }
    const ownStopped = readOwnStoppedSessionState();
    const ownAlertKey = normalizeAlertId(ownStopped.alertId);
    const matchesOwnReporter =
      (reporterEmail && myEmail && reporterEmail === myEmail.toLowerCase()) ||
      (reporterUserId && myUserId && reporterUserId === myUserId);
    const matchesOwnAlert = ownAlertKey && popupAlertKey && ownAlertKey === popupAlertKey;
    if (
      nextPopup?.isEmergency &&
      !allowSelfEmergencyPopup &&
      ownStopped.isOwnStopped &&
      (matchesOwnAlert || matchesOwnReporter)
    ) {
      if (popupAlertKey) suppressAlert(popupAlertKey);
      setSosPopup(null);
      return;
    }
    if (
      nextPopup?.isEmergency &&
      ownStopped.isRecentOwnStop &&
      (!popupAlertKey || !ownAlertKey || popupAlertKey === ownAlertKey)
    ) {
      setSosPopup(null);
      return;
    }
    if (
      nextPopup?.isEmergency &&
      (isAlertSuppressed(nextPopup?.alertId) || isAlertSuppressed(nextPopup?.dedupeKey))
    ) {
      setSosPopup(null);
      return;
    }
    if (nextPopup?.isEmergency && !allowSelfEmergencyPopup) {
      if (reporterEmail && myEmail && reporterEmail === myEmail.toLowerCase() && isTriggeredByCurrentBrowser()) {
        setSosPopup(null);
        return;
      }
    }
    if (nextPopup?.isEmergency) {
      sosLastActiveAtRef.current = Date.now();
    }
    try {
      const alertId = String(options?.alertId || "").trim();
      const lat = toFiniteNumber(options?.latitude);
      const lon = toFiniteNumber(options?.longitude);
      if (alertId || lat != null || lon != null) {
        const raw = localStorage.getItem(SOS_NAV_CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        const key = alertId || `loc_${Date.now()}`;
        const normalizedLiveUrl = normalizeLiveUrl(options?.liveUrl, alertId);
        cache[key] = {
          alertId: alertId || null,
          latitude: lat,
          longitude: lon,
          reporterEmail: String(options?.reporterEmail || "").trim() || null,
          liveUrl: normalizedLiveUrl || null,
          navigateUrl: String(options?.navigateUrl || "").trim() || null,
          mapsUrl: String(options?.mapsUrl || "").trim() || null,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(SOS_NAV_CACHE_KEY, JSON.stringify(cache));
      }
    } catch {
      // ignore storage issues
    }
    const fingerprint = `${nextPopup?.dedupeKey || nextPopup?.alertId || ""}|${nextPopup?.text || ""}|${nextPopup?.locationUrl || ""}`;
    const now = Date.now();
    const last = popupMetaRef.current;
    const current = popupStateRef.current;
    const currentFingerprint = current
      ? `${current?.dedupeKey || current?.alertId || ""}|${current?.text || ""}|${current?.locationUrl || ""}`
      : "";
    if (nextPopup?.isEmergency && sosPopupStickyRef.current && popupStateRef.current?.isEmergency) {
      if (!nextKey || nextKey === sosPopupStickyIdRef.current) {
        return;
      }
    }
    if (fingerprint && (fingerprint === currentFingerprint || (fingerprint === last.fingerprint && now - last.shownAt < 1500))) {
      return;
    }
    popupMetaRef.current = { fingerprint, shownAt: now };
    setSosPopup((prev) => {
      const next = (() => {
        if (!prev) return nextPopup;
        if (!prev.isEmergency && nextPopup.isEmergency) return nextPopup;
        if (prev.isEmergency && nextPopup.isEmergency) {
          const prevKey = normalizeAlertId(prev.dedupeKey || prev.alertId);
          const nextKey = normalizeAlertId(nextPopup.dedupeKey || nextPopup.alertId);
          if (prevKey && nextKey && prevKey !== nextKey) return nextPopup;
          if (prev.dedupeKey && nextPopup.dedupeKey && prev.dedupeKey === nextPopup.dedupeKey) return prev;
          if (prev.alertId && nextPopup.alertId && prev.alertId === nextPopup.alertId) return prev;
          return prev;
        }
        if (prev.dedupeKey && nextPopup.dedupeKey && prev.dedupeKey === nextPopup.dedupeKey) return prev;
        return nextPopup;
      })();
      if (next?.isEmergency) {
        sosPopupStickyRef.current = true;
        sosPopupStickyIdRef.current = nextKey || "";
      }
      return next;
    });
  };

  const openPopupUrl = (url) => {
    const href = String(url || "").trim();
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const markNotificationRead = async (idText) => {
    const safeId = String(idText || "").trim();
    if (!safeId) return;
    const endpoints = [
      { method: "post", url: `/api/notifications/${encodeURIComponent(safeId)}/read` },
      { method: "post", url: `/api/notifications/read/${encodeURIComponent(safeId)}` },
      { method: "patch", url: `/api/notifications/${encodeURIComponent(safeId)}`, data: { read: true } }
    ];

    for (const ep of endpoints) {
      try {
        await api.request({
          ...ep,
          timeout: 4500,
          suppressAuthRedirect: true,
          skipAuth: false
        });
        return;
      } catch (err) {
        if (err?.response?.status === 404) continue;
      }
    }
  };

  const dismissTrafficPopup = async () => {
    const idText = String(trafficPopup?.id || "").trim();
    setTrafficPopup(null);
    if (idText) await markNotificationRead(idText);
  };

  const openTrafficPopupUrl = async (url) => {
    openPopupUrl(url);
    const idText = String(trafficPopup?.id || "").trim();
    setTrafficPopup(null);
    if (idText) await markNotificationRead(idText);
  };

  return (
    <header className={`ss-nav-wrap ${onChatConversationRoute ? "is-chat-conversation" : ""}`}>
      <nav className="ss-nav" aria-label="Main navigation">
        <Link to="/feed" className="ss-brand" aria-label="Go to feed">
          <img src="/logo.png?v=3" alt="SocialSea" className="ss-brand-logo" />
          <span className="ss-brand-text">SocialSea</span>
          <button
            type="button"
            className="ss-camera-btn"
            title="Open Camera Studio"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void openCameraStudio();
            }}
            disabled={cameraBusy}
          >
            <FiCamera />
          </button>
          {showSosInNavbar && (
            <button type="button" className="ss-sos-chip" title="Emergency SOS" onClick={onSosTap}>
              SOS
            </button>
          )}
        </Link>

        <div className={`ss-links ${showSosInNavbar ? "has-sos" : ""}`}>
          {showSosInNavbar && (
            <button
              type="button"
              className={`ss-sos-mobile ${sosActive ? "is-active" : ""}`}
              title={sosActive ? "Emergency SOS Active" : "Emergency SOS"}
              onClick={onSosTap}
            >
              SOS
            </button>
          )}
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.match(location.pathname);
            const isFeedItem = item.to === "/feed";
            const isProfileItem = item.to === profileTarget;
            const isChatItem = item.to === "/chat";
            const showChatUnread = isChatItem && chatUnreadCount > 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`ss-link ${active ? "is-active" : ""}`}
                title={showChatUnread ? `${item.label} (${chatUnreadCount > 99 ? "99+" : chatUnreadCount} unread)` : item.label}
                aria-current={active ? "page" : undefined}
              >
                <span className="ss-link-icon-wrap">
                  {isFeedItem ? (
                    <img src="/logo.png?v=3" alt="" className="ss-link-logo" aria-hidden="true" />
                  ) : isProfileItem && profileNavPic ? (
                    <img
                      src={profileNavPic}
                      alt="Profile"
                      className="ss-link-avatar"
                      onError={() => setProfileNavPic("")}
                    />
                  ) : (
                    <Icon className="ss-link-icon" />
                  )}
                  {showChatUnread && (
                    <span className="ss-link-chat-badge" aria-label={`${chatUnreadCount} unread chats`}>
                      {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                    </span>
                  )}
                </span>
                <span className="ss-link-text">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {incomingCall && (
        <div className="ss-call-banner" role="status" aria-live="polite">
          <span className="ss-call-dot" aria-hidden="true" />
          <div className="ss-call-text">
            Incoming {incomingCall.mode} call from <strong>{incomingCall.fromName}</strong>
          </div>
          <div className="ss-call-actions">
            <button type="button" className="ss-call-accept" onClick={acceptIncomingCall}>
              Accept
            </button>
            <button type="button" className="ss-call-open" onClick={openIncomingCall}>
              Open Chat
            </button>
            <button type="button" className="ss-call-decline" onClick={declineIncomingCall}>
              Decline
            </button>
          </div>
        </div>
      )}

      {sosPopup && (() => {
        const popupData = typeof sosPopup === "string" ? buildSosPopupPayload(sosPopup) : sosPopup;
        return (
          <div
            ref={sosPopupRef}
            className={`ss-sos-popup ${sosPopupPos ? "is-dragged" : ""}`}
            style={
              sosPopupPos
                ? {
                    left: `${sosPopupPos.x}px`,
                    top: `${sosPopupPos.y}px`,
                    right: "auto",
                    bottom: "auto",
                    transform: "none"
                  }
                : undefined
            }
            role="status"
            aria-live="polite"
          >
            <div
              className="ss-popup-handle"
              onPointerDown={startSosPopupDrag}
              onDoubleClick={resetSosPopupPos}
              title="Drag to move (double-click to reset)"
              aria-hidden="true"
            >
              <span className="ss-popup-grip" aria-hidden="true" />
            </div>
            <div className="ss-sos-popup-text">{popupData?.text}</div>
            {popupData?.showActions && (
              <div className="ss-sos-popup-actions">
                <button
                  type="button"
                  className="ss-sos-popup-btn"
                  onClick={() => openPopupUrl(popupData?.liveUrl)}
                  disabled={!popupData?.liveUrl}
                >
                  Open Live Video
                </button>
                <button
                  type="button"
                  className="ss-sos-popup-btn"
                  onClick={() => openPopupUrl(popupData?.locationUrl)}
                  disabled={!popupData?.locationUrl}
                >
                  Open Location
                </button>
                <button
                  type="button"
                  className="ss-sos-popup-btn ss-sos-popup-btn-cancel"
                  onClick={() => {
                    const alertKey = String(popupData?.alertId || "").trim();
                    const dedupeKey = String(popupData?.dedupeKey || "").trim();
                    if (alertKey) suppressAlert(alertKey);
                    if (dedupeKey) suppressAlert(dedupeKey);
                    setSosPopup(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {trafficPopup && (
        <div className="ss-traffic-popup" role="status" aria-live="polite">
          <div className="ss-traffic-popup-title">{trafficPopup.title || "Ambulance Nearby"}</div>
          <div className="ss-traffic-popup-text">{trafficPopup.text}</div>
          <div className="ss-traffic-popup-actions">
            <button
              type="button"
              className="ss-traffic-popup-btn"
              onClick={() => void openTrafficPopupUrl(trafficPopup.routeUrl || trafficPopup.mapsUrl)}
              disabled={!(trafficPopup.routeUrl || trafficPopup.mapsUrl)}
            >
              Open Route
            </button>
            <button
              type="button"
              className="ss-traffic-popup-btn"
              onClick={() => void openTrafficPopupUrl(trafficPopup.spotUrl || trafficPopup.mapsUrl)}
              disabled={!(trafficPopup.spotUrl || trafficPopup.mapsUrl)}
            >
              Open Spot
            </button>
            <button
              type="button"
              className="ss-traffic-popup-btn ss-traffic-popup-btn-cancel"
              onClick={() => void dismissTrafficPopup()}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="ss-camera-modal-backdrop" onClick={closeCameraStudio}>
          <section className="ss-snap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ss-snap-preview">
              <header className="ss-snap-topbar">
                <button type="button" className="ss-snap-icon-btn" onClick={closeCameraStudio} title="Close">
                  <FiX />
                </button>
                <button type="button" className="ss-snap-icon-btn" title="Flash" onClick={toggleTorch}>
                  <FiSlash />
                </button>
                <button
                  type="button"
                  className="ss-snap-icon-btn"
                  title="Settings"
                  onClick={toggleCameraSettings}
                >
                  <FiSettings />
                </button>
              </header>

              <div className="ss-snap-tools">
                {SNAP_TOOLS.map((tool) => {
                  const isActive =
                    (tool.id === "text" && snapTextOpen) ||
                    (tool.id === "loop" && autoEmojiRotate) ||
                    (tool.id === "sparkle" && sparkleOn);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`ss-snap-tool-btn ${isActive ? "is-active" : ""}`}
                      title={tool.title}
                      onClick={() => handleSnapTool(tool.id)}
                    >
                      {tool.label}
                    </button>
                  );
                })}
              </div>

              <div className="ss-camera-preview">
                <video
                  ref={cameraVideoRef}
                  className={`ss-camera-video ${cameraFacing === "user" && cameraMirrorFront ? "is-mirrored" : ""}`}
                  style={{ filter: cameraFilterCss }}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => setCameraReady(true)}
                  onClick={() => {
                    if (!cameraReady) {
                      const video = cameraVideoRef.current;
                      if (video) {
                        video.play?.().then(() => setCameraReady(true)).catch(() => {});
                      }
                    }
                  }}
                />
                {!cameraReady && (
                  <div className="ss-camera-overlay" aria-live="polite">
                    <div className="ss-camera-overlay-card">
                      <p>{cameraLoading ? "Starting camera..." : "Camera not ready yet."}</p>
                      <button type="button" onClick={() => void openCameraStudio()}>
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                {cameraError && (
                  <div className="ss-camera-overlay ss-camera-overlay-error" aria-live="polite">
                    <div className="ss-camera-overlay-card">
                      <p>{cameraError}</p>
                      <button type="button" onClick={() => void openCameraStudio()}>
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                {cameraGridOn && <div className="ss-camera-grid" aria-hidden="true" />}
                {capturePreview && (
                  <div className="ss-camera-capture-preview" aria-live="polite">
                    <img src={capturePreview.dataUrl} alt="Captured" />
                    <div className="ss-camera-capture-actions">
                      <button type="button" onClick={downloadCapture}>Save</button>
                      <button type="button" onClick={shareCapture}>Share</button>
                      <button type="button" onClick={clearCapture}>Retake</button>
                    </div>
                  </div>
                )}
                {cameraSettingsOpen && (
                  <div className="ss-camera-settings-panel">
                    <h4>Camera Settings</h4>
                    <label className="ss-camera-setting">
                      <span>High Quality</span>
                      <input
                        type="checkbox"
                        checked={cameraHighRes}
                        onChange={(e) => toggleHighRes(e.target.checked)}
                      />
                    </label>
                    <label className="ss-camera-setting">
                      <span>Mirror Front Camera</span>
                      <input
                        type="checkbox"
                        checked={cameraMirrorFront}
                        onChange={(e) => setCameraMirrorFront(e.target.checked)}
                      />
                    </label>
                    <label className="ss-camera-setting">
                      <span>Grid Lines</span>
                      <input
                        type="checkbox"
                        checked={cameraGridOn}
                        onChange={(e) => setCameraGridOn(e.target.checked)}
                      />
                    </label>
                    <label className="ss-camera-setting">
                      <span>Auto Emoji</span>
                      <input
                        type="checkbox"
                        checked={autoEmojiRotate}
                        onChange={(e) => setAutoEmojiRotate(e.target.checked)}
                      />
                    </label>
                    <label className="ss-camera-setting">
                      <span>Sparkle</span>
                      <input
                        type="checkbox"
                        checked={sparkleOn}
                        onChange={(e) => setSparkleOn(e.target.checked)}
                      />
                    </label>
                    <label className="ss-camera-setting">
                      <span>Show Lenses</span>
                      <input
                        type="checkbox"
                        checked={showLensTray}
                        onChange={(e) => setShowLensTray(e.target.checked)}
                      />
                    </label>
                    <label className="ss-camera-setting">
                      <span>Flash/Torch</span>
                      <input type="checkbox" checked={torchOn} onChange={() => void toggleTorch()} />
                    </label>
                  </div>
                )}
                {!!snapText && (
                  <div
                    className="ss-camera-text"
                    style={{ color: snapTextColor, fontSize: `${snapTextSize}px` }}
                  >
                    {snapText}
                  </div>
                )}
                {snapTextOpen && (
                  <div className="ss-camera-text-panel">
                    <input
                      ref={snapTextInputRef}
                      type="text"
                      value={snapText}
                      placeholder="Type something..."
                      onChange={(e) => setSnapText(e.target.value)}
                    />
                    <div className="ss-camera-text-row">
                      {["#ffffff", "#ffd1e8", "#a6ddff", "#ffe7a3", "#b9ffcf"].map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`ss-camera-text-color ${snapTextColor === color ? "is-active" : ""}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setSnapTextColor(color)}
                        />
                      ))}
                      <input
                        type="range"
                        min="18"
                        max="46"
                        value={snapTextSize}
                        onChange={(e) => setSnapTextSize(Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}
                {sparkleOn && (
                  <div className="ss-camera-sparkles" aria-hidden="true">
                    {sparkleSeeds.map((sparkle) => (
                      <span
                        key={sparkle.id}
                        className="ss-camera-sparkle"
                        style={{
                          left: `${sparkle.left}%`,
                          top: `${sparkle.top}%`,
                          fontSize: `${sparkle.size}px`,
                          animationDelay: `${sparkle.delay}s`
                        }}
                      >
                        ✨
                      </span>
                    ))}
                  </div>
                )}
                {activeLens?.maskType === "emoji-float" ? (
                  <div
                    className="ss-camera-emoji-cloud"
                    aria-hidden="true"
                    style={(() => {
                      if (!faceBox) return undefined;
                      const { x, y, width, height, videoWidth, videoHeight } = faceBox;
                      const mirrorX = cameraFacing === "user" && cameraMirrorFront;
                      const rawLeft = mirrorX ? videoWidth - (x + width) : x;
                      const centerX = (rawLeft + width / 2) / videoWidth;
                      const anchorY = Math.max(0, (y - height * 0.26) / videoHeight);
                      const scale = Math.min(1.6, Math.max(0.7, (width / videoWidth) * 2.2));
                      return {
                        left: `${Math.round(centerX * 1000) / 10}%`,
                        top: `${Math.round(anchorY * 1000) / 10}%`,
                        transform: `translate(-50%, -10%) scale(${scale})`
                      };
                    })()}
                  >
                    {getEmojiOverlayItems().map((item, idx) => (
                      <span
                        key={item.key}
                        className="ss-camera-emoji"
                        style={{
                          "--float-delay": `${idx * 0.18}s`,
                          left: `${50 + item.offset.x * 100}%`,
                          top: `${50 + item.offset.y * 100}%`
                        }}
                      >
                        {item.emoji}
                      </span>
                    ))}
                  </div>
                ) : (
                  !!activeLens.mask && (
                    <div
                      className="ss-camera-animal-mask"
                      aria-hidden="true"
                      style={(() => {
                        if (!faceBox) return undefined;
                        const { x, y, width, height, videoWidth, videoHeight } = faceBox;
                        const mirrorX = cameraFacing === "user" && cameraMirrorFront;
                        const rawLeft = mirrorX ? videoWidth - (x + width) : x;
                        const centerX = (rawLeft + width / 2) / videoWidth;
                        const anchorMode = activeLens?.maskAnchor || "above";
                        const anchorY =
                          anchorMode === "center"
                            ? Math.max(0, (y + height * 0.5) / videoHeight)
                            : Math.max(0, (y - height * 0.22) / videoHeight);
                        const baseScale = (width / videoWidth) * 2.1;
                        const scale = Math.min(2.6, Math.max(0.7, baseScale * (activeLens?.maskScale || 1)));
                        const translateY = anchorMode === "center" ? "-50%" : "-10%";
                        return {
                          left: `${Math.round(centerX * 1000) / 10}%`,
                          top: `${Math.round(anchorY * 1000) / 10}%`,
                          transform: `translate(-50%, ${translateY}) scale(${scale})`
                        };
                      })()}
                    >
                      {activeLens.mask}
                    </div>
                  )
                )}
              </div>

              <div className="ss-snap-bottom">
                <div className={`ss-snap-lenses ${showLensTray ? "" : "is-hidden"}`}>
                  {SNAP_LENSES.map((lens) => (
                    <button
                      key={lens.id}
                      type="button"
                      className={`ss-snap-lens ${activeLensId === lens.id ? "is-active" : ""}`}
                      style={{ "--lens-bg": lens.thumb }}
                      onClick={() => setActiveLensId(lens.id)}
                      title={lens.label}
                    >
                      <span>{lens.badge}</span>
                    </button>
                  ))}
                </div>

                <div className="ss-snap-control-row">
                  <button type="button" className="ss-snap-side-btn" title="Gallery" onClick={openGalleryPicker}>
                    <FiImage />
                  </button>
                  <button
                    type="button"
                    className="ss-snap-shutter"
                    title="Capture"
                    onClick={captureSnapshot}
                    disabled={!cameraReady || captureBusy || !!capturePreview}
                  />
                  <button type="button" className="ss-snap-side-btn" title="Rotate" onClick={switchCamera}>
                    <FiRotateCcw />
                  </button>
                </div>

                <div className="ss-snap-pill">
                  <span className="ss-snap-pill-mark">🔖</span>
                  <span className="ss-snap-pill-label">{activeLens.label}</span>
                  <button
                    type="button"
                    className="ss-snap-pill-close"
                    title="Hide"
                    onClick={() => setShowLensTray((prev) => !prev)}
                  >
                    <FiChevronDown />
                  </button>
                </div>
              </div>

              {cameraError && <p className="ss-camera-error">{cameraError}</p>}
              <input
                ref={galleryInputRef}
                className="ss-camera-gallery-input"
                type="file"
                accept="image/*"
                onChange={handleGalleryPick}
              />
            </div>
          </section>
        </div>
      )}
    </header>
  );
}



