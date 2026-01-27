import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { getRole } from "../api/auth";

export default function Navbar() {
  const [count, setCount] = useState(0);
  const role = getRole();

  useEffect(() => {
    api.get("/api/notifications/unread-count")
      .then(res => setCount(res.data))
      .catch(err => console.error("Failed to fetch notifications", err));
  }, []);

  return (
    <div style={styles.nav}>
      <h2 style={styles.logo}>SocialSea</h2>

      <div style={styles.links}>
        <Link to="/">🏠</Link>
        <Link to="/upload">➕</Link>
        <Link to="/anonymous-upload">anonymous</Link>
        <Link to="/anonymous-feed">👻</Link>
        <Link to="/reels">🎬</Link>
        <Link to="/profile/user1">👤</Link>
        {role === "ADMIN" && <Link to="/admin/dashboard">🧑‍⚖️ Admin</Link>}
        <Link to="/notifications">
          🔔 {count > 0 && <span style={{ color: "red" }}>{count}</span>}
        </Link>

      </div>
    </div>
  )
}

const styles = {
  nav: {
    height: 60,
    borderBottom: "1px solid #262626",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    position: "sticky",
    top: 0,
    background: "#000",
    zIndex: 10
  },
  logo: {
    fontWeight: "bold"
  },
  links: {
    display: "flex",
    gap: 20,
    fontSize: 20
  }
}
