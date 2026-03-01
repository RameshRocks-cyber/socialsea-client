import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid
} from "recharts";
import api from "./api/axios";

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState({ users: [], posts: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/api/admin/dashboard/stats"),
      api.get("/api/admin/dashboard/charts?days=14")
    ])
      .then(([statsRes, chartsRes]) => {
        setStats(statsRes.data || {});
        setChartData({
          users: Array.isArray(chartsRes.data?.users) ? chartsRes.data.users : [],
          posts: Array.isArray(chartsRes.data?.posts) ? chartsRes.data.posts : []
        });
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load admin dashboard");
      });
  }, []);

  const topStats = useMemo(() => {
    const users = Number(stats?.users ?? stats?.totalUsers ?? 0);
    const posts = Number(stats?.posts ?? stats?.totalPosts ?? 0);
    const pending = Number(stats?.pendingAnonymous ?? stats?.pendingAnonymousPosts ?? 0);
    const reports = Number(stats?.unresolvedReports ?? stats?.reports ?? 0);
    return { users, posts, pending, reports };
  }, [stats]);

  const moderationPie = useMemo(
    () => [
      { name: "Users", value: topStats.users },
      { name: "Posts", value: topStats.posts },
      { name: "Pending", value: topStats.pending },
      { name: "Reports", value: topStats.reports }
    ],
    [topStats]
  );

  const growthSeries = useMemo(() => {
    const usersByDate = Object.fromEntries(
      chartData.users.map((x) => [String(x.label || x.name || x.date || ""), Number(x.value || 0)])
    );
    const postsByDate = Object.fromEntries(
      chartData.posts.map((x) => [String(x.label || x.name || x.date || ""), Number(x.value || 0)])
    );
    const labels = Array.from(new Set([...Object.keys(usersByDate), ...Object.keys(postsByDate)])).sort();
    return labels.map((label) => ({
      label: label.slice(5),
      users: usersByDate[label] || 0,
      posts: postsByDate[label] || 0
    }));
  }, [chartData]);

  return (
    <div className="admin-page-grid">
      {error && <p className="admin-error">{error}</p>}

      <section className="admin-stat-grid">
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/users")}>
          <p>Total Users</p>
          <h3>{topStats.users}</h3>
        </button>
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/posts")}>
          <p>Total Posts</p>
          <h3>{topStats.posts}</h3>
        </button>
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/anonymous/pending")}>
          <p>Pending Anonymous</p>
          <h3>{topStats.pending}</h3>
        </button>
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/reports")}>
          <p>Open Reports</p>
          <h3>{topStats.reports}</h3>
        </button>
      </section>

      <section className="admin-chart-panel">
        <header>
          <h3>Growth Trend (14 days)</h3>
          <p>Users vs Posts</p>
        </header>
        <div className="admin-chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={growthSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f335e" />
              <XAxis dataKey="label" stroke="#9fb6df" />
              <YAxis stroke="#9fb6df" />
              <Tooltip />
              <Line type="monotone" dataKey="users" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="posts" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="admin-chart-panel">
        <header>
          <h3>Totals Snapshot</h3>
          <p>Bar chart and pie split</p>
        </header>
        <div className="admin-split-chart">
          <div className="admin-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={moderationPie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f335e" />
                <XAxis dataKey="name" stroke="#9fb6df" />
                <YAxis stroke="#9fb6df" />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="admin-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={moderationPie} dataKey="value" nameKey="name" outerRadius={100} label>
                  {moderationPie.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
