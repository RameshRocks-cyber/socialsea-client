import { useEffect, useState } from "react";
import { connectSocket } from "../websocket/socket";

export default function UserNotifications({ email }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    connectSocket(email, (n) => {
      setNotifications(prev => [n, ...prev]);
    });
  }, [email]);

  return (
    <div>
      <h3>Notifications</h3>
      {notifications.map((n, i) => (
        <div key={i}>{n.message}</div>
      ))}
    </div>
  );
}