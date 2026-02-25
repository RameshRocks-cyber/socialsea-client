import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "./api/axios";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/api/admin/dashboard/stats")
      .then((res) => setStats(res.data || null))
      .catch((err) => {
        console.error(err);
        setStats(null);
      });
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2>Admin Dashboard</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(140px, 1fr))",
          gap: "12px",
          marginTop: "12px",
          marginBottom: "18px"
        }}
      >
        <StatCard label="Users" value={stats?.users ?? "-"} />
        <StatCard label="Posts" value={stats?.posts ?? "-"} />
        <StatCard label="Likes" value={stats?.likes ?? "-"} />
      </div>

      <div style={{ display: "flex", gap: "20px", marginBlockStart: "20px", flexWrap: "wrap" }}>
        <Link to="/admin/dashboard">
          <button>📊 Analytics</button>
        </Link>

        <Link to="/admin/pending">
          <button>🕵️ Pending Posts</button>
        </Link>

        <Link to="/admin/reports">
          <button>🚩 Reported Posts</button>
        </Link>

        <Link to="/admin/notifications">
          <button>🔔 Notifications</button>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #2d3e68",
        borderRadius: 10,
        padding: 12,
        background: "#0e162f",
        color: "#eaf1ff"
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
