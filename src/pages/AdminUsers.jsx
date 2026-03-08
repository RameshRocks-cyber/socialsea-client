import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import {
  formatDateTime,
  getCreatedAt,
  getUserDisplayName,
  loadModerationNotices,
  saveModerationNotice
} from "../admin/adminMetrics";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyByUserId, setBusyByUserId] = useState({});
  const [noticeTextByUserId, setNoticeTextByUserId] = useState({});
  const [notices, setNotices] = useState([]);

  const normalizeUserList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.users)) return payload.users;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const toUserShape = (user) => ({
    ...user,
    role: user?.role || "USER",
    banned: Boolean(user?.banned),
    profileCompleted: Boolean(user?.profileCompleted)
  });
  const isValidUser = (user) => {
    if (!user || typeof user !== "object") return false;
    const hasId = user.id !== undefined && user.id !== null && `${user.id}`.trim() !== "";
    const hasIdentity = Boolean(user.email || user.name || user.username);
    return hasId && hasIdentity;
  };

  const dedupeUsers = (list) => {
    const byId = new Map();
    for (const user of list) {
      byId.set(String(user.id), user);
    }
    return Array.from(byId.values());
  };

  const loadUsers = async () => {
    setError("");

    const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
    const baseCandidates = [
      defaultBase,
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://socialsea.co.in"
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);

    const endpointCandidates = ["/api/admin/users"];

    let bestUsers = [];
    let lastError = null;

    for (const base of baseCandidates) {
      for (const endpoint of endpointCandidates) {
        try {
          const res = await api.get(endpoint, {
            baseURL: base,
            skipAuth: true,
            suppressAuthRedirect: true,
            skipRefresh: true
          });

          const list = dedupeUsers(normalizeUserList(res?.data).map(toUserShape).filter(isValidUser));
          if (list.length > bestUsers.length) {
            bestUsers = list;
          }
        } catch (err) {
          lastError = err;
        }
      }
    }

    setUsers(bestUsers);

    if (bestUsers.length === 0 && lastError) {
      console.error(lastError);
      const status = lastError?.response?.status;
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to load users";
      setError(status ? `Failed to load users (${status}): ${message}` : `Failed to load users: ${message}`);
    }
  };

  useEffect(() => {
    loadUsers();
    setNotices(loadModerationNotices());
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter((user) =>
      `${user?.id || ""} ${user?.name || ""} ${user?.email || ""} ${user?.role || ""} ${user?.banned ? "banned" : "active"}`
        .toLowerCase()
        .includes(q)
    );
  }, [users, query]);

  const noticeCountByUserId = useMemo(() => {
    return notices.reduce((acc, item) => {
      if (item.targetType !== "user") return acc;
      acc[item.targetId] = (acc[item.targetId] || 0) + 1;
      return acc;
    }, {});
  }, [notices]);

  const recentNoticeByUserId = useMemo(() => {
    return notices.reduce((acc, item) => {
      if (item.targetType !== "user" || acc[item.targetId]) return acc;
      acc[item.targetId] = item;
      return acc;
    }, {});
  }, [notices]);

  const issueNotice = (user, severity) => {
    const message = String(noticeTextByUserId[user.id] || "").trim() || (severity === "yellow" ? "Policy warning issued." : "Critical violation recorded.");
    const next = saveModerationNotice({
      id: `${severity}-${user.id}-${Date.now()}`,
      targetType: "user",
      targetId: user.id,
      targetLabel: getUserDisplayName(user),
      severity,
      message,
      createdAt: new Date().toISOString()
    });
    setNotices(next);
    setNoticeTextByUserId((prev) => ({ ...prev, [user.id]: "" }));
  };

  const banUser = async (user) => {
    setBusyByUserId((prev) => ({ ...prev, [user.id]: true }));
    try {
      await api.post(`/api/admin/users/${user.id}/ban`);
      issueNotice(user, "red");
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError("Failed to remove user access");
    } finally {
      setBusyByUserId((prev) => ({ ...prev, [user.id]: false }));
    }
  };

  const activeUsers = users.filter((user) => !user?.banned).length;
  const redNotices = notices.filter((notice) => notice.targetType === "user" && notice.severity === "red").length;
  const yellowNotices = notices.filter((notice) => notice.targetType === "user" && notice.severity === "yellow").length;

  return (
    <section className="admin-page-grid">
      <section className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card-static">
          <p>Tracked Users</p>
          <h3>{users.length}</h3>
          <span>{activeUsers} currently active</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Yellow Notices</p>
          <h3>{yellowNotices}</h3>
          <span>Early behavior warnings</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Red Notices</p>
          <h3>{redNotices}</h3>
          <span>Critical actions logged</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Removed Access</p>
          <h3>{users.filter((user) => user?.banned).length}</h3>
          <span>Uses current ban endpoint</span>
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head admin-table-head-stack">
          <div>
            <h3>User Monitor</h3>
            <p className="admin-head-note">Search every user, review account state and issue yellow or red notices.</p>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search id, name, email, role or status"
          />
        </header>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table admin-table-rich">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Profile</th>
                <th>Status</th>
                <th>Created</th>
                <th>Notices</th>
                <th>Moderation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, index) => {
                const latestNotice = recentNoticeByUserId[user.id];
                const noticeCount = noticeCountByUserId[user.id] || 0;
                const busy = !!busyByUserId[user.id];

                return (
                  <tr key={`${String(user.id)}-${index}`}>
                    <td>
                      <div className="admin-entity-cell">
                        <strong>{getUserDisplayName(user)}</strong>
                        <span>#{user.id} â€¢ {user.email || "No email"}</span>
                      </div>
                    </td>
                    <td>{user.role || "USER"}</td>
                    <td>{user.profileCompleted ? "Complete" : "Pending"}</td>
                    <td>
                      <span className={`admin-badge ${user.banned ? "danger" : "success"}`}>
                        {user.banned ? "Removed access" : "Active"}
                      </span>
                    </td>
                    <td>{formatDateTime(getCreatedAt(user))}</td>
                    <td>
                      <div className="admin-entity-cell">
                        <strong>{noticeCount}</strong>
                        <span>{latestNotice ? `${latestNotice.severity.toUpperCase()} â€¢ ${latestNotice.message}` : "No notices yet"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-action-stack">
                        <textarea
                          value={noticeTextByUserId[user.id] || ""}
                          onChange={(e) => setNoticeTextByUserId((prev) => ({ ...prev, [user.id]: e.target.value }))}
                          placeholder="Write a moderation note"
                          rows={2}
                        />
                        <div className="admin-row-actions">
                          <button type="button" className="admin-btn warning" onClick={() => issueNotice(user, "yellow")}>
                            Yellow Notice
                          </button>
                          <button type="button" className="admin-btn danger" onClick={() => issueNotice(user, "red")}>
                            Red Notice
                          </button>
                          <button type="button" className="admin-btn ghost" onClick={() => banUser(user)} disabled={busy || user?.banned}>
                            {busy ? "Removing..." : user?.banned ? "Access removed" : "Remove user"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!error && filtered.length === 0 && <p className="admin-empty">No users found.</p>}
      </section>
    </section>
  );
}


