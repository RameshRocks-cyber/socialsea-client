import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import "./LongVideos.css";

const LONG_VIDEO_SECONDS = 90;
const QUALITY_OPTIONS = ["auto", "1080", "720", "480", "360"];

export default function LongVideos() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const playerRef = useRef(null);
  const [allPosts, setAllPosts] = useState([]);
  const [videoDurationByPost, setVideoDurationByPost] = useState({});
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  useEffect(() => {
    api
      .get("/api/feed")
      .then((res) => setAllPosts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAllPosts([]));
  }, []);

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  const mediaTypeFor = (post) => {
    const t = (post?.type || "").toUpperCase();
    if (t) return t;
    return post?.reel ? "VIDEO" : "IMAGE";
  };

  const usernameFor = (post) => {
    const raw = post?.user?.name || post?.username || post?.user?.email || "User";
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

  const captionFor = (post) => post?.description || post?.content || "Untitled video";

  const longVideos = useMemo(() => {
    return allPosts.filter((post) => {
      const isVideo = mediaTypeFor(post) === "VIDEO";
      return isVideo && (videoDurationByPost[post.id] || 0) > LONG_VIDEO_SECONDS;
    });
  }, [allPosts, videoDurationByPost]);

  const activeVideo =
    longVideos.find((p) => String(p.id) === String(postId)) || longVideos[0] || null;

  const withCloudinaryQuality = (url, quality) => {
    if (!url || quality === "auto") return url;
    if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
    const map = {
      auto: "q_auto,f_auto",
      "1080": "q_auto:best,w_1920",
      "720": "q_auto:good,w_1280",
      "480": "q_auto:eco,w_854",
      "360": "q_auto:low,w_640"
    };
    const transform = map[quality] || map.auto;
    return url.replace("/upload/", `/upload/${transform}/`);
  };

  const activeVideoUrl = useMemo(() => {
    const raw = activeVideo?.contentUrl || activeVideo?.mediaUrl || "";
    const url = resolveUrl(String(raw).trim());
    return withCloudinaryQuality(url, selectedQuality);
  }, [activeVideo, selectedQuality]);

  return (
    <div className="watch-page">
      <section className="watch-main">
        {!activeVideo && <p className="watch-empty">Loading long videos...</p>}

        {activeVideo && (
          <>
            <div className="watch-player-wrap">
              <video
                key={`${activeVideo.id}-${selectedQuality}`}
                ref={playerRef}
                src={activeVideoUrl}
                controls
                autoPlay
                className="watch-player"
              />
              <button
                type="button"
                className="watch-quality-btn"
                onClick={() => setShowQualityMenu((s) => !s)}
              >
                Quality: {selectedQuality === "auto" ? "Auto" : `${selectedQuality}p`}
              </button>
              {showQualityMenu && (
                <div className="watch-quality-menu">
                  {QUALITY_OPTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={selectedQuality === q ? "is-active" : ""}
                      onClick={() => {
                        setSelectedQuality(q);
                        setShowQualityMenu(false);
                      }}
                    >
                      {q === "auto" ? "Auto" : `${q}p`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <h1 className="watch-title">{captionFor(activeVideo)}</h1>
            <p className="watch-owner">{usernameFor(activeVideo)}</p>
          </>
        )}
      </section>

      <aside className="watch-side">
        <h3>Long Videos</h3>
        <div className="watch-list">
          {longVideos.map((v) => {
            const raw = v.contentUrl || v.mediaUrl || "";
            const url = resolveUrl(String(raw).trim());
            const isActive = String(v.id) === String(activeVideo?.id);
            return (
              <button
                key={v.id}
                type="button"
                className={`watch-item ${isActive ? "is-active" : ""}`}
                onClick={() => navigate(`/watch/${v.id}`)}
              >
                <video src={url} muted playsInline preload="metadata" className="watch-item-thumb" />
                <div className="watch-item-text">
                  <p>{captionFor(v)}</p>
                  <small>{usernameFor(v)}</small>
                </div>
              </button>
            );
          })}
          {!longVideos.length && <p className="watch-empty">No long videos found.</p>}
        </div>
      </aside>
    </div>
  );
}
