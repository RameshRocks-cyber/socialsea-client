import { Link, useLocation } from "react-router-dom";
import { FiBell, FiHome, FiMessageSquare, FiSettings, FiUser, FiVideo } from "react-icons/fi";
import "./Navbar.css";

const ITEMS = [
  { to: "/feed", icon: FiHome, label: "Feed", match: (p) => p === "/feed" },
  { to: "/reels", icon: FiVideo, label: "Reels", match: (p) => p === "/reels" },
  { to: "/chat", icon: FiMessageSquare, label: "Chat", match: (p) => p === "/chat" },
  { to: "/notifications", icon: FiBell, label: "Alerts", match: (p) => p === "/notifications" },
  { to: "/settings", icon: FiSettings, label: "Settings", match: (p) => p === "/settings" },
  { to: "/profile/me", icon: FiUser, label: "Profile", match: (p) => p.startsWith("/profile") },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <header className="ss-nav-wrap">
      <nav className="ss-nav" aria-label="Main navigation">
        <Link to="/feed" className="ss-brand" aria-label="Go to feed">
          <img src="/logo.png?v=3" alt="SocialSea" className="ss-brand-logo" />
          <span className="ss-brand-text">SocialSea</span>
        </Link>

        <div className="ss-links">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.match(location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`ss-link ${active ? "is-active" : ""}`}
                title={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="ss-link-icon" />
                <span className="ss-link-text">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
