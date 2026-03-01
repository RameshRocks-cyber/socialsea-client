import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Saved.css";

const LONG_VIDEO_SECONDS = 90;

const readIds = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  } catch {
    return [];
  }
};

export default function Saved() {
  const navigate = useNavigate();
  const [itemsById, setItemsById] = useState({});
  const [durationById, setDurationById] = useState({});
  const [loading, setLoading] = useState(true);
  const [savedPostIds, setSavedPostIds] = useState(() => readIds("savedPostIds"));
  const [savedReelIds, setSavedReelIds] = useState(() => readIds("savedReelIds"));

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [feedRes, reelsRes] = await Promise.all([
          api.get("/api/feed").catch(() => ({ data: [] })),
          api.get("/api/reels").catch(() => ({ data: [] }))
        ]);
        const all = [
          ...(Array.isArray(feedRes.data) ? feedRes.data : []),
          ...(Array.isArray(reelsRes.data) ? reelsRes.data : [])
        ];
        const next = {};
        all.forEach((item) => {
          if (!item?.id) return;
          next[item.id] = item;
        });
        if (mounted) setItemsById(next);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  const usernameFor = (item) => {
    const raw = item?.user?.name || item?.username || item?.user?.email || "User";
    const local = raw.includes("@") ? raw.split("@")[0] : raw;
    return local
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(" ");
  };

  const savedIdsMerged = useMemo(() => {
    const ordered = [...savedPostIds, ...savedReelIds];
    const seen = new Set();
    return ordered.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [savedPostIds, savedReelIds]);

  const savedItems = useMemo(
    () => savedIdsMerged.map((id) => itemsById[id]).filter(Boolean),
    [itemsById, savedIdsMerged]
  );

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
        navigate(`/reels?post=${id}`);
      }
      return;
    }
    navigate("/feed");
  };

  const removeSaved = (id) => {
    const nextPosts = savedPostIds.filter((x) => x !== Number(id));
    const nextReels = savedReelIds.filter((x) => x !== Number(id));
    setSavedPostIds(nextPosts);
    setSavedReelIds(nextReels);
    localStorage.setItem("savedPostIds", JSON.stringify(nextPosts));
    localStorage.setItem("savedReelIds", JSON.stringify(nextReels));
  };

  return (
    <div className="saved-page">
      <header className="saved-head">
        <h1>Saved Posts</h1>
        <p>{savedItems.length} items</p>
      </header>

      {loading && <p className="saved-empty">Loading saved posts...</p>}
      {!loading && savedItems.length === 0 && (
        <div className="saved-empty-wrap">
          <p className="saved-empty">No saved posts yet.</p>
          <button type="button" onClick={() => navigate("/feed")}>Go to Feed</button>
        </div>
      )}

      <section className="saved-grid">
        {savedItems.map((item) => {
          const raw = item?.contentUrl || item?.mediaUrl || "";
          const mediaUrl = resolveUrl(String(raw).trim());
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
