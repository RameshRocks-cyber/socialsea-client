import { useContext, useEffect } from "react";
import { NotificationContext } from "./context/NotificationContext";
import { connectAdminNotifications } from "./ws";

export function useAdminNotifications() {
  const { setCount, setItems } = useContext(NotificationContext);

  useEffect(() => {
    connectAdminNotifications((notification) => {
      setItems((prev) => [notification, ...prev]);
      setCount((c) => c + 1);
    });
  }, []);
}