import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  getVaultItems,
  isVaultSupported,
  isVaultUnlocked,
  readVaultLockSynced,
  removeVaultItem
} from "../services/vaultStorage";
import "./CallRecordings.css";

const formatDateTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const isCallRecordingItem = (item) => {
  const source = String(item?.source || item?.meta?.source || "").trim().toLowerCase();
  if (source === "call-recording") return true;
  const type = String(item?.type || "").toLowerCase();
  if (!type.startsWith("audio/")) return false;
  const name = String(item?.name || "").toLowerCase();
  return name.startsWith("call-") || name.includes("call-audio");
};

const toMeta = (item) => (item?.meta && typeof item.meta === "object" ? item.meta : {});

export default function CallRecordings() {
  const navigate = useNavigate();
  const unsupported = !isVaultSupported();
  const [lockLoaded, setLockLoaded] = useState(false);
  const [lock, setLock] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [urlMap, setUrlMap] = useState({});
  const [removingId, setRemovingId] = useState(null);

  const loadRecordings = useCallback(async () => {
    if (unsupported) return;
    setLoading(true);
    setError("");
    try {
      const all = await getVaultItems();
      const callItems = all.filter(isCallRecordingItem);
      setItems(callItems);
    } catch (err) {
      setError(err?.message || "Unable to load call recordings.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [unsupported]);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      if (unsupported) {
        if (mounted) setLockLoaded(true);
        return;
      }
      const nextLock = await readVaultLockSynced();
      if (!mounted) return;
      setLock(nextLock);
      setUnlocked(isVaultUnlocked(nextLock));
      setLockLoaded(true);
    };
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [unsupported]);

  useEffect(() => {
    if (unsupported || !lockLoaded || !lock || !unlocked) return;
    loadRecordings();
  }, [unsupported, lockLoaded, lock, unlocked, loadRecordings]);

  useEffect(() => {
    const next = {};
    items.forEach((item) => {
      if (item?.blob instanceof Blob) {
        next[item.id] = URL.createObjectURL(item.blob);
      }
    });
    setUrlMap(next);
    return () => {
      Object.values(next).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore revoke errors
        }
      });
    };
  }, [items]);

  const handleRemove = async (id) => {
    if (!id || removingId) return;
    setRemovingId(id);
    setError("");
    try {
      await removeVaultItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(err?.message || "Failed to remove recording.");
    } finally {
      setRemovingId(null);
    }
  };

  if (!lockLoaded) {
    return (
      <div className="call-recordings-page">
        <div className="call-recordings-shell">
          <p className="call-recordings-empty">Loading vault access...</p>
        </div>
      </div>
    );
  }

  if (!unsupported && (!lock || !unlocked)) {
    return <Navigate to="/storage/unlock" replace />;
  }

  return (
    <div className="call-recordings-page">
      <div className="call-recordings-shell">
        <header className="call-recordings-head">
          <button type="button" className="call-recordings-back" onClick={() => navigate("/storage", { replace: true })}>
            {"<"}
          </button>
          <div className="call-recordings-head-copy">
            <h1>Call Recordings</h1>
            <p className="call-recordings-subtitle">Listen to audio recordings saved from your voice and video calls.</p>
          </div>
          <button type="button" className="call-recordings-refresh" onClick={loadRecordings} disabled={loading || unsupported}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {unsupported && <p className="call-recordings-error">Storage Vault is not supported in this browser.</p>}
        {!unsupported && error && <p className="call-recordings-error">{error}</p>}
        {!unsupported && !loading && !items.length && (
          <p className="call-recordings-empty">No call recordings saved yet. Start recording from the call popup first.</p>
        )}

        {!unsupported && !loading && !!items.length && (
          <section className="call-recordings-list">
            {items.map((item) => {
              const meta = toMeta(item);
              const peerName = String(meta.peerName || "").trim() || "Unknown contact";
              const callMode = String(meta.callMode || "").toLowerCase() === "video" ? "Video call audio" : "Voice call audio";
              const duration = formatDuration(meta.durationSec);
              const startedAt = formatDateTime(meta.startedAt || item.addedAt);
              const savedAt = formatDateTime(item.addedAt);
              const audioUrl = urlMap[item.id];
              return (
                <article className="call-recording-card" key={`call-recording-${item.id}`}>
                  <div className="call-recording-main">
                    <h2 className="call-recording-title">{peerName}</h2>
                    <p className="call-recording-meta">{callMode}</p>
                    {duration && <p className="call-recordings-badge">Duration {duration}</p>}
                    <p className="call-recording-meta">Started: {startedAt || "-"}</p>
                    <p className="call-recording-meta">Saved: {savedAt || "-"}</p>
                    {audioUrl ? (
                      <audio className="call-recording-player" controls preload="metadata" src={audioUrl} />
                    ) : (
                      <p className="call-recordings-error">Audio data is unavailable for this item.</p>
                    )}
                  </div>
                  <div className="call-recording-actions">
                    {audioUrl && (
                      <a className="call-recording-action" href={audioUrl} download={item.name || "call-recording.webm"}>
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      className="call-recording-action secondary"
                      onClick={() => handleRemove(item.id)}
                      disabled={Boolean(removingId)}
                    >
                      {removingId === item.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
