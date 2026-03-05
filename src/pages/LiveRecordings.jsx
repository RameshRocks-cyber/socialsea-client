import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl } from "../api/baseUrl";
import "./LiveRecordings.css";

const formatDuration = (ms) => {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

export default function LiveRecordings() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [mediaBaseUrl, setMediaBaseUrl] = useState(api.defaults.baseURL || "");

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = mediaBaseUrl || api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const host = typeof window !== "undefined" ? String(window.location.hostname || "").toLowerCase() : "";
        const storedBase =
          typeof window !== "undefined"
            ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
            : "";
        const baseCandidates = [
          api.defaults.baseURL,
          storedBase,
          getApiBaseUrl(),
          import.meta.env.VITE_API_URL,
          "http://43.205.213.14:8080",
          "http://localhost:8080",
          "/api",
        ]
          .filter((v, i, arr) => v && arr.indexOf(v) === i)
          .filter((base) => !(host === "localhost" || host === "127.0.0.1") || String(base) !== "/api");

        const endpoints = [
          "/api/profile/live-recordings",
          "/api/profile/me/live-recordings",
          "/api/emergency/my-recordings",
        ];

        let res = null;
        let lastError = null;
        for (const baseURL of baseCandidates) {
          for (const url of endpoints) {
            try {
              res = await api.request({ method: "GET", url, baseURL, timeout: 10000 });
              const body = res?.data;
              const looksLikeHtml =
                typeof body === "string" && (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body));
              if (looksLikeHtml) {
                const htmlErr = new Error("Received HTML instead of API JSON");
                htmlErr.response = { status: 404, data: body };
                throw htmlErr;
              }
              if (res) break;
            } catch (err) {
              lastError = err;
              const status = err?.response?.status;
              if (!(status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || (status >= 500 && status <= 599) || !status)) {
                throw err;
              }
            }
          }
          if (res) break;
        }

        if (!res) {
          throw lastError || new Error("Failed to load recordings");
        }

        if (cancelled) return;
        const payload = res?.data;
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.recordings)
          ? payload.recordings
          : [];
        setMediaBaseUrl(res?.config?.baseURL || api.defaults.baseURL || "");
        setItems(list);
        setActiveId(list[0]?.alertId || null);
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        setError(status === 401 || status === 403 ? "Please login again." : "Failed to load recordings.");
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = useMemo(() => {
    return items.find((x) => String(x.alertId) === String(activeId)) || items[0] || null;
  }, [items, activeId]);

  return (
    <div className="live-recordings-page">
      <header className="live-recordings-head">
        <div>
          <h1>Recorded Live</h1>
          <p>Private SOS recordings. Visible only to you.</p>
        </div>
        <button type="button" onClick={() => navigate("/profile/me")}>Back to Profile</button>
      </header>

      {loading && <p className="live-recordings-empty">Loading recordings...</p>}
      {!loading && error && <p className="live-recordings-error">{error}</p>}
      {!loading && !error && !items.length && (
        <p className="live-recordings-empty">No SOS recordings found yet.</p>
      )}

      {!loading && !error && !!items.length && (
        <section className="live-recordings-layout">
          <article className="live-recordings-player-card">
            {active && (
              <>
                <video
                  key={active.alertId}
                  src={resolveUrl(active.mediaUrl)}
                  controls
                  autoPlay
                  className="live-recordings-player"
                />
                <div className="live-recordings-meta">
                  <p><strong>Started:</strong> {formatDateTime(active.startedAt)}</p>
                  <p><strong>Ended:</strong> {formatDateTime(active.endedAt)}</p>
                  <p><strong>Duration:</strong> {formatDuration(active.durationMs)}</p>
                </div>
              </>
            )}
          </article>

          <aside className="live-recordings-list">
            {items.map((item) => {
              const isActive = String(item.alertId) === String(active?.alertId);
              return (
                <button
                  key={item.alertId}
                  type="button"
                  className={`live-recording-item ${isActive ? "is-active" : ""}`}
                  onClick={() => setActiveId(item.alertId)}
                >
                  <video src={resolveUrl(item.mediaUrl)} muted playsInline preload="metadata" />
                  <div>
                    <p>Alert #{item.alertId}</p>
                    <small>{formatDateTime(item.startedAt)}</small>
                  </div>
                </button>
              );
            })}
          </aside>
        </section>
      )}
    </div>
  );
}
