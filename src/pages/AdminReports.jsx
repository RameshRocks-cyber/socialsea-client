import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/admin/reports")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setReports(list);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load reports");
      });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return reports;
    const q = query.toLowerCase();
    return reports.filter((r) =>
      `${r?.reason || ""} ${r?.type || ""} ${r?.postId || ""} ${r?.reporterEmail || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [reports, query]);

  return (
    <section className="admin-table-panel">
      <header className="admin-table-head">
        <h3>Reports</h3>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reason/type/post/reporter"
        />
      </header>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Reason</th>
              <th>Type</th>
              <th>Post ID</th>
              <th>Reporter</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.reason || "N/A"}</td>
                <td>{r.type || "N/A"}</td>
                <td>{r.postId || r.anonymousPostId || "-"}</td>
                <td>{r.reporterEmail || "Unknown"}</td>
                <td>{r.resolved ? "Resolved" : "Open"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!error && filtered.length === 0 && <p className="admin-empty">No reports found.</p>}
    </section>
  );
}
