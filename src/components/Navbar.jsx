import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiBell, FiHome, FiMessageSquare, FiSettings, FiUser, FiVideo } from "react-icons/fi";
import api from "../api/axios";
import "./Navbar.css";

const ITEMS = [
  { to: "/feed", icon: FiHome, label: "Feed", match: (p) => p === "/feed" },
  { to: "/reels", icon: FiVideo, label: "Reels", match: (p) => p === "/reels" },
  { to: "/chat", icon: FiMessageSquare, label: "Chat", match: (p) => p === "/chat" },
  { to: "/notifications", icon: FiBell, label: "Alerts", match: (p) => p === "/notifications" },
  { to: "/settings", icon: FiSettings, label: "Settings", match: (p) => p === "/settings" },
  { to: "/profile/me", icon: FiUser, label: "Profile", match: (p) => p.startsWith("/profile") },
];
const CALL_ACCEPT_TARGET_KEY = "socialsea_call_accept_target_v1";
const SETTINGS_KEY = "socialsea_settings_v1";

const readShowSosInNavbar = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.showSosInNavbar);
  } catch {
    return false;
  }
};

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const myUserId = localStorage.getItem("userId");
  const onChatRoute = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const onChatConversationRoute = location.pathname.startsWith("/chat/");
  const profileTarget = myUserId ? `/profile/${myUserId}` : "/profile/me";
  const [incomingCall, setIncomingCall] = useState(null);
  const [showSosInNavbar, setShowSosInNavbar] = useState(readShowSosInNavbar);
  const [sosPopup, setSosPopup] = useState("");
  const seenSignalRef = useRef(new Set());
  const sosTapRef = useRef({ count: 0, lastAt: 0 });

  const items = ITEMS.map((item) =>
    item.label === "Profile" ? { ...item, to: profileTarget } : item
  );

  useEffect(() => {
    setShowSosInNavbar(readShowSosInNavbar());
  }, [location.pathname]);

  useEffect(() => {
    const onStorage = (event) => {
      if (!event || event.key === SETTINGS_KEY) {
        setShowSosInNavbar(readShowSosInNavbar());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
        for (const signal of list) {
          const type = String(signal?.type || "").toLowerCase();
          const fromId = String(signal?.fromUserId || "");
          if (type !== "offer" || !fromId || fromId === String(myUserId)) continue;
          const signature = `${type}|${fromId}|${signal?.timestamp || ""}|${signal?.sdp || ""}`;
          if (seenSignalRef.current.has(signature)) continue;
          seenSignalRef.current.add(signature);
          if (seenSignalRef.current.size > 800) seenSignalRef.current.clear();
          setIncomingCall({
            fromUserId: fromId,
            fromName: normalizeName(signal?.fromName || signal?.fromEmail || `User ${fromId}`),
            mode: signal?.mode === "video" ? "video" : "audio"
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

  const openIncomingCall = () => {
    if (!incomingCall?.fromUserId) return;
    navigate(`/chat/${incomingCall.fromUserId}`);
  };

  const acceptIncomingCall = () => {
    if (!incomingCall?.fromUserId) return;
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
      setSosPopup("SOS ready. Tap 2 more times to send emergency alert.");
      return;
    }
    if (count === 2) {
      setSosPopup("One more tap. SOS will be sent now.");
      return;
    }

    sosTapRef.current = { count: 0, lastAt: 0 };
    setSosPopup("ok bee Brave Help is on the way");
    navigate("/sos?arm=1");
  };

  useEffect(() => {
    if (!sosPopup) return undefined;
    const timer = setTimeout(() => setSosPopup(""), 3500);
    return () => clearTimeout(timer);
  }, [sosPopup]);

  return (
    <header className={`ss-nav-wrap ${onChatConversationRoute ? "is-chat-conversation" : ""}`}>
      <nav className="ss-nav" aria-label="Main navigation">
        <Link to="/feed" className="ss-brand" aria-label="Go to feed">
          <img src="/logo.png?v=3" alt="SocialSea" className="ss-brand-logo" />
          <span className="ss-brand-text">SocialSea</span>
          {showSosInNavbar && (
            <button type="button" className="ss-sos-chip" title="Emergency SOS" onClick={onSosTap}>
              SOS
            </button>
          )}
        </Link>

        <div className="ss-links">
          {showSosInNavbar && (
            <button type="button" className="ss-sos-mobile" title="Emergency SOS" onClick={onSosTap}>
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

      {sosPopup && (
        <div className="ss-sos-popup" role="status" aria-live="polite">
          {sosPopup}
        </div>
      )}
    </header>
  );
}
