import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";

export default function AdminPosts() {
  const [posts, setPosts] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/admin/posts")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setPosts(list);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load posts");
      });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return posts;
    const q = query.toLowerCase();
    return posts.filter((p) =>
      `${p?.id || ""} ${p?.username || ""} ${p?.email || ""} ${p?.type || ""}`.toLowerCase().includes(q)
    );
  }, [posts, query]);

  return (
    <section className="admin-table-panel">
      <header className="admin-table-head">
        <h3>All Posts</h3>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search post id/user/type"
        />
      </header>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Type</th>
              <th>Approved</th>
              <th>Media</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.username || p.email || "Unknown"}</td>
                <td>{p.type || (p.reel ? "VIDEO" : "IMAGE")}</td>
                <td>{p.approved ? "Yes" : "No"}</td>
                <td>
                  {p.contentUrl || p.mediaUrl ? (
                    <a href={p.contentUrl || p.mediaUrl} target="_blank" rel="noreferrer">Open</a>
                  ) : (
                    "N/A"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!error && filtered.length === 0 && <p className="admin-empty">No posts found.</p>}
    </section>
  );
}
