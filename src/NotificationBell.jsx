import { useContext } from "react";
import api from "./api/axios";
import { NotificationContext } from "./context/NotificationContext";

export default function NotificationBell() {
  const { count, setCount } = useContext(NotificationContext);

  const openNotifications = async () => {
    await api.post("/api/admin/notifications/read-all");
    setCount(0);
  };

  return (
    <div onClick={openNotifications} style={{ cursor: "pointer" }}>
      🔔
      {count > 0 && (
        <span style={{
          background: "red",
          color: "white",
          borderRadius: "50%",
          padding: "2px 6px",
          marginInlineStart: "4px"
        }}>
          {count}
        </span>
      )}
    </div>
  );
}