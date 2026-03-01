import { useEffect, useState } from "react";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";

export default function AdminAnonymousRejected() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = () => {
    api.get("/api/admin/anonymous/rejected")
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Failed to load rejected posts", err));
  };

  const restore = (id) => {
    // Restore by approving the post again
    api.put(`/api/admin/anonymous/approve/${id}`)
      .then(() => {
        alert("Post Restored (Approved)");
        loadPosts();
      })
      .catch((err) => console.error("Restore failed", err));
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return toApiUrl(url);
  };

  return (
    <div style={styles.container}>
      <h2>❌ Rejected Anonymous Posts</h2>
      <div style={styles.grid}>
        {posts.map((post) => (
          <div key={post.id} style={styles.card}>
            {/* Media Preview */}
            {post.contentUrl && (
              <div style={styles.mediaBox}>
                {post.type === "VIDEO" || post.contentUrl.endsWith(".mp4") ? (
                  <video src={resolveUrl(post.contentUrl)} controls style={styles.media} />
                ) : (
                  <img src={resolveUrl(post.contentUrl)} alt="Preview" style={styles.media} />
                )}
              </div>
            )}

            <div style={styles.content}>
              <p><strong>Description:</strong> {post.description || "No description"}</p>
              
              <div style={styles.bankInfo}>
                <p><strong>UPI:</strong> {post.upiId || "N/A"}</p>
                <p><strong>Account:</strong> {post.accountNumber || "N/A"}</p>
                <p><strong>IFSC:</strong> {post.ifscCode || "N/A"}</p>
              </div>

              <div style={styles.actions}>
                <button onClick={() => restore(post.id)} style={styles.restoreBtn}>
                  🔄 Restore
                </button>
              </div>
            </div>
          </div>
        ))}
        {posts.length === 0 && <p>No rejected posts found.</p>}
      </div>
    </div>
  );
}

const styles = {
  container: { padding: "20px", color: "white" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" },
  card: { background: "#1f2937", borderRadius: "10px", overflow: "hidden", boxShadow: "0 4px 6px rgba(0,0,0,0.3)" },
  mediaBox: { height: "200px", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" },
  media: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" },
  content: { padding: "15px" },
  bankInfo: { background: "#374151", padding: "10px", borderRadius: "5px", margin: "10px 0", fontSize: "0.9em" },
  actions: { display: "flex", gap: "10px", marginTop: "10px" },
  restoreBtn: { flex: 1, padding: "8px", background: "#3b82f6", border: "none", borderRadius: "5px", color: "white", cursor: "pointer", fontWeight: "bold" },
};
