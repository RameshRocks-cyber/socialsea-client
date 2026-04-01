import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import {
  STORY_ACTIVE_STORAGE_KEY,
  STORY_ARCHIVE_STORAGE_KEY,
  isStoryExpired,
  readStoriesForIdentity,
  readStoryIdentity,
  syncStoryCaches,
  toStoryEpochMs
} from "../services/storyStorage";
import "./StoriesPage.css";

const resolveMediaUrl = (raw) => {
  if (!raw) return "";
  return String(raw).startsWith("http") ? String(raw) : toApiUrl(String(raw));
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

const StorySection = ({ title, subtitle, emptyText, items, onOpen }) => (
  <section className="stories-section">
    <div className="stories-section-head">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
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
  const identity = useMemo(() => readStoryIdentity(), []);
  const [stories, setStories] = useState(() => readStoriesForIdentity(identity));
  const [loading, setLoading] = useState(() => stories.length === 0);
  const [error, setError] = useState("");
  const [activeStory, setActiveStory] = useState(null);

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
        syncStoryCaches(Array.isArray(res?.data) ? res.data : []);
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
    const list = Array.isArray(stories) ? stories.slice() : [];
    return list.sort(
      (a, b) => toStoryEpochMs(b?.createdAt || 0) - toStoryEpochMs(a?.createdAt || 0)
    );
  }, [stories]);

  const activeStories = useMemo(
    () =>
      sortedStories.filter(
        (story) => story?.sourceType !== "reel-share" && !isStoryExpired(story)
      ),
    [sortedStories]
  );

  const sharedReels = useMemo(
    () => sortedStories.filter((story) => story?.sourceType === "reel-share"),
    [sortedStories]
  );

  const pastStories = useMemo(
    () =>
      sortedStories.filter(
        (story) => story?.sourceType !== "reel-share" && isStoryExpired(story)
      ),
    [sortedStories]
  );

  return (
    <div className="stories-page">
      <header className="stories-header">
        <button type="button" className="stories-back" onClick={() => navigate(-1)}>
          Back
        </button>
        <div className="stories-title-wrap">
          <h2>My Stories</h2>
          <p>Active stories, expired stories, and shared reels in one place.</p>
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
        <div className="stories-summary-card">
          <strong>{sharedReels.length}</strong>
          <span>Shared reels</span>
        </div>
      </div>

      <StorySection
        title="Active Stories"
        subtitle="Stories that are still live right now."
        emptyText="No active stories yet."
        items={activeStories}
        onOpen={setActiveStory}
      />

      <StorySection
        title="Shared Reels"
        subtitle="Reels you shared are saved here even after the story duration ends."
        emptyText="No shared reels yet."
        items={sharedReels}
        onOpen={setActiveStory}
      />

      <StorySection
        title="Past Stories"
        subtitle="Expired stories stay here as your story archive."
        emptyText="No past stories yet."
        items={pastStories}
        onOpen={setActiveStory}
      />

      {activeStory && (
        <div className="stories-viewer-backdrop" onClick={() => setActiveStory(null)}>
          <div className="stories-viewer" onClick={(event) => event.stopPropagation()}>
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
              </div>
              {(activeStory.storyText || activeStory.caption) && (
                <p className="stories-viewer-caption">
                  {activeStory.storyText || activeStory.caption}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
