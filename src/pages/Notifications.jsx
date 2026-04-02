import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiBell, FiCheck, FiHeart, FiMapPin, FiMessageCircle, FiUserPlus, FiVideo, FiX } from "react-icons/fi";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import { buildProfilePath } from "../utils/profileRoute";
import "./Notifications.css";

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";
const READ_NOTIFICATIONS_KEY = "socialsea_read_notifications_v1";
const NOTIFICATIONS_CACHE_KEY = "socialsea_notifications_cache_v1";
const NOTIFICATIONS_CACHE_TTL_MS = 2 * 60 * 1000;
const isServerNotificationId = (value) => /^\d+$/.test(String(value || "").trim());

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

const readSeenNotificationIds = () => {
  try {
    const raw = localStorage.getItem(READ_NOTIFICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((x) => String(x)) : []);
  } catch {
    return new Set();
  }
};

const persistSeenNotificationIds = (setValue) => {
  try {
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(Array.from(setValue || [])));
  } catch {
    // ignore storage errors
  }
};

const readNotificationsCache = () => {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at || 0);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    if (!Number.isFinite(at) || Date.now() - at > NOTIFICATIONS_CACHE_TTL_MS) return [];
    return items;
  } catch {
    return [];
  }
};

const writeNotificationsCache = (items) => {
  try {
    localStorage.setItem(
      NOTIFICATIONS_CACHE_KEY,
      JSON.stringify({ at: Date.now(), items: Array.isArray(items) ? items : [] })
    );
  } catch {
    // ignore storage errors
  }
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

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const mapFollowRequestToNotification = (request) => {
  const sender = request?.sender || {};
  const senderName = sender?.name || sender?.email || "User";
  const senderEmail = sender?.email || "";
  const senderIdentifier = senderEmail || sender?.id || senderName;
  const requestId = request?.id;
  return {
    id: requestId ? `fr-${requestId}` : `fr-${Math.random().toString(36).slice(2)}`,
    followRequestId: requestId,
    followRequestStatus: request?.status || "PENDING",
    isFollowRequest: true,
    kind: "follow",
    message: `${senderName} requested to follow you`,
    actorName: senderName,
    actorEmail: senderEmail || undefined,
    actorIdentifier: senderIdentifier,
    actorProfilePic: sender?.profilePic || sender?.avatar || null,
    read: false,
    createdAt: request?.createdAt || request?.requestedAt || request?.time || null
  };
};

const mergeFollowRequestsWithNotifications = (notifications, followRequests) => {
  const base = Array.isArray(notifications) ? notifications : [];
  const requests = Array.isArray(followRequests) ? followRequests : [];
  if (!requests.length) return base;

  const existingRequestActors = new Set(
    base
      .filter((item) => String(item?.message || "").toLowerCase().includes("requested to follow"))
      .map((item) => normalizeKey(item?.actorEmail || item?.actorIdentifier))
      .filter(Boolean)
  );

  const mapped = requests
    .map(mapFollowRequestToNotification)
    .filter((item) => {
      const key = normalizeKey(item?.actorEmail || item?.actorIdentifier);
      if (key && existingRequestActors.has(key)) return false;
      return true;
    });

  if (!mapped.length) return base;
  return [...mapped, ...base];
};

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followBusyById, setFollowBusyById] = useState({});
  const [followedById, setFollowedById] = useState({});
  const [requestBusyById, setRequestBusyById] = useState({});
  const [seenNotificationIds, setSeenNotificationIds] = useState(() => readSeenNotificationIds());

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
    const resolvedAlertId = String(item?.alertId || item?.emergencyAlertId || item?.emergencyId || "").trim();
    return {
      liveUrl: normalizeLiveUrl(item?.liveUrl || pick("/sos/live/") || pick("/sos/"), resolvedAlertId),
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

  const resolveAvatarUrl = (raw) => {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
    return toApiUrl(value);
  };

  useEffect(() => {
    let active = true;
    const cached = readNotificationsCache();
    const hasCache = cached.length > 0;
    if (hasCache) {
      setItems(cached);
      setLoading(false);
    }
    const load = async (showLoader = false) => {
      if (showLoader && !hasCache) setLoading(true);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const fetchFollowRequests = async () => {
          const endpoints = ["/api/follow/requests", "/api/follow/pending-requests"];
          for (const url of endpoints) {
            try {
              const res = await api.get(url);
              return Array.isArray(res.data) ? res.data : [];
            } catch (err) {
              if (err?.response?.status === 404) continue;
              return [];
            }
          }
          return [];
        };

        const [notifResult, followResult] = await Promise.allSettled([
          api.get("/api/notifications", { params: { limit: 120 } }),
          fetchFollowRequests()
        ]);

        const list = notifResult.status === "fulfilled" && Array.isArray(notifResult.value?.data)
          ? notifResult.value.data
          : [];
        const followRequests = followResult.status === "fulfilled" && Array.isArray(followResult.value)
          ? followResult.value
          : [];

        const merged = mergeFollowRequestsWithNotifications(list, followRequests);
        if (!active) return;
        setItems(merged);
        writeNotificationsCache(merged);
        setFollowedById((prev) => {
          const next = { ...prev };
          merged.forEach((entry) => {
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
      } catch {
        if (active) setItems([]);
      } finally {
        if (active && showLoader) setLoading(false);
      }
    };

    load(!hasCache);
    const timer = setInterval(() => load(false), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const markReadLocal = (notificationId) => {
    const idText = String(notificationId || "").trim();
    if (!idText) return;
    setSeenNotificationIds((prev) => {
      if (prev.has(idText)) return prev;
      const next = new Set(prev);
      next.add(idText);
      persistSeenNotificationIds(next);
      return next;
    });
    setItems((prev) =>
      prev.map((item) =>
        String(item?.id || "") === idText ? { ...item, read: true } : item
      )
    );
  };

  const markReadOnServer = async (notificationId) => {
    const idText = String(notificationId || "").trim();
    if (!idText) return;
    if (!isServerNotificationId(idText)) return;
    const candidates = [
      { method: "post", url: `/api/notifications/${encodeURIComponent(idText)}/read` },
      { method: "post", url: `/api/notifications/read/${encodeURIComponent(idText)}` },
      { method: "patch", url: `/api/notifications/${encodeURIComponent(idText)}`, data: { read: true } }
    ];
    for (const req of candidates) {
      try {
        await api.request({ ...req, suppressAuthRedirect: true });
        return;
      } catch {
        // try next endpoint shape
      }
    }
  };

  useEffect(() => {
    if (!items.length) return;
    const unreadIds = items
      .filter((n) => !n?.read)
      .map((n) => String(n?.id || "").trim())
      .filter(Boolean);
    if (!unreadIds.length) return;

    unreadIds.forEach((id) => markReadLocal(id));

    const markAllRead = async () => {
      const bulkCandidates = [
        { method: "post", url: "/api/notifications/read-all" },
        { method: "post", url: "/api/notifications/mark-all-read" },
        { method: "patch", url: "/api/notifications", data: { read: true } }
      ];
      for (const req of bulkCandidates) {
        try {
          await api.request({ ...req, suppressAuthRedirect: true });
          return;
        } catch {
          // try next
        }
      }
      await Promise.allSettled(unreadIds.map((id) => markReadOnServer(id)));
    };

    void markAllRead();
  }, [items]);

  const unreadCount = useMemo(
    () =>
      items.filter((n) => {
        const idText = String(n?.id || "").trim();
        if (n?.read) return false;
        return idText ? !seenNotificationIds.has(idText) : false;
      }).length,
    [items, seenNotificationIds]
  );

  const openActorProfile = (identifier) => {
    const safe = String(identifier || "").trim();
    if (!safe) return;
    navigate(buildProfilePath(safe));
  };

  const handleFollow = async (item) => {
    const id = item?.id;
    const target = String(item?.actorIdentifier || item?.actorEmail || "").trim();
    if (!id || !target || followBusyById[id]) return;

    setFollowBusyById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await api.post(`/api/follow/${encodeURIComponent(target)}`);
      const statusText = String(res?.data?.status || res?.data || "").toLowerCase();
      if (res?.status >= 200 && res?.status < 300 && statusText.includes("following")) {
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

  const removeFollowRequestLocal = (requestId) => {
    setItems((prev) =>
      prev.filter((entry) => String(entry?.followRequestId || "") !== String(requestId || ""))
    );
  };

  const acceptFollowRequest = async (requestId) => {
    const idText = String(requestId || "").trim();
    if (!idText || requestBusyById[idText]) return;
    setRequestBusyById((prev) => ({ ...prev, [idText]: true }));
    try {
      await api.post(`/api/follow/requests/${encodeURIComponent(idText)}/accept`);
      removeFollowRequestLocal(idText);
    } catch {
      // ignore accept failures for now
    } finally {
      setRequestBusyById((prev) => ({ ...prev, [idText]: false }));
    }
  };

  const rejectFollowRequest = async (requestId) => {
    const idText = String(requestId || "").trim();
    if (!idText || requestBusyById[idText]) return;
    setRequestBusyById((prev) => ({ ...prev, [idText]: true }));
    try {
      await api.post(`/api/follow/requests/${encodeURIComponent(idText)}/reject`);
      removeFollowRequestLocal(idText);
    } catch {
      // ignore reject failures for now
    } finally {
      setRequestBusyById((prev) => ({ ...prev, [idText]: false }));
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
          const messageLower = String(content || "").toLowerCase();
          const isFollowRequest = Boolean(n?.isFollowRequest) || (kind === "follow" && messageLower.includes("requested to follow"));
          const { Icon, label, tone } = kindMeta(kind);
          const avatarLetter = (actor[0] || "U").toUpperCase();
          const actorAvatar =
            resolveAvatarUrl(
              n?.actorProfilePic ||
              n?.actor?.profilePicUrl ||
              n?.actor?.profilePic ||
              n?.actor?.avatarUrl ||
              n?.actor?.avatar ||
              n?.user?.profilePicUrl ||
              n?.user?.profilePic ||
              n?.user?.avatarUrl ||
              n?.user?.avatar ||
              ""
            );
          const actorIdentifier = n?.actorIdentifier || n?.actorEmail || actor;
          const following = !!followedById[n?.id];
          const followBusy = !!followBusyById[n?.id];
          const canFollow = kind === "follow" && !!actorIdentifier && !isFollowRequest;
          const emergency = extractEmergencyLinks(n, content);
          const emergencyNav = emergency.navigateUrl || emergency.mapsUrl;
          const idText = String(n?.id || "").trim();
          const isRead = Boolean(n?.read) || !idText || seenNotificationIds.has(idText);
          const followRequestId = n?.followRequestId;
          const followRequestStatus = String(n?.followRequestStatus || "").toUpperCase();
          const canRespondToRequest = Boolean(followRequestId) && (!followRequestStatus || followRequestStatus === "PENDING");
          const requestBusy = followRequestId ? !!requestBusyById[String(followRequestId)] : false;
          const typeLabel = isFollowRequest ? "Request" : label;

          return (
            <article
              key={n.id}
              className={`notify-card ${isRead ? "is-read" : "is-unread"}`}
              onMouseEnter={() => markReadLocal(n?.id)}
            >
              <button
                type="button"
                className={`notify-avatar ${tone} notify-avatar-btn`}
                onClick={() => openActorProfile(actorIdentifier)}
                aria-label={`Open ${actor} profile`}
              >
                {actorAvatar ? (
                  <img src={actorAvatar} alt={actor} className="notify-avatar-img" />
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
                      {typeLabel}
                    </span>
                  )}
                </div>
                <p className="notify-message">{content}</p>
                {isFollowRequest && (
                  <div className="notify-request-actions">
                    {canRespondToRequest ? (
                      <>
                        <button
                          type="button"
                          className="notify-request-btn accept"
                          onClick={() => acceptFollowRequest(followRequestId)}
                          disabled={requestBusy}
                        >
                          <FiCheck /> {requestBusy ? "..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          className="notify-request-btn reject"
                          onClick={() => rejectFollowRequest(followRequestId)}
                          disabled={requestBusy}
                        >
                          <FiX /> {requestBusy ? "..." : "Reject"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="notify-request-btn review"
                        onClick={() => navigate("/follow-requests")}
                      >
                        <FiUserPlus /> Review Requests
                      </button>
                    )}
                  </div>
                )}
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
