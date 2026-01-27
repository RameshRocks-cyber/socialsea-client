import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function AnonymousFeed() {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    fetch(import.meta.env.VITE_API_URL + "/api/anonymous/feed")
      .then(res => res.json())
      .then(setVideos)
      .catch(console.error);
  }, []);

  function likeVideo(id) {
    fetch(import.meta.env.VITE_API_URL + `/api/anonymous/like/${id}`, { method: "POST" });
  }

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navLeft}>
          <h2 style={styles.logo}>SocialSea <span style={{ fontSize: "14px", color: "#aaa", fontWeight: "normal" }}>Anonymous</span></h2>
        </div>
        <div style={styles.navRight}>
          <Link to="/anonymous-feed" style={styles.navLink}>Home</Link>
          <Link to="/anonymous-upload" style={styles.navLink}>Upload</Link>
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
                src={`${import.meta.env.VITE_API_URL}${v.videoUrl}`}
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
    minHeight: "100vh",
    color: "white",
    fontFamily: "Roboto, Arial, sans-serif",
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 16px",
    height: "56px",
    backgroundColor: "#0f0f0f",
    position: "sticky",
    top: 0,
    zIndex: 100,
    borderBottom: "1px solid #272727"
  },
  navLeft: { display: "flex", alignItems: "center" },
  logo: { color: "white", margin: 0, fontSize: "20px", letterSpacing: "-0.5px" },
  navRight: { display: "flex", gap: "20px" },
  navLink: { color: "white", textDecoration: "none", fontSize: "14px", fontWeight: "500" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "20px",
    padding: "24px",
    maxWidth: "1600px",
    margin: "0 auto"
  },
  card: { backgroundColor: "#0f0f0f", display: "flex", flexDirection: "column" },
  videoWrapper: {
    position: "relative",
    width: "100%",
    paddingTop: "56.25%", // 16:9 Aspect Ratio
    backgroundColor: "#000",
    borderRadius: "12px",
    overflow: "hidden"
  },
  video: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" },
  cardContent: { padding: "12px 0" },
  actions: { marginBottom: "8px" },
  likeBtn: {
    background: "#272727", color: "white", border: "none", padding: "6px 12px",
    borderRadius: "18px", fontSize: "14px", cursor: "pointer", fontWeight: "500",
    display: "flex", alignItems: "center", gap: "6px"
  },
  commentInput: {
    background: "transparent", border: "none", borderBottom: "1px solid #3f3f3f",
    color: "white", padding: "8px 0", width: "100%", outline: "none", fontSize: "14px"
  }
};
