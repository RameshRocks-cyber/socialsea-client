self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event?.data ? event.data.json() : {};
  } catch {
    data = { body: event?.data ? event.data.text() : "You have a new notification." };
  }

  const title = String(data?.title || "SocialSea").trim() || "SocialSea";
  const body = String(data?.body || data?.message || "You have a new notification.").trim();
  const url = String(data?.url || "/notifications").trim() || "/notifications";

  const options = {
    body,
    icon: String(data?.icon || "/logo.png").trim() || "/logo.png",
    badge: String(data?.badge || "/logo-clean-round.png").trim() || "/logo-clean-round.png",
    data: {
      url
    },
    tag: String(data?.tag || data?.type || "socialsea-notification").trim() || "socialsea-notification",
    renotify: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = String(event?.notification?.data?.url || "/notifications").trim() || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          try {
            const current = new URL(client.url);
            const target = new URL(targetUrl, self.location.origin);
            if (current.origin === target.origin) {
              client.focus();
              if ("navigate" in client) {
                client.navigate(target.href).catch(() => {});
              }
              return;
            }
          } catch {
            // continue to open fallback
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

