import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiBookmark } from "react-icons/fi";
import { BsBookmarkFill } from "react-icons/bs";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import "./Feed.css";

const LONG_VIDEO_SECONDS = 90;

export default function Feed() {
  const navigate = useNavigate();
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
  const [profilePicByOwner, setProfilePicByOwner] = useState({});

  useEffect(() => {
    let mounted = true;
    const buildBaseCandidates = () => {
      const isLocalDev =
        typeof window !== "undefined" &&
        ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
      const storedBase =
        typeof window !== "undefined"
          ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
          : "";
      return [
        api.defaults.baseURL,
        storedBase,
        getApiBaseUrl(),
        import.meta.env.VITE_API_URL,
        ...(isLocalDev ? ["http://localhost:8080", "http://127.0.0.1:8080", "/api"] : ["https://socialsea.co.in"]),
      ].filter((v, i, arr) => v && arr.indexOf(v) === i);
    };
    const extractList = (payload) =>
      Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.content)
              ? payload.content
              : [];
    const load = async () => {
      try {
        const baseCandidates = buildBaseCandidates();
        const endpoints = ["/api/feed", "/feed", "/api/posts", "/posts"];
        let res = null;
        let lastErr = null;
        let fallbackRes = null;
        for (const baseURL of baseCandidates) {
          for (const url of endpoints) {
            try {
              const r = await api.request({
                method: "GET",
                url,
                baseURL,
                timeout: 10000,
                suppressAuthRedirect: true,
              });
              const body = r?.data;
              const looksLikeHtml =
                typeof body === "string" && (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body));
              if (looksLikeHtml) {
                const htmlErr = new Error("Received HTML instead of API JSON");
                htmlErr.response = { status: 404, data: body };
                throw htmlErr;
              }
              const listTry = extractList(body);
              if (Array.isArray(listTry)) {
                if (!fallbackRes) fallbackRes = { ...r, data: listTry };
                if (listTry.length > 0) {
                  res = { ...r, data: listTry };
                  lastErr = null;
                  break;
                }
              }
            } catch (err) {
              lastErr = err;
            }
          }
          if (res) break;
        }
        if (!res && fallbackRes) res = fallbackRes;
        if (!res) throw lastErr || new Error("Failed to load feed");
        const list = Array.isArray(res.data) ? res.data : [];
        if (!mounted) return;
        setPosts(list);

        if (list.length === 0) {
          try {
            const healthRes = await api.get("/actuator/health", {
              skipAuth: true,
              suppressAuthRedirect: true,
              timeout: 4000
            });
            const health = String(healthRes?.data?.status || "").toUpperCase();
            if (health && health !== "UP") {
              setError(`Backend health is ${health}. Feed may be empty due to backend DB/service issue.`);
            }
          } catch {
            // ignore health probe failure
          }
        }
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        const status = err?.response?.status;
        const message = err?.response?.data?.message || err?.response?.data || "";
        setError(status ? `Failed to load feed (${status}) ${message}` : "Failed to load feed");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
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
      const raw = localStorage.getItem("likedPostIds");
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      const map = ids.reduce((acc, id) => ({ ...acc, [id]: true }), {});
      setLikedPostIds(map);
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

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
    return toApiUrl(url);
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

  const ownerCandidatesFor = (post) => {
    const values = [
      post?.user?.id,
      post?.userId,
      post?.user?.username,
      post?.username,
      post?.user?.email,
      post?.email,
      post?.user?.name,
      post?.name
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return values.filter((v, i, arr) => arr.indexOf(v) === i);
  };

  const ownerKeyFor = (post) => ownerCandidatesFor(post)[0] || "";

  const profilePicFor = (post) => {
    const ownerKey = ownerKeyFor(post);
    if (ownerKey && profilePicByOwner[ownerKey]) return profilePicByOwner[ownerKey];
    const raw =
      post?.user?.profilePicUrl ||
      post?.user?.profilePic ||
      post?.user?.avatarUrl ||
      post?.user?.avatar ||
      post?.profilePicUrl ||
      post?.profilePic ||
      post?.avatarUrl ||
      post?.avatar ||
      "";
    return raw ? resolveUrl(String(raw).trim()) : "";
  };

  useEffect(() => {
    if (!posts.length) return;
    const uniquePostsByOwner = [];
    const seen = new Set();
    posts.forEach((post) => {
      const ownerKey = ownerKeyFor(post);
      if (!ownerKey || seen.has(ownerKey)) return;
      seen.add(ownerKey);
      uniquePostsByOwner.push(post);
    });
    if (!uniquePostsByOwner.length) return;

    let cancelled = false;
    const run = async () => {
      const nextMap = {};
      for (const post of uniquePostsByOwner.slice(0, 40)) {
        const ownerKey = ownerKeyFor(post);
        if (!ownerKey || profilePicByOwner[ownerKey]) continue;
        if (profilePicFor(post)) continue;

        const candidates = ownerCandidatesFor(post);
        let found = "";
        for (const candidate of candidates) {
          const endpoints = [`/api/profile/${encodeURIComponent(candidate)}`];
          for (const url of endpoints) {
            try {
              const res = await api.get(url, { suppressAuthRedirect: true, timeout: 4000 });
              const user = res?.data?.user || res?.data || {};
              const rawPic =
                user?.profilePicUrl ||
                user?.profilePic ||
                user?.avatarUrl ||
                user?.avatar ||
                "";
              if (rawPic) {
                found = resolveUrl(String(rawPic).trim());
                break;
              }
            } catch {
              // try next candidate/endpoint
            }
          }
          if (found) break;
        }
        if (found) nextMap[ownerKey] = found;
      }
      if (cancelled || !Object.keys(nextMap).length) return;
      setProfilePicByOwner((prev) => ({ ...prev, ...nextMap }));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [posts]);

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
    const persistLikedMap = (next) => {
      const ids = Object.keys(next)
        .filter((id) => next[id])
        .map((id) => Number(id));
      localStorage.setItem("likedPostIds", JSON.stringify(ids));
    };

    if (likedPostIds[postId]) return;

    try {
      const res = await api.post(`/api/likes/${postId}`);
      const message = String(res?.data || "").toLowerCase();
      if (message.includes("already")) {
        setLikedPostIds((prev) => {
          const next = { ...prev, [postId]: true };
          persistLikedMap(next);
          return next;
        });
        return;
      }
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
      setLikedPostIds((prev) => {
        const next = { ...prev, [postId]: true };
        persistLikedMap(next);
        return next;
      });
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

  const openPostFromGrid = async (post) => {
    const type = mediaTypeFor(post);
    const duration = videoDurationByPost[post.id] || 0;
    const isShortVideo = type === "VIDEO" && duration > 0 && duration <= LONG_VIDEO_SECONDS;
    if (isShortVideo) {
      navigate(`/reels?post=${post.id}`);
      return;
    }
    await openPost(post.id);
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
            const profilePic = profilePicFor(post);
            const duration = videoDurationByPost[post.id] || 0;
            return (
              <button
                key={`long-${post.id}`}
                type="button"
                className="long-feed-card"
                onClick={() => navigate(`/watch/${post.id}`)}
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
                  {profilePic ? (
                    <img src={profilePic} alt={user} className="long-feed-avatar long-feed-avatar-img" />
                  ) : (
                    <span className="long-feed-avatar">{user.charAt(0).toUpperCase()}</span>
                  )}
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
              onClick={() => openPostFromGrid(post)}
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
              {profilePicFor(activePost) ? (
                <img
                  src={profilePicFor(activePost)}
                  alt={usernameFor(activePost)}
                  className="feed-avatar feed-avatar-img"
                />
              ) : (
                <div className="feed-avatar">{usernameFor(activePost).charAt(0).toUpperCase()}</div>
              )}
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
                <span className="action-icon action-icon-svg">
                  {savedPostIds[activePost.id] ? <BsBookmarkFill /> : <FiBookmark />}
                </span>
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
