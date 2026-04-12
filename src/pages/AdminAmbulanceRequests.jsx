import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";

const STATUS_OPTIONS = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All" }
];

const formatDateTime = (value) => {
  try {
    if (!value) return "";
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
};

export default function AdminAmbulanceRequests() {
  const [status, setStatus] = useState("PENDING");
  const [items, setItems] = useState([]);
  const [busyIds, setBusyIds] = useState({});
  const [error, setError] = useState("");

  const queryStatus = status === "ALL" ? "" : status;
  const title = useMemo(() => {
    const opt = STATUS_OPTIONS.find((o) => o.id === status);
    return opt ? opt.label : "Requests";
  }, [status]);

  const load = async () => {
    setError("");
    try {
      const res = await api.get("/api/admin/ambulance/requests", {
        params: queryStatus ? { status: queryStatus } : {},
        timeout: 12000
      });
      const list = Array.isArray(res?.data) ? res.data : [];
      setItems(list);
    } catch (err) {
      console.error(err);
      const statusCode = err?.response?.status;
      if (statusCode === 401 || statusCode === 403) {
        setError("Admin access denied. Log out and log in with an ADMIN account, then refresh.");
      } else if (statusCode === 404) {
        setError("Admin ambulance API not found. Restart backend and refresh.");
      } else {
        setError("Failed to load ambulance driver requests");
      }
      setItems([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryStatus]);

  const approve = async (id) => {
    const idText = String(id || "").trim();
    if (!idText) return;
    setBusyIds((p) => ({ ...p, [idText]: true }));
    setError("");
    try {
      await api.post(`/api/admin/ambulance/requests/${encodeURIComponent(idText)}/approve`, null, { timeout: 12000 });
      await load();
    } catch (err) {
      console.error(err);
      const statusCode = err?.response?.status;
      if (statusCode === 401 || statusCode === 403) setError("Admin access denied. Please log in again.");
      else setError("Approve failed");
    } finally {
      setBusyIds((p) => ({ ...p, [idText]: false }));
    }
  };

  const reject = async (id) => {
    const idText = String(id || "").trim();
    if (!idText) return;
    const reason = window.prompt("Reject reason (optional):", "");
    if (reason == null) return;
    setBusyIds((p) => ({ ...p, [idText]: true }));
    setError("");
    try {
      await api.post(
        `/api/admin/ambulance/requests/${encodeURIComponent(idText)}/reject`,
        { reason },
        { timeout: 12000 }
      );
      await load();
    } catch (err) {
      console.error(err);
      const statusCode = err?.response?.status;
      if (statusCode === 401 || statusCode === 403) setError("Admin access denied. Please log in again.");
      else setError("Reject failed");
    } finally {
      setBusyIds((p) => ({ ...p, [idText]: false }));
    }
  };

  return (
    <section className="admin-table-panel">
      <header className="admin-table-head admin-amb-head">
        <div>
          <h3>Ambulance Driver Requests</h3>
          <p className="admin-muted">Approve drivers who can access the Ambulance Navigation page.</p>
        </div>
        <div className="admin-amb-controls">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="admin-amb-select">
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <button type="button" className="admin-amb-refresh" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-amb-grid">
        {items.map((req) => {
          const idText = String(req?.id || "").trim();
          const busy = !!busyIds[idText];
          return (
            <article key={idText || Math.random()} className="admin-amb-card">
              <div className="admin-amb-top">
                <div className="admin-amb-name">{req?.driverName || req?.name || "Driver"}</div>
                <span className={`admin-amb-pill status-${String(req?.status || "").toLowerCase()}`}>
                  {String(req?.status || "PENDING")}
                </span>
              </div>
              <div className="admin-amb-meta">
                <div>
                  <span>Email</span>
                  <strong>{req?.email || "-"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{req?.phone || "-"}</strong>
                </div>
                <div>
                  <span>Vehicle</span>
                  <strong>{req?.vehicleNumber || "-"}</strong>
                </div>
                <div>
                  <span>Service</span>
                  <strong>{req?.serviceName || "-"}</strong>
                </div>
              </div>
              {req?.note && <p className="admin-amb-note">{String(req.note)}</p>}
              <div className="admin-amb-dates">
                <div>
                  <span>Created</span>
                  <strong>{formatDateTime(req?.createdAt) || "-"}</strong>
                </div>
                <div>
                  <span>Reviewed</span>
                  <strong>{formatDateTime(req?.reviewedAt) || "-"}</strong>
                </div>
              </div>
              {req?.rejectReason && (
                <p className="admin-amb-reject">
                  <strong>Reject:</strong> {String(req.rejectReason)}
                </p>
              )}
              <div className="admin-amb-actions">
                <button type="button" className="ok" onClick={() => approve(req.id)} disabled={busy}>
                  {busy ? "..." : "Approve"}
                </button>
                <button type="button" className="danger" onClick={() => reject(req.id)} disabled={busy}>
                  {busy ? "..." : "Reject"}
                </button>
              </div>
            </article>
          );
        })}

        {!error && items.length === 0 && (
          <p className="admin-empty">
            No {title.toLowerCase()} requests.
          </p>
        )}
      </div>
    </section>
  );
}
