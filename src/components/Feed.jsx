import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiBookmark } from "react-icons/fi";
import { BsBookmarkFill } from "react-icons/bs";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { readLiveBroadcast, subscribeLiveBroadcast } from "../utils/liveBroadcast";
import "./Feed.css";

const LONG_VIDEO_SECONDS = 90;
const CHAT_SHARE_DRAFT_KEY = "socialsea_chat_share_draft_v1";
const POST_GENRE_MAP_KEY = "socialsea_post_genre_map_v1";
const FEED_CACHE_KEY = "socialsea_feed_cache_v1";
const FEED_YT_RAIL_ITEMS = ["Home", "Trending", "Subscriptions", "History", "Playlists", "Watch Later"];
const FEED_YT_CATEGORIES = ["All", "Music", "Mixes", "News", "Live", "Comedy", "Movies", "Gaming", "Trending"];
const FEED_CATEGORY_KEYWORDS = {
  music: ["music", "song", "audio", "album", "lyrics", "singer", "melody"],
  mixes: ["mix", "mixes", "remix", "mashup", "medley", "dj"],
  news: ["news", "update", "breaking", "headline", "report"],
  live: ["live", "livestream", "live stream", "streaming", "stream"],
  comedy: ["comedy", "funny", "joke", "memes", "laugh", "standup"],
  movies: ["movie", "movies", "cinema", "film", "trailer", "scene"],
  gaming: ["gaming", "game", "gameplay", "esports", "pubg", "freefire", "bgmi", "minecraft", "valorant"],
  trending: ["trending", "viral", "popular", "hot", "trend"]
};

const parseMaybeJson = (value) => {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || (raw[0] !== "{" && raw[0] !== "[")) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeGenre = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

const collectGenreTokens = (post, localGenreMap) => {
  const tokens = new Set();
  const add = (value) => {
    const normalized = normalizeGenre(value);
    if (normalized) tokens.add(normalized);
  };
  const addMany = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((entry) => add(entry));
  };

  add(post?.category);
  add(post?.genre);
  add(post?.videoCategory);
  add(post?.contentCategory);
  add(post?.postCategory);
  add(post?.creatorCategory);
  add(post?.user?.category);
  add(localGenreMap?.[String(post?.id || "")]);
  addMany(post?.tags);
  addMany(post?.hashtags);

  const settings = parseMaybeJson(post?.videoSettings) || parseMaybeJson(post?.settings) || parseMaybeJson(post?.metadata);
  if (settings && typeof settings === "object") {
    add(settings?.category);
    add(settings?.genre);
    addMany(settings?.tags);
    if (settings?.creatorSettings && typeof settings.creatorSettings === "object") {
      add(settings.creatorSettings.category);
      add(settings.creatorSettings.genre);
      addMany(settings.creatorSettings.tags);
    }
  }

  const text = `${post?.description || ""} ${post?.content || ""} ${post?.title || ""}`.toLowerCase();
  Object.entries(FEED_CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    if (keywords.some((word) => text.includes(word))) tokens.add(category);
  });

  return tokens;
};

const categoryMatchesPost = (post, selectedCategory, localGenreMap) => {
  const category = normalizeGenre(selectedCategory);
  if (!category || category === "all") return true;
  const tokens = collectGenreTokens(post, localGenreMap);
  if (tokens.has(category)) return true;
  const keywords = FEED_CATEGORY_KEYWORDS[category] || [];
  if (!keywords.length) return false;
  const searchable = `${post?.description || ""} ${post?.content || ""} ${post?.title || ""}`.toLowerCase();
  return keywords.some((word) => searchable.includes(word));
};

const readCachedFeedPosts = () => {
  try {
    const raw = localStorage.getItem(FEED_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const list = Array.isArray(parsed?.posts) ? parsed.posts : Array.isArray(parsed) ? parsed : [];
    return list.filter(Boolean);
  } catch {
    return [];
  }
};

export default function Feed() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [feedMode, setFeedMode] = useState("long");
  const [posts, setPosts] = useState(() => readCachedFeedPosts());
  const [liveBroadcast, setLiveBroadcast] = useState(() => readLiveBroadcast());
  const [likeCounts, setLikeCounts] = useState({});
  const [likedPostIds, setLikedPostIds] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentTextByPost, setCommentTextByPost] = useState({});
  const [savedPostIds, setSavedPostIds] = useState({});
  const [watchLaterPostIds, setWatchLaterPostIds] = useState({});
  const [shareMessageByPost, setShareMessageByPost] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(() => readCachedFeedPosts().length === 0);
  const [query, setQuery] = useState("");
  const [longCategory, setLongCategory] = useState("All");
  const [localGenreMap, setLocalGenreMap] = useState({});
  const [activePostId, setActivePostId] = useState(null);
  const [videoDurationByPost, setVideoDurationByPost] = useState({});
  const [profilePicByOwner, setProfilePicByOwner] = useState({});
  const [mutedByPost, setMutedByPost] = useState({});
  const [menuOpenPostId, setMenuOpenPostId] = useState(null);
  const [hiddenPostIds, setHiddenPostIds] = useState({});
  const [blockedOwnerKeys, setBlockedOwnerKeys] = useState({});
  const mediaClickTimerByPostRef = useRef({});
  const viewerVideoRefs = useRef({});
  const retryTimerRef = useRef(0);
  const retryCountRef = useRef(0);
  const inFlightLoadRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const postsCountRef = useRef(0);
  const menuRef = useRef(null);
  const postViewBackdropRef = useRef(null);

  const HIDDEN_POSTS_KEY = "feedHiddenPostIds";
  const BLOCKED_OWNERS_KEY = "feedBlockedOwnerKeys";
  const PLAYLIST_KEY = "playlistPostIds";
  const QUEUE_KEY = "postQueueIds";
  const PLAY_NEXT_KEY = "playNextPostId";

  useEffect(() => {
    postsCountRef.current = Array.isArray(posts) ? posts.length : 0;
  }, [posts]);

  useEffect(() => {
    const unsubscribe = subscribeLiveBroadcast((next) => setLiveBroadcast(next));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("feed-no-swipe-back");
    return () => {
      document.body.classList.remove("feed-no-swipe-back");
    };
  }, []);

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
    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = 0;
      }
    };

    const scheduleRetry = () => {
      if (!mounted) return;
      if (retryCountRef.current >= 4) return;
      clearRetryTimer();
      const delays = [1200, 2200, 4000, 6500];
      const delay = delays[retryCountRef.current] || 6500;
      retryTimerRef.current = window.setTimeout(() => {
        if (!mounted) return;
        retryCountRef.current += 1;
        void load(true);
      }, delay);
    };

    const load = async (silent = false) => {
      if (inFlightLoadRef.current) return;
      inFlightLoadRef.current = true;
      lastLoadAtRef.current = Date.now();
      if (!silent) setIsLoading(true);
      try {
        const baseCandidates = buildBaseCandidates();
        const endpoints = ["/api/feed"];
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
        try {
          localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), posts: list }));
        } catch {
          // ignore cache issues
        }
        if (list.length > 0) {
          setError("");
          retryCountRef.current = 0;
          clearRetryTimer();
        } else {
          scheduleRetry();
        }

        if (list.length === 0 && String(import.meta.env?.VITE_ENABLE_ACTUATOR_PROBE || "") === "true") {
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
        if (!postsCountRef.current) {
          setError(status ? `Failed to load feed (${status}) ${message}` : "Failed to load feed");
        }
        scheduleRetry();
      } finally {
        inFlightLoadRef.current = false;
        if (mounted) setIsLoading(false);
      }
    };

    const refreshIfStale = () => {
      if (!mounted) return;
      const staleForMs = Date.now() - lastLoadAtRef.current;
      if (staleForMs < 3000 && postsCountRef.current > 0) return;
      void load(true);
    };

    const onOnline = () => refreshIfStale();
    const onFocus = () => refreshIfStale();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    void load(false);
    return () => {
      mounted = false;
      clearRetryTimer();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POST_GENRE_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setLocalGenreMap(parsed);
      }
    } catch {
      // ignore bad local cache
    }
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event?.key !== POST_GENRE_MAP_KEY) return;
      try {
        const parsed = event?.newValue ? JSON.parse(event.newValue) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setLocalGenreMap(parsed);
        }
      } catch {
        // ignore bad local cache
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      const hiddenRaw = localStorage.getItem(HIDDEN_POSTS_KEY);
      const hidden = hiddenRaw ? JSON.parse(hiddenRaw) : [];
      if (Array.isArray(hidden)) {
        setHiddenPostIds(hidden.reduce((acc, id) => ({ ...acc, [id]: true }), {}));
      }
    } catch {
      // ignore
    }
    try {
      const blockedRaw = localStorage.getItem(BLOCKED_OWNERS_KEY);
      const blocked = blockedRaw ? JSON.parse(blockedRaw) : [];
      if (Array.isArray(blocked)) {
        setBlockedOwnerKeys(blocked.reduce((acc, key) => ({ ...acc, [String(key)]: true }), {}));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!menuOpenPostId) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpenPostId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpenPostId]);

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

  const toggleAllViewerVideosMute = () => {
    const videos = Object.values(viewerVideoRefs.current).filter(Boolean);
    if (!videos.length) return;
    const shouldMuteAll = videos.some((video) => !video.muted);
    setMutedByPost((prev) => {
      const next = { ...prev };
      viewerPosts.forEach((post) => {
        if (mediaTypeFor(post) !== "VIDEO") return;
        next[post.id] = shouldMuteAll;
      });
      return next;
    });
    videos.forEach((video) => {
      video.muted = shouldMuteAll;
    });
  };

  const formatLiveElapsed = (startedAt) => {
    const start = Number(startedAt || 0);
    if (!start) return "Just now";
    const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  };

  const handleViewerMediaClick = (post) => {
    if (!post || mediaTypeFor(post) !== "VIDEO") return;
    const existing = mediaClickTimerByPostRef.current[post.id];
    if (existing) clearTimeout(existing);
    mediaClickTimerByPostRef.current[post.id] = setTimeout(() => {
      toggleAllViewerVideosMute();
      mediaClickTimerByPostRef.current[post.id] = null;
    }, 240);
  };

  const toggleViewerFullscreen = async (postId, mediaNode) => {
    const node = mediaNode || viewerVideoRefs.current[String(postId || "")];
    if (!node) return;
    const currentFullscreenEl = document.fullscreenElement;
    if (currentFullscreenEl === node) {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      return;
    }

    if (node.requestFullscreen) {
      await node.requestFullscreen().catch(() => {});
      return;
    }
    if (node.webkitRequestFullscreen) {
      node.webkitRequestFullscreen();
      return;
    }
    if (typeof node.webkitEnterFullscreen === "function") {
      try {
        node.webkitEnterFullscreen();
      } catch {
        // ignore unsupported platform behavior
      }
    }
  };

  const handleViewerMediaDoubleClick = async (post, event) => {
    if (!post) return;
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();

    const existing = mediaClickTimerByPostRef.current[post.id];
    if (existing) {
      clearTimeout(existing);
      mediaClickTimerByPostRef.current[post.id] = null;
    }
    await toggleViewerFullscreen(post.id, event?.currentTarget || null);
  };

  const setViewerVideoRef = (postId, node) => {
    const id = String(postId || "").trim();
    if (!id) return;
    if (!node) {
      delete viewerVideoRefs.current[id];
      return;
    }
    viewerVideoRefs.current[id] = node;
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
      try {
        sessionStorage.setItem(CHAT_SHARE_DRAFT_KEY, shareText);
      } catch {
        // ignore storage failures
      }
      navigate(`/chat?share=${encodeURIComponent(shareText)}`);
      setShareMessageByPost((prev) => ({ ...prev, [post.id]: "Sharing to chat..." }));
    } catch {
      setShareMessageByPost((prev) => ({ ...prev, [post.id]: "Share failed" }));
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

  const visiblePosts = useMemo(() => {
    return filteredPosts.filter((post) => {
      if (hiddenPostIds[post.id]) return false;
      const ownerKey = ownerKeyFor(post);
      if (ownerKey && blockedOwnerKeys[ownerKey]) return false;
      return true;
    });
  }, [filteredPosts, hiddenPostIds, blockedOwnerKeys]);

  const longVideoPosts = useMemo(() => {
    return visiblePosts.filter((post) => {
      const isVideo = mediaTypeFor(post) === "VIDEO";
      const duration = Number(videoDurationByPost[post.id] || 0);
      // Keep videos visible until metadata is known, then keep only true long videos.
      return isVideo && (duration <= 0 || duration > LONG_VIDEO_SECONDS);
    });
  }, [visiblePosts, videoDurationByPost]);

  const longVideoFeedPosts = useMemo(() => {
    return longVideoPosts.filter((post) => categoryMatchesPost(post, longCategory, localGenreMap));
  }, [longVideoPosts, longCategory, localGenreMap]);

  const gridPosts = useMemo(() => {
    return visiblePosts.filter((post) => !longVideoPosts.some((lv) => lv.id === post.id));
  }, [visiblePosts, longVideoPosts]);

  const shortVideoPosts = useMemo(() => {
    return visiblePosts.filter((post) => {
      if (mediaTypeFor(post) !== "VIDEO") return false;
      const duration = Number(videoDurationByPost[post.id] || 0);
      return duration <= 0 || duration <= LONG_VIDEO_SECONDS;
    });
  }, [visiblePosts, videoDurationByPost]);

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

  const closePostView = () => {
    setActivePostId(null);
    if (searchParams.get("post")) navigate("/feed", { replace: true });
  };

  const activePost = posts.find((p) => p.id === activePostId) || null;
  const viewerPosts = useMemo(() => {
    if (!activePost) return [];
    const activeType = mediaTypeFor(activePost);
    const videoPool = visiblePosts.filter((p) => mediaTypeFor(p) === "VIDEO");
    const pool = activeType === "VIDEO" ? videoPool : [activePost];
    const idx = pool.findIndex((p) => Number(p?.id) === Number(activePost.id));
    if (idx < 0) return [activePost];
    const ordered = [...pool.slice(idx), ...pool.slice(0, idx)];
    return ordered.length ? ordered : [activePost];
  }, [activePost, visiblePosts]);

  useEffect(() => {
    if (!activePostId) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [activePostId]);

  useEffect(() => {
    if (!activePostId) return undefined;
    const rootEl = postViewBackdropRef.current || null;
    if (!rootEl) return undefined;

    const visibilityByVideo = new Map();
    const observedVideos = new Set();
    const pauseOthers = (keep) => {
      observedVideos.forEach((video) => {
        if (video === keep) return;
        try {
          video.pause();
        } catch {
          // ignore pause failures
        }
      });
    };

    const playMostVisible = () => {
      let bestVideo = null;
      let bestRatio = 0;
      observedVideos.forEach((video) => {
        const ratio = Number(visibilityByVideo.get(video) || 0);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestVideo = video;
        }
      });

      pauseOthers(bestVideo);
      if (!bestVideo || bestRatio < 0.6) return;
      try {
        const playAttempt = bestVideo.play();
        if (playAttempt?.catch) playAttempt.catch(() => {});
      } catch {
        // ignore autoplay failures
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibilityByVideo.set(entry.target, entry.intersectionRatio);
        });
        playMostVisible();
      },
      { root: rootEl, threshold: [0, 0.25, 0.5, 0.75, 0.9, 1] }
    );

    const syncObservedVideos = () => {
      const videos = rootEl.querySelectorAll("video.feed-media-view");
      videos.forEach((video) => {
        if (observedVideos.has(video)) return;
        observedVideos.add(video);
        visibilityByVideo.set(video, 0);
        observer.observe(video);
      });
    };

    syncObservedVideos();
    const syncTimer = setInterval(() => {
      syncObservedVideos();
      playMostVisible();
    }, 220);
    const rafId = requestAnimationFrame(playMostVisible);
    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(syncTimer);
      observer.disconnect();
      pauseOthers(null);
      observedVideos.clear();
      visibilityByVideo.clear();
    };
  }, [activePostId, viewerPosts]);

  useEffect(() => {
    return () => {
      Object.values(mediaClickTimerByPostRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      mediaClickTimerByPostRef.current = {};
    };
  }, []);

  const persistIdCollection = (key, map) => {
    const ids = Object.keys(map)
      .filter((id) => map[id])
      .map((id) => Number(id));
    localStorage.setItem(key, JSON.stringify(ids));
  };

  const appendToIdList = (key, postId) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
      if (!list.includes(Number(postId))) list.push(Number(postId));
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      localStorage.setItem(key, JSON.stringify([Number(postId)]));
    }
  };

  const showMenuStatus = (postId, text) => {
    setShareMessageByPost((prev) => ({ ...prev, [postId]: text }));
    setTimeout(() => {
      setShareMessageByPost((prev) => ({ ...prev, [postId]: "" }));
    }, 1200);
  };

  const onMenuAction = async (action, post) => {
    if (!post?.id) return;
    const ownerKey = ownerKeyFor(post);

    if (action === "share") {
      await sharePost(post);
    } else if (action === "playlist") {
      appendToIdList(PLAYLIST_KEY, post.id);
      showMenuStatus(post.id, "Saved to playlist");
    } else if (action === "not_interested") {
      setHiddenPostIds((prev) => {
        const next = { ...prev, [post.id]: true };
        persistIdCollection(HIDDEN_POSTS_KEY, next);
        return next;
      });
      showMenuStatus(post.id, "Hidden");
    } else if (action === "dont_recommend") {
      if (ownerKey) {
        setBlockedOwnerKeys((prev) => {
          const next = { ...prev, [ownerKey]: true };
          const keys = Object.keys(next).filter((k) => next[k]);
          localStorage.setItem(BLOCKED_OWNERS_KEY, JSON.stringify(keys));
          return next;
        });
        showMenuStatus(post.id, "Won't recommend this video");
      }
    } else if (action === "report") {
      try {
        await api.post("/api/report", {
          postId: post.id,
          reason: "Inappropriate content",
        });
        showMenuStatus(post.id, "Reported");
      } catch {
        showMenuStatus(post.id, "Report submitted");
      }
    } else if (action === "watch_later") {
      const wasSaved = !!watchLaterPostIds[post.id];
      toggleWatchLater(post.id);
      showMenuStatus(post.id, wasSaved ? "Removed from Watch Later" : "Saved to Watch Later");
    } else if (action === "play_next") {
      localStorage.setItem(PLAY_NEXT_KEY, String(post.id));
      showMenuStatus(post.id, "Set to play next");
    } else if (action === "queue") {
      appendToIdList(QUEUE_KEY, post.id);
      showMenuStatus(post.id, "Added to queue");
    }

    setMenuOpenPostId(null);
  };

  return (
    <div className="feed-page">
      <div className="feed-top-row">
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
      </div>

      {liveBroadcast && (
        <div className="live-share-banner" role="button" tabIndex={0} onClick={() => navigate("/live/start")}>
          <div className="live-share-left">
            <span className="live-share-dot" />
            <div>
              <p className="live-share-title">Live now</p>
              <p className="live-share-sub">
                {liveBroadcast.title || `${liveBroadcast.hostName || "Creator"} is live`} •{" "}
                {formatLiveElapsed(liveBroadcast.startedAt)}
              </p>
            </div>
          </div>
          <button type="button" className="live-share-btn">
            Watch Live
          </button>
        </div>
      )}

      {error && <p>{error}</p>}
      {!error && isLoading && <p className="feed-empty">Loading videos...</p>}
      {!error && !isLoading && visiblePosts.length === 0 && <p className="feed-empty">No posts found</p>}
      {!error && !isLoading && feedMode === "long" && !longVideoFeedPosts.length && (
        <p className="feed-empty">No long videos found</p>
      )}
      {!error && !isLoading && feedMode === "all" && !shortVideoPosts.length && (
        <p className="feed-empty">No short videos found</p>
      )}

      {!!longVideoFeedPosts.length && feedMode === "long" && (
        <section className="feed-yt-shell">
          <aside className="feed-yt-rail">
            {FEED_YT_RAIL_ITEMS.map((item, idx) => (
              <button key={item} type="button" className={`feed-yt-rail-item ${idx === 0 ? "is-active" : ""}`}>
                {item}
              </button>
            ))}
          </aside>

          <div className="feed-yt-main">
            <div className="feed-yt-categories">
              {FEED_YT_CATEGORIES.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`feed-yt-chip ${longCategory === chip ? "is-active" : ""}`}
                  onClick={() => setLongCategory(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="long-video-feed">
          {longVideoFeedPosts.map((post) => {
            const rawUrl = post.contentUrl || post.mediaUrl || "";
            const mediaUrl = rawUrl.trim() ? resolveUrl(rawUrl.trim()) : "";
            if (!mediaUrl) return null;
            const user = usernameFor(post);
            const profilePic = profilePicFor(post);
            const duration = videoDurationByPost[post.id] || 0;
            return (
              <article
                key={`long-${post.id}`}
                className="long-feed-card"
                onClick={() => navigate(`/watch/${post.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/watch/${post.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
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
                  <div className="long-feed-menu-wrap" ref={menuOpenPostId === post.id ? menuRef : null}>
                    <button
                      type="button"
                      className="long-feed-menu-btn"
                      aria-label="More options"
                      aria-expanded={menuOpenPostId === post.id}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpenPostId((prev) => (prev === post.id ? null : post.id));
                      }}
                    >
                      {"\u22EE"}
                    </button>
                    {menuOpenPostId === post.id && (
                      <div
                        className="long-feed-menu"
                        onPointerDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button type="button" onClick={() => onMenuAction("share", post)}>Share video</button>
                        <button type="button" onClick={() => onMenuAction("playlist", post)}>Save to playlist</button>
                        <button type="button" onClick={() => onMenuAction("not_interested", post)}>Not interested</button>
                        <button type="button" onClick={() => onMenuAction("dont_recommend", post)}>Don't recommend this video</button>
                        <button type="button" onClick={() => onMenuAction("report", post)}>Report</button>
                        <button type="button" onClick={() => onMenuAction("watch_later", post)}>Save to Watch Later</button>
                        <button type="button" onClick={() => onMenuAction("play_next", post)}>Play next</button>
                        <button type="button" onClick={() => onMenuAction("queue", post)}>In queue</button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
            </div>
          </div>
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
        <div className="post-view-backdrop" ref={postViewBackdropRef} onClick={closePostView}>
          <div className="post-view-stack" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="post-view-exit-btn" onClick={closePostView} aria-label="Close viewer">
              {"<"}
            </button>
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
                      <small>{usernameFor(post)} â€¢ Original audio</small>
                    </div>
                    <div className="ig-user-actions">
                      <button type="button" className="ig-follow-btn">Follow</button>
                    </div>
                  </header>

                  {mediaUrl && (
                    type === "VIDEO" ? (
                      <video
                        ref={(node) => setViewerVideoRef(post.id, node)}
                        src={mediaUrl}
                        loop
                        controls
                        playsInline
                        preload="metadata"
                        muted={mutedByPost[post.id] ?? true}
                        className="feed-media-view"
                        onClick={() => handleViewerMediaClick(post)}
                        onDoubleClick={(event) => {
                          void handleViewerMediaDoubleClick(post, event);
                        }}
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

