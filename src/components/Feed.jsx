import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import "./Feed.css";

const LONG_VIDEO_SECONDS = 90;

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [likeCounts, setLikeCounts] = useState({});
  const [likedPostIds, setLikedPostIds] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentTextByPost, setCommentTextByPost] = useState({});
  const [savedPostIds, setSavedPostIds] = useState({});
  const [watchLaterPostIds, setWatchLaterPostIds] = useState({});
  const [shareMessageByPost, setShareMessageByPost] = useState({});
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activePostId, setActivePostId] = useState(null);
  const [videoDurationByPost, setVideoDurationByPost] = useState({});

  useEffect(() => {
    api.get("/api/feed")
      .then((res) => setPosts(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error(err);
        const status = err?.response?.status;
        const message = err?.response?.data?.message || err?.response?.data || "";
        setError(status ? `Failed to load feed (${status}) ${message}` : "Failed to load feed");
      });
  }, []);

  useEffect(() => {
    if (!posts.length) return;
    posts.forEach((post) => {
      api.get(`/api/likes/${post.id}/count`)
        .then((res) => {
          const count = Number(res.data) || 0;
          setLikeCounts((prev) => ({ ...prev, [post.id]: count }));
        })
        .catch(() => {});
    });
  }, [posts]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("savedPostIds");
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

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  const normalizeDisplayName = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "User";
    const local = raw.includes("@") ? raw.split("@")[0] : raw;
    const withoutDigits = local.replace(/\d+$/g, "");
    const cleaned = withoutDigits.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "User";
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const usernameFor = (post) => {
    const raw = post?.user?.name || post?.username || post?.user?.email || "User";
    return normalizeDisplayName(raw);
  };

  const mediaTypeFor = (post) => {
    const t = (post?.type || "").toUpperCase();
    if (t) return t;
    return post?.reel ? "VIDEO" : "IMAGE";
  };

  const captionFor = (post) => post?.description || post?.content || "Untitled video";

  const formatDuration = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  };

  const loadComments = async (postId) => {
    try {
      const res = await api.get(`/api/comments/${postId}`);
      setCommentsByPost((prev) => ({ ...prev, [postId]: Array.isArray(res.data) ? res.data : [] }));
    } catch {
      // noop
    }
  };

  const likePost = async (postId) => {
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
    } catch {
      // noop
    }
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

  const sharePost = async (post) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?post=${post.id}`;
    const shareText = `${post.description || post.content || "Check this post"} ${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "SocialSea Post", text: shareText, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareMessageByPost((prev) => ({ ...prev, [post.id]: "Shared" }));
    } catch {
      setShareMessageByPost((prev) => ({ ...prev, [post.id]: "Share cancelled" }));
    }
    setTimeout(() => {
      setShareMessageByPost((prev) => ({ ...prev, [post.id]: "" }));
    }, 1200);
  };

  const toggleSave = (postId) => {
    setSavedPostIds((prev) => {
      const next = { ...prev, [postId]: !prev[postId] };
      const savedIds = Object.keys(next).filter((id) => next[id]).map((id) => Number(id));
      localStorage.setItem("savedPostIds", JSON.stringify(savedIds));
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

  const filteredPosts = useMemo(() => {
    if (!query.trim()) return posts;
    const q = query.toLowerCase();
    return posts.filter((post) => {
      const user = usernameFor(post).toLowerCase();
      const text = `${post.description || ""} ${post.content || ""}`.toLowerCase();
      return user.includes(q) || text.includes(q);
    });
  }, [posts, query]);

  const longVideoPosts = useMemo(() => {
    return filteredPosts.filter((post) => {
      const isVideo = mediaTypeFor(post) === "VIDEO";
      return isVideo && (videoDurationByPost[post.id] || 0) > LONG_VIDEO_SECONDS;
    });
  }, [filteredPosts, videoDurationByPost]);

  const gridPosts = useMemo(() => {
    return filteredPosts.filter((post) => !longVideoPosts.some((lv) => lv.id === post.id));
  }, [filteredPosts, longVideoPosts]);

  const openPost = async (postId) => {
    setActivePostId(postId);
    await loadComments(postId);
  };

  const activePost = posts.find((p) => p.id === activePostId) || null;

  return (
    <div className="feed-page">
      <div className="explore-search-wrap">
        <span className="explore-search-icon">{"\u2315"}</span>
        <input
          type="text"
          placeholder="Search people or captions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="explore-search-input"
        />
      </div>

      {error && <p>{error}</p>}
      {!error && filteredPosts.length === 0 && <p className="feed-empty">No posts found</p>}

      {!!longVideoPosts.length && (
        <section className="long-video-feed">
          {longVideoPosts.map((post) => {
            const rawUrl = post.contentUrl || post.mediaUrl || "";
            const mediaUrl = rawUrl.trim() ? resolveUrl(rawUrl.trim()) : "";
            if (!mediaUrl) return null;
            const user = usernameFor(post);
            const duration = videoDurationByPost[post.id] || 0;
            return (
              <button
                key={`long-${post.id}`}
                type="button"
                className="long-feed-card"
                onClick={() => openPost(post.id)}
                title={user}
              >
                <div className="long-feed-thumb-wrap">
                  <video
                    src={mediaUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="long-feed-thumb"
                    onLoadedMetadata={(e) => {
                      const next = Number(e.currentTarget.duration) || 0;
                      setVideoDurationByPost((prev) => (prev[post.id] === next ? prev : { ...prev, [post.id]: next }));
                    }}
                  />
                  <span className="long-feed-duration">{formatDuration(duration)}</span>
                </div>
                <div className="long-feed-meta">
                  <span className="long-feed-avatar">{user.charAt(0).toUpperCase()}</span>
                  <div className="long-feed-text">
                    <p className="long-feed-title">{captionFor(post)}</p>
                    <p className="long-feed-sub">{user} • {(likeCounts[post.id] || 0).toLocaleString()} likes</p>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      )}

      <section className="explore-grid">
        {gridPosts.map((post, idx) => {
          const rawUrl = post.contentUrl || post.mediaUrl || "";
          const mediaUrl = rawUrl.trim() ? resolveUrl(rawUrl.trim()) : "";
          const type = mediaTypeFor(post);
          const isLongVideo =
            type === "VIDEO" && (videoDurationByPost[post.id] || 0) > LONG_VIDEO_SECONDS;
          if (!mediaUrl) return null;

          return (
            <button
              key={post.id}
              type="button"
              className={`explore-tile ${idx % 7 === 0 && !isLongVideo ? "tall" : ""} ${
                isLongVideo ? "long-video-tile" : ""
              }`}
              onClick={() => openPost(post.id)}
              title={usernameFor(post)}
            >
              {type === "VIDEO" ? (
                <video
                  src={mediaUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="explore-media"
                  onLoadedMetadata={(e) => {
                    const duration = Number(e.currentTarget.duration) || 0;
                    setVideoDurationByPost((prev) => {
                      if ((prev[post.id] || 0) === duration) return prev;
                      return { ...prev, [post.id]: duration };
                    });
                  }}
                />
              ) : (
                <img src={mediaUrl} alt="post" className="explore-media" />
              )}
              <div className="explore-overlay">
                {isLongVideo && <span className="long-video-badge">Long Video</span>}
                <span>{"\u25B7"} {(likeCounts[post.id] || 0).toLocaleString()}</span>
              </div>
            </button>
          );
        })}
      </section>

      {activePost && (
        <div className="post-view-backdrop" onClick={() => setActivePostId(null)}>
          <article className="post-view-card" onClick={(e) => e.stopPropagation()}>
            <header className="feed-post-head">
              <div className="feed-avatar">{usernameFor(activePost).charAt(0).toUpperCase()}</div>
              <p className="feed-username">{usernameFor(activePost)}</p>
            </header>

            {(() => {
              const raw = activePost.contentUrl || activePost.mediaUrl || "";
              const mediaUrl = raw.trim() ? resolveUrl(raw.trim()) : "";
              const type = activePost.type || (activePost.reel ? "VIDEO" : "IMAGE");
              if (!mediaUrl) return null;
              if (type === "VIDEO") return <video src={mediaUrl} controls className="feed-media-view" />;
              return <img src={mediaUrl} alt="post" className="feed-media-view" />;
            })()}

            <div className="feed-actions">
              <div className="feed-actions-left">
                <button
                  type="button"
                  className={likedPostIds[activePost.id] ? "is-active" : ""}
                  onClick={() => likePost(activePost.id)}
                  title="Like"
                >
                  <span className="action-icon">{"\u2665"}</span>
                  <span className="action-count">{likeCounts[activePost.id] || 0}</span>
                </button>
                <button type="button" title="Comments">
                  <span className="action-icon">{"\u{1F4AC}"}</span>
                  <span className="action-count">{(commentsByPost[activePost.id] || []).length}</span>
                </button>
                <button type="button" onClick={() => sharePost(activePost)} title="Share">
                  <span className="action-icon">{"\u2934"}</span>
                </button>
                <button
                  type="button"
                  className={watchLaterPostIds[activePost.id] ? "is-saved is-active" : ""}
                  onClick={() => toggleWatchLater(activePost.id)}
                  title="Watch Later"
                >
                  <span className="action-icon">{"\u23F2"}</span>
                </button>
              </div>

              <button
                type="button"
                className={`feed-save-btn ${savedPostIds[activePost.id] ? "is-saved is-active" : ""}`}
                onClick={() => toggleSave(activePost.id)}
                title="Save"
              >
                <span className="action-icon">{"\u{1F516}"}</span>
              </button>
            </div>

            {shareMessageByPost[activePost.id] && (
              <p className="feed-share-status">{shareMessageByPost[activePost.id]}</p>
            )}
            {likeCounts[activePost.id] > 0 && (
              <p className="feed-likes-line">{likeCounts[activePost.id]} likes</p>
            )}
            {(activePost.description || activePost.content) && (
              <p className="feed-caption">
                <strong>{usernameFor(activePost)}</strong>{" "}
                {activePost.description || activePost.content}
              </p>
            )}

            <div className="feed-comments">
              <div className="feed-comment-input-row">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={commentTextByPost[activePost.id] || ""}
                  onChange={(e) =>
                    setCommentTextByPost((prev) => ({ ...prev, [activePost.id]: e.target.value }))
                  }
                />
                <button type="button" onClick={() => submitComment(activePost.id)}>Post</button>
              </div>

              {(commentsByPost[activePost.id] || []).map((comment) => (
                <div className="feed-comment-item" key={comment.id}>
                  <strong>{normalizeDisplayName(comment.user?.name || comment.user?.email || "User")}:</strong>{" "}
                  {comment.text}
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
