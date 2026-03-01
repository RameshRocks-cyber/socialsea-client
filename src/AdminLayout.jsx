import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import "./admin/AdminPanel.css";

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/posts", label: "Posts" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/anonymous/pending", label: "Pending Anonymous" }
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-brand">
          <span className="admin-brand-dot" />
          <h1>SocialSea Admin</h1>
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
            <h2>Admin Control Center</h2>
            <p>Users, posts, reports and moderation analytics</p>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
