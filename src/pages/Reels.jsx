import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiBookmark } from "react-icons/fi";
import { BsBookmarkFill } from "react-icons/bs";
import api from "../api/axios";
import "./Reels.css";

const MAX_REEL_SECONDS = 90;
const GESTURE_SCROLL_COOLDOWN_MS = 450;
const GESTURE_LIKE_COOLDOWN_MS = 900;
const GESTURE_POSE_HOLD_FRAMES = 3;
const GESTURE_OK_HOLD_FRAMES = 2;
const GESTURE_SCRIPT_TF = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const GESTURE_SCRIPT_HANDPOSE =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js";

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
  const [reels, setReels] = useState([]);
  const [error, setError] = useState("");
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
  const [watchLaterPostIds, setWatchLaterPostIds] = useState({});
  const [shareMessageByPost, setShareMessageByPost] = useState({});
  const [tapLikeBurstByPost, setTapLikeBurstByPost] = useState({});
  const [followingByKey, setFollowingByKey] = useState({});
  const [mutedByPost, setMutedByPost] = useState({});

  const containerRef = useRef(null);
  const videoRefs = useRef({});
  const tapTrackerRef = useRef({ lastTapTs: 0, singleTapTimer: null });
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const detectFrameRef = useRef(0);
  const handModelRef = useRef(null);
  const gestureRunningRef = useRef(false);
  const lastScrollAtRef = useRef(0);
  const lastLikeAtRef = useRef(0);
  const poseFramesRef = useRef(0);
  const activePoseRef = useRef("none");
  const poseConsumedRef = useRef(false);
  const reelsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const location = useLocation();
  const targetPostId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return Number(params.get("post") || 0);
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    const loadShortVideos = async () => {
      try {
        const [feedRes, reelsRes] = await Promise.allSettled([api.get("/api/feed"), api.get("/api/reels")]);
        const fromFeed = feedRes.status === "fulfilled" && Array.isArray(feedRes.value?.data) ? feedRes.value.data : [];
        const fromReels = reelsRes.status === "fulfilled" && Array.isArray(reelsRes.value?.data) ? reelsRes.value.data : [];

        const byKey = new Map();
        const pushItem = (item, source) => {
          const rawUrl = String(item?.contentUrl || item?.mediaUrl || "").trim();
          const key = String(item?.id || "") || rawUrl;
          if (!key) return;
          byKey.set(key, { item, source });
        };
        fromFeed.forEach((item) => pushItem(item, "feed"));
        fromReels.forEach((item) => pushItem(item, "reels"));

        const merged = Array.from(byKey.values());
        const filtered = await Promise.all(
          merged.map(async ({ item, source }) => {
            if (getMediaType(item) !== "VIDEO") return null;

            const rawUrl = item.contentUrl || item.mediaUrl || "";
            const mediaUrl = resolveUrl(String(rawUrl).trim());
            if (!mediaUrl) return null;

            const knownDuration = durationFromPost(item);
            if (knownDuration > 0) {
              return knownDuration <= MAX_REEL_SECONDS ? item : null;
            }

            const measuredDuration = await readVideoDuration(mediaUrl);
            if (measuredDuration > 0) {
              return measuredDuration <= MAX_REEL_SECONDS ? item : null;
            }

            // /api/reels is expected to be short-video scoped; keep entries even if metadata is unavailable.
            return source === "reels" ? item : null;
          })
        );

        if (!cancelled) {
          setError("");
          setReels(filtered.filter(Boolean));
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Failed to load reels");
      }
    };

    loadShortVideos();
    return () => {
      cancelled = true;
    };
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
      if (idx === currentIndex) {
        video.play().catch(() => {
          video.muted = true;
          setMutedByPost((prev) => ({ ...prev, [reel.id]: true }));
          video.play().catch(() => {});
        });
      } else {
        video.pause();
      }
    });
  }, [currentIndex, reels]);

  useEffect(() => {
    if (!targetPostId || !reels.length) return;
    const idx = reels.findIndex((r) => Number(r.id) === Number(targetPostId));
    if (idx < 0) return;
    setCurrentIndex(idx);
    const container = containerRef.current;
    if (container) {
      container.scrollTo({ top: idx * container.clientHeight, behavior: "smooth" });
    }
  }, [reels, targetPostId]);

  useEffect(() => {
    return () => {
      if (tapTrackerRef.current.singleTapTimer) clearTimeout(tapTrackerRef.current.singleTapTimer);
      stopGestureControl();
    };
  }, []);

  useEffect(() => {
    reelsRef.current = reels;
  }, [reels]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

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
    return item?.reel ? "VIDEO" : "IMAGE";
  };

  const durationFromPost = (post) => {
    const candidates = [
      post?.durationSeconds,
      post?.videoDurationSeconds,
      post?.duration,
      post?.videoDuration
    ];
    for (const raw of candidates) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };

  const readVideoDuration = (videoUrl) =>
    new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = videoUrl;
      video.onloadedmetadata = () => resolve(Number(video.duration) || 0);
      video.onerror = () => resolve(0);
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

  const likeReel = async (postId) => {
    const persistLikedMap = (next) => {
      const ids = Object.keys(next)
        .filter((id) => next[id])
        .map((id) => Number(id));
      localStorage.setItem("likedPostIds", JSON.stringify(ids));
    };

    const triggerLikeBurst = () => {
      setTapLikeBurstByPost((prev) => ({ ...prev, [postId]: true }));
      setTimeout(() => setTapLikeBurstByPost((prev) => ({ ...prev, [postId]: false })), 700);
    };

    if (likedPostIds[postId]) {
      let unliked = false;
      try {
        await api.delete(`/api/likes/${postId}`);
        unliked = true;
      } catch {
        try {
          const res = await api.post(`/api/likes/${postId}`);
          const message = String(res?.data || "").toLowerCase();
          if (message.includes("unlike") || message.includes("removed") || message.includes("dislike")) {
            unliked = true;
          }
        } catch {
          // noop
        }
      }
      if (!unliked) {
        return;
      }
      setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - 1) }));
      setLikedPostIds((prev) => {
        const next = { ...prev, [postId]: false };
        persistLikedMap(next);
        return next;
      });
      return;
    }

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
      triggerLikeBurst();
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

  const toggleMute = (postId) => {
    const video = videoRefs.current[postId];
    if (!video) return;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMutedByPost((prev) => ({ ...prev, [postId]: nextMuted }));
    if (!nextMuted && video.paused) video.play().catch(() => {});
  };

  const scrollToIndex = (idx) => {
    const container = containerRef.current;
    if (!container || !reels.length) return;
    const bounded = Math.max(0, Math.min(reels.length - 1, idx));
    setCurrentIndex(bounded);
    container.scrollTo({ top: bounded * container.clientHeight, behavior: "smooth" });
  };

  const handleReelTap = (reel) => {
    const now = Date.now();
    const delta = now - tapTrackerRef.current.lastTapTs;
    if (tapTrackerRef.current.singleTapTimer) {
      clearTimeout(tapTrackerRef.current.singleTapTimer);
      tapTrackerRef.current.singleTapTimer = null;
    }
    if (delta > 0 && delta < 280) {
      likeReel(reel.id);
      tapTrackerRef.current.lastTapTs = 0;
      return;
    }
    tapTrackerRef.current.lastTapTs = now;
    tapTrackerRef.current.singleTapTimer = setTimeout(() => {
      toggleMute(reel.id);
      tapTrackerRef.current.singleTapTimer = null;
    }, 280);
  };

  const readHandState = (landmarks) => {
    if (!landmarks || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleMcp = landmarks[9];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    const handSize = Math.hypot(middleMcp[0] - wrist[0], middleMcp[1] - wrist[1]) || 1;
    const indexMcp = landmarks[5];
    const extMargin = handSize * 0.11;
    const isExtended = (tip, pip) => tip[1] < pip[1] - extMargin;

    const indexUp = isExtended(indexTip, indexPip);
    const middleUp = isExtended(middleTip, middlePip);
    const ringUp = isExtended(ringTip, ringPip);
    const pinkyUp = isExtended(pinkyTip, pinkyPip);

    const oneFingerMode = indexUp && !middleUp && !ringUp && !pinkyUp;
    const twoFingerMode = indexUp && middleUp && !ringUp && !pinkyUp;
    const thumbIndexDistance = Math.hypot(thumbTip[0] - indexTip[0], thumbTip[1] - indexTip[1]);
    const indexBaseDistance = Math.hypot(thumbTip[0] - indexMcp[0], thumbTip[1] - indexMcp[1]) || 1;
    const pinchRatio = thumbIndexDistance / indexBaseDistance;
    const thumbIndexTouching = thumbIndexDistance < handSize * 0.55 || pinchRatio < 0.62;
    const raisedCount = [middleUp, ringUp, pinkyUp].filter(Boolean).length;
    const okLike = thumbIndexTouching && raisedCount >= 2;

    if (okLike) return { pose: "ok" };
    if (oneFingerMode) return { pose: "one" };
    if (twoFingerMode) return { pose: "two" };
    return { pose: "none" };
  };

  const stopGestureControl = () => {
    gestureRunningRef.current = false;
    poseFramesRef.current = 0;
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
      setGestureStatus("No reels to control");
      return;
    }
    setGestureError("");
    setGestureStatus("Starting hand signals...");
    await loadScript(GESTURE_SCRIPT_TF, "tfjs-reels-gesture");
    await loadScript(GESTURE_SCRIPT_HANDPOSE, "handpose-reels-gesture");
    if (!window.handpose) throw new Error("Hand model unavailable in this browser");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported");

    if (!handModelRef.current) {
      handModelRef.current = await window.handpose.load();
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
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
      if (!gestureRunningRef.current || !cameraVideoRef.current || !handModelRef.current) return;
      try {
        const predictions = await handModelRef.current.estimateHands(cameraVideoRef.current, true);
        if (predictions.length) {
          const handState = readHandState(predictions[0].landmarks);
          const now = Date.now();
          const pose = handState?.pose || "none";
          if (pose !== activePoseRef.current) {
            activePoseRef.current = pose;
            poseFramesRef.current = pose === "none" ? 0 : 1;
            poseConsumedRef.current = false;
          } else if (pose !== "none") {
            poseFramesRef.current += 1;
          } else {
            poseFramesRef.current = 0;
            poseConsumedRef.current = false;
          }

          if (!poseConsumedRef.current) {
            if (
              pose === "one" &&
              poseFramesRef.current >= GESTURE_POSE_HOLD_FRAMES &&
              now - lastScrollAtRef.current > GESTURE_SCROLL_COOLDOWN_MS
            ) {
              lastScrollAtRef.current = now;
              poseConsumedRef.current = true;
              setGestureStatus("1 finger: scrolling up");
              scrollToIndex(currentIndexRef.current - 1);
            } else if (
              pose === "two" &&
              poseFramesRef.current >= GESTURE_POSE_HOLD_FRAMES &&
              now - lastScrollAtRef.current > GESTURE_SCROLL_COOLDOWN_MS
            ) {
              lastScrollAtRef.current = now;
              poseConsumedRef.current = true;
              setGestureStatus("2 fingers: scrolling down");
              scrollToIndex(currentIndexRef.current + 1);
            } else if (
              pose === "ok" &&
              poseFramesRef.current >= GESTURE_OK_HOLD_FRAMES &&
              now - lastLikeAtRef.current > GESTURE_LIKE_COOLDOWN_MS
            ) {
              lastLikeAtRef.current = now;
              poseConsumedRef.current = true;
              const reel = reelsRef.current[currentIndexRef.current];
              if (reel) {
                setGestureStatus("OK sign: liking reel");
                likeReel(reel.id);
              }
            }
          }
        } else {
          poseFramesRef.current = 0;
          activePoseRef.current = "none";
          poseConsumedRef.current = false;
        }
      } catch {
        setGestureError("Unable to read hand gestures");
      }
      detectFrameRef.current = requestAnimationFrame(detect);
    };
    detectFrameRef.current = requestAnimationFrame(detect);
  };

  return (
    <div className="reels-page">
      <div className="reels-gesture-toggle">
        <button
          type="button"
          className={`reels-gesture-btn ${gestureEnabled ? "is-active" : ""}`}
          onClick={() => setGestureEnabled((prev) => !prev)}
          title={`${gestureEnabled ? "Disable hand signals" : "Enable hand signals"} - ${gestureStatus}`}
          aria-label={gestureEnabled ? "Disable hand signals" : "Enable hand signals"}
        >
          {"\u270B"}
        </button>
        {gestureError && <p className="reels-gesture-error">{gestureError}</p>}
      </div>
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
              <div className="reel-frame">
                <video
                  ref={(el) => {
                    if (el) videoRefs.current[reel.id] = el;
                  }}
                  src={videoUrl}
                  loop
                  muted={mutedByPost[reel.id] ?? false}
                  playsInline
                  controls={false}
                  className="reel-video"
                  onClick={() => handleReelTap(reel)}
                />
                <div className="reel-gradient-top" />
                <div className="reel-gradient-bottom" />
                <div className="reel-top-bar">
                  <h3 className="reel-top-title">Reels</h3>
                  <span className="reel-top-chip">For You</span>
                </div>
              </div>

              {tapLikeBurstByPost[reel.id] && <div className="reel-like-burst">{"\u{1F44C}"}</div>}

              <aside className="reel-actions">
                <button
                  type="button"
                  className="reel-action-btn"
                  onClick={() => toggleMute(reel.id)}
                  title={mutedByPost[reel.id] ? "Unmute" : "Mute"}
                >
                  <span>{mutedByPost[reel.id] ? "\u{1F507}" : "\u{1F50A}"}</span>
                </button>
                <button
                  type="button"
                  className={`reel-action-btn ${likedPostIds[reel.id] ? "is-active" : ""}`}
                  onClick={() => likeReel(reel.id)}
                  title="Like"
                >
                  <span>{"\u{1F44C}"}</span>
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
                  <span>{savedPostIds[reel.id] ? <BsBookmarkFill /> : <FiBookmark />}</span>
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
                  <span className="reel-owner-avatar">{ownerName.charAt(0).toUpperCase()}</span>
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


