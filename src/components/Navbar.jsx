import { Link, useNavigate } from "react-router-dom";
import { getUserRole } from "../auth";
import "./Navbar.css";

export default function Navbar() {
  const isLoggedIn = !!localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const role = getUserRole();
  const isAdmin = role === "ADMIN";
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="logo" onClick={() => navigate("/")}>
        <img src="/logo.png?v=3" alt="SocialSea" className="logo-img" />
        <span className="logo-text">SocialSea</span>
      </div>

      <div className="links">
        {!isAdmin && (
          <>
            {isLoggedIn && <Link to="/feed" className="nav-icon-link" title="Feed">{"\u2302"}</Link>}
            {isLoggedIn && <Link to="/reels" className="nav-icon-link" title="Reels">{"\u25B7"}</Link>}
            {isLoggedIn && (
              <Link to="/notifications" className="nav-icon-link" title="Notifications">
                {"\u{1F514}"}
              </Link>
            )}
            {isLoggedIn && (
              <Link to="/chat" className="nav-icon-link" title="Chat">
                {"\u2709"}
              </Link>
            )}
            {isLoggedIn && userId && (
              <Link to={`/profile/${userId}`} className="nav-icon-link" title="Profile">
                {"\u{1F464}"}
              </Link>
            )}
            {isLoggedIn && (
              <Link to="/anonymous/upload" className="nav-icon-link" title="Anonymous Upload">
                {"\u{1F47B}"}
              </Link>
            )}
            {isLoggedIn && (
              <Link to="/settings" className="nav-icon-link" title="Settings">
                {"\u2699"}
              </Link>
            )}
          </>
        )}

        {isAdmin && (
          <>
            <Link to="/admin/dashboard">Dashboard</Link>
            <Link to="/admin/pending">Pending Anonymous</Link>
            <Link to="/admin/reports">Reports</Link>
          </>
        )}

        {!isLoggedIn && <Link to="/login">Login</Link>}
        {!isLoggedIn && <Link to="/register">Create Account</Link>}
      </div>
    </nav>
  );
}
