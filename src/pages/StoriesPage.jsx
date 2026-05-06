import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import {
  STORY_ACTIVE_STORAGE_KEY,
  STORY_ARCHIVE_STORAGE_KEY,
  isStoryExpired,
  readStoriesForIdentity,
  readStoryIdentity,
  syncStoryCaches,
  syncStoryCachesForIdentity,
  toStoryEpochMs
} from "../services/storyStorage";
import "./StoriesPage.css";

const resolveMediaUrl = (raw) => {
  if (!raw) return "";
  return toApiUrl(String(raw));
};

const isVideoUrl = (url) =>
  /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/i.test(String(url || ""));

const formatDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

const formatStatus = (story) => {
  const expiresAt = toStoryEpochMs(story?.expiresAt || 0);
  if (story?.sourceType === "reel-share") {
    return isStoryExpired(story)
      ? `Saved reel - expired ${formatDateTime(expiresAt)}`
      : `Saved reel - active until ${formatDateTime(expiresAt)}`;
  }
  return isStoryExpired(story)
    ? `Expired ${formatDateTime(expiresAt)}`
    : `Active until ${formatDateTime(expiresAt)}`;
};

const getStoryLabel = (story) => {
  const label = String(story?.storyText || story?.caption || "").trim();
  if (label) return label;
  return story?.sourceType === "reel-share" ? "Shared reel" : "Story";
};

const toCount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
};

const toItems = (payload) =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

const toViewedAt = (entry) => entry?.viewedAt || entry?.createdAt || entry?.time || null;
const toLikedAt = (entry) => entry?.likedAt || entry?.createdAt || entry?.time || null;
const toUserKey = (entry, idx, prefix) => {
  const id = String(entry?.userId ?? entry?.id ?? "").trim();
  if (id) return `id:${id}`;
  const email = String(entry?.email ?? entry?.userEmail ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const username = String(entry?.username ?? entry?.name ?? "").trim().toLowerCase();
  if (username) return `name:${username}`;
  return `${prefix}:${idx}`;
};
const toTs = (value) => {
  const n = Number(value);
  if (Number.isFinite(n)) return n > 1000000000000 ? n : n * 1000;
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatEngagement = (story) =>
  `Likes ${toCount(story?.likeCount)} | Views ${toCount(story?.viewCount)}`;

const storyDisplayDedupeKey = (story) => {
  const sourceType = String(story?.sourceType || story?.kind || "story").trim().toLowerCase();
  const ownerKey = String(story?.userId || story?.email || story?.username || "")
    .trim()
    .toLowerCase();
  const mediaKey = resolveMediaUrl(story?.mediaUrl || story?.url || story?.fileUrl || story?.storyUrl || "");
  const expiresAtMs = toStoryEpochMs(story?.expiresAt || story?.expires || story?.expiry || 0);
  const labelKey = String(story?.storyText || story?.caption || "").trim().toLowerCase();
  const createdAtMs = toStoryEpochMs(story?.createdAt || story?.created || story?.timestamp || story?.time || 0);
  const stableId = String(story?.archiveId || story?.storyId || story?.id || "").trim();

  if (mediaKey) return `sig:${sourceType}|${ownerKey}|${mediaKey}|${expiresAtMs}|${labelKey}`;
  if (stableId) return `id:${sourceType}|${stableId}`;
  return `time:${sourceType}|${ownerKey}|${createdAtMs}|${labelKey}`;
};

const dedupeStoriesForDisplay = (list) => {
  const map = new Map();
  const input = Array.isArray(list) ? list : [];

  input.forEach((story) => {
    if (!story) return;
    const key = storyDisplayDedupeKey(story);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, story);
      return;
    }

    const prevCreatedAtMs = toStoryEpochMs(
      previous?.createdAt || previous?.created || previous?.timestamp || previous?.time || 0
    );
    const nextCreatedAtMs = toStoryEpochMs(
      story?.createdAt || story?.created || story?.timestamp || story?.time || 0
    );

    const merged = {
      ...(prevCreatedAtMs >= nextCreatedAtMs ? previous : story),
      ...previous,
      ...story,
      likeCount: Math.max(toCount(previous?.likeCount), toCount(story?.likeCount)),
      commentCount: Math.max(toCount(previous?.commentCount), toCount(story?.commentCount)),
      viewCount: Math.max(toCount(previous?.viewCount), toCount(story?.viewCount))
    };
    map.set(key, merged);
  });

  return Array.from(map.values());
};

const StorySection = ({ title, emptyText, items, onOpen }) => (
  <section className="stories-section">
    <div className="stories-section-head">
      <div>
        <h3>{title}</h3>
      </div>
      <span className="stories-count">{items.length}</span>
    </div>

    {items.length === 0 ? (
      <p className="stories-empty">{emptyText}</p>
    ) : (
      <div className="stories-grid">
        {items.map((story) => {
          const mediaUrl = resolveMediaUrl(story.mediaUrl);
          const caption = getStoryLabel(story);
          const expired = isStoryExpired(story);
          const video = isVideoUrl(mediaUrl) || story?.isVideo === true;
          const isReelShare = story?.sourceType === "reel-share";

          return (
            <button
              key={String(story.archiveId || story.id)}
              type="button"
              className={`stories-card ${expired ? "is-expired" : ""}`.trim()}
              onClick={() => onOpen({ ...story, mediaUrl })}
            >
              <div className="stories-thumb">
                <div className="stories-badge-row">
                  {isReelShare && <span className="stories-type-badge reel">Shared reel</span>}
                  {expired && <span className="stories-expired-badge">Expired</span>}
                </div>
                {mediaUrl ? (
                  video ? (
                    <video src={mediaUrl} muted playsInline preload="metadata" />
                  ) : (
                    <img src={mediaUrl} alt={caption || "Story"} />
                  )
                ) : (
                  <div className="stories-thumb-empty">{isReelShare ? "Reel" : "Story"}</div>
                )}
              </div>
              <div className="stories-meta">
                <p>{caption}</p>
                <small>{formatStatus(story)}</small>
                <small className="stories-meta-stats">{formatEngagement(story)}</small>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </section>
);

export default function StoriesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const identity = useMemo(() => readStoryIdentity(), []);
  const [stories, setStories] = useState(() => readStoriesForIdentity(identity));
  const [loading, setLoading] = useState(() => stories.length === 0);
  const [error, setError] = useState("");
  const [activeStory, setActiveStory] = useState(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersError, setViewersError] = useState("");
  const [viewersItems, setViewersItems] = useState([]);

  useEffect(() => {
    let mounted = true;

    const refreshLocal = () => {
      if (!mounted) return;
      setStories(readStoriesForIdentity(identity));
    };

    const load = async () => {
      setLoading(true);
      setError("");
      refreshLocal();
      try {
        const res = await api.get("/api/stories/mine", { timeout: 12000 });
        if (!mounted) return;
        syncStoryCachesForIdentity(identity, Array.isArray(res?.data) ? res.data : []);
        refreshLocal();
      } catch {
        if (!mounted) return;
        refreshLocal();
        setError("Unable to load stories from server. Showing saved stories on this device.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const onStorage = (event) => {
      if (
        !event ||
        event.key === STORY_ACTIVE_STORAGE_KEY ||
        event.key === STORY_ARCHIVE_STORAGE_KEY
      ) {
        refreshLocal();
      }
    };

    void load();
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
    };
  }, [identity]);

  const sortedStories = useMemo(() => {
    const list = dedupeStoriesForDisplay(Array.isArray(stories) ? stories : []);
    return list.sort(
      (a, b) => toStoryEpochMs(b?.createdAt || 0) - toStoryEpochMs(a?.createdAt || 0)
    );
  }, [stories]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const targetStoryId = String(params.get("story") || params.get("storyId") || "").trim();
    if (!targetStoryId) return;
    const target = sortedStories.find((story) => {
      const id = String(story?.id ?? story?.storyId ?? "").trim();
      if (id && id === targetStoryId) return true;
      const archiveId = String(story?.archiveId ?? "").trim();
      return archiveId && archiveId === targetStoryId;
    });
    if (!target) return;
    setActiveStory({
      ...target,
      mediaUrl: resolveMediaUrl(target?.mediaUrl || target?.url || target?.fileUrl || target?.storyUrl || "")
    });
    navigate("/stories", { replace: true });
  }, [location.search, sortedStories, navigate]);

  const activeStories = useMemo(
    () =>
      sortedStories.filter(
        (story) => story?.sourceType !== "reel-share" && !isStoryExpired(story)
      ),
    [sortedStories]
  );

  const pastStories = useMemo(
    () =>
      sortedStories.filter(
        (story) => story?.sourceType !== "reel-share" && isStoryExpired(story)
      ),
    [sortedStories]
  );

  useEffect(() => {
    setViewersOpen(false);
    setViewersLoading(false);
    setViewersError("");
    setViewersItems([]);
  }, [activeStory?.id, activeStory?.storyId]);

  const closeViewersList = () => {
    setViewersOpen(false);
    setViewersLoading(false);
    setViewersError("");
    setViewersItems([]);
  };

  const openEngagementInsights = async (story) => {
    const storyId = Number(story?.id || story?.storyId || 0);
    setViewersOpen(true);
    setViewersLoading(true);
    setViewersError("");
    setViewersItems([]);

    if (!Number.isFinite(storyId) || storyId <= 0) {
      setViewersError("Story insights are available after this story syncs to server.");
      setViewersLoading(false);
      return;
    }

    try {
      const [viewsResult, likesResult] = await Promise.allSettled([
        api.get(`/api/stories/${Math.floor(storyId)}/views`, { timeout: 12000 }),
        api.get(`/api/stories/${Math.floor(storyId)}/likes`, { timeout: 12000 })
      ]);

      const viewsItems = viewsResult.status === "fulfilled" ? toItems(viewsResult.value?.data) : [];
      const likesItems = likesResult.status === "fulfilled" ? toItems(likesResult.value?.data) : [];

      if (viewsResult.status === "rejected" && likesResult.status === "rejected") {
        throw viewsResult.reason || likesResult.reason || new Error("Failed to load story engagement");
      }

      const merged = new Map();

      viewsItems.forEach((entry, idx) => {
        const key = toUserKey(entry, idx, "view");
        const viewedAt = toViewedAt(entry);
        merged.set(key, {
          ...entry,
          viewedAt,
          likedAt: null,
          viewed: true,
          liked: false,
          _insightAt: viewedAt,
          _sortTs: toTs(viewedAt),
          _entryIdx: idx
        });
      });

      likesItems.forEach((entry, idx) => {
        const key = toUserKey(entry, idx, "like");
        const likedAt = toLikedAt(entry);
        const existing = merged.get(key);

        if (existing) {
          merged.set(key, {
            ...existing,
            ...entry,
            viewed: true,
            liked: true,
            likedAt: likedAt || existing?.likedAt || null,
            _insightAt: likedAt || existing?._insightAt || existing?.viewedAt || null,
            _sortTs: Math.max(existing?._sortTs || 0, toTs(likedAt)),
            _entryIdx: existing?._entryIdx ?? idx
          });
          return;
        }

        merged.set(key, {
          ...entry,
          viewedAt: toViewedAt(entry) || likedAt || null,
          likedAt,
          viewed: true,
          liked: true,
          _insightAt: likedAt,
          _sortTs: toTs(likedAt),
          _entryIdx: idx
        });
      });

      const rows = Array.from(merged.values())
        .sort((a, b) => (b?._sortTs || 0) - (a?._sortTs || 0))
        .map((entry) => {
          const { _sortTs, ...rest } = entry || {};
          return rest;
        });
      setViewersItems(rows);

      const nextLikeCount =
        likesResult.status === "fulfilled"
          ? Math.max(toCount(likesResult.value?.data?.count), likesItems.length)
          : toCount(story?.likeCount);
      const nextViewCount =
        viewsResult.status === "fulfilled"
          ? Math.max(toCount(viewsResult.value?.data?.count), viewsItems.length)
          : toCount(story?.viewCount);

      setActiveStory((prev) => {
        if (!prev) return prev;
        const prevId = Number(prev?.id || prev?.storyId || 0);
        const normalizedStoryId = Math.floor(storyId);
        if (Number.isFinite(prevId) && prevId > 0 && prevId !== normalizedStoryId) {
          return prev;
        }
        return {
          ...prev,
          likeCount: nextLikeCount,
          viewCount: nextViewCount
        };
      });

      setStories((prev) => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const normalizedStoryId = Math.floor(storyId);
        const storyArchiveId = String(story?.archiveId || "").trim();
        let changed = false;
        const updated = prev.map((item) => {
          const itemId = Number(item?.id || item?.storyId || 0);
          const byId = Number.isFinite(itemId) && itemId > 0 && itemId === normalizedStoryId;
          const itemArchiveId = String(item?.archiveId || "").trim();
          const byArchive = Boolean(storyArchiveId) && itemArchiveId === storyArchiveId;
          if (!byId && !byArchive) return item;
          changed = true;
          return {
            ...item,
            likeCount: nextLikeCount,
            viewCount: nextViewCount
          };
        });
        if (!changed) return prev;
        syncStoryCaches(updated);
        return updated;
      });
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to load story insights";
      setViewersError(String(message));
    } finally {
      setViewersLoading(false);
    }
  };

  return (
    <div className="stories-page">
      <header className="stories-header">
        <button type="button" className="stories-back" onClick={() => navigate(-1)}>
          Back
        </button>
        <div className="stories-title-wrap">
          <h2>My Stories</h2>
        </div>
        <button type="button" className="stories-create" onClick={() => navigate("/story/create")}>
          + Create
        </button>
      </header>

      {error && <p className="stories-error">{error}</p>}
      {loading && stories.length === 0 && <p className="stories-loading">Loading stories...</p>}

      <div className="stories-summary">
        <div className="stories-summary-card">
          <strong>{activeStories.length}</strong>
          <span>Active stories</span>
        </div>
        <div className="stories-summary-card">
          <strong>{pastStories.length}</strong>
          <span>Past stories</span>
        </div>
      </div>

      <StorySection
        title="Active Stories"
        emptyText="No active stories yet."
        items={activeStories}
        onOpen={setActiveStory}
      />

      <StorySection
        title="Past Stories"
        emptyText="No past stories yet."
        items={pastStories}
        onOpen={setActiveStory}
      />

      {activeStory && (
        <div className="stories-viewer-backdrop" onClick={() => setActiveStory(null)}>
          <div className="stories-viewer" onClick={(event) => event.stopPropagation()}>
            <div className="stories-viewer-quick-actions">
              <button
                type="button"
                className={`stories-viewer-quick-btn ${viewersOpen ? "is-active" : ""}`.trim()}
                onClick={() => void openEngagementInsights(activeStory)}
              >
                Viewed {toCount(activeStory?.viewCount)} | Likes {toCount(activeStory?.likeCount)}
              </button>
            </div>
            <button
              type="button"
              className="stories-viewer-close"
              onClick={() => setActiveStory(null)}
            >
              x
            </button>
            <div className="stories-viewer-body">
              <div className="stories-viewer-media">
                {isVideoUrl(activeStory.mediaUrl) || activeStory?.isVideo === true ? (
                  <video src={activeStory.mediaUrl} autoPlay playsInline controls />
                ) : (
                  <img
                    src={activeStory.mediaUrl}
                    alt={activeStory.storyText || activeStory.caption || "Story"}
                  />
                )}
              </div>
              <div className="stories-viewer-meta">
                <strong>{getStoryLabel(activeStory)}</strong>
                <span>{formatStatus(activeStory)}</span>
                <span className="stories-viewer-stats">{formatEngagement(activeStory)}</span>
              </div>
              {(activeStory.storyText || activeStory.caption) && (
                <p className="stories-viewer-caption">
                  {activeStory.storyText || activeStory.caption}
                </p>
              )}
            </div>
            {viewersOpen && (
              <div className="stories-insights-backdrop" onClick={closeViewersList}>
                <div className="stories-insights" onClick={(event) => event.stopPropagation()}>
                  <div className="stories-insights-header">
                    <strong>
                      Viewed by {toCount(activeStory?.viewCount || viewersItems.length || 0)}
                    </strong>
                    <button type="button" aria-label="Close viewers list" onClick={closeViewersList}>
                      x
                    </button>
                  </div>

                  {viewersLoading && <p className="stories-insights-state">Loading insights...</p>}
                  {!viewersLoading && viewersError && (
                    <p className="stories-insights-state error">{viewersError}</p>
                  )}
                  {!viewersLoading && !viewersError && viewersItems.length === 0 && (
                    <p className="stories-insights-state">No data yet.</p>
                  )}
                  {!viewersLoading && !viewersError && viewersItems.length > 0 && (
                    <div className="stories-insights-list">
                      {viewersItems.map((entry, idx) => {
                        const name =
                          String(entry?.name || entry?.username || entry?.email || "Unknown").trim() ||
                          "Unknown";
                        const avatarRaw = String(entry?.profilePic || "").trim();
                        const avatarUrl = avatarRaw ? resolveMediaUrl(avatarRaw) : "";
                        const insightAt = entry?._insightAt || entry?.likedAt || entry?.viewedAt || null;
                        const entryKey = `${entry?.userId || "u"}-${entry?.email || "x"}-${
                          entry?._entryIdx ?? idx
                        }`;

                        return (
                          <div key={entryKey} className="stories-insights-item">
                            <div className="stories-insights-avatar" aria-hidden="true">
                              {avatarUrl ? (
                                <img src={avatarUrl} alt={name} />
                              ) : (
                                <span>{name.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="stories-insights-meta">
                              <strong>{name}</strong>
                              <p className="stories-insights-engagement">
                                {entry?.liked ? "Liked" : "Viewed"}
                              </p>
                              {insightAt && <small>{formatDateTime(insightAt)}</small>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
