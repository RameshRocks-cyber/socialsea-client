import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import "./Reels.css";

const MAX_REEL_SECONDS = 90;

export default function Reels() {
  const [reels, setReels] = useState([]);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likeCounts, setLikeCounts] = useState({});
  const [likedPostIds, setLikedPostIds] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentTextByPost, setCommentTextByPost] = useState({});
  const [commentsOpenByPost, setCommentsOpenByPost] = useState({});
  const [savedPostIds, setSavedPostIds] = useState({});
  const [watchLaterPostIds, setWatchLaterPostIds] = useState({});
  const [shareMessageByPost, setShareMessageByPost] = useState({});
  const [tapLikeBurstByPost, setTapLikeBurstByPost] = useState({});
  const [followingByKey, setFollowingByKey] = useState({});

  const containerRef = useRef(null);
  const videoRefs = useRef({});
  const tapTrackerRef = useRef({ lastTapTs: 0, singleTapTimer: null });

  useEffect(() => {
    api.get("/api/reels")
      .then(async (res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        const filtered = await Promise.all(
          data.map(async (item) => {
            const mediaType = getMediaType(item);
            if (mediaType !== "VIDEO") return null;
            const rawUrl = item.contentUrl || item.mediaUrl || "";
            const mediaUrl = resolveUrl(String(rawUrl).trim());
            if (!mediaUrl) return null;
            const durationSeconds = await readVideoDuration(mediaUrl);
            if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
            if (durationSeconds > MAX_REEL_SECONDS) return null;
            return item;
          })
        );
        setReels(filtered.filter(Boolean));
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load reels");
      });
  }, []);

  useEffect(() => {
    if (!reels.length) return;
    reels.forEach((reel) => {
      api.get(`/api/likes/${reel.id}/count`)
        .then((res) => {
          const count = Number(res.data) || 0;
          setLikeCounts((prev) => ({ ...prev, [reel.id]: count }));
        })
        .catch(() => {});
    });
  }, [reels]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("savedReelIds");
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      const map = ids.reduce((acc, id) => ({ ...acc, [id]: true }), {});
      setSavedPostIds(map);
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("watchLaterPostIds");
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      const map = ids.reduce((acc, id) => ({ ...acc, [id]: true }), {});
      setWatchLaterPostIds(map);
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

  useEffect(() => {
    reels.forEach((reel, idx) => {
      const video = videoRefs.current[reel.id];
      if (!video) return;
      if (idx === currentIndex) video.play().catch(() => {});
      else video.pause();
    });
  }, [currentIndex, reels]);

  useEffect(() => {
    return () => {
      if (tapTrackerRef.current.singleTapTimer) clearTimeout(tapTrackerRef.current.singleTapTimer);
    };
  }, []);

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  const getMediaType = (item) => {
    const type = (item?.type || "").toUpperCase();
    if (type) return type;
    const url = String(item?.contentUrl || item?.mediaUrl || "").toLowerCase();
    if (url.match(/\.(mp4|mov|webm|mkv|m4v)(\?|$)/)) return "VIDEO";
    if (url.match(/\.(png|jpe?g|gif|webp)(\?|$)/)) return "IMAGE";
    return "VIDEO";
  };

  const readVideoDuration = (videoUrl) =>
    new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = videoUrl;
      video.onloadedmetadata = () => resolve(Number(video.duration) || 0);
      video.onerror = () => resolve(Number.POSITIVE_INFINITY);
    });

  const emailToName = (email) => {
    const raw = (email || "").split("@")[0] || "";
    const cleaned = raw.replace(/[._-]+/g, " ").trim();
    if (!cleaned) return "User";
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const reelOwnerKey = (reel) => String(reel?.user?.id || reel?.user?.email || reel?.username || reel?.id);
  const myUserId = Number(localStorage.getItem("userId"));

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== currentIndex) setCurrentIndex(Math.max(0, Math.min(reels.length - 1, idx)));
  };

  const likeReel = async (postId, fromDoubleTap = false) => {
    if (likedPostIds[postId]) return;
    try {
      const res = await api.post(`/api/likes/${postId}`);
      const message = String(res?.data || "").toLowerCase();
      if (message.includes("already")) {
        setLikedPostIds((prev) => ({ ...prev, [postId]: true }));
        return;
      }
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
      setLikedPostIds((prev) => ({ ...prev, [postId]: true }));
      if (fromDoubleTap) {
        setTapLikeBurstByPost((prev) => ({ ...prev, [postId]: true }));
        setTimeout(() => setTapLikeBurstByPost((prev) => ({ ...prev, [postId]: false })), 700);
      }
    } catch {
      // noop
    }
  };

  const loadComments = async (postId) => {
    try {
      const res = await api.get(`/api/comments/${postId}`);
      setCommentsByPost((prev) => ({ ...prev, [postId]: Array.isArray(res.data) ? res.data : [] }));
    } catch {
      // noop
    }
  };

  const toggleComments = async (postId) => {
    const nextOpen = !commentsOpenByPost[postId];
    setCommentsOpenByPost((prev) => ({ ...prev, [postId]: nextOpen }));
    if (nextOpen) await loadComments(postId);
  };

  const submitComment = async (postId) => {
    const text = (commentTextByPost[postId] || "").trim();
    if (!text) return;
    try {
      await api.post(`/api/comments/${postId}`, text, {
        headers: { "Content-Type": "text/plain" }
      });
      setCommentTextByPost((prev) => ({ ...prev, [postId]: "" }));
      await loadComments(postId);
    } catch {
      // noop
    }
  };

  const shareReel = async (reel) => {
    const shareUrl = `${window.location.origin}/reels?post=${reel.id}`;
    const shareText = `${reel.description || reel.content || "Check this reel"} ${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "SocialSea Reel", text: shareText, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareMessageByPost((prev) => ({ ...prev, [reel.id]: "Shared" }));
    } catch {
      setShareMessageByPost((prev) => ({ ...prev, [reel.id]: "Share cancelled" }));
    }
    setTimeout(() => setShareMessageByPost((prev) => ({ ...prev, [reel.id]: "" })), 1200);
  };

  const toggleSave = (postId) => {
    setSavedPostIds((prev) => {
      const next = { ...prev, [postId]: !prev[postId] };
      const savedIds = Object.keys(next).filter((id) => next[id]).map((id) => Number(id));
      localStorage.setItem("savedReelIds", JSON.stringify(savedIds));
      return next;
    });
  };

  const toggleWatchLater = (postId) => {
    setWatchLaterPostIds((prev) => {
      const next = { ...prev, [postId]: !prev[postId] };
      const ids = Object.keys(next).filter((id) => next[id]).map((id) => Number(id));
      localStorage.setItem("watchLaterPostIds", JSON.stringify(ids));
      return next;
    });
  };

  const followOwner = async (reel) => {
    const followTarget = reel?.user?.email || reel?.username;
    if (!followTarget) return;
    const key = reelOwnerKey(reel);
    try {
      const res = await api.post(`/api/follow/${encodeURIComponent(followTarget)}`);
      const msg = String(res?.data || "").toLowerCase();
      if (res.status >= 200 && res.status < 300 && !msg.includes("cannot follow")) {
        setFollowingByKey((prev) => ({ ...prev, [key]: true }));
      }
    } catch {
      // noop
    }
  };

  const togglePlayPause = (postId) => {
    const video = videoRefs.current[postId];
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const handleReelTap = (reel) => {
    const now = Date.now();
    const delta = now - tapTrackerRef.current.lastTapTs;
    if (tapTrackerRef.current.singleTapTimer) {
      clearTimeout(tapTrackerRef.current.singleTapTimer);
      tapTrackerRef.current.singleTapTimer = null;
    }
    if (delta > 0 && delta < 280) {
      likeReel(reel.id, true);
      tapTrackerRef.current.lastTapTs = 0;
      return;
    }
    tapTrackerRef.current.lastTapTs = now;
    tapTrackerRef.current.singleTapTimer = setTimeout(() => {
      togglePlayPause(reel.id);
      tapTrackerRef.current.singleTapTimer = null;
    }, 280);
  };

  return (
    <div className="reels-page">
      <div className="reels-container" ref={containerRef} onScroll={onScroll}>
        {error && <p className="reel-state">{error}</p>}
        {!error && reels.length === 0 && (
          <p className="reel-state">No reels yet (only videos up to 90 seconds are shown).</p>
        )}

        {reels.map((reel, idx) => {
          const rawUrl = reel.contentUrl || reel.mediaUrl || "";
          const videoUrl = resolveUrl(rawUrl.trim());
          if (!videoUrl) return null;

          const comments = commentsByPost[reel.id] || [];
          const ownerNameRaw = reel?.user?.name || reel?.user?.email || reel?.username || "User";
          const ownerName = ownerNameRaw.includes("@") ? emailToName(ownerNameRaw) : ownerNameRaw;
          const ownerKey = reelOwnerKey(reel);
          const isOwnReel = Number(reel?.user?.id) === myUserId;
          const isFollowing = !!followingByKey[ownerKey];
          const caption = reel?.description || reel?.content || "Watch this reel";

          return (
            <section className="reel-item" key={reel.id} data-reel-idx={idx}>
              <video
                ref={(el) => {
                  if (el) videoRefs.current[reel.id] = el;
                }}
                src={videoUrl}
                loop
                muted
                playsInline
                controls={false}
                className="reel-video"
                onClick={() => handleReelTap(reel)}
              />

              {tapLikeBurstByPost[reel.id] && <div className="reel-like-burst">{"\u2665"}</div>}

              <aside className="reel-actions">
                <button
                  type="button"
                  className={`reel-action-btn ${likedPostIds[reel.id] ? "is-active" : ""}`}
                  onClick={() => likeReel(reel.id)}
                  title="Like"
                >
                  <span>{"\u2665"}</span>
                  <small>{likeCounts[reel.id] || 0}</small>
                </button>
                <button
                  type="button"
                  className="reel-action-btn"
                  onClick={() => toggleComments(reel.id)}
                  title="Comment"
                >
                  <span>{"\u{1F5E8}"}</span>
                  <small>{comments.length}</small>
                </button>
                <button type="button" className="reel-action-btn" onClick={() => shareReel(reel)} title="Share">
                  <span>{"\u2934"}</span>
                </button>
                <button
                  type="button"
                  className="reel-action-btn reel-save-btn"
                  onClick={() => toggleSave(reel.id)}
                  title="Save"
                >
                  <span>{"\u{1F516}"}</span>
                </button>
                <button
                  type="button"
                  className={`reel-action-btn ${watchLaterPostIds[reel.id] ? "is-active" : ""}`}
                  onClick={() => toggleWatchLater(reel.id)}
                  title="Watch Later"
                >
                  <span>{"\u23F2"}</span>
                </button>
              </aside>

              <div className="reel-bottom-meta">
                <div className="reel-owner-row">
                  <span className="reel-owner">@{ownerName.replace(/\s+/g, "").toLowerCase()}</span>
                  {!isOwnReel && (
                    <button
                      type="button"
                      className="reel-follow-btn"
                      onClick={() => followOwner(reel)}
                      disabled={isFollowing}
                    >
                      {isFollowing ? "Following" : "Follow"}
                    </button>
                  )}
                </div>
                <p className="reel-caption">{caption}</p>
              </div>

              {shareMessageByPost[reel.id] && <p className="reel-share-status">{shareMessageByPost[reel.id]}</p>}

              {commentsOpenByPost[reel.id] && (
                <div className="reel-comments">
                  <div className="reel-comment-input-row">
                    <input
                      type="text"
                      placeholder="Write a comment..."
                      value={commentTextByPost[reel.id] || ""}
                      onChange={(e) =>
                        setCommentTextByPost((prev) => ({ ...prev, [reel.id]: e.target.value }))
                      }
                    />
                    <button type="button" onClick={() => submitComment(reel.id)}>Post</button>
                  </div>
                  {comments.map((comment) => (
                    <div className="reel-comment-item" key={comment.id}>
                      <strong>{comment.user?.name || comment.user?.email || "User"}:</strong> {comment.text}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
