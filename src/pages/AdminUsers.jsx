import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { formatDateTime, getCreatedAt, getUserDisplayName } from "../admin/adminMetrics";

const normalizeNoticeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.notices)) return payload.notices;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [userBaseById, setUserBaseById] = useState({});
  const [notices, setNotices] = useState([]);
  const [noticeBase, setNoticeBase] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyByUserId, setBusyByUserId] = useState({});
  const [noticeBusyByAction, setNoticeBusyByAction] = useState({});
  const [noticeTextByUserId, setNoticeTextByUserId] = useState({});

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

  const normalizeUserList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.users)) return payload.users;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
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
    const storedBase = String(
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
    let bestUsers = [];
    let bestSourceMap = {};
    let lastError = null;

    for (const base of baseCandidates) {
      try {
        const res = await api.get("/api/admin/users", {
          baseURL: base,
          suppressAuthRedirect: true
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

    setUsers(bestUsers);
    setUserBaseById(bestSourceMap);

    if (bestUsers.length === 0 && lastError) {
      console.error(lastError);
      const status = Number(lastError?.response?.status || 0);
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to load users";
      setError(status ? `Failed to load users (${status}): ${message}` : `Failed to load users: ${message}`);
    }
  };

  const loadModerationNotices = async () => {
    const baseCandidates = getBaseCandidates();
    let bestNotices = [];
    let bestBase = "";
    let lastError = null;

    for (const baseURL of baseCandidates) {
      try {
        const res = await api.get("/api/admin/moderation/notices", {
          baseURL,
          suppressAuthRedirect: true
        });
        const list = normalizeNoticeList(res?.data).map((notice) => ({
          ...notice,
          severity: String(notice?.severity || "").toLowerCase() === "yellow" ? "yellow" : "red"
        }));
        if (list.length >= bestNotices.length) {
          bestNotices = list;
          bestBase = baseURL;
        }
      } catch (err) {
        lastError = err;
      }
    }

    setNotices(bestNotices);
    setNoticeBase(bestBase);

    if (!bestNotices.length && lastError) {
      const status = Number(lastError?.response?.status || 0);
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to load notice history";
      setError(status ? `Failed to load notice history (${status}): ${message}` : `Failed to load notice history: ${message}`);
    }
  };

  useEffect(() => {
    loadUsers();
    loadModerationNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter((user) =>
      `${user?.id || ""} ${user?.name || ""} ${user?.email || ""} ${user?.role || ""} ${
        user?.banned ? "banned" : "active"
      }`
        .toLowerCase()
        .includes(q)
    );
  }, [users, query]);

  const userNoticeKey = (user) => {
    if (user?.id !== undefined && user?.id !== null) return `id:${String(user.id)}`;
    const email = String(user?.email || "").trim().toLowerCase();
    return email ? `email:${email}` : "";
  };

  const noticeTargetKey = (notice) => {
    if (notice?.userId !== undefined && notice?.userId !== null) return `id:${String(notice.userId)}`;
    const email = String(notice?.userEmail || notice?.recipient || "").trim().toLowerCase();
    return email ? `email:${email}` : "";
  };

  const noticeCountByKey = useMemo(() => {
    return notices.reduce((acc, item) => {
      const key = noticeTargetKey(item);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [notices]);

  const recentNoticeByKey = useMemo(() => {
    return notices.reduce((acc, item) => {
      const key = noticeTargetKey(item);
      if (!key || acc[key]) return acc;
      acc[key] = item;
      return acc;
    }, {});
  }, [notices]);

  const sendNoticeToBackend = async (user, severity, message) => {
    const sourceBase = String(userBaseById[String(user.id)] || "").trim();
    const baseCandidates = [sourceBase, noticeBase, ...getBaseCandidates()].filter(
      (value, index, arr) => value && arr.indexOf(value) === index
    );
    let lastErr = null;

    for (const baseURL of baseCandidates) {
      try {
        await api.post(
          `/api/admin/users/${user.id}/notice`,
          { severity, message },
          {
            baseURL,
            suppressAuthRedirect: true
          }
        );
        return true;
      } catch (err) {
        lastErr = err;
        const status = Number(err?.response?.status || 0);
        if (status && status !== 404 && status !== 405 && status < 500) {
          throw err;
        }
      }
    }

    throw lastErr || new Error("Notice endpoint not reachable");
  };

  const noticeBusyKey = (userId, severity) => `${String(userId)}:${String(severity || "").toLowerCase()}`;

  const issueNotice = async (user, severity) => {
    const message =
      String(noticeTextByUserId[user.id] || "").trim() ||
      (severity === "yellow" ? "Policy warning issued." : "Critical violation recorded.");
    const busyKey = noticeBusyKey(user.id, severity);
    setNoticeBusyByAction((prev) => ({ ...prev, [busyKey]: true }));
    setError("");

    try {
      await sendNoticeToBackend(user, severity, message);
      setNoticeTextByUserId((prev) => ({ ...prev, [user.id]: "" }));
      await loadModerationNotices();
    } catch (err) {
      console.error(err);
      const status = Number(err?.response?.status || 0);
      const errMessage = err?.response?.data?.message || err?.message || "Failed to send notice";
      setError(status ? `Notice delivery failed (${status}): ${errMessage}` : `Notice delivery failed: ${errMessage}`);
    } finally {
      setNoticeBusyByAction((prev) => ({ ...prev, [busyKey]: false }));
    }
  };

  const setUserBlockedState = async (user, blocked) => {
    setBusyByUserId((prev) => ({ ...prev, [user.id]: true }));
    try {
      await api.post(`/api/admin/users/${user.id}/${blocked ? "block" : "unblock"}`);
      if (blocked) await issueNotice(user, "red");
      await loadUsers();
      await loadModerationNotices();
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
    const confirmed = window.confirm(`Delete user "${display}" (#${user.id}) permanently?\nThis action cannot be undone.`);
    if (!confirmed) return;

    setBusyByUserId((prev) => ({ ...prev, [user.id]: true }));
    setError("");

    try {
      const sourceBase = String(userBaseById[String(user.id)] || "").trim();
      const baseCandidates = [sourceBase, ...getBaseCandidates()].filter(
        (value, index, arr) => value && arr.indexOf(value) === index
      );
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
      setNoticeTextByUserId((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      await loadModerationNotices();
    } catch (err) {
      console.error(err);
      const status = Number(err?.response?.status || 0);
      const message = err?.response?.data?.message || err?.message || "Failed to delete user";
      setError(status ? `Failed to delete user (${status}): ${message}` : `Failed to delete user: ${message}`);
    } finally {
      setBusyByUserId((prev) => ({ ...prev, [user.id]: false }));
    }
  };

  const activeUsers = users.filter((user) => !user?.banned).length;
  const redNotices = notices.filter((notice) => notice?.severity === "red").length;
  const yellowNotices = notices.filter((notice) => notice?.severity === "yellow").length;

  return (
    <section className="admin-page-grid">
      <section className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card-static">
          <p>Tracked Users</p>
          <h3>{users.length}</h3>
          <span>{activeUsers} currently active</span>
        </div>
        <button
          type="button"
          className="admin-stat-card"
          onClick={() => navigate("/admin/users/notices/yellow")}
        >
          <p>Yellow Notices</p>
          <h3>{yellowNotices}</h3>
          <span>Early behavior warnings - open list</span>
        </button>
        <button
          type="button"
          className="admin-stat-card"
          onClick={() => navigate("/admin/users/notices/red")}
        >
          <p>Red Notices</p>
          <h3>{redNotices}</h3>
          <span>Critical actions logged - open list</span>
        </button>
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
          <input name="adminusers-input-395"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
                const key = userNoticeKey(user);
                const latestNotice = recentNoticeByKey[key];
                const noticeCount = noticeCountByKey[key] || 0;
                const busy = Boolean(busyByUserId[user.id]);
                const yellowNoticeBusy = Boolean(noticeBusyByAction[noticeBusyKey(user.id, "yellow")]);
                const redNoticeBusy = Boolean(noticeBusyByAction[noticeBusyKey(user.id, "red")]);

                return (
                  <tr key={`${String(user.id)}-${index}`}>
                    <td>
                      <div className="admin-entity-cell">
                        <strong>{getUserDisplayName(user)}</strong>
                        <span>#{user.id} - {user.email || "No email"}</span>
                      </div>
                    </td>
                    <td>{user.role || "USER"}</td>
                    <td>{user.profileCompleted ? "Complete" : "Pending"}</td>
                    <td>
                      <span className={`admin-badge ${user.banned ? "danger" : "success"}`}>
                        {user.banned ? "Removed access" : "Active"}
                      </span>
                      <div className="admin-row-actions" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="admin-btn ghost"
                          onClick={() => blockUser(user)}
                          disabled={busy || user?.banned}
                        >
                          {busy && !user?.banned ? "Blocking..." : user?.banned ? "Blocked" : "Block"}
                        </button>
                        <button
                          type="button"
                          className="admin-btn success"
                          onClick={() => unblockUser(user)}
                          disabled={busy || !user?.banned}
                        >
                          {busy && user?.banned ? "Unblocking..." : user?.banned ? "Unblock" : "Unblocked"}
                        </button>
                        <button
                          type="button"
                          className="admin-btn danger"
                          onClick={() => deleteUser(user)}
                          disabled={busy}
                        >
                          {busy ? "Working..." : "Delete User"}
                        </button>
                      </div>
                    </td>
                    <td>{formatDateTime(getCreatedAt(user))}</td>
                    <td>
                      <div className="admin-entity-cell">
                        <strong>{noticeCount}</strong>
                        <span>
                          {latestNotice
                            ? `${String(latestNotice.severity || "").toUpperCase()} - ${latestNotice.message || ""}`
                            : "No notices yet"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-action-stack">
                        <textarea name="adminusers-textarea-481"
                          value={noticeTextByUserId[user.id] || ""}
                          onChange={(event) =>
                            setNoticeTextByUserId((prev) => ({ ...prev, [user.id]: event.target.value }))
                          }
                          placeholder="Write a moderation note"
                          rows={2}
                        />
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="admin-btn warning"
                            onClick={() => issueNotice(user, "yellow")}
                            disabled={yellowNoticeBusy}
                          >
                            {yellowNoticeBusy ? "Sending..." : "Yellow Notice"}
                          </button>
                          <button
                            type="button"
                            className="admin-btn danger"
                            onClick={() => issueNotice(user, "red")}
                            disabled={redNoticeBusy}
                          >
                            {redNoticeBusy ? "Sending..." : "Red Notice"}
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
