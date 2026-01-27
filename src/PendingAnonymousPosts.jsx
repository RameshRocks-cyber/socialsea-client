import { useEffect, useState } from "react";
import api from "../api/axios";

export default function PendingAnonymousPosts() {
  const [posts, setPosts] = useState([]);

  const loadPosts = () => {
    api.get("/api/admin/anonymous/pending")
      .then(res => setPosts(res.data))
      .catch(console.error);
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const approve = (id) => {
    api.post(`/api/admin/anonymous/approve/${id}`, {}).then(loadPosts);
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
    ).then(loadPosts);
  };

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2>Pending Anonymous Posts</h2>

      <table border="1" width="100%" cellPadding="10">
        <thead>
          <tr>
            <th>ID</th>
            <th>Content</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map(p => (
            <tr key={p.id}>
              <td>{p.id}</td>
              <td>{p.description || p.caption}</td>
              <td>
                <button onClick={() => approve(p.id)}>✅ Approve</button>
                <button onClick={() => reject(p.id)} style={{ marginLeft: 10 }}>
                  ❌ Reject
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}