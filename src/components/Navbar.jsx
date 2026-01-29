import { Link, useNavigate } from "react-router-dom";
import { isAuthenticated, getUserRole, logout } from "../auth";

export default function Navbar() {
  const role = getUserRole();
  const navigate = useNavigate();

  if (!isAuthenticated()) return null;

  return (
    <nav style={styles.nav}>
      <h3 style={styles.logo} onClick={() => navigate("/")}>
        SocialSea
      </h3>

      <div style={styles.links}>
        {/* USER LINKS */}
        {role === "USER" && (
          <>
            <Link to="/" style={styles.link}>Feed</Link>
            <Link to="/profile/user1" style={styles.link}>Profile</Link>
            <Link to="/anonymous/upload" style={styles.link}>Anonymous Upload</Link>
          </>
        )}

        {/* ADMIN LINKS */}
        {role === "ADMIN" && (
          <>
            <Link to="/admin/dashboard" style={styles.link}>Dashboard</Link>
            <Link to="/admin/pending" style={styles.link}>
              Pending Anonymous
            </Link>
            <Link to="/admin/reports" style={styles.link}>Reports</Link>
          </>
        )}

        <button onClick={logout} style={styles.logout}>
          Logout
        </button>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 24px",
    background: "#111",
    color: "#fff",
    alignItems: "center",
  },
  logo: {
    cursor: "pointer",
    margin: 0,
  },
  links: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
  },
  link: {
    color: "#ccc",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: "500"
  },
  logout: {
    background: "crimson",
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    cursor: "pointer",
    borderRadius: "4px",
    fontWeight: "bold"
  },
};
