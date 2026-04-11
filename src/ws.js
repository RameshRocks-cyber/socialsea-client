import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client/dist/sockjs";
import { getApiBaseUrl } from "./api/baseUrl";

const getStoredToken = () =>
  sessionStorage.getItem("accessToken") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("token");

const resolveWsBase = () => {
  const apiBase = String(getApiBaseUrl() || "").trim();
  if (!apiBase) return "";
  const origin = typeof window !== "undefined" ? String(window.location.origin || "") : "";
  const absolute = apiBase.startsWith("/") ? `${origin}${apiBase}` : apiBase;
  return absolute.replace(/\/api\/?$/, "");
};

export const connectAdminNotifications = (onMessage) => {
  const token = String(getStoredToken() || "").trim();
  if (!token || typeof onMessage !== "function") return () => {};

  const wsBase = resolveWsBase();
  if (!wsBase) return () => {};

  let disposed = false;
  const client = new Client({
    webSocketFactory: () => new SockJS(`${wsBase}/ws?token=${encodeURIComponent(token)}`),
    connectHeaders: { Authorization: `Bearer ${token}` },
    reconnectDelay: 3000,
    debug: () => {},
  });

  const handleFrame = (frame) => {
    try {
      const payload = JSON.parse(frame?.body || "{}");
      if (!disposed && payload && typeof payload === "object") {
        onMessage(payload);
      }
    } catch {
      // ignore malformed payloads
    }
  };

  client.onConnect = () => {
    client.subscribe("/user/queue/admin.notifications", handleFrame);
    client.subscribe("/topic/admin/notifications", handleFrame);
  };

  client.onStompError = () => {};
  client.onWebSocketError = () => {};
  client.onWebSocketClose = () => {};
  client.activate();

  return () => {
    disposed = true;
    try {
      client.deactivate();
    } catch {
      // ignore teardown errors
    }
  };
};
