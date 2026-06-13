import { useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "./api/axios";
import { adminNotificationsQueryKey } from "./api/queryKeys";
import { NotificationContext } from "./context/NotificationContext";

export default function NotificationBell() {
  const { count, setCount } = useContext(NotificationContext);
  const queryClient = useQueryClient();

  const openNotifications = async () => {
    await api.post("/api/admin/notifications/read-all");
    setCount(0);
    void queryClient.invalidateQueries({ queryKey: adminNotificationsQueryKey() });
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
