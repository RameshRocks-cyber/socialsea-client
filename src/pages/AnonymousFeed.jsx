import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toApiUrl } from "../api/baseUrl";

export default function AnonymousFeed() {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    fetch(toApiUrl("/api/anonymous/feed"))
      .then(res => res.json())
      .then(setVideos)
      .catch(console.error);
  }, []);

  function likeVideo(id) {
    fetch(toApiUrl(`/api/anonymous/like/${id}`), { method: "POST" });
  }

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navStart}>
          <h2 style={styles.logo}>SocialSea <span style={{ fontSize: "14px", color: "#aaa", fontWeight: "normal" }}>Anonymous</span></h2>
        </div>
        <div style={styles.navEnd}>
          <Link to="/anonymous-feed" style={styles.navLink}>Home</Link>
          <Link to="/anonymous/upload" style={styles.navLink}>Upload</Link>
          <Link to="/login" style={styles.navLink}>Login</Link>
        </div>
      </nav>

      <div style={styles.grid}>
        {videos.length === 0 && (
          <p style={{ color: "#aaa", gridColumn: "1 / -1", textAlign: "center" }}>No videos yet</p>
        )}

        {videos.map(v => (
          <div key={v.id} style={styles.card}>
            {/* Video */}
            <div style={styles.videoWrapper}>
              <video
                src={toApiUrl(v.videoUrl)}
                controls
                style={styles.video}
              />
            </div>

            {/* Content */}
            <div style={styles.cardContent}>
              <div style={styles.actions}>
                <button onClick={() => likeVideo(v.id)} style={styles.likeBtn}>
                  👍 Like
                </button>
              </div>

              {/* Comment box */}
              <input
                placeholder="Add a comment..."
                style={styles.commentInput}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: "#0f0f0f",
    minBlockSize: "100vh",
    color: "white",
    fontFamily: "Roboto, Arial, sans-serif",
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
  card: { backgroundColor: "#0f0f0f", display: "flex", flexDirection: "column" },
  videoWrapper: {
    position: "relative",
    inlineSize: "100%",
    paddingBlockStart: "56.25%", // 16:9 Aspect Ratio
    backgroundColor: "#000",
    borderRadius: "12px",
    overflow: "hidden"
  },
  video: { position: "absolute", insetBlockStart: 0, insetInlineStart: 0, inlineSize: "100%", blockSize: "100%", objectFit: "cover" },
  cardContent: { paddingBlock: "12px", paddingInline: 0 },
  actions: { marginBlockEnd: "8px" },
  likeBtn: {
    background: "#272727", color: "white", border: "none", padding: "6px 12px",
    borderRadius: "18px", fontSize: "14px", cursor: "pointer", fontWeight: "500",
    display: "flex", alignItems: "center", gap: "6px"
  },
  commentInput: {
    background: "transparent", border: "none", borderBlockEnd: "1px solid #3f3f3f",
    color: "white", padding: "8px 0", inlineSize: "100%", outline: "none", fontSize: "14px"
  }
};
