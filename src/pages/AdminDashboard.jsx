import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell
} from "recharts";

const COLORS = ["#22c55e", "#facc15", "#ef4444"];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/admin/dashboard")
      .then(res => setStats(res.data))
      .catch(err => {
        console.error(err);
        setError("Failed to load dashboard");
      });
  }, []);

  if (error) return <p>{error}</p>;
  if (!stats) return <p>Loading...</p>;

  const chartData = [
    { name: "Total Posts", value: stats.totalPosts || 0 },
    { name: "Pending Anonymous", value: stats.pendingAnonymousPosts || 0 },
    { name: "Reports", value: stats.reports || 0 }
  ];

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Dashboard</h2>

      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <StatCard title="Total Users" value={stats.totalUsers || 0} />
        <StatCard title="Total Posts" value={stats.totalPosts || 0} />
        <StatCard title="Pending Anonymous" value={stats.pendingAnonymousPosts || 0} />
        <StatCard title="Reports" value={stats.reports || 0} />
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        <BarChart width={400} height={300} data={chartData}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#6366f1" />
        </BarChart>

        <PieChart width={300} height={300}>
          <Pie
            data={chartData}
            dataKey="value"
            outerRadius={100}
            label
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={{
      background: "#1f2937",
      color: "white",
      padding: 16,
      borderRadius: 8,
      minWidth: 140
    }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}
