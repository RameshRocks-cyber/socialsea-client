import { useAuth } from "./context/AuthContext";

export default function AdminNavbar() {
  const { logout } = useAuth();

  return (
    <div style={{
      padding: "10px 20px",
      background: "#111",
      color: "#fff",
      display: "flex",
      justifyContent: "space-between"
    }}>
      <strong>SocialSea Admin</strong>
      <button onClick={logout}>Logout</button>
    </div>
  );
}