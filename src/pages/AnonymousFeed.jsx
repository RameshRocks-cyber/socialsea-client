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

export default function AnonymousFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/feed/anonymous");
      setItems(toList(res.data));
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
              <div style={styles.mediaWrap}>
                {video ? (
                  <video src={mediaUrl} controls style={styles.video} />
                ) : (
                  <img src={mediaUrl} alt="anonymous" style={styles.image} />
                )}
              </div>
              <div style={styles.cardContent}>
                <p style={styles.desc}>{item?.description || item?.content || "Anonymous post"}</p>
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
    backgroundColor: "#0f0f0f",
    minBlockSize: "100vh",
    color: "white",
    fontFamily: "Roboto, Arial, sans-serif"
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 16px",
    blockSize: "56px",
    backgroundColor: "#0f0f0f",
    position: "sticky",
    insetBlockStart: 0,
    zIndex: 100,
    borderBlockEnd: "1px solid #272727"
  },
  navStart: { display: "flex", alignItems: "center" },
  logo: { color: "white", margin: 0, fontSize: "20px", letterSpacing: "-0.5px" },
  navEnd: { display: "flex", gap: "20px" },
  navLink: { color: "white", textDecoration: "none", fontSize: "14px", fontWeight: "500" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "20px",
    padding: "24px",
    maxInlineSize: "1600px",
    margin: "0 auto"
  },
  info: { color: "#aaa", gridColumn: "1 / -1", textAlign: "center" },
  card: { backgroundColor: "#0f0f0f", display: "flex", flexDirection: "column" },
  mediaWrap: {
    position: "relative",
    inlineSize: "100%",
    paddingBlockStart: "56.25%",
    backgroundColor: "#000",
    borderRadius: "12px",
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
  cardContent: { paddingBlock: "12px", paddingInline: 0 },
  desc: { margin: "0 0 8px", color: "#e9f2ff" },
  meta: { color: "#96a7c7" }
};
