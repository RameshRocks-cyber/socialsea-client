import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiBookmark } from "react-icons/fi";
import { BsBookmarkFill } from "react-icons/bs";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import "./Feed.css";

const LONG_VIDEO_SECONDS = 90;

export default function Feed() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [feedMode, setFeedMode] = useState("long");
  const [posts, setPosts] = useState([]);
  const [likeCounts, setLikeCounts] = useState({});
  const [likedPostIds, setLikedPostIds] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentTextByPost, setCommentTextByPost] = useState({});
  const [savedPostIds, setSavedPostIds] = useState({});
  const [watchLaterPostIds, setWatchLaterPostIds] = useState({});
  const [shareMessageByPost, setShareMessageByPost] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activePostId, setActivePostId] = useState(null);
  const [videoDurationByPost, setVideoDurationByPost] = useState({});
  const [profilePicByOwner, setProfilePicByOwner] = useState({});
  const [mutedByPost, setMutedByPost] = useState({});
  const wheelLockRef = useRef(0);
  const wheelDeltaRef = useRef(0);
  const touchStartYRef = useRef(null);
  const mediaClickTimerByPostRef = useRef({});

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
      setIsLoading(true);
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
      } finally {
        if (mounted) setIsLoading(false);
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
    const rawType = String(post?.type || post?.mediaType || post?.contentType || "")
      .trim()
      .toLowerCase();
    if (rawType.includes("video")) return "VIDEO";
    if (rawType.includes("image")) return "IMAGE";

    const url = String(post?.contentUrl || post?.mediaUrl || "")
      .trim()
      .toLowerCase();
    if (/\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/.test(url)) return "VIDEO";
    if (/\.(png|jpe?g|gif|webp|bmp|avif|svg)(\?|#|$)/.test(url)) return "IMAGE";

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

  const formatCompactCount = (value) => {
    const n = Number(value) || 0;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return `${n}`;
  };

  const relativePostTime = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "recently";
    const diffSec = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hours ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} days ago`;
    return d.toLocaleDateString();
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

    try {
      if (likedPostIds[postId]) {
        await api.delete(`/api/likes/${postId}`);
        setLikedPostIds((prev) => {
          const next = { ...prev, [postId]: false };
          persistLikedMap(next);
          return next;
        });
        setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - 1) }));
        return;
      }

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

  const togglePostMute = (postId) => {
    setMutedByPost((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  const handleViewerMediaClick = (post) => {
    if (!post || mediaTypeFor(post) !== "VIDEO") return;
    const existing = mediaClickTimerByPostRef.current[post.id];
    if (existing) clearTimeout(existing);
    mediaClickTimerByPostRef.current[post.id] = setTimeout(() => {
      togglePostMute(post.id);
      mediaClickTimerByPostRef.current[post.id] = null;
    }, 240);
  };

  const handleViewerMediaDoubleClick = (post) => {
    if (!post) return;
    const existing = mediaClickTimerByPostRef.current[post.id];
    if (existing) {
      clearTimeout(existing);
      mediaClickTimerByPostRef.current[post.id] = null;
    }
    void likePost(post.id);
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
      const duration = Number(videoDurationByPost[post.id] || 0);
      // Keep videos visible until metadata is known, then keep only true long videos.
      return isVideo && (duration <= 0 || duration > LONG_VIDEO_SECONDS);
    });
  }, [filteredPosts, videoDurationByPost]);

  const gridPosts = useMemo(() => {
    return filteredPosts.filter((post) => !longVideoPosts.some((lv) => lv.id === post.id));
  }, [filteredPosts, longVideoPosts]);

  const shortVideoPosts = useMemo(() => {
    return filteredPosts.filter((post) => {
      if (mediaTypeFor(post) !== "VIDEO") return false;
      const duration = Number(videoDurationByPost[post.id] || 0);
      return duration <= 0 || duration <= LONG_VIDEO_SECONDS;
    });
  }, [filteredPosts, videoDurationByPost]);

  const activeShortVideoIndex = useMemo(
    () => shortVideoPosts.findIndex((p) => p.id === activePostId),
    [shortVideoPosts, activePostId]
  );
  const isShortViewerOpen = feedMode === "all" && activeShortVideoIndex >= 0;

  const openPost = async (postId, syncUrl = false, replace = false) => {
    setActivePostId(postId);
    await loadComments(postId);
    if (syncUrl) {
      navigate(`/feed?post=${postId}`, { replace });
    }
  };

  useEffect(() => {
    const postParam = String(searchParams.get("post") || "").trim();
    if (!postParam) return;
    const target = posts.find((p) => String(p?.id) === postParam);
    if (!target) return;
    if (String(activePostId || "") === postParam) return;
    void openPost(target.id, false);
  }, [searchParams, posts, activePostId, videoDurationByPost, navigate]);

  const openPostFromGrid = async (post) => {
    const type = mediaTypeFor(post);
    if (feedMode === "all" && type === "VIDEO") {
      navigate(`/reels?post=${post.id}`);
      return;
    }
    const duration = videoDurationByPost[post.id] || 0;
    const isShortVideo = type === "VIDEO" && duration > 0 && duration <= LONG_VIDEO_SECONDS;
    if (isShortVideo) {
      navigate(`/reels?post=${post.id}`);
      return;
    }
    await openPost(post.id, false);
  };

  const moveShortVideo = async (direction) => {
    if (activeShortVideoIndex < 0 || !shortVideoPosts.length) return;
    const nextIndex = (activeShortVideoIndex + direction + shortVideoPosts.length) % shortVideoPosts.length;
    const nextPost = shortVideoPosts[nextIndex];
    if (!nextPost) return;
    await openPost(nextPost.id, true, true);
  };

  useEffect(() => {
    if (!isShortViewerOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        void moveShortVideo(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        void moveShortVideo(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isShortViewerOpen, shortVideoPosts, activeShortVideoIndex]);

  useEffect(() => {
    if (!isShortViewerOpen) return;
    const onWheel = (e) => {
      e.preventDefault();
      wheelDeltaRef.current += e.deltaY;
      if (Math.abs(wheelDeltaRef.current) < 50) return;
      const direction = wheelDeltaRef.current > 0 ? 1 : -1;
      wheelDeltaRef.current = 0;
      const now = Date.now();
      if (now - wheelLockRef.current < 360) return;
      wheelLockRef.current = now;
      void moveShortVideo(direction);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [isShortViewerOpen, shortVideoPosts, activeShortVideoIndex]);

  useEffect(() => {
    if (!isShortViewerOpen) return;
    const onTouchStart = (e) => {
      touchStartYRef.current = e.touches?.[0]?.clientY ?? null;
    };
    const onTouchEnd = (e) => {
      const startY = touchStartYRef.current;
      const endY = e.changedTouches?.[0]?.clientY ?? null;
      touchStartYRef.current = null;
      if (startY == null || endY == null) return;
      const delta = startY - endY;
      if (Math.abs(delta) < 40) return;
      const now = Date.now();
      if (now - wheelLockRef.current < 360) return;
      wheelLockRef.current = now;
      void moveShortVideo(delta > 0 ? 1 : -1);
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isShortViewerOpen, shortVideoPosts, activeShortVideoIndex]);

  const closePostView = () => {
    setActivePostId(null);
    if (searchParams.get("post")) navigate("/feed", { replace: true });
  };

  const activePost = posts.find((p) => p.id === activePostId) || null;
  const viewerPosts = useMemo(() => {
    if (!activePost) return [];
    const pool = feedMode === "all" ? shortVideoPosts : filteredPosts;
    const idx = pool.findIndex((p) => Number(p?.id) === Number(activePost.id));
    if (idx < 0) return [activePost];
    const ordered = [...pool.slice(idx), ...pool.slice(0, idx)];
    return ordered.length ? ordered : [activePost];
  }, [activePost, feedMode, shortVideoPosts, filteredPosts]);

  useEffect(() => {
    if (!activePostId) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [activePostId]);

  useEffect(() => {
    return () => {
      Object.values(mediaClickTimerByPostRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      mediaClickTimerByPostRef.current = {};
    };
  }, []);

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

      <div className="feed-mode-switch" role="tablist" aria-label="Feed mode">
        <button
          type="button"
          role="tab"
          aria-selected={feedMode === "long"}
          className={`feed-mode-btn ${feedMode === "long" ? "is-active" : ""}`}
          onClick={() => setFeedMode("long")}
        >
          Long Videos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={feedMode === "all"}
          className={`feed-mode-btn ${feedMode === "all" ? "is-active" : ""}`}
          onClick={() => setFeedMode("all")}
        >
          Short Videos
        </button>
      </div>

      {error && <p>{error}</p>}
      {!error && isLoading && <p className="feed-empty">Loading videos...</p>}
      {!error && !isLoading && filteredPosts.length === 0 && <p className="feed-empty">No posts found</p>}
      {!error && !isLoading && feedMode === "long" && !longVideoPosts.length && (
        <p className="feed-empty">No long videos found</p>
      )}
      {!error && !isLoading && feedMode === "all" && !shortVideoPosts.length && (
        <p className="feed-empty">No short videos found</p>
      )}

      {!!longVideoPosts.length && feedMode === "long" && (
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

      {feedMode === "all" && (
        <section className="explore-grid instagram-grid">
        {shortVideoPosts.map((post) => {
          const rawUrl = post.contentUrl || post.mediaUrl || "";
          const mediaUrl = rawUrl.trim() ? resolveUrl(rawUrl.trim()) : "";
          const type = mediaTypeFor(post);
          if (!mediaUrl) return null;

          return (
            <button
              key={post.id}
              type="button"
              className="explore-tile instagram-tile"
              onClick={() => openPost(post.id, true)}
              title={usernameFor(post)}
            >
              {type === "VIDEO" ? (
                <video
                  src={mediaUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
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
                <span>{"\u25B7"} {(likeCounts[post.id] || 0).toLocaleString()}</span>
              </div>
            </button>
          );
        })}
        </section>
      )}

      {activePost && (
        <div className="post-view-backdrop" onClick={closePostView}>
          <div className="post-view-stack" onClick={(e) => e.stopPropagation()}>
            {viewerPosts.map((post, idx) => {
              const isPrimary = idx === 0;
              const raw = post.contentUrl || post.mediaUrl || "";
              const mediaUrl = raw.trim() ? resolveUrl(raw.trim()) : "";
              const type = mediaTypeFor(post);
              return (
                <article className="post-view-card instagram-post-card" key={`viewer-${post.id}-${idx}`}>
                  <div className="ig-post-context">
                    <p className="ig-post-tags">{post.description || post.content || "Post"}</p>
                    <p className="ig-post-time">{relativePostTime(post.createdAt || post.createdDate)}</p>
                  </div>

                  <header className="feed-post-head ig-post-head">
                    {profilePicFor(post) ? (
                      <img
                        src={profilePicFor(post)}
                        alt={usernameFor(post)}
                        className="feed-avatar feed-avatar-img"
                      />
                    ) : (
                      <div className="feed-avatar">{usernameFor(post).charAt(0).toUpperCase()}</div>
                    )}
                    <div className="ig-user-meta">
                      <p className="feed-username">{usernameFor(post)}</p>
                      <small>{usernameFor(post)} • Original audio</small>
                    </div>
                    <div className="ig-user-actions">
                      <button type="button" className="ig-follow-btn">Follow</button>
                      <button type="button" className="ig-more-btn" aria-label="More options">⋮</button>
                    </div>
                  </header>

                  {mediaUrl && (
                    type === "VIDEO" ? (
                      <video
                        src={mediaUrl}
                        controls
                        muted={!!mutedByPost[post.id]}
                        className="feed-media-view"
                        onClick={() => handleViewerMediaClick(post)}
                        onDoubleClick={() => handleViewerMediaDoubleClick(post)}
                      />
                    ) : (
                      <img src={mediaUrl} alt="post" className="feed-media-view" />
                    )
                  )}

                  <div className="feed-actions ig-feed-actions">
                    <div className="feed-actions-left">
                      <button
                        type="button"
                        className={likedPostIds[post.id] ? "is-active" : ""}
                        onClick={() => likePost(post.id)}
                        title="Like"
                      >
                        <span className="action-icon">{"\u2665"}</span>
                        <span className="action-count">{formatCompactCount(likeCounts[post.id] || 0)}</span>
                      </button>
                      <button type="button" title="Comments">
                        <span className="action-icon">{"\u{1F4AC}"}</span>
                        <span className="action-count">{formatCompactCount((commentsByPost[post.id] || []).length)}</span>
                      </button>
                      <button type="button" onClick={() => sharePost(post)} title="Share">
                        <span className="action-icon">{"\u2934"}</span>
                      </button>
                      <button
                        type="button"
                        className={watchLaterPostIds[post.id] ? "is-saved is-active" : ""}
                        onClick={() => toggleWatchLater(post.id)}
                        title="Watch Later"
                      >
                        <span className="action-icon">{"\u23F2"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`feed-save-btn ${savedPostIds[post.id] ? "is-saved is-active" : ""}`}
                      onClick={() => toggleSave(post.id)}
                      title="Save"
                    >
                      <span className="action-icon action-icon-svg">
                        {savedPostIds[post.id] ? <BsBookmarkFill /> : <FiBookmark />}
                      </span>
                    </button>
                  </div>

                  {shareMessageByPost[post.id] && <p className="feed-share-status">{shareMessageByPost[post.id]}</p>}
                  {likeCounts[post.id] > 0 && <p className="feed-likes-line">{likeCounts[post.id]} likes</p>}
                  {(post.description || post.content) && (
                    <p className="feed-caption">
                      <strong>{usernameFor(post)}</strong>{" "}
                      {post.description || post.content}
                    </p>
                  )}

                  {isPrimary && (
                    <div className="feed-comments">
                      <div className="feed-comment-input-row">
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          value={commentTextByPost[post.id] || ""}
                          onChange={(e) =>
                            setCommentTextByPost((prev) => ({ ...prev, [post.id]: e.target.value }))
                          }
                        />
                        <button type="button" onClick={() => submitComment(post.id)}>Post</button>
                      </div>

                      {(commentsByPost[post.id] || []).map((comment) => (
                        <div className="feed-comment-item" key={comment.id}>
                          <strong>{normalizeDisplayName(comment.user?.name || comment.user?.email || "User")}:</strong>{" "}
                          {comment.text}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
