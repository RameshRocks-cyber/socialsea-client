import { useEffect, useState } from "react";
import api from "./api/axios";
import { successToast, errorToast } from "./toast";
import PermissionGate from "./PermissionGate";

export default function PendingAnonymousPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = async () => {
    const res = await api.get("/admin/anonymous/pending");
    setPosts(res.data);
    setLoading(false);
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const approve = async (id) => {
    try {
      await api.post(`/admin/anonymous/${id}/approve`);
      successToast("Post approved successfully ✅");
      loadPosts();
    } catch (e) {
      errorToast("Failed to approve post");
    }
  };

  const reject = async (id) => {
    try {
      await api.delete(`/admin/anonymous/${id}`);
      successToast("Post rejected ❌");
      loadPosts();
    } catch (e) {
      errorToast("Failed to reject post");
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <div style={{ padding: "20px" }}>
        <h3>🕵️ Pending Anonymous Posts</h3>

        {posts.length === 0 && <p>No pending posts 🎉</p>}

        {posts.map((p) => (
          <div key={p.id} style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginBlockEnd: "10px"
          }}>
            <p>{p.content}</p>

            <PermissionGate permission="POST_APPROVE">
              <button onClick={() => approve(p.id)}>✅ Approve</button>
            </PermissionGate>
            <PermissionGate permission="POST_DELETE">
              <button onClick={() => reject(p.id)} style={{ marginInlineStart: "10px" }}>
                ❌ Reject
              </button>
            </PermissionGate>
          </div>
        ))}
      </div>
    </>
  );
}
