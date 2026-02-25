import { useEffect, useState } from "react";
import api from "../api/axios";
import AdminNavbar from "./AdminNavbar";

export default function AdminNotifications() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/admin/notifications").then(res => {
      setItems(res.data);
    });
  }, []);

  const markRead = async (id) => {
    await api.post(`/admin/notifications/${id}/read`);
    setItems(items.filter(n => n.id !== id));
  };

  return (
    <>
      <AdminNavbar />
      <div style={{ padding: "20px" }}>
        <h2>🔔 Notifications</h2>

        {items.length === 0 && <p>No new notifications</p>}

        {items.map(n => (
          <div key={n.id} style={{ borderBottom: "1px solid #ddd", padding: 10 }}>
            <strong>{n.title}</strong>
            <p>{n.message}</p>
            <button onClick={() => markRead(n.id)}>Mark as read</button>
          </div>
        ))}
      </div>
    </>
  );
}