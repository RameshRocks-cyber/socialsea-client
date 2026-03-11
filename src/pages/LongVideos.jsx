import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import "./LongVideos.css";

const LONG_VIDEO_SECONDS = 90;
const QUALITY_OPTIONS = ["auto", "1080", "720", "480", "360"];
const MIN_LONG_VIDEO_FALLBACK_SECONDS = 45;
const WATCH_CATEGORIES = [
  "All",
  "Music",
  "Mixes",
  "News",
  "Live",
  "Comedy",
  "Movies",
  "Gaming",
  "Trending"
];

export default function LongVideos() {
  const { postId } = useParams();
  const isWatchMode = Boolean(postId);
  const navigate = useNavigate();
  const playerRef = useRef(null);
  const playerWrapRef = useRef(null);
  const gestureRef = useRef({ active: false, mode: "", startY: 0, startValue: 0, pointerId: null });
  const gestureHudTimerRef = useRef(0);
  const controlsHideTimerRef = useRef(0);
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
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [playerBrightness, setPlayerBrightness] = useState(1);
  const [gestureHud, setGestureHud] = useState("");
  const [isPlayerPaused, setIsPlayerPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const toList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.content)) return payload.content;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const getTotalPages = (payload) => {
    const candidates = [
      payload?.totalPages,
      payload?.page?.totalPages,
      payload?.pagination?.totalPages
    ];
    for (const raw of candidates) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return 0;
  };

  const hasNextPage = (payload) => {
    const candidates = [payload?.hasNext, payload?.page?.hasNext, payload?.pagination?.hasNext];
    return candidates.some((v) => v === true);
  };

  const fetchEndpointItems = async (url) => {
    const first = await api.get(url, {
      suppressAuthRedirect: true,
      params: { page: 0, size: 500 }
    });
    const firstPayload = first?.data;
    let merged = toList(firstPayload);

    const totalPages = getTotalPages(firstPayload);
    if (totalPages > 1) {
      const pageRequests = [];
      for (let page = 1; page < totalPages; page += 1) {
        pageRequests.push(
          api.get(url, {
            suppressAuthRedirect: true,
            params: { page, size: 100 }
          })
        );
      }
      const rest = await Promise.allSettled(pageRequests);
      rest.forEach((result) => {
        if (result.status === "fulfilled") {
          merged = merged.concat(toList(result.value?.data));
        }
      });
      return merged;
    }

    // Some APIs expose hasNext without totalPages.
    if (hasNextPage(firstPayload)) {
      let page = 1;
      let safety = 0;
      while (safety < 20) {
        const next = await api.get(url, {
          suppressAuthRedirect: true,
          params: { page, size: 100 }
        });
        const nextItems = toList(next?.data);
        if (!nextItems.length) break;
        merged = merged.concat(nextItems);
        if (!hasNextPage(next?.data)) break;
        page += 1;
        safety += 1;
      }
    }

    return merged;
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
  const isVideoPost = (post) => {
    const rawType = String(post?.type || post?.mediaType || post?.contentType || "")
      .trim()
      .toLowerCase();
    if (rawType.includes("video")) return true;
    if (rawType.includes("image")) return false;
    const url = mediaUrlFor(post).toLowerCase();
    return /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/.test(url);
  };

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
        const responses = await Promise.allSettled(endpoints.map((url) => fetchEndpointItems(url)));
        const posts = responses
          .filter((r) => r.status === "fulfilled")
          .flatMap((r) => (Array.isArray(r.value) ? r.value : []))
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
    return uniqueByPostKey(allPosts.filter((post) => !!mediaUrlFor(post) && isVideoPost(post)));
  }, [allPosts]);

  const longVideos = useMemo(() => {
    // Keep unknown-duration videos visible; many CDNs/API shapes do not expose duration reliably.
    // Use relaxed threshold consistently so 45s+ videos are included.
    return uniqueByPostKey(
      videoPosts.filter((post) => {
        const duration = Number(videoDurationByPost[post.id]) || 0;
        return duration <= 0 || duration > Math.min(LONG_VIDEO_SECONDS, MIN_LONG_VIDEO_FALLBACK_SECONDS);
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

  const filteredLongVideos = useMemo(() => {
    const q = String(searchText || "").trim().toLowerCase();
    return longVideos.filter((post) => {
      const owner = usernameFor(post).toLowerCase();
      const title = captionFor(post).toLowerCase();
      const categoryMatch =
        activeCategory === "All" ||
        title.includes(activeCategory.toLowerCase()) ||
        owner.includes(activeCategory.toLowerCase());
      if (!categoryMatch) return false;
      if (!q) return true;
      return owner.includes(q) || title.includes(q);
    });
  }, [longVideos, searchText, activeCategory]);

  const activeVideo =
    longVideos.find((p) => String(p.id) === String(postId)) || filteredLongVideos[0] || longVideos[0] || null;
  const watchSequence = filteredLongVideos.length ? filteredLongVideos : longVideos;
  const activeVideoIndex = watchSequence.findIndex((p) => String(p.id) === String(activeVideo?.id));

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

  const formatDuration = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const formatCompact = (value) => {
    const n = Number(value) || 0;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return `${n}`;
  };

  const relativeFrom = (value) => {
    if (!value) return "recently";
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "recently";
    const diffMs = Date.now() - d.getTime();
    const minutes = Math.max(1, Math.floor(diffMs / 60000));
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month ago`;
    return `${Math.floor(months / 12)} year ago`;
  };

  const selectVideo = (id) => {
    if (!id) return;
    navigate(`/watch/${id}`);
  };

  const showGestureHud = (text) => {
    setGestureHud(text);
    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = window.setTimeout(() => setGestureHud(""), 650);
  };

  const changeVideoByOffset = (offset) => {
    const primary = watchSequence.length > 1 ? watchSequence : longVideos;
    if (!primary.length) return;
    const currentId = String(activeVideo?.id || "");
    const idx = primary.findIndex((p) => String(p?.id) === currentId);
    const currentIndex = idx >= 0 ? idx : 0;
    const nextIndex = (currentIndex + offset + primary.length) % primary.length;
    const next = primary[nextIndex];
    if (next?.id != null) selectVideo(next.id);
  };

  const togglePlayPause = () => {
    const video = playerRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const showPlayerControls = (autoHide = true) => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = 0;
    }
    if (!autoHide || isPlayerPaused) return;
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsHideTimerRef.current = 0;
    }, 3000);
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const handlePlayerPointerDown = (event) => {
    if (event.target?.closest?.(".watch-overlay-controls")) return;
    showPlayerControls(true);
    const wrap = playerWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const mode = event.clientX - rect.left < rect.width / 2 ? "volume" : "brightness";
    const video = playerRef.current;
    const startValue = mode === "volume" ? Number(video?.volume ?? 1) : Number(playerBrightness || 1);
    gestureRef.current = {
      active: true,
      mode,
      startY: event.clientY,
      startValue,
      pointerId: event.pointerId
    };
    if (wrap.setPointerCapture) {
      try {
        wrap.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    }
  };

  const handlePlayerPointerMove = (event) => {
    if (event.target?.closest?.(".watch-overlay-controls")) return;
    showPlayerControls(true);
    const meta = gestureRef.current;
    const wrap = playerWrapRef.current;
    if (!meta.active || !wrap) return;
    if (meta.pointerId != null && event.pointerId !== meta.pointerId) return;

    const rect = wrap.getBoundingClientRect();
    const deltaRatio = (meta.startY - event.clientY) / Math.max(1, rect.height);
    if (meta.mode === "volume") {
      const nextVolume = clamp(meta.startValue + deltaRatio * 1.3, 0, 1);
      if (playerRef.current) playerRef.current.volume = nextVolume;
      showGestureHud(`Volume ${Math.round(nextVolume * 100)}%`);
    } else if (meta.mode === "brightness") {
      // Browser cannot control device screen brightness; apply video brightness filter instead.
      const nextBrightness = clamp(meta.startValue + deltaRatio * 1.1, 0.5, 1.7);
      setPlayerBrightness(nextBrightness);
      showGestureHud(`Brightness ${Math.round(nextBrightness * 100)}%`);
    }
  };

  const handlePlayerPointerUp = (event) => {
    if (event.target?.closest?.(".watch-overlay-controls")) return;
    const wrap = playerWrapRef.current;
    if (wrap?.releasePointerCapture && gestureRef.current.pointerId != null) {
      try {
        wrap.releasePointerCapture(gestureRef.current.pointerId);
      } catch {
        // no-op
      }
    }
    gestureRef.current = { active: false, mode: "", startY: 0, startValue: 0, pointerId: null };
    if (event?.cancelable) event.preventDefault();
  };

  useEffect(() => {
    return () => {
      if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
      if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isWatchMode) return;
    showPlayerControls(true);
  }, [isWatchMode, activeVideo?.id, isPlayerPaused]);

  useEffect(() => {
    if (!isWatchMode) return;
    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        changeVideoByOffset(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        changeVideoByOffset(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWatchMode, activeVideoIndex, watchSequence]);

  const relatedVideos = longVideos.filter((item) => String(item.id) !== String(activeVideo?.id));

  return (
    <div className={`yt-watch-page ${isWatchMode ? "is-watch-mode" : ""}`}>
      <header className="yt-topbar">
        <h2>SocialSea Watch</h2>
        <div className="yt-search-wrap">
          <input
            type="text"
            className="yt-search-input"
            placeholder="Search long videos"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
      </header>

      <div className="yt-chip-row">
        {WATCH_CATEGORIES.map((chip) => (
          <button
            key={chip}
            type="button"
            className={`yt-chip ${activeCategory === chip ? "is-active" : ""}`}
            onClick={() => setActiveCategory(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {!isWatchMode ? (
        <section className="yt-home-grid">
          {isLoading && <p className="watch-empty">Loading long videos...</p>}
          {!isLoading && !filteredLongVideos.length && <p className="watch-empty">No long videos found.</p>}
          {filteredLongVideos.map((video) => {
            const raw = mediaUrlFor(video);
            const url = resolveUrl(raw);
            const duration = videoDurationByPost[video.id] || 0;
            return (
              <article
                key={video.id}
                className="yt-home-card"
                role="button"
                tabIndex={0}
                onClick={() => selectVideo(video.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectVideo(video.id);
                  }
                }}
              >
                <div className="yt-home-thumb-wrap">
                  <video
                    src={url}
                    muted
                    playsInline
                    preload="metadata"
                    className="yt-home-thumb"
                    onPlay={(event) => {
                      event.currentTarget.pause();
                      event.currentTarget.currentTime = 0;
                    }}
                  />
                  <span className="yt-duration-badge">{duration > 0 ? formatDuration(duration) : "--:--"}</span>
                </div>
                <div className="yt-home-meta">
                  <h4>{captionFor(video)}</h4>
                  <p>{usernameFor(video)}</p>
                  <small>{formatCompact(likeCounts[video.id] || 0)} likes • {relativeFrom(video?.createdAt)}</small>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="watch-page">
          <section className="watch-main">
            {isLoading && <p className="watch-empty">Loading long videos...</p>}
            {!isLoading && !activeVideo && <p className="watch-empty">No long videos found.</p>}

            {activeVideo && (
              <>
                <div
                  className="watch-player-wrap"
                  ref={playerWrapRef}
                  onPointerDown={handlePlayerPointerDown}
                  onPointerMove={handlePlayerPointerMove}
                  onPointerUp={handlePlayerPointerUp}
                  onPointerCancel={handlePlayerPointerUp}
                  onMouseMove={() => showPlayerControls(true)}
                  onTouchStart={() => showPlayerControls(true)}
                >
                  <video
                    key={`${activeVideo.id}-${selectedQuality}`}
                    ref={playerRef}
                    src={activeVideoUrl}
                    controls
                    autoPlay
                    className="watch-player"
                    style={{ filter: `brightness(${playerBrightness})` }}
                    onPlay={() => {
                      setIsPlayerPaused(false);
                      showPlayerControls(true);
                    }}
                    onPause={() => {
                      setIsPlayerPaused(true);
                      showPlayerControls(false);
                    }}
                    onEnded={() => {
                      setIsPlayerPaused(true);
                      showPlayerControls(false);
                    }}
                  />
                  <div
                    className={`watch-overlay-controls ${controlsVisible ? "" : "is-hidden"}`}
                    aria-label="Playback controls"
                  >
                    <button
                      type="button"
                      className="watch-nav-btn watch-nav-prev"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => changeVideoByOffset(-1)}
                      title="Previous video"
                      aria-label="Previous video"
                    >
                      <span className="watch-nav-icon">{"\u23EE"}</span>
                    </button>
                    <button
                      type="button"
                      className="watch-nav-btn watch-nav-play"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={togglePlayPause}
                      title={isPlayerPaused ? "Play" : "Pause"}
                      aria-label={isPlayerPaused ? "Play" : "Pause"}
                    >
                      <span className="watch-nav-icon">{isPlayerPaused ? "\u25B6" : "\u23F8"}</span>
                    </button>
                    <button
                      type="button"
                      className="watch-nav-btn watch-nav-next"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => changeVideoByOffset(1)}
                      title="Next video"
                      aria-label="Next video"
                    >
                      <span className="watch-nav-icon">{"\u23ED"}</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="watch-quality-btn"
                    onClick={() => setShowQualityMenu((s) => !s)}
                  >
                    {selectedQuality === "auto" ? "Auto" : `${selectedQuality}p`}
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
                  {!!gestureHud && <div className="watch-gesture-hud">{gestureHud}</div>}
                </div>

                <h1 className="watch-title">{captionFor(activeVideo)}</h1>
                <p className="watch-owner">
                  {usernameFor(activeVideo)} • {formatCompact(likeCounts[activeVideo.id] || 0)} likes • {relativeFrom(activeVideo?.createdAt)}
                </p>

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
                          {"\u{1F44D}"} {likeCounts[activeVideo.id] || 0}
                        </button>
                        <button
                          type="button"
                          className={`watch-action-btn ${isDisliked ? "is-active dislike" : ""}`}
                          onClick={() => toggleDislike(activeVideo.id)}
                        >
                          {"\u{1F44E}"} {dislikeCounts[activeVideo.id] || 0}
                        </button>
                        <button
                          type="button"
                          className="watch-action-btn"
                          onClick={() => setShowComments((v) => !v)}
                        >
                          {"\u{1F4AC}"} {(commentsByPost[activeVideo.id] || []).length}
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
            <h3>Up next</h3>
            <div className="watch-list">
              {relatedVideos.map((v) => {
                const raw = v.contentUrl || v.mediaUrl || "";
                const url = resolveUrl(String(raw).trim());
                const duration = videoDurationByPost[v.id] || 0;
                return (
                  <article
                    key={v.id}
                    className="watch-item"
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
                    <div className="watch-item-thumb-wrap">
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
                      <span className="yt-duration-badge">{duration > 0 ? formatDuration(duration) : "--:--"}</span>
                    </div>
                    <div className="watch-item-text">
                      <p>{captionFor(v)}</p>
                      <small>{usernameFor(v)}</small>
                      <small>{formatCompact(likeCounts[v.id] || 0)} likes • {relativeFrom(v?.createdAt)}</small>
                    </div>
                  </article>
                );
              })}
              {!relatedVideos.length && <p className="watch-empty">No long videos found.</p>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
