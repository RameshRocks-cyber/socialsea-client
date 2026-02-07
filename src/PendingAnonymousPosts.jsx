import { useEffect, useState } from "react";
import api from "./api/axios";
import { successToast, errorToast } from "./toast";
import PermissionGate from "./PermissionGate";

export default function PendingAnonymousPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPosts = async () => {
    try {
      const res = await api.get("/api/admin/anonymous/pending");
      setPosts(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (e) {
      console.error(e);
      const status = e?.response?.status;
      const message = e?.response?.data?.message || e?.response?.data || "";
      setError(status ? `Failed to load pending posts (${status}) ${message}` : "Failed to load pending posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const approve = async (id) => {
    try {
      await api.post(`/api/admin/anonymous/approve/${id}`);
      successToast("Post approved");
      loadPosts();
    } catch (e) {
      errorToast("Failed to approve post");
    }
  };

  const reject = async (id) => {
    const reason = prompt("Enter rejection reason:");
    if (!reason) return;

    try {
      await api.post(`/api/admin/anonymous/reject/${id}`, reason, {
        headers: {
          "Content-Type": "text/plain"
        }
      });
      successToast("Post rejected");
      loadPosts();
    } catch (e) {
      errorToast("Failed to reject post");
    }
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

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h3>Pending Anonymous Posts</h3>
      {error && <p>{error}</p>}
      {posts.length === 0 && !error && <p>No pending posts</p>}

      {posts.map((p) => (
        <div
          key={p.id}
          style={{
            border: "1px solid #333",
            padding: "10px",
            marginBlockEnd: "10px"
          }}
        >
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

          <PermissionGate permission="POST_APPROVE">
            <button onClick={() => approve(p.id)}>Approve</button>
          </PermissionGate>
          <PermissionGate permission="POST_DELETE">
            <button onClick={() => reject(p.id)} style={{ marginInlineStart: "10px" }}>
              Reject
            </button>
          </PermissionGate>
        </div>
      ))}
    </div>
  );
}
