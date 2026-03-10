import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { formatDateTime } from "../admin/adminMetrics";

const toRecordingShape = (item) => ({
  id: item?.id ?? item?.alertId ?? "",
  alertId: item?.alertId ?? item?.id ?? "",
  username: item?.username || item?.name || item?.reporterName || "",
  email: item?.email || item?.reporterEmail || "",
  mediaUrl: item?.mediaUrl || item?.recordingUrl || item?.videoUrl || "",
  startedAt: item?.startedAt || item?.createdAt || null,
  endedAt: item?.endedAt || null,
  durationMs: Number(item?.durationMs || 0),
  active: Boolean(item?.active),
  latitude: item?.currentLatitude ?? item?.latitude ?? null,
  longitude: item?.currentLongitude ?? item?.longitude ?? null,
  accuracyMeters: item?.accuracyMeters ?? null
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

export default function AdminLiveRecordings() {
  const [recordings, setRecordings] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
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
        "/admin/live-recordings"
      ];

      let bestList = [];
      let lastError = null;

      for (const base of baseCandidates) {
        for (const endpoint of endpointCandidates) {
          try {
            const res = await api.get(endpoint, { baseURL: base });
            const list = normalizeList(res?.data)
              .map(toRecordingShape)
              .filter((x) => x.id !== "" && x.mediaUrl);
            if (list.length > bestList.length) {
              bestList = list;
            }
          } catch (err) {
            lastError = err;
          }
        }
      }

      setRecordings(bestList);

      if (bestList.length === 0 && lastError) {
        const status = lastError?.response?.status;
        if (status === 404) {
          setNote("No recordings endpoint available on the active backend yet.");
        } else {
          console.error(lastError);
          const message = lastError?.response?.data?.message || lastError?.message || "Failed to load recordings";
          setError(status ? `Failed to load recordings (${status}): ${message}` : `Failed to load recordings: ${message}`);
        }
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return recordings;
    const q = query.toLowerCase();
    return recordings.filter((item) =>
      `${item?.id || ""} ${item?.username || ""} ${item?.email || ""} ${item?.mediaUrl || ""}`.toLowerCase().includes(q)
    );
  }, [recordings, query]);

  const totalDurationMs = useMemo(() => filtered.reduce((sum, item) => sum + (item.durationMs || 0), 0), [filtered]);

  return (
    <section className="admin-page-grid">
      <section className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card-static">
          <p>Recorded Videos</p>
          <h3>{recordings.length}</h3>
          <span>Total records in storage</span>
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
          <p>Total Duration</p>
          <h3>{formatDuration(totalDurationMs)}</h3>
          <span>Sum of available durations</span>
        </div>
      </section>

      <section className="admin-table-panel">
        <header className="admin-table-head admin-table-head-stack">
          <div>
            <h3>Live Video Recordings</h3>
            <p className="admin-head-note">Admin archive of SOS videos with user identity.</p>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by id, username, email"
          />
        </header>

        {error && <p className="admin-error">{error}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table admin-table-rich">
            <thead>
              <tr>
                <th>Video</th>
                <th>User</th>
                <th>Email</th>
                <th>Location</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={String(item.id)}>
                  <td>
                    <video
                      controls
                      preload="metadata"
                      style={{ width: 210, maxWidth: "100%", borderRadius: 10, background: "#000" }}
                    >
                      <source src={item.mediaUrl} />
                    </video>
                  </td>
                  <td>{item.username || "Unknown"}</td>
                  <td>{item.email || "-"}</td>
                  <td>{formatLocation(item)}</td>
                  <td>{formatDateTime(item.startedAt)}</td>
                  <td>{formatDateTime(item.endedAt)}</td>
                  <td>{formatDuration(item.durationMs)}</td>
                  <td>
                    <span className={`admin-badge ${item.active ? "warning" : "success"}`}>
                      {item.active ? "Active" : "Saved"}
                    </span>
                  </td>
                  <td>
                    <a href={item.mediaUrl} target="_blank" rel="noreferrer">
                      Open file
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!error && filtered.length === 0 && <p className="admin-empty">No recorded videos found.</p>}
        {!error && note && <p className="admin-empty">{note}</p>}
      </section>
    </section>
  );
}
