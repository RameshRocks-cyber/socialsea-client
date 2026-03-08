import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";

const toList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

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

export default function AnonymousFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewedById, setViewedById] = useState({});
  const [likeBusyById, setLikeBusyById] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/feed/anonymous");
      setItems(toList(res.data).map(normalizeItem));
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to load anonymous feed";
      setError(String(message));
      setItems([]);
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
        {!loading && error && <p style={styles.info}>{error}</p>}
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
    background:
      "radial-gradient(75% 55% at 12% -15%, rgba(65,122,255,0.14), transparent 65%), #090f1b",
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
    backgroundColor: "rgba(7, 14, 28, 0.86)",
    position: "sticky",
    insetBlockStart: 0,
    zIndex: 100,
    borderBlockEnd: "1px solid rgba(96, 154, 247, 0.24)",
    backdropFilter: "blur(10px)"
  },
  navStart: { display: "flex", alignItems: "center" },
  logo: { color: "white", margin: 0, fontSize: "24px", letterSpacing: "-0.4px", fontWeight: 800 },
  navEnd: { display: "flex", gap: "14px" },
  navLink: {
    color: "#d9e9ff",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: "700",
    padding: "6px 10px",
    border: "1px solid rgba(108, 171, 255, 0.2)",
    borderRadius: "999px",
    background: "rgba(14, 32, 66, 0.48)"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "14px",
    padding: "16px",
    maxInlineSize: "1180px",
    margin: "0 auto"
  },
  info: { color: "#aaa", gridColumn: "1 / -1", textAlign: "center" },
  card: {
    background:
      "linear-gradient(155deg, rgba(10, 23, 48, 0.88), rgba(5, 13, 28, 0.95))",
    border: "1px solid rgba(93, 149, 238, 0.26)",
    borderRadius: "14px",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 10px 24px rgba(3, 9, 22, 0.42)"
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBlockEnd: "8px"
  },
  author: { color: "#9cc2ff", fontSize: "13px", letterSpacing: "0.2px" },
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
    border: "1px solid rgba(105, 168, 255, 0.42)",
    color: "#d7e9ff",
    background: "linear-gradient(135deg, #133d79, #0f2d5f)",
    padding: "5px 9px",
    borderRadius: "9px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "700"
  },
  desc: { margin: "0 0 7px", color: "#e9f2ff", fontSize: "0.95rem" },
  meta: { color: "#96a7c7", fontSize: "0.82rem" }
};
