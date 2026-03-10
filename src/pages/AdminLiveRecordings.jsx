import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { formatDateTime } from "../admin/adminMetrics";

const SOS_SESSION_KEY = "socialsea_sos_session_v1";
const SOS_SIGNAL_KEY = "socialsea_sos_signal_v1";
const SOS_SIGNAL_CHANNEL = "socialsea_sos_signal_channel_v1";

const toRecordingShape = (item) => ({
  id: item?.id ?? item?.alertId ?? "",
  alertId: item?.alertId ?? item?.id ?? "",
  username: item?.username || item?.name || item?.reporterName || "",
  email: item?.email || item?.reporterEmail || "",
  reporterName: item?.reporterName || item?.username || item?.name || "",
  reporterEmail: item?.reporterEmail || item?.email || "",
  mediaUrl: item?.mediaUrl || item?.recordingUrl || item?.videoUrl || "",
  startedAt: item?.startedAt || item?.createdAt || null,
  endedAt: item?.endedAt || null,
  durationMs: Number(item?.durationMs || 0),
  active: Boolean(item?.active),
  latitude: item?.currentLatitude ?? item?.latitude ?? null,
  longitude: item?.currentLongitude ?? item?.longitude ?? null,
  accuracyMeters: item?.accuracyMeters ?? null,
  radiusMeters: Number(item?.radiusMeters || 5000),
  nearbyCount: Number(item?.nearbyCount || 0),
  nearbyUsers: Array.isArray(item?.nearbyUsers) ? item.nearbyUsers : []
});

const normalizeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.recordings)) return payload.recordings;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const formatDuration = (durationMs) => {
  if (!durationMs || Number.isNaN(durationMs)) return "-";
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatLocation = (item) => {
  const lat = item?.latitude;
  const lng = item?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return "-";
  const acc = typeof item?.accuracyMeters === "number" && !Number.isNaN(item.accuracyMeters)
    ? ` (${Math.round(item.accuracyMeters)}m)`
    : "";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}${acc}`;
};

const formatNearbySummary = (item) => {
  const users = Array.isArray(item?.nearbyUsers) ? item.nearbyUsers : [];
  if (users.length === 0) return "No users in 5km";
  return users
    .slice(0, 5)
    .map((u) => `${u?.name || "User"} (${u?.email || "-"})${typeof u?.distanceMeters === "number" ? ` - ${u.distanceMeters}m` : ""}`)
    .join(" | ");
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
};

const toActiveAlertShape = (alert, users = []) => {
  const lat = typeof alert?.latitude === "number" ? alert.latitude : null;
  const lon = typeof alert?.longitude === "number" ? alert.longitude : null;
  const reporterEmail = alert?.reporterEmail || "";
  const reporter = users.find((u) => String(u?.email || "").toLowerCase() === String(reporterEmail).toLowerCase());

  let nearbyUsers = [];
  if (typeof lat === "number" && typeof lon === "number") {
    nearbyUsers = users
      .filter((u) => String(u?.email || "").toLowerCase() !== String(reporterEmail).toLowerCase())
      .filter((u) => typeof u?.lastLatitude === "number" && typeof u?.lastLongitude === "number")
      .map((u) => {
        const distance = Math.round(haversineMeters(lat, lon, u.lastLatitude, u.lastLongitude));
        return {
          id: u?.id || "",
          name: u?.name || u?.username || u?.email || "User",
          email: u?.email || "-",
          distanceMeters: distance
        };
      })
      .filter((u) => u.distanceMeters <= 5000)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  return {
    id: alert?.alertId ?? alert?.id ?? "",
    alertId: alert?.alertId ?? alert?.id ?? "",
    username: reporter?.name || reporter?.username || reporterEmail || "Unknown",
    email: reporterEmail || "-",
    reporterName: reporter?.name || reporter?.username || reporterEmail || "Unknown",
    reporterEmail: reporterEmail || "-",
    mediaUrl: "",
    startedAt: alert?.startedAt || null,
    endedAt: alert?.endedAt || null,
    durationMs: Number(alert?.durationMs || 0),
    active: Boolean(alert?.active),
    latitude: lat,
    longitude: lon,
    accuracyMeters: alert?.accuracyMeters ?? null,
    radiusMeters: Number(alert?.radiusMeters || 5000),
    nearbyCount: nearbyUsers.length,
    nearbyUsers
  };
};

const readLocalSosSession = () => {
  try {
    const raw = localStorage.getItem(SOS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const toLocalSosShape = (session, users = []) => {
  if (!session?.active) return null;
  const lat = Number(session?.lastLocation?.latitude);
  const lon = Number(session?.lastLocation?.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  const reporterEmail =
    String(localStorage.getItem("email") || sessionStorage.getItem("email") || "").trim() || "local-user@socialsea";
  const reporter = users.find((u) => String(u?.email || "").toLowerCase() === reporterEmail.toLowerCase());

  const nearbyUsers = hasCoords
    ? users
        .filter((u) => String(u?.email || "").toLowerCase() !== reporterEmail.toLowerCase())
        .filter((u) => typeof u?.lastLatitude === "number" && typeof u?.lastLongitude === "number")
        .map((u) => {
          const distanceMeters = Math.round(haversineMeters(lat, lon, u.lastLatitude, u.lastLongitude));
          return {
            id: u?.id || "",
            name: u?.name || u?.email || "User",
            email: u?.email || "-",
            distanceMeters
          };
        })
        .filter((u) => u.distanceMeters <= 5000)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
    : [];

  const localId = String(session?.alertDisplayId || session?.alertId || `LOCAL-${Date.now()}`);
  return {
    id: localId,
    alertId: localId,
    username: reporter?.name || reporterEmail,
    email: reporterEmail,
    reporterName: reporter?.name || reporterEmail,
    reporterEmail,
    mediaUrl: "",
    startedAt: session?.startedAt || null,
    endedAt: null,
    durationMs: Number((session?.elapsedSec || 0) * 1000),
    active: true,
    latitude: hasCoords ? lat : null,
    longitude: hasCoords ? lon : null,
    accuracyMeters: Number.isFinite(Number(session?.lastLocation?.accuracy))
      ? Number(session.lastLocation.accuracy)
      : null,
    radiusMeters: 5000,
    nearbyCount: nearbyUsers.length,
    nearbyUsers
  };
};

const toSignalSosShape = (signal) => {
  if (!signal || typeof signal !== "object") return null;
  const type = String(signal?.type || "").toLowerCase();
  if (type === "stopped") return null;
  if (!["triggering", "triggered", "triggered-local", "active"].includes(type)) return null;

  const lat = Number(signal?.latitude);
  const lon = Number(signal?.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  const reporterEmail = String(signal?.reporterEmail || signal?.senderEmail || "").trim() || "local-user@socialsea";
  const id = String(signal?.alertId || signal?.id || `SIGNAL-${Date.now()}`);
  return {
    id,
    alertId: id,
    username: reporterEmail,
    email: reporterEmail,
    reporterName: reporterEmail,
    reporterEmail,
    mediaUrl: "",
    startedAt: signal?.at || new Date().toISOString(),
    endedAt: null,
    durationMs: 0,
    active: true,
    latitude: hasCoords ? lat : null,
    longitude: hasCoords ? lon : null,
    accuracyMeters: null,
    radiusMeters: Number(signal?.radiusMeters || 5000),
    nearbyCount: 0,
    nearbyUsers: []
  };
};

export default function AdminLiveRecordings() {
  const [recordings, setRecordings] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [expandedNearbyByAlert, setExpandedNearbyByAlert] = useState({});
  const liveSignalRowRef = useRef(null);

  useEffect(() => {
    let channel = null;

    const applySignal = (payload) => {
      const shaped = toSignalSosShape(payload);
      liveSignalRowRef.current = shaped;
      if (shaped) {
        setRecordings((prev) => (Array.isArray(prev) && prev.length > 0 ? prev : [shaped]));
        setNote("Showing live SOS signal from current browser session.");
      }
      if (!shaped && String(payload?.type || "").toLowerCase() === "stopped") {
        liveSignalRowRef.current = null;
      }
    };

    const onStorage = (event) => {
      if (event?.key !== SOS_SIGNAL_KEY || !event?.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        applySignal(payload);
      } catch {
        // ignore malformed signal payload
      }
    };

    window.addEventListener("storage", onStorage);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(SOS_SIGNAL_CHANNEL);
        channel.onmessage = (event) => applySignal(event?.data);
      }
    } catch {
      channel = null;
    }

    try {
      const raw = localStorage.getItem(SOS_SIGNAL_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        applySignal(payload);
      }
    } catch {
      // no-op
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      if (channel) {
        channel.close();
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError("");
      setNote("");

      const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
      const baseCandidates = [
        defaultBase,
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://socialsea.co.in"
      ].filter((value, index, arr) => value && arr.indexOf(value) === index);

      const endpointCandidates = [
        "/api/admin/live-recordings",
        "/api/admin/sos-nearby",
        "/admin/live-recordings"
      ];

      let bestList = [];
      let lastError = null;
      let adminUsers = [];

      for (const base of baseCandidates) {
        for (const endpoint of endpointCandidates) {
          try {
            const res = await api.get(endpoint, { baseURL: base });
            const list = normalizeList(res?.data)
              .map(toRecordingShape)
              .filter((x) => x.id !== "");
            if (list.length > bestList.length) {
              bestList = list;
            }
          } catch (err) {
            lastError = err;
          }
        }
      }

      if (bestList.length === 0) {
        try {
          const [alertsRes, usersRes] = await Promise.all([
            api.get("/api/emergency/active"),
            api.get("/api/admin/users")
          ]);
          const alerts = Array.isArray(alertsRes?.data) ? alertsRes.data : [];
          adminUsers = Array.isArray(usersRes?.data) ? usersRes.data : [];
          bestList = alerts.map((a) => toActiveAlertShape(a, adminUsers)).filter((x) => x.id !== "");
        } catch {
          // keep endpoint errors from above
        }
      }

      if (bestList.length === 0) {
        try {
          if (!adminUsers.length) {
            const usersRes = await api.get("/api/admin/users");
            adminUsers = Array.isArray(usersRes?.data) ? usersRes.data : [];
          }
        } catch {
          // no-op
        }
        const localSession = readLocalSosSession();
        const localRow = toLocalSosShape(localSession, adminUsers);
        if (localRow) {
          bestList = [localRow];
          setNote("Showing local SOS session from this browser (backend emergency endpoint unavailable).");
        }
      }

      if (bestList.length === 0 && liveSignalRowRef.current) {
        bestList = [liveSignalRowRef.current];
        setNote("Showing live SOS signal from current browser session.");
      }

      if (!active) return;
      setRecordings(bestList);

      if (!active) return;
      if (bestList.length === 0 && lastError) {
        const status = lastError?.response?.status;
        if (status === 404) {
          setNote("No SOS admin endpoint available on the active backend yet.");
        } else {
          console.error(lastError);
          const message = lastError?.response?.data?.message || lastError?.message || "Failed to load recordings";
          setError(status ? `Failed to load recordings (${status}): ${message}` : `Failed to load recordings: ${message}`);
        }
      }
    };

    load();
    const timer = setInterval(load, 2500);
    const onStorage = (event) => {
      if (!event?.key) return;
      if (event.key === SOS_SESSION_KEY) {
        load();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return recordings;
    const q = query.toLowerCase();
    return recordings.filter((item) =>
      `${item?.id || ""} ${item?.username || ""} ${item?.email || ""} ${item?.reporterName || ""} ${item?.reporterEmail || ""} ${item?.mediaUrl || ""} ${formatNearbySummary(item)}`.toLowerCase().includes(q)
    );
  }, [recordings, query]);

  const totalDurationMs = useMemo(() => filtered.reduce((sum, item) => sum + (item.durationMs || 0), 0), [filtered]);

  const toggleNearby = (alertId) => {
    const key = String(alertId || "");
    if (!key) return;
    setExpandedNearbyByAlert((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <section className="admin-page-grid">
      <section className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card-static">
          <p>SOS Alerts</p>
          <h3>{recordings.length}</h3>
          <span>Total SOS trigger records</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Filtered Results</p>
          <h3>{filtered.length}</h3>
          <span>Matches current search</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Active SOS Sessions</p>
          <h3>{filtered.filter((item) => item.active).length}</h3>
          <span>Recording session still active</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Total Nearby Users</p>
          <h3>{filtered.reduce((sum, item) => sum + (item.nearbyCount || 0), 0)}</h3>
          <span>Users inside 5km across filtered alerts</span>
        </div>
        <div className="admin-stat-card admin-stat-card-static">
          <p>Total Duration</p>
          <h3>{formatDuration(totalDurationMs)}</h3>
          <span>Sum of available durations</span>
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head admin-table-head-stack">
          <div>
            <h3>SOS Alerts: Exact Location + Nearby Users (5km)</h3>
            <p className="admin-head-note">Shows who triggered SOS, exact coordinates, and nearby users.</p>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by id, username, email, nearby users"
          />
        </header>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table admin-table-rich">
            <thead>
              <tr>
                <th>Alert</th>
                <th>SOS User</th>
                <th>Exact Location</th>
                <th>Nearby Users (5km)</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Video</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={String(item.id)}>
                  <td>
                    #{item.alertId || item.id}
                  </td>
                  <td>
                    <div className="admin-entity-cell">
                      <strong>{item.reporterName || item.username || "Unknown"}</strong>
                      <span>{item.reporterEmail || item.email || "-"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-entity-cell">
                      <strong>{formatLocation(item)}</strong>
                      <span>Radius: {item.radiusMeters || 5000}m</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-entity-cell">
                      <strong>{item.nearbyCount || 0} user(s)</strong>
                      <button
                        type="button"
                        className="admin-link-btn"
                        onClick={() => toggleNearby(item.alertId || item.id)}
                        style={{ width: "fit-content", padding: "5px 10px" }}
                      >
                        {expandedNearbyByAlert[String(item.alertId || item.id)] ? "Hide nearby users" : "Show nearby users"}
                      </button>
                      {expandedNearbyByAlert[String(item.alertId || item.id)] && (
                        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                          {Array.isArray(item.nearbyUsers) && item.nearbyUsers.length > 0 ? (
                            item.nearbyUsers.map((u) => (
                              <div
                                key={`${item.alertId || item.id}-${u?.id || u?.email || Math.random()}`}
                                style={{
                                  border: "1px solid rgba(86, 182, 255, 0.3)",
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  background: "rgba(8, 18, 38, 0.8)"
                                }}
                              >
                                <strong>{u?.name || "User"}</strong>
                                <div className="admin-inline-note">{u?.email || "-"}</div>
                                <div className="admin-inline-note">
                                  Distance: {typeof u?.distanceMeters === "number" ? `${u.distanceMeters}m` : "-"}
                                </div>
                              </div>
                            ))
                          ) : (
                            <span className="admin-inline-note">No users found within 5km.</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>{formatDateTime(item.startedAt)}</td>
                  <td>{formatDateTime(item.endedAt)}</td>
                  <td>{formatDuration(item.durationMs)}</td>
                  <td>
                    <span className={`admin-badge ${item.active ? "warning" : "success"}`}>
                      {item.active ? "Active" : "Stopped"}
                    </span>
                  </td>
                  <td>
                    {item.mediaUrl ? (
                      <a href={item.mediaUrl} target="_blank" rel="noreferrer">
                        Open file
                      </a>
                    ) : (
                      <span className="admin-inline-note">No recording</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!error && filtered.length === 0 && <p className="admin-empty">No SOS alerts found.</p>}
        {!error && note && <p className="admin-empty">{note}</p>}
      </section>
    </section>
  );
}
