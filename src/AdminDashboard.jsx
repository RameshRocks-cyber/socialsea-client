import { Link } from "react-router-dom";

export default function AdminDashboard() {
  return (
    <>
      <div style={{ padding: "20px" }}>
        <h2>🛡️ Admin Dashboard</h2>

        <div style={{ display: "flex", gap: "20px", marginBlockStart: "20px" }}>
          <Link to="/admin/pending">
            <button>🕵️ Pending Anonymous Posts</button>
          </Link>

          <Link to="/admin/reports">
            <button>🚩 Reported Posts</button>
          </Link>
        </div>
      </div>
    </>
  );
}