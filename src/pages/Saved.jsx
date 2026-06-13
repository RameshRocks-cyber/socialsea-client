import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadSavedPosts, readSavedPostIdsFromStorage, syncSavedPostCacheFromIds, toggleSavedPost } from "../api/saved";
import { getContentItemsByIds } from "../api/feed";
import { getPublicDisplayName } from "../utils/displayName";
import { resolveMediaUrl } from "../utils/mediaUrl";
import "./Saved.css";

const LONG_VIDEO_SECONDS = 90;

export default function Saved() {
  const navigate = useNavigate();
  const [savedItems, setSavedItems] = useState([]);
  const [durationById, setDurationById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const items = await loadSavedPosts();
        if (!mounted) return;
        const next = Array.isArray(items) ? items.filter(Boolean) : [];
        setSavedItems(next);
        syncSavedPostCacheFromIds(next.map((item) => item?.id));
      } catch {
        if (!mounted) return;
        const fallbackIds = readSavedPostIdsFromStorage();
        if (!fallbackIds.length) {
          setSavedItems([]);
          setError("Could not load saved posts right now.");
          return;
        }

        try {
          const fallbackItems = await getContentItemsByIds(fallbackIds);
          setSavedItems(fallbackItems);
          setError("");
        } catch {
          setSavedItems([]);
          setError("Could not load saved posts right now.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const usernameFor = (item) => getPublicDisplayName(item?.user || item);

  const isVideo = (item) => {
    const type = (item?.type || "").toUpperCase();
    if (type) return type === "VIDEO";
    const url = String(item?.contentUrl || item?.mediaUrl || "").toLowerCase();
    return /\.(mp4|mov|webm|mkv|m4v)(\?|$)/.test(url);
  };

  const openItem = (item) => {
    const id = Number(item?.id);
    if (!id) return;
    if (isVideo(item)) {
      const duration = durationById[id] || 0;
      if (duration > LONG_VIDEO_SECONDS) {
        navigate(`/watch/${id}`);
      } else {
        navigate(`/clips?post=${id}`);
      }
      return;
    }
    navigate("/feed");
  };

  const removeSaved = async (id) => {
    const safeId = Number(id);
    if (!Number.isFinite(safeId) || safeId <= 0) return;
    try {
      await toggleSavedPost(safeId);
      setSavedItems((prev) => {
        const next = prev.filter((item) => Number(item?.id) !== safeId);
        syncSavedPostCacheFromIds(next.map((item) => item?.id));
        return next;
      });
    } catch {
      // Keep the server-backed saved list untouched if removal fails.
    }
  };

  return (
    <div className="saved-page">
      <header className="saved-head">
        <h1>Saved Posts</h1>
        <p>{savedItems.length} items</p>
      </header>

      {loading && <p className="saved-empty">Loading saved posts...</p>}
      {!loading && error && <p className="saved-empty">{error}</p>}
      {!loading && savedItems.length === 0 && (
        <div className="saved-empty-wrap">
          <p className="saved-empty">No saved posts yet.</p>
          <button type="button" onClick={() => navigate("/feed")}>Go to Feed</button>
        </div>
      )}

      <section className="saved-grid">
        {savedItems.map((item) => {
          const raw = item?.contentUrl || item?.mediaUrl || "";
          const mediaUrl = resolveMediaUrl(String(raw).trim());
          if (!mediaUrl) return null;
          const video = isVideo(item);
          return (
            <article key={item.id} className="saved-card">
              <button type="button" className="saved-media-btn" onClick={() => openItem(item)}>
                {video ? (
                  <video
                    src={mediaUrl}
                    className="saved-media"
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const d = Number(e.currentTarget.duration || 0);
                      setDurationById((prev) => (prev[item.id] === d ? prev : { ...prev, [item.id]: d }));
                    }}
                  />
                ) : (
                  <img src={mediaUrl} alt="saved" className="saved-media" />
                )}
                {video && <span className="saved-video-tag">Video</span>}
              </button>

              <div className="saved-meta">
                <h3>{item.description || item.content || "Untitled post"}</h3>
                <p>{usernameFor(item)}</p>
              </div>

              <div className="saved-actions">
                <button type="button" onClick={() => openItem(item)}>Open</button>
                <button type="button" className="danger" onClick={() => removeSaved(item.id)}>Remove</button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
