import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import "./LiveRecordings.css";

const SOS_HISTORY_KEY = "socialsea_sos_history_v1";

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

const readLocalHistory = () => {
  try {
    const raw = localStorage.getItem(SOS_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeRecordingList = (rawList) =>
  (Array.isArray(rawList) ? rawList : [])
    .map((item, index) => ({
      id: item?.alertId ?? item?.id ?? item?.recordingId ?? index + 1,
      mediaUrl:
        item?.mediaUrl ||
        item?.videoUrl ||
        item?.recordingUrl ||
        item?.fileUrl ||
        item?.url ||
        "",
      startedAt: item?.startedAt || item?.createdAt || item?.createdOn || item?.timestamp || null,
      endedAt: item?.endedAt || item?.stoppedAt || null,
      durationMs:
        item?.durationMs ??
        item?.duration ??
        ((item?.elapsedSec != null ? Number(item.elapsedSec) * 1000 : 0) || 0),
      localOnly: Boolean(item?.localOnly),
    }))
    .filter((item) => item.id != null);

export default function LiveRecordings() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [mediaBaseUrl, setMediaBaseUrl] = useState(api.defaults.baseURL || "");

  const resolveUrl = (url) => {
    if (!url) return "";
    const value = String(url).trim();
    if (!value) return "";
    if (/^(https?:)?\/\//i.test(value) || value.startsWith("blob:") || value.startsWith("data:")) return value;
    const base = String(mediaBaseUrl || api.defaults.baseURL || "").replace(/\/+$/, "");
    if (base && /^https?:\/\//i.test(base)) {
      return `${base}${value.startsWith("/") ? value : `/${value}`}`;
    }
    return toApiUrl(value);
  };

  useEffect(() => {
    let cancelled = false;
    const isLocalDev =
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const storedBase =
          typeof window !== "undefined"
            ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
            : "";
        const baseCandidates = [
          api.defaults.baseURL,
          storedBase,
          getApiBaseUrl(),
          import.meta.env.VITE_API_URL,
          ...(isLocalDev ? ["/api", "http://localhost:8080", "http://127.0.0.1:8080"] : ["https://socialsea.co.in"]),
        ]
          .filter((v, i, arr) => v && arr.indexOf(v) === i);

        const endpoints = [
          "/api/profile/live-recordings",
          "/api/profile/me/live-recordings",
          "/api/emergency/my-recordings",
          "/emergency/my-recordings",
        ];

        let res = null;
        let lastError = null;
        for (const baseURL of baseCandidates) {
          for (const url of endpoints) {
            try {
              res = await api.request({
                method: "GET",
                url,
                baseURL,
                timeout: 10000,
                suppressAuthRedirect: true,
              });
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
        const rawList = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.recordings)
            ? payload.recordings
            : Array.isArray(payload?.items)
              ? payload.items
              : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.content)
                  ? payload.content
                  : [];
        const list = normalizeRecordingList(rawList);
        const localList = normalizeRecordingList(readLocalHistory());
        const merged = [...list];
        const seen = new Set(merged.map((x) => String(x.id)));
        for (const item of localList) {
          const key = String(item.id);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }
        setMediaBaseUrl(res?.config?.baseURL || api.defaults.baseURL || "");
        setItems(merged);
        setActiveId(merged[0]?.id || null);
      } catch (err) {
        if (cancelled) return;
        const localList = normalizeRecordingList(readLocalHistory());
        if (localList.length) {
          setItems(localList);
          setActiveId(localList[0]?.id || null);
          setMediaBaseUrl(api.defaults.baseURL || "");
          setError("");
          return;
        }
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          setError("Please login again.");
        } else if (!err?.response) {
          setError("Backend is unreachable. Start backend on http://localhost:8080, then refresh.");
        } else {
          setError("Failed to load recordings.");
        }
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
    return items.find((x) => String(x.id) === String(activeId)) || items[0] || null;
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
                {String(active.mediaUrl || "").trim() ? (
                  <video
                    key={active.id}
                    src={resolveUrl(active.mediaUrl)}
                    controls
                    autoPlay
                    className="live-recordings-player"
                  />
                ) : (
                  <div className="live-recordings-player-empty">
                    Recording saved, but video upload did not complete.
                  </div>
                )}
                <div className="live-recordings-meta">
                  <p><strong>Started:</strong> {formatDateTime(active.startedAt)}</p>
                  <p><strong>Ended:</strong> {formatDateTime(active.endedAt)}</p>
                  <p><strong>Duration:</strong> {formatDuration(active.durationMs)}</p>
                  {active.localOnly && <p><strong>Mode:</strong> Local fallback</p>}
                </div>
              </>
            )}
          </article>

          <aside className="live-recordings-list">
            {items.map((item) => {
              const isActive = String(item.id) === String(active?.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`live-recording-item ${isActive ? "is-active" : ""}`}
                  onClick={() => setActiveId(item.id)}
                >
                  {String(item.mediaUrl || "").trim() ? (
                    <video src={resolveUrl(item.mediaUrl)} muted playsInline preload="metadata" />
                  ) : (
                    <div className="live-recording-item-empty">No video</div>
                  )}
                  <div>
                    <p>Alert #{item.id}</p>
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
