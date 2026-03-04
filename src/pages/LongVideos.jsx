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
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  const mediaUrlFor = (post) => String(post?.contentUrl || post?.mediaUrl || "").trim();

  const parseDurationLikeValue = (raw) => {
    if (raw == null) return 0;

    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw <= 0) return 0;
      // Some APIs send milliseconds.
      return raw > 10000 ? raw / 1000 : raw;
    }

    const str = String(raw).trim();
    if (!str) return 0;

    const asNum = Number(str);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum > 10000 ? asNum / 1000 : asNum;
    }

    // Handle "HH:MM:SS" or "MM:SS"
    if (str.includes(":")) {
      const parts = str.split(":").map((x) => Number(x));
      if (parts.every((n) => Number.isFinite(n) && n >= 0)) {
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
      }
    }

    return 0;
  };

  const durationFromPost = (post) => {
    const candidates = [
      post?.durationSeconds,
      post?.videoDurationSeconds,
      post?.duration,
      post?.videoDuration,
      post?.length,
      post?.videoLength,
      post?.durationMs,
      post?.videoDurationMs
    ];
    for (const raw of candidates) {
      const n = parseDurationLikeValue(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };

  const readVideoDurationOnce = (videoUrl, timeoutMs = 8000) =>
    new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = videoUrl;
      const done = (value) => {
        resolve(value);
      };
      const timer = setTimeout(() => done(0), timeoutMs);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        done(Number(video.duration) || 0);
      };
      video.onerror = () => {
        clearTimeout(timer);
        done(0);
      };
    });

  const readVideoDuration = async (videoUrl) => {
    const first = await readVideoDurationOnce(videoUrl);
    if (first > 0) return first;
    // Retry once with a cache-buster because some CDNs fail metadata occasionally.
    const separator = videoUrl.includes("?") ? "&" : "?";
    return readVideoDurationOnce(`${videoUrl}${separator}metaRetry=1`);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const endpoints = ["/api/feed", "/api/profile/me/posts", "/api/profile/posts"];
        const responses = await Promise.allSettled(endpoints.map((url) => api.get(url)));
        const posts = responses
          .filter((r) => r.status === "fulfilled" && Array.isArray(r.value?.data))
          .flatMap((r) => r.value.data)
          .filter(Boolean);
        if (cancelled) return;
        setAllPosts(uniqueByPostKey(posts));

        const candidates = uniqueByPostKey(posts.filter((post) => !!mediaUrlFor(post)));
        const durations = {};

        const unresolved = [];
        candidates.forEach((post) => {
          const known = durationFromPost(post);
          if (known > 0) {
            durations[post.id] = known;
          } else {
            unresolved.push(post);
          }
        });

        const BATCH_SIZE = 4;
        for (let i = 0; i < unresolved.length; i += BATCH_SIZE) {
          const batch = unresolved.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (post) => {
              const mediaUrl = resolveUrl(mediaUrlFor(post));
              if (!mediaUrl) return;
              const d = await readVideoDuration(mediaUrl);
              if (d > 0) durations[post.id] = d;
            })
          );
          if (cancelled) return;
        }

        if (!cancelled) setVideoDurationByPost(durations);
      } catch {
        if (!cancelled) {
          setAllPosts([]);
          setVideoDurationByPost({});
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const uniqueByPostKey = (posts) => {
    const seen = new Set();
    return posts.filter((post) => {
      const key = String(post?.id ?? post?.contentUrl ?? post?.mediaUrl ?? "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const videoPosts = useMemo(() => {
    return uniqueByPostKey(allPosts.filter((post) => !!mediaUrlFor(post)));
  }, [allPosts]);

  const longVideos = useMemo(() => {
    const filtered = videoPosts.filter((post) => (videoDurationByPost[post.id] || 0) > LONG_VIDEO_SECONDS);
    return uniqueByPostKey(filtered);
  }, [videoPosts, videoDurationByPost]);

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

  const selectVideo = (id) => {
    if (!id) return;
    navigate(`/watch/${id}`);
  };

  return (
    <div className="watch-page">
      <section className="watch-main">
        {isLoading && <p className="watch-empty">Loading long videos...</p>}
        {!isLoading && !activeVideo && <p className="watch-empty">No long videos found.</p>}

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
              <article
                key={v.id}
                className={`watch-item ${isActive ? "is-active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => selectVideo(v.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectVideo(v.id);
                  }
                }}
                aria-label={`Select video ${captionFor(v)}`}
              >
                <video
                  src={url}
                  muted
                  playsInline
                  preload="metadata"
                  className="watch-item-thumb"
                  onPlay={(event) => {
                    event.currentTarget.pause();
                    event.currentTarget.currentTime = 0;
                  }}
                />
                <div className="watch-item-text">
                  <p>{captionFor(v)}</p>
                  <small>{usernameFor(v)}</small>
                  <span className={`watch-item-cta ${isActive ? "is-active" : ""}`}>
                    {isActive ? "Now Playing" : "Select"}
                  </span>
                </div>
              </article>
            );
          })}
          {!longVideos.length && <p className="watch-empty">No long videos found.</p>}
        </div>
      </aside>
    </div>
  );
}
