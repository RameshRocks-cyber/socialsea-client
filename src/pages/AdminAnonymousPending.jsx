import { useEffect, useState } from "react";
import api from "../api/axios";

export default function AdminAnonymousPending() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  const loadPosts = () => {
    api.get("/api/admin/anonymous/pending")
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error(err);
        setError("Failed to load pending posts");
      });
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const approve = (id) => {
    api.put(`/api/admin/anonymous/approve/${id}`)
      .then(() => loadPosts())
      .catch((err) => console.error("Approve failed", err));
  };

  const reject = (id) => {
    api.put(`/api/admin/anonymous/reject/${id}`)
      .then(() => loadPosts())
      .catch((err) => console.error("Reject failed", err));
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${import.meta.env.VITE_API_URL}${url}`;
  };

  return (
    <section className="admin-table-panel">
      <header className="admin-table-head">
        <h3>Pending Anonymous Posts</h3>
      </header>
      {error && <p className="admin-error">{error}</p>}

      <div className="admin-anon-grid">
        {posts.map((post) => (
          <article key={post.id} className="admin-anon-card">
            <div className="admin-anon-media">
              {post.contentUrl ? (
                post.type === "VIDEO" || String(post.contentUrl).includes(".mp4") ? (
                  <video src={resolveUrl(post.contentUrl)} controls />
                ) : (
                  <img src={resolveUrl(post.contentUrl)} alt="anonymous" />
                )
              ) : (
                <span>No media</span>
              )}
            </div>
            <div className="admin-anon-body">
              <p><strong>Description:</strong> {post.description || "No description"}</p>
              <p><strong>UPI:</strong> {post.upiId || "N/A"}</p>
              <p><strong>Account:</strong> {post.accountNumber || "N/A"}</p>
              <p><strong>IFSC:</strong> {post.ifscCode || "N/A"}</p>
              <div className="admin-anon-actions">
                <button type="button" className="ok" onClick={() => approve(post.id)}>Approve</button>
                <button type="button" className="danger" onClick={() => reject(post.id)}>Reject</button>
              </div>
            </div>
          </article>
        ))}
        {!error && posts.length === 0 && <p className="admin-empty">No pending posts.</p>}
      </div>
    </section>
  );
}
