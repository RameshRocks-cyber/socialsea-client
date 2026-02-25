import { useEffect, useState } from "react";
import { getAdminDashboard } from "../../api/admin";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminDashboard()
      .then((res) => setStats(res.data))
      .catch(() => alert("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: 20, color: "white" }}>Loading dashboard...</p>;

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h1>Admin Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
        <Card title="Users" value={stats?.totalUsers || 0} />
        <Card title="Posts" value={stats?.totalPosts || 0} />
        <Card title="Pending Anonymous" value={stats?.pendingAnonymousPosts || 0} />
        <Card title="Reports" value={stats?.reports || 0} />
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 10,
        background: "#111",
        color: "#fff",
        textAlign: "center",
        border: "1px solid #333"
      }}
    >
      <h3>{title}</h3>
      <h1>{value}</h1>
    </div>
  );
}