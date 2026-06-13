import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "./api/axios";
import { adminNotificationsQueryKey } from "./api/queryKeys";
import "./NotificationsPage.css";

const fetchAdminNotifications = async () => {
  try {
    const res = await api.get("/api/admin/notifications");
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: adminNotificationsQueryKey(),
    queryFn: fetchAdminNotifications,
    staleTime: 30_000,
    retry: 1
  });
  const notifications = Array.isArray(notificationsQuery.data) ? notificationsQuery.data : [];
  const loading = notificationsQuery.isPending && notifications.length === 0;

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markReadMutation = useMutation({
    mutationFn: async (id) => {
      await api.post(`/api/admin/notifications/${id}/read`);
      return id;
    },
    onMutate: async (id) => {
      const queryKey = adminNotificationsQueryKey();
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current) =>
        (Array.isArray(current) ? current : []).map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(adminNotificationsQueryKey(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: adminNotificationsQueryKey() });
    }
  });

  const markRead = (id) => {
    markReadMutation.mutate(id);
  };

  const getKind = (message = "") => {
    const text = String(message).toLowerCase();
    if (text.includes("emergency") || text.includes("sos")) return "emergency";
    if (text.includes("report")) return "report";
    if (text.includes("warning") || text.includes("violation")) return "warning";
    return "info";
  };

  return (
    <div className="admin-notifs-page">
      <header className="admin-notifs-hero">
        <div className="admin-notifs-title">
          <p className="admin-notifs-eyebrow">Trust, Safety & Growth Console</p>
          <h2>Notifications</h2>
          <p className="admin-notifs-subtitle">
            Review platform alerts and mark handled items in one place.
          </p>
        </div>
        <div className="admin-notifs-stats">
          <div className="admin-notifs-stat">
            <span className="admin-notifs-stat-label">Unread</span>
            <strong className="admin-notifs-stat-value">{unreadCount}</strong>
          </div>
          <div className="admin-notifs-stat">
            <span className="admin-notifs-stat-label">Total</span>
            <strong className="admin-notifs-stat-value">{notifications.length}</strong>
          </div>
        </div>
      </header>

      <div className="admin-notifs-list">
        {loading && (
          <div className="admin-notifs-empty">
            <div className="admin-notifs-empty-badge">Loading</div>
            <p>Loading notifications...</p>
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="admin-notifs-empty">
            <div className="admin-notifs-empty-badge">All clear</div>
            <p>No notifications yet.</p>
          </div>
        )}

        {notifications.map((n) => {
          const kind = getKind(n.message);
          return (
            <button
              key={n.id}
              type="button"
              className={`admin-notifs-card ${n.read ? "is-read" : "is-unread"} kind-${kind}`}
              onClick={() => markRead(n.id)}
            >
              <div className="admin-notifs-card-top">
                <span className="admin-notifs-pill">{kind}</span>
                <time className="admin-notifs-time">
                  {new Date(n.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="admin-notifs-message">{n.message}</p>
              <div className="admin-notifs-card-foot">
                <span>{n.read ? "Marked read" : "Tap to mark read"}</span>
                <span className="admin-notifs-dot" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
