import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiBell, FiHeart, FiMapPin, FiMessageCircle, FiUserPlus, FiVideo } from "react-icons/fi";
import api from "../api/axios";
import "./Notifications.css";

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";

const readFollowingCache = () => {
  try {
    const raw = localStorage.getItem(FOLLOWING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeFollowingCache = (value) => {
  localStorage.setItem(FOLLOWING_CACHE_KEY, JSON.stringify(value || {}));
};

const updateFollowCache = (identifiers, following) => {
  const keys = identifiers
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (!keys.length) return;
  const cache = readFollowingCache();
  keys.forEach((key) => {
    cache[key] = Boolean(following);
  });
  writeFollowingCache(cache);
};

const getCachedFollowing = (identifiers) => {
  const cache = readFollowingCache();
  return identifiers
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .some((key) => cache[key] === true);
};

const extractFollowingFlag = (item) => {
  const booleanCandidates = [
    item?.isFollowing,
    item?.followState?.isFollowing,
    item?.followInfo?.isFollowing,
    item?.actor?.isFollowing,
    item?.user?.isFollowing
  ];
  if (booleanCandidates.some((value) => value === true)) return true;
  if (booleanCandidates.some((value) => value === false)) return false;

  const statusCandidates = [
    item?.followStatus,
    item?.relationship,
    item?.followState?.status,
    item?.followInfo?.status,
    item?.actor?.followStatus,
    item?.user?.followStatus
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  if (statusCandidates.some((value) => value.includes("follow"))) return true;
  if (statusCandidates.some((value) => value.includes("request"))) return false;
  return null;
};

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followBusyById, setFollowBusyById] = useState({});
  const [followedById, setFollowedById] = useState({});

  const emailToName = (email) => {
    const raw = (email || "").split("@")[0] || "";
    const withoutDigits = raw.replace(/\d+$/g, "");
    const spaced = withoutDigits.replace(/[._-]+/g, " ").trim();
    if (!spaced) return raw || "User";
    return spaced
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const normalizeMessage = (message) => {
    if (!message) return "";
    return String(message).replace(EMAIL_REGEX, (email) => emailToName(email));
  };

  const deriveActor = (message) => {
    const clean = normalizeMessage(message);
    const lower = clean.toLowerCase();
    const cutWords = [" liked ", " started following ", " commented ", " mentioned "];
    for (const w of cutWords) {
      const idx = lower.indexOf(w);
      if (idx > 0) return clean.slice(0, idx).trim();
    }
    return "User";
  };

  const deriveKind = (message) => {
    const lower = String(message || "").toLowerCase();
    if (lower.includes("like")) return "like";
    if (lower.includes("follow")) return "follow";
    if (lower.includes("comment")) return "comment";
    return "system";
  };

  const kindMeta = (kind) => {
    if (kind === "emergency") return { Icon: FiAlertTriangle, label: "Emergency", tone: "emergency" };
    if (kind === "like") return { Icon: FiHeart, label: "Like", tone: "like" };
    if (kind === "follow") return { Icon: FiUserPlus, label: "Follow", tone: "follow" };
    if (kind === "comment") return { Icon: FiMessageCircle, label: "Comment", tone: "comment" };
    return { Icon: FiBell, label: "Alert", tone: "system" };
  };

  const extractEmergencyLinks = (item, message) => {
    const text = String(message || "");
    const urls = text.match(/https?:\/\/\S+/g) || [];
    const pick = (marker) => {
      const found = urls.find((u) => u.includes(marker));
      return found ? found.replace(/[),.;]+$/g, "") : "";
    };
    return {
      liveUrl: String(item?.liveUrl || pick("/sos/live/") || "").trim(),
      navigateUrl: String(item?.navigateUrl || pick("/sos/navigate/") || "").trim(),
      mapsUrl: String(item?.mapsUrl || pick("google.com/maps") || "").trim(),
    };
  };

  const formatWhen = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  useEffect(() => {
    let active = true;
    const load = (showLoader = false) => {
      if (showLoader) setLoading(true);
      api
        .get("/api/notifications")
        .then((res) => {
          if (!active) return;
          const list = Array.isArray(res.data) ? res.data : [];
          setItems(list);
          setFollowedById((prev) => {
            const next = { ...prev };
            list.forEach((entry) => {
              const actor = entry?.actorName || deriveActor(entry?.message);
              const identifiers = [
                entry?.id,
                entry?.actorIdentifier,
                entry?.actorEmail,
                entry?.actorUsername,
                entry?.actor?.id,
                entry?.actor?.email,
                entry?.actor?.username,
                entry?.user?.id,
                entry?.user?.email,
                entry?.user?.username,
                actor
              ];
              const extracted = extractFollowingFlag(entry);
              if (extracted === true) {
                next[entry?.id] = true;
                updateFollowCache(identifiers, true);
                return;
              }
              if (extracted === false) {
                next[entry?.id] = false;
                return;
              }
              if (getCachedFollowing(identifiers)) {
                next[entry?.id] = true;
              }
            });
            return next;
          });
        })
        .catch(() => {
          if (active) setItems([]);
        })
        .finally(() => {
          if (active && showLoader) setLoading(false);
        });
    };

    load(true);
    const timer = setInterval(() => load(false), 7000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const unreadCount = useMemo(() => items.filter((n) => !n?.read).length, [items]);

  const openActorProfile = (identifier) => {
    const safe = String(identifier || "").trim();
    if (!safe) return;
    navigate(`/profile/${encodeURIComponent(safe)}`);
  };

  const handleFollow = async (item) => {
    const id = item?.id;
    const target = String(item?.actorIdentifier || item?.actorEmail || "").trim();
    if (!id || !target || followBusyById[id]) return;

    setFollowBusyById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await api.post(`/api/follow/${encodeURIComponent(target)}`);
      const msg = String(res?.data || "").toLowerCase();
      if (res?.status >= 200 && res?.status < 300 && !msg.includes("cannot follow")) {
        updateFollowCache(
          [item?.id, item?.actorIdentifier, item?.actorEmail, item?.actorUsername, item?.actorName, target],
          true
        );
        setFollowedById((prev) => ({ ...prev, [id]: true }));
      }
    } catch {
      // keep UI unchanged on failure
    } finally {
      setFollowBusyById((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <section className="notify-page">
      <header className="notify-head">
        <div className="notify-brand">
          <img src="/logo.png?v=3" alt="SocialSea" className="notify-logo" />
          <div>
            <h2>Notifications</h2>
            <p>{unreadCount} unread alerts</p>
          </div>
        </div>
      </header>

      <div className="notify-list">
        {loading && <p className="notify-empty">Loading notifications...</p>}
        {!loading && items.length === 0 && <p className="notify-empty">No notifications yet.</p>}

        {items.map((n) => {
          const kind = n?.kind || deriveKind(n?.message);
          const actor = n?.actorName || deriveActor(n?.message);
          const content = normalizeMessage(n?.message);
          const { Icon, label, tone } = kindMeta(kind);
          const avatarLetter = (actor[0] || "U").toUpperCase();
          const actorIdentifier = n?.actorIdentifier || n?.actorEmail || actor;
          const following = !!followedById[n?.id];
          const followBusy = !!followBusyById[n?.id];
          const canFollow = kind === "follow" && !!actorIdentifier;
          const emergency = extractEmergencyLinks(n, content);
          const emergencyNav = emergency.navigateUrl || emergency.mapsUrl;

          return (
            <article key={n.id} className={`notify-card ${n.read ? "is-read" : "is-unread"}`}>
              <button
                type="button"
                className={`notify-avatar ${tone} notify-avatar-btn`}
                onClick={() => openActorProfile(actorIdentifier)}
                aria-label={`Open ${actor} profile`}
              >
                {n?.actorProfilePic ? (
                  <img src={n.actorProfilePic} alt={actor} className="notify-avatar-img" />
                ) : (
                  avatarLetter
                )}
              </button>
              <div className="notify-main">
                <div className="notify-row">
                  <button type="button" className="notify-actor-btn" onClick={() => openActorProfile(actorIdentifier)}>
                    <strong className="notify-actor">{actor}</strong>
                  </button>
                  {canFollow ? (
                    <button
                      type="button"
                      className={`notify-type ${tone} notify-follow-btn ${following ? "is-following" : ""}`}
                      onClick={() => handleFollow(n)}
                      disabled={followBusy || following}
                    >
                      <Icon />
                      {followBusy ? "..." : following ? "Following" : "Follow"}
                    </button>
                  ) : (
                    <span className={`notify-type ${tone}`}>
                      <Icon />
                      {label}
                    </span>
                  )}
                </div>
                <p className="notify-message">{content}</p>
                {kind === "emergency" && (
                  <div className="notify-emergency-actions">
                    {emergency.liveUrl && (
                      <a className="notify-emergency-btn live" href={emergency.liveUrl}>
                        <FiVideo /> Open Live
                      </a>
                    )}
                    {emergencyNav && (
                      <a className="notify-emergency-btn navigate" href={emergencyNav} target="_blank" rel="noreferrer">
                        <FiMapPin /> Navigate
                      </a>
                    )}
                  </div>
                )}
                <small className="notify-time">{formatWhen(n?.createdAt || n?.time || n?.at)}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
