import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Room, RoomEvent, Track, createLocalTracks } from "livekit-client";
import api from "../api/axios";
import { clearLiveBroadcast, readLiveBroadcast, subscribeLiveBroadcast, writeLiveBroadcast } from "../utils/liveBroadcast";
import { CONTENT_TYPE_OPTIONS, readContentTypePrefs } from "./contentPrefs";
import "./LiveStart.css";

const FILTER_OPTIONS = [
  { key: "normal", label: "Normal", css: "none" },
  { key: "warm", label: "Warm", css: "brightness(1.05) saturate(1.2) sepia(0.15)" },
  { key: "cool", label: "Cool", css: "brightness(1.03) contrast(1.08) saturate(0.95) hue-rotate(10deg)" },
  { key: "vivid", label: "Vivid", css: "brightness(1.07) contrast(1.15) saturate(1.3)" },
  { key: "mono", label: "Mono", css: "grayscale(1) contrast(1.1)" },
  { key: "cinema", label: "Cinema", css: "contrast(1.12) saturate(0.92) brightness(0.98)" }
];

const LANGUAGE_OPTIONS = [
  { key: "en", label: "English" },
  { key: "hi", label: "Hindi" },
  { key: "te", label: "Telugu" },
  { key: "ta", label: "Tamil" },
  { key: "kn", label: "Kannada" },
  { key: "ml", label: "Malayalam" }
];
const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 2,
  sampleRate: 48000,
  sampleSize: 16
};
const CAMERA_VIDEO_HIGH = {
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
  frameRate: { ideal: 60, max: 60 },
  facingMode: "user"
};
const CAMERA_VIDEO_MEDIUM = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: "user"
};
const CAMERA_VIDEO_LOW = {
  width: { ideal: 960, max: 1280 },
  height: { ideal: 540, max: 720 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: "user"
};
const SCREEN_VIDEO_HIGH = {
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
  frameRate: { ideal: 60, max: 60 }
};
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || "";
const LIVE_CONTENT_TYPE_KEY = "socialsea_live_content_type_v1";
const LIVE_VIEW_RATIO_KEY = "socialsea_live_view_ratio_v1";
const LIVE_VIEW_MIRROR_KEY = "socialsea_live_view_mirror_v1";
const LIVE_PREVIEW_CHANNEL = "socialsea_live_preview_channel_v1";
const LIVE_PREVIEW_FRAME_KEY = "socialsea_live_preview_frame_v1";
const LIVE_PREVIEW_FRAME_KEY_PREFIX = "socialsea_live_preview_frame_v1_";
const LIVE_PREVIEW_GLOBAL_KEY = "global";
const LIVE_PREVIEW_RTC_KEY = "socialsea_live_preview_rtc_signal_v1";
const LIVE_PREVIEW_RTC_HOST_KEY = "socialsea_live_preview_rtc_host_v1";
const LIVE_PREVIEW_RTC_VIEWER_KEY = "socialsea_live_preview_rtc_viewer_v1";
const LIVE_PREVIEW_FRAME_INTERVAL_MS = 360;
const LIVE_PREVIEW_STALE_MS = 2000;

const readContentTypeConfig = () => {
  const prefs = readContentTypePrefs();
  const allowed = new Set(prefs.contentTypes);
  const options = CONTENT_TYPE_OPTIONS.filter((opt) => allowed.has(opt.value));
  const safeOptions = options.length ? options : CONTENT_TYPE_OPTIONS;
  const defaultType =
    safeOptions.find((opt) => opt.value === prefs.defaultType)?.value ||
    safeOptions[0]?.value ||
    "study";
  return { options: safeOptions, defaultType };
};

const readStoredLiveContentType = (allowed, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = String(localStorage.getItem(LIVE_CONTENT_TYPE_KEY) || "").trim().toLowerCase();
    if (raw && allowed.has(raw)) return raw;
  } catch {
    // ignore storage read errors
  }
  return fallback;
};

export default function LiveStart({ mode = "host" }) {
  const navigate = useNavigate();
  const isViewerMode = mode === "watch";
  const livekitEnabled = Boolean(LIVEKIT_URL);
  const initialContentTypeConfig = readContentTypeConfig();
  const [liveState, setLiveState] = useState(() => readLiveBroadcast());
  const [liveSyncError, setLiveSyncError] = useState("");
  const [title, setTitle] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [viewerAudioEnabled, setViewerAudioEnabled] = useState(false);
  const [showViewerAudioDetails, setShowViewerAudioDetails] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [filterKey, setFilterKey] = useState("normal");
  const [languageKey, setLanguageKey] = useState("en");
  const [contentTypeConfig, setContentTypeConfig] = useState(initialContentTypeConfig);
  const [contentType, setContentType] = useState(() => {
    const allowed = new Set(initialContentTypeConfig.options.map((opt) => opt.value));
    return readStoredLiveContentType(allowed, initialContentTypeConfig.defaultType);
  });
  const [viewerLanguage, setViewerLanguage] = useState(() => localStorage.getItem("live_view_language") || "en");
  const [translateEnabled, setTranslateEnabled] = useState(() => localStorage.getItem("live_translate_on") === "1");
  const [hostRatio, setHostRatio] = useState(() => localStorage.getItem(LIVE_VIEW_RATIO_KEY) || "vertical");
  const [viewerNotice, setViewerNotice] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [liveFrameUrl, setLiveFrameUrl] = useState("");
  const [viewerFrameReady, setViewerFrameReady] = useState(false);
  const [viewerStreamReady, setViewerStreamReady] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState(null);
  const [showDebugDetails, setShowDebugDetails] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const viewerAudioEnabledRef = useRef(false);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const livePreviewChannelRef = useRef(null);
  const lastFrameAtRef = useRef(0);
  const debugRef = useRef({ framesSent: 0, lastFrameAt: 0, lastSignal: "", rtcState: "idle", lastRecv: "" });
  const rtcHostPeerRef = useRef(null);
  const rtcHostViewerIdRef = useRef("");
  const rtcViewerPeerRef = useRef(null);
  const rtcViewerIdRef = useRef("");
  const lastRtcAtRef = useRef({ host: 0, viewer: 0 });
  const lastLiveSyncRef = useRef("");
  const livekitRoomRef = useRef(null);
  const livekitConnectingRef = useRef(false);
  const livekitLocalTracksRef = useRef([]);
  const livekitRemoteStreamRef = useRef(null);
  const livekitRemoteScreenStreamRef = useRef(null);
  const livekitRemoteAudioStreamRef = useRef(null);
  const livekitIdentityRef = useRef({ host: "", viewer: "" });
  const [livekitStatus, setLivekitStatus] = useState(livekitEnabled ? "idle" : "disabled");

  useEffect(() => {
    const unsubscribe = subscribeLiveBroadcast((next) => setLiveState(next));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      stopAllStreams();
      stopLivekitRoom("idle");
      if (livePreviewChannelRef.current) {
        livePreviewChannelRef.current.close();
        livePreviewChannelRef.current = null;
      }
      if (rtcHostPeerRef.current) {
        rtcHostPeerRef.current.close();
        rtcHostPeerRef.current = null;
      }
      if (rtcViewerPeerRef.current) {
        rtcViewerPeerRef.current.close();
        rtcViewerPeerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const next = readContentTypeConfig();
      setContentTypeConfig(next);
      setContentType((prev) => {
        const allowed = new Set(next.options.map((opt) => opt.value));
        if (allowed.has(prev)) return prev;
        return readStoredLiveContentType(allowed, next.defaultType);
      });
    };
    refresh();
    window.addEventListener("ss-settings-update", refresh);
    return () => window.removeEventListener("ss-settings-update", refresh);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(LIVE_CONTENT_TYPE_KEY, contentType);
    } catch {
      // ignore storage failures
    }
  }, [contentType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(LIVE_VIEW_RATIO_KEY, hostRatio);
      localStorage.setItem(LIVE_VIEW_MIRROR_KEY, "1");
    } catch {
      // ignore storage failures
    }
  }, [hostRatio]);

  useEffect(() => {
    if (!title) {
      const name =
        localStorage.getItem("name") ||
        localStorage.getItem("username") ||
        localStorage.getItem("email") ||
        "Creator";
      setTitle(`Live with ${name}`);
    }
  }, [title]);

  const hostName = useMemo(() => {
    const raw =
      localStorage.getItem("name") ||
      localStorage.getItem("username") ||
      localStorage.getItem("email") ||
      "Creator";
    return String(raw).split("@")[0];
  }, []);

  const buildFallbackKey = (state) => {
    const host = String(state?.hostName || hostName || "").trim().toLowerCase();
    const titleValue = String(state?.title || title || "").trim().toLowerCase();
    const raw = `${host || "host"}|${titleValue || "live"}`;
    return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  };

  const fallbackLiveKey = useMemo(
    () => buildFallbackKey(liveState),
    [liveState?.hostName, liveState?.title, hostName, title]
  );
  const livePreviewId = useMemo(() => {
    const raw = liveState?.id || liveState?.startedAt || fallbackLiveKey || "";
    return String(raw || "").trim();
  }, [liveState?.id, liveState?.startedAt, fallbackLiveKey]);
  const liveRoomId = useMemo(() => {
    const raw = liveState?.id || liveState?.startedAt || fallbackLiveKey || "";
    const id = String(raw || "").trim();
    if (!id) return "";
    return `live_${id}`;
  }, [liveState?.id, liveState?.startedAt, fallbackLiveKey]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const timer = setInterval(() => {
      let frameSize = 0;
      let rtcHostSize = 0;
      let rtcViewerSize = 0;
      try {
        frameSize = (localStorage.getItem(LIVE_PREVIEW_FRAME_KEY) || "").length;
        rtcHostSize = (localStorage.getItem(LIVE_PREVIEW_RTC_HOST_KEY) || "").length;
        rtcViewerSize = (localStorage.getItem(LIVE_PREVIEW_RTC_VIEWER_KEY) || "").length;
      } catch {
        // ignore
      }
      setDebugSnapshot({
        mode: isViewerMode ? "viewer" : "host",
        livePreviewId,
        fallbackLiveKey,
        liveRoomId,
        livekitStatus,
        previewReady,
        viewerFrameReady,
        viewerStreamReady,
        framesSent: debugRef.current.framesSent,
        lastFrameAt: debugRef.current.lastFrameAt,
        lastSignal: debugRef.current.lastSignal,
        lastRecv: debugRef.current.lastRecv,
        rtcState: debugRef.current.rtcState,
        frameSize,
        rtcHostSize,
        rtcViewerSize
      });
    }, 600);
    return () => clearInterval(timer);
  }, [isViewerMode, previewReady, viewerFrameReady, viewerStreamReady, livePreviewId, fallbackLiveKey, liveRoomId, livekitStatus]);

  const liveFrameKeyFor = (id) =>
    `${LIVE_PREVIEW_FRAME_KEY_PREFIX}${String(id || "").trim()}`;

  const stopStream = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
  };

  const stopLivekitTracks = () => {
    livekitLocalTracksRef.current.forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
    livekitLocalTracksRef.current = [];
  };

  const stopLivekitRoom = (nextStatus = "idle") => {
    try {
      livekitRoomRef.current?.disconnect();
    } catch {
      // ignore
    }
    livekitRoomRef.current = null;
    livekitConnectingRef.current = false;
    livekitRemoteStreamRef.current = null;
    livekitRemoteScreenStreamRef.current = null;
    livekitRemoteAudioStreamRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setViewerStreamReady(false);
    setLivekitStatus(nextStatus);
  };

  const sanitizeIdentity = (value, maxLength = 24) =>
    String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, maxLength);

  const getLivekitIdentity = (role) => {
    const key = role === "viewer" ? "viewer" : "host";
    if (livekitIdentityRef.current[key]) return livekitIdentityRef.current[key];
    const baseRaw =
      localStorage.getItem("username") ||
      localStorage.getItem("name") ||
      localStorage.getItem("email") ||
      "user";
    const base = sanitizeIdentity(String(baseRaw).split("@")[0], 18) || "user";
    const roomHint = sanitizeIdentity(liveRoomId || "live", 20);
    const random = Math.random().toString(36).slice(2, 8);
    const identity = `${base}-${roomHint}-${key}-${random}`;
    livekitIdentityRef.current[key] = identity;
    return identity;
  };

  const resolveLivekitError = (err, fallback) => {
    const serverMessage = err?.response?.data?.message;
    if (serverMessage) return serverMessage;
    if (err?.message) return err.message;
    return fallback;
  };

  const stopAllStreams = () => {
    stopStream(cameraStreamRef.current);
    stopStream(screenStreamRef.current);
    stopLivekitTracks();
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
  };

  const applyStreamToVideo = (stream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (stream) {
      video.play().catch(() => {});
    }
  };

  const applyStreamHints = (stream, { videoHint = "motion", audioHint = "speech" } = {}) => {
    if (!stream) return;
    try {
      stream.getVideoTracks().forEach((track) => {
        try {
          track.contentHint = videoHint;
        } catch {
          // ignore unsupported contentHint
        }
      });
      stream.getAudioTracks().forEach((track) => {
        try {
          track.contentHint = audioHint;
        } catch {
          // ignore unsupported contentHint
        }
      });
    } catch {
      // ignore hint failures
    }
  };

  const applyLivekitTrackHints = (tracks, { videoHint = "motion", audioHint = "speech" } = {}) => {
    if (!Array.isArray(tracks)) return;
    tracks.forEach((track) => {
      const kind = track?.mediaStreamTrack?.kind;
      if (kind === "video") {
        try {
          track.mediaStreamTrack.contentHint = videoHint;
        } catch {
          // ignore unsupported contentHint
        }
      }
      if (kind === "audio") {
        try {
          track.mediaStreamTrack.contentHint = audioHint;
        } catch {
          // ignore unsupported contentHint
        }
      }
    });
  };

  const attachViewerAudioStream = (stream) => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const isEnabled = viewerAudioEnabledRef.current;
    audioEl.srcObject = stream || null;
    audioEl.muted = !isEnabled;
    if (stream && isEnabled) {
      audioEl.play?.().catch(() => {});
    }
  };

  const attachViewerVideoStream = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const screenStream = livekitRemoteScreenStreamRef.current;
    const cameraStream = livekitRemoteStreamRef.current;
    const nextStream = screenStream || cameraStream || null;
    videoEl.srcObject = nextStream;
    if (nextStream) {
      videoEl.play?.().catch(() => {});
    }
    const hasVideo = Boolean(nextStream?.getVideoTracks?.().length);
    setViewerStreamReady(hasVideo);
  };

  const getBestCameraStream = async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not supported in this browser.");
    }
    const presets = [CAMERA_VIDEO_HIGH, CAMERA_VIDEO_MEDIUM, CAMERA_VIDEO_LOW];
    for (const video of presets) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
          video
        });
        applyStreamHints(stream, { videoHint: "motion", audioHint: "speech" });
        return stream;
      } catch {
        // try next preset
      }
    }
    const fallback = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: "user" }
    });
    applyStreamHints(fallback, { videoHint: "motion", audioHint: "speech" });
    return fallback;
  };

  const createLivekitCameraTracks = async () => {
    const presets = [CAMERA_VIDEO_HIGH, CAMERA_VIDEO_MEDIUM, CAMERA_VIDEO_LOW];
    for (const video of presets) {
      try {
        const tracks = await createLocalTracks({
          audio: AUDIO_CONSTRAINTS,
          video
        });
        applyLivekitTrackHints(tracks, { videoHint: "motion", audioHint: "speech" });
        return tracks;
      } catch {
        // try next preset
      }
    }
    const fallbackTracks = await createLocalTracks({
      audio: true,
      video: { facingMode: "user" }
    });
    applyLivekitTrackHints(fallbackTracks, { videoHint: "motion", audioHint: "speech" });
    return fallbackTracks;
  };

  const getBestScreenStream = async () => {
    if (!navigator?.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen share is not supported in this browser.");
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: SCREEN_VIDEO_HIGH,
        audio: true
      });
      applyStreamHints(stream, { videoHint: "detail", audioHint: "speech" });
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        applyStreamHints(stream, { videoHint: "detail", audioHint: "speech" });
        return stream;
      } catch {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        applyStreamHints(stream, { videoHint: "detail", audioHint: "speech" });
        return stream;
      }
    }
  };

  const boostRtcVideoQuality = (pc, isShare) => {
    if (!pc || typeof pc.getSenders !== "function") return;
    const maxBitrate = isShare ? 6_000_000 : 4_000_000;
    const maxFramerate = isShare ? 60 : 30;
    pc.getSenders().forEach((sender) => {
      if (!sender?.track || sender.track.kind !== "video") return;
      if (typeof sender.getParameters !== "function") return;
      try {
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBitrate;
        params.encodings[0].maxFramerate = maxFramerate;
        params.degradationPreference = "maintain-resolution";
        sender.setParameters(params).catch(() => {});
      } catch {
        // ignore unsupported sender params
      }
    });
  };

  const ensureCameraPreview = async () => {
    setMediaError("");
    try {
      if (livekitEnabled) {
        if (liveState?.active && livekitLocalTracksRef.current.length) {
          setMediaError("Stop live before refreshing the camera.");
          return;
        }
        stopLivekitTracks();
        const tracks = await createLivekitCameraTracks();
        livekitLocalTracksRef.current = tracks;
        const stream = new MediaStream();
        tracks.forEach((track) => stream.addTrack(track.mediaStreamTrack));
        cameraStreamRef.current = stream;
        applyStreamToVideo(stream);
        setPreviewReady(true);
        setScreenSharing(false);
        setAudioEnabled(true);
        setVideoEnabled(true);
        return;
      }

      const stream = await getBestCameraStream();
      cameraStreamRef.current = stream;
      applyStreamToVideo(stream);
      setPreviewReady(true);
      setScreenSharing(false);
      setAudioEnabled(true);
      setVideoEnabled(true);
    } catch (err) {
      setMediaError(err?.message || "Camera permission denied.");
    }
  };

  const toggleAudio = () => {
    const stream = screenSharing ? screenStreamRef.current : cameraStreamRef.current;
    if (!stream) return;
    const next = !audioEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    if (livekitEnabled && livekitLocalTracksRef.current.length) {
      livekitLocalTracksRef.current.forEach((track) => {
        if (track?.mediaStreamTrack?.kind === "audio") {
          try {
            track.setEnabled?.(next);
          } catch {
            // ignore
          }
          track.mediaStreamTrack.enabled = next;
        }
      });
    }
    setAudioEnabled(next);
  };

  const toggleVideo = () => {
    const stream = screenSharing ? screenStreamRef.current : cameraStreamRef.current;
    if (!stream) return;
    const next = !videoEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    if (livekitEnabled && livekitLocalTracksRef.current.length) {
      livekitLocalTracksRef.current.forEach((track) => {
        if (track?.mediaStreamTrack?.kind === "video") {
          try {
            track.setEnabled?.(next);
          } catch {
            // ignore
          }
          track.mediaStreamTrack.enabled = next;
        }
      });
    }
    setVideoEnabled(next);
  };

  const startScreenShare = async () => {
    setMediaError("");
    try {
      if (livekitEnabled) {
        const room = livekitRoomRef.current;
        if (!room) {
          setMediaError("Start live before sharing the screen.");
          return;
        }
        if (screenSharing) {
          await room.localParticipant.setScreenShareEnabled(false);
          setScreenSharing(false);
          if (cameraStreamRef.current) {
            applyStreamToVideo(cameraStreamRef.current);
          }
          return;
        }
        const pub = await room.localParticipant.setScreenShareEnabled(true);
        const screenTrack = pub?.track?.mediaStreamTrack;
        const audioPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
        const audioTrack = audioPub?.track?.mediaStreamTrack;
        if (screenTrack) {
          try {
            screenTrack.contentHint = "detail";
          } catch {
            // ignore unsupported contentHint
          }
        }
        if (audioTrack) {
          try {
            audioTrack.contentHint = "speech";
          } catch {
            // ignore unsupported contentHint
          }
        }
        const previewStream = new MediaStream();
        if (screenTrack) previewStream.addTrack(screenTrack);
        if (audioTrack) previewStream.addTrack(audioTrack);
        if (previewStream.getTracks().length) {
          applyStreamToVideo(previewStream);
          setPreviewReady(true);
        }
        if (screenTrack) {
          screenTrack.addEventListener("ended", () => {
            room.localParticipant.setScreenShareEnabled(false).catch(() => {});
            setScreenSharing(false);
            if (cameraStreamRef.current) {
              applyStreamToVideo(cameraStreamRef.current);
            }
          }, { once: true });
        }
        setScreenSharing(true);
        return;
      }
      const displayStream = await getBestScreenStream();
      screenStreamRef.current = displayStream;
      applyStreamToVideo(displayStream);
      setScreenSharing(true);
      setPreviewReady(true);
      const screenTrack = displayStream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.addEventListener("ended", () => {
          stopStream(screenStreamRef.current);
          screenStreamRef.current = null;
          setScreenSharing(false);
          if (cameraStreamRef.current) {
            applyStreamToVideo(cameraStreamRef.current);
          } else {
            setPreviewReady(false);
            applyStreamToVideo(null);
          }
        });
      }
    } catch (err) {
      setMediaError(err?.message || "Screen share was blocked.");
    }
  };

  const stopPreview = () => {
    if (livekitEnabled && liveState?.active) {
      setMediaError("Stop live before stopping the preview.");
      return;
    }
    stopAllStreams();
    applyStreamToVideo(null);
    setPreviewReady(false);
    setScreenSharing(false);
  };

  const activeFilterKey = isViewerMode ? (liveState?.filter || filterKey) : filterKey;
  const activeFilter = useMemo(
    () => FILTER_OPTIONS.find((item) => item.key === activeFilterKey) || FILTER_OPTIONS[0],
    [activeFilterKey]
  );
  const hostLanguageLabel = useMemo(() => {
    const match = LANGUAGE_OPTIONS.find((opt) => opt.key === String(liveState?.language || ""));
    return match?.label || "";
  }, [liveState?.language]);

  const buildLivePayload = (overrides = {}) => {
    const now = Date.now();
    return {
      id: liveState?.id || now,
      title: title.trim() || liveState?.title || `Live with ${hostName}`,
      hostName: liveState?.hostName || hostName,
      language: languageKey,
      filter: filterKey,
      screenSharing,
      screenRatio: hostRatio,
      contentType,
      startedAt: liveState?.startedAt || now,
      expiresAt: liveState?.expiresAt || now + 2 * 60 * 60 * 1000,
      active: true,
      ...overrides
    };
  };

  const startLive = async () => {
    setLiveSyncError("");
    if (!livekitEnabled) {
      setLiveSyncError("LiveKit is not configured. Set VITE_LIVEKIT_URL and backend LIVEKIT keys.");
      return;
    }
    const now = Date.now();
    const ok = await writeLiveBroadcast(buildLivePayload({ id: now, startedAt: now }));
    if (!ok) {
      setLiveSyncError("Live started locally, but server sync failed. Restart backend or deploy live API.");
    }
  };

  const endLive = () => {
    stopLivekitRoom("idle");
    clearLiveBroadcast();
  };

  useEffect(() => {
    if (isViewerMode) return;
    if (!liveState?.active) return;
    const payload = buildLivePayload();
    const signature = JSON.stringify({
      id: payload.id,
      title: payload.title,
      language: payload.language,
      filter: payload.filter,
      screenSharing: payload.screenSharing,
      screenRatio: payload.screenRatio,
      contentType: payload.contentType
    });
    if (signature === lastLiveSyncRef.current) return;
    lastLiveSyncRef.current = signature;
    writeLiveBroadcast(payload).catch(() => {});
  }, [
    isViewerMode,
    liveState?.active,
    liveState?.id,
    liveState?.startedAt,
    liveState?.expiresAt,
    liveState?.title,
    liveState?.hostName,
    title,
    hostName,
    languageKey,
    filterKey,
    screenSharing,
    hostRatio,
    contentType
  ]);

  const showViewerNotice = (text) => {
    setViewerNotice(text);
    window.setTimeout(() => setViewerNotice(""), 1800);
  };

  const onViewerLanguageChange = (value) => {
    setViewerLanguage(value);
    localStorage.setItem("live_view_language", value);
    showViewerNotice("Language preference saved. Auto-translation needs live captions.");
  };

  const onToggleTranslate = () => {
    const next = !translateEnabled;
    setTranslateEnabled(next);
    localStorage.setItem("live_translate_on", next ? "1" : "0");
    showViewerNotice(next
      ? "Translation enabled (requires live captions/audio pipeline)."
      : "Translation disabled.");
  };

  const toggleViewerAudio = () => {
    setViewerAudioEnabled((prev) => {
      const next = !prev;
      if (next && audioRef.current) {
        audioRef.current.play?.().catch(() => {});
      }
      return next;
    });
  };

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    viewerAudioEnabledRef.current = viewerAudioEnabled;
    audioEl.muted = !viewerAudioEnabled;
    if (viewerAudioEnabled) {
      audioEl.play?.().catch(() => {});
    }
  }, [viewerAudioEnabled]);

  const viewerRatioValue = isViewerMode ? (liveState?.screenRatio || hostRatio || "vertical") : hostRatio;
  const viewerRatioClass = `ratio-${viewerRatioValue}`;
  const viewerTransform = isViewerMode ? "scaleX(-1)" : "none";

  const getActiveStream = () => (screenSharing ? screenStreamRef.current : cameraStreamRef.current);
  const ensurePreviewChannel = () => {
    try {
      if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
        livePreviewChannelRef.current = new BroadcastChannel(LIVE_PREVIEW_CHANNEL);
      }
    } catch {
      // ignore
    }
    return livePreviewChannelRef.current;
  };

  const sendRtcSignal = (payload) => {
    const channel = ensurePreviewChannel();
    try {
      channel?.postMessage(payload);
    } catch {
      // ignore
    }
    try {
      const storageKey = payload?.from === "host" ? LIVE_PREVIEW_RTC_HOST_KEY : LIVE_PREVIEW_RTC_VIEWER_KEY;
      localStorage.setItem(storageKey, JSON.stringify({ ...payload, at: Date.now() }));
      localStorage.setItem(LIVE_PREVIEW_RTC_KEY, JSON.stringify({ ...payload, at: Date.now() }));
    } catch {
      // ignore
    }
    debugRef.current.lastSignal = `${payload?.type || "signal"}:${payload?.from || ""}->${payload?.to || ""}`;
  };

  const closeRtcPeer = (peerRef) => {
    if (peerRef.current) {
      try {
        peerRef.current.onicecandidate = null;
        peerRef.current.ontrack = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.close();
      } catch {
        // ignore
      }
      peerRef.current = null;
    }
  };

  useEffect(() => {
    if (isViewerMode) return undefined;
    if (!livekitEnabled) return undefined;
    if (!liveState?.active || !liveRoomId) {
      stopLivekitRoom("idle");
      return undefined;
    }

    let cancelled = false;

    const connectHost = async () => {
      if (livekitRoomRef.current || livekitConnectingRef.current) return;
      livekitConnectingRef.current = true;
      setLivekitStatus("connecting");
      setMediaError("");
      try {
        if (!previewReady) {
          await ensureCameraPreview();
        }
        if (!LIVEKIT_URL) {
          setMediaError("LiveKit URL is missing.");
          stopLivekitRoom("error");
          return;
        }
        const tokenRes = await api.post("/api/livekit/token", {
          room: liveRoomId,
          mode: "host",
          identity: getLivekitIdentity("host")
        });
        const token = tokenRes?.data?.token;
        if (!token) throw new Error("missing-token");

        const room = new Room({ adaptiveStream: true, dynacast: true });
        room.on(RoomEvent.Disconnected, () => {
          setLivekitStatus("disconnected");
        });
        await room.connect(LIVEKIT_URL, token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        livekitRoomRef.current = room;

        let tracks = livekitLocalTracksRef.current;
        if (!tracks.length) {
          tracks = await createLivekitCameraTracks();
          livekitLocalTracksRef.current = tracks;
          const stream = new MediaStream();
          tracks.forEach((track) => stream.addTrack(track.mediaStreamTrack));
          cameraStreamRef.current = stream;
          applyStreamToVideo(stream);
          setPreviewReady(true);
        }
        tracks.forEach((track) => {
          if (track?.mediaStreamTrack?.kind === "audio") {
            track.setEnabled?.(audioEnabled);
            track.mediaStreamTrack.enabled = audioEnabled;
          }
          if (track?.mediaStreamTrack?.kind === "video") {
            track.setEnabled?.(videoEnabled);
            track.mediaStreamTrack.enabled = videoEnabled;
          }
        });
        const publishResults = await Promise.allSettled(
          tracks.map((track) => room.localParticipant.publishTrack(track))
        );
        if (tracks.length && !publishResults.some((result) => result.status === "fulfilled")) {
          const firstFailure = publishResults.find((result) => result.status === "rejected");
          throw firstFailure?.reason || new Error("LiveKit could not publish local media.");
        }
        setLivekitStatus("connected");
      } catch (err) {
        setMediaError(resolveLivekitError(err, "LiveKit connection failed."));
        stopLivekitRoom("error");
      } finally {
        livekitConnectingRef.current = false;
      }
    };

    connectHost();

    return () => {
      cancelled = true;
    };
  }, [isViewerMode, livekitEnabled, liveState?.active, liveRoomId, previewReady, audioEnabled, videoEnabled]);

  useEffect(() => {
    if (!isViewerMode) return undefined;
    if (!livekitEnabled) return undefined;
    if (!liveState?.active || !liveRoomId) {
      stopLivekitRoom("idle");
      setLiveFrameUrl("");
      return undefined;
    }

    let cancelled = false;

    const connectViewer = async () => {
      if (livekitRoomRef.current || livekitConnectingRef.current) return;
      livekitConnectingRef.current = true;
      setLivekitStatus("connecting");
      setMediaError("");
      try {
        if (!LIVEKIT_URL) {
          setMediaError("LiveKit URL is missing.");
          stopLivekitRoom("error");
          return;
        }
        const tokenRes = await api.post("/api/livekit/token", {
          room: liveRoomId,
          mode: "viewer",
          identity: getLivekitIdentity("viewer")
        });
        const token = tokenRes?.data?.token;
        if (!token) throw new Error("missing-token");

        const room = new Room({ adaptiveStream: true, dynacast: true });
        room.on(RoomEvent.Disconnected, () => {
          setViewerStreamReady(false);
          setLivekitStatus("disconnected");
        });
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (!track) return;
          if (track.kind === "audio") {
            let audioStream = livekitRemoteAudioStreamRef.current;
            if (!audioStream) {
              audioStream = new MediaStream();
              livekitRemoteAudioStreamRef.current = audioStream;
            }
            try {
              audioStream.addTrack(track.mediaStreamTrack);
            } catch {
              // ignore duplicate tracks
            }
            attachViewerAudioStream(audioStream);
          }
          if (track.kind === "video") {
            const isScreen = track.source === Track.Source.ScreenShare;
            if (isScreen) {
              let screenStream = livekitRemoteScreenStreamRef.current;
              if (!screenStream) {
                screenStream = new MediaStream();
                livekitRemoteScreenStreamRef.current = screenStream;
              }
              try {
                screenStream.addTrack(track.mediaStreamTrack);
              } catch {
                // ignore duplicate tracks
              }
            } else {
              let stream = livekitRemoteStreamRef.current;
              if (!stream) {
                stream = new MediaStream();
                livekitRemoteStreamRef.current = stream;
              }
              try {
                stream.addTrack(track.mediaStreamTrack);
              } catch {
                // ignore duplicate tracks
              }
            }
            attachViewerVideoStream();
          }
          setLivekitStatus("connected");
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (!track) return;
          if (track.kind === "audio") {
            const audioStream = livekitRemoteAudioStreamRef.current;
            if (!audioStream) return;
            try {
              audioStream.removeTrack(track.mediaStreamTrack);
            } catch {
              // ignore
            }
            if (!audioStream.getTracks().length) {
              livekitRemoteAudioStreamRef.current = null;
              attachViewerAudioStream(null);
            }
            return;
          }
          if (track.kind === "video") {
            const isScreen = track.source === Track.Source.ScreenShare;
            const targetStream = isScreen ? livekitRemoteScreenStreamRef.current : livekitRemoteStreamRef.current;
            if (targetStream) {
              try {
                targetStream.removeTrack(track.mediaStreamTrack);
              } catch {
                // ignore
              }
              if (!targetStream.getTracks().length) {
                if (isScreen) {
                  livekitRemoteScreenStreamRef.current = null;
                } else {
                  livekitRemoteStreamRef.current = null;
                }
              }
            }
            attachViewerVideoStream();
          }
        });
        await room.connect(LIVEKIT_URL, token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        livekitRoomRef.current = room;
      } catch (err) {
        setMediaError(resolveLivekitError(err, "LiveKit connection failed."));
        stopLivekitRoom("error");
      } finally {
        livekitConnectingRef.current = false;
      }
    };

    connectViewer();

    return () => {
      cancelled = true;
    };
  }, [isViewerMode, livekitEnabled, liveState?.active, liveRoomId]);

  useEffect(() => {
    if (!livekitEnabled) return;
    const tracks = livekitLocalTracksRef.current;
    if (!tracks.length) return;
    tracks.forEach((track) => {
      if (track?.mediaStreamTrack?.kind === "audio") {
        track.setEnabled?.(audioEnabled);
        track.mediaStreamTrack.enabled = audioEnabled;
      }
      if (track?.mediaStreamTrack?.kind === "video") {
        track.setEnabled?.(videoEnabled);
        track.mediaStreamTrack.enabled = videoEnabled;
      }
    });
  }, [livekitEnabled, audioEnabled, videoEnabled]);

  useEffect(() => {
    if (isViewerMode) return undefined;
    if (livekitEnabled) return undefined;
    if (!previewReady) return undefined;

    let disposed = false;
    let frameBusy = false;

    ensurePreviewChannel();

    const pickStream = () => (screenSharing ? screenStreamRef.current : cameraStreamRef.current);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return undefined;
    const supportsImageCapture = typeof ImageCapture !== "undefined";

    const sendFrame = async () => {
      if (disposed || frameBusy) return;
      frameBusy = true;
      try {
        let sourceWidth = 0;
        let sourceHeight = 0;
        let bitmap = null;
        let source = null;
        const videoEl = videoRef.current;
        const stream = pickStream();
        const track = stream?.getVideoTracks?.()?.[0] || null;

        if (supportsImageCapture && track) {
          try {
            const capture = new ImageCapture(track);
            bitmap = await capture.grabFrame();
            source = bitmap;
            sourceWidth = bitmap?.width || 0;
            sourceHeight = bitmap?.height || 0;
          } catch {
            bitmap = null;
          }
        }

        if (!source) {
          if (!videoEl) return;
          sourceWidth = videoEl.videoWidth || 0;
          sourceHeight = videoEl.videoHeight || 0;
          source = videoEl;
        }

        if (!sourceWidth || !sourceHeight) return;

        const targetW = Math.min(360, sourceWidth);
        const targetH = Math.max(1, Math.round((targetW * sourceHeight) / sourceWidth));
        canvas.width = targetW;
        canvas.height = targetH;
        try {
          ctx.drawImage(source, 0, 0, targetW, targetH);
        } catch {
          return;
        } finally {
          if (bitmap?.close) {
            try {
              bitmap.close();
            } catch {
              // ignore
            }
          }
        }

        let frame = "";
        try {
          frame = canvas.toDataURL("image/jpeg", 0.55);
        } catch {
          frame = "";
        }
        if (!frame) return;
        const packet = {
          type: "frame",
          id: livePreviewId || fallbackLiveKey || LIVE_PREVIEW_GLOBAL_KEY,
          key: LIVE_PREVIEW_GLOBAL_KEY,
          at: Date.now(),
          frame
        };
        debugRef.current.framesSent += 1;
        debugRef.current.lastFrameAt = Date.now();
        try {
          livePreviewChannelRef.current?.postMessage(packet);
        } catch {
          // ignore
        }
        try {
          localStorage.setItem(LIVE_PREVIEW_FRAME_KEY, JSON.stringify(packet));
          if (livePreviewId) {
            localStorage.setItem(liveFrameKeyFor(livePreviewId), JSON.stringify(packet));
          }
          if (fallbackLiveKey) {
            localStorage.setItem(liveFrameKeyFor(fallbackLiveKey), JSON.stringify(packet));
          }
        } catch {
          // ignore storage issues
        }
      } finally {
        frameBusy = false;
      }
    };

    const timer = setInterval(() => {
      void sendFrame();
    }, LIVE_PREVIEW_FRAME_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(timer);
      const clearPacket = {
        type: "frame-clear",
        id: livePreviewId || fallbackLiveKey || LIVE_PREVIEW_GLOBAL_KEY,
        key: LIVE_PREVIEW_GLOBAL_KEY,
        at: Date.now()
      };
      try {
        livePreviewChannelRef.current?.postMessage(clearPacket);
      } catch {
        // ignore
      }
      try {
        localStorage.setItem(LIVE_PREVIEW_FRAME_KEY, JSON.stringify(clearPacket));
        if (livePreviewId) {
          localStorage.setItem(liveFrameKeyFor(livePreviewId), JSON.stringify(clearPacket));
        }
        if (fallbackLiveKey) {
          localStorage.setItem(liveFrameKeyFor(fallbackLiveKey), JSON.stringify(clearPacket));
        }
      } catch {
        // ignore
      }
    };
  }, [isViewerMode, livePreviewId, fallbackLiveKey, previewReady, screenSharing]);

  useEffect(() => {
    if (isViewerMode) return undefined;
    if (livekitEnabled) return undefined;
    if (!previewReady) {
      closeRtcPeer(rtcHostPeerRef);
      rtcHostViewerIdRef.current = "";
      return undefined;
    }

    const channel = ensurePreviewChannel();
    let onMessage = null;
    let onStorage = null;
    let pollTimer = 0;
    let readyTimer = 0;

    const attachTracks = (pc) => {
      const stream = getActiveStream();
      if (!stream) return;
      const tracks = stream.getTracks();
      tracks.forEach((track) => pc.addTrack(track, stream));
    };

    const replaceTracks = () => {
      const pc = rtcHostPeerRef.current;
      if (!pc) return;
      const stream = getActiveStream();
      if (!stream) return;
      const videoTrack = stream.getVideoTracks?.()[0];
      const audioTrack = stream.getAudioTracks?.()[0];
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === "video" && videoTrack) sender.replaceTrack(videoTrack);
        if (sender.track?.kind === "audio" && audioTrack) sender.replaceTrack(audioTrack);
      });
      boostRtcVideoQuality(pc, screenSharing);
    };

    const startHostPeer = async (viewerId) => {
      closeRtcPeer(rtcHostPeerRef);
      rtcHostViewerIdRef.current = viewerId;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      rtcHostPeerRef.current = pc;
      attachTracks(pc);
      boostRtcVideoQuality(pc, screenSharing);
      pc.onicecandidate = (event) => {
        if (event?.candidate) {
          const candidate =
            typeof event.candidate?.toJSON === "function"
              ? event.candidate.toJSON()
              : event.candidate;
          sendRtcSignal({ type: "rtc-candidate", from: "host", to: viewerId, candidate });
        }
      };
      pc.onconnectionstatechange = () => {
        debugRef.current.rtcState = pc.connectionState || "unknown";
      };
      pc.oniceconnectionstatechange = () => {
        debugRef.current.rtcState = pc.iceConnectionState || pc.connectionState || "unknown";
      };
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdp =
          typeof pc.localDescription?.toJSON === "function"
            ? pc.localDescription.toJSON()
            : pc.localDescription;
        sendRtcSignal({ type: "rtc-offer", from: "host", to: viewerId, sdp });
      } catch {
        // ignore
      }
    };

    const handleRtcMessage = async (data) => {
      const type = String(data?.type || "");
      const from = String(data?.from || "");
      const to = String(data?.to || "");
      debugRef.current.lastRecv = `recv:${type}:${from || "?"}->${to || ""}`;
      if (type === "rtc-join") {
        if (!from) return;
        await startHostPeer(from);
        return;
      }
      if (to && to !== "host") return;
      if (type === "rtc-answer" && data?.sdp) {
        const pc = rtcHostPeerRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } catch {
          // ignore
        }
      }
      if (type === "rtc-candidate" && data?.candidate) {
        const pc = rtcHostPeerRef.current;
        if (!pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          // ignore
        }
      }
    };

    const pollRtcSignal = () => {
      try {
        const raw = localStorage.getItem(LIVE_PREVIEW_RTC_VIEWER_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        const at = Number(data?.at || 0);
        if (at && at <= lastRtcAtRef.current.host) return;
        lastRtcAtRef.current.host = at;
        handleRtcMessage(data || {});
      } catch {
        // ignore
      }
    };

    onMessage = (event) => handleRtcMessage(event?.data || {});
    if (channel) channel.addEventListener("message", onMessage);
    onStorage = (event) => {
      if (event?.key !== LIVE_PREVIEW_RTC_VIEWER_KEY || !event?.newValue) return;
      try {
        handleRtcMessage(JSON.parse(event.newValue));
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    pollRtcSignal();
    pollTimer = window.setInterval(pollRtcSignal, 450);
    readyTimer = window.setInterval(() => {
      sendRtcSignal({ type: "rtc-host-ready", from: "host" });
    }, 1200);

    return () => {
      if (channel && onMessage) channel.removeEventListener("message", onMessage);
      if (onStorage) window.removeEventListener("storage", onStorage);
      if (pollTimer) clearInterval(pollTimer);
      if (readyTimer) clearInterval(readyTimer);
      closeRtcPeer(rtcHostPeerRef);
      rtcHostViewerIdRef.current = "";
    };
  }, [isViewerMode, previewReady, screenSharing]);

  useEffect(() => {
    if (isViewerMode) return;
    if (livekitEnabled) return;
    if (!previewReady) return;
    if (!rtcHostPeerRef.current) return;
    const timer = setTimeout(() => {
      try {
        const stream = getActiveStream();
        if (!stream) return;
        const videoTrack = stream.getVideoTracks?.()[0];
        const audioTrack = stream.getAudioTracks?.()[0];
        rtcHostPeerRef.current?.getSenders().forEach((sender) => {
          if (sender.track?.kind === "video" && videoTrack) sender.replaceTrack(videoTrack);
          if (sender.track?.kind === "audio" && audioTrack) sender.replaceTrack(audioTrack);
        });
      } catch {
        // ignore
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isViewerMode, previewReady, screenSharing, audioEnabled, videoEnabled]);

  useEffect(() => {
    if (!isViewerMode) return undefined;
    if (livekitEnabled) return undefined;

    let disposed = false;
    let onMessage = null;
    let onStorage = null;

    try {
      if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
        livePreviewChannelRef.current = new BroadcastChannel(LIVE_PREVIEW_CHANNEL);
      }
    } catch {
      // ignore broadcast channel failures
    }
    const channel = livePreviewChannelRef.current;

    const handlePacket = (data, allowAny = false) => {
      if (disposed) return;
      const type = String(data?.type || "");
      const incomingId = String(data?.id || "").trim();
      const incomingKey = String(data?.key || "").trim();
      const matchesId =
        (incomingId && incomingId === livePreviewId) ||
        (incomingKey && incomingKey === fallbackLiveKey) ||
        incomingKey === LIVE_PREVIEW_GLOBAL_KEY;
      if (!matchesId && !allowAny) return;
      if (type === "frame-clear") {
        setLiveFrameUrl("");
        setViewerFrameReady(false);
        return;
      }
      const frame = String(data?.frame || "");
      if (!frame) return;
      lastFrameAtRef.current = Date.now();
      setLiveFrameUrl(frame);
      setViewerFrameReady(true);
    };

    onMessage = (event) => handlePacket(event?.data || {});
    if (channel) channel.addEventListener("message", onMessage);

    const readStorageFrame = () => {
      try {
        const rawGlobal = localStorage.getItem(LIVE_PREVIEW_FRAME_KEY);
        if (rawGlobal) {
          const data = JSON.parse(rawGlobal);
          handlePacket(data || {}, true);
          return;
        }
        const raw =
          (livePreviewId ? localStorage.getItem(liveFrameKeyFor(livePreviewId)) : null) ||
          (fallbackLiveKey ? localStorage.getItem(liveFrameKeyFor(fallbackLiveKey)) : null);
        if (!raw) return;
        const data = JSON.parse(raw);
        handlePacket(data || {});
      } catch {
        // ignore
      }
    };

    onStorage = (event) => {
      const key = event?.key;
      if (!key) return;
      if (key === LIVE_PREVIEW_FRAME_KEY) {
        readStorageFrame();
        return;
      }
      if (livePreviewId && key === liveFrameKeyFor(livePreviewId)) {
        readStorageFrame();
        return;
      }
      if (fallbackLiveKey && key === liveFrameKeyFor(fallbackLiveKey)) {
        readStorageFrame();
      }
    };

    window.addEventListener("storage", onStorage);
    const timer = setInterval(() => {
      readStorageFrame();
      if (lastFrameAtRef.current && Date.now() - lastFrameAtRef.current > LIVE_PREVIEW_STALE_MS) {
        setLiveFrameUrl("");
        setViewerFrameReady(false);
      }
    }, 200);
    readStorageFrame();

    return () => {
      disposed = true;
      if (channel && onMessage) channel.removeEventListener("message", onMessage);
      if (onStorage) window.removeEventListener("storage", onStorage);
      clearInterval(timer);
    };
  }, [isViewerMode, livePreviewId, fallbackLiveKey]);

  useEffect(() => {
    if (!isViewerMode) return undefined;
    if (livekitEnabled) return undefined;
    ensurePreviewChannel();

    if (!rtcViewerIdRef.current) {
      rtcViewerIdRef.current = `viewer-${Math.random().toString(36).slice(2, 9)}`;
    }
    const viewerId = rtcViewerIdRef.current;
    const channel = livePreviewChannelRef.current;
    let onMessage = null;
    let onStorage = null;
    let joinTimer = 0;
    let pollTimer = 0;

    const startViewerPeer = () => {
      closeRtcPeer(rtcViewerPeerRef);
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      rtcViewerPeerRef.current = pc;
      pc.onicecandidate = (event) => {
        if (event?.candidate) {
          const candidate =
            typeof event.candidate?.toJSON === "function"
              ? event.candidate.toJSON()
              : event.candidate;
          sendRtcSignal({ type: "rtc-candidate", from: viewerId, to: "host", candidate });
        }
      };
      try {
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
      } catch {
        // ignore if not supported
      }
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState || "unknown";
        debugRef.current.rtcState = state;
        if (state === "failed" || state === "disconnected" || state === "closed") {
          setViewerStreamReady(false);
        }
      };
      pc.oniceconnectionstatechange = () => {
        debugRef.current.rtcState = pc.iceConnectionState || pc.connectionState || "unknown";
      };
      pc.ontrack = (event) => {
        const stream = event?.streams?.[0];
        if (!stream) return;
        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(() => {});
        }
        attachViewerAudioStream(stream);
        setViewerStreamReady(true);
        debugRef.current.rtcState = "connected";
      };
      return pc;
    };

    const handleRtcMessage = async (data) => {
      const type = String(data?.type || "");
      const to = String(data?.to || "");
      const from = String(data?.from || "");
      debugRef.current.lastRecv = `recv:${type}:${from || "?"}->${to || ""}`;
      if (to && to !== viewerId) return;
      if (type === "rtc-host-ready") {
        sendRtcSignal({ type: "rtc-join", from: viewerId, to: "host" });
        return;
      }
      if (type === "rtc-offer" && data?.sdp) {
        const pc = rtcViewerPeerRef.current || startViewerPeer();
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          const sdp =
            typeof pc.localDescription?.toJSON === "function"
              ? pc.localDescription.toJSON()
              : pc.localDescription;
          sendRtcSignal({ type: "rtc-answer", from: viewerId, to: "host", sdp });
        } catch {
          // ignore
        }
      }
      if (type === "rtc-candidate" && data?.candidate && from === "host") {
        const pc = rtcViewerPeerRef.current || startViewerPeer();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {
          // ignore
        }
      }
    };

    onMessage = (event) => handleRtcMessage(event?.data || {});
    if (channel) channel.addEventListener("message", onMessage);
    onStorage = (event) => {
      if (event?.key !== LIVE_PREVIEW_RTC_HOST_KEY || !event?.newValue) return;
      try {
        handleRtcMessage(JSON.parse(event.newValue));
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);

    const sendJoin = () => {
      sendRtcSignal({ type: "rtc-join", from: viewerId, to: "host" });
    };
    sendJoin();
    joinTimer = window.setInterval(sendJoin, 1200);

    const pollRtcSignal = () => {
      try {
        const raw = localStorage.getItem(LIVE_PREVIEW_RTC_HOST_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        const at = Number(data?.at || 0);
        if (at && at <= lastRtcAtRef.current.viewer) return;
        lastRtcAtRef.current.viewer = at;
        handleRtcMessage(data || {});
      } catch {
        // ignore
      }
    };
    pollRtcSignal();
    pollTimer = window.setInterval(pollRtcSignal, 450);

    return () => {
      if (channel && onMessage) channel.removeEventListener("message", onMessage);
      if (onStorage) window.removeEventListener("storage", onStorage);
      if (joinTimer) clearInterval(joinTimer);
      if (pollTimer) clearInterval(pollTimer);
      closeRtcPeer(rtcViewerPeerRef);
      setViewerStreamReady(false);
    };
  }, [isViewerMode]);

  const showPreview = previewReady || isViewerMode;
  const viewerTitle =
    liveState?.title ||
    (liveState?.hostName ? `Live with ${liveState.hostName}` : "Live now");

  return (
    <section className="live-start-page">
      <div className="live-start-card">
        <h1>{isViewerMode ? "Live Now" : "Live Studio"}</h1>
        {isViewerMode && liveState && (
          <p className="live-start-note">{viewerTitle}</p>
        )}
        {showPreview && (
          <div className={`live-start-preview ${viewerRatioClass}`}>
            {liveState && <span className="live-start-live-dot" aria-label="Live" />}
            {isViewerMode ? (
              <>
                <video
                  ref={videoRef}
                  className={`live-start-video ${viewerStreamReady ? "is-visible" : "is-hidden"}`}
                  style={{ filter: activeFilter.css, transform: viewerTransform }}
                  muted
                  autoPlay
                  playsInline
                />
                <audio ref={audioRef} className="live-start-audio" autoPlay playsInline />
                {liveFrameUrl && !viewerStreamReady && (
                  <img
                    src={liveFrameUrl}
                    alt="Live preview"
                    className="live-start-video live-start-video-fallback"
                    style={{ filter: activeFilter.css, transform: viewerTransform }}
                  />
                )}
              </>
            ) : (
              <video
                ref={videoRef}
                className={`live-start-video ${!isViewerMode && !screenSharing ? "is-mirrored" : ""}`}
                style={{
                  filter: activeFilter.css,
                  transform: !isViewerMode && !screenSharing ? "scaleX(-1)" : "none"
                }}
                muted
                autoPlay
                playsInline
              />
            )}
            {!isViewerMode && !videoEnabled && (
              <div className="live-start-preview-empty">
                <p>Camera is off</p>
              </div>
            )}
            {isViewerMode && !viewerFrameReady && !viewerStreamReady && (
              <div className="live-start-preview-empty">
                <p>{liveState ? "Live stream will appear here." : "No live stream available."}</p>
                <span>Waiting for the broadcaster...</span>
              </div>
            )}
          </div>
        )}

        {mediaError && <p className="live-start-error">{mediaError}</p>}
        {liveSyncError && !isViewerMode && <p className="live-start-error">{liveSyncError}</p>}

        {isViewerMode ? (
          <>
            <div className="live-start-controls">
              <button type="button" onClick={toggleViewerAudio}>
                {viewerAudioEnabled ? "Mute Audio" : "Unmute Audio"}
              </button>
            </div>
            <div className="live-viewer-actions" aria-label="Live actions">
              <button type="button" className="live-viewer-action-btn">Like</button>
              <button type="button" className="live-viewer-action-btn">Comment</button>
              <button type="button" className="live-viewer-action-btn">Share</button>
              <button
                type="button"
                className="live-viewer-action-btn"
                onClick={() => setShowViewerAudioDetails((prev) => !prev)}
              >
                {showViewerAudioDetails ? "Hide Audio" : "Show Audio"}
              </button>
            </div>
            {liveState && showViewerAudioDetails && (
              <div className="live-viewer-panel">
                <h3>Audio Language</h3>
                {hostLanguageLabel && (
                  <p className="live-viewer-note">Host language: {hostLanguageLabel}</p>
                )}
                <div className="live-viewer-controls">
                  <label>
                    Listening language
                    <select value={viewerLanguage} onChange={(e) => onViewerLanguageChange(e.target.value)}>
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="live-translate-btn" onClick={onToggleTranslate}>
                    {translateEnabled ? "Translation On" : "Translation Off"}
                  </button>
                </div>
                {viewerNotice && <p className="live-viewer-note">{viewerNotice}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="live-start-controls">
              <button type="button" onClick={ensureCameraPreview}>
                {previewReady && !screenSharing ? "Refresh Camera" : "Enable Camera"}
              </button>
              <button type="button" onClick={toggleAudio} disabled={!previewReady}>
                {audioEnabled ? "Mute Mic" : "Unmute Mic"}
              </button>
              <button type="button" onClick={toggleVideo} disabled={!previewReady}>
                <span className="live-start-btn-label">
                  {videoEnabled ? "Camera Off" : "Camera On"}
                </span>
                {liveState && <span className="live-start-live-dot inline" aria-hidden="true" />}
              </button>
              <button type="button" onClick={startScreenShare}>
                Share Screen
              </button>
              <button type="button" onClick={stopPreview} disabled={!previewReady}>
                Stop Preview
              </button>
            </div>

            <div className="live-start-toolbar">
              <label>
                Filter
                <select value={filterKey} onChange={(e) => setFilterKey(e.target.value)}>
                  {FILTER_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Screen ratio
                <select value={hostRatio} onChange={(e) => setHostRatio(e.target.value)}>
                  <option value="vertical">Vertical (9:16)</option>
                  <option value="horizontal">Horizontal (16:9)</option>
                  <option value="square">Square (1:1)</option>
                </select>
              </label>
              <label>
                Content type
                <select value={contentType} onChange={(e) => setContentType(e.target.value)}>
                  {contentTypeConfig.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Language
                <select value={languageKey} onChange={(e) => setLanguageKey(e.target.value)}>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="live-start-field">
              <label htmlFor="live-title">Live title</label>
              <input
                id="live-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Live with your community"
              />
            </div>
            <div className="live-start-status">
              <span className={`live-start-pill ${liveState ? "is-live" : ""}`}>
                {liveState ? "Live now" : "Not live"}
              </span>
              {liveState && <small>Shared across long videos, short videos, and reels.</small>}
            </div>
            <div className="live-start-actions">
              <button
                type="button"
                className="live-start-btn"
                onClick={liveState ? endLive : startLive}
              >
                {liveState ? "End Live" : "Start Live"}
              </button>
              <button type="button" className="live-start-btn ghost" onClick={() => navigate(-1)}>
                Back
              </button>
              <button type="button" className="live-start-btn ghost" onClick={() => navigate("/feed")}>
                Go to Feed
              </button>
            </div>
          </>
        )}
        {import.meta.env.DEV && (
          <button
            type="button"
            className="live-debug-toggle"
            onClick={() => setShowDebugDetails((prev) => !prev)}
          >
            {showDebugDetails ? "Hide Live Details" : "Show Live Details"}
          </button>
        )}
        {import.meta.env.DEV && debugSnapshot && showDebugDetails && (
          <div className="live-debug">
            <div>mode: {debugSnapshot.mode}</div>
            <div>livePreviewId: {String(debugSnapshot.livePreviewId || "")}</div>
            <div>fallbackKey: {String(debugSnapshot.fallbackLiveKey || "")}</div>
            <div>liveRoomId: {String(debugSnapshot.liveRoomId || "")}</div>
            <div>livekitStatus: {String(debugSnapshot.livekitStatus || "")}</div>
            <div>previewReady: {String(debugSnapshot.previewReady)}</div>
            <div>viewerFrame: {String(debugSnapshot.viewerFrameReady)}</div>
            <div>viewerStream: {String(debugSnapshot.viewerStreamReady)}</div>
            <div>framesSent: {debugSnapshot.framesSent}</div>
            <div>lastFrameAt: {debugSnapshot.lastFrameAt}</div>
            <div>lastSignal: {debugSnapshot.lastSignal}</div>
            <div>lastRecv: {debugSnapshot.lastRecv}</div>
            <div>rtcState: {debugSnapshot.rtcState}</div>
            <div>frameSize: {debugSnapshot.frameSize}</div>
            <div>rtcHostSize: {debugSnapshot.rtcHostSize}</div>
            <div>rtcViewerSize: {debugSnapshot.rtcViewerSize}</div>
          </div>
        )}
      </div>
    </section>
  );
}
