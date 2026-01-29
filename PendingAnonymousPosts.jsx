import { useEffect, useState } from "react";
import api from "../api/axios";
import AdminNavbar from "./AdminNavbar";

export default function PendingAnonymousPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = async () => {
    const res = await api.get("/api/admin/anonymous/pending");
    setPosts(res.data);
    setLoading(false);
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const approve = async (id) => {
    await api.post(`/api/admin/anonymous/${id}/approve`);
    loadPosts();
  };

  const reject = async (id) => {
    await api.delete(`/api/admin/anonymous/${id}`);
    loadPosts();
  };

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <AdminNavbar />
      <div style={{ padding: "20px" }}>
        <h3>🕵️ Pending Anonymous Posts</h3>

        {posts.length === 0 && <p>No pending posts 🎉</p>}

        {posts.map((p) => (
          <div key={p.id} style={{
            border: "1px solid #ccc",
            padding: "10px",
            marginBottom: "10px"
          }}>
            <p>{p.content || p.caption}</p>

            <button onClick={() => approve(p.id)}>✅ Approve</button>
            <button onClick={() => reject(p.id)} style={{ marginLeft: "10px" }}>
              ❌ Reject
            </button>
          </div>
        ))}
      </div>
    </>
  );
}