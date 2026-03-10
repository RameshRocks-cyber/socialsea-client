import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import "./LiveRecordings.css";

const SOS_HISTORY_KEY = "socialsea_sos_history_v1";
const LIVE_RECORDINGS_PIN_KEY = "socialsea_live_recordings_pin_v1";
const LIVE_RECORDINGS_HIDDEN_KEY = "socialsea_live_recordings_hidden_v1";

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

const readRecordingsPin = () => {
  try {
    const raw = String(localStorage.getItem(LIVE_RECORDINGS_PIN_KEY) || "").trim();
    return /^\d{6}$/.test(raw) ? raw : "";
  } catch {
    return "";
  }
};

const writeRecordingsPin = (pin) => {
  localStorage.setItem(LIVE_RECORDINGS_PIN_KEY, String(pin || "").trim());
};

const readHiddenRecordingIds = () => {
  try {
    const raw = localStorage.getItem(LIVE_RECORDINGS_HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(parsed) ? parsed : []).map((v) => String(v || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
};

const addHiddenRecordingId = (id) => {
  const idText = String(id || "").trim();
  if (!idText) return;
  try {
    const set = readHiddenRecordingIds();
    set.add(idText);
    localStorage.setItem(LIVE_RECORDINGS_HIDDEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore storage errors
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [mediaBaseUrl, setMediaBaseUrl] = useState(api.defaults.baseURL || "");
  const [deletingId, setDeletingId] = useState(null);
  const [sharingId, setSharingId] = useState(null);
  const [pinMode, setPinMode] = useState(() => (readRecordingsPin() ? "unlock" : "setup"));
  const [pinInput, setPinInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const buildBaseCandidates = () => {
    const isLocalDev =
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
    const storedBase =
      typeof window !== "undefined"
        ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
        : "";
    return [
      api.defaults.baseURL,
      storedBase,
      getApiBaseUrl(),
      import.meta.env.VITE_API_URL,
      ...(isLocalDev ? ["/api", "http://localhost:8080", "http://127.0.0.1:8080"] : ["https://socialsea.co.in"]),
    ]
      .filter((v, i, arr) => v && arr.indexOf(v) === i);
  };

  const removeFromLocalHistory = (id) => {
    const idText = String(id || "").trim();
    if (!idText) return;
    try {
      const next = readLocalHistory().filter((entry) => String(entry?.alertId ?? entry?.id ?? entry?.recordingId ?? "").trim() !== idText);
      localStorage.setItem(SOS_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore local storage errors
    }
  };

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
    if (!unlocked) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setNote("");
      try {
        const baseCandidates = buildBaseCandidates();

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
        const hiddenIds = readHiddenRecordingIds();
        const list = normalizeRecordingList(rawList).filter((item) => !hiddenIds.has(String(item.id)));
        const localList = normalizeRecordingList(readLocalHistory());
        const merged = [...list];
        const seen = new Set(merged.map((x) => String(x.id)));
        for (const item of localList) {
          if (hiddenIds.has(String(item.id))) continue;
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
  }, [unlocked]);

  const handlePinSubmit = (event) => {
    event.preventDefault();
    const pin = String(pinInput || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      setPinError("Enter exactly 6 digits.");
      return;
    }

    if (pinMode === "setup") {
      const confirm = String(pinConfirmInput || "").trim();
      if (pin !== confirm) {
        setPinError("PIN and confirm PIN do not match.");
        return;
      }
      writeRecordingsPin(pin);
      setPinError("");
      setUnlocked(true);
      return;
    }

    const stored = readRecordingsPin();
    if (!stored || stored !== pin) {
      setPinError("Incorrect 6-digit password.");
      return;
    }
    setPinError("");
    setUnlocked(true);
  };

  const handleDelete = async (item) => {
    const idText = String(item?.id || "").trim();
    if (!idText || deletingId) return;
    const previousItems = items;
    setDeletingId(idText);
    setError("");
    setNote("");
    setItems((prev) => prev.filter((x) => String(x.id) !== idText));
    setActiveId((prev) => (String(prev) === idText ? null : prev));
    removeFromLocalHistory(idText);

    const endpoints = [
      { method: "delete", url: `/api/profile/live-recordings/${encodeURIComponent(idText)}` },
      { method: "delete", url: `/api/profile/me/live-recordings/${encodeURIComponent(idText)}` },
      { method: "delete", url: `/api/emergency/my-recordings/${encodeURIComponent(idText)}` },
      { method: "delete", url: `/emergency/my-recordings/${encodeURIComponent(idText)}` },
      { method: "post", url: `/api/profile/live-recordings/${encodeURIComponent(idText)}/delete` },
    ];

    let deletedOnServer = false;
    try {
      if (item?.localOnly) {
        deletedOnServer = true;
      } else {
        const baseCandidates = buildBaseCandidates();
        for (const baseURL of baseCandidates) {
          for (const req of endpoints) {
            try {
              await api.request({
                ...req,
                baseURL,
                timeout: 10000,
                suppressAuthRedirect: true,
              });
              deletedOnServer = true;
              break;
            } catch (err) {
              const status = err?.response?.status;
              if (!(status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || status >= 500 || !status)) {
                throw err;
              }
            }
          }
          if (deletedOnServer) break;
        }
      }

      if (!deletedOnServer) {
        // Backend delete API may not be deployed; keep it hidden locally.
        addHiddenRecordingId(idText);
        setError("");
      }
    } catch {
      setItems(previousItems);
      setActiveId(previousItems[0]?.id || null);
      setError("Failed to delete recording.");
    } finally {
      setDeletingId(null);
    }
  };

  const extFromMimeOrUrl = (mime, url) => {
    const m = String(mime || "").toLowerCase();
    if (m.includes("mp4")) return "mp4";
    if (m.includes("webm")) return "webm";
    if (m.includes("quicktime")) return "mov";
    if (m.includes("ogg")) return "ogv";
    const u = String(url || "").toLowerCase();
    if (u.endsWith(".mp4")) return "mp4";
    if (u.endsWith(".webm")) return "webm";
    if (u.endsWith(".mov")) return "mov";
    if (u.endsWith(".ogv")) return "ogv";
    return "mp4";
  };

  const handleShareAsPost = async (item) => {
    const idText = String(item?.id || "").trim();
    if (!idText || sharingId) return;
    const sourceUrl = resolveUrl(item?.mediaUrl || "");
    if (!sourceUrl) {
      setError("No video available to share.");
      return;
    }

    setSharingId(idText);
    setError("");
    setNote("");

    try {
      const mediaRes = await fetch(sourceUrl);
      if (!mediaRes.ok) {
        throw new Error(`Media fetch failed (${mediaRes.status})`);
      }
      const blob = await mediaRes.blob();
      if (!blob || !blob.size) {
        throw new Error("Empty recording data");
      }

      const mimeType = String(blob.type || "video/mp4");
      const ext = extFromMimeOrUrl(mimeType, sourceUrl);
      const file = new File([blob], `sos-recording-${idText}.${ext}`, { type: mimeType });
      const caption = `SOS recording (${formatDateTime(item?.startedAt)})`;

      const endpoints = ["/api/posts/upload", "/posts/upload"];
      const baseCandidates = buildBaseCandidates();
      let shared = false;
      let lastErr = null;

      for (const baseURL of baseCandidates) {
        for (const url of endpoints) {
          try {
            const form = new FormData();
            form.append("file", file);
            form.append("caption", caption);
            form.append("sharedFrom", "sos-recording");
            await api.post(url, form, {
              baseURL,
              headers: { "Content-Type": "multipart/form-data" },
              timeout: 25000,
              suppressAuthRedirect: true,
            });
            shared = true;
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            const status = err?.response?.status;
            if (!(status === 400 || status === 401 || status === 403 || status === 404 || status === 405 || status >= 500 || !status)) {
              throw err;
            }
          }
        }
        if (shared) break;
      }

      if (!shared) {
        throw lastErr || new Error("Share upload failed");
      }
      setNote("Shared as post successfully.");
    } catch {
      setError("Failed to share recording as post.");
    } finally {
      setSharingId(null);
    }
  };

  const active = useMemo(() => {
    return items.find((x) => String(x.id) === String(activeId)) || items[0] || null;
  }, [items, activeId]);

  if (!unlocked) {
    return (
      <div className="live-recordings-page">
        <header className="live-recordings-head">
          <div>
            <h1>Recorded Live</h1>
            <p>Protected page. Enter a 6-digit password.</p>
          </div>
          <button type="button" onClick={() => navigate("/profile/me")}>Back to Profile</button>
        </header>

        <section className="live-recordings-lock-card">
          <h2>{pinMode === "setup" ? "Set 6-digit Password" : "Enter 6-digit Password"}</h2>
          <form className="live-recordings-lock-form" onSubmit={handlePinSubmit}>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={pinInput}
              onChange={(e) => {
                setPinInput(String(e.target.value || "").replace(/\D/g, "").slice(0, 6));
                if (pinError) setPinError("");
              }}
              placeholder="Enter 6 digits"
              autoFocus
            />
            {pinMode === "setup" && (
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={pinConfirmInput}
                onChange={(e) => {
                  setPinConfirmInput(String(e.target.value || "").replace(/\D/g, "").slice(0, 6));
                  if (pinError) setPinError("");
                }}
                placeholder="Confirm 6 digits"
              />
            )}
            {pinError && <p className="live-recordings-error">{pinError}</p>}
            <button type="submit">{pinMode === "setup" ? "Save & Open" : "Unlock"}</button>
          </form>
        </section>
      </div>
    );
  }

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
      {!loading && !error && note && <p className="live-recordings-note">{note}</p>}
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
                  <div className="live-recordings-actions">
                    <button
                      type="button"
                      className="live-recordings-share"
                      disabled={String(sharingId || "") === String(active.id)}
                      onClick={() => handleShareAsPost(active)}
                    >
                      {String(sharingId || "") === String(active.id) ? "Sharing..." : "Share as Post"}
                    </button>
                    <button
                      type="button"
                      className="live-recordings-delete"
                      disabled={String(deletingId || "") === String(active.id)}
                      onClick={() => handleDelete(active)}
                    >
                      {String(deletingId || "") === String(active.id) ? "Deleting..." : "Delete Recording"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </article>

          <aside className="live-recordings-list">
            {items.map((item) => {
              const isActive = String(item.id) === String(active?.id);
              return (
                <article key={item.id} className={`live-recording-item-wrap ${isActive ? "is-active" : ""}`}>
                  <button
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
                  <div className="live-recordings-item-actions">
                    <button
                      type="button"
                      className="live-recordings-share live-recordings-share-small"
                      disabled={String(sharingId || "") === String(item.id)}
                      onClick={() => handleShareAsPost(item)}
                    >
                      {String(sharingId || "") === String(item.id) ? "..." : "Share"}
                    </button>
                    <button
                      type="button"
                      className="live-recordings-delete live-recordings-delete-small"
                      disabled={String(deletingId || "") === String(item.id)}
                      onClick={() => handleDelete(item)}
                    >
                      {String(deletingId || "") === String(item.id) ? "..." : "Delete"}
                    </button>
                  </div>
                </article>
              );
            })}
          </aside>
        </section>
      )}
    </div>
  );
}
