import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell
} from "recharts";

const COLORS = ["#22c55e", "#facc15", "#ef4444"];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/api/admin/dashboard/stats").then(res => setStats(res.data));
  }, []);

  if (!stats) return <p>Loading...</p>;

  const chartData = [
    { name: "Approved", value: stats.approvedPosts },
    { name: "Pending", value: stats.pendingPosts },
    { name: "Rejected", value: stats.rejectedPosts }
  ];

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Dashboard</h2>

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