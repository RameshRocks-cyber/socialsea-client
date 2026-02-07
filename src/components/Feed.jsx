import { useEffect, useState } from "react";
import api from "../api/axios";

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/feed")
      .then(res => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch(err => {
        console.error(err);
        const status = err?.response?.status;
        const message = err?.response?.data?.message || err?.response?.data || "";
        setError(status ? `Failed to load feed (${status}) ${message}` : "Failed to load feed");
      });
  }, []);

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Main Feed</h2>
      {error && <p>{error}</p>}
      {!error && posts.length === 0 && <p>No posts yet</p>}

      {posts.map((p) => (
        <div key={p.id} style={{ marginBottom: 20 }}>
          {p.reel ? (
            <video
              src={resolveUrl(p.mediaUrl)}
              controls
              width="320"
              style={{ display: "block" }}
            />
          ) : (
            <img
              src={resolveUrl(p.mediaUrl)}
              alt="Post"
              width="320"
              style={{ display: "block" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
