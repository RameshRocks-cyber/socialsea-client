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
  const [userBaseById, setUserBaseById] = useState({});
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

  const getBaseCandidates = () => {
    const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
    const storedBase =
      String(
        sessionStorage.getItem("socialsea_auth_base_url") ||
        localStorage.getItem("socialsea_auth_base_url") ||
        ""
      ).replace(/\/+$/, "");
    return [
      defaultBase,
      storedBase,
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://socialsea.co.in"
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);
  };

  const loadUsers = async () => {
    setError("");

    const baseCandidates = getBaseCandidates();

    const endpointCandidates = ["/api/admin/users"];

    let bestUsers = [];
    let bestSourceMap = {};
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
          const sourceMap = {};
          for (const item of list) {
            sourceMap[String(item.id)] = base;
          }
          if (list.length > bestUsers.length) {
            bestUsers = list;
            bestSourceMap = sourceMap;
          }
        } catch (err) {
          lastError = err;
        }
      }
    }

    setUsers(bestUsers);
    setUserBaseById(bestSourceMap);

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

  const setUserBlockedState = async (user, blocked) => {
    setBusyByUserId((prev) => ({ ...prev, [user.id]: true }));
    try {
      await api.post(`/api/admin/users/${user.id}/${blocked ? "block" : "unblock"}`);
      if (blocked) issueNotice(user, "red");
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError(blocked ? "Failed to block user account" : "Failed to unblock user account");
    } finally {
      setBusyByUserId((prev) => ({ ...prev, [user.id]: false }));
    }
  };

  const blockUser = async (user) => setUserBlockedState(user, true);

  const unblockUser = async (user) => setUserBlockedState(user, false);

  const deleteUser = async (user) => {
    const display = getUserDisplayName(user);
    const confirmed = window.confirm(
      `Delete user "${display}" (#${user.id}) permanently?\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setBusyByUserId((prev) => ({ ...prev, [user.id]: true }));
    setError("");

    try {
      const sourceBase = String(userBaseById[String(user.id)] || "").trim();
      const baseCandidates = [
        sourceBase,
        ...getBaseCandidates()
      ].filter((value, index, arr) => value && arr.indexOf(value) === index);
      const requestVariants = [
        { method: "delete", url: `/api/admin/users/${user.id}` },
        { method: "post", url: `/api/admin/users/${user.id}/delete` },
        { method: "delete", url: `/api/admin/user/${user.id}` },
        { method: "post", url: `/api/admin/user/${user.id}/delete` },
        { method: "post", url: `/api/admin/delete-user/${user.id}` }
      ];

      let deleted = false;
      let lastErr = null;
      for (const baseURL of baseCandidates) {
        for (const req of requestVariants) {
          try {
            await api.request({
              method: req.method,
              url: req.url,
              baseURL,
              suppressAuthRedirect: true
            });
            deleted = true;
            break;
          } catch (err) {
            lastErr = err;
            const status = Number(err?.response?.status || 0);
            if (!(status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || status >= 500 || !status)) {
              throw err;
            }
          }
        }
        if (deleted) break;
      }
      if (!deleted) {
        // Backend currently exposes block/unblock but may not expose hard-delete.
        // Fallback: block user and treat as removed in admin list.
        let blockedFallback = false;
        for (const baseURL of baseCandidates) {
          try {
            await api.request({
              method: "post",
              url: `/api/admin/users/${user.id}/block`,
              baseURL,
              suppressAuthRedirect: true
            });
            blockedFallback = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!blockedFallback) throw lastErr || new Error("Delete endpoint not reachable");
        setError("Delete API is not available on backend. User was blocked instead.");
      }

      setUsers((prev) => prev.filter((item) => String(item?.id) !== String(user.id)));
      setUserBaseById((prev) => {
        const next = { ...prev };
        delete next[String(user.id)];
        return next;
      });
      setNotices((prev) => prev.filter((item) => !(item?.targetType === "user" && String(item?.targetId) === String(user.id))));
      setNoticeTextByUserId((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      const message = err?.response?.data?.message || err?.message || "Failed to delete user";
      setError(status ? `Failed to delete user (${status}): ${message}` : `Failed to delete user: ${message}`);
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
                      <div className="admin-row-actions" style={{ marginTop: 8 }}>
                        <button type="button" className="admin-btn ghost" onClick={() => blockUser(user)} disabled={busy || user?.banned}>
                          {busy && !user?.banned ? "Blocking..." : user?.banned ? "Blocked" : "Block"}
                        </button>
                        <button type="button" className="admin-btn success" onClick={() => unblockUser(user)} disabled={busy || !user?.banned}>
                          {busy && user?.banned ? "Unblocking..." : user?.banned ? "Unblock" : "Unblocked"}
                        </button>
                        <button type="button" className="admin-btn danger" onClick={() => deleteUser(user)} disabled={busy}>
                          {busy ? "Working..." : "Delete User"}
                        </button>
                      </div>
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


