import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";

const ANON_FEED_CACHE_KEY = "socialsea_anonymous_feed_cache_v1";

const toList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload && typeof payload === "object") {
    const objectValues = Object.values(payload);
    const nested = objectValues.find((entry) => Array.isArray(entry));
    if (Array.isArray(nested)) return nested;
  }
  return [];
};

const looksLikeHtml = (value) =>
  typeof value === "string" && (/^\s*<!doctype html/i.test(value) || /<html[\s>]/i.test(value));

const isVideoItem = (item) => {
  const type = String(item?.type || "").toUpperCase();
  if (type) return type.includes("VIDEO");
  const url = String(item?.contentUrl || item?.videoUrl || "");
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
};

const readCount = (item, keys) => {
  for (const key of keys) {
    const value = Number(item?.[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
};

const normalizeItem = (item) => ({
  ...item,
  likeCount: readCount(item, ["likeCount", "likesCount", "likes"]),
  viewCount: readCount(item, ["viewCount", "viewsCount", "views"]),
});

const isAnonymousItem = (item) => {
  if (!item || typeof item !== "object") return false;
  if (item.anonymous === true || item.isAnonymous === true) return true;
  const marker = String(item?.visibility || item?.privacy || item?.postType || "").trim().toLowerCase();
  if (marker.includes("anonymous")) return true;
  const name = String(item?.username || item?.name || "").trim().toLowerCase();
  if (name === "anonymous" || name === "anonymous user") return true;
  return false;
};

const readCachedItems = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ANON_FEED_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch {
    return [];
  }
};

const writeCachedItems = (items) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ANON_FEED_CACHE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // Ignore cache failures
  }
};

const parseLoadError = (err, hasCache) => {
  const status = Number(err?.response?.status || 0);
  if (status >= 500) {
    return hasCache
      ? "Server is busy. Showing your last loaded anonymous posts."
      : "Server is busy. Please try again in a moment.";
  }
  if (status === 404) return "Anonymous feed endpoint is not available.";
  if (status === 401 || status === 403) return "Please login again to view anonymous posts.";
  return hasCache
    ? "Could not refresh feed. Showing your last loaded anonymous posts."
    : "Failed to load anonymous feed.";
};

const buildBaseCandidates = () => {
  const isLocalDev =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());

  const storedBase =
    typeof window !== "undefined"
      ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
      : "";

  const originBase = typeof window !== "undefined" ? window.location.origin : "";

  return [
    originBase,
    api?.defaults?.baseURL || "",
    storedBase,
    getApiBaseUrl(),
    import.meta.env.VITE_API_URL,
    ...(isLocalDev ? ["http://localhost:8080", "http://127.0.0.1:8080"] : []),
  ].filter((value, index, arr) => value && arr.indexOf(value) === index);
};

export default function AnonymousFeed() {
  const [items, setItems] = useState(() => readCachedItems());
  const [loading, setLoading] = useState(() => readCachedItems().length === 0);
  const [error, setError] = useState("");
  const [viewedById, setViewedById] = useState({});
  const [likeBusyById, setLikeBusyById] = useState({});

  const load = async ({ keepExisting = true } = {}) => {
    try {
      setLoading(true);
      setError("");

      const plans = [
        { url: "/api/anonymous/feed", filter: (list) => list, allowEmpty: true },
        { url: "/api/feed/anonymous", filter: (list) => list, allowEmpty: true },
        { url: "/anonymous/feed", filter: (list) => list, allowEmpty: true },
        // Fallback: filter anonymous items from full feed (accept empty -> "No anonymous posts yet")
        { url: "/api/feed", filter: (list) => list.filter(isAnonymousItem), allowEmpty: true },
      ];
      const baseCandidates = buildBaseCandidates();

      let loaded = false;
      let lastErr = null;

      for (const plan of plans) {
        for (const baseURL of baseCandidates) {
          try {
            const res = await api.request({
              method: "GET",
              url: plan.url,
              baseURL,
              timeout: 9000,
              suppressAuthRedirect: true,
            });
            if (looksLikeHtml(res?.data)) continue;
            const list = toList(res?.data).map(normalizeItem);
            const nextItems = plan.filter(list);
            if (nextItems.length > 0 || plan.allowEmpty) {
              setItems(nextItems);
              writeCachedItems(nextItems);
              setError("");
              loaded = true;
              break;
            }
          } catch (err) {
            lastErr = err;
          }
        }
        if (loaded) break;
      }

      if (!loaded) {
        throw lastErr || new Error("Failed to load anonymous feed");
      }
    } catch (err) {
      const cached = readCachedItems();
      const hasCache = cached.length > 0;
      const message = parseLoadError(err, hasCache);
      setError(String(message));
      if (hasCache && keepExisting) {
        setItems(cached);
      } else {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateCounts = (id, payload) => {
    const nextLike = readCount(payload, ["likeCount", "likesCount", "likes"]);
    const nextView = readCount(payload, ["viewCount", "viewsCount", "views"]);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, likeCount: nextLike || item.likeCount || 0, viewCount: nextView || item.viewCount || 0 }
          : item
      )
    );
  };

  const likePost = async (id) => {
    if (!id || likeBusyById[id]) return;
    setLikeBusyById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await api.post(`/api/anonymous/${id}/like`);
      updateCounts(id, res?.data || {});
    } catch {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, likeCount: (item.likeCount || 0) + 1 } : item)));
    } finally {
      setLikeBusyById((prev) => ({ ...prev, [id]: false }));
    }
  };

  const markViewed = async (id) => {
    if (!id || viewedById[id]) return;
    setViewedById((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await api.post(`/api/anonymous/${id}/view`);
      updateCounts(id, res?.data || {});
    } catch {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, viewCount: (item.viewCount || 0) + 1 } : item)));
    }
  };

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navStart}>
          <h2 style={styles.logo}>
            SocialSea <span style={{ fontSize: "14px", color: "#aaa", fontWeight: "normal" }}>Anonymous</span>
          </h2>
        </div>
        <div style={styles.navEnd}>
          <Link to="/anonymous-feed" style={styles.navLink}>Home</Link>
          <Link to="/anonymous/upload" style={styles.navLink}>Upload</Link>
          <Link to="/feed" style={styles.navLink}>Main Feed</Link>
        </div>
      </nav>

      <div style={styles.grid}>
        {loading && <p style={styles.info}>Loading...</p>}
        {!loading && error && (
          <div style={styles.errorWrap}>
            <p style={styles.info}>{error}</p>
            <button type="button" style={styles.retryBtn} onClick={() => load({ keepExisting: true })}>
              Retry
            </button>
          </div>
        )}
        {!loading && !error && items.length === 0 && <p style={styles.info}>No anonymous posts yet</p>}

        {items.map((item) => {
          const mediaUrl = toApiUrl(item?.contentUrl || item?.videoUrl || "");
          const video = isVideoItem(item);
          return (
            <article key={item?.id || mediaUrl} style={styles.card}>
              <header style={styles.cardHead}>
                <strong style={styles.author}>Anonymous Post</strong>
              </header>
              <div style={styles.mediaWrap}>
                {video ? (
                  <video src={mediaUrl} controls style={styles.video} onLoadedData={() => markViewed(item?.id)} />
                ) : (
                  <img src={mediaUrl} alt="anonymous" style={styles.image} onLoad={() => markViewed(item?.id)} />
                )}
              </div>
              <div style={styles.cardContent}>
                <p style={styles.desc}>{item?.description || item?.content || "Anonymous post"}</p>
                <div style={styles.statsRow}>
                  <button
                    type="button"
                    style={styles.likeBtn}
                    onClick={() => likePost(item?.id)}
                    disabled={!!likeBusyById[item?.id]}
                  >
                    {likeBusyById[item?.id] ? "Liking..." : `Like (${item?.likeCount || 0})`}
                  </button>
                  <small style={styles.meta}>{item?.viewCount || 0} views</small>
                </div>
                <small style={styles.meta}>
                  {item?.createdAt
                    ? new Date(item.createdAt).toLocaleString([], { hour12: true })
                    : ""}
                </small>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: "radial-gradient(80% 55% at 12% -12%, rgba(255,255,255,0.06), transparent 65%), #050505",
    minBlockSize: "100vh",
    color: "white",
    fontFamily: "Sora, Segoe UI, sans-serif"
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 14px",
    blockSize: "54px",
    backgroundColor: "rgba(3, 3, 3, 0.92)",
    position: "sticky",
    insetBlockStart: 0,
    zIndex: 100,
    borderBlockEnd: "1px solid rgba(255, 255, 255, 0.12)",
    backdropFilter: "blur(10px)"
  },
  navStart: { display: "flex", alignItems: "center" },
  logo: { color: "white", margin: 0, fontSize: "24px", letterSpacing: "-0.4px", fontWeight: 800 },
  navEnd: { display: "flex", gap: "14px" },
  navLink: {
    color: "#f1f1f1",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: "700",
    padding: "6px 10px",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "999px",
    background: "rgba(0, 0, 0, 0.58)"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "14px",
    padding: "16px",
    maxInlineSize: "1180px",
    margin: "0 auto"
  },
  info: { color: "#b8b8b8", gridColumn: "1 / -1", textAlign: "center", margin: 0 },
  errorWrap: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    padding: "14px",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "rgba(0, 0, 0, 0.42)"
  },
  retryBtn: {
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#f4f4f4",
    background: "#111111",
    padding: "6px 12px",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "700"
  },
  card: {
    background: "linear-gradient(155deg, rgba(12, 12, 12, 0.95), rgba(3, 3, 3, 0.96))",
    border: "1px solid rgba(255, 255, 255, 0.13)",
    borderRadius: "14px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.48)"
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBlockEnd: "8px"
  },
  author: { color: "#dbdbdb", fontSize: "13px", letterSpacing: "0.2px" },
  mediaWrap: {
    position: "relative",
    inlineSize: "100%",
    paddingBlockStart: "56.25%",
    backgroundColor: "#000",
    borderRadius: "10px",
    overflow: "hidden"
  },
  video: {
    position: "absolute",
    insetBlockStart: 0,
    insetInlineStart: 0,
    inlineSize: "100%",
    blockSize: "100%",
    objectFit: "cover"
  },
  image: {
    position: "absolute",
    insetBlockStart: 0,
    insetInlineStart: 0,
    inlineSize: "100%",
    blockSize: "100%",
    objectFit: "cover"
  },
  cardContent: { paddingBlock: "8px 4px", paddingInline: 0 },
  statsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBlockEnd: "6px"
  },
  likeBtn: {
    border: "1px solid rgba(255, 255, 255, 0.18)",
    color: "#f6f6f6",
    background: "linear-gradient(135deg, #1b1b1b, #0a0a0a)",
    padding: "5px 9px",
    borderRadius: "9px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "700"
  },
  desc: { margin: "0 0 7px", color: "#f1f1f1", fontSize: "0.95rem" },
  meta: { color: "#a4a4a4", fontSize: "0.82rem" }
};
