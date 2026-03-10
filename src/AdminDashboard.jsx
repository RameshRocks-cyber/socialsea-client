import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from "recharts";
import api from "./api/axios";
import {
  buildGrowthEstimate,
  formatCompact,
  formatDateTime,
  getCreatedAt,
  getPostComments,
  getPostLikes,
  getPostOwner,
  getPostViews,
  getUserDisplayName,
  loadModerationNotices,
  toNumber
} from "./admin/adminMetrics";

const PIE_COLORS = ["#56b6ff", "#3ddc97", "#ffca6b", "#ff6b81"];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState({ users: [], posts: [] });
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([
      api.get("/api/admin/dashboard/stats"),
      api.get("/api/admin/dashboard/charts?days=14"),
      api.get("/api/admin/users"),
      api.get("/api/admin/posts"),
      api.get("/api/admin/reports")
    ])
      .then(([statsRes, chartsRes, usersRes, postsRes, reportsRes]) => {
        const firstError = [statsRes, chartsRes, usersRes, postsRes, reportsRes].find((item) => item.status === "rejected");
        if (firstError) {
          setError("Some admin metrics could not be loaded. Showing available data.");
        }

        if (statsRes.status === "fulfilled") setStats(statsRes.value.data || {});
        if (chartsRes.status === "fulfilled") {
          setChartData({
            users: Array.isArray(chartsRes.value.data?.users) ? chartsRes.value.data.users : [],
            posts: Array.isArray(chartsRes.value.data?.posts) ? chartsRes.value.data.posts : []
          });
        }
        if (usersRes.status === "fulfilled") setUsers(Array.isArray(usersRes.value.data) ? usersRes.value.data : []);
        if (postsRes.status === "fulfilled") setPosts(Array.isArray(postsRes.value.data) ? postsRes.value.data : []);
        if (reportsRes.status === "fulfilled") setReports(Array.isArray(reportsRes.value.data) ? reportsRes.value.data : []);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load admin dashboard");
      });
  }, []);

  const moderationNotices = useMemo(() => loadModerationNotices(), []);

  const topStats = useMemo(() => {
    const totalUsers = Math.max(toNumber(stats?.users ?? stats?.totalUsers), users.length);
    const totalPosts = Math.max(toNumber(stats?.posts ?? stats?.totalPosts), posts.length);
    const pendingAnonymous = toNumber(stats?.pendingAnonymous ?? stats?.pendingAnonymousPosts);
    const openReports = Math.max(
      toNumber(stats?.unresolvedReports ?? stats?.reports),
      reports.filter((item) => !item?.resolved).length
    );
    const bannedUsers = users.filter((user) => user?.banned).length;
    const likes = posts.reduce((sum, post) => sum + getPostLikes(post), 0);
    const comments = posts.reduce((sum, post) => sum + getPostComments(post), 0);
    const views = posts.reduce((sum, post) => sum + getPostViews(post), 0);

    return {
      totalUsers,
      totalPosts,
      pendingAnonymous,
      openReports,
      bannedUsers,
      likes,
      comments,
      views
    };
  }, [posts, reports, stats, users]);

  const moderationPie = useMemo(
    () => [
      { name: "Open Reports", value: topStats.openReports },
      { name: "Yellow Notices", value: moderationNotices.filter((item) => item.severity === "yellow").length },
      { name: "Red Notices", value: moderationNotices.filter((item) => item.severity === "red").length },
      { name: "Banned Users", value: topStats.bannedUsers }
    ],
    [moderationNotices, topStats]
  );

  const growthSeries = useMemo(() => {
    const pointValue = (x) => toNumber(x?.value ?? x?.count ?? x?.total ?? 0);
    const usersByDate = Object.fromEntries(
      chartData.users.map((x) => [String(x?.label || x?.name || x?.date || ""), pointValue(x)])
    );
    const postsByDate = Object.fromEntries(
      chartData.posts.map((x) => [String(x?.label || x?.name || x?.date || ""), pointValue(x)])
    );
    const labels = Array.from(new Set([...Object.keys(usersByDate), ...Object.keys(postsByDate)])).sort();
    return labels.map((label) => ({
      label: label.slice(5) || label,
      rawLabel: label,
      users: usersByDate[label] || 0,
      posts: postsByDate[label] || 0
    }));
  }, [chartData]);

  const userGrowth = useMemo(
    () => buildGrowthEstimate(growthSeries.map((item) => ({ label: item.rawLabel, value: item.users }))),
    [growthSeries]
  );
  const postGrowth = useMemo(
    () => buildGrowthEstimate(growthSeries.map((item) => ({ label: item.rawLabel, value: item.posts }))),
    [growthSeries]
  );

  const recentUsers = useMemo(() => {
    return [...users]
      .sort((a, b) => new Date(getCreatedAt(b) || 0) - new Date(getCreatedAt(a) || 0))
      .slice(0, 5);
  }, [users]);

  const riskyPosts = useMemo(() => {
    const reportCounts = reports.reduce((acc, report) => {
      const key = Number(report?.postId || report?.anonymousPostId || 0);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return [...posts]
      .map((post) => ({
        ...post,
        reportCount: reportCounts[Number(post?.id)] || 0,
        engagement: getPostLikes(post) + getPostComments(post) + getPostViews(post)
      }))
      .sort((a, b) => b.reportCount - a.reportCount || b.engagement - a.engagement)
      .slice(0, 5);
  }, [posts, reports]);

  const mostActivePosts = useMemo(() => {
    return [...posts]
      .map((post) => ({
        ...post,
        likes: getPostLikes(post),
        comments: getPostComments(post),
        views: getPostViews(post)
      }))
      .sort((a, b) => b.views + b.likes + b.comments - (a.views + a.likes + a.comments))
      .slice(0, 6);
  }, [posts]);

  return (
    <div className="admin-page-grid">
      {error && <p className="admin-error">{error}</p>}

      <section className="admin-hero-panel">
        <div>
          <span className="admin-eyebrow">Live platform overview</span>
          <h3>Moderate the network without losing sight of growth.</h3>
          <p>
            The dashboard combines user totals, post engagement, moderation notices and 14-day trend estimates from the
            current admin APIs.
          </p>
        </div>
        <div className="admin-hero-metrics">
          <div className="admin-hero-chip">
            <strong>{topStats.totalUsers}</strong>
            <span>Users tracked</span>
          </div>
          <div className="admin-hero-chip">
            <strong>{formatCompact(topStats.views + topStats.likes + topStats.comments)}</strong>
            <span>Total interactions</span>
          </div>
          <div className="admin-hero-chip danger">
            <strong>{topStats.openReports}</strong>
            <span>Items need review</span>
          </div>
        </div>
      </section>

      <section className="admin-stat-grid admin-stat-grid-wide">
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/users")}>
          <p>Total Users</p>
          <h3>{topStats.totalUsers}</h3>
          <span>{topStats.bannedUsers} banned or removed from access</span>
        </button>
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/posts")}>
          <p>Total Posts</p>
          <h3>{topStats.totalPosts}</h3>
          <span>{formatCompact(topStats.views)} total views observed</span>
        </button>
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/reports")}>
          <p>Open Reports</p>
          <h3>{topStats.openReports}</h3>
          <span>{moderationNotices.length} notice events logged</span>
        </button>
        <button type="button" className="admin-stat-card" onClick={() => navigate("/admin/anonymous/pending")}>
          <p>Pending Anonymous</p>
          <h3>{topStats.pendingAnonymous}</h3>
          <span>Requires publish moderation</span>
        </button>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Likes</p>
          <h3>{formatCompact(topStats.likes)}</h3>
          <span>Across admin post dataset</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Comments</p>
          <h3>{formatCompact(topStats.comments)}</h3>
          <span>Conversation health signal</span>
        </div>
      </section>

      <section className="admin-chart-panel">
        <header>
          <h3>Growth Trend</h3>
          <p>
            User trend: {userGrowth.trend} ({userGrowth.deltaPct.toFixed(1)}%). Post trend: {postGrowth.trend} (
            {postGrowth.deltaPct.toFixed(1)}%).
          </p>
        </header>
        <div className="admin-chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={growthSeries}>
              <defs>
                <linearGradient id="usersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#56b6ff" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#56b6ff" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="postsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3ddc97" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#3ddc97" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#23385f" />
              <XAxis dataKey="label" stroke="#9fb6df" />
              <YAxis stroke="#9fb6df" />
              <Tooltip />
              <Area type="monotone" dataKey="users" stroke="#56b6ff" fill="url(#usersFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="posts" stroke="#3ddc97" fill="url(#postsFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="admin-insight-grid">
          <article className="admin-insight-card">
            <span className="admin-insight-label">Projected next user mark</span>
            <strong>{userGrowth.nextValue}</strong>
            <p>{userGrowth.dailyAverage.toFixed(1)} average net new users per chart interval.</p>
          </article>
          <article className="admin-insight-card">
            <span className="admin-insight-label">Projected next post mark</span>
            <strong>{postGrowth.nextValue}</strong>
            <p>{postGrowth.dailyAverage.toFixed(1)} average net new posts per chart interval.</p>
          </article>
          <article className="admin-insight-card">
            <span className="admin-insight-label">Engagement per post</span>
            <strong>{topStats.totalPosts ? ((topStats.likes + topStats.comments + topStats.views) / topStats.totalPosts).toFixed(1) : "0.0"}</strong>
            <p>Average likes, comments and views combined.</p>
          </article>
        </div>
      </section>

      <section className="admin-chart-panel">
        <header>
          <h3>Moderation Mix</h3>
          <p>Warnings and risk indicators based on reports, bans and local admin notice logs.</p>
        </header>
        <div className="admin-split-chart">
          <div className="admin-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={moderationPie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23385f" />
                <XAxis dataKey="name" stroke="#9fb6df" />
                <YAxis stroke="#9fb6df" />
                <Tooltip />
                <Bar dataKey="value" fill="#56b6ff" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="admin-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={moderationPie} dataKey="value" nameKey="name" outerRadius={94} label>
                  {moderationPie.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head">
          <h3>Newest Users</h3>
          <button type="button" className="admin-link-btn" onClick={() => navigate("/admin/users")}>
            Open user search
          </button>
        </header>
        <div className="admin-mini-list">
          {recentUsers.map((user) => (
            <article key={user.id} className="admin-mini-card">
              <div>
                <strong>{getUserDisplayName(user)}</strong>
                <p>{user.email || "No email"}</p>
              </div>
              <div className="admin-mini-meta">
                <span>{user.role || "USER"}</span>
                <span>{formatDateTime(getCreatedAt(user))}</span>
              </div>
            </article>
          ))}
          {!recentUsers.length && <p className="admin-empty">No recent users found.</p>}
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head">
          <h3>Posts To Watch</h3>
          <button type="button" className="admin-link-btn" onClick={() => navigate("/admin/posts")}>
            Open post controls
          </button>
        </header>
        <div className="admin-mini-list">
          {riskyPosts.map((post) => (
            <article key={post.id} className="admin-mini-card">
              <div>
                <strong>Post #{post.id}</strong>
                <p>{getPostOwner(post)} • {post.reportCount} report(s)</p>
              </div>
              <div className="admin-mini-meta">
                <span>{getPostLikes(post)} likes</span>
                <span>{getPostComments(post)} comments</span>
                <span>{getPostViews(post)} views</span>
              </div>
            </article>
          ))}
          {!riskyPosts.length && <p className="admin-empty">No high-risk posts found.</p>}
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head">
          <h3>Top Engagement Posts</h3>
          <span className="admin-head-note">Based on likes, views and comments returned by admin data.</span>
        </header>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Owner</th>
                <th>Likes</th>
                <th>Comments</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {mostActivePosts.map((post) => (
                <tr key={post.id}>
                  <td>#{post.id}</td>
                  <td>{getPostOwner(post)}</td>
                  <td>{post.likes}</td>
                  <td>{post.comments}</td>
                  <td>{post.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
