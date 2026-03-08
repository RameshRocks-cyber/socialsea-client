import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import "./LongVideos.css";

const LONG_VIDEO_SECONDS = 90;
const QUALITY_OPTIONS = ["auto", "1080", "720", "480", "360"];
const MIN_LONG_VIDEO_FALLBACK_SECONDS = 45;

export default function LongVideos() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const playerRef = useRef(null);
  const [allPosts, setAllPosts] = useState([]);
  const [videoDurationByPost, setVideoDurationByPost] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [likeCounts, setLikeCounts] = useState({});
  const [likedPostIds, setLikedPostIds] = useState({});
  const [dislikedPostIds, setDislikedPostIds] = useState({});
  const [dislikeCounts, setDislikeCounts] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentTextByPost, setCommentTextByPost] = useState({});
  const [savedPostIds, setSavedPostIds] = useState({});
  const [watchLaterPostIds, setWatchLaterPostIds] = useState({});
  const [showComments, setShowComments] = useState(true);

  const toList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.content)) return payload.content;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };
  const readIdMap = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return {};
      return ids.reduce((acc, id) => ({ ...acc, [Number(id)]: true }), {});
    } catch {
      return {};
    }
  };

  const readNumberMap = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const next = {};
      Object.keys(parsed).forEach((k) => {
        const n = Number(parsed[k]);
        if (Number.isFinite(n) && n >= 0) next[k] = n;
      });
      return next;
    } catch {
      return {};
    }
  };

  const persistIdMap = (key, map) => {
    const ids = Object.keys(map)
      .filter((id) => map[id])
      .map((id) => Number(id));
    localStorage.setItem(key, JSON.stringify(ids));
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
        const endpoints = ["/api/feed", "/api/reels", "/api/profile/me/posts", "/api/profile/posts"];
        const responses = await Promise.allSettled(endpoints.map((url) => api.get(url)));
        const posts = responses
          .filter((r) => r.status === "fulfilled")
          .flatMap((r) => toList(r.value?.data))
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

  useEffect(() => {
    const liked = readIdMap("likedPostIds");
    const disliked = readIdMap("dislikedPostIds");
    const normalizedLiked = { ...liked };
    Object.keys(disliked).forEach((id) => {
      if (disliked[id]) normalizedLiked[id] = false;
    });
    setLikedPostIds(normalizedLiked);
    setDislikedPostIds(disliked);
    setSavedPostIds(readIdMap("savedPostIds"));
    setWatchLaterPostIds(readIdMap("watchLaterPostIds"));
    setDislikeCounts(readNumberMap("dislikeCountsByPost"));
    persistIdMap("likedPostIds", normalizedLiked);
    persistIdMap("dislikedPostIds", disliked);
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
    // Keep unknown-duration videos visible; many CDNs/API shapes do not expose duration reliably.
    const filtered = videoPosts.filter((post) => {
      const duration = Number(videoDurationByPost[post.id]) || 0;
      return duration <= 0 || duration > LONG_VIDEO_SECONDS;
    });
    const strict = uniqueByPostKey(filtered);
    if (strict.length >= 5) return strict;

    // Fallback: relax threshold when strict long-video candidates are too few.
    return uniqueByPostKey(
      videoPosts.filter((post) => {
        const duration = Number(videoDurationByPost[post.id]) || 0;
        return duration <= 0 || duration > MIN_LONG_VIDEO_FALLBACK_SECONDS;
      })
    );
  }, [videoPosts, videoDurationByPost]);

  useEffect(() => {
    if (!longVideos.length) return;
    longVideos.forEach((post) => {
      api.get(`/api/likes/${post.id}/count`)
        .then((res) => {
          const count = Number(res?.data) || 0;
          setLikeCounts((prev) => ({ ...prev, [post.id]: count }));
        })
        .catch(() => {});
    });
  }, [longVideos]);

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

  useEffect(() => {
    if (!activeVideo?.id) return;
    api.get(`/api/comments/${activeVideo.id}`)
      .then((res) => {
        setCommentsByPost((prev) => ({
          ...prev,
          [activeVideo.id]: Array.isArray(res?.data) ? res.data : []
        }));
      })
      .catch(() => {});
  }, [activeVideo?.id]);

  const toggleLike = async (postId) => {
    if (!postId) return;
    const wasLiked = Boolean(likedPostIds[postId]);
    const wasDisliked = Boolean(dislikedPostIds[postId]);

    setDislikedPostIds((prev) => {
      if (!prev[postId]) return prev;
      const next = { ...prev, [postId]: false };
      persistIdMap("dislikedPostIds", next);
      return next;
    });
    if (wasDisliked) {
      setDislikeCounts((prev) => {
        const next = { ...prev, [postId]: Math.max(0, (Number(prev[postId]) || 0) - 1) };
        localStorage.setItem("dislikeCountsByPost", JSON.stringify(next));
        return next;
      });
    }

    if (wasLiked) {
      setLikedPostIds((prev) => {
        const next = { ...prev, [postId]: false };
        persistIdMap("likedPostIds", next);
        return next;
      });
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - 1) }));
      try {
        await api.delete(`/api/likes/${postId}`);
      } catch {
        // noop
      }
      return;
    }

    setLikedPostIds((prev) => {
      const next = { ...prev, [postId]: true };
      persistIdMap("likedPostIds", next);
      return next;
    });
    setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    try {
      await api.post(`/api/likes/${postId}`);
    } catch {
      // noop
    }
  };

  const toggleDislike = async (postId) => {
    if (!postId) return;
    const wasLiked = Boolean(likedPostIds[postId]);
    const wasDisliked = Boolean(dislikedPostIds[postId]);

    setLikedPostIds((prev) => {
      if (!prev[postId]) return prev;
      const next = { ...prev, [postId]: false };
      persistIdMap("likedPostIds", next);
      return next;
    });
    if (wasLiked) {
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - 1) }));
      try {
        await api.delete(`/api/likes/${postId}`);
      } catch {
        // noop
      }
    }

    setDislikedPostIds((prev) => {
      const nextValue = !wasDisliked;
      const next = { ...prev, [postId]: nextValue };
      persistIdMap("dislikedPostIds", next);
      return next;
    });
    setDislikeCounts((prev) => {
      const delta = wasDisliked ? -1 : 1;
      const next = { ...prev, [postId]: Math.max(0, (Number(prev[postId]) || 0) + delta) };
      localStorage.setItem("dislikeCountsByPost", JSON.stringify(next));
      return next;
    });
  };

  const submitComment = async (postId) => {
    const text = String(commentTextByPost[postId] || "").trim();
    if (!text) return;
    try {
      await api.post(`/api/comments/${postId}`, text, {
        headers: { "Content-Type": "text/plain" }
      });
      const res = await api.get(`/api/comments/${postId}`);
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: Array.isArray(res?.data) ? res.data : []
      }));
      setCommentTextByPost((prev) => ({ ...prev, [postId]: "" }));
    } catch {
      // noop
    }
  };

  const toggleSave = (postId) => {
    setSavedPostIds((prev) => {
      const next = { ...prev, [postId]: !prev[postId] };
      persistIdMap("savedPostIds", next);
      return next;
    });
  };

  const toggleWatchLater = (postId) => {
    setWatchLaterPostIds((prev) => {
      const next = { ...prev, [postId]: !prev[postId] };
      persistIdMap("watchLaterPostIds", next);
      return next;
    });
  };

  const normalizeDisplayName = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "User";
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

            <div className="watch-actions-row">
              {(() => {
                const isDisliked = !!dislikedPostIds[activeVideo.id];
                const isLiked = !!likedPostIds[activeVideo.id] && !isDisliked;
                return (
                  <>
              <button
                type="button"
                className={`watch-action-btn ${isLiked ? "is-active" : ""}`}
                onClick={() => toggleLike(activeVideo.id)}
              >
                {"\u{1F44D}"} Like {likeCounts[activeVideo.id] || 0}
              </button>
              <button
                type="button"
                className={`watch-action-btn ${isDisliked ? "is-active dislike" : ""}`}
                onClick={() => toggleDislike(activeVideo.id)}
              >
                {"\u{1F44E}"} Dislike {dislikeCounts[activeVideo.id] || 0}
              </button>
              <button
                type="button"
                className="watch-action-btn"
                onClick={() => setShowComments((v) => !v)}
              >
                {"\u{1F4AC}"} Comments {(commentsByPost[activeVideo.id] || []).length}
              </button>
              <button
                type="button"
                className={`watch-action-btn ${savedPostIds[activeVideo.id] ? "is-active" : ""}`}
                onClick={() => toggleSave(activeVideo.id)}
              >
                {"\u{1F516}"} {savedPostIds[activeVideo.id] ? "Saved" : "Save"}
              </button>
              <button
                type="button"
                className={`watch-action-btn ${watchLaterPostIds[activeVideo.id] ? "is-active" : ""}`}
                onClick={() => toggleWatchLater(activeVideo.id)}
              >
                {"\u23F2"} {watchLaterPostIds[activeVideo.id] ? "Added" : "Watch Later"}
              </button>
                  </>
                );
              })()}
            </div>

            {showComments && (
              <section className="watch-comments">
                <div className="watch-comment-input-row">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    value={commentTextByPost[activeVideo.id] || ""}
                    onChange={(e) =>
                      setCommentTextByPost((prev) => ({ ...prev, [activeVideo.id]: e.target.value }))
                    }
                  />
                  <button type="button" onClick={() => submitComment(activeVideo.id)}>Post</button>
                </div>

                {(commentsByPost[activeVideo.id] || []).map((comment) => (
                  <div className="watch-comment-item" key={comment.id}>
                    <strong>{normalizeDisplayName(comment.user?.name || comment.user?.email || "User")}:</strong>{" "}
                    {comment.text}
                  </div>
                ))}
                {(commentsByPost[activeVideo.id] || []).length === 0 && (
                  <p className="watch-empty">No comments yet.</p>
                )}
              </section>
            )}
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
