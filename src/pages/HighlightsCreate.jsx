import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toApiUrl } from "../api/baseUrl";
import "./HighlightsCreate.css";

const STORY_STORAGE_KEY = "socialsea_stories_v1";
const HIGHLIGHTS_STORAGE_KEY = "socialsea_highlights_v1";

const readStories = () => {
  try {
    const raw = localStorage.getItem(STORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((item) => {
      const expiresAt = new Date(item?.expiresAt || 0).getTime();
      return !expiresAt || expiresAt > now;
    });
  } catch {
    return [];
  }
};

const readHighlights = () => {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeHighlights = (next) => {
  localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(next));
};

const resolveMediaUrl = (raw) => {
  if (!raw) return "";
  return String(raw).startsWith("http") ? String(raw) : toApiUrl(String(raw));
};

const isVideoUrl = (url) =>
  /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/i.test(String(url || ""));

const getStoryId = (story, idx) =>
  String(story?.id ?? story?.mediaUrl ?? story?.url ?? story?.createdAt ?? idx ?? "");

export default function HighlightsCreate() {
  const navigate = useNavigate();
  const stories = useMemo(() => readStories(), []);
  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [coverId, setCoverId] = useState("");
  const [msg, setMsg] = useState("");

  const toggleStory = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setMsg("Add a title for your highlight.");
      return;
    }
    const selectedStories = stories.filter((story, idx) => selectedIds.has(getStoryId(story, idx)));
    if (!selectedStories.length) {
      setMsg("Pick at least one story.");
      return;
    }
    const coverStory =
      selectedStories.find((story, idx) => getStoryId(story, idx) === coverId) || selectedStories[0];
    const entry = {
      id: String(Date.now()),
      title: trimmed,
      items: selectedStories,
      coverUrl: coverStory?.mediaUrl || coverStory?.url || "",
      createdAt: new Date().toISOString()
    };
    const existing = readHighlights();
    const next = [entry, ...existing].slice(0, 50);
    writeHighlights(next);
    navigate("/profile/me");
  };

  return (
    <div className="highlights-create-page">
      <div className="highlights-shell">
        <header className="highlights-header">
          <button type="button" className="highlights-back" onClick={() => navigate(-1)}>
            Back
          </button>
          <div>
            <h2>Create Highlight</h2>
            <p>Pick stories to save on your profile.</p>
          </div>
          <button type="button" className="highlights-save" onClick={handleCreate}>
            Save
          </button>
        </header>

        <div className="highlights-form">
          <label className="highlights-field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Travels, Food, Friends"
            />
          </label>
          {msg && <p className="highlights-msg">{msg}</p>}
        </div>

        <section className="highlights-stories">
          <h3>Choose stories</h3>
          {stories.length === 0 && <p className="highlights-empty">No stories available.</p>}
          <div className="highlights-grid">
            {stories.map((story, idx) => {
              const id = getStoryId(story, idx);
              const isSelected = selectedIds.has(id);
              const mediaUrl = resolveMediaUrl(story?.mediaUrl || story?.url || "");
              const label = String(story?.storyText || story?.caption || "Story").trim();
              const isVideo = isVideoUrl(mediaUrl);
              const isCover = coverId && coverId === id;
              return (
                <button
                  key={`${id}-${idx}`}
                  type="button"
                  className={`highlights-story-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => toggleStory(id)}
                >
                  <div className="highlights-thumb">
                    {mediaUrl ? (
                      isVideo ? (
                        <video src={mediaUrl} muted playsInline preload="metadata" />
                      ) : (
                        <img src={mediaUrl} alt={label} />
                      )
                    ) : (
                      <span>{label.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="highlights-card-meta">
                    <small>{label.length > 18 ? `${label.slice(0, 16)}...` : label}</small>
                    <button
                      type="button"
                      className={`highlights-cover-btn ${isCover ? "is-active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setCoverId(id);
                        setSelectedIds((prev) => new Set(prev).add(id));
                      }}
                    >
                      {isCover ? "Cover" : "Set cover"}
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
