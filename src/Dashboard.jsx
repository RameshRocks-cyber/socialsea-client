import { useEffect, useState } from "react";
import api from "./api/axios";
import DashboardCharts from "./DashboardCharts";

/* ===============================
   CSV DOWNLOAD HELPER (INLINE)
================================ */
async function downloadFile(url, filename) {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include" // keep admin auth
    });

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const blob = await response.blob();
    const link = document.createElement("a");

    link.href = window.URL.createObjectURL(blob);
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    console.error(err);
    alert("Failed to download file");
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(7);
  const [charts, setCharts] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/admin/dashboard/stats")
      .then((res) => setStats(res.data))
      .catch((err) => {
        console.error(err);
        setError("Failed to load dashboard stats");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .get(`/api/admin/dashboard/charts?days=${days}`)
      .then((res) => setCharts(res.data))
      .catch((err) => {
        console.error(err);
        setError("Failed to load dashboard charts");
      });
  }, [days]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;
  if (!stats) return <p>No dashboard data.</p>;

  return (
    <div>
      <h2>📊 Admin Dashboard</h2>

      {/* STATS CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "20px"
        }}
      >
        <Card title="👥 Users" value={stats.users} />
        <Card title="📝 Posts" value={stats.posts} />
        <Card title="🕵️ Pending Anonymous" value={stats.pendingAnonymous} />
        <Card title="🚨 Open Reports" value={stats.unresolvedReports} />
      </div>

      {/* DAY FILTER */}
      <div style={{ display: "flex", gap: 10, marginBlockStart: 20 }}>
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: "6px 12px",
              background: days === d ? "#4f46e5" : "#e5e7eb",
              color: days === d ? "#fff" : "#000",
              borderRadius: 6,
              border: "none",
              cursor: "pointer"
            }}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {/* EXPORT BUTTONS */}
      <div style={{ display: "flex", gap: 10, marginBlockStart: 20 }}>
        <button
          onClick={() =>
            downloadFile(
              `${import.meta.env.VITE_API_URL}/api/admin/dashboard/export/users?days=${days}`,
              `users_last_${days}_days.csv`
            )
          }
        >
          ⬇️ Export Users CSV
        </button>

        <button
          onClick={() =>
            downloadFile(
              `${import.meta.env.VITE_API_URL}/api/admin/dashboard/export/posts?days=${days}`,
              `posts_last_${days}_days.csv`
            )
          }
        >
          ⬇️ Export Posts CSV
        </button>
      </div>

      {/* CHARTS */}
      {charts && <DashboardCharts data={charts} />}
    </div>
  );
}

/* ===============================
   CARD COMPONENT
================================ */
function Card({ title, value }) {
  return (
    <div
      style={{
        padding: "20px",
        background: "#fff",
        borderRadius: "8px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
        color: "black"
      }}
    >
      <h4>{title}</h4>
      <h1>{value}</h1>
    </div>
  );
}
