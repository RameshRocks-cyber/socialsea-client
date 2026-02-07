import { useEffect, useState } from "react";
import api from "../api/axios";

export default function PendingAnonymousPosts() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  const loadPosts = () => {
    api.get("/api/admin/anonymous/pending")
      .then(res => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch(err => {
        console.error(err);
        setError("Failed to load pending posts");
      });
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const approve = (id) => {
    api.post(`/api/admin/anonymous/approve/${id}`)
      .then(loadPosts)
      .catch(console.error);
  };

  const reject = (id) => {
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;

    api.post(
      `/api/admin/anonymous/reject/${id}`,
      reason,
      {
        headers: {
          "Content-Type": "text/plain"
        }
      }
    )
      .then(loadPosts)
      .catch(console.error);
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  const isVideo = (post) => {
    const type = (post?.type || "").toLowerCase();
    return type === "video" || type.startsWith("video");
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Pending Anonymous Posts</h2>
      {error && <p>{error}</p>}

      {posts.length === 0 && !error && <p>No pending posts</p>}

      {posts.map((p) => (
        <div key={p.id} style={{ marginBottom: 20, border: "1px solid #333", padding: 12 }}>
          {isVideo(p) ? (
            <video
              src={resolveUrl(p.contentUrl)}
              controls
              width="320"
              style={{ display: "block" }}
            />
          ) : (
            <img
              src={resolveUrl(p.contentUrl)}
              alt={p.description || "Anonymous post"}
              width="320"
              style={{ display: "block" }}
            />
          )}
          {p.description && <p>{p.description}</p>}
          <div>
            <button onClick={() => approve(p.id)}>Approve</button>
            <button onClick={() => reject(p.id)} style={{ marginLeft: 10 }}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
