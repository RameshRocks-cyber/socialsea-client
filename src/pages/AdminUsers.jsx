import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/admin/users")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setUsers(list);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load users");
      });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter((u) =>
      `${u?.name || ""} ${u?.email || ""} ${u?.role || ""}`.toLowerCase().includes(q)
    );
  }, [users, query]);

  return (
    <section className="admin-table-panel">
      <header className="admin-table-head">
        <h3>All Users</h3>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name/email/role"
        />
      </header>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Profile</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.name || "N/A"}</td>
                <td>{u.email}</td>
                <td>{u.role || "USER"}</td>
                <td>{u.profileCompleted ? "Complete" : "Pending"}</td>
                <td>{u.banned ? "Banned" : "Active"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!error && filtered.length === 0 && <p className="admin-empty">No users found.</p>}
    </section>
  );
}
