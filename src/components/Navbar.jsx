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
  FiVideo,
  FiX
} from "react-icons/fi";
import api from "../api/axios";
import { getApiBaseUrl } from "../api/baseUrl";
import "./Navbar.css";

const ITEMS = [
  { to: "/feed", icon: FiHome, label: "Feed", match: (p) => p === "/feed" },
  { to: "/reels", icon: FiVideo, label: "Reels", match: (p) => p === "/reels" },
  { to: "/chat", icon: FiMessageSquare, label: "Chat", match: (p) => p === "/chat" },
  { to: "/notifications", icon: FiBell, label: "Alerts", match: (p) => p === "/notifications" },
  { to: "/profile/me", icon: FiUser, label: "Profile", match: (p) => p.startsWith("/profile") },
];
const CALL_ACCEPT_TARGET_KEY = "socialsea_call_accept_target_v1";
const CALL_SIGNAL_LOCAL_KEY = "socialsea_call_signal_local_v1";
const CALL_SIGNAL_CHANNEL = "socialsea-call-signal";
const CALL_SIGNAL_MAX_AGE_MS = 45000;
const SETTINGS_KEY = "socialsea_settings_v1";
const SOS_SIGNAL_KEY = "socialsea_sos_signal_v1";
const SOS_SIGNAL_CHANNEL = "socialsea_sos_signal_channel_v1";
const SOS_SESSION_KEY = "socialsea_sos_session_v1";
const SOS_OWN_STOP_AT_KEY = "socialsea_sos_own_stop_at_v1";
const SOS_LAST_SIGNAL_ID_KEY = "socialsea_sos_last_signal_id_v1";
const SOS_LAST_SESSION_SIG_KEY = "socialsea_sos_last_session_sig_v1";
const SOS_NAV_CACHE_KEY = "socialsea_sos_nav_cache_v1";
const SOS_SUPPRESSED_ALERTS_KEY = "socialsea_sos_suppressed_alerts_v1";
const SOS_SEEN_ALERTS_KEY = "socialsea_sos_seen_alerts_v1";
const uniqueNonEmpty = (arr) =>
  arr.filter((v, i) => {
    if (!v) return false;
    return arr.indexOf(v) === i;
  });

const emergencyBaseCandidates = () => {
  const isLocalDev =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
  const isHttpsPage =
    typeof window !== "undefined" &&
    String(window.location.protocol || "").toLowerCase() === "https:";
  const storedBase =
    typeof window !== "undefined"
      ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
      : "";
  const list = uniqueNonEmpty(
    isLocalDev
      ? [
          "/api",
          "http://localhost:8080",
          "http://127.0.0.1:8080",
          getApiBaseUrl(),
          api.defaults.baseURL,
          storedBase,
          import.meta.env.VITE_API_URL
        ]
      : [
          "/api",
          getApiBaseUrl(),
          api.defaults.baseURL,
          storedBase,
          import.meta.env.VITE_API_URL,
          "https://socialsea.co.in"
        ]
  );
  return list.filter((base) => !(isHttpsPage && /^http:\/\//i.test(String(base || ""))));
};

const buildEmergencyUrls = (suffix) => {
  const path = String(suffix || "").replace(/^\/+/, "");
  const urls = [];
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
  urls.push(`/api/emergency/${path}`);
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

const readSessionValue = (key) => {
  try {
    return String(sessionStorage.getItem(key) || "");
  } catch {
    return "";
  }
};

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
    return Boolean(parsed?.active);
  } catch {
    return false;
  }
};

const SNAP_LENSES = [
  { id: "off", label: "Off", badge: "O", thumb: "linear-gradient(135deg, #131313, #282828)", filter: "none", mask: "" },
  { id: "natural", label: "Natural", badge: "N", thumb: "linear-gradient(135deg, #50755f, #9ed8a0)", filter: "none", mask: "" },
  {
    id: "colorful",
    label: "Colorful",
    badge: "C",
    thumb: "linear-gradient(135deg, #19a6ff, #7ce2ff 55%, #5adb88)",
    filter: "saturate(1.62) contrast(1.18) brightness(1.06)",
    mask: ""
  },
  {
    id: "cartoon",
    label: "Cartoon",
    badge: "T",
    thumb: "linear-gradient(135deg, #6f5eff, #f08dff)",
    filter: "contrast(1.34) saturate(1.34) brightness(1.08)",
    mask: ""
  },
  {
    id: "girl",
    label: "Girl",
    badge: "G",
    thumb: "linear-gradient(135deg, #ff94ca, #ffa3a3)",
    filter: "brightness(1.1) saturate(1.16) sepia(0.08) hue-rotate(-10deg)",
    mask: ""
  },
  {
    id: "boy",
    label: "Boy",
    badge: "B",
    thumb: "linear-gradient(135deg, #59a4ff, #7ed0ff)",
    filter: "contrast(1.12) saturate(0.92) hue-rotate(8deg)",
    mask: ""
  },
  {
    id: "aging",
    label: "Aging",
    badge: "A",
    thumb: "linear-gradient(135deg, #ae8f75, #d0bda3)",
    filter: "sepia(0.28) contrast(1.16) grayscale(0.18)",
    mask: ""
  },
  { id: "cat", label: "Cat", badge: "CAT", thumb: "linear-gradient(135deg, #f7ab56, #f9d179)", filter: "none", mask: "🐱" },
  { id: "dog", label: "Dog", badge: "DOG", thumb: "linear-gradient(135deg, #c48f63, #e5cb9f)", filter: "none", mask: "🐶" }
];

const SNAP_TOOLS = ["Aa", "∞", "✧", "⌄"];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const myUserId = String(sessionStorage.getItem("userId") || localStorage.getItem("userId") || "").trim();
  const myEmail = String(sessionStorage.getItem("email") || localStorage.getItem("email") || "").trim().toLowerCase();
  const onChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const onChatConversationRoute = location.pathname.startsWith("/chat/");
  const profileTarget = "/profile/me";
  const [incomingCall, setIncomingCall] = useState(null);
  const [showSosInNavbar, setShowSosInNavbar] = useState(readShowSosInNavbar);
  const [sosActive, setSosActive] = useState(readIsSosActive);
  const [sosPopup, setSosPopup] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [activeLensId, setActiveLensId] = useState("colorful");
  const seenSignalRef = useRef(new Set());
  const incomingCallRef = useRef(null);
  const sosTapRef = useRef({ count: 0, lastAt: 0 });
  const seenEmergencyAlertsRef = useRef(new Set());
  const seenLocalSignalsRef = useRef(new Set());
  const seenSessionSignalsRef = useRef(new Set());
  const seenAlertIdsRef = useRef(readSeenAlertIds());
  const suppressedAlertIdsRef = useRef(readSuppressedAlertIds());
  const ownSosStopUntilRef = useRef(0);
  const popupStateRef = useRef(null);
  const popupMetaRef = useRef({ fingerprint: "", shownAt: 0 });
  const sosSignalChannelRef = useRef(null);
  const lastHandledSignalIdRef = useRef(readSessionValue(SOS_LAST_SIGNAL_ID_KEY));
  const lastHandledSessionSigRef = useRef(readSessionValue(SOS_LAST_SESSION_SIG_KEY));
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const items = ITEMS.map((item) =>
    item.label === "Profile" ? { ...item, to: profileTarget } : item
  );

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const isOwnEmergency = ({ reporterEmail, reporterUserId } = {}) => {
    const incomingEmail = String(reporterEmail || "").trim().toLowerCase();
    const incomingUserId = String(reporterUserId || "").trim();
    if (myEmail && incomingEmail && incomingEmail === myEmail) return true;
    if (myUserId && incomingUserId && incomingUserId === myUserId) return true;
    try {
      const raw = localStorage.getItem(SOS_SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        const sessionReporterEmail = String(session?.reporterEmail || "").trim().toLowerCase();
        const sessionReporterUserId = String(session?.reporterUserId || "").trim();
        if (myEmail && sessionReporterEmail && sessionReporterEmail === myEmail) return true;
        if (myUserId && sessionReporterUserId && sessionReporterUserId === myUserId) return true;
        // Backward compatibility for very old local session records that don't store reporter identity.
        if (session?.triggeredByCurrentBrowser && !sessionReporterEmail && !sessionReporterUserId) return true;
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
          if (type !== "offer" || !fromId || fromId === String(myUserId)) continue;
          const signalMs = toSignalMs(signal);
          if (signalMs > 0 && Date.now() - signalMs > CALL_SIGNAL_MAX_AGE_MS) continue;
          const terminalMs = latestTerminalByPeer.get(fromId) || 0;
          if ((terminalMs > 0 && signalMs <= terminalMs) || (terminalMs > 0 && signalMs <= 0)) continue;
          const signature = `${type}|${fromId}|${signal?.timestamp || ""}|${signal?.sdp || ""}`;
          if (seenSignalRef.current.has(signature)) continue;
          seenSignalRef.current.add(signature);
          if (seenSignalRef.current.size > 800) seenSignalRef.current.clear();
          setIncomingCall({
            fromUserId: fromId,
            fromName: normalizeName(signal?.fromName || signal?.fromEmail || `User ${fromId}`),
            mode: signal?.mode === "video" ? "video" : "audio",
            at: Date.now()
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

  const openIncomingCall = () => {
    if (!incomingCall?.fromUserId) return;
    setIncomingCall(null);
    navigate(`/chat/${incomingCall.fromUserId}`);
  };

  const acceptIncomingCall = () => {
    if (!incomingCall?.fromUserId) return;
    setIncomingCall(null);
    try {
      sessionStorage.setItem(
        CALL_ACCEPT_TARGET_KEY,
        JSON.stringify({ fromUserId: String(incomingCall.fromUserId), at: Date.now() })
      );
    } catch {
      // ignore storage issues
    }
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

  const onSosTap = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
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
          if (popupStateRef.current?.isEmergency) setSosPopup(null);
          return;
        }
        const session = JSON.parse(raw);
        const isOwnSession =
          Boolean(session?.triggeredByCurrentBrowser) ||
          isOwnEmergency({ reporterEmail: session?.reporterEmail, reporterUserId: session?.reporterUserId });
        if (!isOwnSession) return;
        if (session?.active) {
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
      if (kind === "stopped") {
        const isOwnStopped =
          Boolean(payload?.triggeredByCurrentBrowser) ||
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
        setSosPopup(null);
        return;
      }
      if (resolvedAlertId && isAlertSuppressed(resolvedAlertId)) {
        setSosPopup(null);
        return;
      }
      showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
        isEmergency: true,
        alertId: resolvedAlertId || undefined,
        reporterEmail: signalReporterEmail,
        liveUrl: payload.liveUrl,
        navigateUrl: payload.navigateUrl,
        mapsUrl: payload.mapsUrl,
        latitude: payload.latitude,
        longitude: payload.longitude
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
          const isActive = Boolean(session?.active);
          if (!isActive) {
            const stoppedId = normalizeAlertId(session?.alertId || session?.alertDisplayId);
            if (stoppedId) {
              suppressAlert(stoppedId);
            }
            const isOwnStoppedSession =
              Boolean(session?.triggeredByCurrentBrowser) ||
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
        processSignal(JSON.parse(raw), { requireFresh: false });
      } catch {
        // ignore parse/storage issues
      }

      try {
        const rawSession = localStorage.getItem(SOS_SESSION_KEY);
        if (!rawSession) return;
        const session = JSON.parse(rawSession);
        if (!session?.active) {
          const stoppedId = normalizeAlertId(session?.alertId || session?.alertDisplayId);
          if (stoppedId) {
            suppressAlert(stoppedId);
          }
          const isOwnStoppedSession =
            Boolean(session?.triggeredByCurrentBrowser) ||
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
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.result)) return data.result;
      if (Array.isArray(data?.payload)) return data.payload;
      if (data && typeof data === "object" && (data.active || data.alertId || data.alertDisplayId || data.latitude || data.longitude || data.reporterEmail)) {
        return [data];
      }
      return [];
    };

    const requestEmergencyData = async (suffix) => {
      let res = null;
      let lastError = null;
      const urls = buildEmergencyUrls(suffix);
      const suffixText = String(suffix || "").toLowerCase();
      const isPublicEmergencyEndpoint = suffixText === "active" || suffixText === "active-session";
      for (const url of urls) {
        const baseURL = /^https?:\/\//i.test(url) ? undefined : api.defaults.baseURL;
        const path = /^https?:\/\//i.test(url) ? url : url;
        try {
          res = await api.get(path, {
            baseURL,
            suppressAuthRedirect: true,
            skipAuth: false
          });
          break;
        } catch (err) {
          lastError = err;
          const status = Number(err?.response?.status || 0);
          if ((status === 401 || status === 403) && isPublicEmergencyEndpoint) {
            try {
              res = await api.get(path, {
                baseURL,
                suppressAuthRedirect: true,
                skipAuth: true,
                skipRefresh: true
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
        const payloads = [];
        const suffixes = ["active", "active-session", "assist/active", "assist/active-session"];
        for (const suffix of suffixes) {
          try {
            payloads.push(await requestEmergencyData(suffix));
          } catch {
            // keep trying other source
          }
        }
        if (!payloads.length) return;

        if (disposed) return;
        const alerts = payloads.flatMap((data) => normalizeAlerts(data));
        const activeAlerts = alerts.filter((a) => (typeof a?.active === "boolean" ? a.active : true));
        const activeKeys = new Set(activeAlerts.map((a) => buildEmergencyDedupeKey(a)).filter(Boolean));
        const currentPopup = popupStateRef.current;
        const currentPopupKey = normalizeAlertId(currentPopup?.dedupeKey || currentPopup?.alertId);

        // Close stale emergency popup as soon as backend no longer reports active alerts.
        if (!activeAlerts.length && currentPopup?.isEmergency) {
          setSosPopup(null);
          return;
        }
        if (currentPopup?.isEmergency && currentPopupKey && activeKeys.size && !activeKeys.has(currentPopupKey)) {
          setSosPopup(null);
        }

        for (const a of alerts) {
          const isActiveAlert = typeof a?.active === "boolean" ? a.active : true;
          const id = String(a?.alertId || a?.alertDisplayId || "").trim();
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
          if (isAlertSuppressed(id)) continue;
          const currentKey = normalizeAlertId(popupStateRef.current?.dedupeKey || popupStateRef.current?.alertId);
          if (currentKey && dedupeKey === currentKey) continue;
          seenEmergencyAlertsRef.current.add(dedupeKey);
          const reporter = String(a?.reporterEmail || "").trim();
          showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
            isEmergency: true,
            alertId: id,
            dedupeKey,
            reporterEmail: reporter,
            liveUrl: a?.liveUrl || a?.streamUrl,
            navigateUrl: a?.navigateUrl || a?.locationUrl,
            mapsUrl: a?.mapsUrl,
            latitude: a?.latitude ?? a?.lastLocation?.latitude,
            longitude: a?.longitude ?? a?.lastLocation?.longitude
          });
          break;
        }
      } catch (err) {
        // keep polling; auth/session can recover later on mobile browsers
      }
    };

    pollEmergency();
    const timer = setInterval(pollEmergency, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [myUserId, location.pathname]);

  useEffect(() => {
    let disposed = false;

    const forceFromActiveSession = () => {
      try {
        const raw = localStorage.getItem(SOS_SESSION_KEY);
        if (!raw) {
          if (popupStateRef.current?.isEmergency) setSosPopup(null);
          return;
        }
        const session = JSON.parse(raw);
        if (!session?.active) {
          const stoppedId = normalizeAlertId(session?.alertId || session?.alertDisplayId);
          const isOwnStoppedSession =
            Boolean(session?.triggeredByCurrentBrowser) ||
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
        showSosPopup("[EMERGENCY] SocialSea Emergengy SOS is asking for help", {
          isEmergency: true,
          alertId: fallbackAlertId || undefined,
          dedupeKey: fallbackAlertId || "session_active",
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
  }, [location.pathname]);

  const closeCameraStudio = () => {
    setCameraOpen(false);
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

  const openCameraStudio = async () => {
    if (cameraOpen) {
      closeCameraStudio();
      return;
    }
    setCameraError("");
    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
        audio: false
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play?.().catch(() => {});
        }
      });
    } catch {
      setCameraError("Camera access denied or unavailable.");
      setCameraOpen(false);
    } finally {
      setCameraBusy(false);
    }
  };

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

  const activeLens = SNAP_LENSES.find((x) => x.id === activeLensId) || SNAP_LENSES[0];
  const cameraFilterCss = activeLens?.filter || "none";

  const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeAlertId = (value) => String(value || "").trim();
  const buildEmergencyDedupeKey = (alertLike = {}) => {
    const id = normalizeAlertId(alertLike?.alertId || alertLike?.alertDisplayId);
    if (id) return id;
    const reporter =
      String(alertLike?.reporterUserId || "").trim() ||
      String(alertLike?.reporterEmail || "").trim().toLowerCase() ||
      "unknown";
    const lat = String(alertLike?.latitude ?? alertLike?.lastLocation?.latitude ?? "").trim();
    const lon = String(alertLike?.longitude ?? alertLike?.lastLocation?.longitude ?? "").trim();
    return `active_${reporter}_${lat}_${lon}`.replace(/\s+/g, "_");
  };
  const readOwnStoppedSessionState = () => {
    try {
      const raw = localStorage.getItem(SOS_SESSION_KEY);
      if (!raw) return { isRecentOwnStop: false, alertId: "" };
      const session = JSON.parse(raw);
      const isOwn =
        Boolean(session?.triggeredByCurrentBrowser) ||
        isOwnEmergency({ reporterEmail: session?.reporterEmail, reporterUserId: session?.reporterUserId });
      if (!isOwn || session?.active) return { isRecentOwnStop: false, alertId: "" };
      const updatedMs = new Date(session?.updatedAt || session?.stoppedAt || "").getTime();
      const isRecent = Number.isFinite(updatedMs) && Date.now() - updatedMs < 120000;
      return {
        isRecentOwnStop: Boolean(isRecent),
        alertId: normalizeAlertId(session?.alertId || session?.alertDisplayId)
      };
    } catch {
      return { isRecentOwnStop: false, alertId: "" };
    }
  };

  const isAlertSuppressed = (alertId) => {
    const id = normalizeAlertId(alertId);
    return Boolean(id) && suppressedAlertIdsRef.current.has(id);
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
    try {
      sessionStorage.setItem(
        SOS_SUPPRESSED_ALERTS_KEY,
        JSON.stringify(Array.from(suppressedAlertIdsRef.current).slice(-500))
      );
    } catch {
      // ignore storage issues
    }
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
    if (nextPopup?.isEmergency && ownSosStopUntilRef.current > Date.now()) {
      setSosPopup(null);
      return;
    }
    const ownStopped = readOwnStoppedSessionState();
    if (
      nextPopup?.isEmergency &&
      ownStopped.isRecentOwnStop &&
      (!nextPopup?.alertId || !ownStopped.alertId || nextPopup.alertId === ownStopped.alertId)
    ) {
      setSosPopup(null);
      return;
    }
    if (nextPopup?.isEmergency && isAlertSuppressed(nextPopup?.alertId)) {
      setSosPopup(null);
      return;
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
    if (fingerprint && (fingerprint === currentFingerprint || (fingerprint === last.fingerprint && now - last.shownAt < 1500))) {
      return;
    }
    popupMetaRef.current = { fingerprint, shownAt: now };
    setSosPopup(nextPopup);
  };

  const openPopupUrl = (url) => {
    const href = String(url || "").trim();
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
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
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`ss-link ${active ? "is-active" : ""}`}
                title={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="ss-link-icon" />
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
        <div className="ss-sos-popup" role="status" aria-live="polite">
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
                  if (popupData?.alertId) suppressAlert(popupData.alertId);
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

      {cameraOpen && (
        <div className="ss-camera-modal-backdrop" onClick={closeCameraStudio}>
          <section className="ss-snap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ss-snap-preview">
              <header className="ss-snap-topbar">
                <button type="button" className="ss-snap-icon-btn" onClick={closeCameraStudio} title="Close">
                  <FiX />
                </button>
                <button type="button" className="ss-snap-icon-btn" title="Flash">
                  <FiSlash />
                </button>
                <button type="button" className="ss-snap-icon-btn" title="Settings">
                  <FiSettings />
                </button>
              </header>

              <div className="ss-snap-tools">
                {SNAP_TOOLS.map((tool) => (
                  <button key={tool} type="button" className="ss-snap-tool-btn">
                    {tool}
                  </button>
                ))}
              </div>

              <div className="ss-camera-preview">
                <video
                  ref={cameraVideoRef}
                  className="ss-camera-video"
                  style={{ filter: cameraFilterCss }}
                  autoPlay
                  playsInline
                  muted
                />
                {!!activeLens.mask && (
                  <div className="ss-camera-animal-mask" aria-hidden="true">
                    {activeLens.mask}
                  </div>
                )}
              </div>

              <div className="ss-snap-bottom">
                <div className="ss-snap-lenses">
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
                  <button type="button" className="ss-snap-side-btn" title="Gallery">
                    <FiImage />
                  </button>
                  <button type="button" className="ss-snap-shutter" title="Capture" />
                  <button type="button" className="ss-snap-side-btn" title="Rotate">
                    <FiRotateCcw />
                  </button>
                </div>

                <div className="ss-snap-pill">
                  <span className="ss-snap-pill-mark">🔖</span>
                  <span className="ss-snap-pill-label">{activeLens.label}</span>
                  <button type="button" className="ss-snap-pill-close" title="Hide">
                    <FiChevronDown />
                  </button>
                </div>
              </div>

              {cameraError && <p className="ss-camera-error">{cameraError}</p>}
            </div>
          </section>
        </div>
      )}
    </header>
  );
}



