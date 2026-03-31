import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import "./StoriesPage.css";

const STORY_STORAGE_KEY = "socialsea_stories_v1";

const readIdentity = () => {
  const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId") || "";
  const email = sessionStorage.getItem("email") || localStorage.getItem("email") || "";
  const username = sessionStorage.getItem("username") || localStorage.getItem("username") || "";
  const name = sessionStorage.getItem("name") || localStorage.getItem("name") || "";
  return {
    userId: String(userId || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    username: String(username || "").trim().toLowerCase(),
    name: String(name || "").trim().toLowerCase()
  };
};

const isStoryMine = (story, identity) => {
  if (!story || !identity) return false;
  if (story?.createdLocally === true) return true;
  const idCandidates = [
    story?.userId,
    story?.ownerId,
    story?.authorId,
    story?.profileId,
    story?.user?.id,
    story?.owner?.id
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (identity.userId && idCandidates.includes(identity.userId)) return true;

  const emailCandidates = [
    story?.email,
    story?.userEmail,
    story?.ownerEmail,
    story?.user?.email,
    story?.username
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
  if (identity.email && emailCandidates.includes(identity.email)) return true;

  const nameCandidates = [
    story?.username,
    story?.userName,
    story?.ownerName,
    story?.name,
    story?.user?.name
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
  if (identity.username && nameCandidates.includes(identity.username)) return true;
  if (identity.name && nameCandidates.includes(identity.name)) return true;
  return false;
};

const readLocalStories = () => {
  try {
    const raw = localStorage.getItem(STORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeStories = (list, identity) => {
  if (!Array.isArray(list)) return [];
  return list
    .filter(Boolean)
    .filter((story) => (identity ? isStoryMine(story, identity) : true))
    .map((story) => ({
      id: story?.id ?? story?.storyId ?? story?.postId ?? story?.mediaId ?? `${Date.now()}-${Math.random()}`,
      mediaUrl: story?.mediaUrl || story?.url || story?.fileUrl || "",
      caption: story?.caption || "",
      storyText: story?.storyText || "",
      privacy: story?.privacy || "public",
      createdAt: story?.createdAt || story?.created || "",
      expiresAt: story?.expiresAt || story?.expires || ""
    }));
};

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

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  if (Number.isNaN(ts)) return false;
  return ts <= Date.now();
};

export default function StoriesPage() {
  const navigate = useNavigate();
  const identityRef = useMemo(() => readIdentity(), []);
  const [stories, setStories] = useState(() => normalizeStories(readLocalStories(), identityRef));
  const [loading, setLoading] = useState(() => readLocalStories().length === 0);
  const [error, setError] = useState("");
  const [activeStory, setActiveStory] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/api/stories/mine", { timeout: 12000 });
        if (!mounted) return;
        const next = normalizeStories(res?.data || [], identityRef);
        setStories(next);
      } catch (err) {
        if (!mounted) return;
        const fallback = normalizeStories(readLocalStories(), identityRef);
        setStories(fallback);
        setError("Unable to load stories from server. Showing saved stories on this device.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const sortedStories = useMemo(() => {
    const list = Array.isArray(stories) ? stories.slice() : [];
    return list.sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
  }, [stories]);

  const openStory = (story) => {
    setActiveStory(story);
  };

  const closeStory = () => {
    setActiveStory(null);
  };

  return (
    <div className="stories-page">
      <header className="stories-header">
        <button type="button" className="stories-back" onClick={() => navigate(-1)}>
          Back
        </button>
        <div className="stories-title-wrap">
          <h2>My Stories</h2>
          <p>All your stories in one place.</p>
        </div>
        <button type="button" className="stories-create" onClick={() => navigate("/story/create")}>
          + Create
        </button>
      </header>

      {error && <p className="stories-error">{error}</p>}
      {loading && <p className="stories-loading">Loading stories...</p>}
      {!loading && sortedStories.length === 0 && <p className="stories-empty">No stories yet.</p>}

      <div className="stories-grid">
        {sortedStories.map((story) => {
          const mediaUrl = resolveMediaUrl(story.mediaUrl);
          const caption = String(story.storyText || story.caption || "Story").trim();
          const expired = isExpired(story.expiresAt);
          const video = isVideoUrl(mediaUrl);
          return (
            <button
              key={String(story.id)}
              type="button"
              className={`stories-card ${expired ? "is-expired" : ""}`}
              onClick={() => openStory({ ...story, mediaUrl })}
            >
              <div className="stories-thumb">
                {expired && <span className="stories-expired-badge">Expired</span>}
                {mediaUrl ? (
                  video ? (
                    <video src={mediaUrl} muted playsInline preload="metadata" />
                  ) : (
                    <img src={mediaUrl} alt={caption || "Story"} />
                  )
                ) : (
                  <div className="stories-thumb-empty">Story</div>
                )}
              </div>
              <div className="stories-meta">
                <p>{caption || "Story"}</p>
                <small>{formatDateTime(story.createdAt)}</small>
              </div>
            </button>
          );
        })}
      </div>

      {activeStory && (
        <div className="stories-viewer-backdrop" onClick={closeStory}>
          <div className="stories-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="stories-viewer-close" onClick={closeStory}>
              ×
            </button>
            <div className="stories-viewer-media">
              {isVideoUrl(activeStory.mediaUrl) ? (
                <video src={activeStory.mediaUrl} autoPlay playsInline controls />
              ) : (
                <img src={activeStory.mediaUrl} alt={activeStory.storyText || activeStory.caption || "Story"} />
              )}
            </div>
            {(activeStory.storyText || activeStory.caption) && (
              <p className="stories-viewer-caption">{activeStory.storyText || activeStory.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
