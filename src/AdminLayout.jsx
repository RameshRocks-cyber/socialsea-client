import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import "./admin/AdminPanel.css";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/posts", label: "Posts" },
  { to: "/admin/live-recordings", label: "Live Recordings" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/anonymous/pending", label: "Pending Anonymous" },
  { to: "/admin/notifications", label: "Alerts" }
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-brand">
          <span className="admin-brand-dot" />
          <div>
            <h1>SocialSea Command</h1>
            <p>Moderation and growth intelligence</p>
          </div>
        </div>
        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="admin-menu-btn" onClick={() => setSidebarOpen((s) => !s)}>
            Menu
          </button>
          <div className="admin-topbar-title">
            <h2>Trust, Safety and Growth Console</h2>
            <p>Search users, monitor posts, issue notices and control platform risk</p>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
