import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FiBookmark,
  FiMessageCircle,
  FiVolume2,
  FiVolumeX,
} from "react-icons/fi";
import { BsBookmarkFill } from "react-icons/bs";
import { HiHandThumbUp, HiOutlineHandThumbUp } from "react-icons/hi2";
import { IoArrowRedoOutline } from "react-icons/io5";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { recordCommentActivity, recordRepostActivity, recordWatchHistory } from "../services/activityStore";
import { addStoryEntry, readStoryIdentity } from "../services/storyStorage";
import { readIdMapFromStorage, writeIdMapToStorage } from "../utils/idStorage";
import { classifyVideoBucket } from "../utils/videoFeedClassifier";
import { isYouTubeMedia } from "../utils/youtubeMedia";
import {
  FEED_WATCH_PROGRESS_MILESTONES,
  FEED_WATCH_TIME_CHUNK_SECONDS,
  FEED_WATCH_TIME_CHUNK_WEIGHT,
  FEED_WATCH_TIME_MAX_CHUNKS_PER_POST,
  FEED_WATCH_TIME_MAX_STEP_SECONDS,
  readFeedPersonalizationState,
  resolveFeedUserKey,
  trackFeedPersonalizationSignal,
} from "../utils/feedPersonalization";
import StudyMode from "./StudyMode";
import "./Reels.css";

const MAX_REEL_SECONDS = 60;
const GESTURE_SCROLL_COOLDOWN_MS = 200;
const GESTURE_LIKE_COOLDOWN_MS = 200;
const GESTURE_PLAY_TOGGLE_COOLDOWN_MS = 200;
const GESTURE_POSE_HOLD_FRAMES = 2;
const GESTURE_TWO_FINGER_HOLD_FRAMES = 2;
const GESTURE_RESET_HOLD_FRAMES = 3;
const GESTURE_SCRIPT_TF =
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const GESTURE_SCRIPT_HANDPOSE =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js";
const CHAT_SHARE_DRAFT_KEY = "socialsea_chat_share_draft_v1";
const SETTINGS_KEY = "socialsea_settings_v1";
const REELS_CACHE_KEY = "socialsea_reels_cache_v1";
const REELS_CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_REELS_DEFAULT = 40;
const REELS_LIMIT = Number(import.meta.env.VITE_REELS_LIMIT || MAX_REELS_DEFAULT);

const readStudyModeReels = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.studyModeReels);
  } catch {
    return false;
  }
};

const readReelsCache = () => {
  try {
    const raw = localStorage.getItem(REELS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at || 0);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    if (!Number.isFinite(at) || Date.now() - at > REELS_CACHE_TTL_MS) return [];
    return items.filter((item) => item && !isYouTubeMedia(item));
  } catch {
    return [];
  }
};

const writeReelsCache = (items) => {
  try {
    localStorage.setItem(
      REELS_CACHE_KEY,
      JSON.stringify({ at: Date.now(), items: Array.isArray(items) ? items : [] })
    );
  } catch {
    // ignore storage errors
  }
};

function loadScript(src, id) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.id = id;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export default function Reels() {
  const navigate = useNavigate();
  const viewerIdentity = useMemo(() => readStoryIdentity(), []);
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [studyModeReels, setStudyModeReels] = useState(readStudyModeReels);
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [gestureStatus, setGestureStatus] = useState("Hand signals are off");
  const [gestureError, setGestureError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likeCounts, setLikeCounts] = useState({});
  const [likedPostIds, setLikedPostIds] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentTextByPost, setCommentTextByPost] = useState({});
  const [commentsOpenByPost, setCommentsOpenByPost] = useState({});
  const [savedPostIds, setSavedPostIds] = useState({});
  const [shareMessageByPost, setShareMessageByPost] = useState({});
  const [tapLikeBurstByPost, setTapLikeBurstByPost] = useState({});
  const [followingByKey, setFollowingByKey] = useState({});
  const [likeBusyByPost, setLikeBusyByPost] = useState({});
  const [profilePicByOwner, setProfilePicByOwner] = useState({});
  const [allMuted, setAllMuted] = useState(() => {
    try {
      const stored = localStorage.getItem("reelsMutedAll");
      if (stored == null) return true;
      return stored === "1";
    } catch {
      return true;
    }
  });

  const containerRef = useRef(null);
  const videoRefs = useRef({});
  const tapTrackerRef = useRef({ singleTapTimer: null });
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const detectFrameRef = useRef(0);
  const handModelRef = useRef(null);
  const gestureRunningRef = useRef(false);
  const lastScrollAtRef = useRef(0);
  const lastLikeAtRef = useRef(0);
  const lastPlayToggleAtRef = useRef(0);
  const poseFramesRef = useRef(0);
  const noPoseFramesRef = useRef(0);
  const activePoseRef = useRef("none");
  const poseConsumedRef = useRef(false);
  const reelsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const pendingScrollIndexRef = useRef(null);
  const gestureScrollLockRef = useRef(false);
  const scrollIdleTimerRef = useRef(0);
  const scrollRafRef = useRef(0);
  const likedPostIdsRef = useRef({});
  const likeBusyByPostRef = useRef({});
  const likeCountLoadedRef = useRef(new Set());
  const watchProgressByPostRef = useRef({});
  const feedUserKeyRef = useRef(resolveFeedUserKey());
  const feedPersonalizationRef = useRef(readFeedPersonalizationState(feedUserKeyRef.current));
  const location = useLocation();
  const targetPostId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get("post") || "").trim();
  }, [location.search]);

  useEffect(() => {
    const refresh = () => setStudyModeReels(readStudyModeReels());
    const onStorage = (event) => {
      if (!event || event.key === SETTINGS_KEY) refresh();
    };
    window.addEventListener("ss-settings-update", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ss-settings-update", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (studyModeReels) {
      setGestureEnabled(false);
      setLoading(false);
      setError("");
      setReels([]);
    }
  }, [studyModeReels, targetPostId]);

  useEffect(() => {
    if (studyModeReels) return undefined;
    let cancelled = false;
    const cached = readReelsCache();
    if (cached.length) {
      setReels(cached);
      setError("");
    }
    setLoading(cached.length === 0);
    const buildBaseCandidates = () => {
      const storedBase =
        typeof window !== "undefined"
          ? localStorage.getItem("socialsea_auth_base_url") ||
            sessionStorage.getItem("socialsea_auth_base_url")
          : "";
      const origin =
        typeof window !== "undefined"
          ? String(window.location.origin || "").trim()
          : "";
      const candidates = [
        String(api.defaults.baseURL || "").trim(),
        String(getApiBaseUrl() || "").trim(),
        String(storedBase || "").trim(),
        String(import.meta.env.VITE_API_URL || "").trim(),
        "/api",
        origin,
      ].filter(Boolean);
      return [...new Set(candidates)];
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
    const fetchAny = async (endpoints, params = {}) => {
      const bases = buildBaseCandidates();
      let lastErr = null;
      let fallbackList = null;
      for (const baseURL of bases) {
        for (const url of endpoints) {
          try {
            const res = await api.request({
              method: "GET",
              url,
              baseURL,
              timeout: 10000,
              suppressAuthRedirect: true,
              params,
            });
            const body = res?.data;
            const looksLikeHtml =
              typeof body === "string" &&
              (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body));
            if (looksLikeHtml) {
              const htmlErr = new Error("Received HTML instead of API JSON");
              htmlErr.response = { status: 404, data: body };
              throw htmlErr;
            }
            const list = extractList(body);
            if (fallbackList == null) fallbackList = list;
            if (Array.isArray(list) && list.length > 0) {
              return list;
            }
          } catch (err) {
            lastErr = err;
          }
        }
      }
      if (Array.isArray(fallbackList)) return fallbackList;
      if (lastErr) throw lastErr;
      return [];
    };
    const loadShortVideos = async () => {
      try {
        const limitParam = Number.isFinite(REELS_LIMIT) && REELS_LIMIT > 0 ? Math.max(REELS_LIMIT, 30) : 60;
        const fromReels = await fetchAny(["/api/reels", "/reels"], { limit: limitParam });

        const byKey = new Map();
        const pushItem = (item, source) => {
          if (isYouTubeMedia(item)) return;
          const rawUrl = String(
            item?.contentUrl || item?.mediaUrl || "",
          ).trim();
          const key = String(item?.id || "") || rawUrl;
          if (!key) return;
          byKey.set(key, { item, source });
        };
        fromReels.forEach((item) => pushItem(item, "reels"));
        if (targetPostId) {
          const fallbackMatch = fromReels.find(
            (item) => String(item?.id || "").trim() === targetPostId
          );
          if (fallbackMatch) pushItem(fallbackMatch, "target");
        }

        const merged = Array.from(byKey.values());
        const durationProbeCache = new Map();
        const readDurationWithCache = async (mediaUrl) => {
          const url = String(mediaUrl || "").trim();
          if (!url) return 0;
          if (!durationProbeCache.has(url)) {
            durationProbeCache.set(url, readVideoDuration(url));
          }
          try {
            return Number(await durationProbeCache.get(url)) || 0;
          } catch {
            return 0;
          }
        };

        const isReelBucket = (bucket) => bucket === "reel" || bucket === "short";
        const desiredCount =
          Number.isFinite(REELS_LIMIT) && REELS_LIMIT > 0 ? REELS_LIMIT : MAX_REELS_DEFAULT;

        const normalizeList = (items) => {
          let nextReels = Array.isArray(items) ? items.filter(Boolean) : [];
          if (Number.isFinite(REELS_LIMIT) && REELS_LIMIT > 0) {
            if (targetPostId) {
              const targetIndex = nextReels.findIndex(
                (item) => String(item?.id || "").trim() === targetPostId
              );
              if (targetIndex > -1 && targetIndex >= REELS_LIMIT) {
                const picked = nextReels[targetIndex];
                nextReels = [
                  picked,
                  ...nextReels
                    .filter((_, idx) => idx !== targetIndex)
                    .slice(0, REELS_LIMIT - 1),
                ];
              } else {
                nextReels = nextReels.slice(0, REELS_LIMIT);
              }
            } else {
              nextReels = nextReels.slice(0, REELS_LIMIT);
            }
          }
          if (targetPostId) {
            const pickedIndex = nextReels.findIndex(
              (item) => String(item?.id || "").trim() === targetPostId
            );
            if (pickedIndex > 0) {
              const picked = nextReels[pickedIndex];
              nextReels.splice(pickedIndex, 1);
              nextReels.unshift(picked);
            }
          }
          return nextReels;
        };

        const confirmed = [];
        const needsProbe = [];

        merged.forEach(({ item }) => {
          if (!item) return;
          if (getMediaType(item) !== "VIDEO") return;
          const rawUrl = item.contentUrl || item.mediaUrl || "";
          const mediaUrl = resolveUrl(String(rawUrl).trim());
          if (!mediaUrl) return;

          const durationHint = durationFromPost(item);
          const bucket = classifyVideoBucket(item, {
            durationHint,
            shortSeconds: MAX_REEL_SECONDS,
            defaultUnknown: "long",
          });

          if (!isReelBucket(bucket)) return;

          if (durationHint > 0) {
            if (durationHint <= MAX_REEL_SECONDS) confirmed.push(item);
            return;
          }

          needsProbe.push({ item, mediaUrl });
        });

        let nextReels = normalizeList(confirmed);
        const shouldPublishInitial = nextReels.length > 0 || cached.length === 0;
        if (!cancelled && shouldPublishInitial) {
          setError("");
          setReels(nextReels);
          writeReelsCache(nextReels);
          setLoading(nextReels.length === 0 && needsProbe.length > 0);
        } else if (!cancelled) {
          setError("");
          setLoading(false);
        }

        const shouldStop = () =>
          cancelled ||
          (Number.isFinite(REELS_LIMIT) && REELS_LIMIT > 0
            ? nextReels.length >= REELS_LIMIT
            : nextReels.length >= desiredCount);

        const pushIfValid = (item) => {
          if (!item?.id) return false;
          if (nextReels.some((r) => String(r?.id) === String(item.id)))
            return false;
          nextReels = normalizeList([...nextReels, item]);
          return true;
        };

        const probeQueue = needsProbe.slice(0, Math.max(desiredCount * 3, 30));
        const PROBE_CONCURRENCY = 4;

        const worker = async () => {
          while (!shouldStop() && probeQueue.length) {
            const entry = probeQueue.shift();
            if (!entry?.item || !entry.mediaUrl) continue;

            const durationHint =
              Number(await readDurationWithCache(entry.mediaUrl)) || 0;
            if (durationHint <= 0 || durationHint > MAX_REEL_SECONDS) continue;

            const bucket = classifyVideoBucket(entry.item, {
              durationHint,
              shortSeconds: MAX_REEL_SECONDS,
              defaultUnknown: "long",
            });
            if (!isReelBucket(bucket)) continue;

            const didAdd = pushIfValid(entry.item);
            if (didAdd && !cancelled) {
              setReels(nextReels);
              writeReelsCache(nextReels);
              setLoading(false);
            }
          }
        };

        if (probeQueue.length) {
          await Promise.all(
            Array.from({ length: PROBE_CONCURRENCY }, () => worker())
          );
        }

        if (!cancelled) {
          const shouldPublishFinal = nextReels.length > 0 || cached.length === 0;
          if (shouldPublishFinal) {
            setReels(nextReels);
            writeReelsCache(nextReels);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Failed to load clips");
          setLoading(false);
        }
      }
    };

    loadShortVideos();
    return () => {
      cancelled = true;
    };
  }, [studyModeReels, targetPostId]);

  useEffect(() => {
    if (!reels.length) return;
    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(reels.length, currentIndex + 4);
    for (let idx = start; idx < end; idx += 1) {
      const reel = reels[idx];
      if (!reel) continue;
      fetchLikeCount(reel.id);
    }
  }, [reels, currentIndex]);

  useEffect(() => {
    const map = readIdMapFromStorage("likedPostIds");
    if (Object.keys(map).length) setLikedPostIds(map);
  }, []);

  useEffect(() => {
    const map = readIdMapFromStorage("savedReelIds");
    if (Object.keys(map).length) setSavedPostIds(map);
  }, []);

  useEffect(() => {
    reels.forEach((reel, idx) => {
      const video = videoRefs.current[reel.id];
      if (!video) return;
      video.muted = allMuted;
      if (idx === currentIndex) {
        video.play().catch(() => {
          video.muted = true;
          setAllMuted(true);
          video.play().catch(() => {});
        });
      } else {
        video.pause();
      }
    });
  }, [currentIndex, reels, allMuted]);

  useEffect(() => {
    try {
      localStorage.setItem("reelsMutedAll", allMuted ? "1" : "0");
    } catch {
      // ignore storage issues
    }
  }, [allMuted]);

  useEffect(() => {
    if (!targetPostId || !reels.length) return;
    const idx = reels.findIndex(
      (r) => String(r?.id || "").trim() === targetPostId,
    );
    if (idx < 0) return;
    setCurrentIndex(idx);
    const container = containerRef.current;
    if (container) {
      const sections = Array.from(container.querySelectorAll(".reel-item"));
      const target = sections[idx];
      const nextTop = target ? target.offsetTop : idx * container.clientHeight;
      container.scrollTo({ top: nextTop, behavior: "smooth" });
    }
  }, [reels, targetPostId]);

  useEffect(() => {
    return () => {
      if (tapTrackerRef.current.singleTapTimer)
        clearTimeout(tapTrackerRef.current.singleTapTimer);
      if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      watchProgressByPostRef.current = {};
      stopGestureControl();
    };
  }, [targetPostId]);

  useEffect(() => {
    reelsRef.current = reels;
  }, [reels, currentIndex]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    const activeReel = reels[currentIndex];
    if (!activeReel?.id) return;
    recordWatchHistory({ item: activeReel, source: "reels" });
    trackFeedSignal(activeReel, "watch");
    const activeNode = videoRefs.current[activeReel.id];
    if (activeNode) syncWatchProgressCursor(activeReel.id, activeNode.currentTime || 0);
  }, [reels, currentIndex]);

  useEffect(() => {
    likedPostIdsRef.current = likedPostIds;
  }, [likedPostIds]);

  useEffect(() => {
    likeBusyByPostRef.current = likeBusyByPost;
  }, [likeBusyByPost]);

  useEffect(() => {
    if (!gestureEnabled) {
      setGestureStatus("Hand signals are off");
      setGestureError("");
      stopGestureControl();
      return;
    }
    startGestureControl().catch((err) => {
      setGestureError(err?.message || "Could not start hand signal control");
      setGestureEnabled(false);
      stopGestureControl();
    });
  }, [gestureEnabled]);

  const fetchLikeCount = (postId) => {
    const idText = String(postId || "").trim();
    if (!idText) return;
    if (likeCountLoadedRef.current.has(idText)) return;
    likeCountLoadedRef.current.add(idText);
    api
      .get(`/api/likes/${encodeURIComponent(idText)}/count`, {
        suppressAuthRedirect: true,
        timeout: 4000,
      })
      .then((res) => {
        const count = Number(res.data) || 0;
        setLikeCounts((prev) => ({ ...prev, [idText]: count }));
      })
      .catch(() => {});
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return toApiUrl(url);
  };

  const getMediaType = (item) => {
    const rawType = String(
      item?.type || item?.mediaType || item?.contentType || "",
    )
      .trim()
      .toLowerCase();
    if (rawType.includes("video")) return "VIDEO";
    if (rawType.includes("image")) return "IMAGE";

    const url = String(item?.contentUrl || item?.mediaUrl || "")
      .trim()
      .toLowerCase();
    if (/\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/.test(url))
      return "VIDEO";
    if (/\.(png|jpe?g|gif|webp|bmp|avif|svg)(\?|#|$)/.test(url)) return "IMAGE";
    return item?.reel ? "VIDEO" : "IMAGE";
  };

  const parseDurationSeconds = (value) => {
    const rawText = String(value || "").trim();
    if (!rawText) return 0;

    if (rawText.includes(":")) {
      const parts = rawText
        .split(":")
        .map((part) => part.trim())
        .filter(Boolean);
      if (
        (parts.length === 2 || parts.length === 3) &&
        parts.every((part) => /^\d+(\.\d+)?$/.test(part))
      ) {
        const nums = parts.map((part) => Number(part));
        if (parts.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
        return nums[0] * 60 + nums[1];
      }
    }

    const n = Number(rawText);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n > 10000 ? n / 1000 : n;
  };

  const durationFromPost = (post) => {
    const candidates = [
      post?.durationSeconds,
      post?.durationInSeconds,
      post?.videoDurationSeconds,
      post?.videoDurationInSeconds,
      post?.duration,
      post?.videoDuration,
      post?.length,
      post?.videoLength,
      post?.durationMs,
      post?.videoDurationMs,
      post?.durationLabel,
      post?.videoDurationLabel
    ];
    for (const raw of candidates) {
      const n = parseDurationSeconds(raw);
      if (n > 0) return n;
    }
    return 0;
  };

  const readVideoDuration = (videoUrl, timeoutMs = 6000) =>
    new Promise((resolve) => {
      const url = String(videoUrl || "").trim();
      if (!url) {
        resolve(0);
        return;
      }

      const video = document.createElement("video");
      let done = false;
      let timerId = 0;

      const finish = (value) => {
        if (done) return;
        done = true;
        if (timerId) window.clearTimeout(timerId);
        video.onloadedmetadata = null;
        video.onerror = null;
        try {
          video.removeAttribute("src");
          video.load();
        } catch {
          // ignore cleanup errors
        }
        resolve(value);
      };

      video.preload = "metadata";
      video.onloadedmetadata = () => finish(Number(video.duration) || 0);
      video.onerror = () => finish(0);
      video.src = url;

      timerId = window.setTimeout(() => finish(0), Math.max(500, timeoutMs));
    });

  const trackFeedSignal = (post, signal = "view", customWeight = null) => {
    if (!post?.id) return;
    const nextState = trackFeedPersonalizationSignal({
      state: feedPersonalizationRef.current,
      userKey: feedUserKeyRef.current,
      post,
      signal,
      customWeight,
    });
    feedPersonalizationRef.current = nextState;
  };

  const ensureWatchProgressEntry = (postId) => {
    const id = String(postId || "").trim();
    if (!id) return null;
    const existing = watchProgressByPostRef.current[id];
    if (existing) return existing;
    const next = {
      lastTime: 0,
      bufferedSeconds: 0,
      awardedChunks: 0,
      progressMilestones: {},
    };
    watchProgressByPostRef.current[id] = next;
    return next;
  };

  const syncWatchProgressCursor = (postId, currentTime = 0) => {
    const entry = ensureWatchProgressEntry(postId);
    if (!entry) return;
    entry.lastTime = Math.max(0, Number(currentTime) || 0);
  };

  const applyReelWatchTimeSignals = (reel, event) => {
    if (!reel?.id) return;
    const activeReel = reelsRef.current[currentIndexRef.current];
    if (!activeReel || String(activeReel.id) !== String(reel.id)) return;

    const videoNode = event?.currentTarget;
    if (!videoNode) return;

    const entry = ensureWatchProgressEntry(reel.id);
    if (!entry) return;

    const currentTime = Math.max(0, Number(videoNode.currentTime) || 0);
    const previousTime = Number(entry.lastTime || 0);
    entry.lastTime = currentTime;

    if (!videoNode.paused && !videoNode.seeking) {
      const watchedDelta = currentTime - previousTime;
      if (watchedDelta > 0 && watchedDelta <= FEED_WATCH_TIME_MAX_STEP_SECONDS) {
        entry.bufferedSeconds += watchedDelta;
        let safetyCount = 0;
        while (
          entry.bufferedSeconds >= FEED_WATCH_TIME_CHUNK_SECONDS &&
          entry.awardedChunks < FEED_WATCH_TIME_MAX_CHUNKS_PER_POST &&
          safetyCount < 6
        ) {
          entry.bufferedSeconds -= FEED_WATCH_TIME_CHUNK_SECONDS;
          entry.awardedChunks += 1;
          trackFeedSignal(reel, "watch", FEED_WATCH_TIME_CHUNK_WEIGHT);
          safetyCount += 1;
        }
      }
    }

    const durationHint = Math.max(0, Number(videoNode.duration) || 0) || durationFromPost(reel);
    if (durationHint > 0) {
      const progress = Math.max(0, Math.min(1, currentTime / durationHint));
      FEED_WATCH_PROGRESS_MILESTONES.forEach((milestone) => {
        const key = String(milestone.ratio);
        if (progress < milestone.ratio || entry.progressMilestones[key]) return;
        entry.progressMilestones[key] = true;
        trackFeedSignal(reel, "watch", milestone.weight);
      });
    }
  };

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

  const reelOwnerKey = (reel) =>
    String(reel?.user?.id || reel?.user?.email || reel?.username || reel?.id);
  const reelOwnerCandidates = (reel) =>
    [
      reel?.user?.id,
      reel?.user?.username,
      reel?.username,
      reel?.user?.email,
      reel?.email,
      reel?.userId,
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  const reelOwnerProfilePic = (reel) => {
    const ownerKey = reelOwnerKey(reel);
    if (ownerKey && profilePicByOwner[ownerKey])
      return profilePicByOwner[ownerKey];
    const raw =
      reel?.user?.profilePicUrl ||
      reel?.user?.profilePic ||
      reel?.user?.avatarUrl ||
      reel?.user?.avatar ||
      reel?.profilePicUrl ||
      reel?.profilePic ||
      reel?.avatarUrl ||
      reel?.avatar ||
      "";
    return raw ? resolveUrl(String(raw).trim()) : "";
  };
  const myUserId = Number(localStorage.getItem("userId"));

  useEffect(() => {
    if (!reels.length) return;
    const targets = [];
    const seen = new Set();
    const start = Math.max(0, currentIndex - 4);
    const end = Math.min(reels.length, currentIndex + 6);
    reels.slice(start, end).forEach((reel) => {
      const ownerKey = reelOwnerKey(reel);
      if (!ownerKey || seen.has(ownerKey)) return;
      seen.add(ownerKey);
      if (!reelOwnerProfilePic(reel)) targets.push(reel);
    });
    if (!targets.length) return;
    let cancelled = false;
    const run = async () => {
      const foundByOwner = {};
      for (const reel of targets.slice(0, 12)) {
        const ownerKey = reelOwnerKey(reel);
        const candidates = reelOwnerCandidates(reel);
        if (!ownerKey || !candidates.length) continue;
        let found = "";
        for (const candidate of candidates) {
          try {
            const res = await api.get(
              `/api/profile/${encodeURIComponent(candidate)}`,
              {
                suppressAuthRedirect: true,
                timeout: 4000,
              },
            );
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
            // try next identifier
          }
        }
        if (found) foundByOwner[ownerKey] = found;
      }
      if (cancelled || !Object.keys(foundByOwner).length) return;
      setProfilePicByOwner((prev) => ({ ...prev, ...foundByOwner }));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [reels]);

  const getNearestIndex = (scrollTop) => {
    const container = containerRef.current;
    if (!container || !reels.length) return 0;
    const sections = Array.from(container.querySelectorAll(".reel-item"));
    if (!sections.length) {
      const idx = Math.round(
        container.scrollTop / Math.max(1, container.clientHeight),
      );
      return Math.max(0, Math.min(reels.length - 1, idx));
    }
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    sections.forEach((section, idx) => {
      const dist = Math.abs((section?.offsetTop || 0) - scrollTop);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    return Math.max(0, Math.min(reels.length - 1, bestIdx));
  };

  const scrollTopForIndex = (idx) => {
    const container = containerRef.current;
    if (!container) return 0;
    const sections = Array.from(container.querySelectorAll(".reel-item"));
    const target = sections[idx];
    if (target) return target.offsetTop || 0;
    return idx * container.clientHeight;
  };

  const snapToNearest = (behavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    const bounded = getNearestIndex(el.scrollTop);
    const targetTop = scrollTopForIndex(bounded);
    if (Math.abs(el.scrollTop - targetTop) > 2) {
      el.scrollTo({ top: targetTop, behavior });
    }
    if (bounded !== currentIndexRef.current) setCurrentIndex(bounded);
    if (
      pendingScrollIndexRef.current != null &&
      bounded === pendingScrollIndexRef.current
    ) {
      pendingScrollIndexRef.current = null;
      gestureScrollLockRef.current = false;
    }
  };

  const onScroll = () => {
    const el = containerRef.current;
    if (!el || !reels.length) return;

    const bounded = getNearestIndex(el.scrollTop);
    if (bounded !== currentIndexRef.current) {
      setCurrentIndex(bounded);
    }

    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = window.setTimeout(() => {
      snapToNearest("smooth");
    }, 150);
  };

  const likeReel = async (postId) => {
    const persistLikedMap = (next) => {
      writeIdMapToStorage("likedPostIds", next);
    };

    const triggerLikeBurst = () => {
      setTapLikeBurstByPost((prev) => ({ ...prev, [postId]: true }));
      setTimeout(
        () => setTapLikeBurstByPost((prev) => ({ ...prev, [postId]: false })),
        700,
      );
    };

    if (likeBusyByPostRef.current[postId]) return;
    const targetReel = reelsRef.current.find((item) => String(item?.id) === String(postId));

    const wasLiked = !!likedPostIdsRef.current[postId];
    const nextLiked = !wasLiked;
    likeBusyByPostRef.current = {
      ...likeBusyByPostRef.current,
      [postId]: true,
    };
    setLikeBusyByPost((prev) => ({ ...prev, [postId]: true }));

    try {
      let res;
      if (nextLiked) {
        res = await api.post(`/api/likes/${postId}`);
      } else {
        try {
          res = await api.delete(`/api/likes/${postId}`);
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          if (status === 400 || status === 404 || status === 405) {
            res = await api.post(`/api/likes/${postId}`);
          } else {
            throw err;
          }
        }
      }

      const message = String(res?.data || "").toLowerCase();
      if (nextLiked && message.includes("already")) {
        setLikedPostIds((prev) => {
          const next = { ...prev, [postId]: true };
          likedPostIdsRef.current = next;
          persistLikedMap(next);
          return next;
        });
      } else {
        setLikedPostIds((prev) => {
          const next = { ...prev };
          if (nextLiked) next[postId] = true;
          else delete next[postId];
          likedPostIdsRef.current = next;
          persistLikedMap(next);
          return next;
        });
      }
      setLikeCounts((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] || 0) + (nextLiked ? 1 : -1)),
      }));

      if (nextLiked) {
        triggerLikeBurst();
        if (targetReel) trackFeedSignal(targetReel, "like");
      }
    } catch {
      // keep prior UI state on failure
    } finally {
      likeBusyByPostRef.current = {
        ...likeBusyByPostRef.current,
        [postId]: false,
      };
      setLikeBusyByPost((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const loadComments = async (postId) => {
    try {
      const res = await api.get(`/api/comments/${postId}`);
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: Array.isArray(res.data) ? res.data : [],
      }));
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
    const reel = reels.find((item) => String(item?.id) === String(postId));
    try {
      await api.post(`/api/comments/${postId}`, text, {
        headers: { "Content-Type": "text/plain" },
      });
      setCommentTextByPost((prev) => ({ ...prev, [postId]: "" }));
      await loadComments(postId);
      recordCommentActivity({ postId, text, item: reel, source: "reels" });
      if (reel) trackFeedSignal(reel, "comment");
    } catch {
      // noop
    }
  };

  const shareReel = async (reel) => {
    const reelId = String(reel?.id || "").trim();
    const previewMedia = String(reel?.contentUrl || reel?.mediaUrl || reel?.videoUrl || "").trim();
    const previewPoster = String(
      reel?.thumbnailUrl ||
      reel?.thumbUrl ||
      reel?.previewUrl ||
      reel?.coverUrl ||
      reel?.coverImageUrl ||
      reel?.coverImage ||
      reel?.posterUrl ||
      reel?.poster ||
      reel?.imageUrl ||
      ""
    ).trim();
    const shareUrlObj = new URL("/clips", window.location.origin);
    if (reelId) shareUrlObj.searchParams.set("post", reelId);
    if (previewMedia) shareUrlObj.searchParams.set("media", previewMedia);
    if (previewPoster) shareUrlObj.searchParams.set("poster", previewPoster);
    const shareUrl = shareUrlObj.toString();
    const shareText = `${reel.description || reel.content || "Check this clip"} ${shareUrl}`;
    try {
      recordRepostActivity({ item: reel, source: "reels", via: "chat" });
      addStoryEntry(
        {
          id: reel?.id || `reel-share-${Date.now()}`,
          reelId: reel?.id || "",
          mediaUrl: reel?.contentUrl || reel?.mediaUrl || reel?.videoUrl || "",
          mediaType: reel?.contentType || reel?.mediaType || "video/mp4",
          type: "VIDEO",
          isVideo: true,
          caption: reel?.description || reel?.content || "",
          storyText: reel?.description || reel?.content || "",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          privacy: "public",
          userId: viewerIdentity.userId || reel?.user?.id || "",
          email: viewerIdentity.email || reel?.user?.email || "",
          username: viewerIdentity.username || reel?.user?.username || reel?.username || "",
          name: viewerIdentity.name || reel?.user?.name || reel?.name || "",
          sourceType: "reel-share",
          createdLocally: true
        },
        { active: false, archive: true }
      );
      try {
        sessionStorage.setItem(CHAT_SHARE_DRAFT_KEY, shareText);
      } catch {
        // ignore storage failures
      }
      navigate(`/chat?share=${encodeURIComponent(shareText)}`);
      trackFeedSignal(reel, "share");
      setShareMessageByPost((prev) => ({
        ...prev,
        [reel.id]: "Saved to My Stories and sharing to chat...",
      }));
    } catch {
      setShareMessageByPost((prev) => ({ ...prev, [reel.id]: "Share failed" }));
    }
    setTimeout(
      () => setShareMessageByPost((prev) => ({ ...prev, [reel.id]: "" })),
      1200,
    );
  };

  const toggleSave = (postId) => {
    setSavedPostIds((prev) => {
      const next = { ...prev };
      if (next[postId]) delete next[postId];
      else next[postId] = true;
      writeIdMapToStorage("savedReelIds", next);
      return next;
    });
  };

  const followOwner = async (reel) => {
    const followTarget = reel?.user?.email || reel?.username;
    if (!followTarget) return;
    const key = reelOwnerKey(reel);
    try {
      const res = await api.post(
        `/api/follow/${encodeURIComponent(followTarget)}`,
      );
      const status = String(res?.data?.status || res?.data || "").toLowerCase();
      if (
        res.status >= 200 &&
        res.status < 300 &&
        status.includes("following")
      ) {
        setFollowingByKey((prev) => ({ ...prev, [key]: true }));
      }
    } catch {
      // noop
    }
  };

  const toggleMute = () => {
    const nextMuted = !allMuted;
    setAllMuted(nextMuted);
    Object.values(videoRefs.current).forEach((video) => {
      if (!video) return;
      video.muted = nextMuted;
    });
    const currentReel = reels[currentIndexRef.current];
    if (!nextMuted && currentReel) {
      const currentVideo = videoRefs.current[currentReel.id];
      if (currentVideo?.paused) currentVideo.play().catch(() => {});
    }
  };

  const togglePlayPause = (postId) => {
    const video = videoRefs.current[postId];
    if (!video) return null;
    if (video.paused) {
      video.play().catch(() => {});
      return "playing";
    }
    video.pause();
    return "paused";
  };

  const scrollToIndex = (idx) => {
    const container = containerRef.current;
    if (!container || !reels.length) return;
    const bounded = Math.max(0, Math.min(reels.length - 1, idx));
    if (bounded === currentIndexRef.current) {
      gestureScrollLockRef.current = false;
      pendingScrollIndexRef.current = null;
      return;
    }
    pendingScrollIndexRef.current = bounded;
    gestureScrollLockRef.current = true;
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    setCurrentIndex(bounded);
    container.scrollTo({ top: scrollTopForIndex(bounded), behavior: "smooth" });
    window.setTimeout(() => {
      if (pendingScrollIndexRef.current === bounded) {
        pendingScrollIndexRef.current = null;
        gestureScrollLockRef.current = false;
      }
    }, 550);
  };

  const handleReelTap = (reel, event) => {
    const target = event?.currentTarget;
    if (target && typeof target.getBoundingClientRect === "function") {
      const rect = target.getBoundingClientRect();
      const clickY = Number(event?.clientY || 0);
      const relY = rect.height ? (clickY - rect.top) / rect.height : 0.5;
      if (relY <= 0.33) {
        scrollToIndex(currentIndexRef.current - 1);
        return;
      }
      if (relY >= 0.67) {
        scrollToIndex(currentIndexRef.current + 1);
        return;
      }
    }
    const tapCount = Number(event?.detail || 1);
    if (tapTrackerRef.current.singleTapTimer) {
      clearTimeout(tapTrackerRef.current.singleTapTimer);
      tapTrackerRef.current.singleTapTimer = null;
    }
    if (tapCount >= 2) {
      likeReel(reel.id);
      return;
    }
    tapTrackerRef.current.singleTapTimer = setTimeout(() => {
      toggleMute();
      tapTrackerRef.current.singleTapTimer = null;
    }, 260);
  };

  const readHandState = (landmarks) => {
    if (!landmarks || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const thumbIp = landmarks[3];
    const indexMcp = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const middleMcp = landmarks[9];
    const middlePip = landmarks[10];
    const middleTip = landmarks[12];
    const ringMcp = landmarks[13];
    const ringPip = landmarks[14];
    const ringTip = landmarks[16];
    const pinkyMcp = landmarks[17];
    const pinkyPip = landmarks[18];
    const pinkyTip = landmarks[20];
    const thumbTip = landmarks[4];

    const handSize =
      Math.hypot(middleMcp[0] - wrist[0], middleMcp[1] - wrist[1]) || 1;
    const extMargin = Math.max(3, handSize * 0.09);
    const isFingerExtended = (tip, pip, mcp) =>
      Number(tip?.[1]) < Number(pip?.[1]) - extMargin &&
      Number(pip?.[1]) < Number(mcp?.[1]) - extMargin * 0.35;
    const indexExtended = isFingerExtended(indexTip, indexPip, indexMcp);
    const middleExtended = isFingerExtended(middleTip, middlePip, middleMcp);
    const ringExtended = isFingerExtended(ringTip, ringPip, ringMcp);
    const pinkyExtended = isFingerExtended(pinkyTip, pinkyPip, pinkyMcp);
    const extendedCount = [
      indexExtended,
      middleExtended,
      ringExtended,
      pinkyExtended,
    ].filter(Boolean).length;

    const thumbToIndex = Math.hypot(
      thumbTip[0] - indexMcp[0],
      thumbTip[1] - indexMcp[1],
    );
    const thumbToWrist = Math.hypot(
      thumbTip[0] - wrist[0],
      thumbTip[1] - wrist[1],
    );
    const thumbBent =
      thumbToIndex < handSize * 0.28 ||
      thumbToWrist < handSize * 0.32 ||
      (Number(thumbTip[1]) > Number(thumbIp[1]) + handSize * 0.04 &&
        extendedCount <= 1);

    if (indexExtended && extendedCount === 1)
      return { pose: "oneFinger", handSize };
    if (extendedCount === 3) return { pose: "threeFingers", handSize };
    if (thumbBent) return { pose: "thumbBent", handSize };
    return { pose: "none" };
  };

  const stopGestureControl = () => {
    gestureRunningRef.current = false;
    poseFramesRef.current = 0;
    noPoseFramesRef.current = 0;
    activePoseRef.current = "none";
    poseConsumedRef.current = false;
    if (detectFrameRef.current) {
      cancelAnimationFrame(detectFrameRef.current);
      detectFrameRef.current = 0;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.srcObject = null;
      cameraVideoRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  };

  const startGestureControl = async () => {
    if (gestureRunningRef.current) return;
    if (!reels.length) {
      setGestureStatus("No clips to control");
      return;
    }
    setGestureError("");
    setGestureStatus("Starting hand signals...");
    await loadScript(GESTURE_SCRIPT_TF, "tfjs-reels-gesture");
    await loadScript(GESTURE_SCRIPT_HANDPOSE, "handpose-reels-gesture");
    if (!window.handpose)
      throw new Error("Hand model unavailable in this browser");
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Camera access is not supported");

    if (!handModelRef.current) {
      handModelRef.current = await window.handpose.load();
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    cameraStreamRef.current = stream;

    const hiddenVideo = document.createElement("video");
    hiddenVideo.autoplay = true;
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.srcObject = stream;
    cameraVideoRef.current = hiddenVideo;
    await hiddenVideo.play();

    gestureRunningRef.current = true;
    setGestureStatus("Hand signals active");

    const detect = async () => {
      if (
        !gestureRunningRef.current ||
        !cameraVideoRef.current ||
        !handModelRef.current
      )
        return;
      try {
        const predictions = await handModelRef.current.estimateHands(
          cameraVideoRef.current,
          true,
        );
        if (predictions.length) {
          const handState = readHandState(predictions[0].landmarks);
          const now = Date.now();
          const pose = handState?.pose || "none";
          if (pose !== activePoseRef.current) {
            activePoseRef.current = pose;
            poseFramesRef.current = pose === "none" ? 0 : 1;
            if (pose === "none") {
              noPoseFramesRef.current = 1;
            } else {
              noPoseFramesRef.current = 0;
              poseConsumedRef.current = false;
            }
          } else if (pose !== "none") {
            poseFramesRef.current += 1;
            noPoseFramesRef.current = 0;
          } else {
            poseFramesRef.current = 0;
            noPoseFramesRef.current += 1;
            if (noPoseFramesRef.current >= GESTURE_RESET_HOLD_FRAMES) {
              poseConsumedRef.current = false;
            }
          }

          if (!poseConsumedRef.current) {
            if (
              pose === "oneFinger" &&
              poseFramesRef.current >= GESTURE_POSE_HOLD_FRAMES &&
              !gestureScrollLockRef.current &&
              now - lastScrollAtRef.current > GESTURE_SCROLL_COOLDOWN_MS
            ) {
              lastScrollAtRef.current = now;
              poseConsumedRef.current = true;
              setGestureStatus("Index finger: next clip");
              scrollToIndex(currentIndexRef.current + 1);
            } else if (
              pose === "threeFingers" &&
              poseFramesRef.current >= GESTURE_POSE_HOLD_FRAMES &&
              !gestureScrollLockRef.current &&
              now - lastScrollAtRef.current > GESTURE_SCROLL_COOLDOWN_MS
            ) {
              lastScrollAtRef.current = now;
              poseConsumedRef.current = true;
              setGestureStatus("Three fingers: previous clip");
              scrollToIndex(currentIndexRef.current - 1);
            } else if (
              pose === "thumbBent" &&
              poseFramesRef.current >= GESTURE_POSE_HOLD_FRAMES &&
              now - lastLikeAtRef.current > GESTURE_LIKE_COOLDOWN_MS
            ) {
              lastLikeAtRef.current = now;
              poseConsumedRef.current = true;
              const reel = reelsRef.current[currentIndexRef.current];
              if (reel) {
                setGestureStatus("Thumb bent: liking clip");
                likeReel(reel.id);
              }
            }
          }
        } else {
          poseFramesRef.current = 0;
          noPoseFramesRef.current += 1;
          activePoseRef.current = "none";
          if (noPoseFramesRef.current >= GESTURE_RESET_HOLD_FRAMES) {
            poseConsumedRef.current = false;
          }
        }
      } catch {
        setGestureError("Unable to read hand gestures");
      }
      detectFrameRef.current = requestAnimationFrame(detect);
    };
    detectFrameRef.current = requestAnimationFrame(detect);
  };

  if (studyModeReels) {
    return <StudyMode />;
  }

  return (
    <div className="reels-page">
      <div
        className={`reels-container ${error ? "has-error" : ""} ${!error && reels.length === 0 ? "is-empty" : ""}`}
        ref={containerRef}
        onScroll={onScroll}
      >
        {error && <p className="reel-state is-error">{error}</p>}
        {!error && loading && reels.length === 0 && (
          <p className="reel-state">Loading clips...</p>
        )}
        {!error && !loading && reels.length === 0 && (
          <p className="reel-state">
            No clips yet (only videos up to 60 seconds are shown).
          </p>
        )}

        {reels.map((reel, idx) => {
          const rawUrl = reel.contentUrl || reel.mediaUrl || "";
          const videoUrl = resolveUrl(rawUrl.trim());
          if (!videoUrl || isYouTubeMedia(reel)) return null;

          const comments = commentsByPost[reel.id] || [];
          const ownerNameRaw =
            reel?.user?.name || reel?.user?.email || reel?.username || "User";
          const ownerName = ownerNameRaw.includes("@")
            ? emailToName(ownerNameRaw)
            : ownerNameRaw;
          const ownerKey = reelOwnerKey(reel);
          const ownerPic = reelOwnerProfilePic(reel);
          const isOwnReel = Number(reel?.user?.id) === myUserId;
          const isFollowing = !!followingByKey[ownerKey];
          const caption =
            reel?.description || reel?.content || "Watch this clip";

          return (
            <section className="reel-item" key={reel.id} data-reel-idx={idx}>
              <div className="reel-stage">
                <div
                  className="reel-frame"
                  onClick={(event) => handleReelTap(reel, event)}
                >
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current[reel.id] = el;
                    }}
                    src={videoUrl}
                    loop
                    muted={allMuted}
                    playsInline
                    controls={false}
                    className="reel-video"
                    onPlay={(event) => {
                      syncWatchProgressCursor(reel.id, event.currentTarget.currentTime || 0);
                    }}
                    onPause={(event) => {
                      syncWatchProgressCursor(reel.id, event.currentTarget.currentTime || 0);
                    }}
                    onSeeking={(event) => {
                      syncWatchProgressCursor(reel.id, event.currentTarget.currentTime || 0);
                    }}
                    onTimeUpdate={(event) => {
                      applyReelWatchTimeSignals(reel, event);
                    }}
                  />
                  <div className="reel-gradient-top" />
                  <div className="reel-gradient-bottom" />
                  <div className="reel-top-bar">
                    <h3 className="reel-top-title">Clips</h3>
                    <span className="reel-top-chip">For You</span>
                  </div>
                </div>

                {tapLikeBurstByPost[reel.id] && (
                  <div className="reel-like-burst">{"\u{1F44C}"}</div>
                )}

                <aside className="reel-actions">
                  <button
                    type="button"
                    className="reel-action-btn"
                    onClick={toggleMute}
                    title={allMuted ? "Unmute all clips" : "Mute all clips"}
                  >
                    <span>{allMuted ? <FiVolumeX /> : <FiVolume2 />}</span>
                  </button>
                  <button
                    type="button"
                    className={`reel-action-btn ${likedPostIds[reel.id] ? "is-active" : ""}`}
                    onClick={() => likeReel(reel.id)}
                    title="Like"
                  >
                    <span>
                      {likedPostIds[reel.id] ? (
                        <HiHandThumbUp />
                      ) : (
                        <HiOutlineHandThumbUp />
                      )}
                    </span>
                    <small>{likeCounts[reel.id] || 0}</small>
                  </button>
                  <button
                    type="button"
                    className="reel-action-btn"
                    onClick={() => toggleComments(reel.id)}
                    title="Comment"
                  >
                    <span>
                      <FiMessageCircle />
                    </span>
                    <small>{comments.length}</small>
                  </button>
                  <button
                    type="button"
                    className="reel-action-btn"
                    onClick={() => shareReel(reel)}
                    title="Share"
                  >
                    <span>
                      <IoArrowRedoOutline aria-hidden="true" />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="reel-action-btn reel-save-btn"
                    onClick={() => toggleSave(reel.id)}
                    title="Save"
                  >
                    <span>
                      {savedPostIds[reel.id] ? (
                        <BsBookmarkFill />
                      ) : (
                        <FiBookmark />
                      )}
                    </span>
                  </button>
                </aside>

                <div className="reel-bottom-meta">
                  <div className="reel-owner-row">
                    {ownerPic ? (
                      <img
                        src={ownerPic}
                        alt={ownerName}
                        className="reel-owner-avatar reel-owner-avatar-img"
                      />
                    ) : (
                      <span className="reel-owner-avatar">
                        {ownerName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <Link
                      to={`/profile/${reel.user?.email || reel.user?.username || reel.username || "me"}`}
                      className="reel-owner hover:underline"
                    >
                      {ownerName}
                    </Link>
                    {!isOwnReel && (
                      <button
                        type="button"
                        className="reel-follow-btn"
                        onClick={() => followOwner(reel)}
                        disabled={isFollowing}
                      >
                        {isFollowing ? "Following" : "Follow +"}
                      </button>
                    )}
                  </div>
                  <p className="reel-caption">{caption}</p>
                </div>

                {shareMessageByPost[reel.id] && (
                  <p className="reel-share-status">
                    {shareMessageByPost[reel.id]}
                  </p>
                )}

                {commentsOpenByPost[reel.id] && (
                  <div className="reel-comments">
                    <div className="reel-comment-input-row">
                      <input
                        type="text"
                        placeholder="Write a comment..."
                        value={commentTextByPost[reel.id] || ""}
                        onChange={(e) =>
                          setCommentTextByPost((prev) => ({
                            ...prev,
                            [reel.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => submitComment(reel.id)}
                      >
                        Post
                      </button>
                    </div>
                    {comments.map((comment) => (
                      <div className="reel-comment-item" key={comment.id}>
                        <strong>
                          {comment.user?.name || comment.user?.email || "User"}:
                        </strong>{" "}
                        {comment.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
