import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiCamera } from "react-icons/fi";
import api from "../api/axios";
import "./StoryCreate.css";

const STORY_STORAGE_KEY = "socialsea_stories_v1";
const MAX_STORY_FILE_SIZE_BYTES = 80 * 1024 * 1024;

const TEXT_STYLES = [
  { key: "glow", label: "Glow", color: "#f7fbff", shadow: "0 0 18px rgba(255,255,255,0.45)" },
  { key: "sunset", label: "Sunset", color: "#ffb076", shadow: "0 0 18px rgba(255,122,65,0.45)" },
  { key: "mint", label: "Mint", color: "#7ef2d0", shadow: "0 0 18px rgba(126,242,208,0.4)" },
  { key: "violet", label: "Violet", color: "#c6a0ff", shadow: "0 0 18px rgba(198,160,255,0.4)" }
];

const PRIVACY_OPTIONS = [
  { key: "public", label: "Public story" },
  { key: "followers", label: "Followers only" },
  { key: "close_friends", label: "Close friends" }
];

const EXPIRY_OPTIONS = [
  { hours: 6, label: "6 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "24 hours" }
];

function parseUploadError(err) {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
    try {
      return JSON.stringify(data);
    } catch {
      return "Story upload failed";
    }
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return "Story upload failed";
}

export default function StoryCreate() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [storyText, setStoryText] = useState("");
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [expiryHours, setExpiryHours] = useState(24);
  const [styleKey, setStyleKey] = useState(TEXT_STYLES[0].key);
  const [textColor, setTextColor] = useState(TEXT_STYLES[0].color);
  const [textSize, setTextSize] = useState(28);
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textBg, setTextBg] = useState(false);
  const [textAlign, setTextAlign] = useState("center");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewMuted(true);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isVideo = useMemo(() => !!file?.type?.startsWith("video/"), [file]);
  const activeStyle = useMemo(
    () => TEXT_STYLES.find((item) => item.key === styleKey) || TEXT_STYLES[0],
    [styleKey]
  );

  const toggleExclusiveTextStyle = (style) => {
    const isActive =
      (style === "bold" && textBold) ||
      (style === "italic" && textItalic) ||
      (style === "underline" && textUnderline) ||
      (style === "background" && textBg);
    setTextBold(style === "bold" ? !isActive : false);
    setTextItalic(style === "italic" ? !isActive : false);
    setTextUnderline(style === "underline" ? !isActive : false);
    setTextBg(style === "background" ? !isActive : false);
  };

  const addStoryToLocalCache = (entry) => {
    try {
      const raw = localStorage.getItem(STORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(parsed) ? parsed.slice() : [];
      next.unshift(entry);
      localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
    } catch {
      // ignore caching errors
    }
  };

  const publishStory = async () => {
    setMsg("");
    if (!file) {
      setMsg("Choose a photo or video for your story.");
      return;
    }
    if (Number(file?.size || 0) > MAX_STORY_FILE_SIZE_BYTES) {
      setMsg("File is too large (max 80MB).");
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("isStory", "true");
      form.append("storyPrivacy", privacy);
      form.append("storyExpiresHours", String(expiryHours));
      if (caption.trim()) form.append("caption", caption.trim());
      if (storyText.trim()) form.append("storyText", storyText.trim());
      form.append("storyStyle", styleKey);
      form.append(
        "storyTextStyle",
        JSON.stringify({
          bold: textBold,
          italic: textItalic,
          underline: textUnderline,
          background: textBg,
          align: textAlign,
          size: textSize,
          color: textColor || activeStyle.color
        })
      );

      const res = await api.post("/api/posts/upload", form, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const mediaUrl =
        res?.data?.mediaUrl ||
        res?.data?.url ||
        res?.data?.fileUrl ||
        res?.data?.storyUrl ||
        "";
      if (mediaUrl) {
        addStoryToLocalCache({
          id: res?.data?.id || res?.data?.postId || Date.now(),
          mediaUrl,
          mediaType: file?.type || (isVideo ? "video" : "image"),
          type: isVideo ? "VIDEO" : "IMAGE",
          isVideo: !!isVideo,
          storyText: storyText.trim(),
          caption: caption.trim(),
          privacy,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()
        });
      }

      setMsg(`Story published. It will expire in ${expiryHours} hours.`);
      setTimeout(() => {
        navigate("/profile/me");
      }, 900);
    } catch (err) {
      setMsg(parseUploadError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="story-create-page">
      <div className="story-shell">
        <header className="story-create-header">
          <button
            className="story-back"
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            title="Back"
          >
            ←
          </button>
          <div className="story-title-wrap">
            <p className="story-title">Create Story</p>
            <p className="story-subtitle">
              Share a moment that disappears after {expiryHours} hours.
            </p>
          </div>
          <button
            className="story-publish"
            type="button"
            onClick={publishStory}
            disabled={loading || !file}
          >
            {loading ? "Publishing..." : "Publish"}
          </button>
        </header>

        <section className="story-create-body">
          {previewUrl && (
            <div className="story-preview-panel">
              <div className="story-preview-frame">
                {!isVideo && <img src={previewUrl} alt="Story preview" className="story-preview-media" />}
                {isVideo && (
                  <>
                    <video
                      ref={videoRef}
                      src={previewUrl}
                      className="story-preview-media"
                      autoPlay
                      muted={previewMuted}
                      loop
                      playsInline
                      controls={!previewMuted}
                    />
                    <button
                      type="button"
                      className="story-audio-toggle"
                      onClick={() => {
                        setPreviewMuted((prev) => {
                          const next = !prev;
                          if (!next) {
                            setTimeout(() => {
                              videoRef.current?.play?.().catch(() => {});
                            }, 0);
                          }
                          return next;
                        });
                      }}
                    >
                      {previewMuted ? "Enable sound" : "Mute"}
                    </button>
                  </>
                )}
                {storyText.trim() && (
                  <div
                    className="story-text-overlay"
                    style={{
                      color: textColor || activeStyle.color,
                      textShadow: activeStyle.shadow,
                      fontSize: `${textSize}px`,
                      fontWeight: textBold ? 700 : 500,
                      fontStyle: textItalic ? "italic" : "normal",
                      textDecoration: textUnderline ? "underline" : "none",
                      textAlign,
                      background: textBg ? "rgba(0, 0, 0, 0.45)" : "transparent",
                      padding: textBg ? "6px 10px" : "0",
                      borderRadius: textBg ? "10px" : "0",
                      boxDecorationBreak: "clone",
                      WebkitBoxDecorationBreak: "clone"
                    }}
                  >
                    {storyText}
                  </div>
                )}
                <div className="story-progress-bar">
                  <span />
                </div>
              </div>

              <div className="story-preview-footer">
                <span>Story duration</span>
                <strong>{isVideo ? "Up to 60s" : "5s default"} • Expires in {expiryHours}h</strong>
              </div>
            </div>
          )}

          <div className="story-controls">
          <div className="story-card">
            <h3>Media</h3>
            <div className="story-media-row">
              <label className="story-upload-btn">
                Choose photo/video
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0] || null;
                    setFile(nextFile);
                    setMsg("");
                    if (e.target) e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="story-camera-pick"
                onClick={() => window.__ssOpenCameraStudio?.({ forceOpen: true })}
                title="Open Camera"
                aria-label="Open Camera"
              >
                <FiCamera />
              </button>
            </div>
            <p className="story-note">Vertical photos/videos work best.</p>
          </div>

          <div className="story-card">
            <h3>Story text</h3>
            <textarea
              rows={3}
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder="Add text overlay"
            />
            <div className="story-style-row">
              {TEXT_STYLES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={styleKey === item.key ? "active" : ""}
                  style={{ color: item.color }}
                  onClick={() => {
                    setStyleKey(item.key);
                    setTextColor(item.color);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="story-text-controls">
              <label className="story-text-control">
                <span>Color</span>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                />
              </label>
              <label className="story-text-control">
                <span>Size</span>
                <input
                  type="range"
                  min="14"
                  max="64"
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                />
                <strong>{textSize}px</strong>
              </label>
            </div>
            <div className="story-text-style-row">
              <button
                type="button"
                className={`story-text-style-btn ${textBold ? "active" : ""}`}
                onClick={() => toggleExclusiveTextStyle("bold")}
              >
                Bold
              </button>
              <button
                type="button"
                className={`story-text-style-btn ${textItalic ? "active" : ""}`}
                onClick={() => toggleExclusiveTextStyle("italic")}
              >
                Italic
              </button>
              <button
                type="button"
                className={`story-text-style-btn ${textUnderline ? "active" : ""}`}
                onClick={() => toggleExclusiveTextStyle("underline")}
              >
                Underline
              </button>
              <button
                type="button"
                className={`story-text-style-btn ${textBg ? "active" : ""}`}
                onClick={() => toggleExclusiveTextStyle("background")}
              >
                Background
              </button>
            </div>
            <div className="story-text-style-row">
              <button
                type="button"
                className={`story-text-style-btn ${textAlign === "left" ? "active" : ""}`}
                onClick={() => setTextAlign("left")}
              >
                Left
              </button>
              <button
                type="button"
                className={`story-text-style-btn ${textAlign === "center" ? "active" : ""}`}
                onClick={() => setTextAlign("center")}
              >
                Center
              </button>
              <button
                type="button"
                className={`story-text-style-btn ${textAlign === "right" ? "active" : ""}`}
                onClick={() => setTextAlign("right")}
              >
                Right
              </button>
            </div>
          </div>

          <div className="story-card">
            <h3>Caption</h3>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption for your story"
            />
          </div>

          <div className="story-card">
            <h3>Privacy</h3>
            <div className="story-privacy-row">
              {PRIVACY_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={privacy === option.key ? "active" : ""}
                  onClick={() => setPrivacy(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="story-card">
            <h3>Expiry</h3>
            <div className="story-privacy-row">
              {EXPIRY_OPTIONS.map((option) => (
                <button
                  key={option.hours}
                  type="button"
                  className={expiryHours === option.hours ? "active" : ""}
                  onClick={() => setExpiryHours(option.hours)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="story-note">Your story will auto-delete after the selected time.</p>
          </div>

          <div className="story-card story-card-mini">
            <h3>Quick stickers</h3>
            <div className="story-chip-row">
              <span>#Music</span>
              <span>@Mention</span>
              <span>Location</span>
              <span>Poll</span>
            </div>
            <p className="story-note">Sticker tools are coming soon.</p>
          </div>

            {msg && <p className="story-msg">{msg}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
