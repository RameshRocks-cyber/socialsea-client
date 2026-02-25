import { useEffect, useState } from "react";
import api from "./api/axios";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get("/api/admin/notifications").then(res => {
      setNotifications(res.data);
    });
  }, []);

  const markRead = async (id) => {
    await api.post(`/api/admin/notifications/${id}/read`);
    setNotifications((prev) =>
      prev.map(n =>
        n.id === id ? { ...n, read: true } : n
      )
    );
  };

  return (
    <div>
      <h2>📜 Notifications</h2>

      {notifications.map(n => (
        <div
          key={n.id}
          style={{
            padding: "10px",
            marginBlockEnd: "8px",
            background: n.read ? "#f1f1f1" : "#ffecec",
            borderInlineStart: n.read ? "4px solid green" : "4px solid red",
            cursor: "pointer"
          }}
          onClick={() => markRead(n.id)}
        >
          <p>{n.message}</p>
          <small>{new Date(n.createdAt).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}