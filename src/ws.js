import { Client } from "@stomp/stompjs";
import { getApiBaseUrl } from "./api/baseUrl";

const WS_RECONNECT_DELAY_MS = 12000;
const WS_MAX_RECONNECT_DELAY_MS = 60000;
const WS_CONNECT_DELAY_MS = import.meta.env?.DEV ? 120 : 0;
const SOCKJS_OPTIONS = { transports: ["websocket"] };
const WS_TRANSPORT_MODE = String(import.meta.env?.VITE_WS_TRANSPORT || "ws")
  .trim()
  .toLowerCase();

const normalizeWsEndpoint = (value, fallback) => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
};

const WS_NATIVE_ENDPOINT = normalizeWsEndpoint(import.meta.env?.VITE_WS_NATIVE_ENDPOINT, "/ws-native");
const WS_SOCKJS_ENDPOINT = normalizeWsEndpoint(import.meta.env?.VITE_WS_SOCKJS_ENDPOINT, "/ws");

const shouldUseSockJsTransport = () => !["ws", "websocket", "native"].includes(WS_TRANSPORT_MODE);

let sockJsImportPromise = null;
const loadSockJs = async () => {
  if (!sockJsImportPromise) {
    sockJsImportPromise = import("sockjs-client/dist/sockjs").then((mod) => mod?.default || mod);
  }
  return sockJsImportPromise;
};

const getStoredToken = () =>
  sessionStorage.getItem("accessToken") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("token");

const normalizeAbsoluteBase = (rawValue) => {
  const value = String(rawValue || "").trim().replace(/\/+$/, "");
  if (!value || !/^https?:\/\//i.test(value)) return "";
  return value;
};

const resolveWsBase = () => {
  const apiBase = String(getApiBaseUrl() || "").trim();
  const origin = typeof window !== "undefined" ? String(window.location.origin || "") : "";
  const runtimeHost = typeof window !== "undefined" ? String(window.location.hostname || "").toLowerCase() : "";
  const isLoopbackRuntime = runtimeHost === "localhost" || runtimeHost === "127.0.0.1";

  if (import.meta.env?.DEV && isLoopbackRuntime && apiBase.startsWith("/")) {
    const devTarget = normalizeAbsoluteBase(import.meta.env?.VITE_DEV_PROXY_TARGET);
    if (devTarget) {
      const isHttpsPage =
        typeof window !== "undefined" && String(window.location.protocol || "").toLowerCase() === "https:";
      if (!(isHttpsPage && /^http:\/\//i.test(devTarget))) {
        return devTarget.replace(/\/api\/?$/, "");
      }
    }
  }

  if (!apiBase) return "";
  const absolute = apiBase.startsWith("/") ? `${origin}${apiBase}` : apiBase;
  return absolute.replace(/\/api\/?$/, "");
};

const toWsOrigin = (base) => {
  const normalized = String(base || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  return normalized.startsWith("ws") ? normalized : normalized.replace(/^http/i, "ws");
};

const buildNativeBrokerUrl = (wsBase, token) =>
  `${toWsOrigin(wsBase)}${WS_NATIVE_ENDPOINT}?token=${encodeURIComponent(token)}`;

const buildSockJsUrl = (wsBase, token) =>
  `${String(wsBase || "").trim().replace(/\/+$/, "")}${WS_SOCKJS_ENDPOINT}?token=${encodeURIComponent(token)}`;

const createStompClient = async (token, wsBase) => {
  const common = {
    connectHeaders: { Authorization: `Bearer ${token}` },
    reconnectDelay: WS_RECONNECT_DELAY_MS,
    maxReconnectDelay: WS_MAX_RECONNECT_DELAY_MS,
    debug: () => {},
  };

  if (shouldUseSockJsTransport()) {
    const SockJS = await loadSockJs();
    return new Client({
      ...common,
      webSocketFactory: () => new SockJS(buildSockJsUrl(wsBase, token), undefined, SOCKJS_OPTIONS),
    });
  }

  return new Client({
    ...common,
    brokerURL: buildNativeBrokerUrl(wsBase, token),
  });
};

export const connectAdminNotifications = (onMessage) => {
  const token = String(getStoredToken() || "").trim();
  if (!token || typeof onMessage !== "function") return () => {};

  const wsBase = resolveWsBase();
  if (!wsBase) return () => {};

  let disposed = false;
  let client = null;
  let activated = false;
  let activateTimer = 0;

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

  const activateClient = () => {
    if (disposed || !client) return;
    activated = true;
    client.activate();
  };

  const init = async () => {
    client = await createStompClient(token, wsBase);
    if (disposed || !client) return;

    client.onConnect = () => {
      client.subscribe("/user/queue/admin.notifications", handleFrame);
      client.subscribe("/topic/admin/notifications", handleFrame);
    };

    client.onStompError = () => {};
    client.onWebSocketError = () => {};
    client.onWebSocketClose = () => {};

    if (WS_CONNECT_DELAY_MS > 0) {
      activateTimer = window.setTimeout(activateClient, WS_CONNECT_DELAY_MS);
    } else {
      activateClient();
    }
  };
  void init();

  return () => {
    disposed = true;
    if (activateTimer) {
      clearTimeout(activateTimer);
      activateTimer = 0;
    }
    try {
      // Skip deactivation if activation never started (dev strict-mode mount/unmount cycle).
      if (client && (activated || client.active || client.connected)) {
        void client.deactivate();
      }
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
  let client = null;
  let activated = false;
  let activateTimer = 0;

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

  const activateClient = () => {
    if (disposed || !client) return;
    activated = true;
    client.activate();
  };

  const init = async () => {
    client = await createStompClient(token, wsBase);
    if (disposed || !client) return;

    client.onConnect = () => {
      client.subscribe("/user/queue/notifications", handleFrame);
      client.subscribe(`/topic/notifications/${recipient}`, handleFrame);
    };

    client.onStompError = () => {};
    client.onWebSocketError = () => {};
    client.onWebSocketClose = () => {};

    if (WS_CONNECT_DELAY_MS > 0) {
      activateTimer = window.setTimeout(activateClient, WS_CONNECT_DELAY_MS);
    } else {
      activateClient();
    }
  };
  void init();

  return () => {
    disposed = true;
    if (activateTimer) {
      clearTimeout(activateTimer);
      activateTimer = 0;
    }
    try {
      // Skip deactivation if activation never started (dev strict-mode mount/unmount cycle).
      if (client && (activated || client.active || client.connected)) {
        void client.deactivate();
      }
    } catch {
      // ignore teardown errors
    }
  };
};
