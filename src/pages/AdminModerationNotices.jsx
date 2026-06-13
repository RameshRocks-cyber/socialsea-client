import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { formatDateTime } from "../admin/adminMetrics";

const normalizeSeverity = (value) => (String(value || "").toLowerCase() === "yellow" ? "yellow" : "red");

export default function AdminModerationNotices({ severity = "yellow" }) {
  const normalizedSeverity = normalizeSeverity(severity);
  const [notices, setNotices] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyByAction, setBusyByAction] = useState({});
  const [activeBaseUrl, setActiveBaseUrl] = useState("");

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

  const loadNotices = async () => {
    setLoading(true);
    setError("");

    let lastError = null;
    let bestList = [];
    let bestBase = "";

    for (const baseURL of getBaseCandidates()) {
      try {
        const res = await api.get("/api/admin/moderation/notices", {
          params: { severity: normalizedSeverity },
          baseURL,
          suppressAuthRedirect: true
        });
        const list = Array.isArray(res?.data) ? res.data : [];
        if (list.length >= bestList.length) {
          bestList = list;
          bestBase = baseURL;
        }
      } catch (err) {
        lastError = err;
      }
    }

    setNotices(bestList);
    setActiveBaseUrl(bestBase);
    setLoading(false);

    if (!bestList.length && lastError) {
      const status = Number(lastError?.response?.status || 0);
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to load notices";
      setError(status ? `Failed to load notices (${status}): ${message}` : `Failed to load notices: ${message}`);
    }
  };

  useEffect(() => {
    loadNotices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSeverity]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return notices;
    return notices.filter((item) =>
      `${item?.userId || ""} ${item?.userName || ""} ${item?.userEmail || ""} ${item?.recipient || ""} ${
        item?.message || ""
      } ${item?.issuedBy || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [notices, query]);

  const busyKey = (noticeId, action) => `${String(noticeId)}:${String(action || "").toLowerCase()}`;

  const withBusy = async (noticeId, action, task) => {
    const key = busyKey(noticeId, action);
    setBusyByAction((prev) => ({ ...prev, [key]: true }));
    try {
      await task();
    } finally {
      setBusyByAction((prev) => ({ ...prev, [key]: false }));
    }
  };

  const removeNotice = async (notice, severityLabel) =>
    withBusy(notice.id, `remove-${severityLabel}`, async () => {
      setError("");
      const baseCandidates = [activeBaseUrl, ...getBaseCandidates()].filter(
        (value, index, arr) => value && arr.indexOf(value) === index
      );
      let lastError = null;

      for (const baseURL of baseCandidates) {
        try {
          await api.delete(`/api/admin/moderation/notices/${notice.id}`, {
            baseURL,
            suppressAuthRedirect: true
          });
          setNotices((prev) => prev.filter((item) => item.id !== notice.id));
          return;
        } catch (err) {
          lastError = err;
        }
      }

      const status = Number(lastError?.response?.status || 0);
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to remove notice";
      setError(
        status
          ? `Failed to remove ${severityLabel} notice (${status}): ${message}`
          : `Failed to remove ${severityLabel} notice: ${message}`
      );
    });

  const escalateToRed = async (notice) =>
    withBusy(notice.id, "escalate-red", async () => {
      setError("");
      const baseCandidates = [activeBaseUrl, ...getBaseCandidates()].filter(
        (value, index, arr) => value && arr.indexOf(value) === index
      );
      let lastError = null;

      for (const baseURL of baseCandidates) {
        try {
          await api.post(
            `/api/admin/moderation/notices/${notice.id}/escalate-red`,
            { message: "Critical violation recorded." },
            {
              baseURL,
              suppressAuthRedirect: true
            }
          );
          setNotices((prev) => prev.filter((item) => item.id !== notice.id));
          return;
        } catch (err) {
          lastError = err;
        }
      }

      const status = Number(lastError?.response?.status || 0);
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to escalate notice";
      setError(status ? `Failed to escalate yellow notice (${status}): ${message}` : `Failed to escalate yellow notice: ${message}`);
    });

  const moveToYellow = async (notice) =>
    withBusy(notice.id, "move-yellow", async () => {
      setError("");
      const baseCandidates = [activeBaseUrl, ...getBaseCandidates()].filter(
        (value, index, arr) => value && arr.indexOf(value) === index
      );
      let lastError = null;

      for (const baseURL of baseCandidates) {
        try {
          await api.post(
            `/api/admin/moderation/notices/${notice.id}/move-yellow`,
            { message: "Policy warning issued." },
            {
              baseURL,
              suppressAuthRedirect: true
            }
          );
          setNotices((prev) => prev.filter((item) => item.id !== notice.id));
          return;
        } catch (err) {
          lastError = err;
        }
      }

      const status = Number(lastError?.response?.status || 0);
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to move notice";
      setError(status ? `Failed to move red notice to yellow (${status}): ${message}` : `Failed to move red notice to yellow: ${message}`);
    });

  const deleteUser = async (notice) =>
    withBusy(notice.id, "delete-user", async () => {
      setError("");

      if (!notice?.userId) {
        setError("This notice does not include a user id, so the user cannot be deleted from here.");
        return;
      }

      const displayName = notice?.userName || notice?.userEmail || `User #${notice.userId}`;
      const confirmed = window.confirm(
        `Delete ${displayName} (#${notice.userId}) permanently?\nThis will remove the account and related content.`
      );
      if (!confirmed) return;

      const baseCandidates = [activeBaseUrl, ...getBaseCandidates()].filter(
        (value, index, arr) => value && arr.indexOf(value) === index
      );
      let lastError = null;

      for (const baseURL of baseCandidates) {
        try {
          await api.delete(`/api/admin/users/${notice.userId}`, {
            baseURL,
            suppressAuthRedirect: true
          });
          setNotices((prev) => prev.filter((item) => String(item.userId) !== String(notice.userId)));
          return;
        } catch (err) {
          lastError = err;
        }
      }

      const status = Number(lastError?.response?.status || 0);
      const message = lastError?.response?.data?.message || lastError?.message || "Failed to delete user";
      setError(status ? `Failed to delete user (${status}): ${message}` : `Failed to delete user: ${message}`);
    });

  const pageTitle = normalizedSeverity === "yellow" ? "Yellow Notice List" : "Red Notice List";
  const pageNote =
    normalizedSeverity === "yellow"
      ? "Review warning-level users, escalate to red or remove from yellow list."
      : "Review critical notice log, move red users to yellow or remove red notice.";

  return (
    <section className="admin-table-panel">
      <header className="admin-table-head admin-table-head-stack">
        <div>
          <h3>{pageTitle}</h3>
          <p className="admin-head-note">{pageNote}</p>
        </div>
        <input name="adminmoderationnotices-input-202"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search user id, name, email or note"
        />
      </header>

      {error && <p className="admin-error">{error}</p>}
      {loading && <p className="admin-head-note">Loading notices...</p>}

      <div className="admin-table-wrap">
        <table className="admin-table admin-table-rich">
          <thead>
            <tr>
              <th>User</th>
              <th>Severity</th>
              <th>Message</th>
              <th>Issued By</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((notice) => {
              const removeBusy = Boolean(busyByAction[busyKey(notice.id, `remove-${normalizedSeverity}`)]);
              const escalateBusy = Boolean(busyByAction[busyKey(notice.id, "escalate-red")]);
              const moveBusy = Boolean(busyByAction[busyKey(notice.id, "move-yellow")]);
              const deleteBusy = Boolean(busyByAction[busyKey(notice.id, "delete-user")]);
              return (
                <tr key={notice.id}>
                  <td>
                    <div className="admin-entity-cell">
                      <strong>{notice?.userName || notice?.userEmail || "Unknown user"}</strong>
                      <span>#{notice?.userId || "-"} - {notice?.userEmail || notice?.recipient || "No email"}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`admin-badge ${notice?.severity === "yellow" ? "warning" : "danger"}`}>
                      {String(notice?.severity || "").toUpperCase()}
                    </span>
                  </td>
                  <td>{notice?.message || "No message"}</td>
                  <td>{notice?.issuedBy || "admin"}</td>
                  <td>{formatDateTime(notice?.createdAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      {normalizedSeverity === "yellow" ? (
                        <>
                          <button
                            type="button"
                            className="admin-btn danger"
                            disabled={escalateBusy}
                            onClick={() => escalateToRed(notice)}
                          >
                            {escalateBusy ? "Working..." : "Give Red Notice"}
                          </button>
                          <button
                            type="button"
                            className="admin-btn ghost"
                            disabled={removeBusy}
                            onClick={() => removeNotice(notice, "yellow")}
                          >
                            {removeBusy ? "Working..." : "Remove from Yellow"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="admin-btn warning"
                            disabled={moveBusy}
                            onClick={() => moveToYellow(notice)}
                          >
                            {moveBusy ? "Working..." : "Move to Yellow"}
                          </button>
                          <button
                            type="button"
                            className="admin-btn ghost"
                            disabled={removeBusy}
                            onClick={() => removeNotice(notice, "red")}
                          >
                            {removeBusy ? "Working..." : "Remove from Red"}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="admin-btn danger"
                        disabled={deleteBusy || !notice?.userId}
                        onClick={() => deleteUser(notice)}
                        title={notice?.userId ? "Delete the user account" : "User id is missing"}
                      >
                        {deleteBusy ? "Working..." : "Delete User"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && !error && filtered.length === 0 && (
        <p className="admin-empty">No notices found for this filter.</p>
      )}
    </section>
  );
}
