import api from "../api/axios";

const SW_URL = "/push-sw.js";
const PUSH_SUBSCRIBE_TIMEOUT_MS = 12000;
const PROMPTED_KEY = "socialsea_push_permission_prompted_v1";

let inflightInit = null;

const isSecureLocalhost = () => {
  if (typeof window === "undefined") return false;
  const host = String(window.location.hostname || "").trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
};

const isSupported = () =>
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const base64UrlToUint8Array = (base64Url) => {
  const raw = String(base64Url || "").trim();
  const padding = "=".repeat((4 - (raw.length % 4)) % 4);
  const normalized = (raw + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

const rememberPrompted = () => {
  try {
    localStorage.setItem(PROMPTED_KEY, "1");
  } catch {
    // ignore storage errors
  }
};

const hasPromptedBefore = () => {
  try {
    return localStorage.getItem(PROMPTED_KEY) === "1";
  } catch {
    return false;
  }
};

const registerWorker = async () => {
  await navigator.serviceWorker.register(SW_URL);
  return navigator.serviceWorker.ready;
};

const fetchPushConfig = async () => {
  const res = await api.get("/api/notifications/push/config", {
    suppressAuthRedirect: true,
    bypassEndpointGuard: true,
    timeout: PUSH_SUBSCRIBE_TIMEOUT_MS
  });
  return {
    configured: Boolean(res?.data?.configured),
    publicKey: String(res?.data?.publicKey || "").trim()
  };
};

const syncSubscriptionToServer = async (subscriptionJson) => {
  await api.post("/api/notifications/push/subscribe", subscriptionJson, {
    suppressAuthRedirect: true,
    bypassEndpointGuard: true,
    timeout: PUSH_SUBSCRIBE_TIMEOUT_MS
  });
};

export const initializeWebPush = async ({ promptIfNeeded = false } = {}) => {
  if (!isSupported()) return { ok: false, reason: "unsupported" };
  if (!window.isSecureContext && !isSecureLocalhost()) return { ok: false, reason: "insecure-context" };

  if (!inflightInit) {
    inflightInit = (async () => {
      const registration = await registerWorker();

      let permission = Notification.permission;
      if (permission === "default" && promptIfNeeded) {
        rememberPrompted();
        permission = await Notification.requestPermission().catch(() => "default");
      } else if (permission === "default" && !promptIfNeeded && hasPromptedBefore()) {
        // No-op: keep waiting for explicit user interaction.
      }

      if (permission !== "granted") {
        return { ok: false, reason: permission === "denied" ? "denied" : "not-granted" };
      }

      const pushConfig = await fetchPushConfig();
      if (!pushConfig.configured || !pushConfig.publicKey) {
        return { ok: false, reason: "server-not-configured" };
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(pushConfig.publicKey)
        });
      }

      const subscriptionJson = subscription?.toJSON?.() || null;
      if (!subscriptionJson?.endpoint || !subscriptionJson?.keys?.p256dh || !subscriptionJson?.keys?.auth) {
        return { ok: false, reason: "invalid-subscription" };
      }

      await syncSubscriptionToServer(subscriptionJson);
      return { ok: true };
    })().finally(() => {
      inflightInit = null;
    });
  }

  return inflightInit;
};
