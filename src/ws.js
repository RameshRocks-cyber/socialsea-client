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

export const connectUserNotifications = (email, onMessage) => {
  const token = String(getStoredToken() || "").trim();
  const recipient = String(email || "").trim().toLowerCase();
  if (!token || !recipient || typeof onMessage !== "function") return () => {};

  const wsBase = resolveWsBase();
  if (!wsBase) return () => {};

  let disposed = false;
  const seenKeys = new Set();
  const remember = (payload) => {
    const key = [
      String(payload?.id ?? ""),
      String(payload?.type ?? ""),
      String(payload?.recipient ?? ""),
      String(payload?.message ?? ""),
      String(payload?.createdAt ?? payload?.time ?? payload?.at ?? "")
    ].join("|");
    if (!key || key === "||||") return true;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    if (seenKeys.size > 1200) {
      const recent = Array.from(seenKeys).slice(-600);
      seenKeys.clear();
      recent.forEach((item) => seenKeys.add(item));
    }
    return true;
  };
  const client = new Client({
    webSocketFactory: () => new SockJS(`${wsBase}/ws?token=${encodeURIComponent(token)}`),
    connectHeaders: { Authorization: `Bearer ${token}` },
    reconnectDelay: 3000,
    debug: () => {}
  });

  const handleFrame = (frame) => {
    try {
      const payload = JSON.parse(frame?.body || "{}");
      if (!disposed && payload && typeof payload === "object" && remember(payload)) {
        onMessage(payload);
      }
    } catch {
      // ignore malformed payloads
    }
  };

  client.onConnect = () => {
    client.subscribe("/user/queue/notifications", handleFrame);
    client.subscribe(`/topic/notifications/${recipient}`, handleFrame);
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
