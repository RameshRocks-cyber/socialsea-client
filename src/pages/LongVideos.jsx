import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl } from "../api/baseUrl";
import { recordCommentActivity, recordSearchActivity, recordWatchHistory } from "../services/activityStore";
import { readLiveBroadcast, subscribeLiveBroadcast } from "../utils/liveBroadcast";
import "./LongVideos.css";

const LONG_VIDEO_SECONDS = 90;
const MIN_LONG_VIDEO_FALLBACK_SECONDS = 45;
const LONG_WATCH_CACHE_KEY = "socialsea_long_watch_cache_v1";
const FEED_CACHE_KEY = "socialsea_feed_cache_v1";
const FAST_REQUEST_TIMEOUT_MS = 2500;
const BACKGROUND_REQUEST_TIMEOUT_MS = 5000;
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

const WATCH_RAIL_ITEMS = ["Home", "Trending", "Subscriptions", "History", "Playlists", "Watch Later", "Liked Videos"];

const readCachedWatchPosts = () => {
  try {
    if (typeof window === "undefined") return [];
    const longRaw = localStorage.getItem(LONG_WATCH_CACHE_KEY);
    const longParsed = longRaw ? JSON.parse(longRaw) : null;
    const longList = Array.isArray(longParsed?.posts) ? longParsed.posts : Array.isArray(longParsed) ? longParsed : [];
    if (longList.length) return longList.filter(Boolean);

    const feedRaw = localStorage.getItem(FEED_CACHE_KEY);
    const feedParsed = feedRaw ? JSON.parse(feedRaw) : null;
    const feedList = Array.isArray(feedParsed?.posts) ? feedParsed.posts : Array.isArray(feedParsed) ? feedParsed : [];
    return feedList.filter(Boolean);
  } catch {
    return [];
  }
};

export default function LongVideos() {
  const { postId } = useParams();
  const isWatchMode = Boolean(postId);
  const navigate = useNavigate();
  const [liveBroadcast, setLiveBroadcast] = useState(() => readLiveBroadcast());
  const playerRef = useRef(null);
  const playerWrapRef = useRef(null);
  const pinchRef = useRef({
    active: false,
    startDistance: 0,
    startScale: 1,
    startMidX: 0,
    startMidY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    panActive: false,
    panStartX: 0,
    panStartY: 0,
    panStartOffsetX: 0,
    panStartOffsetY: 0
  });
  const gestureRef = useRef({
    active: false,
    mode: "",
    startX: 0,
    startY: 0,
    startValue: 0,
    pointerId: null,
    startedAt: 0
  });
  const lastTapRef = useRef({ at: 0, x: 0, y: 0 });
  const seekHudRef = useRef({ direction: "", totalSeconds: 0, lastAt: 0, targetTime: 0 });
  const gestureHudTimerRef = useRef(0);
  const controlsHideTimerRef = useRef(0);
  const [allPosts, setAllPosts] = useState(() => readCachedWatchPosts());
  const [videoDurationByPost, setVideoDurationByPost] = useState({});
  const [isLoading, setIsLoading] = useState(() => readCachedWatchPosts().length === 0);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isSettingsAdjusting, setIsSettingsAdjusting] = useState(false);
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
  const [gestureHud, setGestureHud] = useState({ text: "", position: "bottom" });
  const [isPlayerPaused, setIsPlayerPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [isPlayerMinimized, setIsPlayerMinimized] = useState(false);
  const [isPlayerInPip, setIsPlayerInPip] = useState(false);
  const [isPipSupported, setIsPipSupported] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [playerBufferedUntil, setPlayerBufferedUntil] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [playerZoom, setPlayerZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [playerZoomMode, setPlayerZoomMode] = useState("fit");
  const [playerVolume, setPlayerVolume] = useState(1);
  const swipeRef = useRef({
    tracking: false,
    active: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0
  });

  useEffect(() => {
    const unsubscribe = subscribeLiveBroadcast((next) => setLiveBroadcast(next));
    return () => unsubscribe();
  }, []);

  const toList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];

    const arrayKeys = ["content", "items", "data", "posts", "results", "rows", "list", "reels", "videos"];
    for (const key of arrayKeys) {
      if (Array.isArray(payload?.[key])) return payload[key];
    }

    if (payload?.post && typeof payload.post === "object" && !Array.isArray(payload.post)) return [payload.post];
    if (payload?.item && typeof payload.item === "object" && !Array.isArray(payload.item)) return [payload.item];

    if (payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
      const nested = toList(payload.data);
      if (nested.length) return nested;
    }

    if (payload?.id && (payload?.contentUrl || payload?.mediaUrl || payload?.videoUrl || payload?.url)) return [payload];

    const arrayValues = Object.values(payload).filter((value) => Array.isArray(value));
    if (arrayValues.length === 1) return arrayValues[0];
    if (arrayValues.length > 1) return arrayValues.flat();

    const objectValues = Object.values(payload).filter(
      (value) => value && typeof value === "object" && !Array.isArray(value)
    );
    if (
      objectValues.length &&
      objectValues.every(
        (value) => value?.id != null || value?.contentUrl || value?.mediaUrl || value?.videoUrl || value?.url
      )
    ) {
      return objectValues;
    }

    return [];
  };

  const getTotalPages = (payload) => {
    const candidates = [
      payload?.totalPages,
      payload?.page?.totalPages,
      payload?.pagination?.totalPages
    ];
    for (const raw of candidates) {
      const n = Number(raw);    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return 0;
  };

  const hasNextPage = (payload) => {
    const candidates = [payload?.hasNext, payload?.page?.hasNext, payload?.pagination?.hasNext];
    return candidates.some((v) => v === true);
  };

  const buildBaseCandidates = () => {
    const storedBase =
      typeof window !== "undefined"
        ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
        : "";
    const origin = typeof window !== "undefined" ? String(window.location.origin || "").trim() : "";
    const apiBase = String(getApiBaseUrl() || "").trim();
    const envBase = String(import.meta.env.VITE_API_URL || "").trim();
    const toHost = (value) => {
      if (!value || !/^https?:\/\//i.test(value)) return "";
      try {
        return new URL(value).hostname.toLowerCase();
      } catch {
        return "";
      }
    };
    const originHost = toHost(origin);
    const apiHost = toHost(apiBase || envBase);
    const preferSameOrigin =
      !apiBase ||
      apiBase.startsWith("/") ||
      (apiHost && originHost && apiHost === originHost);

    const candidates = [
      String(api.defaults.baseURL || "").trim(),
      apiBase,
      String(storedBase || "").trim(),
      envBase,
      preferSameOrigin ? "/api" : "",
      preferSameOrigin ? origin : ""
    ].filter(Boolean);

    if (!candidates.length) return [undefined];
    return [...new Set(candidates)];
  };

  const fetchEndpointItems = async (url, baseURL, opts = {}) => {
    const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : BACKGROUND_REQUEST_TIMEOUT_MS;
    const maxPages = Math.max(1, Number(opts.maxPages) || 1);
    const first = await api.request({
      method: "GET",
      url,
      baseURL: baseURL || undefined,
      timeout: timeoutMs,
      suppressAuthRedirect: true,
      params: { page: 0, size: 180 }
    });
    const firstPayload = first?.data;
    const looksLikeHtml =
      typeof firstPayload === "string" && (/^\s*<!doctype html/i.test(firstPayload) || /<html[\s>]/i.test(firstPayload));
    if (looksLikeHtml) throw new Error("Received HTML instead of API JSON");
    let merged = toList(firstPayload);

    const totalPages = getTotalPages(firstPayload);    if (totalPages > 1 && maxPages > 1) {
      const pageRequests = [];
      for (let page = 1; page < totalPages && page < maxPages; page += 1) {
        pageRequests.push(
          api.request({
            method: "GET",
            url,
            baseURL: baseURL || undefined,
            timeout: timeoutMs,
            suppressAuthRedirect: true,
            params: { page, size: 120 }
          })
        );
      }
      const rest = await Promise.allSettled(pageRequests);
      rest.forEach((result) => {    if (result.status === "fulfilled") {
          merged = merged.concat(toList(result.value?.data));
        }
      });
      return merged;
    }

    // Some APIs expose hasNext without totalPages.
    if (hasNextPage(firstPayload) && maxPages > 1) {
      let page = 1;
      let safety = 0;
      while (safety < Math.max(1, maxPages - 1)) {
        const next = await api.request({
          method: "GET",
          url,
          baseURL: baseURL || undefined,
          timeout: timeoutMs,
          suppressAuthRedirect: true,
          params: { page, size: 120 }
        });
        const nextItems = toList(next?.data);    if (!nextItems.length) break;
        merged = merged.concat(nextItems);    if (!hasNextPage(next?.data)) break;
        page += 1;
        safety += 1;
      }
    }

    return merged;
  };

  const resolveUrl = (url) => {    if (!url) return "";    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };
  const readIdMap = (key) => {
    try {
      const raw = localStorage.getItem(key);    if (!raw) return {};
      const ids = JSON.parse(raw);    if (!Array.isArray(ids)) return {};
      return ids.reduce((acc, id) => ({ ...acc, [Number(id)]: true }), {});
    } catch {
      return {};
    }
  };

  const readNumberMap = (key) => {
    try {
      const raw = localStorage.getItem(key);    if (!raw) return {};
      const parsed = JSON.parse(raw);    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const next = {};
      Object.keys(parsed).forEach((k) => {
        const n = Number(parsed[k]);    if (Number.isFinite(n) && n >= 0) next[k] = n;
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

  const mediaUrlFor = (post) =>
    String(
      post?.contentUrl ||
        post?.mediaUrl ||
        post?.videoUrl ||
        post?.url ||
        post?.fileUrl ||
        post?.media?.url ||
        post?.media?.contentUrl ||
        ""
    ).trim();
  const isVideoPost = (post) => {
    const rawType = String(post?.type || post?.mediaType || post?.contentType || post?.mimeType || "")
      .trim()
      .toLowerCase();    if (rawType.includes("video")) return true;    if (rawType.includes("reel") || rawType.includes("short")) return true;    if (rawType.includes("image")) return false;
    if (post?.reel === true || post?.reel === "true") return true;
    if (post?.isReel === true || post?.isReel === "true") return true;
    if (post?.isShort === true || post?.isShortVideo === true || post?.shortVideo === true) return true;
    const url = mediaUrlFor(post).toLowerCase();
    return /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/.test(url);
  };

  const parseDurationLikeValue = (raw) => {    if (raw == null) return 0;    if (typeof raw === "number") {    if (!Number.isFinite(raw) || raw <= 0) return 0;
      // Some APIs send milliseconds.
      return raw > 10000 ? raw / 1000 : raw;
    }

    const str = String(raw).trim();    if (!str) return 0;

    const asNum = Number(str);    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum > 10000 ? asNum / 1000 : asNum;
    }

    // Handle "HH:MM:SS" or "MM:SS"
    if (str.includes(":")) {
      const parts = str.split(":").map((x) => Number(x));    if (parts.every((n) => Number.isFinite(n) && n >= 0)) {    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];    if (parts.length === 2) return parts[0] * 60 + parts[1];
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
      const n = parseDurationLikeValue(raw);    if (Number.isFinite(n) && n > 0) return n;
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
    const first = await readVideoDurationOnce(videoUrl);    if (first > 0) return first;
    // Retry once with a cache-buster because some CDNs fail metadata occasionally.
    const separator = videoUrl.includes("?") ? "&" : "?";
    return readVideoDurationOnce(`${videoUrl}${separator}metaRetry=1`);
  };

  useEffect(() => {
    let cancelled = false;

    const fetchAny = async (endpoints) => {
      const bases = buildBaseCandidates();
      let fallbackList = [];

       // Fast path: try primary base in parallel across endpoints, first page only.
      const primaryBase = bases[0];
      if (primaryBase !== undefined) {
        const quick = await Promise.allSettled(
          endpoints.map((url) =>
            fetchEndpointItems(url, primaryBase, {
              timeoutMs: FAST_REQUEST_TIMEOUT_MS,
              maxPages: 1
            })
          )
        );
        const quickLists = quick
          .filter((r) => r.status === "fulfilled")
          .map((r) => (Array.isArray(r.value) ? r.value : []));
        const quickNonEmpty = quickLists.find((list) => list.length > 0);
        if (quickNonEmpty) return quickNonEmpty;
        if (quickLists.length) fallbackList = quickLists[0] || [];
      }

      for (const baseURL of bases) {
        for (const url of endpoints) {
          try {
            const list = await fetchEndpointItems(url, baseURL, {
              timeoutMs: BACKGROUND_REQUEST_TIMEOUT_MS,
              maxPages: 2
            });
            if (!fallbackList.length && Array.isArray(list)) fallbackList = list;
            if (Array.isArray(list) && list.length) return list;
          } catch {
            // try next base/endpoint
          }
        }
      }
      return Array.isArray(fallbackList) ? fallbackList : [];
    };

    const fetchOne = async (endpoints) => {
      const bases = buildBaseCandidates();
      const primaryBase = bases[0];

      if (primaryBase !== undefined) {
        const quick = await Promise.allSettled(
          endpoints.map((url) =>
            api.request({
              method: "GET",
              url,
              baseURL: primaryBase || undefined,
              timeout: FAST_REQUEST_TIMEOUT_MS,
              suppressAuthRedirect: true
            })
          )
        );
        for (const result of quick) {
          if (result.status !== "fulfilled") continue;
          const body = result.value?.data;
          const looksLikeHtml =
            typeof body === "string" && (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body));
          if (looksLikeHtml) continue;
          const list = toList(body);
          if (Array.isArray(list) && list.length) return list[0];
          const single = body?.post || body?.item || body?.data || body;
          if (single && typeof single === "object" && !Array.isArray(single)) return single;
        }
      }

      for (const baseURL of bases) {
        for (const url of endpoints) {
          try {
            const res = await api.request({
              method: "GET",
              url,
              baseURL: baseURL || undefined,
              timeout: BACKGROUND_REQUEST_TIMEOUT_MS,
              suppressAuthRedirect: true
            });
            const body = res?.data;
            const looksLikeHtml =
              typeof body === "string" && (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body));
            if (looksLikeHtml) continue;
            const list = toList(body);
            if (Array.isArray(list) && list.length) return list[0];
            const single = body?.post || body?.item || body?.data || body;
            if (single && typeof single === "object" && !Array.isArray(single)) return single;
          } catch {
            // try next base/endpoint
          }
        }
      }
      return null;
    };

    const load = async () => {
      const cached = readCachedWatchPosts();
      const hasCached = cached.length > 0;
      if (hasCached) setAllPosts(cached);
      setIsLoading(!hasCached);
      try {
        const [fromFeed, fromReels, fromMe, fromProfile] = await Promise.all([
          fetchAny(["/api/feed"]),
          fetchAny(["/api/reels"]),
          fetchAny(["/api/profile/me/posts"]),
          fetchAny(["/api/profile/posts"])
        ]);
        let posts = [...fromFeed, ...fromReels, ...fromMe, ...fromProfile].filter(Boolean);

        if (postId) {
          const direct = await fetchOne([
            `/api/feed/${encodeURIComponent(postId)}`
          ]);
          if (direct) posts = [direct, ...posts];
        }

        if (!posts.length) {
          console.warn("[LongVideos] No posts returned from API candidates");
        }

        if (cancelled) return;
        const normalizedPosts = uniqueByPostKey(posts);
        setAllPosts(normalizedPosts);
        try {
          localStorage.setItem(
            LONG_WATCH_CACHE_KEY,
            JSON.stringify({ updatedAt: Date.now(), posts: normalizedPosts.slice(0, 320) })
          );
        } catch {
          // ignore cache write issues
        }

        const candidates = uniqueByPostKey(normalizedPosts.filter((post) => !!mediaUrlFor(post)));
        const knownDurations = {};

        const unresolved = [];
        candidates.forEach((post) => {
          const known = durationFromPost(post);    if (known > 0) {
            knownDurations[post.id] = known;
          } else {
            unresolved.push(post);
          }
        });

        setVideoDurationByPost(knownDurations);
        setIsLoading(false);

        const MAX_METADATA_PROBES = 24;
        const unresolvedSlice = unresolved.slice(0, MAX_METADATA_PROBES);
        if (!unresolvedSlice.length) return;

        const measuredDurations = {};
        const BATCH_SIZE = 4;
        for (let i = 0; i < unresolvedSlice.length; i += BATCH_SIZE) {
          const batch = unresolvedSlice.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (post) => {
              const mediaUrl = resolveUrl(mediaUrlFor(post));    if (!mediaUrl) return;
              const d = await readVideoDuration(mediaUrl);    if (d > 0) measuredDurations[post.id] = d;
            })
          );    if (cancelled) return;
        }
        if (!cancelled && Object.keys(measuredDurations).length) {
          setVideoDurationByPost((prev) => ({ ...prev, ...measuredDurations }));
        }
      } catch {    if (!cancelled) {
          const cached = readCachedWatchPosts();
          setAllPosts(cached);
          setVideoDurationByPost({});
          setIsLoading(false);    if (!cached.length) {
            console.warn("[LongVideos] load failed and no local cache available");
          }
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    const liked = readIdMap("likedPostIds");
    const disliked = readIdMap("dislikedPostIds");
    const normalizedLiked = { ...liked };
    Object.keys(disliked).forEach((id) => {    if (disliked[id]) normalizedLiked[id] = false;
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
      const key = String(post?.id ?? post?.contentUrl ?? post?.mediaUrl ?? "");    if (!key || seen.has(key)) return false;
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

  const watchableVideos = useMemo(() => {
    const fallbackNonImage = uniqueByPostKey(
      allPosts.filter((post) => {
        const mediaUrl = mediaUrlFor(post).toLowerCase();
        if (!mediaUrl) return false;
        const rawType = String(post?.type || post?.mediaType || post?.contentType || post?.mimeType || "")
          .trim()
          .toLowerCase();
        if (rawType.includes("image")) return false;
        if (/\.(png|jpe?g|gif|webp|bmp|avif|svg|heic|heif)(\?|#|$)/.test(mediaUrl)) return false;
        return true;
      })
    );
    const baseList = longVideos.length ? longVideos : videoPosts.length ? videoPosts : fallbackNonImage;
    const routePostCandidate = allPosts.find(
      (post) => String(post?.id ?? "") === String(postId ?? "") && !!mediaUrlFor(post)
    );
    if (routePostCandidate) return uniqueByPostKey([routePostCandidate, ...baseList]);
    return baseList;
  }, [longVideos, videoPosts, allPosts, postId]);

  useEffect(() => {
    if (isLoading && watchableVideos.length) {
      setIsLoading(false);
    }
  }, [isLoading, watchableVideos.length]);

  useEffect(() => {    if (!watchableVideos.length) return;
    watchableVideos.forEach((post) => {
      api.get(`/api/likes/${post.id}/count`)
        .then((res) => {
          const count = Number(res?.data) || 0;
          setLikeCounts((prev) => ({ ...prev, [post.id]: count }));
        })
        .catch(() => {});
    });
  }, [watchableVideos]);

  const filteredLongVideos = useMemo(() => {
    const q = String(searchText || "").trim().toLowerCase();
    return watchableVideos.filter((post) => {
      const owner = usernameFor(post).toLowerCase();
      const title = captionFor(post).toLowerCase();
      const categoryMatch =
        activeCategory === "All" ||
        title.includes(activeCategory.toLowerCase()) ||
        owner.includes(activeCategory.toLowerCase());    if (!categoryMatch) return false;    if (!q) return true;
      return owner.includes(q) || title.includes(q);
    });
  }, [watchableVideos, searchText, activeCategory]);

  const activeVideo =
    watchableVideos.find((p) => String(p.id) === String(postId)) || filteredLongVideos[0] || watchableVideos[0] || null;
  const watchSequence = filteredLongVideos.length ? filteredLongVideos : watchableVideos;
  const activeVideoIndex = watchSequence.findIndex((p) => String(p.id) === String(activeVideo?.id));

  const withCloudinaryQuality = (url, quality) => {    if (!url || quality === "auto") return url;    if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
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
    const url = resolveUrl(mediaUrlFor(activeVideo));
    return withCloudinaryQuality(url, "auto");
  }, [activeVideo]);

  useEffect(() => {
    if (!activeVideo?.id) return;
    recordWatchHistory({ item: activeVideo, source: "watch" });
  }, [activeVideo?.id]);

  useEffect(() => {    if (!activeVideo?.id) return;
    api.get(`/api/comments/${activeVideo.id}`)
      .then((res) => {
        setCommentsByPost((prev) => ({
          ...prev,
          [activeVideo.id]: Array.isArray(res?.data) ? res.data : []
        }));
      })
      .catch(() => {});
  }, [activeVideo?.id]);

  useEffect(() => {
    const text = String(searchText || "").trim();
    if (text.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      recordSearchActivity({ query: text, source: "watch" });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const toggleLike = async (postId) => {    if (!postId) return;
    const wasLiked = Boolean(likedPostIds[postId]);
    const wasDisliked = Boolean(dislikedPostIds[postId]);

    setDislikedPostIds((prev) => {    if (!prev[postId]) return prev;
      const next = { ...prev, [postId]: false };
      persistIdMap("dislikedPostIds", next);
      return next;
    });    if (wasDisliked) {
      setDislikeCounts((prev) => {
        const next = { ...prev, [postId]: Math.max(0, (Number(prev[postId]) || 0) - 1) };
        localStorage.setItem("dislikeCountsByPost", JSON.stringify(next));
        return next;
      });
    }    if (wasLiked) {
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

  const toggleDislike = async (postId) => {    if (!postId) return;
    const wasLiked = Boolean(likedPostIds[postId]);
    const wasDisliked = Boolean(dislikedPostIds[postId]);

    setLikedPostIds((prev) => {    if (!prev[postId]) return prev;
      const next = { ...prev, [postId]: false };
      persistIdMap("likedPostIds", next);
      return next;
    });    if (wasLiked) {
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
    const text = String(commentTextByPost[postId] || "").trim();    if (!text) return;
    const post = watchableVideos.find((item) => String(item?.id) === String(postId));
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
      recordCommentActivity({ postId, text, item: post, source: "watch" });
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
    const raw = String(value || "").trim();    if (!raw) return "User";
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
    const s = total % 60;    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const formatCompact = (value) => {
    const n = Number(value) || 0;    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return `${n}`;
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

  const relativeFrom = (value) => {    if (!value) return "recently";
    const d = new Date(value);    if (!Number.isFinite(d.getTime())) return "recently";
    const diffMs = Date.now() - d.getTime();
    const minutes = Math.max(1, Math.floor(diffMs / 60000));    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);    if (days < 30) return `${days} day ago`;
    const months = Math.floor(days / 30);    if (months < 12) return `${months} month ago`;
    return `${Math.floor(months / 12)} year ago`;
  };

  const selectVideo = (id) => {    if (!id) return;
    navigate(`/watch/${id}`);
  };

  const showGestureHud = (text, position = "bottom", timeoutMs = 650) => {
    setGestureHud({ text, position });    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = window.setTimeout(() => setGestureHud({ text: "", position: "bottom" }), timeoutMs);
  };

  const applyPlayerZoomMode = (mode) => {
    if (mode === "fit") {
      setPlayerZoom({ scale: 1, x: 0, y: 0 });
      setPlayerZoomMode("fit");
      showGestureHud("Fit");
      return;
    }
    if (mode === "fill") {
      setPlayerZoom({ scale: 1, x: 0, y: 0 });
      setPlayerZoomMode("fill");
      showGestureHud("Fill");
      return;
    }
    setPlayerZoom({ scale: 1.35, x: 0, y: 0 });
    setPlayerZoomMode("zoom");
    showGestureHud("Zoom");
  };

  const cyclePlayerZoomMode = () => {
    if (playerZoomMode === "fit") {
      applyPlayerZoomMode("fill");
    } else if (playerZoomMode === "fill") {
      applyPlayerZoomMode("zoom");
    } else {
      applyPlayerZoomMode("fit");
    }
  };

  const changeVideoByOffset = (offset) => {
    const primary = watchSequence.length > 1 ? watchSequence : watchableVideos;    if (!primary.length) return;
    const currentId = String(activeVideo?.id || "");
    const idx = primary.findIndex((p) => String(p?.id) === currentId);
    const currentIndex = idx >= 0 ? idx : 0;
    const nextIndex = (currentIndex + offset + primary.length) % primary.length;
    const next = primary[nextIndex];    if (next?.id != null) selectVideo(next.id);
  };

  const togglePlayPause = () => {
    const video = playerRef.current;    if (!video) return;    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const syncPlayerTime = () => {
    const video = playerRef.current;    if (!video) return;
    const duration = Number(video.duration) || 0;    if (duration > 0) setPlayerDuration(duration);
    let bufferedUntil = 0;
    try {
      const ranges = video.buffered;    if (ranges && ranges.length > 0) {
        bufferedUntil = Number(ranges.end(ranges.length - 1)) || 0;
      }
    } catch {
      bufferedUntil = 0;
    }    if (duration > 0) {
      setPlayerBufferedUntil(Math.min(duration, bufferedUntil));
    } else {
      setPlayerBufferedUntil(bufferedUntil);
    }    if (!isSeeking) setPlayerCurrentTime(Number(video.currentTime) || 0);
  };

  const handleSeekTo = (rawValue) => {
    const next = Math.max(0, Number(rawValue) || 0);
    setPlayerCurrentTime(next);
    const video = playerRef.current;    if (!video) return;
    video.currentTime = next;
  };

  const handleDoubleTapSeek = (clientX) => {
    const video = playerRef.current;
    const wrap = playerWrapRef.current;
    if (!video || !wrap) return false;

    const rect = wrap.getBoundingClientRect();
    const leftZoneEdge = rect.left + rect.width * 0.34;
    const rightZoneEdge = rect.left + rect.width * 0.66;

    let deltaSeconds = 0;
    let direction = "";
    let hudPosition = "bottom";

    if (clientX <= leftZoneEdge) {
      deltaSeconds = -10;
      direction = "left";
      hudPosition = "side-left";
    } else if (clientX >= rightZoneEdge) {
      deltaSeconds = 10;
      direction = "right";
      hudPosition = "side-right";
    } else {
      return false;
    }

    const now = Date.now();
    const duration = Number(video.duration) || 0;
    const currentTime = Number(video.currentTime) || 0;
    const canStack = seekHudRef.current.direction === direction && now - seekHudRef.current.lastAt < 850;
    const baseTime = canStack ? Number(seekHudRef.current.targetTime || currentTime) : currentTime;
    const nextTime = clamp(baseTime + deltaSeconds, 0, duration > 0 ? duration : Number.MAX_SAFE_INTEGER);
    const totalSeconds = canStack ? seekHudRef.current.totalSeconds + 10 : 10;

    video.currentTime = nextTime;
    setPlayerCurrentTime(nextTime);
    if (duration > 0) setPlayerDuration(duration);
    seekHudRef.current = { direction, totalSeconds, lastAt: now, targetTime: nextTime };
    showPlayerControls(true);
    showGestureHud(`${direction === "left" ? "-" : "+"}${totalSeconds}s`, hudPosition, 780);

    window.requestAnimationFrame(() => {
      syncPlayerTime();
    });

    return true;
  };

  const handleVolumeChange = (rawValue) => {
    const next = clamp((Number(rawValue) || 0) / 100, 0, 1);
    const video = playerRef.current;
    if (video) {
      video.volume = next;
      video.muted = next <= 0;
    }
    setPlayerVolume(next);
  };

  const clearControlsHideTimer = () => {
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = 0;
    }
  };

  const startSettingsAdjust = () => {
    setIsSettingsAdjusting(true);
    setControlsVisible(true);
    clearControlsHideTimer();
  };

  const stopSettingsAdjust = () => {
    setIsSettingsAdjusting(false);
  };

  const showPlayerControls = (autoHide = true) => {
    setControlsVisible(true);
    clearControlsHideTimer();
    if (!autoHide || isPlayerPaused || isPlayerFullscreen || showQualityMenu || isSettingsAdjusting) return;
    controlsHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsHideTimerRef.current = 0;
    }, 3000);
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const getTouchDistance = (touchA, touchB) => {
    const dx = Number(touchA?.clientX || 0) - Number(touchB?.clientX || 0);
    const dy = Number(touchA?.clientY || 0) - Number(touchB?.clientY || 0);
    return Math.hypot(dx, dy);
  };

  const getTouchMidpoint = (touchA, touchB) => ({
    x: (Number(touchA?.clientX || 0) + Number(touchB?.clientX || 0)) / 2,
    y: (Number(touchA?.clientY || 0) + Number(touchB?.clientY || 0)) / 2
  });

  const clampZoomOffset = (nextScale, nextX, nextY) => {
    const wrap = playerWrapRef.current;    if (!wrap || nextScale <= 1.0001) {
      return { scale: 1, x: 0, y: 0 };
    }
    const rect = wrap.getBoundingClientRect();
    const maxX = Math.max(0, ((nextScale - 1) * rect.width) / 2);
    const maxY = Math.max(0, ((nextScale - 1) * rect.height) / 2);
    return {
      scale: nextScale,
      x: clamp(nextX, -maxX, maxX),
      y: clamp(nextY, -maxY, maxY)
    };
  };

  const enterPlayerFullscreen = async () => {
    const wrap = playerWrapRef.current;    if (!wrap || document.fullscreenElement === wrap) return;
    try {
      await wrap.requestFullscreen();
    } catch {
      // no-op
    }
  };

  const exitPlayerFullscreen = async () => {
    const wrap = playerWrapRef.current;    if (!document.fullscreenElement) return;    if (!wrap || document.fullscreenElement !== wrap) return;
    try {
      await document.exitFullscreen();
    } catch {
      // no-op
    }
  };

  const togglePlayerFullscreen = async () => {
    const wrap = playerWrapRef.current;    if (!wrap) return;    if (document.fullscreenElement === wrap) {
      await exitPlayerFullscreen();
    } else {
      await enterPlayerFullscreen();
    }
  };

  const requestPlayerPictureInPicture = async () => {
    const video = playerRef.current;
    if (!video) return false;
    if (!("pictureInPictureEnabled" in document) || !document.pictureInPictureEnabled) return false;
    if (typeof video.requestPictureInPicture !== "function") return false;
    try {
      if (document.pictureInPictureElement && document.pictureInPictureElement !== video) {
        await document.exitPictureInPicture();
      }
      if (document.pictureInPictureElement === video) return true;
      await video.requestPictureInPicture();
      setIsPlayerInPip(true);
      setIsPlayerMinimized(false);
      return true;
    } catch {
      return false;
    }
  };

  const handlePlayerPointerDown = (event) => {
    if (event.pointerType === "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pinchRef.current.active || pinchRef.current.panActive) return;    if (
      event.target?.closest?.(".watch-overlay-controls") ||
      event.target?.closest?.(".watch-corner-fullscreen") ||
      event.target?.closest?.(".watch-quality-btn") ||
      event.target?.closest?.(".watch-quality-menu") ||
      event.target?.closest?.(".watch-progress-wrap")
    ) return;
    showPlayerControls(true);
    const wrap = playerWrapRef.current;    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    // Ignore the native control row area to avoid conflicts with browser controls.
    if (event.clientY > rect.bottom - 72) return;
    const centerZoneLeft = rect.left + rect.width * 0.25;
    const centerZoneRight = rect.left + rect.width * 0.75;
    const mode =
      event.clientX >= centerZoneLeft && event.clientX <= centerZoneRight
        ? "fullscreen"
        : event.clientX - rect.left < rect.width / 2
          ? "volume"
          : "brightness";
    const video = playerRef.current;
    const startValue =
      mode === "volume" ? Number(video?.volume ?? 1) : mode === "brightness" ? Number(playerBrightness || 1) : 0;
    gestureRef.current = {
      active: true,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startValue,
      pointerId: event.pointerId,
      startedAt: Date.now()
    };    if (wrap.setPointerCapture) {
      try {
        wrap.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    }
  };

  const handlePlayerPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    if (pinchRef.current.active || pinchRef.current.panActive) return;    if (
      event.target?.closest?.(".watch-overlay-controls") ||
      event.target?.closest?.(".watch-corner-fullscreen") ||
      event.target?.closest?.(".watch-quality-btn") ||
      event.target?.closest?.(".watch-quality-menu") ||
      event.target?.closest?.(".watch-progress-wrap")
    ) return;
    showPlayerControls(true);    const meta = gestureRef.current;
    const wrap = playerWrapRef.current;    if (!meta.active || !wrap) return;    if (meta.pointerId != null && event.pointerId !== meta.pointerId) return;

    const rect = wrap.getBoundingClientRect();
    const deltaRatio = (meta.startY - event.clientY) / Math.max(1, rect.height);    if (meta.mode === "fullscreen") {
      return;
    }    if (meta.mode === "volume") {
      const nextVolume = clamp(meta.startValue + deltaRatio * 1.3, 0, 1);    if (playerRef.current) playerRef.current.volume = nextVolume;
      showGestureHud(`Volume ${Math.round(nextVolume * 100)}%`);
    } else if (meta.mode === "brightness") {
      // Browser cannot control device screen brightness; apply video brightness filter instead.
      const nextBrightness = clamp(meta.startValue + deltaRatio * 1.1, 0.5, 1.7);
      setPlayerBrightness(nextBrightness);
      showGestureHud(`Brightness ${Math.round(nextBrightness * 100)}%`);
    }
  };

  const handlePlayerPointerUp = (event) => {
    if (event.pointerType === "touch") return;
    if (pinchRef.current.active || pinchRef.current.panActive) return;    if (
      event.target?.closest?.(".watch-overlay-controls") ||
      event.target?.closest?.(".watch-corner-fullscreen") ||
      event.target?.closest?.(".watch-quality-btn") ||
      event.target?.closest?.(".watch-quality-menu") ||
      event.target?.closest?.(".watch-progress-wrap")
    ) return;    const meta = gestureRef.current;
    const wrap = playerWrapRef.current;
    const dy = event.clientY - (meta.startY || event.clientY);
    const dx = event.clientX - (meta.startX || event.clientX);
    const elapsedMs = Date.now() - (meta.startedAt || Date.now());
    const isTap = Math.abs(dx) < 16 && Math.abs(dy) < 16 && elapsedMs < 280;
    const isFullscreenSwipe = meta.mode === "fullscreen" && Math.abs(dy) > 110 && Math.abs(dx) < 60;    if (isFullscreenSwipe) {    if (dy < 0 && !isPlayerFullscreen) {
        enterPlayerFullscreen();
      } else if (dy > 0 && isPlayerFullscreen) {
        exitPlayerFullscreen();
      }
    } else if (isTap) {
      const prev = lastTapRef.current;    if (
        prev.at > 0 &&
        Date.now() - prev.at < 300 &&
        Math.abs(event.clientX - prev.x) < 28 &&
        Math.abs(event.clientY - prev.y) < 28
      ) {
        handleDoubleTapSeek(event.clientX);
        lastTapRef.current = { at: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { at: Date.now(), x: event.clientX, y: event.clientY };
      }
    }    if (wrap?.releasePointerCapture && gestureRef.current.pointerId != null) {
      try {
        wrap.releasePointerCapture(gestureRef.current.pointerId);
      } catch {
        // no-op
      }
    }
    gestureRef.current = {
      active: false,
      mode: "",
      startX: 0,
      startY: 0,
      startValue: 0,
      pointerId: null,
      startedAt: 0
    };    if (event?.cancelable) event.preventDefault();
  };

  const handlePlayerTouchStart = (event) => {
    showPlayerControls(true);
    const touches = event.touches;
    if (!touches) return;

    swipeRef.current.tracking = false;
    swipeRef.current.active = false;

    if (touches.length >= 2) {
      const a = touches[0];
      const b = touches[1];
      const midpoint = getTouchMidpoint(a, b);
      pinchRef.current.active = true;
      pinchRef.current.panActive = false;
      pinchRef.current.startDistance = Math.max(1, getTouchDistance(a, b));
      pinchRef.current.startScale = Number(playerZoom.scale || 1);
      pinchRef.current.startMidX = midpoint.x;
      pinchRef.current.startMidY = midpoint.y;
      pinchRef.current.startOffsetX = Number(playerZoom.x || 0);
      pinchRef.current.startOffsetY = Number(playerZoom.y || 0);
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (touches.length === 1 && Number(playerZoom.scale || 1) > 1.0001) {
      pinchRef.current.panActive = true;
      pinchRef.current.active = false;
      pinchRef.current.panStartX = Number(touches[0].clientX || 0);
      pinchRef.current.panStartY = Number(touches[0].clientY || 0);
      pinchRef.current.panStartOffsetX = Number(playerZoom.x || 0);
      pinchRef.current.panStartOffsetY = Number(playerZoom.y || 0);
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (touches.length === 1) {
      const touch = touches[0];
      swipeRef.current.tracking = true;
      swipeRef.current.active = false;
      swipeRef.current.startX = Number(touch.clientX || 0);
      swipeRef.current.startY = Number(touch.clientY || 0);
      swipeRef.current.lastX = Number(touch.clientX || 0);
      swipeRef.current.lastY = Number(touch.clientY || 0);
    }
  };

  const handlePlayerTouchMove = (event) => {
    const touches = event.touches;
    if (!touches) return;

    if (pinchRef.current.active && touches.length >= 2) {
      const a = touches[0];
      const b = touches[1];
      const distance = Math.max(1, getTouchDistance(a, b));
      const midpoint = getTouchMidpoint(a, b);
      const nextScale = clamp((pinchRef.current.startScale || 1) * (distance / pinchRef.current.startDistance), 1, 3);
      const deltaX = midpoint.x - pinchRef.current.startMidX;
      const deltaY = midpoint.y - pinchRef.current.startMidY;
      const clamped = clampZoomOffset(
        nextScale,
        (pinchRef.current.startOffsetX || 0) + deltaX,
        (pinchRef.current.startOffsetY || 0) + deltaY
      );
      setPlayerZoom(clamped);
      if (clamped.scale > 1.02) {
        setPlayerZoomMode((prev) => (prev === "zoom" ? prev : "zoom"));
      }
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (pinchRef.current.panActive && touches.length === 1 && Number(playerZoom.scale || 1) > 1.0001) {
      const touch = touches[0];
      const deltaX = Number(touch.clientX || 0) - (pinchRef.current.panStartX || 0);
      const deltaY = Number(touch.clientY || 0) - (pinchRef.current.panStartY || 0);
      const clamped = clampZoomOffset(
        Number(playerZoom.scale || 1),
        (pinchRef.current.panStartOffsetX || 0) + deltaX,
        (pinchRef.current.panStartOffsetY || 0) + deltaY
      );
      setPlayerZoom(clamped);
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (swipeRef.current.tracking && touches.length === 1 && Number(playerZoom.scale || 1) <= 1.0001) {
      const touch = touches[0];
      const x = Number(touch.clientX || 0);
      const y = Number(touch.clientY || 0);
      const dx = x - Number(swipeRef.current.startX || 0);
      const dy = y - Number(swipeRef.current.startY || 0);
      swipeRef.current.lastX = x;
      swipeRef.current.lastY = y;

      if (!swipeRef.current.active) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absY > 24 && absY > absX * 1.2) {
          swipeRef.current.active = true;
        }
      }

      if (swipeRef.current.active && event.cancelable) {
        event.preventDefault();
      }
    }
  };

  const handlePlayerTouchEnd = (event) => {
    const swipe = swipeRef.current;
    const wasSwipe = swipe.tracking && swipe.active;
    if (wasSwipe) {
      const dx = Number(swipe.lastX || 0) - Number(swipe.startX || 0);
      const dy = Number(swipe.lastY || 0) - Number(swipe.startY || 0);
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const isVertical = absY > 92 && absY > absX * 1.1;

      if (isVertical) {
        if (dy < 0) {
          if ("pictureInPictureElement" in document && document.pictureInPictureElement === playerRef.current) {
            void document.exitPictureInPicture().catch(() => {
              // no-op
            });
          }
          setIsPlayerInPip(false);
          setIsPlayerMinimized(false);
          if (!isPlayerFullscreen) {
            void enterPlayerFullscreen();
            showGestureHud("Fullscreen");
          }
        } else if (isPlayerFullscreen) {
          void exitPlayerFullscreen();
          setIsPlayerMinimized(false);
          setIsPlayerInPip(false);
          showGestureHud("Normal");
        } else if (!isPipSupported) {
          setIsPlayerMinimized(true);
          showGestureHud("Minimized");
        } else if (!isPlayerInPip) {
          void requestPlayerPictureInPicture().then((ok) => {
            if (ok) {
              showGestureHud("Picture in picture");
            } else {
              showGestureHud("PiP not supported");
            }
          });
        }
      }
    }
    swipeRef.current.tracking = false;
    swipeRef.current.active = false;

    if (!wasSwipe && event?.changedTouches?.length && !pinchRef.current.active && !pinchRef.current.panActive) {
      const touch = event.changedTouches[0];
      const now = Date.now();
      const prev = lastTapRef.current;
      if (
        prev.at > 0 &&
        now - prev.at < 300 &&
        Math.abs(touch.clientX - prev.x) < 28 &&
        Math.abs(touch.clientY - prev.y) < 28
      ) {
        handleDoubleTapSeek(touch.clientX);
        lastTapRef.current = { at: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { at: now, x: touch.clientX, y: touch.clientY };
      }
    }

    if (pinchRef.current.active && Number(playerZoom.scale || 1) <= 1.0001) {
      setPlayerZoom({ scale: 1, x: 0, y: 0 });
      setPlayerZoomMode("fit");
    }
    pinchRef.current.active = false;
    if (!pinchRef.current.panActive) return;
    pinchRef.current.panActive = false;
    if (Number(playerZoom.scale || 1) <= 1.0001) {
      setPlayerZoom({ scale: 1, x: 0, y: 0 });
      setPlayerZoomMode("fit");
    }
  };
  useEffect(() => {
    const onFullscreenChange = () => {
      const wrap = playerWrapRef.current;
      const fsEl = document.fullscreenElement;

      const isWrapFs = !!wrap && fsEl === wrap;
      setIsPlayerFullscreen(isWrapFs);
      if (isWrapFs) setIsPlayerMinimized(false);
      if (!isWrapFs) showPlayerControls(true);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
      clearControlsHideTimer();
    };
  }, []);

  useEffect(() => {
    if (showQualityMenu || isSettingsAdjusting) {
      setControlsVisible(true);
      clearControlsHideTimer();
      return;
    }
    showPlayerControls(true);
  }, [showQualityMenu, isSettingsAdjusting]);

  useEffect(() => {
    const video = playerRef.current;
    const supportsPip =
      !!video &&
      "pictureInPictureEnabled" in document &&
      document.pictureInPictureEnabled &&
      typeof video.requestPictureInPicture === "function";
    setIsPipSupported(Boolean(supportsPip));

    if (!video) return;

    const onEnterPictureInPicture = () => {
      setIsPlayerInPip(true);
      setIsPlayerMinimized(false);
    };

    const onLeavePictureInPicture = () => {
      setIsPlayerInPip(false);
    };

    video.addEventListener("enterpictureinpicture", onEnterPictureInPicture);
    video.addEventListener("leavepictureinpicture", onLeavePictureInPicture);

    return () => {
      video.removeEventListener("enterpictureinpicture", onEnterPictureInPicture);
      video.removeEventListener("leavepictureinpicture", onLeavePictureInPicture);
    };
  }, [activeVideo?.id]);

  useEffect(() => {    if (!isWatchMode) return;
    showPlayerControls(true);
  }, [isWatchMode, activeVideo?.id, isPlayerPaused]);

  useEffect(() => {
    seekHudRef.current = { direction: "", totalSeconds: 0, lastAt: 0, targetTime: 0 };
  }, [activeVideo?.id]);

  useEffect(() => {
    setPlayerCurrentTime(0);
    setPlayerDuration(0);
    setPlayerBufferedUntil(0);
    setIsSeeking(false);
    setPlayerVolume(1);
    setIsPlayerMinimized(false);
    setIsPlayerInPip(false);
    setPlayerZoom({ scale: 1, x: 0, y: 0 });
    pinchRef.current.active = false;
    pinchRef.current.panActive = false;
  }, [activeVideo?.id]);

  useEffect(() => {    if (!isWatchMode || !activeVideo?.id) return;
    const playerWrap = playerWrapRef.current;    if (!playerWrap) return;
    let topOffset = 10;
    const navWrap = document.querySelector(".ss-nav-wrap");    if (navWrap) {
      const rect = navWrap.getBoundingClientRect();
      // Apply offset only when navbar is fixed at top (desktop/tablet).
      if (rect.top >= -1 && rect.top <= 24) {
        topOffset = Math.max(topOffset, rect.bottom + 8);
      }
    }
    const targetTop = window.scrollY + playerWrap.getBoundingClientRect().top - topOffset;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  }, [isWatchMode, activeVideo?.id]);

  useEffect(() => {    if (!isWatchMode) return;
    const onKeyDown = (e) => {    if (e.key === "ArrowRight") {
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

  const relatedVideos = watchableVideos.filter((item) => String(item.id) !== String(activeVideo?.id));
  const showSide = Boolean(activeVideo) || relatedVideos.length > 0;

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

      {liveBroadcast && (
        <div className="watch-live-banner" role="button" tabIndex={0} onClick={() => navigate("/live/watch")}>
          <div className="watch-live-left">
            <span className="watch-live-dot" />
            <div>
              <p className="watch-live-title">Live now</p>
              <p className="watch-live-sub">
                {liveBroadcast.title || `${liveBroadcast.hostName || "Creator"} is live`} •{" "}
                {formatLiveElapsed(liveBroadcast.startedAt)}
              </p>
            </div>
          </div>
          <button type="button" className="watch-live-btn">
            Watch Live
          </button>
        </div>
      )}

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
        <section className="yt-browse-shell">
          <aside className="yt-left-rail" aria-label="Browse sections">
            {WATCH_RAIL_ITEMS.map((item, idx) => (
              <button key={item} type="button" className={`yt-rail-item ${idx === 0 ? "is-active" : ""}`}>
                {item}
              </button>
            ))}
          </aside>

          <div className="yt-browse-main">
            <section className="yt-home-grid">
              {isLoading && <p className="watch-empty">Loading long videos...</p>}
              {!isLoading && !filteredLongVideos.length && <p className="watch-empty">No long videos found.</p>}
              {filteredLongVideos.map((video) => {
                const raw = mediaUrlFor(video);
                const url = resolveUrl(raw);
                const duration = videoDurationByPost[video.id] || 0;
                const owner = usernameFor(video);
                return (
                  <article
                    key={video.id}
                    className="yt-home-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => selectVideo(video.id)}
                    onKeyDown={(e) => {    if (e.key === "Enter" || e.key === " ") {
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
                      <span className="yt-home-avatar" aria-hidden="true">{owner.charAt(0)}</span>
                      <div className="yt-home-meta-text">
                        <h4>{captionFor(video)}</h4>
                        <p>{owner}</p>
                        <small>{formatCompact(likeCounts[video.id] || 0)} views • {relativeFrom(video?.createdAt)}</small>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        </section>
      ) : (
        <div className="watch-page">
          <section className="watch-main">
            {isLoading && <p className="watch-empty">Loading long videos...</p>}
            {!isLoading && !activeVideo && <p className="watch-empty">No long videos found.</p>}

            {activeVideo && (
              <>
                <div
                  className={`watch-player-wrap${isPlayerMinimized ? " is-minimized" : ""}${isPlayerInPip ? " is-pip" : ""}`}
                  ref={playerWrapRef}
                  onMouseMove={() => showPlayerControls(true)}
                  onPointerDown={handlePlayerPointerDown}
                  onPointerMove={handlePlayerPointerMove}
                  onPointerUp={handlePlayerPointerUp}
                  onPointerCancel={handlePlayerPointerUp}
                  onTouchStart={handlePlayerTouchStart}
                  onTouchMove={handlePlayerTouchMove}
                  onTouchEnd={handlePlayerTouchEnd}
                  onTouchCancel={handlePlayerTouchEnd}
                >
                  <video
                    key={activeVideo.id}
                    ref={playerRef}
                    src={activeVideoUrl}
                    controls={false}
                    disableRemotePlayback
                    autoPlay
                    playsInline
                    className="watch-player"
                    style={{
                      "--watch-player-brightness": playerBrightness,
                      transform: `translate3d(${playerZoom.x}px, ${playerZoom.y}px, 0) scale(${playerZoom.scale})`,
                      transformOrigin: "center center",
                      objectFit: playerZoomMode === "fit" ? "contain" : "cover"
                    }}
                    onPlay={() => {
                      setIsPlayerPaused(false);
                      showPlayerControls(true);
                      syncPlayerTime();
                    }}
                    onPause={() => {
                      setIsPlayerPaused(true);
                      showPlayerControls(false);
                      syncPlayerTime();
                    }}
                    onEnded={() => {
                      setIsPlayerPaused(true);
                      showPlayerControls(false);
                      syncPlayerTime();
                    }}
                    onLoadedMetadata={syncPlayerTime}
                    onDurationChange={syncPlayerTime}
                    onTimeUpdate={syncPlayerTime}
                    onProgress={syncPlayerTime}
                    onVolumeChange={() => setPlayerVolume(Number(playerRef.current?.volume ?? 1))}
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
                      <svg className="watch-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 5h3v14H6zM19 5L9 12l10 7z" fill="currentColor" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="watch-nav-btn watch-nav-play"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={togglePlayPause}
                      title={isPlayerPaused ? "Play" : "Pause"}
                      aria-label={isPlayerPaused ? "Play" : "Pause"}
                    >
                      {isPlayerPaused ? (
                        <svg className="watch-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M8 5v14l11-7z" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg className="watch-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      className="watch-nav-btn watch-nav-next"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => changeVideoByOffset(1)}
                      title="Next video"
                      aria-label="Next video"
                    >
                      <svg className="watch-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M15 5h3v14h-3zM5 5l10 7-10 7z" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`watch-quality-btn ${controlsVisible ? "" : "is-hidden"}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setShowQualityMenu((s) => !s)}
                    title="Settings"
                    aria-label="Settings"
                  >
                    {"\u2699"}
                  </button>
                  {showQualityMenu && controlsVisible && (
                    <div
                      className={`watch-quality-menu${isSettingsAdjusting ? " is-adjusting" : ""}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="watch-settings-section">
                        <p className="watch-settings-title">Brightness</p>
                        <input
                          type="range"
                          min="50"
                          max="170"
                          step="1"
                          value={Math.round(playerBrightness * 100)}
                          className="watch-settings-range"
                          onPointerDown={startSettingsAdjust}
                          onPointerUp={stopSettingsAdjust}
                          onPointerCancel={stopSettingsAdjust}
                          onBlur={stopSettingsAdjust}
                          onFocus={startSettingsAdjust}
                          onChange={(e) => setPlayerBrightness(clamp((Number(e.target.value) || 100) / 100, 0.5, 1.7))}
                        />
                      </div>
                      <div className="watch-settings-section">
                        <p className="watch-settings-title">Volume</p>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round(playerVolume * 100)}
                          className="watch-settings-range"
                          onPointerDown={startSettingsAdjust}
                          onPointerUp={stopSettingsAdjust}
                          onPointerCancel={stopSettingsAdjust}
                          onBlur={stopSettingsAdjust}
                          onFocus={startSettingsAdjust}
                          onChange={(e) => handleVolumeChange(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className={`watch-corner-fullscreen ${controlsVisible ? "" : "is-hidden"}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={togglePlayerFullscreen}
                    title={isPlayerFullscreen ? "Exit fullscreen" : "Fullscreen"}
                    aria-label={isPlayerFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  >
                    <svg className="watch-corner-fullscreen-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <div
                    className="watch-progress-wrap"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="watch-time-inline">
                      {formatDuration(playerCurrentTime)} / {formatDuration(playerDuration)}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(playerDuration, 0.1)}
                      step="0.1"
                      value={Math.min(playerCurrentTime, Math.max(playerDuration, 0.1))}
                      className="watch-progress-range"
                      style={{
                        "--played": `${clamp(
                          (Math.min(playerCurrentTime, Math.max(playerDuration, 0.1)) / Math.max(playerDuration, 0.1)) * 100,
                          0,
                          100
                        )}%`,
                        "--buffered": `${clamp(
                          (Math.max(playerBufferedUntil, playerCurrentTime) / Math.max(playerDuration, 0.1)) * 100,
                          0,
                          100
                        )}%`
                      }}
                      onMouseDown={() => setIsSeeking(true)}
                      onTouchStart={() => setIsSeeking(true)}
                      onMouseUp={() => setIsSeeking(false)}
                      onTouchEnd={() => setIsSeeking(false)}
                      onChange={(e) => handleSeekTo(e.target.value)}
                    />
                  </div>
                  {!!gestureHud.text && (
                    <div className={`watch-gesture-hud ${gestureHud.position === "side-left" ? "is-side-left" : ""} ${gestureHud.position === "side-right" ? "is-side-right" : ""}`}>
                      {gestureHud.text}
                    </div>
                  )}
                </div>

                <h1 className="watch-title">{captionFor(activeVideo)}</h1>
                <p className="watch-owner">
                  {usernameFor(activeVideo)} â€¢ {formatCompact(likeCounts[activeVideo.id] || 0)} likes â€¢ {relativeFrom(activeVideo?.createdAt)}
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

          {showSide && (
            <aside className="watch-side">
              <h3>Up next</h3>
              <div className="watch-list">
                {relatedVideos.map((v) => {
                  const url = resolveUrl(mediaUrlFor(v));
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
                        <small>{formatCompact(likeCounts[v.id] || 0)} likes â€¢ {relativeFrom(v?.createdAt)}</small>
                      </div>
                    </article>
                  );
                })}
                {!relatedVideos.length && activeVideo && <p className="watch-empty">No long videos found.</p>}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}



