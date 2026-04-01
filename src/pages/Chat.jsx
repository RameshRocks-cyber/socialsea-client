import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCamera,
  FiChevronDown,
  FiMic,
  FiMicOff,
  FiMonitor,
  FiMoreVertical,
  FiPaperclip,
  FiPhone,
  FiPhoneOff,
  FiEye,
  FiHeart,
  FiMessageCircle,
  FiSend,
  FiSmile,
  FiUsers,
  FiUserPlus,
  FiVolume2,
  FiVolumeX,
  FiX,
  FiVideo,
  FiVideoOff
} from "react-icons/fi";
import { MdSignLanguage } from "react-icons/md";
import { Room, RoomEvent, createLocalTracks } from "livekit-client";
import api from "../api/axios";
import { buildProfilePath } from "../utils/profileRoute";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { clearAuthStorage } from "../auth";
import { readActiveStories, syncStoryCaches } from "../services/storyStorage";
import { SETTINGS_KEY, readSoundPrefs } from "./soundPrefs";
import "./Chat.css";

const POLL_MS = 3000;
const LOCAL_CHAT_KEY = "socialsea_chat_fallback_v1";
const CHAT_SERVER_BASE_KEY = "socialsea_chat_server_base_v1";
const HIDDEN_CHAT_MSG_IDS_KEY = "socialsea_hidden_msg_ids_v1";
const CALL_HISTORY_KEY = "socialsea_call_history_v1";
const CALL_SIGNAL_LOCAL_KEY = "socialsea_call_signal_local_v1";
const CHAT_READ_RECEIPT_KEY = "socialsea_chat_read_receipt_v1";
const CHAT_READ_RECEIPT_CHANNEL = "socialsea-chat-read-receipt";
const CHAT_MESSAGE_LOCAL_KEY = "socialsea_chat_message_local_v1";
const CHAT_MESSAGE_CHANNEL = "socialsea-chat-message";
const CALL_ACCEPT_TARGET_KEY = "socialsea_call_accept_target_v1";
const CALL_RING_MS = 30000;
const STORY_STORAGE_KEY = "socialsea_stories_v1";
const CALL_POLL_MS = 1200;
const CALL_SIGNAL_MAX_AGE_MS = 45000;
const CALL_REJOIN_KEY = "socialsea_call_rejoin_v1";
const CALL_REJOIN_MAX_AGE_MS = 10 * 60 * 1000;
const CALL_REJOIN_RETRY_MS = 6000;
const CALL_REJOIN_MAX_RETRIES = 2;
const CALL_REFRESH_GRACE_MS = 20000;
const CALL_REFRESH_GRACE_KEY = "socialsea_call_refresh_grace_v1";
const CHAT_CONVO_POLL_MS = 8000;
const CHAT_THREAD_POLL_BACKGROUND_MS = 10000;
const CHAT_MESSAGE_ALERT_DEDUPE_MS = 10 * 60 * 1000;
const ONLINE_WINDOW_MS = Number(import.meta.env.VITE_ONLINE_WINDOW_MS || 2 * 60 * 1000);
const CHAT_REMOTE_DISABLE_MS = 5 * 60 * 1000;
const STORY_FEED_DISABLE_MS = 5 * 60 * 1000;
const STORY_IMAGE_DURATION_MS = 6500;
const STORY_MEDIA_LOAD_TIMEOUT_MS = 2500;
const formatStoryCount = (value) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(num);
};
const normalizeStoryOwnerValue = (value) => String(value ?? "").trim();
const isStoryEmailLike = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || "").trim());
const normalizeStoryHandle = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (isStoryEmailLike(raw)) return "";
  return raw;
};
const normalizeStoryUsername = (value) => {
  const raw = normalizeStoryHandle(value);
  if (!raw) return "";
  if (/\s/.test(raw)) return "";
  return raw;
};
const usernameFromEmail = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const at = raw.indexOf("@");
  if (at <= 0) return "";
  const local = raw.slice(0, at).trim();
  if (!local || /\s/.test(local)) return "";
  return local;
};
const getStoryIdValue = (story) => {
  const id = story?.id ?? story?.storyId ?? story?.postId ?? story?.mediaId;
  return id != null && id !== "" ? String(id) : "";
};
const getStoryUserIdValue = (story) =>
  normalizeStoryOwnerValue(story?.userId ?? story?.user?.id ?? story?.ownerId ?? story?.authorId ?? story?.profileId);
const getStoryUserNameRawValue = (story) =>
  normalizeStoryOwnerValue(
    story?.username ||
    story?.userName ||
    story?.user?.username ||
    story?.handle ||
    story?.user?.handle ||
    story?.ownerName ||
    story?.name ||
    story?.user?.name ||
    story?.user?.displayName ||
    story?.displayName ||
    story?.profileName
  );
const getStoryUserNameValue = (story) =>
  normalizeStoryUsername(getStoryUserNameRawValue(story));
const getStoryUserEmailValue = (story) =>
  normalizeStoryOwnerValue(story?.email || story?.user?.email || story?.ownerEmail || story?.userEmail);
const getStoryGroupKey = (story, index = 0) => {
  const userId = getStoryUserIdValue(story);
  if (userId) return `uid:${userId}`;
  const username = getStoryUserNameValue(story);
  if (username) return `user:${username.toLowerCase()}`;
  const email = getStoryUserEmailValue(story);
  if (email) return `email:${email.toLowerCase()}`;
  const storyId = getStoryIdValue(story);
  if (storyId) return `story:${storyId}`;
  return `idx:${index}`;
};
const LIVEKIT_DEFAULT_URL = "wss://socialsea-mb50m9kr.livekit.cloud";
const isLocalLikeHost = (host) => {
  const value = String(host || "").trim().toLowerCase();
  if (!value) return true;
  if (value === "localhost" || value === "127.0.0.1") return true;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(value)) return true;
  return false;
};
const resolveLivekitUrl = () => {
  const envUrl = String(import.meta.env.VITE_LIVEKIT_URL || "").trim();
  if (envUrl) return envUrl;
  if (typeof window !== "undefined") {
    const host = String(window.location.hostname || "").trim().toLowerCase();
    if (!isLocalLikeHost(host)) {
      return LIVEKIT_DEFAULT_URL;
    }
  }
  return "";
};
const LIVEKIT_URL = resolveLivekitUrl();
const ASSUME_UTC_TS = String(import.meta.env.VITE_ASSUME_UTC_TS || "").trim().toLowerCase() === "true";
const TURN_URLS = String(import.meta.env.VITE_TURN_URLS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const TURN_USERNAME = String(import.meta.env.VITE_TURN_USERNAME || "").trim();
const TURN_CREDENTIAL = String(import.meta.env.VITE_TURN_CREDENTIAL || "").trim();
const TURN_FORCE_RELAY = String(import.meta.env.VITE_TURN_FORCE_RELAY || "").toLowerCase() === "true";
const EXTRA_ICE_SERVERS = TURN_URLS.length
  ? [
      {
        urls: TURN_URLS,
        username: TURN_USERNAME || undefined,
        credential: TURN_CREDENTIAL || undefined
      }
    ]
  : [];
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:global.stun.twilio.com:3478" },
    ...EXTRA_ICE_SERVERS
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: TURN_FORCE_RELAY ? "relay" : "all",
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require"
};
const CHAT_FAVORITES_KEY = "socialsea_chat_favorites_v1";
const CHAT_CUSTOM_STICKERS_KEY = "socialsea_chat_custom_stickers_v1";
const CHAT_TRANSLATOR_KEY = "socialsea_chat_translator_v1";
const CHAT_AUTOSPEAK_KEY = "socialsea_chat_autospeak_v1";
const CHAT_WALLPAPER_KEY = "socialsea_chat_wallpaper_v1";
const BLOCKED_USERS_KEY = "socialsea_blocked_users_v1";
const CHAT_SHARE_DRAFT_KEY = "socialsea_chat_share_draft_v1";
const CHAT_DISCOVERY_CACHE_KEY = "socialsea_discovery_contacts_v1";
const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";
const CHAT_REQUESTS_KEY = "socialsea_chat_requests_v1";
const DELETE_FOR_EVERYONE_TOKEN = "__SS_DELETE_EVERYONE__:";
const MESSAGE_REPLY_TOKEN = "__SS_REPLY__:";
const SIGN_ASSIST_TOKEN = "__SS_SIGN_ASSIST__:";
const SIGN_VOICE_GENDERS = ["female", "male"];
const SIGN_LOCAL_TF_SCRIPT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const SIGN_LOCAL_HANDPOSE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js";
const SIGN_LIVE_DEBOUNCE_MS = 2200;
const SIGN_LIVE_MAX_BUFFER_CHARS = 320;
const SIGN_LIVE_CONTINUOUS_COOLDOWN_MS = 1400;
const SIGN_SEQUENCE_FRAME_WINDOW = 18;
const BASE_SPEECH_LANG_OPTIONS = [
  "en-IN", "en-US", "en-GB", "en-AU",
  "te-IN", "hi-IN", "ta-IN", "kn-IN", "ml-IN", "mr-IN", "bn-IN", "gu-IN", "pa-IN", "ur-IN", "or-IN",
  "as-IN", "kok-IN", "sa-IN", "ne-NP", "si-LK",
  "ar-SA", "fa-IR", "he-IL", "tr-TR",
  "es-ES", "es-MX", "fr-FR", "de-DE", "it-IT", "pt-PT", "pt-BR", "nl-NL", "pl-PL", "sv-SE", "no-NO",
  "da-DK", "fi-FI", "cs-CZ", "sk-SK", "hu-HU", "ro-RO", "uk-UA", "ru-RU", "el-GR",
  "zh-CN", "zh-TW", "ja-JP", "ko-KR", "th-TH", "vi-VN", "id-ID", "ms-MY", "fil-PH"
];

const normalizeLangCode = (value) => String(value || "").trim().replace("_", "-");

const getLangDisplayLabel = (langCode) => {
  const normalized = normalizeLangCode(langCode);
  if (!normalized) return "";
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined") {
      const names = new Intl.DisplayNames(["en"], { type: "language" });
      const parts = normalized.split("-");
      const languageName = names.of(parts[0]) || parts[0];
      return parts[1] ? `${languageName} (${parts[1].toUpperCase()})` : languageName;
    }
  } catch {
    // ignore display-name errors
  }
  return normalized;
};

const buildSpeechLangOptions = (extraLangs = []) => {
  const all = [...BASE_SPEECH_LANG_OPTIONS, ...extraLangs]
    .map(normalizeLangCode)
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
  return all
    .map((value) => ({ value, label: getLangDisplayLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const createWallpaperSvgData = (baseA, baseB, line, dot) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1800" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${baseA}"/>
          <stop offset="100%" stop-color="${baseB}"/>
        </linearGradient>
        <pattern id="p" width="120" height="120" patternUnits="userSpaceOnUse">
          <path d="M0 60 L120 60 M60 0 L60 120" stroke="${line}" stroke-width="1" opacity="0.45"/>
          <circle cx="60" cy="60" r="2.2" fill="${dot}" opacity="0.55"/>
        </pattern>
      </defs>
      <rect width="1200" height="1800" fill="url(#g)"/>
      <rect width="1200" height="1800" fill="url(#p)"/>
    </svg>`
  )}`;

const CHAT_WALLPAPER_PRESETS = [
  { id: "none", label: "Dark", image: "" },
  { id: "night-grid", label: "Night Grid", image: createWallpaperSvgData("#070b14", "#121a2a", "#6f85ae", "#d4e4ff") },
  { id: "dark-cyan", label: "Dark Cyan", image: createWallpaperSvgData("#061018", "#122434", "#3f7999", "#b8ecff") },
  { id: "graphite", label: "Graphite", image: createWallpaperSvgData("#090909", "#1a1d23", "#8a8d95", "#f4f4f4") },
  { id: "midnight", label: "Midnight", image: createWallpaperSvgData("#04070d", "#0a0f16", "#3b4a5e", "#c6d6ea") },
  { id: "obsidian", label: "Obsidian", image: createWallpaperSvgData("#050505", "#0d0d0f", "#4a4a4d", "#d9d9db") },
  { id: "charcoal", label: "Charcoal", image: createWallpaperSvgData("#0b0b0b", "#151517", "#5d5d62", "#e1e1e4") },
  { id: "iron", label: "Iron", image: createWallpaperSvgData("#06080b", "#101419", "#4e5a67", "#d2dbe6") },
  { id: "ink", label: "Ink", image: createWallpaperSvgData("#030407", "#0a0c10", "#384052", "#c0c9d6") }
];

const DEFAULT_WALLPAPER_PRESET_ID = "graphite";
const DEFAULT_WALLPAPER_OPTIONS = {
  fit: "cover",
  zoom: 100,
  x: 50,
  y: 50
};

const encodeSignAssistText = (text, voiceGender = "female", source = "manual") => {
  const cleanText = String(text || "").trim();
  if (!cleanText) return "";
  const gender = SIGN_VOICE_GENDERS.includes(String(voiceGender || "").toLowerCase())
    ? String(voiceGender || "").toLowerCase()
    : "female";
  const payload = {
    text: cleanText,
    voiceGender: gender,
    source: String(source || "manual").trim().toLowerCase(),
    ts: new Date().toISOString()
  };
  return `${SIGN_ASSIST_TOKEN}${JSON.stringify(payload)}`;
};

const decodeSignAssistText = (rawText) => {
  const raw = String(rawText || "");
  if (!raw.startsWith(SIGN_ASSIST_TOKEN)) return null;
  try {
    const parsed = JSON.parse(raw.slice(SIGN_ASSIST_TOKEN.length));
    const text = String(parsed?.text || "").trim();
    if (!text) return null;
    const gender = SIGN_VOICE_GENDERS.includes(String(parsed?.voiceGender || "").toLowerCase())
      ? String(parsed.voiceGender).toLowerCase()
      : "female";
    return {
      text,
      voiceGender: gender,
      source: String(parsed?.source || "manual"),
      ts: parsed?.ts || ""
    };
  } catch {
    return null;
  }
};

const loadExternalScript = (src, id) => {
  if (typeof document === "undefined") return Promise.reject(new Error("No document"));
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.id = id;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
};

const inferLocalSignText = (landmarks) => {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return "";
  const wrist = landmarks[0];
  const indexTip = landmarks[8];
  const indexPip = landmarks[6];
  const indexMcp = landmarks[5];
  const middleTip = landmarks[12];
  const middlePip = landmarks[10];
  const middleMcp = landmarks[9];
  const ringTip = landmarks[16];
  const ringPip = landmarks[14];
  const ringMcp = landmarks[13];
  const pinkyTip = landmarks[20];
  const pinkyPip = landmarks[18];
  const pinkyMcp = landmarks[17];
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];

  const handSize = Math.hypot(middleMcp[0] - wrist[0], middleMcp[1] - wrist[1]) || 1;
  const extMargin = handSize * 0.1;
  const foldMargin = handSize * 0.03;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const isUp = (tip, pip) => tip[1] < pip[1] - extMargin;
  const isFolded = (tip, pip, mcp) => tip[1] >= pip[1] - foldMargin || tip[1] > mcp[1] + foldMargin;

  const indexUp = isUp(indexTip, indexPip);
  const middleUp = isUp(middleTip, middlePip);
  const ringUp = isUp(ringTip, ringPip);
  const pinkyUp = isUp(pinkyTip, pinkyPip);
  const indexDown = indexTip[1] > indexPip[1] + extMargin && indexPip[1] > indexMcp[1] + handSize * 0.02;

  const middleFolded = isFolded(middleTip, middlePip, middleMcp);
  const ringFolded = isFolded(ringTip, ringPip, ringMcp);
  const pinkyFolded = isFolded(pinkyTip, pinkyPip, pinkyMcp);

  const thumbRaised = thumbTip[1] < thumbIp[1] && thumbTip[1] < wrist[1] - handSize * 0.1;
  const thumbDown = thumbTip[1] > thumbIp[1] + handSize * 0.05 && thumbTip[1] > wrist[1] + handSize * 0.1;
  const thumbIndexPinch = distance(thumbTip, indexTip) < handSize * 0.25;

  const isolatedIndexUp = indexUp && middleFolded && ringFolded && pinkyFolded;
  const isolatedIndexDown = indexDown && middleFolded && ringFolded && pinkyFolded;
  const victory = indexUp && middleUp && !ringUp && !pinkyUp;
  const openPalm = indexUp && middleUp && ringUp && pinkyUp;
  const fist = !indexUp && middleFolded && ringFolded && pinkyFolded;
  const thumbsUp = thumbRaised && !indexUp && middleFolded && ringFolded && pinkyFolded;
  const thumbsDown = thumbDown && !indexUp && middleFolded && ringFolded && pinkyFolded;
  const callMe = thumbRaised && pinkyUp && middleFolded && ringFolded && !indexUp;
  const iLoveYou = thumbRaised && indexUp && pinkyUp && middleFolded && ringFolded;
  const okSign = thumbIndexPinch && middleUp && ringUp && pinkyUp;
  const threeUp = indexUp && middleUp && ringUp && !pinkyUp;

  if (isolatedIndexUp) return "I need help.";
  if (isolatedIndexDown) return "I am okay.";
  if (callMe) return "Call me.";
  if (iLoveYou) return "I love you.";
  if (okSign) return "Okay.";
  if (thumbsUp) return "Okay, understood.";
  if (thumbsDown) return "Not okay.";
  if (victory) return "Yes.";
  if (threeUp) return "I am coming.";
  if (fist) return "No.";
  if (openPalm) return "Please wait.";
  return "";
};
const EMOJI_GROUPS = [
  { name: "Smileys", items: ["??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??"] },
  { name: "Gestures", items: ["??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??"] },
  { name: "Hearts", items: ["??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??", "??"] },
  { name: "Fun", items: ["??", "??", "?", "??", "?", "??", "??", "??", "?", "??", "??", "??"] }
];
const QUICK_EMOJIS = EMOJI_GROUPS.flatMap((group) => group.items);
const STICKER_PACKS = [
  { id: "party", label: "Party", value: "??????" },
  { id: "love", label: "Love", value: "??????" },
  { id: "thanks", label: "Thanks", value: "?????" },
  { id: "wow", label: "Wow", value: "??????" },
  { id: "laugh", label: "LOL", value: "??????" },
  { id: "angry", label: "Angry", value: "?????" },
  { id: "sleepy", label: "Sleepy", value: "??????" },
  { id: "food", label: "Food", value: "??????" },
  { id: "coffee", label: "Break", value: "?????" },
  { id: "victory", label: "Victory", value: "??????" },
  { id: "coding", label: "Coding", value: "??????" },
  { id: "travel", label: "Travel", value: "??????" }
];
const FORCE_BEAUTY_FILTER = String(import.meta.env.VITE_FORCE_BEAUTY_FILTER || "false").toLowerCase() === "true";
const VIDEO_FILTER_PRESETS = [
  { id: "beauty_soft", label: "Beauty", short: "B", css: "brightness(1.12) saturate(1.22) contrast(1.08)" },
  { id: "studio_clear", label: "Studio", short: "S", css: "brightness(1.08) contrast(1.1) saturate(1.06)" },
  { id: "porcelain", label: "Porcelain", short: "P", css: "brightness(1.12) contrast(0.96) saturate(1.08)" },
  { id: "warm_glow", label: "Warm Glow", short: "W", css: "brightness(1.08) saturate(1.16) sepia(0.14)" },
  { id: "golden_hour", label: "Golden Hour", short: "G", css: "brightness(1.09) saturate(1.2) sepia(0.18) hue-rotate(-8deg)" },
  { id: "cool_luxe", label: "Cool Luxe", short: "C", css: "brightness(1.04) contrast(1.1) saturate(0.95) hue-rotate(10deg)" },
  { id: "vivid_pop", label: "Vivid Pop", short: "V", css: "brightness(1.08) contrast(1.16) saturate(1.32)" },
  { id: "cute_blush", label: "Cute Blush", short: "U", css: "brightness(1.1) contrast(1.02) saturate(1.22) hue-rotate(-12deg)" },
  { id: "comic_pop", label: "Comic Pop", short: "CP", css: "contrast(1.35) saturate(1.4) brightness(1.05)" },
  { id: "retro_film", label: "Retro Film", short: "R", css: "sepia(0.28) contrast(1.08) saturate(0.96) brightness(1.05)" },
  { id: "mono_classic", label: "Mono Classic", short: "M", css: "grayscale(1) contrast(1.12) brightness(1.05)" },
  { id: "cinema_noir", label: "Cinema Noir", short: "N", css: "grayscale(1) contrast(1.28) brightness(0.92)" }
];
const GROUP_CALL_MAX = 8;

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read sticker image"));
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl, filename = "sticker.png") => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
};

const parseDeleteTargetId = (text) => {
  const raw = String(text || "").trim();
  if (!raw.startsWith(DELETE_FOR_EVERYONE_TOKEN)) return "";
  return raw.slice(DELETE_FOR_EVERYONE_TOKEN.length).trim();
};

const trimReplyPreview = (value, maxLen = 72) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1)).trimEnd()}...`;
};

const extractReelShare = (value) => {
  if (typeof window === "undefined") return null;
  const text = String(value || "");
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s]+\/reels[^\s]*|\/reels\?[^\s]+)/i);
  if (!match) return null;
  const rawLink = match[1].replace(/[)\],.!?]+$/, "");
  let url = null;
  try {
    url = new URL(rawLink, window.location.origin);
  } catch {
    return null;
  }
  const id =
    url.searchParams.get("post") ||
    url.searchParams.get("postId") ||
    url.searchParams.get("id") ||
    "";
  return {
    href: `${url.pathname}${url.search}`,
    id,
    match: rawLink,
    raw: text
  };
};

const normalizeReelCandidate = (value) =>
  value?.post || value?.reel || value?.item || value;

const getReelIdValue = (value) => {
  const candidate = normalizeReelCandidate(value);
  const id =
    candidate?.id ??
    candidate?.postId ??
    candidate?.reelId ??
    candidate?.mediaId ??
    candidate?.videoId ??
    candidate?.contentId ??
    "";
  return id != null && id !== "" ? String(id) : "";
};

const pickReelPreviewFields = (value) => {
  const candidate = normalizeReelCandidate(value);
  const asText = (input) =>
    typeof input === "string" || typeof input === "number"
      ? String(input).trim()
      : "";
  const pickFirst = (...inputs) => {
    for (const input of inputs) {
      const text = asText(input);
      if (text) return text;
    }
    return "";
  };
  const video = pickFirst(
    candidate?.contentUrl,
    candidate?.mediaUrl,
    candidate?.videoUrl,
    candidate?.video?.url,
    candidate?.url,
    candidate?.fileUrl,
    candidate?.video
  );
  const poster = pickFirst(
    candidate?.thumbnailUrl,
    candidate?.thumbUrl,
    candidate?.previewUrl,
    candidate?.coverUrl,
    candidate?.coverImageUrl,
    candidate?.coverImage,
    candidate?.imageUrl,
    candidate?.previewImageUrl,
    candidate?.previewImage,
    candidate?.thumbnailImage,
    candidate?.thumbnailSrc,
    candidate?.screenshotUrl,
    candidate?.stillUrl,
    candidate?.posterUrl,
    candidate?.frameUrl,
    candidate?.poster,
    candidate?.thumbnail
  );
  return { video, poster };
};

const createVideoPosterDataUrl = (src) =>
  new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve("");
      return;
    }
    const cleanSrc = String(src || "").trim();
    if (!cleanSrc) {
      resolve("");
      return;
    }

    const video = document.createElement("video");
    let done = false;
    let timer = 0;

    const finish = (value = "") => {
      if (done) return;
      done = true;
      if (timer) window.clearTimeout(timer);
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // ignore cleanup failures
      }
      resolve(String(value || ""));
    };

    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish("");
        return;
      }
      try {
        const canvas = document.createElement("canvas");
        const targetWidth = Math.max(180, Math.min(480, video.videoWidth));
        const scale = targetWidth / Math.max(1, video.videoWidth);
        canvas.width = targetWidth;
        canvas.height = Math.max(100, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish("");
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        finish("");
      }
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.addEventListener("loadeddata", () => {
      const duration = Number(video.duration) || 0;
      const targetTime = duration > 0.18 ? Math.min(0.18, Math.max(0.06, duration / 8)) : 0;
      if (targetTime > 0 && Math.abs((video.currentTime || 0) - targetTime) > 0.01) {
        try {
          video.currentTime = targetTime;
          return;
        } catch {
          // fall through to first frame capture
        }
      }
      capture();
    });
    video.addEventListener("seeked", capture);
    video.addEventListener("error", () => finish(""));
    timer = window.setTimeout(() => finish(""), 7000);
    video.src = cleanSrc;
    try {
      video.load();
    } catch {
      finish("");
    }
  });

const parseReplyEnvelope = (rawText) => {
  const raw = String(rawText || "");
  if (!raw.startsWith(MESSAGE_REPLY_TOKEN)) {
    return { text: raw, replyTo: null };
  }
  const payloadBlock = raw.slice(MESSAGE_REPLY_TOKEN.length);
  const separatorIndex = payloadBlock.indexOf("\n");
  const replyMetaText = separatorIndex >= 0 ? payloadBlock.slice(0, separatorIndex) : payloadBlock;
  const bodyText = separatorIndex >= 0 ? payloadBlock.slice(separatorIndex + 1) : "";
  try {
    const parsed = JSON.parse(replyMetaText);
    const id = String(parsed?.id || "").trim();
    const preview = trimReplyPreview(parsed?.preview);
    const senderName = String(parsed?.senderName || "").trim();
    const senderId = String(parsed?.senderId || "").trim();
    return {
      text: String(bodyText || "").trim(),
      replyTo: id || preview || senderName || senderId
        ? { id, preview, senderName, senderId }
        : null
    };
  } catch {
    return { text: raw, replyTo: null };
  }
};

const applyDeleteTargetsToList = (list, targets) => {
  if (!Array.isArray(list) || !targets?.size) return list || [];
  return list.map((m) => {
    const mid = String(m?.id || "");
    if (!mid || !targets.has(mid)) return m;
    return {
      ...m,
      text: "This message was deleted",
      mediaUrl: "",
      mediaType: "",
      fileName: "",
      deletedForEveryone: true
    };
  });
};

const getStoredToken = () =>
  sessionStorage.getItem("accessToken") ||
  sessionStorage.getItem("token") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("token");

export default function Chat() {
  const navigate = useNavigate();
  const { contactId } = useParams();
  const location = useLocation();
  const isConversationRoute = Boolean(contactId);
  const isRequestsRoute = location.pathname === "/chat/requests";

  const safeGetItem = (key) => {
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage write failures
    }
  };

  const readStoryCache = () => {
    return readActiveStories();
  };

  const normalizeStoryList = (list) => {
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    const toEpochMsLocal = (value) => {
      if (value == null || value === "") return 0;
      if (value instanceof Date) {
        const t = value.getTime();
        return Number.isFinite(t) ? t : 0;
      }
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric < 1000000000000 ? numeric * 1000 : numeric;
      }
      const raw = String(value || "").trim();
      if (!raw) return 0;
      const parsed = new Date(raw).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const fallbackExpiryMs = 24 * 60 * 60 * 1000;
    return list
      .filter(Boolean)
      .filter((item) => {
        const explicitExpires = toEpochMsLocal(item?.expiresAt || item?.expires || item?.expiry || 0);
        const createdAt = toEpochMsLocal(item?.createdAt || item?.created || item?.timestamp || item?.time || 0);
        const inferredExpires = !explicitExpires && createdAt ? createdAt + fallbackExpiryMs : 0;
        const expiresAt = explicitExpires || inferredExpires;
        return !expiresAt || expiresAt > now;
      })
      .slice(0, 20);
  };

  const writeStoryCache = (list) => {
    syncStoryCaches(list);
  };

  const isStoryFeedDisabled = () => {
    const until = Number(storyFeedDisabledUntilRef.current || 0);
    return until && Date.now() < until;
  };

  const disableStoryFeedTemporarily = () => {
    storyFeedDisabledUntilRef.current = Date.now() + STORY_FEED_DISABLE_MS;
  };

  const readDiscoveryCache = () => {
    try {
      const raw = safeGetItem(CHAT_DISCOVERY_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.list)) return [];
      const ts = Number(parsed.at || 0);
      if (ts && Date.now() - ts > 10 * 60 * 1000) return [];
      return parsed.list;
    } catch {
      return [];
    }
  };

  const writeDiscoveryCache = (list) => {
    try {
      localStorage.setItem(CHAT_DISCOVERY_CACHE_KEY, JSON.stringify({ at: Date.now(), list }));
    } catch {
      // ignore
    }
  };

  const isChatApiDisabled = () => {
    const until = Number(chatApiDisabledUntilRef.current || 0);
    return until && Date.now() < until;
  };

  const disableChatApiTemporarily = () => {
    chatApiDisabledUntilRef.current = Date.now() + CHAT_REMOTE_DISABLE_MS;
  };

  const fetchStoryFeed = async () => {
    if (isStoryFeedDisabled()) {
      setStoryItems(normalizeStoryList(readStoryCache()));
      return;
    }
    const baseCandidates = Array.from(
      new Set(
        [
          api?.defaults?.baseURL,
          getApiBaseUrl(),
          import.meta.env?.VITE_API_BASE_URL,
          import.meta.env?.VITE_API_URL,
          typeof window !== "undefined" ? window.location.origin : "",
          "https://api.socialsea.co.in",
          "https://socialsea.co.in"
        ]
          .map((value) => normalizeBaseCandidate(value))
          .filter(Boolean)
      )
    );
    const endpoints = ["/api/stories/feed"];
    let sawMissing = false;
    let firstSuccess = null;
    for (const base of baseCandidates) {
      for (const endpoint of endpoints) {
        try {
          const res = await api.get(endpoint, {
            baseURL: base,
            timeout: 9000,
            suppressAuthRedirect: true
          });
          const list = normalizeStoryList(Array.isArray(res?.data) ? res.data : []);
          if (!firstSuccess) firstSuccess = list;
          if (list.length) {
            setStoryItems(list);
            writeStoryCache(list);
            return;
          }
        } catch (err) {
          const status = err?.response?.status;
          if (status === 404) sawMissing = true;
          // try next candidate
        }
      }
    }
    if (firstSuccess) {
      setStoryItems(firstSuccess);
      writeStoryCache(firstSuccess);
      return;
    }
    if (sawMissing) {
      disableStoryFeedTemporarily();
    }
    setStoryItems(normalizeStoryList(readStoryCache()));
  };

  const persistCallRejoin = (payload) => {
    try {
      sessionStorage.setItem(CALL_REJOIN_KEY, JSON.stringify({ ...payload, at: Date.now() }));
    } catch {
      // ignore storage issues
    }
  };

  const clearCallRejoin = () => {
    try {
      sessionStorage.removeItem(CALL_REJOIN_KEY);
    } catch {
      // ignore storage issues
    }
  };

  const writeRefreshGrace = () => {
    try {
      localStorage.setItem(CALL_REFRESH_GRACE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const [myUserId, setMyUserId] = useState(String(safeGetItem("userId") || ""));
  const [myEmail, setMyEmail] = useState(String(safeGetItem("email") || ""));

  const [contacts, setContacts] = useState([]);
  const [contactActionId, setContactActionId] = useState("");
  const [activeContactId, setActiveContactId] = useState("");
  const [messagesByContact, setMessagesByContact] = useState({});
  const [inputText, setInputText] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [searchUsers, setSearchUsers] = useState([]);
  const [sidebarSearchUsers, setSidebarSearchUsers] = useState([]);
  const [chatFallbackMode, setChatFallbackMode] = useState(false);
  const [pendingShareDraft, setPendingShareDraft] = useState("");
  const [shareHint, setShareHint] = useState("");
  const [reelPreviewById, setReelPreviewById] = useState({});
  const [reelPosterBySrc, setReelPosterBySrc] = useState({});

  const [incomingCall, setIncomingCall] = useState(null);
  const [callState, setCallState] = useState({
    phase: "idle",
    mode: "audio",
    peerId: "",
    peerName: "",
    initiatedByMe: false,
    provider: "webrtc"
  });
  const [groupCallActive, setGroupCallActive] = useState(false);
  const [groupRoomId, setGroupRoomId] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupRemoteTiles, setGroupRemoteTiles] = useState([]);
  const [groupInviteOpen, setGroupInviteOpen] = useState(false);
  const [groupInviteIds, setGroupInviteIds] = useState([]);
  const [callError, setCallError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [ringtoneMuted, setRingtoneMuted] = useState(false);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [callHistoryByContact, setCallHistoryByContact] = useState({});
  const [videoFilterId, setVideoFilterId] = useState("beauty_soft");
  const [showVideoFilters, setShowVideoFilters] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsScreenShare, setRemoteIsScreenShare] = useState(false);
  const [localVideoPos, setLocalVideoPos] = useState(null);
  const [bubbleMenu, setBubbleMenu] = useState(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [pickerTab, setPickerTab] = useState("emoji");
  const [favoritePicks, setFavoritePicks] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [customStickers, setCustomStickers] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_CUSTOM_STICKERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isSpeechTyping, setIsSpeechTyping] = useState(false);
  const [speechLang, setSpeechLang] = useState("en-IN");
  const [speechLangOptions, setSpeechLangOptions] = useState(() => buildSpeechLangOptions());
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [showWallpaperPanel, setShowWallpaperPanel] = useState(false);
  const [showBackButton] = useState(true);
  const [translatorEnabled, setTranslatorEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_TRANSLATOR_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return Boolean(parsed?.enabled);
    } catch {
      return false;
    }
  });
  const [translatorLang, setTranslatorLang] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_TRANSLATOR_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return String(parsed?.lang || "en");
    } catch {
      return "en";
    }
  });
  const [speechVoiceGender, setSpeechVoiceGender] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_TRANSLATOR_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = String(parsed?.voiceGender || "female").toLowerCase();
      return SIGN_VOICE_GENDERS.includes(next) ? next : "female";
    } catch {
      return "female";
    }
  });
  const [translatedIncomingById, setTranslatedIncomingById] = useState({});
  const [translatorError, setTranslatorError] = useState("");
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [followingCacheTick, setFollowingCacheTick] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [pendingChatRequests, setPendingChatRequests] = useState(() => {
    try {
      const raw = safeGetItem(CHAT_REQUESTS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [chatRequests, setChatRequests] = useState([]);
  const [sentChatRequests, setSentChatRequests] = useState([]);
  const [chatRequestsLoading, setChatRequestsLoading] = useState(false);
  const [chatRequestError, setChatRequestError] = useState("");
  const [chatRequestBusyById, setChatRequestBusyById] = useState({});
  const [storyItems, setStoryItems] = useState(() => normalizeStoryList(readStoryCache()));
  const [storyViewerIndex, setStoryViewerIndex] = useState(null);
  const [storyViewerItems, setStoryViewerItems] = useState([]);
  const [storyViewerGroupKey, setStoryViewerGroupKey] = useState(null);
  const [storyOptionsItems, setStoryOptionsItems] = useState([]);
  const [storyOptionsGroupKey, setStoryOptionsGroupKey] = useState(null);
  const activeStory = storyViewerIndex != null ? storyViewerItems[storyViewerIndex] : null;
  const [storyViewerSrc, setStoryViewerSrc] = useState("");
  const [storyViewerMuted, setStoryViewerMuted] = useState(true);
  const [storyViewerLoading, setStoryViewerLoading] = useState(false);
  const [storyViewerLoadError, setStoryViewerLoadError] = useState("");
  const [storyViewerMediaKind, setStoryViewerMediaKind] = useState("unknown");
  const [storyViewerBlobType, setStoryViewerBlobType] = useState("");
  const [storyOptionsOpen, setStoryOptionsOpen] = useState(false);
  const [storyPlayerProgress, setStoryPlayerProgress] = useState(0);
  const [storyPlayerPaused, setStoryPlayerPaused] = useState(false);
  const [storyReactions, setStoryReactions] = useState({});
  const [storyCommentDraft, setStoryCommentDraft] = useState("");
  const [storyCommentOpen, setStoryCommentOpen] = useState(false);
  const [storyUsernamesById, setStoryUsernamesById] = useState({});
  const [storyUsernamesByEmail, setStoryUsernamesByEmail] = useState({});
  const storyUsernamesRef = useRef({ byId: {}, byEmail: {} });
  const storyProfileLookupRef = useRef(new Set());
  const reelPreviewLoadingRef = useRef(new Set());
  const reelPosterLoadingRef = useRef(new Set());
  useEffect(() => {
    storyUsernamesRef.current = { byId: storyUsernamesById, byEmail: storyUsernamesByEmail };
  }, [storyUsernamesById, storyUsernamesByEmail]);
  const storyContactIndex = useMemo(() => {
    const byId = new Map();
    const byEmail = new Map();
    contacts.forEach((contact) => {
      const id = String(contact?.id || "").trim();
      if (id && !byId.has(id)) byId.set(id, contact);
      const email = String(contact?.email || "").trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, contact);
    });
    return { byId, byEmail };
  }, [contacts]);
  const resolveStoryUsername = useCallback(
    (story) => {
      const userId = String(getStoryUserIdValue(story) || "").trim();
      if (userId) {
        const cached = storyUsernamesRef.current.byId?.[userId];
        if (cached) return cached;
        const match = storyContactIndex.byId.get(userId);
        const handle = normalizeStoryUsername(match?.username || match?.handle || "");
        if (handle) return handle;
      }
      const email = String(getStoryUserEmailValue(story) || "").trim().toLowerCase();
      if (email) {
        const cached = storyUsernamesRef.current.byEmail?.[email];
        if (cached) return cached;
        const match = storyContactIndex.byEmail.get(email);
        const handle = normalizeStoryUsername(match?.username || match?.handle || "");
        if (handle) return handle;
      }
      const direct = getStoryUserNameValue(story);
      if (direct) return direct;
      const rawCandidate = getStoryUserNameRawValue(story);
      const rawFromEmail = usernameFromEmail(rawCandidate);
      if (rawFromEmail) return rawFromEmail;
      const fallback = usernameFromEmail(email);
      if (fallback) return fallback;
      return "";
    },
    [storyContactIndex]
  );
  useEffect(() => {
    let cancelled = false;
    const pending = [];
    storyItems.forEach((story) => {
      const userId = String(getStoryUserIdValue(story) || "").trim();
      if (userId) {
        const key = `id:${userId}`;
        if (storyUsernamesRef.current.byId?.[userId]) return;
        if (!storyProfileLookupRef.current.has(key)) pending.push({ key, id: userId, type: "id" });
        return;
      }
      let email = String(getStoryUserEmailValue(story) || "").trim().toLowerCase();
      if (!email) {
        const rawCandidate = getStoryUserNameRawValue(story);
        if (isStoryEmailLike(rawCandidate)) {
          email = rawCandidate.toLowerCase();
        }
      }
      if (!email) return;
      const key = `email:${email}`;
      if (storyUsernamesRef.current.byEmail?.[email]) return;
      if (!storyProfileLookupRef.current.has(key)) pending.push({ key, id: email, type: "email" });
    });
    if (!pending.length) return undefined;

    const run = async () => {
      for (const item of pending) {
        if (cancelled) return;
        storyProfileLookupRef.current.add(item.key);
        try {
          const res = await requestChatObject({
            endpoints: [
              `/api/profile/${encodeURIComponent(item.id)}`,
              `/profile/${encodeURIComponent(item.id)}`,
              `/api/users/${encodeURIComponent(item.id)}`,
              `/users/${encodeURIComponent(item.id)}`
            ],
            params: { _: Date.now() }
          });
          if (cancelled) return;
          const resolved = mapUserToContact(res?.data || {});
          const handle = normalizeStoryUsername(resolved?.username || resolved?.handle || "");
          if (!handle) continue;
          if (item.type === "id") {
            setStoryUsernamesById((prev) =>
              prev?.[item.id] === handle ? prev : { ...prev, [item.id]: handle }
            );
          } else {
            setStoryUsernamesByEmail((prev) =>
              prev?.[item.id] === handle ? prev : { ...prev, [item.id]: handle }
            );
          }
        } catch {
          // ignore story profile lookup failures
        } finally {
          storyProfileLookupRef.current.delete(item.key);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [storyItems]);
  const storyGroups = useMemo(() => {
    const groups = [];
    const seen = new Map();
    storyItems.forEach((story, index) => {
      const key = getStoryGroupKey(story, index);
      let group = seen.get(key);
      if (!group) {
        group = {
          key,
          userId: getStoryUserIdValue(story),
          username: getStoryUserNameValue(story),
          email: getStoryUserEmailValue(story),
          items: [],
          latest: story
        };
        seen.set(key, group);
        groups.push(group);
      }
      const nextUserId = getStoryUserIdValue(story);
      if (!group.userId && nextUserId) group.userId = nextUserId;
      const nextUsername = resolveStoryUsername(story);
      if (!group.username && nextUsername) group.username = nextUsername;
      const nextEmail = getStoryUserEmailValue(story);
      if (!group.email && nextEmail) group.email = nextEmail;
      group.items.push(story);
      if (!group.latest) group.latest = story;
    });
    return groups;
  }, [storyItems, resolveStoryUsername]);
  const storyGroupsByKey = useMemo(() => {
    const map = new Map();
    storyGroups.forEach((group) => {
      map.set(group.key, group);
    });
    return map;
  }, [storyGroups]);
  const [soundPrefs, setSoundPrefs] = useState(readSoundPrefs);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [hasRemoteAudio, setHasRemoteAudio] = useState(false);
  const [pipEnabled, setPipEnabled] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const pipDismissedRef = useRef(false);
  const groupPeersRef = useRef(new Map());
  const groupStreamsRef = useRef(new Map());
  const groupActiveRef = useRef(false);
  const rejoinAttemptedRef = useRef(false);
  const localVideoDragRef = useRef({ active: false, offsetX: 0, offsetY: 0 });

  const isScreenShareStream = useCallback((stream) => {
    if (!stream || typeof stream.getVideoTracks !== "function") return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    const label = String(track.label || "").toLowerCase();
    const hint = String(track.contentHint || "").toLowerCase();
    if (label.includes("screen") || label.includes("display") || label.includes("window") || label.includes("tab")) return true;
    if (hint.includes("screen") || hint.includes("detail") || hint.includes("text")) return true;
    return false;
  }, []);

  useEffect(() => {
    if (!FORCE_BEAUTY_FILTER) return;
    if (videoFilterId !== "beauty_soft") setVideoFilterId("beauty_soft");
    if (showVideoFilters) setShowVideoFilters(false);
  }, [videoFilterId, showVideoFilters]);
  const [callPhaseNote, setCallPhaseNote] = useState("");
  const [signAssistEnabled, setSignAssistEnabled] = useState(false);
  const [signAssistText, setSignAssistText] = useState("");
  const [signAssistVoiceGender, setSignAssistVoiceGender] = useState("female");
  const readAutoSpeakPrefs = () => {
    try {
      const raw = localStorage.getItem(CHAT_AUTOSPEAK_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        enabled: Boolean(parsed?.enabled),
        enabledAt: Number(parsed?.enabledAt || 0)
      };
    } catch {
      return { enabled: false, enabledAt: 0 };
    }
  };
  const autoSpeakPrefsRef = useRef(readAutoSpeakPrefs());
  const autoSpeakEnabledAtRef = useRef(autoSpeakPrefsRef.current.enabledAt || 0);
  const [signAssistAutoSpeak, setSignAssistAutoSpeak] = useState(() => autoSpeakPrefsRef.current.enabled);
  const [signAssistContinuousMode, setSignAssistContinuousMode] = useState(false);
  const [signAssistBusy, setSignAssistBusy] = useState(false);
  const [signAssistStatus, setSignAssistStatus] = useState("");
  useEffect(() => {
    if (!signAssistEnabled) return;
    if (callState.mode !== "video" || callState.phase === "idle") return;
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0];
    if (videoTrack && !videoTrack.enabled) {
      videoTrack.enabled = true;
      setIsCameraOff(false);
    }
  }, [signAssistEnabled, callState.mode, callState.phase]);
  useEffect(() => {
    if (!signAssistAutoSpeak) return;
    if (!autoSpeakEnabledAtRef.current) {
      autoSpeakEnabledAtRef.current = Date.now();
      try {
        localStorage.setItem(CHAT_AUTOSPEAK_KEY, JSON.stringify({
          enabled: true,
          enabledAt: autoSpeakEnabledAtRef.current
        }));
      } catch {
        // ignore storage failures
      }
    }
  }, [signAssistAutoSpeak]);
  const [blockedUsers, setBlockedUsers] = useState(() => {
    try {
      const raw = localStorage.getItem(BLOCKED_USERS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [chatWallpaper, setChatWallpaper] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_WALLPAPER_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const presetId = String(parsed?.presetId || DEFAULT_WALLPAPER_PRESET_ID);
      const image = String(parsed?.image || "");
      const fitRaw = String(parsed?.fit || parsed?.mode || DEFAULT_WALLPAPER_OPTIONS.fit).toLowerCase();
      const fit = ["cover", "contain", "stretch"].includes(fitRaw) ? fitRaw : DEFAULT_WALLPAPER_OPTIONS.fit;
      const zoom = Number.isFinite(Number(parsed?.zoom)) ? Math.max(60, Math.min(220, Number(parsed.zoom))) : DEFAULT_WALLPAPER_OPTIONS.zoom;
      const x = Number.isFinite(Number(parsed?.x)) ? Math.max(0, Math.min(100, Number(parsed.x))) : DEFAULT_WALLPAPER_OPTIONS.x;
      const y = Number.isFinite(Number(parsed?.y)) ? Math.max(0, Math.min(100, Number(parsed.y))) : DEFAULT_WALLPAPER_OPTIONS.y;
      if (presetId === "custom" && image) return { presetId: "custom", image, fit, zoom, x, y };
      const preset = CHAT_WALLPAPER_PRESETS.find((item) => item.id === presetId);
      const fallbackPreset = CHAT_WALLPAPER_PRESETS.find((item) => item.id === DEFAULT_WALLPAPER_PRESET_ID);
      if (preset) return { presetId: preset.id, image: preset.image, fit, zoom, x, y };
      if (fallbackPreset) {
        return {
          presetId: fallbackPreset.id,
          image: fallbackPreset.image,
          fit: DEFAULT_WALLPAPER_OPTIONS.fit,
          zoom: DEFAULT_WALLPAPER_OPTIONS.zoom,
          x: DEFAULT_WALLPAPER_OPTIONS.x,
          y: DEFAULT_WALLPAPER_OPTIONS.y
        };
      }
      return {
        presetId: "none",
        image: "",
        fit: DEFAULT_WALLPAPER_OPTIONS.fit,
        zoom: DEFAULT_WALLPAPER_OPTIONS.zoom,
        x: DEFAULT_WALLPAPER_OPTIONS.x,
        y: DEFAULT_WALLPAPER_OPTIONS.y
      };
    } catch {
      const fallbackPreset = CHAT_WALLPAPER_PRESETS.find((item) => item.id === DEFAULT_WALLPAPER_PRESET_ID);
      return {
        presetId: fallbackPreset?.id || "none",
        image: fallbackPreset?.image || "",
        fit: DEFAULT_WALLPAPER_OPTIONS.fit,
        zoom: DEFAULT_WALLPAPER_OPTIONS.zoom,
        x: DEFAULT_WALLPAPER_OPTIONS.x,
        y: DEFAULT_WALLPAPER_OPTIONS.y
      };
    }
  });
  const [showWallpaperEditor, setShowWallpaperEditor] = useState(false);
  const [wallpaperDraft, setWallpaperDraft] = useState(null);
  const [replyDraft, setReplyDraft] = useState(null);

  const stompRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const livekitRoomRef = useRef(null);
  const livekitRoomIdRef = useRef("");
  const livekitConnectingRef = useRef(false);
  const callTimeoutRef = useRef(null);
  const callStateRef = useRef(callState);
  const incomingCallRef = useRef(null);
  const callStartedAtRef = useRef(null);
  const callConnectedLoggedRef = useRef(false);
  const rejoinRetryTimerRef = useRef(null);
  const rejoinRetryCountRef = useRef(0);
  const rejoinPayloadRef = useRef(null);
  const rejoinGraceUntilRef = useRef(0);
  const audioCtxRef = useRef(null);
  const remoteAudioCtxRef = useRef(null);
  const remoteAudioSourceRef = useRef(null);
  const remoteAudioGainRef = useRef(null);
  const ringtoneTimerRef = useRef(null);
  const outgoingRingTimerRef = useRef(null);
  const customRingtoneAudioRef = useRef(null);
  const disconnectGuardTimerRef = useRef(null);
  const historyRef = useRef({});
  const storyLongPressTimeoutRef = useRef(null);
  const storyLongPressTriggeredRef = useRef(false);
  const storyViewerVideoRef = useRef(null);
  const storyViewerCandidatesRef = useRef([]);
  const storyViewerCandidateIndexRef = useRef(0);
  const storyViewerBlobUrlRef = useRef("");
  const storyViewerBlobTriedRef = useRef(new Set());
  const storyViewerLoadTimeoutRef = useRef(null);
  const storyOptionsPausedRef = useRef(false);
  const activeStoryIdRef = useRef("");
  const storyPlayerRafRef = useRef(null);
  const storyPlayerDurationRef = useRef(STORY_IMAGE_DURATION_MS);
  const storyPlayerElapsedRef = useRef(0);
  const storyPlayerLastTickRef = useRef(0);
  const storyPlayerPausedRef = useRef(false);
  const viewedStoryIdsRef = useRef(new Set());
  const storyFeedDisabledUntilRef = useRef(0);
  const chatApiDisabledUntilRef = useRef(0);
  const seenSignalsRef = useRef(new Set());
  const longPressTimerRef = useRef(null);
  const contactLongPressTimerRef = useRef(null);
  const contactLongPressTriggeredRef = useRef(false);
  const touchStartPointRef = useRef({ x: 0, y: 0 });
  const touchSwipeReplyRef = useRef({ triggered: false });
  const tabIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const callChannelRef = useRef(null);
  const readReceiptChannelRef = useRef(null);
  const messageChannelRef = useRef(null);
  const seenReadReceiptsRef = useRef(new Set());
  const lastReadReceiptSentByContactRef = useRef({});
  const notifiedMessageKeysRef = useRef(new Map());
  const messagesByContactRef = useRef(messagesByContact);
  const composerInputRef = useRef(null);
  const attachInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const stickerInputRef = useRef(null);
  const wallpaperInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const speechRecognitionRef = useRef(null);
  const speechFinalTranscriptRef = useRef("");
  const speechInterimTranscriptRef = useRef("");
  const speechLastAppliedTextRef = useRef("");
  const headerMenuWrapRef = useRef(null);
  const headerMenuRef = useRef(null);
  const callMenuRef = useRef(null);
  const wallpaperPanelRef = useRef(null);
  const translationCacheRef = useRef({});
  const threadRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const lastThreadItemCountRef = useRef(0);
  const scrollRafRef = useRef(0);
  const openScrollPlanRef = useRef({ contactId: "", untilMs: 0, timers: [] });
  const showScrollDownRef = useRef(false);
  const spokenSignMessageIdsRef = useRef(new Set());
  const autoSpeakBootstrappedByContactRef = useRef({});
  const signApiUnavailableRef = useRef(false);
  const signLocalModelRef = useRef(null);
  const signLocalModelLoadingRef = useRef(null);
  const signLivePollTimerRef = useRef(null);
  const signLastDetectedTextRef = useRef("");
  const signLastDetectedAtRef = useRef(0);
  const signLiveBufferRef = useRef({
    parts: [],
    lastDetected: "",
    lastAt: 0,
    flushTimer: null,
    lastSent: "",
    lastContinuousText: "",
    lastContinuousAt: 0
  });
  const signAssistSendingRef = useRef(false);
  const signSequenceFramesRef = useRef([]);
  const signSequenceModelRef = useRef(null);
  const signSequenceModelLoadingRef = useRef(null);
  const chatServerBaseRef = useRef(String(safeGetItem(CHAT_SERVER_BASE_KEY) || "").trim());
  const resolvingContactProfilesRef = useRef(new Set());
  const convoLoadingRef = useRef(false);
  const lastConvoPollRef = useRef(0);
  const lastThreadPollRef = useRef(0);
  const discoveryHydratedRef = useRef(false);
  const localHydratedRef = useRef(false);

  useEffect(() => {
    messagesByContactRef.current = messagesByContact;
  }, [messagesByContact]);

  const TRANSLATE_LANG_OPTIONS = [
    { value: "en", label: "English" },
    { value: "te", label: "Telugu" },
    { value: "hi", label: "Hindi" },
    { value: "ta", label: "Tamil" },
    { value: "kn", label: "Kannada" },
    { value: "ml", label: "Malayalam" },
    { value: "mr", label: "Marathi" },
    { value: "bn", label: "Bengali" },
    { value: "gu", label: "Gujarati" },
    { value: "pa", label: "Punjabi" },
    { value: "ur", label: "Urdu" },
    { value: "ar", label: "Arabic" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "pt", label: "Portuguese" },
    { value: "de", label: "German" },
    { value: "it", label: "Italian" },
    { value: "tr", label: "Turkish" },
    { value: "ru", label: "Russian" },
    { value: "id", label: "Indonesian" },
    { value: "vi", label: "Vietnamese" },
    { value: "th", label: "Thai" },
    { value: "ja", label: "Japanese" },
    { value: "ko", label: "Korean" },
    { value: "zh", label: "Chinese (Simplified)" }
  ];

  const threadWallpaperStyle = useMemo(() => {
    const image = String(chatWallpaper?.image || "").trim();
    if (!image) return undefined;
    const fit = String(chatWallpaper?.fit || DEFAULT_WALLPAPER_OPTIONS.fit).toLowerCase();
    const zoom = Number.isFinite(Number(chatWallpaper?.zoom))
      ? Math.max(60, Math.min(220, Number(chatWallpaper.zoom)))
      : DEFAULT_WALLPAPER_OPTIONS.zoom;
    const x = Number.isFinite(Number(chatWallpaper?.x))
      ? Math.max(0, Math.min(100, Number(chatWallpaper.x)))
      : DEFAULT_WALLPAPER_OPTIONS.x;
    const y = Number.isFinite(Number(chatWallpaper?.y))
      ? Math.max(0, Math.min(100, Number(chatWallpaper.y)))
      : DEFAULT_WALLPAPER_OPTIONS.y;
    const backgroundSize =
      fit === "contain" ? `${zoom}% auto` : fit === "stretch" ? "100% 100%" : `${zoom}% ${zoom}%`;
    return {
      backgroundImage: `linear-gradient(rgba(2, 8, 16, 0.82), rgba(2, 8, 16, 0.88)), url("${image}")`,
      backgroundSize,
      backgroundPosition: `${x}% ${y}%`,
      backgroundRepeat: "no-repeat"
    };
  }, [chatWallpaper]);

  useEffect(() => {
    const updateSpeechLangs = () => {
      const voices = "speechSynthesis" in window && window.speechSynthesis?.getVoices
        ? window.speechSynthesis.getVoices()
        : [];
      const voiceLangs = Array.isArray(voices) ? voices.map((v) => v?.lang) : [];
      const browserLangs = Array.isArray(navigator?.languages) ? navigator.languages : [navigator?.language];
      const nextOptions = buildSpeechLangOptions([...voiceLangs, ...browserLangs]);
      setSpeechLangOptions(nextOptions);
      const current = normalizeLangCode(speechLang);
      if (!nextOptions.some((opt) => opt.value === current)) {
        const fallback = nextOptions.find((opt) => opt.value.startsWith("en"))?.value || nextOptions[0]?.value || "en-IN";
        setSpeechLang(fallback);
      }
    };

    updateSpeechLangs();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = updateSpeechLangs;
    }
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [speechLang]);

  useEffect(() => {
    safeSetItem(CHAT_FAVORITES_KEY, JSON.stringify(favoritePicks));
  }, [favoritePicks]);

  useEffect(() => {
    safeSetItem(CHAT_CUSTOM_STICKERS_KEY, JSON.stringify(customStickers));
  }, [customStickers]);

  useEffect(() => {
    try {
      localStorage.setItem(
        CHAT_TRANSLATOR_KEY,
        JSON.stringify({ enabled: translatorEnabled, lang: translatorLang, voiceGender: speechVoiceGender })
      );
    } catch {
      // ignore
    }
  }, [translatorEnabled, translatorLang, speechVoiceGender]);

  useEffect(() => {
    try {
      localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(blockedUsers));
    } catch {
      // ignore
    }
  }, [blockedUsers]);

  useEffect(() => {
    try {
      localStorage.setItem(
        CHAT_WALLPAPER_KEY,
        JSON.stringify({
          presetId: chatWallpaper?.presetId || DEFAULT_WALLPAPER_PRESET_ID,
          image: String(chatWallpaper?.image || ""),
          fit: String(chatWallpaper?.fit || DEFAULT_WALLPAPER_OPTIONS.fit),
          zoom: Number(chatWallpaper?.zoom || DEFAULT_WALLPAPER_OPTIONS.zoom),
          x: Number(chatWallpaper?.x || DEFAULT_WALLPAPER_OPTIONS.x),
          y: Number(chatWallpaper?.y || DEFAULT_WALLPAPER_OPTIONS.y)
        })
      );
    } catch {
      // ignore
    }
  }, [chatWallpaper]);

  const selectChatWallpaperPreset = (presetId) => {
    const picked = CHAT_WALLPAPER_PRESETS.find((item) => item.id === presetId);
    if (!picked) return;
    setChatWallpaper((prev) => ({
      presetId: picked.id,
      image: picked.image,
      fit: prev?.fit || DEFAULT_WALLPAPER_OPTIONS.fit,
      zoom: Number.isFinite(Number(prev?.zoom)) ? Number(prev.zoom) : DEFAULT_WALLPAPER_OPTIONS.zoom,
      x: Number.isFinite(Number(prev?.x)) ? Number(prev.x) : DEFAULT_WALLPAPER_OPTIONS.x,
      y: Number.isFinite(Number(prev?.y)) ? Number(prev.y) : DEFAULT_WALLPAPER_OPTIONS.y
    }));
  };

  const openWallpaperPicker = () => {
    if (!wallpaperInputRef.current) return;
    wallpaperInputRef.current.value = "";
    wallpaperInputRef.current.click();
  };

  const buildWallpaperDraft = (source) => {
    const base = source || {};
    return {
      presetId: String(base?.presetId || "custom"),
      image: String(base?.image || ""),
      fit: String(base?.fit || DEFAULT_WALLPAPER_OPTIONS.fit),
      zoom: Number.isFinite(Number(base?.zoom)) ? Math.max(60, Math.min(220, Number(base.zoom))) : DEFAULT_WALLPAPER_OPTIONS.zoom,
      x: Number.isFinite(Number(base?.x)) ? Math.max(0, Math.min(100, Number(base.x))) : DEFAULT_WALLPAPER_OPTIONS.x,
      y: Number.isFinite(Number(base?.y)) ? Math.max(0, Math.min(100, Number(base.y))) : DEFAULT_WALLPAPER_OPTIONS.y
    };
  };

  const openWallpaperEditor = (source = null) => {
    const draft = buildWallpaperDraft(source || chatWallpaper);
    if (!draft.image) return;
    setWallpaperDraft(draft);
    setShowWallpaperEditor(true);
    setShowWallpaperPanel(false);
  };

  const closeWallpaperEditor = () => {
    setShowWallpaperEditor(false);
    setWallpaperDraft(null);
  };

  const applyWallpaperEditor = () => {
    if (!wallpaperDraft?.image) return closeWallpaperEditor();
    setChatWallpaper(buildWallpaperDraft(wallpaperDraft));
    closeWallpaperEditor();
  };

  const onWallpaperPicked = (event) => {
    const file = event?.target?.files?.[0];
    if (!file || !String(file.type || "").startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (!result) return;
      const draft = {
        presetId: "custom",
        image: result,
        fit: chatWallpaper?.fit || DEFAULT_WALLPAPER_OPTIONS.fit,
        zoom: Number.isFinite(Number(chatWallpaper?.zoom)) ? Number(chatWallpaper.zoom) : DEFAULT_WALLPAPER_OPTIONS.zoom,
        x: Number.isFinite(Number(chatWallpaper?.x)) ? Number(chatWallpaper.x) : DEFAULT_WALLPAPER_OPTIONS.x,
        y: Number.isFinite(Number(chatWallpaper?.y)) ? Number(chatWallpaper.y) : DEFAULT_WALLPAPER_OPTIONS.y
      };
      setWallpaperDraft(buildWallpaperDraft(draft));
      setShowWallpaperEditor(true);
    };
    reader.readAsDataURL(file);
  };

  const updateWallpaperOptions = (patch) => {
    setWallpaperDraft((prev) => ({
      ...prev,
      ...(patch || {})
    }));
  };

  const ensureAudioContext = () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    return ctx;
  };

  const ensureAudioReady = async () => {
    const ctx = ensureAudioContext();
    if (!ctx) return null;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // ignore resume errors
      }
    }
    return ctx.state === "running" ? ctx : null;
  };

  const playTone = async (frequency = 700, durationMs = 160, gainValue = 0.05, type = "sine") => {
    const ctx = await ensureAudioReady();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + durationMs / 1000);
  };

  const playNotificationPattern = (profile) => {
    if (profile === "off") return;
    if (profile === "soft") {
      void playTone(620, 130, 0.06, "sine");
      window.setTimeout(() => void playTone(760, 140, 0.06, "sine"), 150);
      return;
    }
    if (profile === "digital") {
      void playTone(980, 95, 0.08, "square");
      window.setTimeout(() => void playTone(1240, 95, 0.08, "square"), 110);
      return;
    }
    if (profile === "sparkle") {
      void playTone(740, 90, 0.08, "triangle");
      window.setTimeout(() => void playTone(980, 90, 0.08, "triangle"), 120);
      window.setTimeout(() => void playTone(1320, 120, 0.06, "sine"), 240);
      return;
    }
    if (profile === "bubble") {
      void playTone(420, 80, 0.09, "sine");
      window.setTimeout(() => void playTone(520, 85, 0.08, "sine"), 90);
      window.setTimeout(() => void playTone(640, 95, 0.08, "triangle"), 180);
      return;
    }
    if (profile === "twinkle") {
      void playTone(880, 85, 0.08, "sine");
      window.setTimeout(() => void playTone(1175, 85, 0.07, "sine"), 110);
      window.setTimeout(() => void playTone(1568, 100, 0.06, "sine"), 220);
      return;
    }
    if (profile === "pop") {
      void playTone(360, 65, 0.09, "square");
      window.setTimeout(() => void playTone(960, 105, 0.08, "triangle"), 90);
      return;
    }
    void playTone(820, 120, 0.08, "triangle");
    window.setTimeout(() => void playTone(980, 120, 0.07, "triangle"), 140);
  };

  const playNotificationBeep = () => {
    playNotificationPattern(soundPrefs.notificationSound);
  };

  const playMessageAlert = () => {
    playNotificationPattern(soundPrefs.notificationSound);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([40, 40, 40]);
    }
  };

  const maybeShowBrowserNotification = (title, body) => {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        // Show only when page is backgrounded to reduce noise.
        if (document.hidden) new Notification(title, { body });
      }
    } catch {
      // ignore notification errors
    }
  };

  const stopRingtone = () => {
    if (ringtoneTimerRef.current) {
      clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
    try {
      if (customRingtoneAudioRef.current) {
        customRingtoneAudioRef.current.pause();
        customRingtoneAudioRef.current.currentTime = 0;
      }
    } catch {
      // ignore audio stop errors
    }
  };

  const stopOutgoingRing = () => {
    if (outgoingRingTimerRef.current) {
      clearInterval(outgoingRingTimerRef.current);
      outgoingRingTimerRef.current = null;
    }
    try {
      if (customRingtoneAudioRef.current) {
        customRingtoneAudioRef.current.pause();
        customRingtoneAudioRef.current.currentTime = 0;
      }
    } catch {
      // ignore audio stop errors
    }
  };

  const playCustomRingtoneLoop = () => {
    if (soundPrefs.ringtoneSound !== "custom") return false;
    const src = String(soundPrefs.customRingtoneDataUrl || soundPrefs.customRingtoneUrl || "").trim();
    if (!src) return false;
    const startSec = Math.max(0, Number(soundPrefs.customRingtoneStartSec) || 0);
    const durationSec = Math.max(2, Number(soundPrefs.customRingtoneDurationSec) || 20);
    const endSec = startSec + durationSec;
    try {
      if (!customRingtoneAudioRef.current) {
        customRingtoneAudioRef.current = new Audio(src);
      }
      const audio = customRingtoneAudioRef.current;
      if (audio.src !== src) audio.src = src;
      audio.loop = false;
      audio.volume = 0.95;
      audio.currentTime = startSec;
      audio.ontimeupdate = () => {
        if (audio.currentTime >= endSec) {
          audio.currentTime = startSec;
          void audio.play();
        }
      };
      void audio.play();
      return true;
    } catch {
      return false;
    }
  };

  const startRingtone = (force = false) => {
    if (ringtoneMuted && !force) return;
    if (soundPrefs.ringtoneSound === "off") return;
    stopRingtone();
    if (playCustomRingtoneLoop()) return;
    const ring = () => {
      if (soundPrefs.ringtoneSound === "bell") {
        void playTone(700, 200, 0.2, "sine");
        window.setTimeout(() => void playTone(880, 200, 0.2, "sine"), 210);
        return;
      }
      if (soundPrefs.ringtoneSound === "pulse") {
        void playTone(560, 240, 0.2, "triangle");
        window.setTimeout(() => void playTone(620, 240, 0.18, "triangle"), 260);
        return;
      }
      if (soundPrefs.ringtoneSound === "marimba") {
        void playTone(523, 180, 0.16, "sine");
        window.setTimeout(() => void playTone(659, 180, 0.15, "sine"), 210);
        window.setTimeout(() => void playTone(784, 220, 0.14, "sine"), 420);
        return;
      }
      if (soundPrefs.ringtoneSound === "chime") {
        void playTone(660, 220, 0.16, "triangle");
        window.setTimeout(() => void playTone(990, 260, 0.14, "triangle"), 250);
        return;
      }
      if (soundPrefs.ringtoneSound === "birdsong") {
        void playTone(940, 120, 0.12, "sine");
        window.setTimeout(() => void playTone(1260, 120, 0.11, "sine"), 140);
        window.setTimeout(() => void playTone(1020, 140, 0.11, "sine"), 290);
        return;
      }
      void playTone(640, 320, 0.22, "square");
      window.setTimeout(() => void playTone(760, 360, 0.2, "square"), 280);
    };
    ring();
    ringtoneTimerRef.current = setInterval(ring, 1400);
  };

  const startOutgoingRing = () => {
    if (soundPrefs.ringtoneSound === "off") return;
    stopOutgoingRing();
    if (playCustomRingtoneLoop()) return;
    const ring = () => {
      if (soundPrefs.ringtoneSound === "bell") {
        void playTone(680, 190, 0.18, "sine");
        window.setTimeout(() => void playTone(840, 190, 0.18, "sine"), 210);
        return;
      }
      if (soundPrefs.ringtoneSound === "pulse") {
        void playTone(540, 220, 0.18, "triangle");
        window.setTimeout(() => void playTone(600, 220, 0.17, "triangle"), 250);
        return;
      }
      if (soundPrefs.ringtoneSound === "marimba") {
        void playTone(494, 170, 0.15, "sine");
        window.setTimeout(() => void playTone(659, 180, 0.14, "sine"), 190);
        window.setTimeout(() => void playTone(784, 200, 0.13, "sine"), 390);
        return;
      }
      if (soundPrefs.ringtoneSound === "chime") {
        void playTone(620, 210, 0.14, "triangle");
        window.setTimeout(() => void playTone(930, 250, 0.13, "triangle"), 230);
        return;
      }
      if (soundPrefs.ringtoneSound === "birdsong") {
        void playTone(900, 110, 0.11, "sine");
        window.setTimeout(() => void playTone(1180, 110, 0.1, "sine"), 120);
        window.setTimeout(() => void playTone(980, 130, 0.1, "sine"), 260);
        return;
      }
      void playTone(520, 320, 0.2, "triangle");
      window.setTimeout(() => void playTone(620, 320, 0.18, "triangle"), 280);
    };
    ring();
    outgoingRingTimerRef.current = setInterval(ring, 1500);
  };

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    setStoryCommentDraft("");
    setStoryCommentOpen(false);
  }, [storyViewerIndex]);

  useEffect(() => {
    groupActiveRef.current = groupCallActive;
  }, [groupCallActive]);

  function resumeRemoteAudio() {
    const ctx = remoteAudioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume?.().catch(() => {});
    }
  }

  const applySpeakerState = useCallback((speakerOn) => {
    const remoteVideoEl = remoteVideoRef.current;
    const remoteAudioEl = remoteAudioRef.current;
    if (remoteVideoEl) {
      // Keep the remote video element muted so autoplay isn't blocked.
      // Audio is handled by the dedicated hidden audio element.
      remoteVideoEl.muted = true;
      remoteVideoEl.volume = 0;
      remoteVideoEl.play?.().catch(() => {});
    }
    if (remoteAudioEl) {
      remoteAudioEl.muted = !speakerOn;
      remoteAudioEl.volume = 1;
      if (speakerOn) remoteAudioEl.play?.().catch(() => {});
    }
    if (remoteAudioGainRef.current) {
      remoteAudioGainRef.current.gain.value = speakerOn ? 1 : 0;
    }
    if (speakerOn) {
      resumeRemoteAudio();
    }
  }, []);

  const kickstartRemotePlayback = useCallback(() => {
    const remoteVideoEl = remoteVideoRef.current;
    const remoteAudioEl = remoteAudioRef.current;
    if (remoteVideoEl) {
      remoteVideoEl.muted = true;
      remoteVideoEl.volume = 0;
      remoteVideoEl.play?.().catch(() => {});
    }
    if (remoteAudioEl) {
      remoteAudioEl.muted = !isSpeakerOn;
      remoteAudioEl.volume = 1;
      remoteAudioEl.play?.().catch(() => {});
    }
    resumeRemoteAudio();
  }, [isSpeakerOn]);

  useEffect(() => {
    applySpeakerState(isSpeakerOn);
  }, [applySpeakerState, isSpeakerOn, callState.phase, callState.mode]);

  useEffect(() => {
    const supported =
      typeof document !== "undefined" &&
      "pictureInPictureEnabled" in document &&
      document.pictureInPictureEnabled;
    setPipEnabled(Boolean(supported));
  }, []);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || typeof el.addEventListener !== "function") return undefined;
    const onEnter = () => {
      pipDismissedRef.current = false;
      setPipActive(true);
    };
    const onLeave = () => {
      setPipActive(false);
      pipDismissedRef.current = true;
    };
    el.addEventListener("enterpictureinpicture", onEnter);
    el.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      el.removeEventListener("enterpictureinpicture", onEnter);
      el.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);


  useEffect(() => {
    if (callState.phase === "idle") {
      callStartedAtRef.current = null;
      setCallDurationSec(0);
      return undefined;
    }

    if (callState.phase === "in-call" && !callStartedAtRef.current) {
      callStartedAtRef.current = Date.now();
      setCallDurationSec(0);
    }

    const timer = setInterval(() => {
      if (!callStartedAtRef.current) {
        setCallDurationSec(0);
        return;
      }
      setCallDurationSec(Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1000)));
    }, 1000);

    return () => clearInterval(timer);
  }, [callState.phase]);

  useEffect(() => {
    if (callState.phase === "idle" || callState.mode !== "video") {
      setShowVideoFilters(false);
    }
  }, [callState.phase, callState.mode]);

  useEffect(() => {
    const localStream = localStreamRef.current;
    const localEl = localVideoRef.current;
    if (localEl && localStream && localEl.srcObject !== localStream) {
      localEl.srcObject = localStream;
      localEl.play?.().catch(() => {});
    }

    const remoteStream = remoteStreamRef.current;
    const remoteVideoEl = remoteVideoRef.current;
    if (remoteVideoEl && remoteStream && remoteVideoEl.srcObject !== remoteStream) {
      remoteVideoEl.srcObject = remoteStream;
      remoteVideoEl.play?.().catch(() => {});
    }

    const remoteAudioEl = remoteAudioRef.current;
    if (remoteAudioEl && remoteStream && remoteAudioEl.srcObject !== remoteStream) {
      remoteAudioEl.srcObject = remoteStream;
      remoteAudioEl.play?.().catch(() => {});
    }
    applySpeakerState(isSpeakerOn);
  }, [applySpeakerState, callState.phase, callState.mode, isSpeakerOn]);

  useEffect(() => {
    const unlockAudio = () => {
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshStories = () => {
      fetchStoryFeed().catch(() => {});
    };
    refreshStories();
    const onStorage = (event) => {
      if (event?.key === STORY_STORAGE_KEY) refreshStories();
    };
    window.addEventListener("storage", onStorage);
    const pruneTimer = setInterval(refreshStories, 60000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(pruneTimer);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const className = "ss-story-viewer-open";
    if (storyViewerIndex != null) {
      document.body.classList.add(className);
    } else {
      document.body.classList.remove(className);
    }
    return () => document.body.classList.remove(className);
  }, [storyViewerIndex]);

  useEffect(() => {
    const onStorage = (event) => {
      if (!event || event.key === SETTINGS_KEY) {
        setSoundPrefs(readSoundPrefs());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (!event || event.key === FOLLOWING_CACHE_KEY) {
        setFollowingCacheTick((prev) => prev + 1);
      }
      if (!event || event.key === CHAT_REQUESTS_KEY) {
        setPendingChatRequests(readChatRequestCache());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (isConversationRoute) return undefined;
    let active = true;

    const isPendingRequest = (request) => {
      const status = String(request?.status || request?.followStatus || request?.state || "")
        .trim()
        .toLowerCase();
      if (!status) return true;
      if (status.includes("pending")) return true;
      if (status.includes("request")) return true;
      return false;
    };

    const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

    const isIncomingRequest = (request) => {
      const receiver =
        request?.receiver ||
        request?.target ||
        request?.toUser ||
        request?.user ||
        request?.recipient ||
        {};
      const receiverId = String(request?.receiverId || receiver?.id || receiver?.userId || "").trim();
      const receiverEmail = normalizeEmail(request?.receiverEmail || receiver?.email);
      if (!receiverId && !receiverEmail) return true;
      if (myUserId && receiverId && receiverId === String(myUserId)) return true;
      if (myEmail && receiverEmail && receiverEmail === normalizeEmail(myEmail)) return true;
      return false;
    };

    const isOutgoingRequest = (request) => {
      const sender =
        request?.sender ||
        request?.actor ||
        request?.fromUser ||
        request?.requester ||
        request?.initiator ||
        {};
      const senderId = String(request?.senderId || sender?.id || sender?.userId || "").trim();
      const senderEmail = normalizeEmail(request?.senderEmail || sender?.email);
      if (!senderId && !senderEmail) return false;
      if (myUserId && senderId && senderId === String(myUserId)) return true;
      if (myEmail && senderEmail && senderEmail === normalizeEmail(myEmail)) return true;
      return false;
    };

    const isFollowRequestNotification = (item) => {
      const kind = String(item?.kind || item?.type || "").trim().toLowerCase();
      const status = String(item?.status || item?.followStatus || item?.relationship || item?.state || "")
        .trim()
        .toLowerCase();
      const title = String(item?.title || "");
      const message = String(item?.message || item?.text || "");
      const combined = `${title} ${message}`.toLowerCase();
      if (status.includes("request") || status.includes("pending")) return true;
      if (kind.includes("follow")) {
        if (combined.includes("request")) return true;
        if (combined.includes("requested")) return true;
      }
      return /requested to follow|follow request|requested you/i.test(combined);
    };

    const mapNotificationToRequest = (item) => {
      const id = String(item?.followRequestId || item?.requestId || "").trim();
      const status = item?.followRequestStatus || item?.followStatus || item?.status || "PENDING";
      const sender =
        item?.sender ||
        item?.actor ||
        item?.user ||
        item?.fromUser ||
        item?.requester ||
        item?.initiator ||
        item?.profile ||
        item?.actorUser ||
        item?.actorProfile ||
        item?.actorInfo ||
        item?.userProfile ||
        null;
      return {
        ...item,
        id,
        status,
        ...(sender ? { sender } : {})
      };
    };

    const loadRequests = async (showLoader = false) => {
      if (showLoader) setChatRequestsLoading(true);
      setChatRequestError("");
      try {
        let res = null;
        let usedNotifications = false;
        let list = [];
        let sourceUrl = "";
        try {
          res = await requestChatArray({
            endpoints: ["/api/follow/requests", "/api/follow/pending-requests"],
            timeoutMs: 6000,
            maxAttempts: 8
          });
          list = Array.isArray(res?.list) ? res.list : [];
          sourceUrl = String(res?.url || "");
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          if (status === 405) {
            try {
              const notifRes = await requestChatArray({
                endpoints: ["/api/notifications"],
                timeoutMs: 5000,
                maxAttempts: 4
              });
              const notifList = Array.isArray(notifRes?.list) ? notifRes.list : [];
              list = notifList.filter(isFollowRequestNotification).map(mapNotificationToRequest);
              sourceUrl = String(notifRes?.url || "");
              usedNotifications = true;
            } catch {
              throw err;
            }
          } else {
            throw err;
          }
        }
        if (!usedNotifications && Array.isArray(list) && list.length === 0) {
          try {
            const notifRes = await requestChatArray({
              endpoints: ["/api/notifications"],
              timeoutMs: 5000,
              maxAttempts: 4
            });
            const notifList = Array.isArray(notifRes?.list) ? notifRes.list : [];
            list = notifList.filter(isFollowRequestNotification).map(mapNotificationToRequest);
            sourceUrl = String(notifRes?.url || sourceUrl);
          } catch {
            // ignore notification fallback failures
          }
        }
        if (!active) return;
        const pending = Array.isArray(list)
          ? list.filter((item) => item && typeof item === "object" && isPendingRequest(item))
          : [];
        const hasIdentity = Boolean(String(myUserId || "").trim() || String(myEmail || "").trim());
        const normalizedSourceUrl = String(sourceUrl || "").toLowerCase();
        if (!hasIdentity) {
          setChatRequests(pending);
          setSentChatRequests([]);
        } else if (normalizedSourceUrl.includes("pending-requests")) {
          setChatRequests([]);
          setSentChatRequests(pending);
        } else if (
          normalizedSourceUrl.includes("/requests") &&
          !normalizedSourceUrl.includes("pending-requests")
        ) {
          setChatRequests(pending);
          setSentChatRequests([]);
        } else {
          const outgoing = pending.filter(isOutgoingRequest);
          const incoming = pending.filter((req) => isIncomingRequest(req) && !isOutgoingRequest(req));
          setChatRequests(incoming);
          setSentChatRequests(outgoing);
        }
      } catch (err) {
        if (!active) return;
        setChatRequests([]);
        setSentChatRequests([]);
        const status = Number(err?.response?.status || 0);
        const statusLabel = status ? `HTTP ${status}` : "Network error";
        if (status === 401 || status === 403) {
          setChatRequestError(`Login required to view chat requests (${statusLabel}).`);
        } else {
          setChatRequestError(`Chat requests unavailable (${statusLabel}).`);
        }
      } finally {
        if (active && showLoader) setChatRequestsLoading(false);
      }
    };

    loadRequests(true);
    const timer = setInterval(() => loadRequests(false), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isConversationRoute, myUserId, myEmail]);

  const localThreadKey = (a, b) => [String(a || ""), String(b || "")].sort().join(":");

  const localChatStorageKey = () => {
    const id = String(myUserId || safeGetItem("userId") || "").trim();
    const email = String(myEmail || safeGetItem("email") || "").trim().toLowerCase();
    const hint = id || email || "guest";
    return `${LOCAL_CHAT_KEY}_${hint}`;
  };

  const filterLocalChatForUser = (data, idHint) => {
    if (!data || typeof data !== "object") return {};
    const me = String(idHint || "").trim();
    if (!me) return data;
    const entries = Object.entries(data).filter(([key]) => {
      const parts = String(key || "")
        .split(":")
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      return parts.includes(me);
    });
    return Object.fromEntries(entries);
  };

  const readLocalChat = () => {
    const key = localChatStorageKey();
    try {
      const raw = safeGetItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      }
    } catch {
      // ignore parsing errors
    }

    // Legacy migration (non-user-scoped key).
    try {
      const legacyRaw = safeGetItem(LOCAL_CHAT_KEY);
      if (!legacyRaw) return {};
      const parsed = JSON.parse(legacyRaw);
      const filtered = filterLocalChatForUser(parsed, myUserId || safeGetItem("userId"));
      if (filtered && typeof filtered === "object" && Object.keys(filtered).length > 0) {
        safeSetItem(key, JSON.stringify(filtered));
        return filtered;
      }
    } catch {
      // ignore legacy failures
    }
    return {};
  };

  const writeLocalChat = (data) => {
    safeSetItem(localChatStorageKey(), JSON.stringify(data));
  };

  const readFollowingCache = () => {
    try {
      const raw = safeGetItem(FOLLOWING_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const normalizeFollowKey = (value) => String(value || "").trim().toLowerCase();

  const writeFollowingCache = (value) => {
    safeSetItem(FOLLOWING_CACHE_KEY, JSON.stringify(value || {}));
  };

  const updateFollowCache = (identifiers, following) => {
    const keys = (identifiers || []).map(normalizeFollowKey).filter(Boolean);
    if (!keys.length) return;
    const cache = readFollowingCache();
    keys.forEach((key) => {
      cache[key] = Boolean(following);
    });
    writeFollowingCache(cache);
    setFollowingCacheTick((prev) => prev + 1);
  };

  const getFollowKeysForContact = (contact) => {
    if (!contact) return [];
    return [
      normalizeFollowKey(contact.id),
      normalizeFollowKey(contact.email),
      normalizeFollowKey(contact.username)
    ].filter(Boolean);
  };

  const readChatRequestCache = () => {
    try {
      const raw = safeGetItem(CHAT_REQUESTS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeChatRequestCache = (next) => {
    safeSetItem(CHAT_REQUESTS_KEY, JSON.stringify(next || {}));
  };

  const hiddenMessageStorageKey = () => `${HIDDEN_CHAT_MSG_IDS_KEY}_${myUserId || "guest"}`;

  const readHiddenMessageMap = () => {
    try {
      const raw = safeGetItem(hiddenMessageStorageKey());
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeHiddenMessageMap = (value) => {
    safeSetItem(hiddenMessageStorageKey(), JSON.stringify(value || {}));
  };

  const getHiddenMessageSetForContact = (otherId) => {
    const key = localThreadKey(myUserId, otherId);
    const map = readHiddenMessageMap();
    const list = Array.isArray(map[key]) ? map[key] : [];
    return new Set(list.map((x) => String(x || "").trim()).filter(Boolean));
  };

  const markMessageHiddenForMe = (otherId, messageId) => {
    const msgId = String(messageId || "").trim();
    if (!msgId) return;
    const key = localThreadKey(myUserId, otherId);
    const map = readHiddenMessageMap();
    const existing = Array.isArray(map[key]) ? map[key] : [];
    if (existing.includes(msgId)) return;
    const next = [...existing, msgId].slice(-600);
    map[key] = next;
    writeHiddenMessageMap(map);
  };

  const callHistoryStorageKey = () => `${CALL_HISTORY_KEY}_${myUserId || "guest"}`;

  const readCallHistory = () => {
    try {
      const raw = safeGetItem(callHistoryStorageKey());
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeCallHistory = (next) => {
    safeSetItem(callHistoryStorageKey(), JSON.stringify(next));
  };

  const pushCallHistory = (contactUserId, entry) => {
    const key = String(contactUserId || "");
    if (!key) return;
    setCallHistoryByContact((prev) => {
      const nextEntry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        at: new Date().toISOString(),
        mode: "audio",
        status: "ended",
        direction: "outgoing",
        ...entry
      };
      const existing = Array.isArray(prev[key]) ? prev[key] : [];
      const nextList = [nextEntry, ...existing].slice(0, 30);
      const next = { ...prev, [key]: nextList };
      historyRef.current = next;
      writeCallHistory(next);
      return next;
    });
  };

  const normalizeDisplayName = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "User";
    const local = raw.includes("@") ? raw.split("@")[0] : raw;
    const cleaned = local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "User";
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const isGenericUserLabel = (value, idHint = "") => {
    const text = String(value || "").trim().toLowerCase();
    const compact = text.replace(/\s+/g, "");
    const id = String(idHint || "").trim().toLowerCase();
    if (!compact) return true;
    if (compact === "user" || compact === "unknown") return true;
    if (/^user\d+$/.test(compact)) return true;
    if (id && (compact === id || compact === `user${id}`)) return true;
    return false;
  };

  const getContactDisplayName = (contactLike) => {
    const id = String(contactLike?.id || "").trim();
    const usernameRaw = String(contactLike?.username || contactLike?.handle || "").trim();
    const username = usernameRaw ? normalizeDisplayName(usernameRaw) : "";
    const nameRaw = String(contactLike?.name || "").trim();
    const normalizedName = nameRaw ? normalizeDisplayName(nameRaw) : "";
    const email = String(contactLike?.email || "").trim();

    if (normalizedName && !isGenericUserLabel(normalizedName, id)) return normalizedName;
    if (username && !isGenericUserLabel(username, id)) return username;
    if (email) return normalizeDisplayName(email);
    if (normalizedName) return normalizedName;
    if (username) return username;
    return normalizeDisplayName(`User ${id || ""}`);
  };

  const normalizeTimestamp = (value) => {
    if (!value && value !== 0) return "";
    if (value instanceof Date) {
      const t = value.getTime();
      return Number.isFinite(t) ? value.toISOString() : "";
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const ms = asNumber < 1000000000000 ? asNumber * 1000 : asNumber;
      return new Date(ms).toISOString();
    }
    if (typeof value === "string") {
      const raw = value.trim();
      if (!raw) return "";
      // Backend may send ISO-like time without timezone; treat it as local time.
      const noZoneIso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw);
      if (noZoneIso) {
        const normalized = raw.replace(" ", "T");
        const candidate = ASSUME_UTC_TS ? `${normalized}Z` : normalized;
        return new Date(candidate).toISOString();
      }
    }
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    return String(value || "");
  };

  const toEpochMs = (value) => {
    if (value == null || value === "") return 0;
    if (value instanceof Date) {
      const t = value.getTime();
      return Number.isFinite(t) ? t : 0;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1000000000000 ? numeric * 1000 : numeric;
    }
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const noZoneIso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw);
    const normalized = noZoneIso ? raw.replace(" ", "T") : raw;
    const candidate = noZoneIso && ASSUME_UTC_TS ? `${normalized}Z` : normalized;
    const parsed = new Date(candidate).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeMessage = (message, otherId = "") => {
    const rawText = String(message?.text ?? message?.message ?? message?.content ?? "");
    const { text: normalizedText, replyTo } = parseReplyEnvelope(rawText);
    const rawTime = message?.createdAt ?? message?.sentAt ?? message?.timestamp ?? message?.time ?? "";
    const senderId = String(
      message?.senderId ?? message?.fromUserId ?? message?.fromId ?? message?.userId ?? message?.sender?.id ?? ""
    );
    const receiverId = String(
      message?.receiverId ?? message?.toUserId ?? message?.toId ?? message?.receiver?.id ?? ""
    );
    const mine =
      typeof message?.mine === "boolean"
        ? message.mine
        : senderId
          ? senderId === String(myUserId)
          : receiverId
            ? receiverId !== String(otherId)
            : false;

    const stableId =
      message?.id ||
      message?.messageId ||
      message?.chatId ||
      [
        senderId || "unknown",
        receiverId || otherId || "unknown",
        String(rawTime || ""),
        rawText
      ].join("|");

    return {
      ...message,
      id: stableId,
      senderId: senderId || undefined,
      receiverId: receiverId || undefined,
      text: normalizedText,
      replyTo: replyTo || undefined,
      audioUrl: String(message?.audioUrl || ""),
      speechTyped: Boolean(message?.speechTyped),
      mediaUrl: String(message?.mediaUrl || ""),
      mediaType: String(message?.mediaType || ""),
      fileName: String(message?.fileName || ""),
      createdAt: normalizeTimestamp(rawTime),
      mine
    };
  };

  const messageFingerprint = (message) => {
    if (!message) return "";
    const sender = String(message?.senderId || "");
    const receiver = String(message?.receiverId || "");
    const text = String(message?.text || "").trim();
    const mediaUrl = String(message?.mediaUrl || message?.audioUrl || "").trim();
    const mediaType = String(message?.mediaType || (message?.audioUrl ? "audio" : "")).trim();
    const createdAt = toEpochMs(message?.createdAt || 0);
    if (!sender && !receiver && !text && !mediaUrl) return "";
    const bucketMs = 4000;
    const bucket = createdAt ? Math.round(createdAt / bucketMs) : 0;
    return `${sender}|${receiver}|${text}|${mediaType}|${mediaUrl}|${bucket}`;
  };

  const buildMessageAlertKey = (message, contactId = "") => {
    if (!message) return "";
    const stableId = String(message?.id || "").trim();
    if (stableId) return `${String(contactId || "")}|${stableId}`;
    const sender = String(message?.senderId || "").trim();
    const receiver = String(message?.receiverId || "").trim();
    const text = String(message?.text || "").trim();
    const mediaUrl = String(message?.mediaUrl || message?.audioUrl || "").trim();
    const mediaType = String(message?.mediaType || (message?.audioUrl ? "audio" : "")).trim();
    return `${String(contactId || "")}|${sender}|${receiver}|${text}|${mediaType}|${mediaUrl}`;
  };

  const shouldNotifyForMessage = (message, contactId = "") => {
    const key = buildMessageAlertKey(message, contactId);
    if (!key) return true;
    const now = Date.now();
    const seen = notifiedMessageKeysRef.current;
    for (const [entryKey, at] of seen.entries()) {
      if (!Number.isFinite(at) || now - at > CHAT_MESSAGE_ALERT_DEDUPE_MS) {
        seen.delete(entryKey);
      }
    }
    const lastAt = seen.get(key);
    if (Number.isFinite(lastAt) && now - lastAt < CHAT_MESSAGE_ALERT_DEDUPE_MS) {
      return false;
    }
    seen.set(key, now);
    if (seen.size > 1600) {
      const recentEntries = Array.from(seen.entries()).slice(-800);
      notifiedMessageKeysRef.current = new Map(recentEntries);
    }
    return true;
  };

  const getMessageListItemSignature = (message) => [
    String(message?.id || ""),
    String(message?.senderId || ""),
    String(message?.receiverId || ""),
    String(message?.text || ""),
    String(message?.audioUrl || ""),
    String(message?.mediaUrl || ""),
    String(message?.mediaType || ""),
    String(message?.fileName || ""),
    String(message?.createdAt || ""),
    message?.mine ? "1" : "0",
    message?.read ? "1" : "0",
    message?.seen ? "1" : "0",
    String(message?.status || ""),
    String(message?.deliveryStatus || ""),
    String(message?.replyTo?.id || message?.replyTo?.messageId || message?.replyTo || "")
  ].join("|");

  const areMessageListsEquivalent = (left, right) => {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (getMessageListItemSignature(left[i]) !== getMessageListItemSignature(right[i])) {
        return false;
      }
    }
    return true;
  };

  const getContactSignature = (contact) => [
    String(contact?.id || ""),
    String(contact?.name || ""),
    String(contact?.username || ""),
    String(contact?.email || ""),
    String(contact?.avatar || ""),
    String(contact?.profilePic || ""),
    String(contact?.lastMessage || ""),
    String(contact?.lastActiveAt || ""),
    Object.prototype.hasOwnProperty.call(contact || {}, "online") ? (contact?.online ? "1" : "0") : ""
  ].join("|");

  const areContactListsEquivalent = (left, right) => {
    if (left === right) return true;
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (getContactSignature(left[i]) !== getContactSignature(right[i])) {
        return false;
      }
    }
    return true;
  };

  const scrollThreadToBottom = (behavior = "auto") => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    shouldStickToBottomRef.current = true;
    showScrollDownRef.current = false;
    setShowScrollDown(false);
  };

  const refreshThreadScrollState = () => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 100;
    shouldStickToBottomRef.current = nearBottom;
    const nextShow = distanceFromBottom > 160;
    if (showScrollDownRef.current !== nextShow) {
      showScrollDownRef.current = nextShow;
      setShowScrollDown(nextShow);
    }
  };

  const getVisibleThreadMessageIds = () => {
    const threadEl = threadRef.current;
    if (!threadEl) return new Set();
    const threadRect = threadEl.getBoundingClientRect();
    const visible = new Set();
    const nodes = threadEl.querySelectorAll("[data-chat-msg-id]");
    nodes.forEach((node) => {
      const idText = String(node.getAttribute("data-chat-msg-id") || "").trim();
      if (!idText) return;
      const rect = node.getBoundingClientRect();
      const intersects =
        rect.bottom > threadRect.top + 24 &&
        rect.top < threadRect.bottom - 24;
      if (intersects) visible.add(idText);
    });
    return visible;
  };

  const isPrivateIpHost = (host) => {
    const value = String(host || "").trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
    const parts = value.split(".").map((n) => Number(n));
    if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  };

  const isLocalRuntime = () => {
    if (typeof window === "undefined") return false;
    const host = String(window.location.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || isPrivateIpHost(host);
  };

  const isLocalAbsoluteHost = (host) => {
    const value = String(host || "").toLowerCase();
    return value === "localhost" || value === "127.0.0.1" || isPrivateIpHost(value);
  };

  const normalizeBaseCandidate = (rawValue) => {
    const value = String(rawValue || "").trim().replace(/\/+$/, "");
    if (!value || value === "/") return "";
    if (value.startsWith("/")) return value;
    if (!/^https?:\/\//i.test(value)) return "";
    if (isLocalRuntime()) {
      try {
        const host = new URL(value).hostname.toLowerCase();
        if (!isLocalAbsoluteHost(host)) {
          const preferred = String(getApiBaseUrl() || "").trim();
          if (preferred && /^https?:\/\//i.test(preferred)) {
            try {
              const preferredHost = new URL(preferred).hostname.toLowerCase();
              if (preferredHost && preferredHost === host) {
                return value;
              }
            } catch {
              // ignore preferred host parsing failures
            }
          }
          return "";
        }
      } catch {
        return "";
      }
    }
    return value;
  };

  const resolveAbsoluteChatBase = () => {
    const candidates = [
      import.meta.env.VITE_DEV_PROXY_TARGET,
      import.meta.env.VITE_API_BASE_URL,
      import.meta.env.VITE_API_URL,
      safeGetItem("socialsea_auth_base_url"),
      safeGetItem("socialsea_otp_base_url"),
      api.defaults.baseURL,
      getApiBaseUrl(),
      chatServerBaseRef.current
    ]
      .map(normalizeBaseCandidate)
      .filter(Boolean);
    return candidates.find((value) => /^https?:\/\//i.test(value)) || "";
  };

  const looksLikeHtmlPayload = (value) =>
    typeof value === "string" &&
    (/^\s*<!doctype html/i.test(value) || /<html[\s>]/i.test(value));

  const isRetryableChatRouteStatus = (statusCode) => {
    const status = Number(statusCode || 0);
    return status === 404 || status === 405 || status === 0 || (status >= 500 && status <= 599) || !status;
  };

  const persistChatServerBase = (rawBase) => {
    const normalized = normalizeBaseCandidate(rawBase);
    if (!normalized || normalized === chatServerBaseRef.current) return;
    chatServerBaseRef.current = normalized;
    try {
      sessionStorage.setItem(CHAT_SERVER_BASE_KEY, normalized);
    } catch {
      // ignore storage failures
    }
    safeSetItem(CHAT_SERVER_BASE_KEY, normalized);
  };

  const buildChatBaseCandidates = () => {
    const isLocalDev =
      typeof window !== "undefined" &&
      ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
    const storedAuthBase = safeGetItem("socialsea_auth_base_url");
    const storedOtpBase = safeGetItem("socialsea_otp_base_url");
    const absoluteBase = resolveAbsoluteChatBase();
    const relativeBase = normalizeBaseCandidate(getApiBaseUrl()) || "/api";
    return [
      chatServerBaseRef.current,
      absoluteBase,
      relativeBase,
      storedAuthBase,
      storedOtpBase,
      api.defaults.baseURL,
      getApiBaseUrl(),
      import.meta.env.VITE_API_BASE_URL,
      import.meta.env.VITE_API_URL,
      ...(isLocalDev ? [] : []),
    ]
      .map(normalizeBaseCandidate)
      .filter((value, index, arr) => value && arr.indexOf(value) === index);
  };

  const toArrayPayload = (payload, depth = 0) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object" || depth > 4) return [];
    const keys = ["content", "items", "users", "conversations", "messages", "results", "data", "result", "payload"];
    for (const key of keys) {
      const value = payload?.[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === "object") {
        const nested = toArrayPayload(value, depth + 1);
        if (nested.length > 0) return nested;
      }
    }
    const values = Object.values(payload);
    for (const value of values) {
      if (Array.isArray(value)) return value;
    }
    for (const value of values) {
      if (value && typeof value === "object") {
        const nested = toArrayPayload(value, depth + 1);
        if (nested.length > 0) return nested;
      }
    }
    const objectValues = values.filter((value) => value && typeof value === "object" && !Array.isArray(value));
    if (objectValues.length > 0) return objectValues;
    return [];
  };

  const requestChatArray = async ({ endpoints, params = {}, mapList = null, timeoutMs = 9000, maxAttempts = Infinity }) => {
    const endpointList = Array.isArray(endpoints) ? endpoints : [endpoints];
    const baseCandidates = buildChatBaseCandidates();
    let firstSuccess = null;
    let lastError = null;
    let authError = null;
    let attempts = 0;

    outer: for (const baseURL of baseCandidates) {
      for (const url of endpointList) {
        if (attempts >= maxAttempts) break outer;
        attempts += 1;
        try {
          const res = await api.request({
            method: "GET",
            url,
            params,
            baseURL,
            timeout: timeoutMs,
            suppressAuthRedirect: true,
          });
          if (looksLikeHtmlPayload(res?.data)) {
            const htmlErr = new Error("Received HTML instead of API JSON");
            htmlErr.response = { status: 404, data: res?.data };
            throw htmlErr;
          }

          const raw = toArrayPayload(res?.data);
          const mapped = typeof mapList === "function" ? mapList(raw) : raw;
          const list = Array.isArray(mapped) ? mapped : [];
          const payload = { list, baseURL, url };
          if (!firstSuccess) firstSuccess = payload;
          if (list.length > 0) {
            persistChatServerBase(baseURL);
            return payload;
          }
        } catch (err) {
          lastError = err;
          const status = Number(err?.response?.status || 0);
          if (status === 401 || status === 403) {
            if (!authError) authError = err;
            continue;
          }
          if (!isRetryableChatRouteStatus(status)) {
            throw err;
          }
        }
      }
    }

    if (firstSuccess) {
      persistChatServerBase(firstSuccess.baseURL);
      return firstSuccess;
    }
    if (authError) throw authError;
    throw lastError || new Error("Failed to load chat data");
  };

  const requestChatMutation = async ({ method = "POST", endpoints, data, params, headers }) => {
    const endpointList = Array.isArray(endpoints) ? endpoints : [endpoints];
    const baseCandidates = buildChatBaseCandidates();
    let lastError = null;
    let authError = null;

    for (const baseURL of baseCandidates) {
      for (const url of endpointList) {
        try {
          const res = await api.request({
            method,
            url,
            data,
            params,
            headers,
            baseURL,
            timeout: 10000,
            suppressAuthRedirect: true,
          });
          if (looksLikeHtmlPayload(res?.data)) {
            const htmlErr = new Error("Received HTML instead of API JSON");
            htmlErr.response = { status: 404, data: res?.data };
            throw htmlErr;
          }
          persistChatServerBase(baseURL);
          return res;
        } catch (err) {
          lastError = err;
          const status = Number(err?.response?.status || 0);
          if (status === 401 || status === 403) {
            if (!authError) authError = err;
            continue;
          }
          if (!isRetryableChatRouteStatus(status)) {
            throw err;
          }
        }
      }
    }

    if (authError) throw authError;
    throw lastError || new Error("Chat request failed");
  };

  const requestChatObject = async ({ endpoints, params = {} }) => {
    const endpointList = Array.isArray(endpoints) ? endpoints : [endpoints];
    const baseCandidates = buildChatBaseCandidates();
    let lastError = null;
    let authError = null;

    for (const baseURL of baseCandidates) {
      for (const url of endpointList) {
        try {
          const res = await api.request({
            method: "GET",
            url,
            params,
            baseURL,
            timeout: 9000,
            suppressAuthRedirect: true,
          });
          if (looksLikeHtmlPayload(res?.data)) {
            const htmlErr = new Error("Received HTML instead of API JSON");
            htmlErr.response = { status: 404, data: res?.data };
            throw htmlErr;
          }
          const body = res?.data;
          let objectLike = null;
          if (body && typeof body === "object") {
            if (Array.isArray(body)) {
              objectLike = body.find((item) => item && typeof item === "object") || null;
            } else if (body.user && typeof body.user === "object") {
              objectLike = body.user;
            } else if (body.profile && typeof body.profile === "object") {
              objectLike = body.profile;
            } else if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
              objectLike = body.data.user || body.data.profile || body.data;
            } else {
              objectLike = body;
            }
          }
          if (objectLike && typeof objectLike === "object") {
            persistChatServerBase(baseURL);
            return { data: objectLike, baseURL, url };
          }
        } catch (err) {
          lastError = err;
          const status = Number(err?.response?.status || 0);
          if (status === 401 || status === 403) {
            if (!authError) authError = err;
            continue;
          }
          if (!isRetryableChatRouteStatus(status)) {
            throw err;
          }
        }
      }
    }

    if (authError) throw authError;
    throw lastError || new Error("Chat object request failed");
  };

  const mapUserToContact = (u) => {
    const userLike =
      u?.user ||
      u?.contact ||
      u?.peer ||
      u?.otherUser ||
      u?.participant ||
      u?.follower ||
      u?.following ||
      u?.fromUser ||
      u?.toUser ||
      u?.actor ||
      u?.target ||
      u?.receiver ||
      u?.sender ||
      u;
    const toBool = (value) => {
      if (typeof value === "boolean") return value;
      const raw = String(value || "").trim().toLowerCase();
      return raw === "true" || raw === "1" || raw === "online" || raw === "active" || raw === "yes";
    };
    const me = String(myUserId || "").trim();
    const senderId = String(u?.senderId || userLike?.senderId || "").trim();
    const receiverId = String(u?.receiverId || userLike?.receiverId || "").trim();
    const meSafe = me || "0";
    const userOneId = String(u?.userOneId || userLike?.userOneId || "").trim();
    const userTwoId = String(u?.userTwoId || userLike?.userTwoId || "").trim();
    const participantIds = Array.isArray(u?.participantIds)
      ? u.participantIds
      : Array.isArray(userLike?.participantIds)
        ? userLike.participantIds
        : [];
    const otherParticipantId = participantIds
      .map((value) => String(value || "").trim())
      .find((value) => value && value !== meSafe);
    let pairOtherId = "";
    if (userOneId || userTwoId) {
      if (meSafe && userOneId === meSafe && userTwoId) pairOtherId = userTwoId;
      else if (meSafe && userTwoId === meSafe && userOneId) pairOtherId = userOneId;
      else pairOtherId = userTwoId || userOneId;
    }
    let id = String(
      u?.otherUserId ||
      userLike?.otherUserId ||
      u?.peerId ||
      userLike?.peerId ||
      u?.contactId ||
      userLike?.contactId ||
      u?.participantId ||
      userLike?.participantId ||
      u?.followerId ||
      userLike?.followerId ||
      u?.followingId ||
      userLike?.followingId ||
      u?.sourceUserId ||
      userLike?.sourceUserId ||
      u?.targetUserId ||
      userLike?.targetUserId ||
      u?.fromUserId ||
      userLike?.fromUserId ||
      u?.toUserId ||
      userLike?.toUserId ||
      u?.memberId ||
      userLike?.memberId ||
      pairOtherId ||
      otherParticipantId ||
      userLike?.userId ||
      u?.userId ||
      ""
    ).trim();
    if (!id) {
      id = String(userLike?.id || u?.id || "").trim();
    }
    if ((meSafe && id === meSafe) && pairOtherId) id = pairOtherId;
    if ((meSafe && id === meSafe) && otherParticipantId) id = otherParticipantId;
    if (!id && (userOneId || userTwoId)) {
      if (userOneId && userOneId !== meSafe) id = userOneId;
      else if (userTwoId && userTwoId !== meSafe) id = userTwoId;
    }
    if (!id) {
      if (senderId && senderId !== meSafe) id = senderId;
      else if (receiverId && receiverId !== meSafe) id = receiverId;
    }
    const selectedPair =
      id && userOneId && id === userOneId
        ? "one"
        : id && userTwoId && id === userTwoId
          ? "two"
          : "";
    const pairName =
      selectedPair === "one"
        ? (u?.userOneName || userLike?.userOneName || "")
        : selectedPair === "two"
          ? (u?.userTwoName || userLike?.userTwoName || "")
          : "";
    const pairUsername =
      selectedPair === "one"
        ? (u?.userOneUsername || userLike?.userOneUsername || "")
        : selectedPair === "two"
          ? (u?.userTwoUsername || userLike?.userTwoUsername || "")
          : "";
    const pairEmail =
      selectedPair === "one"
        ? (u?.userOneEmail || userLike?.userOneEmail || "")
        : selectedPair === "two"
          ? (u?.userTwoEmail || userLike?.userTwoEmail || "")
          : "";
    const pairProfilePic =
      selectedPair === "one"
        ? (u?.userOneProfilePic || userLike?.userOneProfilePic || u?.userOneAvatar || userLike?.userOneAvatar || "")
        : selectedPair === "two"
          ? (u?.userTwoProfilePic || userLike?.userTwoProfilePic || u?.userTwoAvatar || userLike?.userTwoAvatar || "")
          : "";
    const usernameRaw = String(
      pairUsername ||
      userLike?.username ||
      userLike?.handle ||
      u?.username ||
      u?.handle ||
      ""
    ).trim();
    const rawName = String(
      pairName ||
      userLike?.name ||
      userLike?.displayName ||
      u?.name ||
      u?.displayName ||
      userLike?.email ||
      u?.email ||
      `User ${id}`
    ).trim();
    const emailRaw = String(pairEmail || userLike?.email || u?.email || "").trim();
    const name = getContactDisplayName({
      id,
      name: rawName,
      username: usernameRaw,
      email: emailRaw
    });
    const profilePicRaw =
      pairProfilePic ||
      userLike?.profilePicUrl ||
      userLike?.profilePic ||
      userLike?.avatarUrl ||
      userLike?.avatar ||
      u?.profilePicUrl ||
      u?.profilePic ||
      u?.avatarUrl ||
      u?.avatar ||
      "";
    const lastActiveAt =
      userLike?.lastActiveAt ||
      userLike?.lastSeenAt ||
      userLike?.lastSeen ||
      userLike?.locationUpdatedAt ||
      userLike?.presenceUpdatedAt ||
      userLike?.lastLoginAt ||
      userLike?.lastOnlineAt ||
      userLike?.lastAt ||
      userLike?.updatedAt ||
      userLike?.timestamp ||
      u?.lastActiveAt ||
      u?.lastSeenAt ||
      u?.lastSeen ||
      u?.locationUpdatedAt ||
      u?.presenceUpdatedAt ||
      u?.lastLoginAt ||
      u?.lastOnlineAt ||
      u?.lastAt ||
      u?.updatedAt ||
      u?.timestamp ||
      "";
    const presenceValues = [
      userLike?.online,
      userLike?.isOnline,
      userLike?.active,
      userLike?.presence,
      userLike?.status,
      u?.online,
      u?.isOnline,
      u?.active,
      u?.presence,
      u?.status
    ];
    const hasPresenceSignal = presenceValues.some((value) => {
      if (typeof value === "boolean") return true;
      if (value == null) return false;
      return String(value).trim() !== "";
    });
    const online = hasPresenceSignal ? presenceValues.some((value) => toBool(value)) : undefined;
    const lastMessage =
      userLike?.lastMessage ||
      userLike?.lastMessageText ||
      userLike?.latestMessage?.text ||
      userLike?.message ||
      u?.lastMessage ||
      u?.lastMessageText ||
      u?.latestMessage?.text ||
      u?.message ||
      "";
    const normalizedLastActiveAt = String(lastActiveAt || "").trim();
    const contact = {
      id,
      name,
      username: usernameRaw,
      email: emailRaw,
      avatar: (name[0] || "U").toUpperCase(),
      profilePic: profilePicRaw ? toApiUrl(profilePicRaw) : "",
      lastMessage,
      ...(normalizedLastActiveAt ? { lastActiveAt: normalizedLastActiveAt } : {}),
      ...(hasPresenceSignal ? { online: Boolean(online) } : {})
    };
    return contact;
  };

  const mergeContacts = (base, extra) => {
    const byId = new Map();
    [...base, ...extra].forEach((c) => {
      const id = String(c?.id || "").trim();
      if (!id) return;
      if (!byId.has(id)) {
        byId.set(id, { ...c, id });
        return;
      }
      const prev = byId.get(id) || {};
      const prevName = getContactDisplayName(prev);
      const nextName = getContactDisplayName(c);
      const prevTs = toEpochMs(prev?.lastActiveAt);
      const nextTs = toEpochMs(c?.lastActiveAt);
      const mergedName = !isGenericUserLabel(nextName, id) ? nextName : prevName;
      const merged = {
        ...prev,
        ...c,
        id,
        name: mergedName || prevName || nextName || normalizeDisplayName(`User ${id}`),
        avatar: ((mergedName || prevName || nextName || "U")[0] || "U").toUpperCase(),
        username: String(c?.username || "").trim() || String(prev?.username || "").trim(),
        email: String(c?.email || "").trim() || String(prev?.email || "").trim(),
        profilePic: String(c?.profilePic || "").trim() || String(prev?.profilePic || "").trim(),
        lastMessage: String(c?.lastMessage || "").trim() || String(prev?.lastMessage || "").trim(),
      };
      if (prevTs || nextTs) {
        merged.lastActiveAt = nextTs >= prevTs ? (c?.lastActiveAt || prev?.lastActiveAt || "") : (prev?.lastActiveAt || c?.lastActiveAt || "");
      } else {
        const fallbackLast = String(c?.lastActiveAt || "").trim() || String(prev?.lastActiveAt || "").trim();
        if (fallbackLast) merged.lastActiveAt = fallbackLast;
      }
      if (Object.prototype.hasOwnProperty.call(c || {}, "online")) {
        merged.online = Boolean(c?.online);
      } else if (Object.prototype.hasOwnProperty.call(prev || {}, "online")) {
        merged.online = Boolean(prev?.online);
      } else {
        delete merged.online;
      }
      byId.set(id, merged);
    });
    const mergedList = Array.from(byId.values());
    return areContactListsEquivalent(base, mergedList) ? base : mergedList;
  };

  const extractContactsFromLocalHistory = () => {
    const all = readLocalChat();
    const meId = String(myUserId || safeGetItem("userId") || "").trim();
    const meEmail = String(myEmail || safeGetItem("email") || "").trim().toLowerCase();
    const contactsFromLocal = [];

    Object.entries(all || {}).forEach(([threadKey, rawItems]) => {
      const threadItems = Array.isArray(rawItems) ? rawItems : [];
      if (!threadItems.length) return;

      const normalized = threadItems
        .map((item) => normalizeMessage(item))
        .sort((a, b) => new Date(normalizeTimestamp(a?.createdAt || 0)).getTime() - new Date(normalizeTimestamp(b?.createdAt || 0)).getTime());

      const last = normalized[normalized.length - 1];
      const keyIds = String(threadKey || "")
        .split(":")
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      const threadIds = normalized
        .flatMap((item) => [String(item?.senderId || "").trim(), String(item?.receiverId || "").trim()])
        .filter(Boolean);

      let otherId = "";
      if (meId) {
        otherId =
          keyIds.find((value) => value && value !== meId) ||
          threadIds.find((value) => value && value !== meId) ||
          "";
      }
      if (!otherId) {
        const lastDirectional = [...normalized]
          .reverse()
          .find((item) => String(item?.senderId || "").trim() || String(item?.receiverId || "").trim());
        const lastSenderId = String(lastDirectional?.senderId || "").trim();
        const lastReceiverId = String(lastDirectional?.receiverId || "").trim();
        if (meId) {
          if (lastSenderId === meId && lastReceiverId) otherId = lastReceiverId;
          else if (lastReceiverId === meId && lastSenderId) otherId = lastSenderId;
        } else if (typeof lastDirectional?.mine === "boolean") {
          if (lastDirectional.mine && lastReceiverId) otherId = lastReceiverId;
          else if (!lastDirectional.mine && lastSenderId) otherId = lastSenderId;
        }
        if (!otherId && lastSenderId && lastReceiverId && lastSenderId !== lastReceiverId) {
          otherId = lastSenderId;
        }
      }
      if (!otherId) {
        otherId =
          threadIds.find((value) => value && value !== "0") ||
          keyIds.find((value) => value && value !== "0") ||
          "";
      }
      if (meId && otherId === meId) {
        otherId =
          keyIds.find((value) => value && value !== meId) ||
          threadIds.find((value) => value && value !== meId) ||
          "";
      }
      if (!otherId) return;

      const senderEmail = String(last?.senderEmail || last?.fromEmail || "").trim().toLowerCase();
      const receiverEmail = String(last?.receiverEmail || last?.toEmail || "").trim().toLowerCase();
      const candidateEmail =
        senderEmail && senderEmail !== meEmail
          ? senderEmail
          : receiverEmail && receiverEmail !== meEmail
            ? receiverEmail
            : "";
      const usernameRaw = String(
        last?.senderUsername ||
        last?.fromUsername ||
        last?.username ||
        ""
      ).trim();
      const rawName = String(
        last?.senderName ||
        last?.fromName ||
        last?.displayName ||
        candidateEmail ||
        `User ${otherId}`
      ).trim();
      const name = getContactDisplayName({
        id: otherId,
        name: rawName,
        username: usernameRaw,
        email: candidateEmail
      });

      contactsFromLocal.push({
        id: String(otherId),
        name,
        username: usernameRaw,
        email: candidateEmail,
        avatar: (name[0] || "U").toUpperCase(),
        profilePic: "",
        lastMessage: String(last?.text || last?.message || ""),
        lastActiveAt: String(last?.createdAt || "")
      });
    });

    return mergeContacts([], contactsFromLocal);
  };

  const buildGroupRoomId = () => `grp_${Date.now()}_${myUserId || "guest"}`;

  const resolveContactName = (id) => {
    const match = contacts.find((c) => String(c?.id || "") === String(id));
    if (match) return getContactDisplayName(match);
    return normalizeDisplayName(`User ${id}`);
  };

  const serializeGroupMembers = (members) =>
    members
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

  const syncGroupRemoteTiles = () => {
    const next = Array.from(groupStreamsRef.current.entries()).map(([peerId, stream]) => ({
      peerId,
      name: resolveContactName(peerId),
      stream
    }));
    setGroupRemoteTiles(next);
  };

  const sendSignal = async (targetUserId, payload) => {
    const client = stompRef.current;
    if (!targetUserId) return;
    let sentViaWs = false;
    let sentViaRest = false;
    try {
      if (client?.connected) {
        client.publish({
          destination: `/app/call.signal/${targetUserId}`,
          body: JSON.stringify(payload || {})
        });
        sentViaWs = true;
      }
    } catch {
      // ignore transient signaling failures
    }
    if (!sentViaWs) {
      try {
        await api.post(`/api/calls/signal/${targetUserId}`, payload || {});
        sentViaRest = true;
      } catch {
        sentViaRest = false;
      }
    }
    try {
      const target = contacts.find((c) => String(c?.id || "") === String(targetUserId));
      const targetEmail = String(target?.email || "");
      const signalPacket = {
        ...(payload || {}),
        fromUserId: Number(myUserId) || null,
        fromEmail: myEmail || "",
        toUserId: Number(targetUserId) || null,
        toEmail: targetEmail,
        timestamp: Date.now()
      };
      if (callChannelRef.current) {
        callChannelRef.current.postMessage({
          kind: "call-signal",
          fromTab: tabIdRef.current,
          toUserId: String(targetUserId),
          signal: signalPacket
        });
      }
      try {
        localStorage.setItem(CALL_SIGNAL_LOCAL_KEY, JSON.stringify({
          fromTab: tabIdRef.current,
          signal: signalPacket
        }));
      } catch {
        // ignore storage fallback failure
      }
    } catch {
      // ignore broadcast fallback issues
    }

    if (!sentViaWs && !sentViaRest) {
      setCallError("Call signaling failed. Please login again and retry.");
    }
  };

  const clearCallTimer = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  };

  const armOutgoingCallTimeout = () => {
    clearCallTimer();
    callTimeoutRef.current = setTimeout(() => {
      const phase = callStateRef.current.phase;
      if (phase === "dialing" || phase === "connecting") {
        finishCall(true, "No answer");
      }
    }, CALL_RING_MS);
  };

  const armIncomingCallTimeout = () => {
    clearCallTimer();
    callTimeoutRef.current = setTimeout(() => {
      const incoming = incomingCallRef.current;
      if (!incoming?.fromUserId) return;
      if (callStateRef.current.phase !== "idle") return;
      stopRingtone();
      setIncomingCall(null);
      setRingtoneMuted(false);
      pushCallHistory(incoming.fromUserId, {
        direction: "incoming",
        mode: incoming.mode || "audio",
        status: "missed",
        peerName: incoming.fromName
      });
      setCallError("Missed call");
      window.setTimeout(() => setCallError(""), 2500);
    }, CALL_RING_MS);
  };

  const clearDisconnectGuardTimer = () => {
    if (disconnectGuardTimerRef.current) {
      clearTimeout(disconnectGuardTimerRef.current);
      disconnectGuardTimerRef.current = null;
    }
  };

  const clearRejoinRetryTimer = () => {
    if (rejoinRetryTimerRef.current) {
      clearTimeout(rejoinRetryTimerRef.current);
      rejoinRetryTimerRef.current = null;
    }
  };

  const setupRemoteAudioPipeline = useCallback(
    (stream) => {
      if (!stream?.getAudioTracks?.().length) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!remoteAudioCtxRef.current) {
          remoteAudioCtxRef.current = new AudioCtx();
        }
        const ctx = remoteAudioCtxRef.current;
        remoteAudioSourceRef.current?.disconnect?.();
        remoteAudioGainRef.current?.disconnect?.();
        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = isSpeakerOn ? 1 : 0;
        source.connect(gain).connect(ctx.destination);
        remoteAudioSourceRef.current = source;
        remoteAudioGainRef.current = gain;
        if (ctx.state === "suspended") {
          ctx.resume?.().catch(() => {});
        }
      } catch {
        // ignore audio pipeline failures
      }
    },
    [isSpeakerOn]
  );

  const updateRemoteMediaFlags = useCallback((stream) => {
    const s = stream || remoteStreamRef.current;
    if (!s) {
      setHasRemoteVideo(false);
      setHasRemoteAudio(false);
      setRemoteIsScreenShare(false);
      return;
    }
    const hasVideo = s.getVideoTracks().some((t) => t.readyState !== "ended");
    const hasAudio = s.getAudioTracks().some((t) => t.readyState !== "ended");
    const videoEl = remoteVideoRef.current;
    const elHasVideo = Boolean(videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0);
    setHasRemoteVideo(hasVideo || elHasVideo);
    setHasRemoteAudio(hasAudio);
    setRemoteIsScreenShare(isScreenShareStream(s));
  }, [isScreenShareStream]);

  useEffect(() => {
    if (callState.phase === "idle" || callState.mode !== "video") {
      setRemoteIsScreenShare(false);
    }
  }, [callState.phase, callState.mode]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return undefined;
    const markVideoActive = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        setHasRemoteVideo(true);
      }
    };
    const markVideoInactive = () => {
      setHasRemoteVideo(false);
    };
    el.addEventListener("loadeddata", markVideoActive);
    el.addEventListener("playing", markVideoActive);
    el.addEventListener("resize", markVideoActive);
    el.addEventListener("emptied", markVideoInactive);
    return () => {
      el.removeEventListener("loadeddata", markVideoActive);
      el.removeEventListener("playing", markVideoActive);
      el.removeEventListener("resize", markVideoActive);
      el.removeEventListener("emptied", markVideoInactive);
    };
  }, []);

  const livekitEnabled = Boolean(LIVEKIT_URL);

  const buildLivekitRoomId = useCallback(
    (peerId) => {
      const left = String(myUserId || "");
      const right = String(peerId || "");
      const pair = [left, right].filter(Boolean).sort().join("_");
      return pair ? `call_${pair}` : `call_${Date.now()}`;
    },
    [myUserId]
  );

  const disconnectLivekit = useCallback(() => {
    try {
      livekitRoomRef.current?.disconnect();
    } catch {
      // ignore disconnect issues
    }
    livekitRoomRef.current = null;
    livekitRoomIdRef.current = "";
    livekitConnectingRef.current = false;
  }, []);

  const connectLivekit = useCallback(
    async (roomId, mode) => {
      if (!livekitEnabled || !LIVEKIT_URL || !roomId) return false;
      if (livekitConnectingRef.current) return true;
      livekitConnectingRef.current = true;
      livekitRoomIdRef.current = roomId;

      try {
        const tokenRes = await api.post("/api/livekit/token", { room: roomId, mode });
        const token = tokenRes?.data?.token;
        if (!token) throw new Error("missing-token");

        const room = new Room({
          adaptiveStream: true,
          dynacast: true
        });

        const syncLivekitInCall = () => {
          clearCallTimer();
          clearDisconnectGuardTimer();
          stopOutgoingRing();
          setCallState((prev) =>
            prev.phase === "idle" ? prev : { ...prev, phase: "in-call", provider: "livekit" }
          );
          setCallPhaseNote("Connected");
        };

        const markLivekitConnected = () => {
          const current = callStateRef.current;
          if (current.peerId && !callConnectedLoggedRef.current) {
            callConnectedLoggedRef.current = true;
            pushCallHistory(current.peerId, {
              direction: current.initiatedByMe ? "outgoing" : "incoming",
              mode: current.mode || mode,
              status: "connected",
              peerName: current.peerName
            });
            if (current.peerId !== "group") {
              sendSignal(current.peerId, {
                type: "connected",
                mode: current.mode || mode,
                provider: "livekit"
              });
            }
          }
          if (current.peerId && current.peerId !== "group") {
            persistCallRejoin({
              peerId: String(current.peerId),
              peerName: current.peerName || "User",
              mode: current.mode || mode,
              provider: "livekit",
              roomId
            });
          }
          syncLivekitInCall();
        };

        room.on(RoomEvent.Disconnected, () => {
          const phase = callStateRef.current.phase;
          if (phase === "idle" || phase === "dialing") return;
          setCallPhaseNote("Reconnecting...");
          setCallState((prev) => (prev.phase === "idle" ? prev : { ...prev, phase: "connecting" }));
          clearDisconnectGuardTimer();
          disconnectGuardTimerRef.current = setTimeout(() => {
            const currentPhase = callStateRef.current.phase;
            if (currentPhase !== "in-call") {
              finishCall(false, "Call ended");
            }
          }, 30000);
        });

        room.on(RoomEvent.ParticipantConnected, () => {
          markLivekitConnected();
        });

        room.on(RoomEvent.Reconnected, () => {
          if (room.remoteParticipants.size > 0) {
            markLivekitConnected();
            return;
          }
          setCallPhaseNote("Connecting media...");
        });

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (!track) return;
          let stream = remoteStreamRef.current;
          if (!stream) {
            stream = new MediaStream();
            remoteStreamRef.current = stream;
          }
          try {
            stream.addTrack(track.mediaStreamTrack);
          } catch {
            // ignore duplicate tracks
          }
          if (track.kind === "video" && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play?.().catch(() => {});
          }
          if (track.kind === "audio" && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.play?.().catch(() => {});
          }
          updateRemoteMediaFlags(stream);
          setupRemoteAudioPipeline(stream);
          kickstartRemotePlayback();
          markLivekitConnected();
        });

        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (!track || !remoteStreamRef.current) return;
          try {
            remoteStreamRef.current.removeTrack(track.mediaStreamTrack);
          } catch {
            // ignore remove failures
          }
          updateRemoteMediaFlags(remoteStreamRef.current);
        });

        await room.connect(LIVEKIT_URL, token);
        livekitRoomRef.current = room;

        const localTracks = await createLocalTracks({
          audio: true,
          video: mode === "video"
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: 30 }
            : false
        });

        const localStream = new MediaStream();
        localTracks.forEach((track) => {
          localStream.addTrack(track.mediaStreamTrack);
          room.localParticipant.publishTrack(track).catch(() => {});
        });
        localStreamRef.current = localStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
          localVideoRef.current.play?.().catch(() => {});
        }
        updateRemoteMediaFlags(remoteStreamRef.current);
        if (room.remoteParticipants.size > 0) {
          markLivekitConnected();
        } else if (callStateRef.current.phase === "connecting") {
          setCallPhaseNote("Connecting media...");
        }
        livekitConnectingRef.current = false;
        return true;
      } catch {
        livekitConnectingRef.current = false;
        disconnectLivekit();
        return false;
      }
    },
    [LIVEKIT_URL, livekitEnabled, updateRemoteMediaFlags, setupRemoteAudioPipeline, kickstartRemotePlayback, disconnectLivekit]
  );

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

  const resetMedia = () => {
    clearDisconnectGuardTimer();
    disconnectLivekit();
    stopStream(localStreamRef.current);
    stopStream(remoteStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    try {
      remoteAudioSourceRef.current?.disconnect?.();
      remoteAudioGainRef.current?.disconnect?.();
      remoteAudioCtxRef.current?.close?.();
    } catch {
      // ignore audio context cleanup errors
    }
    remoteAudioSourceRef.current = null;
    remoteAudioGainRef.current = null;
    remoteAudioCtxRef.current = null;
    setHasRemoteVideo(false);
    setHasRemoteAudio(false);
    setCallPhaseNote("");
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSpeakerOn(true);
  };

  const closePeer = () => {
    try {
      peerRef.current?.close();
    } catch {
      // ignore close errors
    }
    peerRef.current = null;
  };

  const closeSinglePeerOnly = () => {
    closePeer();
  };

  const resetGroupCall = () => {
    closeGroupPeers();
    setGroupCallActive(false);
    setGroupRoomId("");
    setGroupMembers([]);
    setGroupInviteIds([]);
    setGroupInviteOpen(false);
  };

  const finishCall = (notifyPeer = false, reason = "") => {
    const current = callStateRef.current;
    clearRejoinRetryTimer();
    rejoinRetryCountRef.current = 0;
    rejoinPayloadRef.current = null;
    if (groupActiveRef.current) {
      const members = Array.isArray(groupMembers) ? groupMembers : [];
      if (notifyPeer) {
        members
          .filter((id) => String(id) && String(id) !== String(myUserId))
          .forEach((peerId) => {
            sendSignal(peerId, {
              type: "hangup",
              mode: "video",
              roomId: groupRoomId,
              group: true,
              groupMembers: serializeGroupMembers(members)
            });
          });
      }
      clearCallTimer();
      callTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current.phase === "dialing" || callStateRef.current.phase === "connecting") {
          finishCall(true, "No answer");
        }
      }, CALL_RING_MS);
      stopRingtone();
      stopOutgoingRing();
      closePeer();
      resetMedia();
      resetGroupCall();
      callConnectedLoggedRef.current = false;
      setIncomingCall(null);
      setCallState({ phase: "idle", mode: "audio", peerId: "", peerName: "", initiatedByMe: false, provider: "webrtc" });
      clearCallRejoin();
      if (reason) {
        setCallError(reason);
        window.setTimeout(() => setCallError(""), 2500);
      }
      return;
    }

    if (current.peerId) {
      const normalized = String(reason || "").toLowerCase();
      const status = normalized.includes("no answer")
        ? "missed"
        : normalized.includes("declined")
          ? "declined"
          : normalized.includes("busy")
            ? "busy"
            : "ended";
      pushCallHistory(current.peerId, {
        direction: current.initiatedByMe ? "outgoing" : "incoming",
        mode: current.mode,
        status,
        peerName: current.peerName
      });
    }
    if (notifyPeer && current.peerId) {
      sendSignal(current.peerId, { type: "hangup", mode: current.mode });
    }
    clearCallTimer();
    stopRingtone();
    stopOutgoingRing();
    closePeer();
    resetMedia();
    callConnectedLoggedRef.current = false;
        setIncomingCall(null);
    setCallState({ phase: "idle", mode: "audio", peerId: "", peerName: "", initiatedByMe: false, provider: "webrtc" });
    clearCallRejoin();
    if (reason) {
      setCallError(reason);
      window.setTimeout(() => setCallError(""), 2500);
    }
  };

  const ensureLocalStream = async (mode) => {
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 2,
      sampleRate: 48000,
      sampleSize: 16
    };
    const videoHigh = {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 60, max: 60 }
    };
    const videoMedium = {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 30 }
    };
    const videoLow = {
      width: { ideal: 960, max: 1280 },
      height: { ideal: 540, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    };

    let stream;
    if (mode === "video") {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoHigh });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoMedium });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoLow });
        }
      }
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    }

    if (!stream.getAudioTracks().length) {
      try {
        const fallbackAudio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        fallbackAudio.getAudioTracks().forEach((track) => stream.addTrack(track));
      } catch {
        // ignore fallback failures
      }
    }

    try {
      stream.getVideoTracks().forEach((track) => {
        track.contentHint = "motion";
      });
      stream.getAudioTracks().forEach((track) => {
        try {
          track.contentHint = "speech";
        } catch {
          // ignore unsupported contentHint
        }
        track.enabled = true;
      });
    } catch {
      // ignore unsupported contentHint
    }
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play?.().catch(() => {});
    }
    return stream;
  };


  const createPeerConnection = (targetUserId, mode) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    try {
      pc.setConfiguration({
        ...RTC_CONFIG,
        iceTransportPolicy: RTC_CONFIG?.iceTransportPolicy || "all"
      });
      pc.addEventListener?.("negotiationneeded", () => {
        // keep default behavior
      });
    } catch {
      // ignore configuration errors
    }
    peerRef.current = pc;
    try {
      pc.addTransceiver("audio", { direction: "sendrecv" });
      if (mode === "video") {
        pc.addTransceiver("video", { direction: "sendrecv" });
      }
    } catch {
      // ignore transceiver errors
    }
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play?.().catch(() => {});
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play?.().catch(() => {});
    }
    setupRemoteAudioPipeline(remoteStream);
    applySpeakerState(isSpeakerOn);

    const markConnected = () => {
      clearCallTimer();
      clearDisconnectGuardTimer();
      stopOutgoingRing();
      setCallState((prev) => {
        if (!callConnectedLoggedRef.current && prev.peerId) {
          callConnectedLoggedRef.current = true;
          pushCallHistory(prev.peerId, {
            direction: prev.initiatedByMe ? "outgoing" : "incoming",
            mode: prev.mode,
            status: "connected",
            peerName: prev.peerName
          });
        }
        return { ...prev, phase: "in-call" };
      });
      setCallPhaseNote("Connected");
      if (callStateRef.current.peerId && callStateRef.current.peerId !== "group") {
        sendSignal(callStateRef.current.peerId, {
          type: "connected",
          mode: callStateRef.current.mode || mode,
          provider: callStateRef.current.provider || "webrtc"
        });
      }
      if (callStateRef.current.peerId && callStateRef.current.peerId !== "group") {
        persistCallRejoin({
          peerId: String(callStateRef.current.peerId),
          peerName: callStateRef.current.peerName || "User",
          mode: callStateRef.current.mode || "audio"
        });
      }
    };

    const markReconnecting = () => {
      setCallState((prev) => {
        if (prev.phase === "idle") return prev;
        return { ...prev, phase: "connecting" };
      });
      setCallPhaseNote("Reconnecting...");
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(targetUserId, {
        type: "ice",
        mode,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex
      });
    };

    pc.ontrack = (event) => {
      if (event?.track?.kind === "video") {
        event.track.onmute = () => updateRemoteMediaFlags(remoteStreamRef.current);
        event.track.onunmute = () => updateRemoteMediaFlags(remoteStreamRef.current);
        event.track.onended = () => updateRemoteMediaFlags(remoteStreamRef.current);
      }
      if (event?.track?.kind === "audio") {
        event.track.onunmute = () => {
          updateRemoteMediaFlags(remoteStreamRef.current);
          setupRemoteAudioPipeline(remoteStreamRef.current);
          kickstartRemotePlayback();
        };
        event.track.onmute = () => updateRemoteMediaFlags(remoteStreamRef.current);
        event.track.onended = () => updateRemoteMediaFlags(remoteStreamRef.current);
      }
      if (event.track) {
        remoteStream.addTrack(event.track);
      } else {
        const [stream] = event.streams || [];
        if (stream) {
          stream.getTracks().forEach((t) => remoteStream.addTrack(t));
        }
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play?.().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play?.().catch(() => {});
      }
      updateRemoteMediaFlags(remoteStream);
      setupRemoteAudioPipeline(remoteStream);
      applySpeakerState(isSpeakerOn);
      kickstartRemotePlayback();
      markConnected();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        if (remoteStreamRef.current?.getTracks?.().length) {
          markConnected();
        } else {
          setCallPhaseNote("Connecting media...");
          setCallState((prev) => (prev.phase === "idle" ? prev : { ...prev, phase: "connecting" }));
        }
        return;
      }
      if (state === "disconnected") {
        markReconnecting();
        clearDisconnectGuardTimer();
        disconnectGuardTimerRef.current = setTimeout(() => {
          const currentState = peerRef.current?.connectionState;
          if (currentState === "disconnected") {
            setCallPhaseNote("Reconnecting...");
          }
        }, 300000);
        return;
      }
      if (state === "failed" || state === "closed") {
        setCallPhaseNote("Connection issue");
      }
    };

    pc.oniceconnectionstatechange = () => {
      const ice = pc.iceConnectionState;
      if (ice === "connected" || ice === "completed") {
        markConnected();
        return;
      }
      if (ice === "disconnected") {
        markReconnecting();
      }
      if (ice === "failed") {
        setCallPhaseNote("Connection issue");
      }
    };

    return pc;
  };

  const createGroupPeerConnection = (targetUserId, mode, roomId, members) => {
    if (!targetUserId) return null;
    const existing = groupPeersRef.current.get(String(targetUserId));
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    groupPeersRef.current.set(String(targetUserId), pc);

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal(targetUserId, {
        type: "ice",
        mode,
        roomId,
        group: true,
        groupMembers: serializeGroupMembers(members),
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex
      });
    };

    pc.ontrack = (event) => {
      const key = String(targetUserId);
      let stream = groupStreamsRef.current.get(key);
      if (!stream) {
        stream = new MediaStream();
        groupStreamsRef.current.set(key, stream);
      }
      if (event.track) {
        stream.addTrack(event.track);
      } else {
        const [incoming] = event.streams || [];
        incoming?.getTracks?.().forEach((t) => stream.addTrack(t));
      }
      syncGroupRemoteTiles();
      setHasRemoteVideo(true);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallPhaseNote("Connected");
        setCallState((prev) => (prev.phase === "in-call" ? prev : { ...prev, phase: "in-call" }));
      }
    };

    return pc;
  };

  const removeGroupPeer = (peerId) => {
    const key = String(peerId || "");
    const pc = groupPeersRef.current.get(key);
    if (pc) {
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    groupPeersRef.current.delete(key);
    groupStreamsRef.current.delete(key);
    syncGroupRemoteTiles();
    if (groupPeersRef.current.size === 0 && groupActiveRef.current) {
      finishCall(false, "Call ended");
    }
  };

  const ensureGroupMesh = async (members, roomId, mode) => {
    if (!roomId || !Array.isArray(members)) return;
    const myIdText = String(myUserId || "");
    if (!myIdText) return;
    const uniqueMembers = Array.from(new Set(members.map((id) => String(id)).filter(Boolean)));
    for (const peerId of uniqueMembers) {
      if (peerId === myIdText) continue;
      if (groupPeersRef.current.has(peerId)) continue;
      const myNum = Number(myIdText);
      const peerNum = Number(peerId);
      const shouldOffer = Number.isFinite(myNum) && Number.isFinite(peerNum)
        ? myNum > peerNum
        : myIdText > peerId;
      if (!shouldOffer) continue;

      const pc = createGroupPeerConnection(peerId, mode, roomId, uniqueMembers);
      if (!pc) continue;
      const stream = localStreamRef.current;
      stream?.getTracks?.().forEach((track) => pc.addTrack(track, stream));
      tuneSendersForQuality(pc, mode);
      try {
        const offer = await pc.createOffer();
        offer.sdp = applySdpQualityHints(offer.sdp, mode);
        await pc.setLocalDescription(offer);
        sendSignal(peerId, {
          type: "offer",
          mode,
          sdp: offer.sdp,
          roomId,
          group: true,
          groupMembers: serializeGroupMembers(uniqueMembers)
        });
      } catch {
        // ignore failed offers
      }
    }
  };

  const closeGroupPeers = () => {
    groupPeersRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // ignore
      }
    });
    groupPeersRef.current.clear();
    groupStreamsRef.current.forEach((stream) => stopStream(stream));
    groupStreamsRef.current.clear();
    setGroupRemoteTiles([]);
  };

  const applySdpQualityHints = (sdp, mode) => {
    let next = String(sdp || "");
    next = next.replace(
      /a=fmtp:111 ([^\r\n]*)/g,
      (all, cfg) => `a=fmtp:111 ${cfg};stereo=1;sprop-stereo=1;maxaveragebitrate=192000;cbr=1;usedtx=0`
    );
    if (mode === "video" && /m=video/.test(next) && !/b=AS:6000/.test(next)) {
      next = next.replace(/m=video[^\r\n]*\r?\n/, (line) => `${line}b=AS:6000\r\n`);
    }
    return next;
  };

  const tuneSendersForQuality = (pc, mode) => {
    try {
      pc.getSenders().forEach((sender) => {
        if (!sender?.track || typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") return;
        const params = sender.getParameters() || {};
        params.encodings = Array.isArray(params.encodings) && params.encodings.length ? params.encodings : [{}];
        const enc = params.encodings[0];
        if (sender.track.kind === "audio") {
          enc.maxBitrate = 192000;
          enc.dtx = false;
        }
        if (mode === "video" && sender.track.kind === "video") {
          enc.maxBitrate = 6000000;
          enc.maxFramerate = 60;
          enc.scaleResolutionDownBy = 1.0;
          enc.priority = "high";
        }
        void sender.setParameters(params).catch(() => {});
      });
    } catch {
      // ignore unsupported sender parameter tuning
    }
  };

  const attemptRejoin = useCallback(async () => {
    const payload = rejoinPayloadRef.current;
    if (!payload) return false;
    const { peerId, mode, provider, roomId } = payload;
    try {
      if (provider === "livekit" && roomId) {
        const joined = await connectLivekit(roomId, mode);
        if (!joined) throw new Error("livekit-rejoin-failed");
        return true;
      }
      const stream = localStreamRef.current || await ensureLocalStream(mode);
      closePeer();
      const pc = createPeerConnection(peerId, mode);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      tuneSendersForQuality(pc, mode);
      kickstartRemotePlayback();
      const offer = await pc.createOffer();
      offer.sdp = applySdpQualityHints(offer.sdp, mode);
      await pc.setLocalDescription(offer);
      sendSignal(peerId, { type: "offer", mode, sdp: offer.sdp, rejoin: true });
      return true;
    } catch {
      setCallPhaseNote("Reconnecting...");
      return false;
    }
  }, [
    connectLivekit,
    ensureLocalStream,
    createPeerConnection,
    tuneSendersForQuality,
    kickstartRemotePlayback,
    sendSignal
  ]);

  const ensureSignalContact = (signal) => {
    const fromId = String(signal?.fromUserId || "");
    if (!fromId || fromId === myUserId) return;
    const name = normalizeDisplayName(signal?.fromName || signal?.fromEmail || `User ${fromId}`);
    setContacts((prev) =>
      mergeContacts(prev, [
        {
          id: fromId,
          name,
          email: signal?.fromEmail || "",
          avatar: (name[0] || "U").toUpperCase(),
          lastMessage: ""
        }
      ])
    );
  };

  const onSignal = async (signal) => {
    const type = String(signal?.type || "").toLowerCase();
    const fromId = String(signal?.fromUserId || "");
    const rawTs = signal?.timestamp ?? signal?.at ?? signal?.createdAt ?? 0;
    const parsedTs = Number(rawTs);
    const signalMs = Number.isFinite(parsedTs)
      ? (parsedTs > 1000000000000 ? parsedTs : parsedTs * 1000)
      : new Date(String(rawTs || "")).getTime();
    const signalTime = Number.isFinite(signalMs) && signalMs > 0 ? signalMs : 0;
    const signature = `${type}|${fromId}|${signal?.timestamp || ""}|${signal?.sdp || ""}|${signal?.candidate || ""}`;
    if (seenSignalsRef.current.has(signature)) return;
    seenSignalsRef.current.add(signature);
    if (seenSignalsRef.current.size > 1000) {
      seenSignalsRef.current.clear();
    }
    if (!type || !fromId || fromId === myUserId) return;

    ensureSignalContact(signal);
    const current = callStateRef.current;
    const incomingCallAt = Number(incomingCall?.at || 0);
    const terminalTypes = new Set(["hangup", "reject", "busy", "answer", "accepted", "ended"]);
    const roomId = String(signal?.roomId || "").trim();
    const membersRaw = Array.isArray(signal?.groupMembers) ? signal.groupMembers : [];
    const members = membersRaw.map((id) => String(id)).filter(Boolean);
    const isGroupSignal = Boolean(signal?.group || roomId);

    if (isGroupSignal) {
      const mode = signal?.mode === "video" ? "video" : "audio";
      const fromPeerId = String(fromId || "");
      const nextMembers = Array.from(new Set([...(members || []), fromPeerId, String(myUserId || "")].filter(Boolean)));

      if (type === "hangup" || type === "ended" || type === "reject" || type === "busy") {
        removeGroupPeer(fromPeerId);
        return;
      }

      try {
        if (!groupActiveRef.current && callStateRef.current.phase !== "idle") {
          const currentPeerId = String(callStateRef.current.peerId || "");
          if (currentPeerId !== fromPeerId) {
            sendSignal(fromPeerId, {
              type: "busy",
              mode,
              roomId: roomId || groupRoomId,
              group: true,
              groupMembers: serializeGroupMembers(nextMembers)
            });
            return;
          }
        }
        if (!groupActiveRef.current) {
          setGroupCallActive(true);
          setGroupRoomId(roomId || buildGroupRoomId());
          setGroupMembers(nextMembers);
          setCallState({
            phase: "connecting",
            mode,
            peerId: "group",
            peerName: "Group Call",
            initiatedByMe: false
          });
        } else if (roomId && roomId !== groupRoomId) {
          // Ignore signals from a different room while in a group call.
          return;
        } else {
          setGroupMembers((prev) => Array.from(new Set([...(prev || []), ...nextMembers])));
        }

        const stream = localStreamRef.current || await ensureLocalStream(mode);
        const pc = createGroupPeerConnection(fromPeerId, mode, roomId || groupRoomId, nextMembers);
        if (pc && stream && (!pc.getSenders || pc.getSenders().length === 0)) {
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        }

        if (type === "offer" && signal?.sdp) {
          await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          const answer = await pc.createAnswer();
          answer.sdp = applySdpQualityHints(answer.sdp, mode);
          await pc.setLocalDescription(answer);
          tuneSendersForQuality(pc, mode);
          sendSignal(fromPeerId, {
            type: "answer",
            mode,
            sdp: answer.sdp,
            roomId: roomId || groupRoomId,
            group: true,
            groupMembers: serializeGroupMembers(nextMembers)
          });
        } else if (type === "answer" && signal?.sdp && pc) {
          await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        } else if (type === "ice" && signal?.candidate && pc) {
          const parsedMLine = Number(signal.sdpMLineIndex);
          await pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: signal.candidate,
              sdpMid: signal.sdpMid || null,
              sdpMLineIndex: Number.isFinite(parsedMLine) ? parsedMLine : null
            })
          );
        }

        await ensureGroupMesh(nextMembers, roomId || groupRoomId, mode);
      } catch {
        // ignore group signal failures to keep call alive
      }
      return;
    }

    if (incomingCall?.fromUserId && fromId === String(incomingCall.fromUserId) && terminalTypes.has(type)) {
      const isIncomingTerminal = type === "hangup" || type === "reject" || type === "busy" || type === "ended";
      if (!isIncomingTerminal && callStateRef.current.phase === "idle") {
        return;
      }
      if (signalTime && incomingCallAt && signalTime + 1000 < incomingCallAt) {
        return;
      }
      if (signalTime && Date.now() - signalTime > CALL_SIGNAL_MAX_AGE_MS) {
        return;
      }
      clearCallTimer();
      stopRingtone();
      setIncomingCall(null);
      setRingtoneMuted(false);
    }

    if (type === "refreshing") {
      rejoinGraceUntilRef.current = Date.now() + CALL_REFRESH_GRACE_MS;
      if (callStateRef.current.phase !== "idle") {
        setCallState((prev) => (prev.phase === "idle" ? prev : { ...prev, phase: "connecting" }));
        setCallPhaseNote("Reconnecting...");
      }
      return;
    }

    if (type === "livekit-invite") {
      if (Number.isFinite(signalMs) && signalMs > 0 && Date.now() - signalMs > CALL_SIGNAL_MAX_AGE_MS) {
        return;
      }
      const nextMode = signal?.mode === "video" ? "video" : "audio";
      if (callStateRef.current.phase !== "idle") {
        sendSignal(fromId, { type: "busy", mode: nextMode });
        return;
      }
      pushCallHistory(fromId, {
        direction: "incoming",
        mode: nextMode,
        status: "ringing",
        peerName: normalizeDisplayName(signal?.fromName || signal?.fromEmail || "User")
      });
      setIncomingCall({
        fromUserId: fromId,
        fromName: normalizeDisplayName(signal?.fromName || signal?.fromEmail || "User"),
        mode: nextMode,
        roomId: roomId || buildLivekitRoomId(fromId),
        provider: "livekit",
        at: signalTime || Date.now()
      });
      setRingtoneMuted(false);
      setActiveContactId(fromId);
      navigate(`/chat/${fromId}`);
      startRingtone(true);
      armIncomingCallTimeout();
      playNotificationBeep();
      maybeShowBrowserNotification(
        "Incoming call",
        `${nextMode === "video" ? "Video" : "Audio"} call from ${normalizeDisplayName(signal?.fromName || signal?.fromEmail || "User")}`
      );
      return;
    }

    if (type === "livekit-accept") {
      if (current.peerId === fromId && current.provider === "livekit") {
        clearCallTimer();
        stopOutgoingRing();
        if (current.phase !== "in-call") {
          setCallState((prev) => (prev.phase === "in-call" ? prev : { ...prev, phase: "connecting" }));
          setCallPhaseNote("Connecting media...");
        } else {
          setCallPhaseNote("");
        }
      }
      return;
    }

    if (type === "offer") {
      if (Number.isFinite(signalMs) && signalMs > 0 && Date.now() - signalMs > CALL_SIGNAL_MAX_AGE_MS) {
        return;
      }
      const nextMode = signal?.mode === "video" ? "video" : "audio";
      let bypassBusyCheck = false;
      if (
        current.phase !== "idle" &&
        current.peerId === fromId &&
        current.phase !== "dialing" &&
        current.phase !== "connecting" &&
        signal?.sdp &&
        peerRef.current
      ) {
        try {
          await peerRef.current.setRemoteDescription({ type: "offer", sdp: signal.sdp });
          const answer = await peerRef.current.createAnswer();
          answer.sdp = applySdpQualityHints(answer.sdp, nextMode);
          await peerRef.current.setLocalDescription(answer);
          tuneSendersForQuality(peerRef.current, nextMode);
          sendSignal(fromId, { type: "answer", mode: nextMode, sdp: answer.sdp });
          setCallState((prev) => (prev.phase === "idle" ? prev : { ...prev, mode: nextMode, phase: "connecting" }));
          if (nextMode === "video") setIsCameraOff(false);
        } catch {
          finishCall(false, "Failed to update call");
        }
        return;
      }
      if (current.phase !== "idle") {
        // Handle call-collision (both users pressed call at the same time):
        // if the offer is from the same peer we are dialing, switch to incoming
        // instead of sending busy so at least one side can answer.
        if (current.peerId === fromId && (current.phase === "dialing" || current.phase === "connecting")) {
          clearCallTimer();
          closePeer();
          resetMedia();
          const idleState = {
            phase: "idle",
            mode: "audio",
            peerId: "",
            peerName: "",
            initiatedByMe: false,
            provider: "webrtc"
          };
          setCallState(idleState);
          callStateRef.current = idleState;
          bypassBusyCheck = true;
        } else {
          sendSignal(fromId, { type: "busy", mode: signal?.mode || "audio" });
          return;
        }
      }
      if (!bypassBusyCheck && callStateRef.current.phase !== "idle") {
        sendSignal(fromId, { type: "busy", mode: signal?.mode || "audio" });
        return;
      }
      pushCallHistory(fromId, {
        direction: "incoming",
        mode: signal?.mode === "video" ? "video" : "audio",
        status: "ringing",
        peerName: normalizeDisplayName(signal?.fromName || signal?.fromEmail || "User")
      });
      setIncomingCall({
        fromUserId: fromId,
        fromName: normalizeDisplayName(signal?.fromName || signal?.fromEmail || "User"),
        mode: signal?.mode === "video" ? "video" : "audio",
        sdp: signal?.sdp || "",
        at: signalTime || Date.now()
      });
      setRingtoneMuted(false);
      setActiveContactId(fromId);
      navigate(`/chat/${fromId}`);
      startRingtone(true);
      armIncomingCallTimeout();
      playNotificationBeep();
      maybeShowBrowserNotification(
        "Incoming call",
        `${signal?.mode === "video" ? "Video" : "Audio"} call from ${normalizeDisplayName(signal?.fromName || signal?.fromEmail || "User")}`
      );
      return;
    }

    if (type === "connected") {
      const activePeer = String(current.peerId || incomingCall?.fromUserId || "");
      if (!activePeer || activePeer === fromId) {
        setCallState((prev) => {
          if (prev.phase === "idle") return prev;
          return {
            ...prev,
            phase: "in-call",
            peerId: prev.peerId || fromId,
            peerName: prev.peerName || normalizeDisplayName(resolveContactName(fromId) || `User ${fromId}`)
          };
        });
        setCallPhaseNote("Connected");
      }
      return;
    }

    if (!current.peerId || current.peerId !== fromId) return;

    if (type === "answer" && signal?.sdp && peerRef.current) {
      try {
        await peerRef.current.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        clearCallTimer();
        stopOutgoingRing();
        setCallState((prev) => ({
          ...prev,
          phase: prev.phase === "in-call" ? "in-call" : "connecting",
          mode: signal?.mode === "video" ? "video" : prev.mode
        }));
        if (signal?.mode === "video") setIsCameraOff(false);
      } catch {
        finishCall(false, "Failed to establish call");
      }
      return;
    }

    if (type === "ice" && peerRef.current && signal?.candidate) {
      try {
        const parsedMLine = Number(signal.sdpMLineIndex);
        await peerRef.current.addIceCandidate(
          new RTCIceCandidate({
            candidate: signal.candidate,
            sdpMid: signal.sdpMid || null,
            sdpMLineIndex: Number.isFinite(parsedMLine) ? parsedMLine : null
          })
        );
      } catch {
        // ignore late/duplicate ICE
      }
      return;
    }

    if (type === "busy") {
      finishCall(false, "User is busy on another call");
      return;
    }

    if (type === "reject") {
      finishCall(false, "Call declined");
      return;
    }

    if (type === "hangup" || type === "ended") {
      const grace = rejoinGraceUntilRef.current;
      if (grace && Date.now() < grace) {
        return;
      }
      finishCall(false, "Call ended");
    }
  };

  const onIncomingChatMessage = (payload) => {
    const senderId = String(
      payload?.senderId ?? payload?.fromUserId ?? payload?.fromId ?? payload?.sender?.id ?? payload?.userId ?? ""
    );
    const receiverId = String(
      payload?.receiverId ?? payload?.toUserId ?? payload?.toId ?? payload?.receiver?.id ?? ""
    );
    const contactIdForThread =
      senderId && senderId !== String(myUserId)
        ? senderId
        : receiverId && receiverId !== String(myUserId)
          ? receiverId
          : "";
    if (!contactIdForThread) return;

    const text = String(payload?.text || "");
    const deleteTargetId = parseDeleteTargetId(text);
    if (deleteTargetId) {
      setMessagesByContact((prev) => {
        const existing = Array.isArray(prev[contactIdForThread]) ? prev[contactIdForThread] : [];
        const next = applyDeleteTargetsToList(existing, new Set([String(deleteTargetId)]));
        return { ...prev, [contactIdForThread]: next };
      });
      setContacts((prev) =>
        prev.map((c) => (c.id === contactIdForThread ? { ...c, lastMessage: "This message was deleted" } : c))
      );
      shouldStickToBottomRef.current = true;
      setTimeout(() => scrollThreadToBottom("smooth"), 50);
      return;
    }
    const nextMessage = normalizeMessage({
      id: payload?.id || `${payload?.createdAt || Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      senderId: senderId || contactIdForThread,
      receiverId: receiverId || String(myUserId || ""),
      text,
      audioUrl: payload?.audioUrl || "",
      mediaUrl: payload?.mediaUrl || "",
      mediaType: payload?.mediaType || "",
      fileName: payload?.fileName || "",
      createdAt: payload?.createdAt || new Date().toISOString()
    }, contactIdForThread);
    const hiddenIds = getHiddenMessageSetForContact(contactIdForThread);
    if (hiddenIds.has(String(nextMessage.id || ""))) return;
    const existingMessages = Array.isArray(messagesByContactRef.current?.[contactIdForThread])
      ? messagesByContactRef.current[contactIdForThread]
      : [];
    const nextSig = messageFingerprint(nextMessage);
    const alreadyPresent = existingMessages.some((message) => {
      if (String(message?.id || "") === String(nextMessage?.id || "")) return true;
      if (nextSig && messageFingerprint(message) === nextSig) return true;
      return false;
    });
    if (alreadyPresent) return;
    const preview =
      nextMessage.audioUrl
        ? "?? Voice message"
        : nextMessage.mediaType === "image"
          ? "?? Photo"
          : nextMessage.mediaType === "video"
            ? "?? Video"
            : nextMessage.mediaType === "audio"
              ? "?? Voice message"
              : nextMessage.mediaUrl
                ? `?? ${nextMessage.fileName || "File"}`
                : nextMessage.text;

    setMessagesByContact((prev) => {
      const existing = Array.isArray(prev[contactIdForThread]) ? prev[contactIdForThread] : [];
      const next = { ...prev, [contactIdForThread]: [...existing, nextMessage] };
      messagesByContactRef.current = next;
      return next;
    });

    setContacts((prev) => {
      const found = prev.find((c) => c.id === contactIdForThread);
      let next = prev;
      if (!found) {
        const name = normalizeDisplayName(
          payload?.senderName || payload?.senderEmail || payload?.fromName || payload?.fromEmail || `User ${contactIdForThread}`
        );
        next = mergeContacts(prev, [
          {
            id: contactIdForThread,
            name,
            email: payload?.senderEmail || payload?.fromEmail || "",
            avatar: (name[0] || "U").toUpperCase(),
            lastMessage: preview || nextMessage.text
          }
        ]);
      }
      return next.map((c) =>
        c.id === contactIdForThread
          ? {
              ...c,
              lastMessage: preview || c.lastMessage
            }
          : c
      );
    });

    if (!nextMessage.mine && shouldNotifyForMessage(nextMessage, contactIdForThread)) {
      playMessageAlert();
      const senderName = normalizeDisplayName(payload?.senderName || payload?.senderEmail || "New message");
      maybeShowBrowserNotification(senderName, preview || "You have a new message");
    }
    shouldStickToBottomRef.current = true;
    setTimeout(() => scrollThreadToBottom("smooth"), 50);
    if (contactIdForThread === String(activeContactId)) {
      setTimeout(() => {
        loadThread(contactIdForThread).catch(() => {});
      }, 120);
    }
  };

  const openGroupInvite = () => {
    const base = groupCallActive
      ? groupMembers.filter((id) => String(id) && String(id) !== String(myUserId))
      : (activeContactId ? [String(activeContactId)] : []);
    setGroupInviteIds(base);
    setGroupInviteOpen(true);
    setCallError("");
  };

  const toggleGroupInvite = (id) => {
    const key = String(id || "");
    if (!key) return;
    setGroupInviteIds((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else {
        if (set.size >= GROUP_CALL_MAX - 1) {
          setCallError(`Group calls support up to ${GROUP_CALL_MAX} people.`);
          return Array.from(set);
        }
        set.add(key);
      }
      return Array.from(set);
    });
  };

  const startGroupCall = async () => {
    if (groupCallActive) return;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCallError("Your browser does not support media calls");
      return;
    }
    const selected = Array.from(new Set(groupInviteIds.map((id) => String(id)).filter(Boolean)));
    if (selected.length === 0) {
      setCallError("Select at least one participant");
      return;
    }
    const currentPeerId = callStateRef.current.phase !== "idle" ? String(callStateRef.current.peerId || "") : "";
    const members = Array.from(new Set([String(myUserId || ""), ...selected, currentPeerId].filter(Boolean))).slice(0, GROUP_CALL_MAX);
    const roomId = buildGroupRoomId();
    setCallError("");
    setGroupRoomId(roomId);
    setGroupMembers(members);
    setGroupCallActive(true);
    setGroupInviteOpen(false);
    setCallState({
      phase: "dialing",
      mode: "video",
      peerId: "group",
      peerName: "Group Call",
      initiatedByMe: true
    });

    try {
      const stream = localStreamRef.current || await ensureLocalStream("video");
      if (callStateRef.current.phase !== "idle") {
        closeSinglePeerOnly();
        setCallState({
          phase: "connecting",
          mode: "video",
          peerId: "group",
          peerName: "Group Call",
          initiatedByMe: true
        });
      }
      for (const peerId of members) {
        if (!peerId || peerId === String(myUserId || "")) continue;
        const pc = createGroupPeerConnection(peerId, "video", roomId, members);
        if (!pc) continue;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        tuneSendersForQuality(pc, "video");
        const offer = await pc.createOffer();
        offer.sdp = applySdpQualityHints(offer.sdp, "video");
        await pc.setLocalDescription(offer);
        sendSignal(peerId, {
          type: "offer",
          mode: "video",
          sdp: offer.sdp,
          roomId,
          group: true,
          groupMembers: serializeGroupMembers(members)
        });
      }
    } catch {
      finishCall(false, "Could not start group call. Allow mic/camera and try again.");
    }
  };

  const addPeopleToGroupCall = async () => {
    const selected = Array.from(new Set(groupInviteIds.map((id) => String(id)).filter(Boolean)));
    if (selected.length === 0) {
      setCallError("Select at least one participant");
      return;
    }

    const currentMembers = Array.isArray(groupMembers) ? groupMembers.map((id) => String(id)) : [];
    const merged = Array.from(new Set([String(myUserId || ""), ...currentMembers, ...selected].filter(Boolean)));
    if (merged.length > GROUP_CALL_MAX) {
      setCallError(`Group calls support up to ${GROUP_CALL_MAX} people.`);
      return;
    }
    const roomId = groupRoomId || buildGroupRoomId();
    setGroupRoomId(roomId);
    setGroupMembers(merged);
    setGroupInviteOpen(false);

    try {
      const stream = localStreamRef.current || await ensureLocalStream("video");
      for (const peerId of merged) {
        if (!peerId || peerId === String(myUserId || "")) continue;
        if (groupPeersRef.current.has(peerId)) continue;
        const pc = createGroupPeerConnection(peerId, "video", roomId, merged);
        if (!pc) continue;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        tuneSendersForQuality(pc, "video");
        const offer = await pc.createOffer();
        offer.sdp = applySdpQualityHints(offer.sdp, "video");
        await pc.setLocalDescription(offer);
        sendSignal(peerId, {
          type: "offer",
          mode: "video",
          sdp: offer.sdp,
          roomId,
          group: true,
          groupMembers: serializeGroupMembers(merged)
        });
      }
    } catch {
      setCallError("Failed to add people to the call.");
    }
  };

  const startOutgoingCall = async (mode, options = {}) => {
    const { targetId: overrideTargetId, targetName: overrideTargetName, forceWebrtc = false } = options || {};
    const resolvedTargetId = String(overrideTargetId || activeContactId || "");
    if (!resolvedTargetId) return;
    if (resolvedTargetId === myUserId) {
      setCallError("Cannot call your own account");
      return;
    }
    if (callStateRef.current.phase !== "idle" || groupCallActive) return;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCallError("Your browser does not support media calls");
      return;
    }

    const targetId = resolvedTargetId;
    const targetName =
      String(overrideTargetName || "").trim() ||
      contacts.find((c) => c.id === targetId)?.name ||
      normalizeDisplayName(`User ${targetId}`);

    try {
      setCallError("");
      setIsMuted(false);
      setIsSpeakerOn(true);
      let dialStarted = false;
      if (livekitEnabled && !forceWebrtc) {
        const roomId = buildLivekitRoomId(targetId);
        setCallState({
          phase: "dialing",
          mode,
          peerId: targetId,
        peerName: targetName,
        initiatedByMe: true,
        provider: "livekit"
      });
      persistCallRejoin({ peerId: targetId, peerName: targetName, mode, provider: "livekit", roomId });
      startOutgoingRing();
      armOutgoingCallTimeout();
      pushCallHistory(targetId, {
        direction: "outgoing",
        mode,
        status: "calling",
        peerName: targetName
      });
      dialStarted = true;
      const joined = await connectLivekit(roomId, mode);
      if (joined) {
        sendSignal(targetId, { type: "livekit-invite", mode, roomId });
        return;
      }
      disconnectLivekit();
      clearCallRejoin();
      setCallPhaseNote("");
      }

      const stream = await ensureLocalStream(mode);
      const pc = createPeerConnection(targetId, mode);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      tuneSendersForQuality(pc, mode);
      kickstartRemotePlayback();

      const offer = await pc.createOffer();
      offer.sdp = applySdpQualityHints(offer.sdp, mode);
      await pc.setLocalDescription(offer);

      if (dialStarted) {
        setCallState((prev) => ({
          ...prev,
          phase: "dialing",
          mode,
          peerId: targetId,
          peerName: targetName,
          initiatedByMe: true,
          provider: "webrtc"
        }));
      } else {
        setCallState({
          phase: "dialing",
          mode,
          peerId: targetId,
          peerName: targetName,
          initiatedByMe: true,
          provider: "webrtc"
        });
        startOutgoingRing();
        armOutgoingCallTimeout();
        pushCallHistory(targetId, {
          direction: "outgoing",
          mode,
          status: "calling",
          peerName: targetName
        });
      }
      persistCallRejoin({ peerId: targetId, peerName: targetName, mode, provider: "webrtc" });

      sendSignal(targetId, {
        type: "offer",
        mode,
        sdp: offer.sdp
      });
    } catch {
      finishCall(false, "Could not start call. Allow mic/camera and try again.");
    }
  };

  const getVideoSender = (pc) => {
    if (!pc) return null;
    const direct = pc.getSenders?.().find((s) => s?.track?.kind === "video");
    if (direct) return direct;
    const transceiver = pc.getTransceivers?.().find((t) => t?.receiver?.track?.kind === "video");
    return transceiver?.sender || null;
  };

  const acceptIncomingCall = async () => {
    const call = incomingCall;
    if (!call?.fromUserId) {
      setCallError("Could not answer: missing caller details");
      return;
    }
    try {
      clearCallTimer();
      stopRingtone();
      setCallError("");
      setIsMuted(false);
      setIsSpeakerOn(true);
      if (call.provider === "livekit" || call.roomId) {
        const roomId = String(call.roomId || buildLivekitRoomId(call.fromUserId));
        setCallState({
          phase: "connecting",
          mode: call.mode,
          peerId: call.fromUserId,
          peerName: call.fromName,
          initiatedByMe: false,
          provider: "livekit"
        });
        persistCallRejoin({
          peerId: call.fromUserId,
          peerName: call.fromName,
          mode: call.mode,
          provider: "livekit",
          roomId
        });
        const joined = await connectLivekit(roomId, call.mode);
        if (!joined) {
          const fallbackState = {
            phase: "idle",
            mode: "audio",
            peerId: "",
            peerName: "",
            initiatedByMe: false,
            provider: "webrtc"
          };
          setCallState(fallbackState);
          callStateRef.current = fallbackState;
          setCallPhaseNote("");
          setIncomingCall(null);
          setRingtoneMuted(false);
          setCallError("LiveKit unavailable. Falling back to WebRTC...");
          window.setTimeout(() => setCallError(""), 2500);
          clearCallRejoin();
          await startOutgoingCall(call.mode, {
            targetId: String(call.fromUserId || ""),
            targetName: call.fromName,
            forceWebrtc: true
          });
          return;
        }
        sendSignal(call.fromUserId, { type: "livekit-accept", mode: call.mode, roomId });
        setIncomingCall(null);
        setRingtoneMuted(false);
        return;
      }
      const stream = await ensureLocalStream(call.mode);
      const pc = createPeerConnection(call.fromUserId, call.mode);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      tuneSendersForQuality(pc, call.mode);
      kickstartRemotePlayback();

      await pc.setRemoteDescription({ type: "offer", sdp: call.sdp });
      const answer = await pc.createAnswer();
      answer.sdp = applySdpQualityHints(answer.sdp, call.mode);
      await pc.setLocalDescription(answer);

      sendSignal(call.fromUserId, {
        type: "answer",
        mode: call.mode,
        sdp: answer.sdp
      });

      setCallState({
        phase: "connecting",
        mode: call.mode,
        peerId: call.fromUserId,
        peerName: call.fromName,
        initiatedByMe: false,
        provider: "webrtc"
      });
      persistCallRejoin({ peerId: call.fromUserId, peerName: call.fromName, mode: call.mode, provider: "webrtc" });
      setIncomingCall(null);
      setRingtoneMuted(false);
    } catch {
      finishCall(false, "Could not connect this call");
    }
  };

  const declineIncomingCall = () => {
    clearCallTimer();
    if (incomingCall?.fromUserId) {
      pushCallHistory(incomingCall.fromUserId, {
        direction: "incoming",
        mode: incomingCall.mode || "audio",
        status: "declined",
        peerName: incomingCall.fromName
      });
      sendSignal(incomingCall.fromUserId, { type: "reject", mode: incomingCall.mode || "audio" });
    }
    stopRingtone();
    setIncomingCall(null);
    setRingtoneMuted(false);
  };

  const toggleIncomingRingtoneMute = () => {
    setRingtoneMuted((prev) => {
      const next = !prev;
      if (next) {
        stopRingtone();
      } else if (incomingCall) {
        startRingtone(true);
      }
      return next;
    });
  };

  useEffect(() => {
    let target = null;
    try {
      const raw = sessionStorage.getItem(CALL_ACCEPT_TARGET_KEY);
      target = raw ? JSON.parse(raw) : null;
    } catch {
      target = null;
    }
    if (!target?.fromUserId) return;
    const ageMs = Date.now() - Number(target.at || 0);
    if (!Number.isFinite(ageMs) || ageMs > 45000) {
      try {
        sessionStorage.removeItem(CALL_ACCEPT_TARGET_KEY);
      } catch {
        // ignore storage issues
      }
      return;
    }
    if (target?.autoAccept !== true) {
      try {
        sessionStorage.removeItem(CALL_ACCEPT_TARGET_KEY);
      } catch {
        // ignore storage issues
      }
      return;
    }
    if ((!incomingCall || !incomingCall?.sdp) && target?.sdp) {
      setIncomingCall({
        fromUserId: String(target.fromUserId),
        fromName: String(target.fromName || "User"),
        mode: target.mode === "video" ? "video" : "audio",
        sdp: String(target.sdp || ""),
        at: Number(target.at || 0) || Date.now()
      });
      return;
    }
    if (!incomingCall?.fromUserId) return;
    const isSameCaller = String(target.fromUserId) === String(incomingCall.fromUserId);
    const isRecent = Date.now() - Number(target.at || 0) < 45000;
    if (!isSameCaller || !isRecent) return;
    try {
      sessionStorage.removeItem(CALL_ACCEPT_TARGET_KEY);
    } catch {
      // ignore storage issues
    }
    acceptIncomingCall();
  }, [incomingCall]);

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks?.()[0];
    if (!audioTrack) return;
    const nextMuted = !isMuted;
    audioTrack.enabled = !nextMuted;
    setIsMuted(nextMuted);
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn((prev) => !prev);
  };

  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0];
    if (!videoTrack) return;
    const nextOff = !isCameraOff;
    videoTrack.enabled = !nextOff;
    setIsCameraOff(nextOff);
  };

  const stopScreenShare = async () => {
    const screenStream = screenStreamRef.current;
    screenStreamRef.current = null;
    if (screenStream) {
      screenStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore stop errors
        }
      });
    }

    const localStream = localStreamRef.current;
    const cameraTrack = cameraTrackRef.current;
    const pc = peerRef.current;

    if (cameraTrack) {
      if (localStream) {
        localStream.getVideoTracks().forEach((track) => {
          if (track !== cameraTrack) {
            try {
              localStream.removeTrack(track);
            } catch {
              // ignore remove errors
            }
          }
        });
        if (!localStream.getVideoTracks().includes(cameraTrack)) {
          try {
            localStream.addTrack(cameraTrack);
          } catch {
            // ignore add errors
          }
        }
      }
      if (pc) {
        const sender = getVideoSender(pc);
        if (sender) {
          try {
            await sender.replaceTrack(cameraTrack);
          } catch {
            // ignore replace errors
          }
        }
        try {
          const offer = await pc.createOffer();
          offer.sdp = applySdpQualityHints(offer.sdp, "video");
          await pc.setLocalDescription(offer);
          if (callStateRef.current.peerId) {
            sendSignal(callStateRef.current.peerId, { type: "offer", mode: "video", sdp: offer.sdp });
          }
        } catch {
          // ignore renegotiation failures
        }
      }
    }

    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play?.().catch(() => {});
    }

    setIsScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }
    if (callState.mode !== "video" || callState.phase === "idle") return;
    if (callState.provider === "livekit") {
      setError("Screen share isn't supported in LiveKit calls yet.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen share is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks?.()[0];
      if (!track) {
        setError("Screen share failed to start.");
        return;
      }

      screenStreamRef.current = stream;
      const localStream = localStreamRef.current;
      const pc = peerRef.current;

      if (localStream) {
        const existingVideo = localStream.getVideoTracks?.()[0] || null;
        if (existingVideo && existingVideo !== track) {
          cameraTrackRef.current = existingVideo;
        }
        localStream.getVideoTracks().forEach((t) => {
          if (t !== track) {
            try {
              localStream.removeTrack(t);
            } catch {
              // ignore remove errors
            }
          }
        });
        try {
          if (!localStream.getVideoTracks().includes(track)) {
            localStream.addTrack(track);
          }
        } catch {
          // ignore add errors
        }
      }

      if (pc) {
        const sender = getVideoSender(pc);
        if (sender) {
          await sender.replaceTrack(track);
        } else if (localStream) {
          pc.addTrack(track, localStream);
        }
        try {
          const offer = await pc.createOffer();
          offer.sdp = applySdpQualityHints(offer.sdp, "video");
          await pc.setLocalDescription(offer);
          if (callStateRef.current.peerId) {
            sendSignal(callStateRef.current.peerId, { type: "offer", mode: "video", sdp: offer.sdp });
          }
        } catch {
          // ignore renegotiation failures
        }
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream || stream;
        localVideoRef.current.play?.().catch(() => {});
      }

      track.onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
      setError("");
    } catch {
      setError("Screen share failed. Please try again.");
      setIsScreenSharing(false);
    }
  };

  const upgradeCallToVideo = async () => {
    const current = callStateRef.current;
    if (!current?.peerId || current.phase === "idle" || current.mode === "video") return;
    if (current.provider === "livekit") {
      try {
        const room = livekitRoomRef.current;
        if (!room) {
          setCallError("Call is not ready for video switch");
          return;
        }
        const alreadyPublishing = Array.from(room.localParticipant.videoTrackPublications.values()).some(
          (pub) => pub.track && !pub.isMuted
        );
        if (!alreadyPublishing) {
          const tracks = await createLocalTracks({ video: true, audio: false });
          tracks.forEach((track) => {
            room.localParticipant.publishTrack(track).catch(() => {});
            if (!localStreamRef.current) {
              localStreamRef.current = new MediaStream();
            }
            try {
              localStreamRef.current.addTrack(track.mediaStreamTrack);
            } catch {
              // ignore duplicate track errors
            }
          });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
            localVideoRef.current.play?.().catch(() => {});
          }
        }
        setCallState((prev) => ({ ...prev, mode: "video" }));
        return;
      } catch {
        setCallError("Failed to enable video");
        return;
      }
    }
    const pc = peerRef.current;
    const localStream = localStreamRef.current;
    if (!pc || !localStream) {
      setCallError("Call is not ready for video switch");
      return;
    }

    try {
      setCallError("");
      let videoTrack = localStream.getVideoTracks?.()[0] || null;
      if (!videoTrack) {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 }
          }
        });
        videoTrack = cameraStream.getVideoTracks?.()[0] || null;
        if (!videoTrack) throw new Error("no-video-track");
        localStream.addTrack(videoTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
          localVideoRef.current.play?.().catch(() => {});
        }
      }

      const existingVideoSender = getVideoSender(pc);
      if (existingVideoSender) {
        await existingVideoSender.replaceTrack(videoTrack);
      } else {
        pc.addTrack(videoTrack, localStream);
      }

      tuneSendersForQuality(pc, "video");
      const offer = await pc.createOffer();
      offer.sdp = applySdpQualityHints(offer.sdp, "video");
      await pc.setLocalDescription(offer);

      setCallState((prev) => (prev.phase === "idle" ? prev : { ...prev, mode: "video", phase: "connecting" }));
      setIsCameraOff(false);
      sendSignal(current.peerId, {
        type: "offer",
        mode: "video",
        sdp: offer.sdp
      });
    } catch {
      setCallError("Could not switch to video. Allow camera and try again.");
      window.setTimeout(() => setCallError(""), 2500);
    }
  };

  const loadConversations = async () => {
    if (convoLoadingRef.current) return;
    convoLoadingRef.current = true;
    let list = [];
    const finalize = () => {
      lastConvoPollRef.current = Date.now();
      convoLoadingRef.current = false;
    };
    try {
      if (!localHydratedRef.current) {
        const shouldHydrateLocalEarly =
          (typeof navigator !== "undefined" && navigator.onLine === false) ||
          isChatApiDisabled() ||
          chatFallbackMode ||
          isLocalRuntime();
        if (shouldHydrateLocalEarly) {
          const fromLocalEarly = extractContactsFromLocalHistory();
          if (fromLocalEarly.length) {
            setContacts((prev) => mergeContacts(prev, fromLocalEarly));
            localHydratedRef.current = true;
          }
        }
      }
      if (!discoveryHydratedRef.current) {
        const cachedDiscovery = readDiscoveryCache();
        if (cachedDiscovery.length) {
          setContacts((prev) => mergeContacts(prev, cachedDiscovery));
          discoveryHydratedRef.current = true;
        }
      }
      if (isChatApiDisabled()) {
        const fromLocalDisabled = extractContactsFromLocalHistory();
        if (fromLocalDisabled.length) {
          setContacts((prev) => mergeContacts(prev, fromLocalDisabled));
        }
        setChatFallbackMode(true);
        finalize();
        return;
      }
      const res = await requestChatArray({
        endpoints: ["/api/chat/conversations"],
        params: { _: Date.now() },
        mapList: (items) =>
          items
            .map((entry) => entry?.user || entry?.contact || entry?.friend || entry?.profile || entry)
            .map(mapUserToContact)
            .filter((contact) => String(contact?.id || "").trim()),
        timeoutMs: 4000,
        maxAttempts: 4
      });
      list = res.list;
      const fromLocal = extractContactsFromLocalHistory();
      const mergedList = mergeContacts(list, fromLocal);
      setContacts((prev) => mergeContacts(prev, mergedList));
      setChatFallbackMode(false);
      list = mergedList;

      if (!list.length) {
        loadDiscoveryContacts({ broad: false }).then((discovered) => {
          if (Array.isArray(discovered) && discovered.length) {
            setContacts((prev) => mergeContacts(prev, discovered));
          }
        });
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        disableChatApiTemporarily();
        const fromLocal = extractContactsFromLocalHistory();
        if (fromLocal.length) {
          list = fromLocal;
          setContacts((prev) => mergeContacts(prev, fromLocal));
        }
        setChatFallbackMode(true);
      } else if (status === 401 || status === 403) {
        setChatFallbackMode(false);
        setError("Session expired for this server. Please login again.");
        clearAuthStorage();
        navigate("/login", { replace: true });
        finalize();
        return;
      } else {
        const fromLocal = extractContactsFromLocalHistory();
        if (fromLocal.length) {
          list = fromLocal;
          setContacts((prev) => mergeContacts(prev, fromLocal));
          setChatFallbackMode(true);
          setError("");
        } else {
          setChatFallbackMode(true);
          setError("Chat server unavailable. Please try again.");
        }
      }

      if (!list.length && contacts.length) {
        setError("");
      }

      if (!list.length) {
        loadDiscoveryContacts({ broad: false }).then((discovered) => {
          if (Array.isArray(discovered) && discovered.length) {
            setContacts((prev) => mergeContacts(prev, discovered));
          }
        });
      }
    }

    if (contactId) {
      setActiveContactId(String(contactId));
      finalize();
      return;
    }
    setActiveContactId((prev) => prev || (list[0]?.id || ""));
    finalize();
  };

  const loadDiscoveryContacts = async ({ broad = false } = {}) => {
    const meId = String(safeGetItem("userId") || myUserId || "").trim();
    const meEmail = String(safeGetItem("email") || myEmail || "").trim().toLowerCase();

    const isSameAsMeContact = (contact) => {
      const id = String(contact?.id || "").trim();
      const email = String(contact?.email || "").trim().toLowerCase();
      if (id && meId && id === meId) return true;
      if (email && meEmail && email === meEmail) return true;
      return false;
    };

    const normalizeContacts = (items, pickUser = null) =>
      toArrayPayload(items)
        .map((entry) => (typeof pickUser === "function" ? pickUser(entry) : entry))
        .map(mapUserToContact)
        .filter((contact) => String(contact?.id || "").trim())
        .filter((contact) => !isSameAsMeContact(contact));

    const fromEndpoints = async ({ endpoints, params = {}, pickUser = null }) => {
      try {
        const res = await requestChatArray({
          endpoints,
          params: { ...params, _: Date.now() },
          mapList: (items) => normalizeContacts(items, pickUser),
          timeoutMs: 4000,
          maxAttempts: 2
        });
        return res.list;
      } catch {
        return [];
      }
    };

    const cached = readDiscoveryCache();
    if (cached.length) {
      setContacts((prev) => mergeContacts(prev, cached));
    }

    const feedPromise = broad
      ? fromEndpoints({
        endpoints: ["/api/feed"],
          pickUser: (entry) => entry?.user || entry?.owner || entry?.author || entry
        })
      : Promise.resolve([]);
    const reelsPromise = broad
      ? fromEndpoints({
        endpoints: ["/api/reels"],
          pickUser: (entry) => entry?.user || entry?.owner || entry?.author || entry
        })
      : Promise.resolve([]);
    const searchPromise = broad
      ? fromEndpoints({
          endpoints: ["/api/profile/search", "/profile/search", "/api/users/search", "/users/search"],
          params: { q: "a", query: "a", keyword: "a" },
          pickUser: (entry) => entry?.user || entry?.contact || entry?.profile || entry
        })
      : Promise.resolve([]);

    const identityHints = [
      meId,
      String(safeGetItem("username") || "").trim(),
      String(safeGetItem("email") || "").trim(),
      "me"
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);

    const followPromises = identityHints.map((identity) => {
      const safeIdentity = encodeURIComponent(identity);
      return fromEndpoints({
        endpoints: [
          `/api/follow/${safeIdentity}/following/users`,
          `/api/follow/${safeIdentity}/followers/users`,
          `/api/profile/${safeIdentity}/following`,
          `/api/profile/${safeIdentity}/followers`,
          `/api/follow/${safeIdentity}/following`,
          `/api/follow/${safeIdentity}/followers`,
          `/api/follow/following/${safeIdentity}`,
          `/api/follow/followers/${safeIdentity}`
        ],
        pickUser: (entry) =>
          entry?.user ||
          entry?.following ||
          entry?.follower ||
          entry?.fromUser ||
          entry?.toUser ||
          entry
      });
    });

    const followResults = await Promise.allSettled(followPromises);
    const fromFollow = followResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((list) => Array.isArray(list))
      .flat();

    if (fromFollow.length) {
      const followIdentifiers = [];
      fromFollow
        .map((entry) => mapUserToContact(entry))
        .filter((contact) => String(contact?.id || "").trim())
        .forEach((contact) => {
          followIdentifiers.push(contact.id, contact.email, contact.username);
        });
      const unique = Array.from(new Set(followIdentifiers.filter(Boolean)));
      if (unique.length) {
        updateFollowCache(unique, true);
      }
    }

    const [fromFeed, fromReels, fromSearch] = await Promise.all([feedPromise, reelsPromise, searchPromise]);

    let fromCache = [];
    if (fromFeed.length + fromReels.length + fromSearch.length + fromFollow.length === 0) {
      try {
        const raw = localStorage.getItem("socialsea_following_cache_v1");
        const parsed = raw ? JSON.parse(raw) : {};
        const cacheKeys =
          parsed && typeof parsed === "object"
            ? Object.entries(parsed)
                .filter(([, value]) => value === true)
                .map(([key]) => String(key || "").trim())
                .filter(Boolean)
            : [];
        fromCache = cacheKeys
          .map((key) => {
            const looksEmail = key.includes("@");
            return mapUserToContact({
              id: key,
              userId: key,
              name: looksEmail ? key.split("@")[0] : key,
              username: looksEmail ? "" : key,
              email: looksEmail ? key : ""
            });
          })
          .filter((contact) => String(contact?.id || "").trim())
          .filter((contact) => !isSameAsMeContact(contact));
      } catch {
        fromCache = [];
      }
    }

    const fromLocalHistory = extractContactsFromLocalHistory();
    const discovered = [...fromFollow, ...fromFeed, ...fromReels, ...fromSearch, ...fromCache, ...fromLocalHistory];
    if (fromLocalHistory.length > 0 && fromFeed.length + fromReels.length + fromSearch.length + fromFollow.length === 0) {
      setChatFallbackMode(true);
    }
    setContacts((prev) => mergeContacts(prev, discovered));
    if (discovered.length) writeDiscoveryCache(discovered);
    if (discovered.length) setError("");
    return discovered;
  };

  const searchContacts = async (term) => {
    const q = String(term || "").trim();
    if (!q) return [];
    const meId = String(myUserId || safeGetItem("userId") || "").trim();
    const meEmail = String(myEmail || safeGetItem("email") || "").trim().toLowerCase();
    try {
      const res = await requestChatArray({
        endpoints: ["/api/profile/search", "/profile/search", "/api/users/search", "/users/search"],
        params: { q, query: q, keyword: q, _: Date.now() },
        mapList: (items) =>
          toArrayPayload(items)
            .map((entry) => entry?.user || entry?.contact || entry?.profile || entry)
            .map(mapUserToContact)
            .filter((contact) => String(contact?.id || "").trim())
            .filter((contact) => String(contact?.id || "").trim() !== meId)
            .filter((contact) => String(contact?.email || "").trim().toLowerCase() !== meEmail),
      });
      return res.list;
    } catch {
      return [];
    }
  };

  const loadThread = async (otherId) => {
    if (!otherId) return;
    const hiddenIds = getHiddenMessageSetForContact(otherId);
    let localFallbackList = null;
    if (chatFallbackMode) {
      const all = readLocalChat();
      const key = localThreadKey(myUserId, otherId);
      const normalized = (Array.isArray(all[key]) ? all[key] : []).map((m) => normalizeMessage(m, otherId));
      const deleteTargets = new Set(normalized.map((m) => parseDeleteTargetId(m?.text)).filter(Boolean).map(String));
      const visible = normalized.filter((m) => !parseDeleteTargetId(m?.text));
      const list = applyDeleteTargetsToList(visible, deleteTargets).filter((m) => !hiddenIds.has(String(m?.id || "")));
      localFallbackList = list;
      const existingThread = Array.isArray(messagesByContactRef.current?.[String(otherId)])
        ? messagesByContactRef.current[String(otherId)]
        : [];
      if (!existingThread.length) {
        setMessagesByContact((prev) => {
          const threadKey = String(otherId);
          const existing = Array.isArray(prev[threadKey]) ? prev[threadKey] : [];
          if (existing.length > 0 || areMessageListsEquivalent(existing, list)) return prev;
          const next = { ...prev, [threadKey]: list };
          messagesByContactRef.current = next;
          return next;
        });
      }
    }
    if (isChatApiDisabled()) {
      setChatFallbackMode(true);
      return;
    }
    try {
      const res = await requestChatArray({
        endpoints: [
          `/api/chat/${otherId}/messages`,
          `/chat/${otherId}/messages`,
          `/api/messages/${otherId}`,
          `/messages/${otherId}`
        ],
        params: { _: Date.now() },
        mapList: (items) => items.map((m) => normalizeMessage(m, otherId)),
        timeoutMs: chatFallbackMode ? 4500 : 9000,
        maxAttempts: chatFallbackMode ? 3 : Infinity
      });
      let normalized = Array.isArray(res.list) ? res.list : [];
      let usedLocalHistory = false;
      if (normalized.length === 0) {
        if (Array.isArray(localFallbackList) && localFallbackList.length > 0) {
          normalized = localFallbackList;
          usedLocalHistory = true;
        }
        const all = readLocalChat();
        const key = localThreadKey(myUserId, otherId);
        const localNormalized = (Array.isArray(all[key]) ? all[key] : []).map((m) => normalizeMessage(m, otherId));
        if (localNormalized.length > 0) {
          normalized = localNormalized;
          usedLocalHistory = true;
        }
      }
      const deleteTargets = new Set(normalized.map((m) => parseDeleteTargetId(m?.text)).filter(Boolean).map(String));
      const visible = normalized.filter((m) => !parseDeleteTargetId(m?.text));
      const list = applyDeleteTargetsToList(visible, deleteTargets).filter((m) => !hiddenIds.has(String(m?.id || "")));
      setMessagesByContact((prev) => {
        const key = String(otherId);
        const oldList = Array.isArray(prev[key]) ? prev[key] : [];
        if (!usedLocalHistory && list.length === 0 && oldList.length > 0) {
          return prev;
        }
        const oldById = new Map(oldList.map((m) => [String(m?.id || ""), m]));
        const stableList = list.map((m) => {
          const old = oldById.get(String(m?.id || ""));
          if (!old) return m;
          const hasValidTime = toEpochMs(m?.createdAt || 0) > 0;
          if (hasValidTime || !old?.createdAt) return m;
          return { ...m, createdAt: old.createdAt };
        });
        const pendingLocalMedia = oldList.filter((m) => String(m?.id || "").startsWith("local_media_"));
        const serverSignatureSet = new Set(stableList.map((m) => messageFingerprint(m)).filter(Boolean));
        const serverIdSet = new Set(stableList.map((m) => String(m?.id || "")));
        const pendingLocalText = oldList.filter((m) => {
          if (!m?.mine) return false;
          const sig = messageFingerprint(m);
          if (sig && serverSignatureSet.has(sig)) return false;
          const createdAt = new Date(normalizeTimestamp(m?.createdAt || 0)).getTime();
          if (!Number.isFinite(createdAt)) return false;
          return Date.now() - createdAt < 5 * 60 * 1000;
        });
        const keepRecentMissing = oldList.filter((m) => {
          const id = String(m?.id || "");
          if (!id || serverIdSet.has(id)) return false;
          if (deleteTargets.has(id)) return false;
          const sig = messageFingerprint(m);
          if (sig && serverSignatureSet.has(sig)) return false;
          const createdAt = new Date(normalizeTimestamp(m?.createdAt || 0)).getTime();
          if (!Number.isFinite(createdAt)) return false;
          return Date.now() - createdAt < 10 * 60 * 1000;
        });
        const merged = [];
        const mergedIds = new Set();
        const pushUnique = (item) => {
          const id = String(item?.id || "");
          if (id && mergedIds.has(id)) return;
          if (id) mergedIds.add(id);
          merged.push(item);
        };
        stableList.forEach(pushUnique);
        pendingLocalMedia.forEach(pushUnique);
        pendingLocalText.forEach(pushUnique);
        keepRecentMissing.forEach(pushUnique);
        merged.sort((a, b) => {
          const at = new Date(normalizeTimestamp(a?.createdAt || 0)).getTime();
          const bt = new Date(normalizeTimestamp(b?.createdAt || 0)).getTime();
          return at - bt;
        });
        if (areMessageListsEquivalent(oldList, merged)) {
          return prev;
        }
        const next = { ...prev, [key]: merged };
        messagesByContactRef.current = next;
        return next;
      });
      setChatFallbackMode(false);
    } catch (err) {
      const status = Number(err?.response?.status || 0);
      if (status === 404) {
        disableChatApiTemporarily();
        setChatFallbackMode(true);
        if (!localFallbackList) {
          const all = readLocalChat();
          const key = localThreadKey(myUserId, otherId);
          const normalized = (Array.isArray(all[key]) ? all[key] : []).map((m) => normalizeMessage(m, otherId));
          const deleteTargets = new Set(normalized.map((m) => parseDeleteTargetId(m?.text)).filter(Boolean).map(String));
          const visible = normalized.filter((m) => !parseDeleteTargetId(m?.text));
          const list = applyDeleteTargetsToList(visible, deleteTargets).filter((m) => !hiddenIds.has(String(m?.id || "")));
          setMessagesByContact((prev) => {
            const threadKey = String(otherId);
            const existing = Array.isArray(prev[threadKey]) ? prev[threadKey] : [];
            if (areMessageListsEquivalent(existing, list)) return prev;
            const next = { ...prev, [threadKey]: list };
            messagesByContactRef.current = next;
            return next;
          });
        }
        return;
      }
      if (status === 401 || status === 403) {
        setChatFallbackMode(false);
        setError("Session expired for this server. Please login again.");
        clearAuthStorage();
        navigate("/login", { replace: true });
      }
      throw err;
    }
  };

  useEffect(() => {
    let cancelled = false;
    api.get("/api/profile/me")
      .then((res) => {
        if (cancelled) return;
        const id = res?.data?.id != null ? String(res.data.id) : "";
        const email = String(res?.data?.email || "");
        if (id) {
          setMyUserId(id);
          try {
            sessionStorage.setItem("userId", id);
          } catch {
            // ignore
          }
        }
        if (email) {
          setMyEmail(email);
          try {
            sessionStorage.setItem("email", email);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopRingtone();
      stopOutgoingRing();
      stopSpeechTyping();
      stopAudioRecording();
    };
  }, []);

  useEffect(() => {
    const history = readCallHistory();
    historyRef.current = history;
    setCallHistoryByContact(history);
  }, [myUserId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CALL_REFRESH_GRACE_KEY);
      const ts = Number(raw || 0);
      if (Number.isFinite(ts) && Date.now() - ts < CALL_REFRESH_GRACE_MS) {
        rejoinGraceUntilRef.current = Date.now() + CALL_REFRESH_GRACE_MS;
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!myUserId || typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel("socialsea-call-signal");
    callChannelRef.current = channel;
    channel.onmessage = (event) => {
      const data = event?.data;
      if (!data || data.kind !== "call-signal") return;
      if (data.fromTab === tabIdRef.current) return;
      const signal = data.signal || {};
      if (String(signal?.fromUserId || "") === String(myUserId)) return;
      onSignal(signal);
    };
    return () => {
      try {
        channel.close();
      } catch {
        // ignore
      }
      callChannelRef.current = null;
    };
  }, [myUserId, myEmail]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== CALL_SIGNAL_LOCAL_KEY || !event.newValue) return;
      try {
        const packet = JSON.parse(event.newValue);
        if (packet?.fromTab === tabIdRef.current) return;
        const signal = packet?.signal || {};
        if (String(signal?.fromUserId || "") === String(myUserId)) return;
        onSignal(signal);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [myUserId, myEmail]);

  useEffect(() => {
    const onBeforeUnload = () => {
      const current = callStateRef.current;
      if (!current?.peerId || current.peerId === "group") return;
      if (current.phase === "idle") return;
      writeRefreshGrace();
      const payload = { type: "refreshing", mode: current.mode, provider: current.provider };
      try {
        const url = toApiUrl(`/api/calls/signal/${current.peerId}`);
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        navigator.sendBeacon?.(url, blob);
      } catch {
        // ignore beacon failures
      }
      try {
        sendSignal(current.peerId, payload);
      } catch {
        // ignore sync signaling failures
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [sendSignal]);

  useEffect(() => {
    if (!myUserId) return undefined;

    const applyReadReceipt = (packet) => {
      if (!packet || typeof packet !== "object") return;
      const readerId = String(packet.readerId || "");
      const peerId = String(packet.peerId || "");
      if (!readerId || !peerId) return;
      if (peerId !== String(myUserId)) return;
      if (readerId === String(myUserId)) return;

      const readUptoMs = Number(packet.readUptoMs || 0);
      if (!Number.isFinite(readUptoMs) || readUptoMs <= 0) return;

      const receiptId = String(packet.receiptId || `${readerId}|${peerId}|${readUptoMs}`);
      if (seenReadReceiptsRef.current.has(receiptId)) return;
      seenReadReceiptsRef.current.add(receiptId);
      if (seenReadReceiptsRef.current.size > 1200) {
        seenReadReceiptsRef.current.clear();
      }

      const readAt = String(packet.at || new Date().toISOString());
      setMessagesByContact((prev) => {
        const key = readerId;
        const list = Array.isArray(prev[key]) ? prev[key] : [];
        if (!list.length) return prev;
        let changed = false;
        const nextList = list.map((msg) => {
          if (!msg?.mine) return msg;
          const msgMs = new Date(normalizeTimestamp(msg?.createdAt || 0)).getTime();
          if (!Number.isFinite(msgMs) || msgMs > readUptoMs) return msg;
          if (msg.read === true || msg.seen === true || msg.readAt || msg.seenAt || String(msg.status || "").toLowerCase() === "read") {
            return msg;
          }
          changed = true;
          return {
            ...msg,
            read: true,
            seen: true,
            readAt,
            seenAt: readAt,
            status: "read",
            deliveryStatus: "read"
          };
        });
        return changed ? { ...prev, [key]: nextList } : prev;
      });
    };

    const onStorage = (event) => {
      if (event?.key !== CHAT_READ_RECEIPT_KEY || !event.newValue) return;
      try {
        const packet = JSON.parse(event.newValue);
        if (packet?.fromTab && packet.fromTab === tabIdRef.current) return;
        applyReadReceipt(packet);
      } catch {
        // ignore malformed receipt packet
      }
    };

    const onChannelMessage = (event) => {
      const packet = event?.data;
      if (packet?.fromTab && packet.fromTab === tabIdRef.current) return;
      applyReadReceipt(packet);
    };

    window.addEventListener("storage", onStorage);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        readReceiptChannelRef.current = new BroadcastChannel(CHAT_READ_RECEIPT_CHANNEL);
        readReceiptChannelRef.current.addEventListener("message", onChannelMessage);
      }
    } catch {
      readReceiptChannelRef.current = null;
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      if (readReceiptChannelRef.current) {
        readReceiptChannelRef.current.removeEventListener("message", onChannelMessage);
        readReceiptChannelRef.current.close();
        readReceiptChannelRef.current = null;
      }
    };
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId || rejoinAttemptedRef.current || callStateRef.current.phase !== "idle") return;
    let stored = null;
    try {
      const raw = sessionStorage.getItem(CALL_REJOIN_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    if (!stored?.peerId || !stored?.mode) return;
    const age = Date.now() - Number(stored.at || 0);
    if (!Number.isFinite(age) || age > CALL_REJOIN_MAX_AGE_MS) {
      clearCallRejoin();
      return;
    }

    rejoinAttemptedRef.current = true;
    rejoinRetryCountRef.current = 0;
    clearRejoinRetryTimer();
    const peerId = String(stored.peerId);
    const peerName = String(stored.peerName || "User");
    const mode = stored.mode === "video" ? "video" : "audio";
    const provider = String(stored.provider || "webrtc");
    const roomId = String(stored.roomId || "");

    rejoinPayloadRef.current = { peerId, peerName, mode, provider, roomId };
    rejoinGraceUntilRef.current = Date.now() + 15000;
    setActiveContactId(peerId);
    setCallState({
      phase: "connecting",
      mode,
      peerId,
      peerName,
      initiatedByMe: true,
      provider
    });
    setCallPhaseNote("Reconnecting...");

    const scheduleRetry = () => {
      clearRejoinRetryTimer();
      rejoinRetryTimerRef.current = setTimeout(async () => {
        const phase = callStateRef.current.phase;
        if (phase === "in-call" || phase === "idle") return;
        if (rejoinRetryCountRef.current >= CALL_REJOIN_MAX_RETRIES) {
          clearCallRejoin();
          setCallPhaseNote("Reconnecting...");
          return;
        }
        rejoinRetryCountRef.current += 1;
        await attemptRejoin();
        scheduleRetry();
      }, CALL_REJOIN_RETRY_MS);
    };

    (async () => {
      await attemptRejoin();
      scheduleRetry();
    })();
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) return undefined;

    const toId = (payload, keys) => {
      for (const key of keys) {
        const value = payload?.[key];
        if (value !== null && value !== undefined && String(value).trim()) {
          return String(value);
        }
      }
      return "";
    };

    const isPacketForCurrentUser = (payload) => {
      const me = String(myUserId || "");
      if (!me) return false;
      const senderId = toId(payload, ["senderId", "fromUserId", "fromId"]);
      const receiverId = toId(payload, ["receiverId", "toUserId", "toId"]);
      if (!senderId && !receiverId) return false;
      return senderId === me || receiverId === me;
    };

    const applyPacket = (packet) => {
      if (!packet || packet.kind !== "chat-message") return;
      if (packet?.fromTab && packet.fromTab === tabIdRef.current) return;
      const payload = packet?.payload;
      if (!payload || !isPacketForCurrentUser(payload)) return;
      onIncomingChatMessage(payload);
    };

    const onStorage = (event) => {
      if (event?.key !== CHAT_MESSAGE_LOCAL_KEY || !event.newValue) return;
      try {
        applyPacket(JSON.parse(event.newValue));
      } catch {
        // ignore malformed packet
      }
    };

    const onChannelMessage = (event) => {
      applyPacket(event?.data);
    };

    window.addEventListener("storage", onStorage);
    try {
      if (typeof BroadcastChannel !== "undefined") {
        messageChannelRef.current = new BroadcastChannel(CHAT_MESSAGE_CHANNEL);
        messageChannelRef.current.addEventListener("message", onChannelMessage);
      }
    } catch {
      messageChannelRef.current = null;
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      if (messageChannelRef.current) {
        messageChannelRef.current.removeEventListener("message", onChannelMessage);
        messageChannelRef.current.close();
        messageChannelRef.current = null;
      }
    };
  }, [myUserId]);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      const convo = await Promise.resolve(loadConversations())
        .then(() => true)
        .catch((err) => {
          console.error(err);
          return false;
        });

      if (!active) return;
      if (!convo) setError("Failed to load chat contacts");
      else setError("");
    };

    boot();
    return () => {
      active = false;
    };
  }, [myUserId, myEmail, contactId]);

  useEffect(() => {
    if (!contactId) return;
    setActiveContactId(String(contactId));
  }, [contactId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const fromQuery = String(params.get("share") || "").trim();
    const fromState = String(location.state?.shareDraft || "").trim();
    let fromStorage = "";
    try {
      fromStorage = String(sessionStorage.getItem(CHAT_SHARE_DRAFT_KEY) || "").trim();
    } catch {
      fromStorage = "";
    }
    const draft = fromState || fromQuery || fromStorage;
    if (!draft) return;
    setPendingShareDraft(draft);
    setShareHint("Select a chat, then tap Send.");
    try {
      sessionStorage.removeItem(CHAT_SHARE_DRAFT_KEY);
    } catch {
      // ignore storage failures
    }
  }, [location.search, location.state]);

  useEffect(() => {
    if (!pendingShareDraft || !activeContactId) return;
    setInputText((prev) => {
      const base = String(prev || "").trim();
      return base ? `${base}\n${pendingShareDraft}` : pendingShareDraft;
    });
    setShareHint("Video added to message box.");
    setPendingShareDraft("");
    const t = setTimeout(() => setShareHint(""), 1500);
    return () => clearTimeout(t);
  }, [pendingShareDraft, activeContactId]);

  useEffect(() => {
    if (!activeContactId) return;
    shouldStickToBottomRef.current = true;
    loadThread(activeContactId).catch(() => {});
  }, [activeContactId, myUserId, chatFallbackMode]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastConvoPollRef.current > CHAT_CONVO_POLL_MS) {
        lastConvoPollRef.current = now;
        loadConversations().catch(() => {});
      }
      if (activeContactId) {
        const minThreadPollGap = document.hidden ? CHAT_THREAD_POLL_BACKGROUND_MS : POLL_MS;
        if (now - lastThreadPollRef.current >= minThreadPollGap) {
          lastThreadPollRef.current = now;
          loadThread(activeContactId).catch(() => {});
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeContactId, contactId, myUserId, myEmail, chatFallbackMode]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token || !myUserId) return undefined;
    let disposed = false;
    let activeClient = null;

    const init = async () => {
      try {
        const [{ Client }, sockjsModule] = await Promise.all([
          import("@stomp/stompjs"),
          import("sockjs-client/dist/sockjs")
        ]);
        if (disposed) return;
        const SockJS = sockjsModule?.default || sockjsModule;
        const rawBase = resolveAbsoluteChatBase() || normalizeBaseCandidate(getApiBaseUrl());
        const origin = typeof window !== "undefined" ? String(window.location.origin || "") : "";
        const base = rawBase && rawBase.startsWith("/") ? `${origin}${rawBase}` : String(rawBase || "");
        if (!base) return;
        const wsBase = base.replace(/\/api\/?$/, "") || base;

        const wsOrigin = wsBase.startsWith("ws") ? wsBase : wsBase.replace(/^http/i, "ws");
        const transport = String(import.meta.env?.VITE_WS_TRANSPORT || "").toLowerCase();
        const useSockJS = transport === "sockjs" || (!transport && !isLocalRuntime());
        const client = new Client({
          ...(useSockJS
            ? { webSocketFactory: () => new SockJS(`${wsBase}/ws?token=${encodeURIComponent(token)}`) }
            : { brokerURL: `${wsOrigin}/ws?token=${encodeURIComponent(token)}` }),
          connectHeaders: { Authorization: `Bearer ${token}` },
          reconnectDelay: 3000,
          debug: () => {}
        });

        client.onConnect = () => {
          client.subscribe("/user/queue/chat", (frame) => {
            try {
              const payload = JSON.parse(frame.body || "{}");
              onIncomingChatMessage(payload);
            } catch {
              // ignore malformed payload
            }
          });
          client.subscribe(`/topic/chat/${myUserId}`, (frame) => {
            try {
              const payload = JSON.parse(frame.body || "{}");
              onIncomingChatMessage(payload);
            } catch {
              // ignore malformed payload
            }
          });
          if (myEmail) {
            client.subscribe(`/topic/chat/email/${encodeURIComponent(myEmail)}`, (frame) => {
              try {
                const payload = JSON.parse(frame.body || "{}");
                onIncomingChatMessage(payload);
              } catch {
                // ignore malformed payload
              }
            });
          }

          client.subscribe("/user/queue/calls", (frame) => {
            try {
              const payload = JSON.parse(frame.body || "{}");
              onSignal(payload);
            } catch {
              // ignore malformed payload
            }
          });
          client.subscribe(`/topic/calls/${myUserId}`, (frame) => {
            try {
              const payload = JSON.parse(frame.body || "{}");
              onSignal(payload);
            } catch {
              // ignore malformed payload
            }
          });
          if (myEmail) {
            client.subscribe(`/topic/calls/email/${encodeURIComponent(myEmail)}`, (frame) => {
              try {
                const payload = JSON.parse(frame.body || "{}");
                onSignal(payload);
              } catch {
                // ignore malformed payload
              }
            });
          }
        };
        client.onStompError = () => {
        };
        client.onWebSocketClose = () => {
        };
        client.onWebSocketError = () => {
        };

        client.activate();
        activeClient = client;
        stompRef.current = client;
      } catch (err) {
        console.error("Call signaling init failed:", err);
      }
    };

    init();

    return () => {
      disposed = true;
      try {
        activeClient?.deactivate?.();
      } catch {
        // ignore
      }
      stompRef.current = null;
      finishCall(false);
    };
  }, [myUserId, myEmail]);

  useEffect(() => {
    if (!myUserId) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await api.get("/api/calls/inbox");
        const list = Array.isArray(res.data) ? res.data : [];
        list.forEach((signal) => {
          onSignal(signal);
        });
      } catch {
        // ignore polling issues
      }
    }, CALL_POLL_MS);
    return () => clearInterval(timer);
  }, [myUserId]);

  useEffect(() => {
    setSidebarSearchUsers([]);
    return undefined;
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const pending = contacts.filter((contact) => {
      const id = String(contact?.id || "").trim();
      if (!id) return false;
      const displayName = getContactDisplayName(contact);
      return isGenericUserLabel(displayName, id);
    });
    if (!pending.length) return undefined;

    const run = async () => {
      for (const contact of pending) {
        const id = String(contact?.id || "").trim();
        if (!id || resolvingContactProfilesRef.current.has(id)) continue;
        resolvingContactProfilesRef.current.add(id);
        try {
          const res = await requestChatObject({
            endpoints: [
              `/api/profile/${encodeURIComponent(id)}`,
              `/profile/${encodeURIComponent(id)}`,
              `/api/users/${encodeURIComponent(id)}`,
              `/users/${encodeURIComponent(id)}`
            ],
            params: { _: Date.now() }
          });
          if (cancelled) return;
          const resolved = mapUserToContact(res?.data || {});
          const resolvedName = getContactDisplayName(resolved);
          if (isGenericUserLabel(resolvedName, id)) continue;

          setContacts((prev) => {
            let changed = false;
            const next = prev.map((item) => {
              if (String(item?.id || "") !== id) return item;
              const merged = {
                ...item,
                ...resolved,
                id,
                name: resolvedName,
                avatar: (resolvedName[0] || item?.avatar || "U").toUpperCase()
              };
              const before = `${String(item?.name || "")}|${String(item?.username || "")}|${String(item?.email || "")}|${String(item?.profilePic || "")}`;
              const after = `${String(merged?.name || "")}|${String(merged?.username || "")}|${String(merged?.email || "")}|${String(merged?.profilePic || "")}`;
              if (before !== after) changed = true;
              return merged;
            });
            return changed ? next : prev;
          });
        } catch {
          // ignore profile enrichment failures
        } finally {
          resolvingContactProfilesRef.current.delete(id);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [contacts]);

  useEffect(() => {
    let cancelled = false;
    const q = newChatQuery.trim();

    if (q.length < 1) {
      setSearchUsers([]);
      setSearchingUsers(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchingUsers(true);
        const data = await searchContacts(q);
        if (cancelled) return;
        setSearchUsers(data);
      } catch {
        if (!cancelled) setSearchUsers([]);
      } finally {
        if (!cancelled) setSearchingUsers(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newChatQuery]);

  const isBlockedContact = (contact) => {
    const contactIdValue = String(contact?.id || "").trim();
    const emailValue = String(contact?.email || "").trim().toLowerCase();
    return blockedUsers.some((user) => {
      const blockedId = String(user?.id || "").trim();
      const blockedEmail = String(user?.email || "").trim().toLowerCase();
      if (contactIdValue && blockedId) return contactIdValue === blockedId;
      if (contactIdValue || blockedId) return false;
      return emailValue && blockedEmail && emailValue === blockedEmail;
    });
  };

  const followingCache = useMemo(() => readFollowingCache(), [followingCacheTick]);

  const isFollowingContact = useCallback(
    (contact) => {
      const keys = getFollowKeysForContact(contact);
      if (!keys.length) return false;
      return keys.some((key) => followingCache[key] === true);
    },
    [followingCache]
  );

  const getRequestKey = (contact) => {
    const raw = contact?.id || contact?.email || contact?.username || "";
    return normalizeFollowKey(raw);
  };

  const getRequestStatus = (contact) => {
    const key = getRequestKey(contact);
    if (!key) return "";
    return String(pendingChatRequests?.[key]?.status || "");
  };

  const setRequestStatus = (contact, status) => {
    const key = getRequestKey(contact);
    if (!key) return;
    setPendingChatRequests((prev) => {
      const next = { ...(prev || {}) };
      if (!status) {
        delete next[key];
      } else {
        next[key] = { status, at: Date.now() };
      }
      writeChatRequestCache(next);
      return next;
    });
  };

  const setRequestStatusByIdentifiers = (identifiers, status) => {
    const keys = (identifiers || []).map(normalizeFollowKey).filter(Boolean);
    if (!keys.length) return;
    setPendingChatRequests((prev) => {
      const next = { ...(prev || {}) };
      keys.forEach((key) => {
        if (!status) {
          delete next[key];
        } else {
          next[key] = { status, at: Date.now() };
        }
      });
      writeChatRequestCache(next);
      return next;
    });
  };

  const resolveChatRequestContact = (request) => {
    if (!request || typeof request !== "object") return null;
    const contact = mapUserToContact(request) || {};
    const pickValue = (...values) =>
      values.map((value) => String(value || "").trim()).find(Boolean) || "";
    const contactId = pickValue(
      contact?.id,
      request?.senderId,
      request?.senderEmail,
      request?.senderUsername,
      request?.receiverId,
      request?.receiverEmail,
      request?.receiverUsername
    );
    const requestId = pickValue(request?.id, request?.requestId, request?.followRequestId);
    const resolvedId = contactId || requestId;
    if (!resolvedId) return null;
    const normalized = {
      ...contact,
      id: contact?.id || resolvedId,
      requestFallback: !contactId,
      email: contact?.email || pickValue(request?.senderEmail, request?.receiverEmail),
      username: contact?.username || pickValue(request?.senderUsername, request?.receiverUsername),
      name: contact?.name || pickValue(request?.senderName, request?.receiverName, request?.senderUsername, request?.receiverUsername)
    };
    const displayName = getContactDisplayName(normalized);
    return {
      ...normalized,
      name: displayName,
      avatar: (displayName[0] || normalized?.avatar || "U").toUpperCase()
    };
  };

  const resolveChatRequestIdentifiers = (request, contact) => {
    const sender = request?.sender || request?.actor || request?.user || {};
    const contactId = contact?.requestFallback ? "" : contact?.id;
    return [
      contactId,
      contact?.email,
      contact?.username,
      sender?.id,
      sender?.email,
      sender?.username,
      sender?.name,
      request?.senderId,
      request?.senderEmail,
      request?.senderUsername
    ].filter(Boolean);
  };

  const acceptChatRequest = async (request) => {
    const idText = String(request?.id || "").trim();
    if (!idText || chatRequestBusyById[idText]) return;
    setChatRequestBusyById((prev) => ({ ...prev, [idText]: true }));
    setChatRequestError("");
    try {
      await api.post(`/api/follow/requests/${encodeURIComponent(idText)}/accept`);
      setChatRequests((prev) => prev.filter((entry) => String(entry?.id || "") !== idText));
      const contact = resolveChatRequestContact(request);
      if (contact?.id && !contact?.requestFallback) {
        setContacts((prev) => mergeContacts(prev, [contact]));
        const identifiers = resolveChatRequestIdentifiers(request, contact);
        updateFollowCache(identifiers, true);
        setRequestStatusByIdentifiers(identifiers, "following");
      }
    } catch {
      setChatRequestError("Unable to accept chat request.");
    } finally {
      setChatRequestBusyById((prev) => ({ ...prev, [idText]: false }));
    }
  };

  const rejectChatRequest = async (request) => {
    const idText = String(request?.id || "").trim();
    if (!idText || chatRequestBusyById[idText]) return;
    setChatRequestBusyById((prev) => ({ ...prev, [idText]: true }));
    setChatRequestError("");
    try {
      await api.post(`/api/follow/requests/${encodeURIComponent(idText)}/reject`);
      setChatRequests((prev) => prev.filter((entry) => String(entry?.id || "") !== idText));
      const contact = resolveChatRequestContact(request);
      if (contact?.id && !contact?.requestFallback) {
        const identifiers = resolveChatRequestIdentifiers(request, contact);
        updateFollowCache(identifiers, false);
        setRequestStatusByIdentifiers(identifiers, "");
      }
    } catch {
      setChatRequestError("Unable to reject chat request.");
    } finally {
      setChatRequestBusyById((prev) => ({ ...prev, [idText]: false }));
    }
  };

  const requestChatAccess = async (contact) => {
    const primaryKey = getRequestKey(contact);
    const identifierCandidates = [
      primaryKey,
      contact?.email,
      contact?.username,
      contact?.name
    ]
      .map((value) => String(value || "").trim())
      .filter((value, index, arr) => value && arr.indexOf(value) === index);
    if (!identifierCandidates.length) {
      setError("Unable to request chat for this user.");
      return;
    }
    const status = getRequestStatus(contact);
    if (status === "requested" || status === "pending") return;
    setRequestStatus(contact, "pending");
    try {
      let res = null;
      for (const candidate of identifierCandidates) {
        const encoded = encodeURIComponent(candidate);
        try {
          res = await requestChatMutation({
            method: "POST",
            endpoints: [`/api/follow/requests/${encoded}`, `/api/follow/${encoded}`]
          });
          break;
        } catch (err) {
          const code = Number(err?.response?.status || 0);
          if (code === 400 || code === 404) {
            res = null;
            continue;
          }
          throw err;
        }
      }
      if (!res) {
        throw new Error("Unable to resolve user for chat request.");
      }
      const nextStatus = String(res?.data?.status || "").toLowerCase();
      if (nextStatus.includes("following")) {
        updateFollowCache([contact?.id, contact?.email, contact?.username], true);
        setRequestStatus(contact, "following");
      } else {
        setRequestStatus(contact, "requested");
      }
    } catch {
      setRequestStatus(contact, "error");
      setError("Chat request failed. Please try again.");
    }
  };

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = !q
      ? contacts
      : contacts.filter((c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));

    const merged = new Map();
    local.forEach((c) => {
      if (!c?.id) return;
      if (!merged.has(c.id)) merged.set(c.id, c);
    });
    return Array.from(merged.values()).filter((c) => {
      if (c.id === myUserId) return false;
      if (isBlockedContact(c)) return false;
      return true;
    });
  }, [contacts, query, myUserId, blockedUsers]);

  const newChatCandidates = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase();
    const local = !q
      ? contacts
      : contacts.filter((c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));

    const merged = new Map();
    [...local, ...searchUsers].forEach((c) => {
      if (!c?.id) return;
      if (!merged.has(c.id)) merged.set(c.id, c);
    });
    return Array.from(merged.values()).filter((c) => {
      if (c.id === myUserId) return false;
      if (isBlockedContact(c)) return false;
      return true;
    });
  }, [contacts, newChatQuery, searchUsers, myUserId, blockedUsers]);

  const outgoingRequestKeys = useMemo(() => {
    const keys = new Set();
    sentChatRequests.forEach((req) => {
      const contact = resolveChatRequestContact(req);
      if (!contact) return;
      const identifiers = resolveChatRequestIdentifiers(req, contact);
      identifiers.forEach((value) => {
        const key = normalizeFollowKey(value);
        if (key) keys.add(key);
      });
    });
    return keys;
  }, [sentChatRequests]);

  const hasOutgoingRequest = (contact) => {
    if (!contact) return false;
    const candidates = [contact.id, contact.email, contact.username, contact.name]
      .map((value) => normalizeFollowKey(value))
      .filter(Boolean);
    return candidates.some((key) => outgoingRequestKeys.has(key));
  };

  const filteredSentChatRequests = useMemo(
    () =>
      sentChatRequests.filter((req) => {
        const contact = resolveChatRequestContact(req);
        if (!contact) return true;
        return !isFollowingContact(contact);
      }),
    [sentChatRequests, isFollowingContact]
  );
  const requestsTotal = chatRequests.length + filteredSentChatRequests.length;

  const canChatWith = (contact) => {
    if (!contact) return false;
    if (isFollowingContact(contact)) return true;
    if (getRequestStatus(contact) === "following") return true;
    const id = String(contact?.id || "").trim();
    if (!id) return false;
    const existing = messagesByContact[id];
    return Array.isArray(existing) && existing.length > 0;
  };

  const openContact = (contact) => {
    const c = mapUserToContact(contact);
    const displayName = getContactDisplayName(c);
    const normalized = {
      ...c,
      name: displayName,
      avatar: (displayName[0] || c?.avatar || "U").toUpperCase()
    };
    if (!normalized.id || normalized.id === myUserId) {
      setError("Cannot chat/call with your own account.");
      return;
    }
    if (isBlockedContact(normalized)) {
      setError("This user is blocked.");
      return;
    }
    if (!canChatWith(normalized)) {
      setError("Send a chat request first.");
      return;
    }
    setContacts((prev) => mergeContacts(prev, [normalized]));
    setActiveContactId(normalized.id);
    setContactActionId("");
    navigate(`/chat/${normalized.id}`);
  };

  const startNewChat = (contact) => {
    openContact(contact);
    setNewChatOpen(false);
    setNewChatQuery("");
  };

  const toggleContactActions = (contactId) => {
    const id = String(contactId || "").trim();
    if (!id) return;
    setContactActionId((prev) => (String(prev) === id ? "" : id));
  };

  const startContactLongPress = (contactId) => (event) => {
    if (!contactId) return;
    if (event?.pointerType === "mouse") return;
    contactLongPressTriggeredRef.current = false;
    if (contactLongPressTimerRef.current) {
      clearTimeout(contactLongPressTimerRef.current);
    }
    contactLongPressTimerRef.current = setTimeout(() => {
      contactLongPressTriggeredRef.current = true;
      setContactActionId(String(contactId));
    }, 600);
  };

  const stopContactLongPress = () => {
    if (contactLongPressTimerRef.current) {
      clearTimeout(contactLongPressTimerRef.current);
      contactLongPressTimerRef.current = null;
    }
  };

  const handleContactPointerUp = (event, contact) => {
    const id = String(contact?.id || "").trim();
    if (!id) return;
    if (event?.pointerType === "mouse") {
      if (typeof event?.button === "number" && event.button !== 0) return;
      openContact(contact);
      return;
    }
    stopContactLongPress();
    if (contactLongPressTriggeredRef.current) {
      contactLongPressTriggeredRef.current = false;
      return;
    }
    if (String(contactActionId) === id) {
      setContactActionId("");
      return;
    }
    openContact(contact);
  };

  const handleContactKeyDown = (event, contact) => {
    if (!event) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openContact(contact);
    }
  };

  const deleteConversation = async (contact) => {
    const id = String(contact?.id || "").trim();
    if (!id) return;
    const label = getContactDisplayName(contact);
    const confirmed = window.confirm(`Delete entire chat with ${label}? This will remove the conversation for you.`);
    if (!confirmed) return;

    setError("");
    try {
      await api.delete(`/api/chat/${id}`);
    } catch (err) {
      if (!chatFallbackMode) {
        setError(err?.response?.data?.message || "Failed to delete chat.");
        return;
      }
    }

    setContacts((prev) => prev.filter((c) => String(c?.id) !== id));
    setMessagesByContact((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCallHistoryByContact((prev) => {
      const next = { ...prev };
      delete next[id];
      historyRef.current = next;
      writeCallHistory(next);
      return next;
    });

    try {
      const key = localThreadKey(myUserId, id);
      const all = readLocalChat();
      if (all && typeof all === "object") {
        const next = { ...all };
        delete next[key];
        writeLocalChat(next);
      }
      const hiddenMap = readHiddenMessageMap();
      if (hiddenMap && typeof hiddenMap === "object") {
        const next = { ...hiddenMap };
        delete next[key];
        writeHiddenMessageMap(next);
      }
    } catch {
      // ignore local cache cleanup errors
    }

    if (String(activeContactId) === id) {
      setActiveContactId("");
      navigate("/chat");
    }
    setContactActionId("");
  };

  const activeContact = contacts.find((c) => c.id === activeContactId) || null;
  const activeContactBlocked = activeContact ? isBlockedContact(activeContact) : false;
  const activeMessages = messagesByContact[activeContactId] || [];
  const activeCallHistory = Array.isArray(callHistoryByContact[activeContactId])
    ? callHistoryByContact[activeContactId]
    : [];

  const clampFutureTimestamp = (ts) => {
    if (!Number.isFinite(ts) || ts <= 0) return 0;
    const now = nowTick;
    const maxFutureSkewMs = 2 * 60 * 1000;
    if (ts <= now + maxFutureSkewMs) return ts;
    const offsetMs = new Date(ts).getTimezoneOffset() * 60000;
    const adjusted = ts + offsetMs;
    if (adjusted <= now + maxFutureSkewMs) return adjusted;
    return Math.min(ts, now);
  };

  const formatLastSeen = (value) => {
    const ts = clampFutureTimestamp(toEpochMs(value));
    if (!ts) return "lastseen at --";
    const d = new Date(ts);
    const now = new Date(nowTick);
    const timeLabel = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return `lastseen today at ${timeLabel}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `lastseen yesterday at ${timeLabel}`;
    }
    return `lastseen ${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${timeLabel}`;
  };

  const hasExplicitOnlineFlag = (contact) =>
    Boolean(contact && Object.prototype.hasOwnProperty.call(contact, "online"));

  const getExplicitOnlineValue = (contact) =>
    hasExplicitOnlineFlag(contact) ? Boolean(contact?.online) : null;

  const getPeerMessageActivityTs = (contactId) => {
    if (!contactId) return 0;
    const list = Array.isArray(messagesByContact?.[contactId]) ? messagesByContact[contactId] : [];
    return list.reduce((max, msg) => {
      if (!msg || msg.mine) return max;
      const t = toEpochMs(msg?.createdAt || 0);
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
  };

  const getPeerCallActivityTs = (contactId) => {
    if (!contactId) return 0;
    const list = Array.isArray(callHistoryByContact?.[contactId]) ? callHistoryByContact[contactId] : [];
    return list.reduce((max, entry) => {
      const status = String(entry?.status || "").toLowerCase();
      const direction = String(entry?.direction || "").toLowerCase();
      const meaningful = direction === "incoming" || status === "connected" || status === "accepted";
      if (!meaningful) return max;
      const t = toEpochMs(entry?.at || 0);
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
  };

  const getContactActivityTs = (contact) => {
    const profileTs = clampFutureTimestamp(toEpochMs(contact?.lastActiveAt || 0));
    const contactId = String(contact?.id || "").trim();
    const peerMsgTs = getPeerMessageActivityTs(contactId);
    const peerCallTs = getPeerCallActivityTs(contactId);
    const fallbackTs = Math.max(peerMsgTs, peerCallTs);
    const latest = Math.max(Number.isFinite(profileTs) ? profileTs : 0, Number.isFinite(fallbackTs) ? fallbackTs : 0);
    return Number.isFinite(latest) ? latest : 0;
  };

  const getContactPresence = (contact) => {
    if (!contact) return { online: false, text: "lastseen at --" };
    const latest = getContactActivityTs(contact);
    const explicitOnline = getExplicitOnlineValue(contact);
    const windowMs = Number.isFinite(ONLINE_WINDOW_MS) && ONLINE_WINDOW_MS > 0 ? ONLINE_WINDOW_MS : 2 * 60 * 1000;
    const inferredOnline = latest > 0 && nowTick - latest <= windowMs;
    const isOnline = explicitOnline === true ? true : inferredOnline;
    if (isOnline) return { online: true, text: "online" };
    return {
      online: false,
      text: latest > 0 ? formatLastSeen(latest) : "lastseen at --"
    };
  };

  const resolveStoryMediaUrl = (raw) => {
    if (!raw) return "";
    const normalized = String(raw);
    if (/^(blob:|data:|https?:\/\/)/i.test(normalized)) return normalized;
    return toApiUrl(normalized);
  };

  const revokeStoryViewerBlobUrl = useCallback(() => {
    if (!storyViewerBlobUrlRef.current) return;
    try {
      URL.revokeObjectURL(storyViewerBlobUrlRef.current);
    } catch {
      // ignore URL revoke failures
    }
    storyViewerBlobUrlRef.current = "";
  }, []);

  const clearStoryViewerLoadTimer = useCallback(() => {
    if (!storyViewerLoadTimeoutRef.current) return;
    clearTimeout(storyViewerLoadTimeoutRef.current);
    storyViewerLoadTimeoutRef.current = null;
  }, []);

  const buildStoryMediaCandidates = useCallback((raw) => {
    const value = String(raw || "").trim();
    if (!value) return [];
    const collected = [];
    const add = (candidate) => {
      const normalized = String(candidate || "").trim();
      if (!normalized) return;
      if (collected.includes(normalized)) return;
      collected.push(normalized);
    };
    const normalizeBase = (base) => String(base || "").trim().replace(/\/+$/, "");
    const addBase = (base, path) => {
      const normalizedBase = normalizeBase(base);
      if (!normalizedBase || !path) return;
      add(`${normalizedBase}${path}`);
    };
    const apiBase = normalizeBase(getApiBaseUrl());
    const relPath = value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
    const relPathNoApi = relPath.replace(/^\/api(?=\/|$)/i, "") || relPath;
    const devProxyBase = normalizeBase(import.meta.env?.VITE_DEV_PROXY_TARGET);
    const apiFallbackBase = normalizeBase(import.meta.env?.VITE_API_FALLBACK || "https://api.socialsea.co.in");
    const localBases = (() => {
      if (typeof window === "undefined") return [];
      const host = String(window.location.hostname || "").trim().toLowerCase();
      if (!host) return [];
      const isLocalHost = host === "localhost" || host === "127.0.0.1";
      const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
      if (isLocalHost) {
        return ["http://localhost:8080", "http://127.0.0.1:8080"];
      }
      if (isPrivateIp) {
        return [`http://${host}:8080`];
      }
      return [];
    })();
    const addLocalBases = (path) => {
      if (!localBases.length || !path) return;
      for (const base of localBases) {
        addBase(base, path);
      }
    };
    const uploadApiPath = relPath.startsWith("/uploads/") ? `/api${relPath}` : "";
    const stripApiPath = (base) => {
      const normalized = normalizeBase(base);
      if (!normalized) return "";
      if (normalized.startsWith("/")) return normalized.replace(/\/api$/i, "");
      try {
        const parsed = new URL(normalized);
        if (/\/api\/?$/i.test(parsed.pathname)) {
          parsed.pathname = parsed.pathname.replace(/\/api\/?$/i, "");
          return parsed.toString().replace(/\/+$/, "");
        }
      } catch {
        // ignore URL parse errors
      }
      return "";
    };
    const stripApiSubdomain = (base) => {
      const normalized = normalizeBase(base);
      if (!normalized || normalized.startsWith("/")) return "";
      try {
        const parsed = new URL(normalized);
        if (/^api\./i.test(parsed.hostname)) {
          parsed.hostname = parsed.hostname.replace(/^api\./i, "");
          return parsed.toString().replace(/\/+$/, "");
        }
      } catch {
        // ignore URL parse errors
      }
      return "";
    };

    const hasScheme = /^https?:\/\//i.test(value);
    if (!hasScheme) {
      if (value.startsWith("//")) {
        add(`https:${value}`);
      } else if (!value.startsWith("/") && /[a-z0-9-]+\.[a-z0-9-]+/i.test(value)) {
        add(`https://${value.replace(/^\/+/, "")}`);
      }

      if (relPath.startsWith("/uploads/")) {
        addLocalBases(relPath);
      }
      add(toApiUrl(relPath));
      if (typeof window !== "undefined") {
        add(`${window.location.origin}${relPath}`);
      }
      if (apiBase) addBase(apiBase, relPath);
      if (devProxyBase) addBase(devProxyBase, relPath);
      if (apiFallbackBase) addBase(apiFallbackBase, relPath);
      addLocalBases(relPath);
      const apiBaseNoPath = stripApiPath(apiBase);
      if (apiBaseNoPath) addBase(apiBaseNoPath, relPath);
      const apiBaseNoSub = stripApiSubdomain(apiBase);
      if (apiBaseNoSub) addBase(apiBaseNoSub, relPath);
      if (uploadApiPath) {
        add(uploadApiPath);
        if (typeof window !== "undefined") add(`${window.location.origin}${uploadApiPath}`);
        if (apiBase) addBase(apiBase, uploadApiPath);
        if (devProxyBase) addBase(devProxyBase, uploadApiPath);
        if (apiFallbackBase) addBase(apiFallbackBase, uploadApiPath);
        addLocalBases(uploadApiPath);
        if (apiBaseNoPath) addBase(apiBaseNoPath, uploadApiPath);
        if (apiBaseNoSub) addBase(apiBaseNoSub, uploadApiPath);
      }
      if (relPathNoApi !== relPath) {
        add(relPathNoApi);
        if (typeof window !== "undefined") add(`${window.location.origin}${relPathNoApi}`);
        if (devProxyBase) addBase(devProxyBase, relPathNoApi);
        if (apiBase) addBase(apiBase, relPathNoApi);
        if (apiFallbackBase) addBase(apiFallbackBase, relPathNoApi);
        addLocalBases(relPathNoApi);
        if (apiBaseNoPath) addBase(apiBaseNoPath, relPathNoApi);
        if (apiBaseNoSub) addBase(apiBaseNoSub, relPathNoApi);
      }
      add(value);
      return collected;
    }

    add(value);

    try {
      const parsed = new URL(value);
      const pathWithQuery = `${parsed.pathname || ""}${parsed.search || ""}${parsed.hash || ""}`;
      const host = String(parsed.hostname || "").toLowerCase();
      const isFrontendHost =
        host === "socialsea.co.in" || host === "www.socialsea.co.in" || host.endsWith(".netlify.app");
      if (pathWithQuery) {
        if (typeof window !== "undefined") add(`${window.location.origin}${pathWithQuery}`);
        if (apiBase) addBase(apiBase, pathWithQuery);
        if (devProxyBase) addBase(devProxyBase, pathWithQuery);
        if (apiFallbackBase) addBase(apiFallbackBase, pathWithQuery);
        if (/^\/(uploads|api)\//i.test(pathWithQuery)) {
          addLocalBases(pathWithQuery);
        }
        if (isFrontendHost && /^\/uploads\//i.test(pathWithQuery)) {
          const apiHost = host.startsWith("www.") ? `api.${host.replace(/^www\./, "")}` : `api.${host}`;
          add(`https://${apiHost}${pathWithQuery}`);
        }
        const apiBaseNoPath = stripApiPath(apiBase);
        if (apiBaseNoPath) addBase(apiBaseNoPath, pathWithQuery);
        const apiBaseNoSub = stripApiSubdomain(apiBase);
        if (apiBaseNoSub) addBase(apiBaseNoSub, pathWithQuery);
        if (pathWithQuery.startsWith("/api/")) {
          const trimmedPath = pathWithQuery.replace(/^\/api(?=\/|$)/i, "") || pathWithQuery;
          add(trimmedPath);
          if (typeof window !== "undefined") add(`${window.location.origin}${trimmedPath}`);
          if (devProxyBase) addBase(devProxyBase, trimmedPath);
          if (apiBase) addBase(apiBase, trimmedPath);
          if (apiFallbackBase) addBase(apiFallbackBase, trimmedPath);
          addLocalBases(trimmedPath);
          if (apiBaseNoPath) addBase(apiBaseNoPath, trimmedPath);
          if (apiBaseNoSub) addBase(apiBaseNoSub, trimmedPath);
        }
        if (pathWithQuery.startsWith("/uploads/")) {
          const apiPath = `/api${pathWithQuery}`;
          add(apiPath);
          if (typeof window !== "undefined") add(`${window.location.origin}${apiPath}`);
          if (devProxyBase) addBase(devProxyBase, apiPath);
          if (apiBase) addBase(apiBase, apiPath);
          if (apiFallbackBase) addBase(apiFallbackBase, apiPath);
          addLocalBases(apiPath);
          if (apiBaseNoPath) addBase(apiBaseNoPath, apiPath);
          if (apiBaseNoSub) addBase(apiBaseNoSub, apiPath);
        }
      }
    } catch {
      // ignore URL parse errors
    }
    return collected;
  }, []);

  const isStoryVideo = (url) =>
    /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv|m3u8|mpd)(\?|#|$)/i.test(String(url || ""));

  const detectStoryMediaKind = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    if (raw === "video" || raw === "reel") return "video";
    if (raw === "image" || raw === "photo" || raw === "pic") return "image";
    if (raw.includes("video")) return "video";
    if (raw.includes("image")) return "image";
    if (/\b(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)\b/.test(raw)) return "video";
    if (/\b(jpg|jpeg|png|gif|webp|bmp|svg)\b/.test(raw)) return "image";
    return "";
  };

  const inferStoryMediaKind = (story, url, blobType = "") => {
    if (!story) {
      const blobKind = detectStoryMediaKind(blobType);
      if (blobKind) return blobKind;
      return isStoryVideo(url) ? "video" : "";
    }
    if (story?.isVideo === true) return "video";
    if (story?.isVideo === false) return "image";
    const candidates = [
      story?.mediaType,
      story?.contentType,
      story?.mimeType,
      story?.fileType,
      story?.type,
      story?.mediaKind,
      story?.media?.type,
      story?.media?.contentType
    ];
    for (const candidate of candidates) {
      const kind = detectStoryMediaKind(candidate);
      if (kind) return kind;
    }
    const blobKind = detectStoryMediaKind(blobType);
    if (blobKind) return blobKind;
    return isStoryVideo(url) ? "video" : "";
  };

  const fetchStoryBlob = useCallback(async (url, withAuth) => {
    try {
      const headers = {};
      if (withAuth) {
        const token = getStoredToken();
        if (token) headers.Authorization = `Bearer ${String(token).trim()}`;
      }
      const res = await fetch(url, {
        method: "GET",
        headers,
        credentials: "omit",
      });
      if (!res.ok) return { ok: false, status: res.status, threw: false };
      const blob = await res.blob();
      if (!(blob instanceof Blob) || blob.size <= 0) return { ok: false, status: res.status, threw: false };
      return { ok: true, blob, status: res.status, threw: false };
    } catch (error) {
      return { ok: false, error, threw: true };
    }
  }, []);

  const loadStoryViewerCandidate = useCallback(async (startIndex = 0) => {
    const candidates = Array.isArray(storyViewerCandidatesRef.current) ? storyViewerCandidatesRef.current : [];
    if (!candidates.length) {
      setStoryViewerLoadError("Story media not available");
      setStoryViewerLoading(false);
      return false;
    }
    const story = storyViewerIndex != null ? storyViewerItems[storyViewerIndex] : null;
    setStoryViewerLoading(true);
    setStoryViewerLoadError("");
    for (let i = startIndex; i < candidates.length; i += 1) {
      const candidate = String(candidates[i] || "").trim();
      if (!candidate) continue;
      storyViewerCandidateIndexRef.current = i;
      clearStoryViewerLoadTimer();
      revokeStoryViewerBlobUrl();

      if (/^(blob:|data:)/i.test(candidate)) {
        setStoryViewerSrc(candidate);
        setStoryViewerLoading(false);
        return true;
      }

      const inferredKind = inferStoryMediaKind(story, candidate, "");
      if (inferredKind) setStoryViewerMediaKind(inferredKind);
      setStoryViewerBlobType("");

      if (/\/api\/stories\/media\//i.test(candidate)) {
        const ok = await tryBlobForStoryCandidate(i);
        if (ok) {
          setStoryViewerLoading(false);
          return true;
        }
      }

      // Prefer direct playback (enables range/streaming). Blob fallback happens later if needed.
      setStoryViewerSrc(candidate);
      return true;
    }
    setStoryViewerLoadError("Could not load this story media.");
    setStoryViewerLoading(false);
    return false;
  }, [clearStoryViewerLoadTimer, fetchStoryBlob, revokeStoryViewerBlobUrl, storyViewerItems, storyViewerIndex]);

  const tryBlobForStoryCandidate = useCallback(async (index) => {
    const candidates = Array.isArray(storyViewerCandidatesRef.current) ? storyViewerCandidatesRef.current : [];
    const candidate = String(candidates[index] || "").trim();
    if (!candidate || /^(blob:|data:)/i.test(candidate)) return false;
    if (storyViewerBlobTriedRef.current.has(candidate)) return false;
    storyViewerBlobTriedRef.current.add(candidate);
    let result = await fetchStoryBlob(candidate, false);
    if (!result.ok && (result.status === 401 || result.status === 403)) {
      result = await fetchStoryBlob(candidate, true);
    }
    if (!result.ok) return false;
    const blobType = String(result.blob?.type || "").toLowerCase();
    if (blobType.includes("text/html") || blobType.includes("application/json")) return false;
    const blobUrl = URL.createObjectURL(result.blob);
    storyViewerBlobUrlRef.current = blobUrl;
    setStoryViewerSrc(blobUrl);
    setStoryViewerBlobType(blobType);
    if (blobType.startsWith("video/")) {
      setStoryViewerMediaKind("video");
    } else if (blobType.startsWith("image/")) {
      setStoryViewerMediaKind("image");
    }
    return true;
  }, [fetchStoryBlob]);

  const handleStoryViewerMediaError = useCallback(() => {
    const candidates = Array.isArray(storyViewerCandidatesRef.current) ? storyViewerCandidatesRef.current : [];
    const currentIndex = Number(storyViewerCandidateIndexRef.current || 0);
    const nextIndex = currentIndex + 1;
    const tryNext = () => {
      if (nextIndex < candidates.length) {
        void loadStoryViewerCandidate(nextIndex);
        return;
      }
      setStoryViewerLoadError("Could not load this story media.");
      setStoryViewerLoading(false);
    };
    void tryBlobForStoryCandidate(currentIndex).then((ok) => {
      if (ok) return;
      tryNext();
    });
  }, [loadStoryViewerCandidate, tryBlobForStoryCandidate]);

  const isMyStoryGroup = useCallback(
    (group) => {
      const groupUserId = String(group?.userId || "").trim();
      if (groupUserId && myUserId && groupUserId === String(myUserId)) return true;
      const groupEmail = String(group?.email || "").trim().toLowerCase();
      if (groupEmail && myEmail && groupEmail === String(myEmail || "").trim().toLowerCase()) return true;
      return false;
    },
    [myUserId, myEmail]
  );

  const openStoryGroup = (group, idx = 0) => {
    if (!group || !Array.isArray(group.items) || group.items.length === 0) return;
    const safeIndex = Math.max(0, Math.min(Number(idx) || 0, group.items.length - 1));
    setStoryViewerMuted(true);
    setStoryViewerGroupKey(group.key || null);
    setStoryViewerItems(group.items);
    setStoryViewerIndex(safeIndex);
  };
  const getStoryGroupLabel = useCallback(
    (group) => {
      if (!group) return "Story";
      if (isMyStoryGroup(group)) return "You";
      const raw = normalizeStoryUsername(group.username || "");
      if (raw) return raw;
      return "Story";
    },
    [isMyStoryGroup]
  );
  const closeStory = () => {
    setStoryViewerIndex(null);
    setStoryViewerGroupKey(null);
    setStoryViewerItems([]);
    setStoryViewerMuted(true);
    setStoryViewerLoading(false);
    setStoryViewerLoadError("");
    setStoryViewerSrc("");
    setStoryViewerMediaKind("unknown");
    setStoryViewerBlobType("");
    clearStoryViewerLoadTimer();
    revokeStoryViewerBlobUrl();
    storyViewerBlobTriedRef.current = new Set();
  };
  const openStoryOptions = (group) => {
    if (!group || !Array.isArray(group.items) || group.items.length === 0) return;
    setStoryOptionsGroupKey(group.key || null);
    setStoryOptionsItems(group.items);
    setStoryOptionsOpen(true);
    if (!storyPlayerPausedRef.current) {
      storyOptionsPausedRef.current = true;
      pauseStoryPlayback();
    } else {
      storyOptionsPausedRef.current = false;
    }
  };
  const closeStoryOptions = () => {
    setStoryOptionsOpen(false);
    setStoryOptionsItems([]);
    setStoryOptionsGroupKey(null);
    if (storyOptionsPausedRef.current) {
      storyOptionsPausedRef.current = false;
      resumeStoryPlayback();
    }
  };

  useEffect(() => {
    if (!storyViewerGroupKey) {
      if (storyViewerItems.length) setStoryViewerItems([]);
      return;
    }
    const group = storyGroupsByKey.get(storyViewerGroupKey);
    if (!group || group.items.length === 0) {
      setStoryViewerIndex(null);
      setStoryViewerGroupKey(null);
      setStoryViewerItems([]);
      return;
    }
    const lastStoryId = activeStoryIdRef.current;
    setStoryViewerItems(group.items);
    setStoryViewerIndex((prev) => {
      if (lastStoryId) {
        const matchIndex = group.items.findIndex(
          (item) => String(getStoryIdValue(item)) === String(lastStoryId)
        );
        if (matchIndex >= 0) return matchIndex;
      }
      if (prev == null) return 0;
      if (prev >= group.items.length) return group.items.length - 1;
      return prev;
    });
  }, [storyViewerGroupKey, storyGroupsByKey]);

  useEffect(() => {
    if (storyViewerIndex == null && storyViewerGroupKey) {
      setStoryViewerGroupKey(null);
      setStoryViewerItems([]);
    }
  }, [storyViewerIndex, storyViewerGroupKey]);

  useEffect(() => {
    if (!storyOptionsOpen) return;
    if (!storyOptionsGroupKey) {
      if (storyOptionsItems.length) setStoryOptionsItems([]);
      return;
    }
    const group = storyGroupsByKey.get(storyOptionsGroupKey);
    if (!group || group.items.length === 0) {
      setStoryOptionsOpen(false);
      setStoryOptionsItems([]);
      setStoryOptionsGroupKey(null);
      return;
    }
    setStoryOptionsItems(group.items);
  }, [storyOptionsOpen, storyOptionsGroupKey, storyGroupsByKey]);

  useEffect(() => {
    if (storyViewerIndex == null || !activeStory) {
      setStoryViewerSrc("");
      setStoryViewerMuted(true);
      setStoryViewerLoading(false);
      setStoryViewerLoadError("");
      setStoryViewerMediaKind("unknown");
      setStoryViewerBlobType("");
      storyViewerCandidatesRef.current = [];
      storyViewerCandidateIndexRef.current = 0;
      clearStoryViewerLoadTimer();
      revokeStoryViewerBlobUrl();
      storyViewerBlobTriedRef.current = new Set();
      return;
    }
    const rawUrl = String(activeStory?.mediaUrl || activeStory?.url || "").trim();
    const baseCandidates = buildStoryMediaCandidates(rawUrl);
    const candidates = Array.isArray(baseCandidates) ? baseCandidates.slice() : [];
    const addFirst = (url) => {
      const value = String(url || "").trim();
      if (!value) return;
      if (candidates.includes(value)) return;
      candidates.unshift(value);
    };
    if (activeStory?.id) {
      const proxyPath = `/api/stories/media/${activeStory.id}`;
      const proxyCandidates = buildStoryMediaCandidates(proxyPath);
      const preferProxy = !/^https?:\/\//i.test(rawUrl) && !rawUrl.startsWith("//");
      const addProxy = (value) => {
        const normalized = String(value || "").trim();
        if (!normalized) return;
        if (candidates.includes(normalized)) return;
        if (preferProxy) {
          addFirst(normalized);
        } else {
          candidates.push(normalized);
        }
      };
      if (proxyCandidates.length) {
        if (preferProxy) {
          for (let i = proxyCandidates.length - 1; i >= 0; i -= 1) {
            addProxy(proxyCandidates[i]);
          }
        } else {
          proxyCandidates.forEach((item) => addProxy(item));
        }
      } else {
        addProxy(toApiUrl(proxyPath));
        if (typeof window !== "undefined") addProxy(`${window.location.origin}${proxyPath}`);
      }
    }
    storyViewerCandidatesRef.current = candidates;
    storyViewerCandidateIndexRef.current = 0;
    storyViewerBlobTriedRef.current = new Set();
    setStoryViewerMuted(true);
    setStoryViewerLoading(false);
    setStoryViewerLoadError(candidates.length ? "" : "Story media not available");
    const inferredKind = inferStoryMediaKind(activeStory, rawUrl, "");
    setStoryViewerMediaKind(inferredKind || "unknown");
    setStoryViewerBlobType("");
    clearStoryViewerLoadTimer();
    revokeStoryViewerBlobUrl();
    setStoryViewerSrc("");
    void loadStoryViewerCandidate(0);
  }, [
    activeStory,
    buildStoryMediaCandidates,
    clearStoryViewerLoadTimer,
    revokeStoryViewerBlobUrl,
    loadStoryViewerCandidate,
    storyViewerIndex
  ]);

  useEffect(() => {
    return () => {
      clearStoryViewerLoadTimer();
      revokeStoryViewerBlobUrl();
    };
  }, [clearStoryViewerLoadTimer, revokeStoryViewerBlobUrl]);

  useEffect(() => {
    if (storyViewerIndex == null || !activeStory) return;
    const mediaUrl = storyViewerSrc || resolveStoryMediaUrl(activeStory?.mediaUrl || activeStory?.url || "");
    const inferredKind =
      storyViewerMediaKind === "unknown"
        ? inferStoryMediaKind(activeStory, mediaUrl, storyViewerBlobType)
        : storyViewerMediaKind;
    if (inferredKind !== "video") return;
    clearStoryViewerLoadTimer();
    setStoryViewerLoading(true);
    storyViewerLoadTimeoutRef.current = setTimeout(() => {
      const videoEl = storyViewerVideoRef.current;
      if (videoEl && videoEl.readyState >= 2 && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        setStoryViewerLoading(false);
        return;
      }
      const currentIndex = Number(storyViewerCandidateIndexRef.current || 0);
      void tryBlobForStoryCandidate(currentIndex).then((ok) => {
        if (!ok) handleStoryViewerMediaError();
      });
    }, STORY_MEDIA_LOAD_TIMEOUT_MS);
    return () => clearStoryViewerLoadTimer();
  }, [
    storyViewerSrc,
    storyViewerIndex,
    activeStory,
    storyViewerMediaKind,
    storyViewerBlobType,
    clearStoryViewerLoadTimer,
    handleStoryViewerMediaError,
    tryBlobForStoryCandidate
  ]);
  const deleteStoryItems = (targets) => {
    if (!Array.isArray(targets) || targets.length === 0) return;
    const idSet = new Set(
      targets
        .map((item) => getStoryIdValue(item))
        .filter(Boolean)
        .map((value) => String(value))
    );
    const refSet = new Set(targets);
    setStoryItems((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const next = prev.filter((item) => {
        const id = getStoryIdValue(item);
        if (id && idSet.has(String(id))) return false;
        if (refSet.has(item)) return false;
        return true;
      });
      writeStoryCache(next);
      return normalizeStoryList(next);
    });
  };
  const startStoryLongPress = (group) => () => {
    if (storyLongPressTimeoutRef.current) {
      clearTimeout(storyLongPressTimeoutRef.current);
    }
    storyLongPressTriggeredRef.current = false;
    if (!group || !Array.isArray(group.items) || group.items.length === 0) return;
    if (!isMyStoryGroup(group)) return;
    storyLongPressTimeoutRef.current = setTimeout(() => {
      storyLongPressTriggeredRef.current = true;
      openStoryOptions(group);
    }, 550);
  };
  const cancelStoryLongPress = () => {
    if (storyLongPressTimeoutRef.current) {
      clearTimeout(storyLongPressTimeoutRef.current);
      storyLongPressTimeoutRef.current = null;
    }
  };
  const handleStoryTileClick = (group) => {
    if (storyLongPressTriggeredRef.current) {
      storyLongPressTriggeredRef.current = false;
      return;
    }
    openStoryGroup(group, 0);
  };
  const goNextStory = () => {
    setStoryViewerMuted(true);
    if (storyPlayerPausedRef.current) {
      storyPlayerPausedRef.current = false;
      setStoryPlayerPaused(false);
    }
    storyPlayerLastTickRef.current = 0;
    setStoryViewerIndex((prev) => {
      if (prev == null) return null;
      const next = prev + 1;
      return next < storyViewerItems.length ? next : null;
    });
  };
  const goPrevStory = () => {
    setStoryViewerMuted(true);
    if (storyPlayerPausedRef.current) {
      storyPlayerPausedRef.current = false;
      setStoryPlayerPaused(false);
    }
    storyPlayerLastTickRef.current = 0;
    setStoryViewerIndex((prev) => {
      if (prev == null) return null;
      const next = prev - 1;
      return next >= 0 ? next : prev;
    });
  };

  const resolvedStoryMediaUrl =
    storyViewerIndex != null && activeStory
      ? storyViewerSrc || resolveStoryMediaUrl(activeStory?.mediaUrl || activeStory?.url || "")
      : "";
  const resolvedStoryMediaKind =
    storyViewerMediaKind === "unknown"
      ? inferStoryMediaKind(activeStory, resolvedStoryMediaUrl, storyViewerBlobType)
      : storyViewerMediaKind;
  const resolvedStoryIsVideo =
    resolvedStoryMediaKind === "video" || isStoryVideo(resolvedStoryMediaUrl);

  const stopStoryProgress = useCallback(() => {
    if (storyPlayerRafRef.current) {
      cancelAnimationFrame(storyPlayerRafRef.current);
      storyPlayerRafRef.current = null;
    }
  }, []);

  const resetStoryProgress = useCallback(
    (durationMs = STORY_IMAGE_DURATION_MS) => {
      stopStoryProgress();
      storyPlayerDurationRef.current = durationMs;
      storyPlayerElapsedRef.current = 0;
      storyPlayerLastTickRef.current = 0;
      setStoryPlayerProgress(0);
    },
    [stopStoryProgress]
  );

  const runStoryProgress = useCallback(() => {
    stopStoryProgress();
    const tick = (now) => {
      if (storyPlayerPausedRef.current) {
        storyPlayerRafRef.current = null;
        return;
      }
      if (!storyPlayerLastTickRef.current) {
        storyPlayerLastTickRef.current = now;
      }
      const delta = now - storyPlayerLastTickRef.current;
      storyPlayerLastTickRef.current = now;
      storyPlayerElapsedRef.current += Math.max(delta, 0);
      const progress = Math.min(
        1,
        storyPlayerElapsedRef.current / Math.max(storyPlayerDurationRef.current, 1)
      );
      setStoryPlayerProgress(progress);
      if (progress >= 1) {
        goNextStory();
        return;
      }
      storyPlayerRafRef.current = requestAnimationFrame(tick);
    };
    storyPlayerRafRef.current = requestAnimationFrame(tick);
  }, [goNextStory, stopStoryProgress]);

  const pauseStoryPlayback = useCallback(() => {
    if (storyPlayerPausedRef.current) return;
    storyPlayerPausedRef.current = true;
    setStoryPlayerPaused(true);
    storyPlayerLastTickRef.current = 0;
    if (storyViewerVideoRef.current) {
      storyViewerVideoRef.current.pause?.();
    }
    stopStoryProgress();
  }, [stopStoryProgress]);

  const resumeStoryPlayback = useCallback(() => {
    if (!storyPlayerPausedRef.current) return;
    storyPlayerPausedRef.current = false;
    setStoryPlayerPaused(false);
    storyPlayerLastTickRef.current = 0;
    if (resolvedStoryIsVideo && storyViewerVideoRef.current) {
      storyViewerVideoRef.current.play?.().catch(() => {});
      return;
    }
    runStoryProgress();
  }, [resolvedStoryIsVideo, runStoryProgress]);

  const handleStoryVideoLoaded = useCallback((event) => {
    const duration = Number(event?.currentTarget?.duration || 0);
    if (Number.isFinite(duration) && duration > 0) {
      storyPlayerDurationRef.current = duration * 1000;
    }
    setStoryPlayerProgress(0);
    if (!storyPlayerPausedRef.current) {
      event.currentTarget.play?.().catch(() => {});
    }
  }, []);

  const handleStoryVideoTimeUpdate = useCallback((event) => {
    const duration = Number(event?.currentTarget?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const current = Number(event?.currentTarget?.currentTime || 0);
    const progress = Math.min(1, Math.max(0, current / duration));
    setStoryPlayerProgress(progress);
  }, []);

  const handleStoryVideoEnded = useCallback(() => {
    goNextStory();
  }, [goNextStory]);

  const storyKeyFor = (story, index) => {
    const id = story?.id ?? story?.storyId ?? story?.postId ?? story?.mediaId;
    if (id != null && id !== "") return `id:${id}`;
    return `idx:${index}`;
  };

  const applyStoryStats = (storyId, patch) => {
    if (!storyId || !patch) return;
    setStoryItems((prev) =>
      prev.map((item) => {
        const id = item?.id ?? item?.storyId ?? item?.postId ?? item?.mediaId;
        if (String(id) !== String(storyId)) return item;
        return { ...item, ...patch };
      })
    );
  };

  useEffect(() => {
    activeStoryIdRef.current = getStoryIdValue(activeStory);
  }, [activeStory]);

  useEffect(() => {
    if (storyViewerIndex == null || !activeStory) return;
    const storyId = activeStory?.id;
    const storyKey = storyKeyFor(activeStory, storyViewerIndex);
    const likedFromServer = Boolean(activeStory?.likedByMe);
    setStoryReactions((prev) => {
      const current = prev?.[storyKey] || {};
      if (current.liked === likedFromServer) return prev;
      return { ...prev, [storyKey]: { ...current, liked: likedFromServer } };
    });
    if (!storyId) return;
    const idText = String(storyId);
    if (viewedStoryIdsRef.current.has(idText)) return;
    viewedStoryIdsRef.current.add(idText);
    api
      .post(`/api/stories/${storyId}/view`)
      .then((res) => {
        if (res?.data && typeof res.data === "object") {
          applyStoryStats(storyId, {
            likeCount: res.data.likeCount,
            commentCount: res.data.commentCount,
            viewCount: res.data.viewCount,
            likedByMe: Boolean(res.data.liked)
          });
        }
      })
      .catch(() => {});
  }, [storyViewerIndex, activeStory]);

  useEffect(() => {
    storyPlayerPausedRef.current = storyPlayerPaused;
  }, [storyPlayerPaused]);

  useEffect(() => {
    if (storyViewerIndex == null || !activeStory) {
      stopStoryProgress();
      storyPlayerPausedRef.current = false;
      setStoryPlayerPaused(false);
      setStoryPlayerProgress(0);
      storyPlayerElapsedRef.current = 0;
      return;
    }

    if (resolvedStoryIsVideo) {
      stopStoryProgress();
      storyPlayerElapsedRef.current = 0;
      setStoryPlayerProgress(0);
      return;
    }

    if (!resolvedStoryMediaUrl || storyViewerLoading || storyViewerLoadError) {
      stopStoryProgress();
      return;
    }

    resetStoryProgress(STORY_IMAGE_DURATION_MS);
    runStoryProgress();

    return () => stopStoryProgress();
  }, [
    storyViewerIndex,
    activeStory,
    resolvedStoryIsVideo,
    resolvedStoryMediaUrl,
    storyViewerLoading,
    storyViewerLoadError,
    resetStoryProgress,
    runStoryProgress,
    stopStoryProgress
  ]);

  const peerLatestMessageTs = activeMessages
    .filter((m) => !m?.mine)
    .reduce((max, m) => {
      const t = toEpochMs(m?.createdAt || 0);
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
  const peerLatestCallTs = activeCallHistory.reduce((max, c) => {
    const t = toEpochMs(c?.at || 0);
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const peerLatestProfileTs = clampFutureTimestamp(toEpochMs(activeContact?.lastActiveAt || 0));
  const headerPresenceText = getContactPresence(activeContact).text;
  const tsModeLabel = ASSUME_UTC_TS ? "UTC" : "Local";

  const sendTextPayload = async (text, options = {}) => {
    const cleanText = String(text || "").trim();
    if (!cleanText || !activeContactId) return false;
    if (activeContactId === myUserId) {
      setError("Cannot send message to your own account.");
      return false;
    }

    const {
      clearComposer = false,
      previewText = cleanText,
      onSent = null
    } = options;
    const useFallback = chatFallbackMode || isChatApiDisabled();

    const emitLocalPacket = (payload) => {
      if (!payload || !myUserId || !activeContactId) return;
      const packet = {
        kind: "chat-message",
        fromTab: tabIdRef.current,
        at: new Date().toISOString(),
        payload
      };
      try {
        localStorage.setItem(CHAT_MESSAGE_LOCAL_KEY, JSON.stringify(packet));
      } catch {
        // ignore storage write failures
      }
      try {
        messageChannelRef.current?.postMessage(packet);
      } catch {
        // ignore cross-tab channel failures
      }
    };

    if (clearComposer) {
      if (isSpeechTyping) stopSpeechTyping();
      setInputText("");
      setShowEmojiTray(false);
      setTimeout(() => composerInputRef.current?.focus(), 0);
    }

    try {
      if (useFallback) {
        const mine = normalizeMessage({
          id: Date.now(),
          senderId: Number(myUserId) || null,
          receiverId: Number(activeContactId) || null,
          text: cleanText,
          speechTyped: false,
          createdAt: new Date().toISOString(),
          mine: true
        }, activeContactId);
        const all = readLocalChat();
        const key = localThreadKey(myUserId, activeContactId);
        const nextList = [...(Array.isArray(all[key]) ? all[key] : []), mine];
        all[key] = nextList;
        writeLocalChat(all);
        setMessagesByContact((prev) => ({ ...prev, [activeContactId]: nextList }));
        setContacts((prev) => prev.map((c) => (c.id === activeContactId ? { ...c, lastMessage: previewText } : c)));
        setError("Server chat unavailable on this backend. Using local chat mode.");
        emitLocalPacket({
          id: mine.id,
          senderId: mine.senderId || Number(myUserId) || myUserId,
          receiverId: mine.receiverId || Number(activeContactId) || activeContactId,
          text: cleanText,
          createdAt: mine.createdAt || new Date().toISOString(),
          senderEmail: myEmail || ""
        });
        shouldStickToBottomRef.current = true;
        setTimeout(() => scrollThreadToBottom("smooth"), 50);
        if (typeof onSent === "function") onSent();
        return true;
      }

      const res = await requestChatMutation({
        method: "POST",
        endpoints: [
          `/api/chat/${activeContactId}/send`,
          `/chat/${activeContactId}/send`
        ],
        data: { text: cleanText }
      });
      const sent = normalizeMessage(
        {
          ...(res?.data || {}),
          text: cleanText,
          speechTyped: false,
          mine: true,
          senderId: myUserId,
          receiverId: activeContactId,
          createdAt: (res?.data || {})?.createdAt || new Date().toISOString()
        },
        activeContactId
      );
      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), sent]
      }));
      setContacts((prev) => prev.map((c) => (c.id === activeContactId ? { ...c, lastMessage: previewText } : c)));
      emitLocalPacket({
        id: sent.id,
        senderId: sent.senderId || Number(myUserId) || myUserId,
        receiverId: sent.receiverId || Number(activeContactId) || activeContactId,
        text: cleanText,
        createdAt: sent.createdAt || new Date().toISOString(),
        senderEmail: myEmail || ""
      });
      shouldStickToBottomRef.current = true;
      setTimeout(() => scrollThreadToBottom("smooth"), 50);
      if (typeof onSent === "function") onSent();
      return true;
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 404) {
        disableChatApiTemporarily();
        setChatFallbackMode(true);
        setError("Server chat unavailable on this backend. Using local chat mode.");
      } else if (status === 401 || status === 403) {
        setChatFallbackMode(false);
        setError("Session expired for this server. Please login again.");
        clearAuthStorage();
        navigate("/login", { replace: true });
      } else {
        setError("Message failed to send");
      }
      return false;
    }
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text) return;
    const withReply = replyDraft?.id
      ? `${MESSAGE_REPLY_TOKEN}${JSON.stringify({
        id: replyDraft.id,
        senderName: replyDraft.senderName || "",
        senderId: replyDraft.senderId || "",
        preview: trimReplyPreview(replyDraft.preview || "")
      })}\n${text}`
      : text;
    await sendTextPayload(withReply, {
      clearComposer: true,
      previewText: text,
      onSent: () => setReplyDraft(null)
    });
  };

  const sendSignAssistMessage = async ({ text = null, source = "video-call", clearAfter = true, silent = false } = {}) => {
    const plainText = String(text ?? signAssistText ?? "").trim();
    if (!plainText) {
      if (!silent) setSignAssistStatus("Type translated sign text first.");
      return;
    }
    if (signAssistSendingRef.current) return;
    signAssistSendingRef.current = true;
    const payloadText = encodeSignAssistText(plainText, signAssistVoiceGender, source);
    if (!payloadText) {
      if (!silent) setSignAssistStatus("Unable to prepare sign message.");
      signAssistSendingRef.current = false;
      return;
    }

    const ok = await sendTextPayload(payloadText, {
      previewText: `Sign: ${plainText}`,
      onSent: () => {
        if (!silent) setSignAssistStatus("Sign message sent.");
        if (clearAfter) setSignAssistText("");
      }
    });

    if (!ok) {
      if (!silent) setSignAssistStatus("Failed to send sign message.");
    }
    signAssistSendingRef.current = false;
  };

  const ensureSequenceModel = useCallback(async () => {
    const modelUrl = String(import.meta.env.VITE_SIGN_SEQUENCE_MODEL_URL || "").trim();
    if (!modelUrl) return null;
    if (signSequenceModelRef.current) return signSequenceModelRef.current;
    if (!signSequenceModelLoadingRef.current) {
      signSequenceModelLoadingRef.current = (async () => {
        await loadExternalScript(modelUrl, "sign-sequence-model");
        const model =
          window?.SocialSeaSignSequenceModel ||
          window?.SignSequenceModel ||
          window?.signSequenceModel ||
          null;
        if (model?.load && !model._loaded) {
          await model.load();
          model._loaded = true;
        }
        return model;
      })();
    }
    signSequenceModelRef.current = await signSequenceModelLoadingRef.current;
    return signSequenceModelRef.current;
  }, []);

  const pushSequenceFrame = (landmarks) => {
    if (!Array.isArray(landmarks) || !landmarks.length) return;
    const frames = signSequenceFramesRef.current;
    frames.push({ landmarks, at: Date.now() });
    if (frames.length > SIGN_SEQUENCE_FRAME_WINDOW) {
      frames.splice(0, frames.length - SIGN_SEQUENCE_FRAME_WINDOW);
    }
  };

  const detectSequenceSignText = useCallback(async () => {
    try {
      const model = await ensureSequenceModel();
      if (!model) return "";
      const frames = signSequenceFramesRef.current;
      if (frames.length < Math.min(8, SIGN_SEQUENCE_FRAME_WINDOW)) return "";
      const payload = frames.map((f) => f.landmarks);
      if (typeof model.predict === "function") {
        const result = await model.predict(payload);
        return String(result?.text || result || "").trim();
      }
      if (typeof model.infer === "function") {
        const result = await model.infer(payload);
        return String(result?.text || result || "").trim();
      }
      return "";
    } catch {
      return "";
    }
  }, [ensureSequenceModel]);

  const detectLocalSignText = useCallback(async (videoEl) => {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return "";
    try {
      await loadExternalScript(SIGN_LOCAL_TF_SCRIPT, "tfjs-chat-sign");
      await loadExternalScript(SIGN_LOCAL_HANDPOSE_SCRIPT, "handpose-chat-sign");
      if (!window?.handpose) return "";

      if (!signLocalModelRef.current) {
        if (!signLocalModelLoadingRef.current) {
          signLocalModelLoadingRef.current = window.handpose.load();
        }
        signLocalModelRef.current = await signLocalModelLoadingRef.current;
      }

      const predictions = await signLocalModelRef.current.estimateHands(videoEl, true);
      if (!Array.isArray(predictions) || predictions.length === 0) return "";
      const landmarks = predictions[0]?.landmarks || [];
      pushSequenceFrame(landmarks);
      const sequenceText = await detectSequenceSignText();
      if (sequenceText) return sequenceText;
      return inferLocalSignText(landmarks);
    } catch {
      return "";
    }
  }, [detectSequenceSignText]);

  const resetSignLiveBuffer = () => {
    const buffer = signLiveBufferRef.current;
    if (buffer.flushTimer) {
      clearTimeout(buffer.flushTimer);
      buffer.flushTimer = null;
    }
    buffer.parts = [];
    buffer.lastDetected = "";
    buffer.lastAt = 0;
    buffer.lastSent = "";
    buffer.lastContinuousAt = 0;
    buffer.lastContinuousText = "";
    signLastDetectedAtRef.current = 0;
    signLastDetectedTextRef.current = "";
    signSequenceFramesRef.current = [];
  };

  const flushSignLiveBuffer = (reason = "idle") => {
    const buffer = signLiveBufferRef.current;
    if (!buffer.parts.length) return;
    const message = buffer.parts.join(" ").replace(/\s+/g, " ").trim();
    if (!message) return;
    if (buffer.lastSent && buffer.lastSent === message) return;
    buffer.lastSent = message;
    buffer.parts = [];
    setSignAssistText("");
    setSignAssistStatus(
      reason === "idle" ? "Sending sign message..." : "Sending sign message..."
    );
    void sendSignAssistMessage({ text: message, source: "live", clearAfter: true, silent: true });
  };

  const pushSignLiveBuffer = (detected) => {
    const clean = String(detected || "").trim();
    if (!clean) return;
    const buffer = signLiveBufferRef.current;
    if (buffer.lastDetected === clean) return;
    buffer.lastDetected = clean;
    buffer.lastAt = Date.now();
    if (!buffer.parts.length || buffer.parts[buffer.parts.length - 1] !== clean) {
      buffer.parts.push(clean);
    }
    let text = buffer.parts.join(" ").replace(/\s+/g, " ").trim();
    while (text.length > SIGN_LIVE_MAX_BUFFER_CHARS && buffer.parts.length > 1) {
      buffer.parts.shift();
      text = buffer.parts.join(" ").replace(/\s+/g, " ").trim();
    }
    setSignAssistText(text);
    setSignAssistStatus("Live sign detected. Auto-sending when you pause.");
    if (buffer.flushTimer) clearTimeout(buffer.flushTimer);
    buffer.flushTimer = setTimeout(() => {
      buffer.flushTimer = null;
      flushSignLiveBuffer("idle");
    }, SIGN_LIVE_DEBOUNCE_MS);
  };

  const handleContinuousSign = (detected) => {
    const clean = String(detected || "").trim();
    if (!clean) return;
    const buffer = signLiveBufferRef.current;
    const now = Date.now();
    if (buffer.lastContinuousText === clean && now - buffer.lastContinuousAt < SIGN_LIVE_CONTINUOUS_COOLDOWN_MS) {
      return;
    }
    buffer.lastContinuousText = clean;
    buffer.lastContinuousAt = now;
    setSignAssistText(clean);
    setSignAssistStatus("Sending sign message...");
    void sendSignAssistMessage({ text: clean, source: "live-continuous", clearAfter: true, silent: true });
  };

  useEffect(() => {
    if (!signAssistEnabled || callState.mode !== "video" || callState.phase === "idle") {
      if (signLivePollTimerRef.current) {
        clearInterval(signLivePollTimerRef.current);
        signLivePollTimerRef.current = null;
      }
      resetSignLiveBuffer();
      return;
    }

    signLastDetectedTextRef.current = "";
    signLastDetectedAtRef.current = 0;
    setSignAssistStatus((prev) => prev || "Sign Assist is live. Show your hand to camera.");

    const tick = async () => {
      if (signAssistBusy) return;
      const video = localVideoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return;
      const detected = String(await detectLocalSignText(video)).trim();
      if (!detected) return;
      const now = Date.now();
      if (
        detected === signLastDetectedTextRef.current &&
        now - signLastDetectedAtRef.current < SIGN_LIVE_CONTINUOUS_COOLDOWN_MS
      ) {
        return;
      }
      signLastDetectedTextRef.current = detected;
      signLastDetectedAtRef.current = now;
      if (signAssistContinuousMode) {
        handleContinuousSign(detected);
      } else {
        pushSignLiveBuffer(detected);
      }
    };

    void tick();
    signLivePollTimerRef.current = setInterval(() => {
      void tick();
    }, 900);

    return () => {
      if (signLivePollTimerRef.current) {
        clearInterval(signLivePollTimerRef.current);
        signLivePollTimerRef.current = null;
      }
      resetSignLiveBuffer();
    };
  }, [signAssistEnabled, callState.mode, callState.phase, signAssistBusy, detectLocalSignText]);

  const captureSignAssistFromVideo = async () => {
    const video = localVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setSignAssistStatus("Camera feed not ready. Keep camera on and try again.");
      return;
    }

    setSignAssistBusy(true);
    setSignAssistStatus("Capturing sign frame...");

    try {
      const canvas = document.createElement("canvas");
      const maxW = 640;
      const scale = Math.min(1, maxW / video.videoWidth);
      canvas.width = Math.max(160, Math.floor(video.videoWidth * scale));
      canvas.height = Math.max(120, Math.floor(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = img?.data || [];
      let sum = 0;
      for (let i = 0; i < data.length; i += 16) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const samples = Math.max(1, Math.floor(data.length / 16));
      const avg = sum / samples;
      const draft =
        avg < 45
          ? "Please turn on more light. I am trying to sign."
          : avg < 85
            ? "I am signing now. Please watch and confirm."
            : "I am signing a message. Please review and respond.";

      if (signApiUnavailableRef.current) {
        const localDetected = await detectLocalSignText(video);
        if (localDetected) {
          setSignAssistText(localDetected);
          setSignAssistStatus("Sign detected locally. Review and send.");
        } else {
          setSignAssistText((prev) => String(prev || "").trim() || draft);
          setSignAssistStatus("Sign draft ready. Edit and send.");
        }
        return;
      }

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Frame capture failed"));
        }, "image/jpeg", 0.9);
      });

      const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
      const envBase = String(getApiBaseUrl() || "").replace(/\/+$/, "");
      const baseCandidates = [
        defaultBase,
        envBase,
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://socialsea.co.in"
      ].filter((v, i, arr) => v && arr.indexOf(v) === i);

      const endpointCandidates = [
        "/api/accessibility/sign-to-text",
        "/api/sign-language/translate",
        "/api/sign-to-text"
      ];

      let translated = "";
      let success = false;
      let onlyMissingRoutes = true;

      for (const base of baseCandidates) {
        if (success) break;
        for (const endpoint of endpointCandidates) {
          const form = new FormData();
          form.append("frame", blob, "sign-frame.jpg");
          form.append("lang", speechLang || "en-IN");
          form.append("contactId", String(activeContactId || ""));
          try {
            const res = await api.post(endpoint, form, {
              baseURL: base,
              headers: { "Content-Type": "multipart/form-data" },
              suppressAuthRedirect: true
            });
            translated = String(
              res?.data?.text ||
              res?.data?.translation ||
              res?.data?.message ||
              ""
            ).trim();
            success = true;
            signApiUnavailableRef.current = false;
            break;
          } catch (err) {
            const status = Number(err?.response?.status || 0);
            if (!(status === 404 || status === 405 || status === 0)) {
              onlyMissingRoutes = false;
            }
          }
        }
      }

      if (translated) {
        setSignAssistText(translated);
        setSignAssistStatus("Sign translated. Review and send.");
      } else {
        if (success) {
          setSignAssistStatus("No text detected. Try better lighting/hand visibility.");
        } else {
          const localDetected = await detectLocalSignText(video);
          if (localDetected) {
            setSignAssistText(localDetected);
            setSignAssistStatus("Sign detected locally. Review and send.");
            return;
          }
          setSignAssistText((prev) => String(prev || "").trim() || draft);
          if (onlyMissingRoutes) {
            signApiUnavailableRef.current = true;
            setSignAssistStatus("Sign draft ready. Edit and send.");
          } else {
            setSignAssistStatus("Sign draft ready. Edit and send.");
          }
        }
      }
    } catch {
      setSignAssistStatus("Capture complete. Edit the draft and send.");
    } finally {
      setSignAssistBusy(false);
    }
  };

  const speakSignAssistText = (text, voiceGender = "female") => {
    const cleanText = String(text || "").trim();
    if (!cleanText || !("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(cleanText);
    const targetLang = normalizeLangCode(speechLang || navigator.language || "en-IN");
    const targetBase = targetLang.split("-")[0];
    utter.lang = targetLang;

    const voices = synth.getVoices ? synth.getVoices() : [];
    const gender = String(voiceGender || "neutral").toLowerCase();
    const femaleHints = ["female", "woman", "zira", "susan", "samantha", "heera", "kalpana"];
    const maleHints = ["male", "man", "david", "mark", "alex", "ravi", "hemant"];
    const hints = gender === "female" ? femaleHints : gender === "male" ? maleHints : [];
    const exactLangVoices = voices.filter((v) => normalizeLangCode(v?.lang).toLowerCase() === targetLang.toLowerCase());
    const baseLangVoices = voices.filter((v) => normalizeLangCode(v?.lang).toLowerCase().startsWith(`${targetBase.toLowerCase()}-`));
    const langVoices = exactLangVoices.length ? exactLangVoices : (baseLangVoices.length ? baseLangVoices : voices);

    let picked = null;
    if (hints.length) {
      picked = langVoices.find((v) => hints.some((h) => String(v?.name || "").toLowerCase().includes(h)));
    }
    if (!picked) {
      picked = langVoices[0] || voices[0] || null;
    }
    if (picked) utter.voice = picked;

    try {
      synth.speak(utter);
    } catch {
      // ignore speech failures
    }
  };

  const setAutoSpeakEnabled = (nextValue) => {
    const next = Boolean(nextValue);
    setSignAssistAutoSpeak(next);
    const enabledAt = next ? Date.now() : 0;
    autoSpeakEnabledAtRef.current = enabledAt;
    try {
      localStorage.setItem(CHAT_AUTOSPEAK_KEY, JSON.stringify({
        enabled: next,
        enabledAt
      }));
    } catch {
      // ignore storage failures
    }
    if (next) {
      const contactKey = String(activeContactId || "");
      if (contactKey) {
        autoSpeakBootstrappedByContactRef.current[contactKey] = false;
      }
      spokenSignMessageIdsRef.current = new Set();
    }
    if (!next && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore speech cancel failures
      }
    }
  };

  const setContinuousModeEnabled = (nextValue) => {
    const next = Boolean(nextValue);
    setSignAssistContinuousMode(next);
    resetSignLiveBuffer();
  };

  useEffect(() => {
    if (!signAssistAutoSpeak || !activeContactId) return;
    const contactKey = String(activeContactId || "");
    const visibleIds = getVisibleThreadMessageIds();
    const enabledAt = autoSpeakEnabledAtRef.current || 0;
    const shouldSpeakMessage = (msg) => {
      const createdAtMs = toEpochMs(msg?.createdAt || 0);
      if (enabledAt && createdAtMs && createdAtMs < enabledAt) return false;
      return true;
    };
    if (!autoSpeakBootstrappedByContactRef.current[contactKey]) {
      const visibleQueue = [];
      activeMessages.forEach((msg) => {
        if (!msg || msg.mine) return;
        const msgId = String(msg?.id || "");
        const payload = getSpeakableIncomingPayload(msg);
        if (!msgId || !payload?.text) return;
        if (!shouldSpeakMessage(msg)) return;
        if (visibleIds.has(msgId)) {
          visibleQueue.push({ msgId, payload });
        }
      });
      autoSpeakBootstrappedByContactRef.current[contactKey] = true;
      visibleQueue.forEach(({ msgId, payload }) => {
        if (spokenSignMessageIdsRef.current.has(msgId)) return;
        spokenSignMessageIdsRef.current.add(msgId);
        speakSignAssistText(payload.text, payload.voiceGender || "female");
      });
      return;
    }

    activeMessages.forEach((msg) => {
      if (!msg || msg.mine) return;
      const msgId = String(msg?.id || "");
      if (!msgId || spokenSignMessageIdsRef.current.has(msgId)) return;
      const payload = getSpeakableIncomingPayload(msg);
      if (!payload?.text) return;
      if (!shouldSpeakMessage(msg)) return;

      spokenSignMessageIdsRef.current.add(msgId);
      if (visibleIds.has(msgId)) {
        speakSignAssistText(payload.text, payload.voiceGender || "female");
      }
    });
  }, [activeMessages, activeContactId, signAssistAutoSpeak, speechLang, translatorEnabled, translatedIncomingById, speechVoiceGender]);

  useEffect(() => {
    const contactKey = String(activeContactId || "");
    if (contactKey) {
      autoSpeakBootstrappedByContactRef.current[contactKey] = false;
      spokenSignMessageIdsRef.current = new Set();
    }
  }, [activeContactId]);

  const processVisibleAutoSpeak = () => {
    if (!signAssistAutoSpeak || !activeContactId) return;
    const visibleIds = getVisibleThreadMessageIds();
    if (!visibleIds.size) return;
    const enabledAt = autoSpeakEnabledAtRef.current || 0;
    activeMessages.forEach((msg) => {
      if (!msg || msg.mine) return;
      const msgId = String(msg?.id || "");
      if (!msgId || spokenSignMessageIdsRef.current.has(msgId)) return;
      if (!visibleIds.has(msgId)) return;
      const createdAtMs = toEpochMs(msg?.createdAt || 0);
      if (enabledAt && createdAtMs && createdAtMs < enabledAt) return;
      const payload = getSpeakableIncomingPayload(msg);
      if (!payload?.text) return;
      spokenSignMessageIdsRef.current.add(msgId);
      speakSignAssistText(payload.text, payload.voiceGender || "female");
    });
  };

  const goToProfile = (contact) => {
    if (!contact) return;
    navigate(buildProfilePath(contact));
  };

  const blockActiveContact = () => {
    if (!activeContact?.id) return;
    const payload = {
      id: Number(activeContact.id) || activeContact.id,
      name: activeContact.name || "User",
      email: activeContact.email || "",
      profilePic: activeContact.profilePic || ""
    };
    setBlockedUsers((prev) => {
      if (prev.some((user) => String(user?.id || "") === String(payload.id))) return prev;
      return [payload, ...prev];
    });
    setContacts((prev) => prev.filter((contact) => String(contact?.id || "") !== String(activeContact.id)));
    setMessagesByContact((prev) => {
      const next = { ...prev };
      delete next[String(activeContact.id)];
      return next;
    });
    setShowHeaderMenu(false);
    setActiveContactId("");
    navigate("/chat");
    setError(`${payload.name} blocked. Manage blocked users in Settings.`);
  };

  const addComposerText = (text) => {
    const value = String(text || "");
    if (!value) return;
    setInputText((prev) => `${prev}${prev ? " " : ""}${value}`.trim());
    setTimeout(() => composerInputRef.current?.focus(), 0);
  };

  const toggleEmojiTray = () => setShowEmojiTray((prev) => !prev);

  const isFavoritePick = (type, value) =>
    favoritePicks.some((item) => item?.type === type && item?.value === value);

  const toggleFavoritePick = (item) => {
    if (!item?.type || !item?.value) return;
    setFavoritePicks((prev) => {
      const exists = prev.some((x) => x?.type === item.type && x?.value === item.value);
      if (exists) {
        return prev.filter((x) => !(x?.type === item.type && x?.value === item.value));
      }
      return [item, ...prev].slice(0, 40);
    });
  };

  const onEmojiPick = (emoji) => {
    addComposerText(emoji);
    setShowEmojiTray(false);
  };

  const onStickerPick = (stickerText) => {
    addComposerText(stickerText);
    setShowEmojiTray(false);
  };

  const onCustomStickerPick = async (sticker) => {
    if (!sticker?.dataUrl) return;
    try {
      const file = await dataUrlToFile(sticker.dataUrl, sticker.name || `sticker_${Date.now()}.png`);
      await sendMediaFile(file);
      setShowEmojiTray(false);
    } catch {
      setError("Failed to send sticker image");
    }
  };

  const removeCustomSticker = (stickerId) => {
    setCustomStickers((prev) => prev.filter((item) => item?.id !== stickerId));
    setFavoritePicks((prev) => prev.filter((fav) => !(fav?.type === "customSticker" && fav?.value === stickerId)));
  };

  const onStickerImagePicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const type = String(file.type || "").toLowerCase();
    if (!type.startsWith("image/")) {
      setError("Please choose an image file for sticker");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) return;
      const sticker = {
        id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: (file.name || "Sticker").replace(/\.[^/.]+$/, "").slice(0, 30),
        dataUrl
      };
      setCustomStickers((prev) => [sticker, ...prev].slice(0, 40));
      setPickerTab("sticker");
    } catch {
      setError("Could not create sticker from image");
    }
  };

  const openStickerPicker = () => stickerInputRef.current?.click();

  const favoriteItemsForTray = useMemo(() => {
    const stickerMap = customStickers.reduce((acc, st) => ({ ...acc, [st.id]: st }), {});
    return favoritePicks
      .map((item) => {
        if (item?.type !== "customSticker") return item;
        const sticker = stickerMap[item?.value];
        if (!sticker) return null;
        return { ...item, sticker };
      })
      .filter(Boolean);
  }, [favoritePicks, customStickers]);

  const sendMediaFile = async (file, options = {}) => {
    if (!file || !activeContactId) return;
    const type = String(file.type || "").toLowerCase();
    const forcedKind = String(options?.forcedKind || "").toLowerCase();
    const kind = forcedKind || (
      type.startsWith("image/")
        ? "image"
        : type.startsWith("video/")
          ? "video"
          : type.startsWith("audio/")
            ? "audio"
            : "file"
    );
    const previewText =
      String(options?.previewText || "").trim() ||
      (kind === "image"
        ? "[Image]"
        : kind === "video"
          ? "[Video]"
          : kind === "audio"
            ? "Voice message"
            : "[File]");
    const localTempId = `local_media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const localPreview = normalizeMessage({
      id: localTempId,
      senderId: Number(myUserId) || null,
      receiverId: Number(activeContactId) || null,
      text: previewText,
      mediaUrl: URL.createObjectURL(file),
      mediaType: kind,
      fileName: file.name || "",
      createdAt: new Date().toISOString(),
      mine: true
    }, activeContactId);

    setMessagesByContact((prev) => ({
      ...prev,
      [activeContactId]: [...(prev[activeContactId] || []), localPreview]
    }));
    setContacts((prev) => prev.map((c) => (c.id === activeContactId ? { ...c, lastMessage: localPreview.text } : c)));
    shouldStickToBottomRef.current = true;
    setTimeout(() => scrollThreadToBottom("smooth"), 50);

    if (chatFallbackMode || isChatApiDisabled()) {
      setChatFallbackMode(true);
      return;
    }

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await requestChatMutation({
        method: "POST",
        endpoints: [
          `/api/chat/${activeContactId}/send-media`,
          `/chat/${activeContactId}/send-media`,
          `/api/chat/${activeContactId}/sendMedia`,
          `/chat/${activeContactId}/sendMedia`
        ],
        data: form,
        headers: { "Content-Type": "multipart/form-data" }
      });
      const sent = normalizeMessage({ ...(res?.data || {}), mine: true }, activeContactId);
      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: (prev[activeContactId] || []).map((m) => String(m?.id) === localTempId ? sent : m)
      }));
      setContacts((prev) =>
        prev.map((c) => (
          c.id === activeContactId
            ? { ...c, lastMessage: sent.text || (kind === "audio" ? "Voice message" : "[File]") }
            : c
        ))
      );
      shouldStickToBottomRef.current = true;
      setTimeout(() => scrollThreadToBottom("smooth"), 50);
    } catch (err) {
      if (err?.response?.status === 404) {
        disableChatApiTemporarily();
        setChatFallbackMode(true);
      }
      setError("Media upload failed on server. Preview kept locally. Restart backend with /send-media support.");
    }
  };

  const onFilePicked = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    sendMediaFile(file);
    event.target.value = "";
  };

  const openAttachPicker = () => attachInputRef.current?.click();
  const openCameraPicker = () => cameraInputRef.current?.click();

  const normalizeSpeechChunk = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const mergeSpeechChunks = (baseText, nextText) => {
    const base = normalizeSpeechChunk(baseText);
    const next = normalizeSpeechChunk(nextText);
    if (!next) return base;
    if (!base) return next;

    const baseLower = base.toLowerCase();
    const nextLower = next.toLowerCase();
    if (baseLower === nextLower || baseLower.includes(nextLower)) return base;
    if (nextLower.includes(baseLower)) return next;

    const maxOverlap = Math.min(base.length, next.length);
    for (let size = maxOverlap; size > 0; size -= 1) {
      const baseSuffix = baseLower.slice(-size);
      const nextPrefix = nextLower.slice(0, size);
      if (baseSuffix === nextPrefix) {
        return `${base}${next.slice(size)}`.replace(/\s+/g, " ").trim();
      }
    }

    return `${base} ${next}`.replace(/\s+/g, " ").trim();
  };

  const stopSpeechTyping = () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      setIsSpeechTyping(false);
      return;
    }
    try {
      recognition.stop();
    } catch {
      // ignore
    }
    speechRecognitionRef.current = null;
    setIsSpeechTyping(false);
  };

  const toggleSpeechTyping = () => {
    if (isSpeechTyping) {
      stopSpeechTyping();
      return;
    }

    if (isRecordingAudio) {
      setError("Stop voice-note recording first.");
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Speech typing is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = speechLang || navigator.language || "en-IN";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const part = String(result?.[0]?.transcript || "").trim();
          if (!part) continue;

          if (result.isFinal) {
            const currentFinal = speechFinalTranscriptRef.current;
            speechFinalTranscriptRef.current = mergeSpeechChunks(currentFinal, part);
          } else {
            interim = mergeSpeechChunks(interim, part);
          }
        }

        speechInterimTranscriptRef.current = interim;
        const combined = mergeSpeechChunks(speechFinalTranscriptRef.current, speechInterimTranscriptRef.current);

        if (combined !== speechLastAppliedTextRef.current) {
          speechLastAppliedTextRef.current = combined;
          setInputText(combined);
        }
      };

      recognition.onerror = (event) => {
        const code = String(event?.error || "");
        if (code === "not-allowed" || code === "service-not-allowed") {
          setError("Microphone permission blocked. Allow microphone access.");
        } else if (code && code !== "aborted") {
          setError("Speech typing failed. Try again.");
        }
      };

      recognition.onend = () => {
        speechRecognitionRef.current = null;
        setIsSpeechTyping(false);
      };

      speechFinalTranscriptRef.current = "";
      speechInterimTranscriptRef.current = "";
      speechLastAppliedTextRef.current = "";
      speechRecognitionRef.current = recognition;
      recognition.start();
      setError("");
      setIsSpeechTyping(true);
      setTimeout(() => composerInputRef.current?.focus(), 0);
    } catch {
      speechRecognitionRef.current = null;
      setIsSpeechTyping(false);
      setError("Unable to start speech typing.");
    }
  };

  const releaseRecordingStream = () => {
    const stream = recordingStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    }
    recordingStreamRef.current = null;
  };

  const stopAudioRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore stop errors
      }
      return;
    }
    releaseRecordingStream();
    recordingChunksRef.current = [];
    mediaRecorderRef.current = null;
    setIsRecordingAudio(false);
  };

  const toggleAudioRecording = async () => {
    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }

    if (isSpeechTyping) {
      setError("Stop speech typing first.");
      return;
    }

    if (!activeContactId) {
      setError("Open a chat first to send a voice note.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      setError("Voice notes are not supported in this browser.");
      return;
    }

    const mimeCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });
      recordingStreamRef.current = stream;

      const preferredMime = mimeCandidates.find((candidate) => {
        try {
          return typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate);
        } catch {
          return false;
        }
      });

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event?.data?.size) recordingChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setError("Voice recording failed. Please try again.");
        releaseRecordingStream();
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        setIsRecordingAudio(false);
      };

      recorder.onstop = async () => {
        const chunks = [...recordingChunksRef.current];
        const mimeType = recorder.mimeType || preferredMime || "audio/webm";
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        releaseRecordingStream();
        setIsRecordingAudio(false);

        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) return;

        const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: mimeType });
        await sendMediaFile(file, { forcedKind: "audio", previewText: "Voice message" });
        setTimeout(() => composerInputRef.current?.focus(), 0);
      };

      recorder.start(200);
      setError("");
      setIsRecordingAudio(true);
    } catch {
      releaseRecordingStream();
      recordingChunksRef.current = [];
      mediaRecorderRef.current = null;
      setIsRecordingAudio(false);
      setError("Unable to record voice note. Allow microphone access and try again.");
    }
  };

  const callActive = callState.phase !== "idle" || groupCallActive;
  const openImagePreview = useCallback((src, alt) => {
    const safeSrc = String(src || "").trim();
    if (!safeSrc) return;
    setImagePreview({ src: safeSrc, alt: String(alt || "Image") });
  }, []);
  const closeImagePreview = useCallback(() => {
    setImagePreview(null);
  }, []);

  useEffect(() => {
    if (!imagePreview) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeImagePreview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imagePreview, closeImagePreview]);

  useEffect(() => {
    if (callActive || incomingCall) setShowCallMenu(false);
  }, [callActive, incomingCall]);

  useEffect(() => {
    if (!callActive && isScreenSharing) {
      stopScreenShare();
    }
  }, [callActive, isScreenSharing]);

  useEffect(() => {
    if (!pipEnabled) return;
    if (pipDismissedRef.current) return;
    const shouldShow = callActive && (callState.mode === "video" || groupCallActive);
    if (!shouldShow) {
      pipDismissedRef.current = false;
      return;
    }
    const el = remoteVideoRef.current;
    if (!el || typeof el.requestPictureInPicture !== "function") return;
    if (document.pictureInPictureElement) return;
    el.requestPictureInPicture?.().catch(() => {});
  }, [pipEnabled, callActive, callState.mode, groupCallActive, hasRemoteVideo]);
  const showVideoCallScreen = callActive && (callState.mode === "video" || groupCallActive);
  useEffect(() => {
    const shouldHideNavbar = Boolean(showVideoCallScreen || callActive || incomingCall);
    document.body.classList.toggle("ss-call-active", shouldHideNavbar);
    return () => {
      document.body.classList.remove("ss-call-active");
    };
  }, [showVideoCallScreen, callActive, incomingCall]);
  const activeVideoFilter = useMemo(
    () => VIDEO_FILTER_PRESETS.find((preset) => preset.id === videoFilterId) || VIDEO_FILTER_PRESETS[0],
    [videoFilterId]
  );
  useEffect(() => {
    if (!showVideoCallScreen) {
      setLocalVideoPos(null);
      localVideoDragRef.current.active = false;
    }
  }, [showVideoCallScreen]);

  const startLocalVideoDrag = useCallback(
    (event) => {
      if (!showVideoCallScreen || groupCallActive) return;
      const video = localVideoRef.current;
      if (!video) return;
      const rect = video.getBoundingClientRect();
      const point =
        event?.touches?.[0] ||
        event?.changedTouches?.[0] ||
        event;
      if (!point) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      localVideoDragRef.current.active = true;
      localVideoDragRef.current.offsetX = point.clientX - rect.left;
      localVideoDragRef.current.offsetY = point.clientY - rect.top;
      if (!localVideoPos) {
        setLocalVideoPos({ x: rect.left, y: rect.top });
      }
    },
    [showVideoCallScreen, groupCallActive, localVideoPos]
  );

  useEffect(() => {
    const handleMove = (event) => {
      if (!localVideoDragRef.current.active) return;
      const video = localVideoRef.current;
      if (!video) return;
      const point =
        event?.touches?.[0] ||
        event?.changedTouches?.[0] ||
        event;
      if (!point) return;
      event.preventDefault?.();
      const rect = video.getBoundingClientRect();
      const padding = 8;
      const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
      const maxY = Math.max(padding, window.innerHeight - rect.height - padding);
      const nextX = Math.min(maxX, Math.max(padding, point.clientX - localVideoDragRef.current.offsetX));
      const nextY = Math.min(maxY, Math.max(padding, point.clientY - localVideoDragRef.current.offsetY));
      setLocalVideoPos({ x: nextX, y: nextY });
    };
    const handleEnd = () => {
      localVideoDragRef.current.active = false;
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, []);
  const callStatusText =
    callPhaseNote ||
    (callState.phase === "in-call"
      ? (hasRemoteAudio || hasRemoteVideo ? "Connected" : "Connecting media...")
      : "Connecting...");
  const callLabel = incomingCall
    ? `${incomingCall.mode === "video" ? "Video" : "Audio"} call from ${incomingCall.fromName}`
    : callActive
      ? groupCallActive
        ? `Group video call (${groupMembers.length || 2} people)`
        : `${callState.mode === "video" ? "Video" : "Audio"} call with ${callState.peerName || "User"}`
      : "";
  const formatCallStatus = (entry) => {
    const mode = entry?.mode === "video" ? "video call" : "voice call";
    const status = String(entry?.status || "ended");
    const suffixMap = {
      calling: "started",
      ringing: "ringing",
      connected: "connected",
      accepted: "accepted",
      declined: "declined",
      missed: "missed",
      busy: "busy",
      ended: "ended"
    };
    return `${mode} - ${suffixMap[status] || status}`;
  };

  const formatCallCard = (entry) => {
    const incoming = entry?.direction === "incoming";
    const isVideo = entry?.mode === "video";
    const modeLabel = isVideo ? "video call" : "voice call";
    const status = String(entry?.status || "ended").toLowerCase();
    const title = modeLabel[0].toUpperCase() + modeLabel.slice(1);

    if (status === "missed") {
      return {
        title: `Missed ${modeLabel}`,
        subtitle: incoming ? "Tap to call back" : "No answer",
        tone: "danger",
        icon: "off"
      };
    }
    if (status === "declined") {
      return {
        title: `Declined ${modeLabel}`,
        subtitle: incoming ? "You declined" : "Declined by recipient",
        tone: "danger",
        icon: "off"
      };
    }
    if (status === "connected") {
      return {
        title,
        subtitle: "Connected",
        tone: "info",
        icon: isVideo ? "video" : "phone"
      };
    }
    if (status === "accepted") {
      return {
        title,
        subtitle: "Accepted",
        tone: "info",
        icon: isVideo ? "video" : "phone"
      };
    }
    if (status === "calling" || status === "ringing") {
      return {
        title,
        subtitle: status === "calling" ? "Calling..." : "Ringing...",
        tone: "success",
        icon: isVideo ? "video" : "phone"
      };
    }
    if (status === "busy") {
      return {
        title: `${title} busy`,
        subtitle: "User is busy",
        tone: "danger",
        icon: "off"
      };
    }

    return {
      title,
      subtitle: "Ended",
      tone: "danger",
      icon: "off"
    };
  };
  const formatMessageTime = (value) => {
    try {
      if (!value) return "";
      return new Date(normalizeTimestamp(value))
        .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
        .toLowerCase();
    } catch {
      return "";
    }
  };

  const canTranslateMessage = (msg) => {
    if (!msg || msg.mine) return false;
    if (msg.audioUrl || msg.mediaUrl) return false;
    const text = String(msg.text || "").trim();
    if (!text) return false;
    if (/^\[Attachment:\s*.+\]$/i.test(text)) return false;
    if (/^This message was deleted$/i.test(text)) return false;
    return true;
  };

  const getSpeakableIncomingPayload = (msg) => {
    if (!msg || msg.mine) return null;
    const signPayload = decodeSignAssistText(msg?.text || "");
    if (signPayload?.text) {
      return {
        text: String(signPayload.text || "").trim(),
        voiceGender: signPayload.voiceGender || "female"
      };
    }
    if (msg.audioUrl || msg.mediaUrl) return null;
    const plainText = String(msg.text || "").trim();
    if (!plainText) return null;
    if (/^\[Attachment:\s*.+\]$/i.test(plainText)) return null;
    if (/^This message was deleted$/i.test(plainText)) return null;

    if (translatorEnabled && canTranslateMessage(msg)) {
      const msgKey = String(msg?.id || `${msg?.createdAt}_${msg?.text}`);
      const translated = String(translatedIncomingById[msgKey] || "").trim();
      if (!translated) {
        return {
          text: "",
          voiceGender: speechVoiceGender,
          waitForTranslation: true
        };
      }
      return {
        text: translated,
        voiceGender: speechVoiceGender
      };
    }

    return {
      text: plainText,
      voiceGender: speechVoiceGender
    };
  };

  const translateText = async (text, targetLang) => {
    const raw = String(text || "").trim();
    const lang = String(targetLang || "").trim().toLowerCase();
    if (!raw || !lang) return raw;
    const cacheKey = `${lang}|${raw}`;
    if (translationCacheRef.current[cacheKey]) return translationCacheRef.current[cacheKey];

    const decodeHtmlEntities = (value) =>
      String(value || "")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

    const protectPattern = /(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.\w+|[@#][\w_]+)/g;
    const protectedParts = [];
    const protectedRaw = raw.replace(protectPattern, (match) => {
      const token = `__SS_TOKEN_${protectedParts.length}__`;
      protectedParts.push(match);
      return token;
    });

    const splitText = (value, maxLen = 900) => {
      const input = String(value || "").trim();
      if (!input) return [];
      if (input.length <= maxLen) return [input];
      const chunks = [];
      let remaining = input;
      while (remaining.length > maxLen) {
        const piece = remaining.slice(0, maxLen);
        const splitAt = Math.max(
          piece.lastIndexOf(". "),
          piece.lastIndexOf("! "),
          piece.lastIndexOf("? "),
          piece.lastIndexOf(", "),
          piece.lastIndexOf(" ")
        );
        const end = splitAt > 160 ? splitAt + 1 : maxLen;
        chunks.push(remaining.slice(0, end).trim());
        remaining = remaining.slice(end).trim();
      }
      if (remaining) chunks.push(remaining);
      return chunks;
    };

    const restoreProtected = (value) => {
      let out = String(value || "");
      protectedParts.forEach((part, idx) => {
        out = out.replace(new RegExp(`__SS_TOKEN_${idx}__`, "g"), part);
      });
      return out;
    };

    const translateChunks = async (translatorFn) => {
      const chunks = splitText(protectedRaw, 900);
      if (!chunks.length) return "";
      const translatedParts = [];
      for (const chunk of chunks) {
        const next = await translatorFn(chunk);
        translatedParts.push(next);
      }
      return translatedParts.join(" ").replace(/\s+/g, " ").trim();
    };

    const providers = [
      async () => {
        return translateChunks(async (chunk) => {
          const url =
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(lang)}&dt=t&q=${encodeURIComponent(chunk)}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`google translate failed: ${res.status}`);
          const data = await res.json();
          const translated = Array.isArray(data?.[0])
            ? data[0].map((item) => String(item?.[0] || "")).join("").trim()
            : "";
          return translated || "";
        });
      },
      async () => {
        return translateChunks(async (chunk) => {
          const url =
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=auto|${encodeURIComponent(lang)}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`mymemory failed: ${res.status}`);
          const data = await res.json();
          const translated = decodeHtmlEntities(String(data?.responseData?.translatedText || "").trim());
          return translated || "";
        });
      }
    ];

    for (const provider of providers) {
      try {
        const translated = await provider();
        if (translated) {
          const restored = restoreProtected(translated);
          translationCacheRef.current[cacheKey] = restored;
          return restored;
        }
      } catch {
        // try next provider
      }
    }
    throw new Error("all translation providers failed");
  };

  const getMessageTickState = (message) => {
    if (!message || !message.mine) return null;
    const rawStatus = String(message.status || message.deliveryStatus || "").toLowerCase();
    const readAtValue =
      message.readAt ||
      message.seenAt ||
      message.read_at ||
      message.seen_at ||
      message.readAtUtc ||
      message.seenAtUtc ||
      message.readReceiptAt ||
      message.readTimestamp;
    const isRead =
      Boolean(readAtValue) ||
      message.read === true ||
      message.seen === true ||
      message.isRead === true ||
      message.isSeen === true ||
      rawStatus === "read" ||
      rawStatus === "seen" ||
      rawStatus === "viewed";
    if (isRead) return "read";

    const messageTs = new Date(normalizeTimestamp(message.createdAt || 0)).getTime();
    const hasPeerActivityAfter =
      Number.isFinite(messageTs) &&
      messageTs > 0 &&
      (
        (Number.isFinite(peerLatestMessageTs) && peerLatestMessageTs >= messageTs) ||
        (Number.isFinite(peerLatestCallTs) && peerLatestCallTs >= messageTs) ||
        (Number.isFinite(peerLatestProfileTs) && peerLatestProfileTs >= messageTs)
      );
    if (hasPeerActivityAfter) return "read";

    const idText = String(message.id || "");
    const isLocalPendingId =
      idText.startsWith("local_") ||
      idText.startsWith("tmp_") ||
      idText.startsWith("temp_");
    const oldEnough = Number.isFinite(messageTs) ? Date.now() - messageTs > 1500 : true;
    const isDelivered =
      Boolean(
        message.deliveredAt ||
        message.receivedAt ||
        message.delivered_at ||
        message.received_at ||
        message.receivedTimestamp
      ) ||
      message.delivered === true ||
      message.received === true ||
      rawStatus === "delivered" ||
      rawStatus === "received" ||
      (idText && !isLocalPendingId && oldEnough);
    if (isDelivered) return "delivered";

    return "sent";
  };

  const getTickSymbol = (tickState) => {
    if (tickState === "sent") return "\u2713";
    if (tickState === "delivered" || tickState === "read") return "\u2713\u2713";
    return "";
  };

  const formatDayLabel = (value) => {
    try {
      const d = new Date(value);
      const now = new Date();
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.round((today - day) / 86400000);
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  const formatCallDuration = (totalSec) => {
    const seconds = Math.max(0, Number(totalSec) || 0);
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const resolveMediaUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(blob:|data:|https?:\/\/)/i.test(raw)) return raw;
    return toApiUrl(raw);
  };

  const threadItems = useMemo(() => {
    const msgItems = activeMessages.map((m) => ({
      kind: "message",
      id: `m_${m.id || `${m.createdAt}_${m.text}`}`,
      createdAt: m.createdAt,
      mine: !!m.mine,
      text: m.text,
      raw: m
    }));
    const callItems = activeCallHistory.map((c) => ({
      kind: "call",
      id: `c_${c.id}`,
      createdAt: normalizeTimestamp(c.at),
      mine: c.direction === "outgoing",
      text: formatCallStatus(c),
      raw: c
    }));
    return [...msgItems, ...callItems].sort((a, b) => {
      const at = new Date(normalizeTimestamp(a.createdAt || 0)).getTime();
      const bt = new Date(normalizeTimestamp(b.createdAt || 0)).getTime();
      return at - bt;
    });
  }, [activeMessages, activeCallHistory]);

  const chatItems = useMemo(() => {
    const out = [];
    let lastDayKey = "";
    threadItems.forEach((item) => {
      const d = new Date(item.createdAt || Date.now());
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayKey !== lastDayKey) {
        lastDayKey = dayKey;
        out.push({
          kind: "day",
          id: `day_${dayKey}`,
          label: formatDayLabel(item.createdAt)
        });
      }
      out.push(item);
    });
    return out;
  }, [threadItems]);

  useEffect(() => {
    setShowHeaderMenu(false);
    setShowCallMenu(false);
    setShowWallpaperPanel(false);
    setReplyDraft(null);
  }, [activeContactId]);

  useEffect(() => {
    const onDocClick = (event) => {
      const wrap = headerMenuWrapRef.current;
      const panel = headerMenuRef.current;
      const callMenu = callMenuRef.current;
      const wallpaperPanel = wallpaperPanelRef.current;
      if (wrap?.contains(event.target)) return;
      if (panel?.contains(event.target)) return;
      if (callMenu?.contains(event.target)) return;
      if (wallpaperPanel?.contains(event.target)) return;
      setShowHeaderMenu(false);
      setShowCallMenu(false);
      setShowWallpaperPanel(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setTranslatedIncomingById({});
    setTranslatorError("");
  }, [activeContactId, translatorEnabled, translatorLang]);

  useEffect(() => {
    const messages = Array.isArray(activeMessages) ? activeMessages : [];
    if (!messages.length) return undefined;
    const pendingIds = new Set();
    const directPreviewById = {};
    messages.forEach((msg) => {
      const share = extractReelShare(msg?.raw?.text || msg?.text || "");
      const id = String(share?.id || "").trim();
      if (!id) return;
      const directFields = pickReelPreviewFields(msg?.raw || msg);
      const directSrc = resolveMediaUrl(directFields.video);
      const directPoster = resolveMediaUrl(directFields.poster);
      if (directSrc || directPoster) {
        directPreviewById[id] = { src: directSrc, poster: directPoster };
      }
      if (Object.prototype.hasOwnProperty.call(reelPreviewById, id)) return;
      pendingIds.add(id);
    });
    if (Object.keys(directPreviewById).length) {
      setReelPreviewById((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.entries(directPreviewById).forEach(([id, preview]) => {
          const current = prev[id];
          const merged = {
            src: preview?.src || current?.src || "",
            poster: preview?.poster || current?.poster || ""
          };
          if (!current || current.src !== merged.src || current.poster !== merged.poster) {
            next[id] = merged;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
    if (!pendingIds.size) return undefined;

    let cancelled = false;
    const buildPreviewPayload = (reel) => {
      const { video, poster } = pickReelPreviewFields(reel);
      const src = resolveMediaUrl(video);
      const posterUrl = resolveMediaUrl(poster);
      if (!src && !posterUrl) return null;
      return { src, poster: posterUrl };
    };
    const findReelInList = (items, targetId) => {
      if (!Array.isArray(items)) return null;
      return (
        items.find((item) => getReelIdValue(item) === targetId) ||
        items.find((item) => {
          const candidate = normalizeReelCandidate(item);
          const altId = getReelIdValue(candidate);
          return altId === targetId;
        }) ||
        null
      );
    };
    const fetchReelById = async (id) => {
      try {
        const direct = await requestChatObject({
          endpoints: [
            `/api/reels/${encodeURIComponent(id)}`,
            `/reels/${encodeURIComponent(id)}`,
            `/api/feed/${encodeURIComponent(id)}`,
            `/feed/${encodeURIComponent(id)}`
          ]
        });
        if (direct && getReelIdValue(direct) === id) return direct;
      } catch {
        // ignore direct lookup failures
      }

      const listEndpoints = [
        ["/api/reels", "/reels"],
        ["/api/feed", "/feed"],
        ["/api/profile/me/posts"],
        ["/api/profile/posts"]
      ];
      for (const endpoints of listEndpoints) {
        try {
          const res = await requestChatArray({
            endpoints,
            params: { _: Date.now() },
            maxAttempts: 2
          });
          const match = findReelInList(res?.list || [], id);
          if (match) return match;
        } catch {
          // ignore list lookup failures
        }
      }
      return null;
    };

    const run = async () => {
      for (const id of pendingIds) {
        if (cancelled) return;
        if (reelPreviewLoadingRef.current.has(id)) continue;
        reelPreviewLoadingRef.current.add(id);
        try {
          const reel = await fetchReelById(id);
          if (cancelled) return;
          const preview = reel ? buildPreviewPayload(reel) : null;
          setReelPreviewById((prev) => {
            if (Object.prototype.hasOwnProperty.call(prev, id)) return prev;
            return { ...prev, [id]: preview };
          });
        } catch {
          if (cancelled) return;
          setReelPreviewById((prev) => {
            if (Object.prototype.hasOwnProperty.call(prev, id)) return prev;
            return { ...prev, [id]: null };
          });
        } finally {
          reelPreviewLoadingRef.current.delete(id);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeMessages, reelPreviewById]);

  useEffect(() => {
    const messages = Array.isArray(activeMessages) ? activeMessages : [];
    if (!messages.length) return undefined;
    const pendingSrcs = new Set();

    messages.forEach((msg) => {
      const share = extractReelShare(msg?.raw?.text || msg?.text || "");
      if (!share) return;
      const id = String(share?.id || "").trim();
      const directFields = pickReelPreviewFields(msg?.raw || msg);
      const directSrc = resolveMediaUrl(directFields.video);
      const directPoster = resolveMediaUrl(directFields.poster);
      const preview = id ? reelPreviewById[id] : null;
      const src = directSrc || preview?.src || "";
      const poster = directPoster || preview?.poster || "";
      if (!src || poster) return;
      if (Object.prototype.hasOwnProperty.call(reelPosterBySrc, src)) return;
      pendingSrcs.add(src);
    });

    if (!pendingSrcs.size) return undefined;

    let cancelled = false;
    const run = async () => {
      for (const src of pendingSrcs) {
        if (cancelled) return;
        if (reelPosterLoadingRef.current.has(src)) continue;
        reelPosterLoadingRef.current.add(src);
        try {
          const poster = await createVideoPosterDataUrl(src);
          if (cancelled) return;
          setReelPosterBySrc((prev) => {
            if (Object.prototype.hasOwnProperty.call(prev, src)) return prev;
            return { ...prev, [src]: poster || null };
          });
        } finally {
          reelPosterLoadingRef.current.delete(src);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeMessages, reelPreviewById, reelPosterBySrc]);

  useEffect(() => {
    if (!translatorEnabled) return;
    if (!activeContactId) return;
    const messages = Array.isArray(activeMessages) ? activeMessages : [];
    const pending = messages.filter((m) => {
      if (!canTranslateMessage(m)) return false;
      const key = String(m.id || `${m.createdAt}_${m.text}`);
      return !translatedIncomingById[key];
    });
    if (!pending.length) return;

    let cancelled = false;
    let failed = false;
    const run = async () => {
      for (const msg of pending) {
        if (cancelled) break;
        const sourceText = String(msg.text || "");
        const msgKey = String(msg.id || `${msg.createdAt}_${sourceText}`);
        try {
          const translated = await translateText(sourceText, translatorLang);
          if (cancelled) break;
          setTranslatedIncomingById((prev) =>
            prev[msgKey] ? prev : { ...prev, [msgKey]: translated }
          );
        } catch {
          failed = true;
        }
      }
      if (!cancelled) {
        setTranslatorError(failed ? "Translation service unavailable. Showing original text." : "");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeMessages, activeContactId, translatorEnabled, translatorLang, translatedIncomingById]);

  const sendVisibleReadReceipts = useCallback(() => {
    if (!isConversationRoute) return;
    if (!myUserId || !activeContactId) return;
    const visibleIds = getVisibleThreadMessageIds();
    if (!visibleIds.size) return;
    const incoming = (Array.isArray(activeMessages) ? activeMessages : []).filter((m) => {
      if (!m || m.mine) return false;
      const msgId = String(m.id || "").trim();
      return msgId && visibleIds.has(msgId);
    });
    if (!incoming.length) return;

    const readUptoMs = incoming.reduce((max, msg) => {
      const t = new Date(normalizeTimestamp(msg?.createdAt || 0)).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (!readUptoMs) return;

    const key = String(activeContactId);
    const lastSent = Number(lastReadReceiptSentByContactRef.current[key] || 0);
    if (lastSent >= readUptoMs) return;
    lastReadReceiptSentByContactRef.current[key] = readUptoMs;

    const packet = {
      kind: "chat-read",
      receiptId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromTab: tabIdRef.current,
      readerId: String(myUserId),
      peerId: key,
      readUptoMs,
      at: new Date().toISOString()
    };

    try {
      localStorage.setItem(CHAT_READ_RECEIPT_KEY, JSON.stringify(packet));
    } catch {
      // ignore storage write failures
    }
    try {
      readReceiptChannelRef.current?.postMessage(packet);
    } catch {
      // ignore broadcast failures
    }
  }, [isConversationRoute, myUserId, activeContactId, activeMessages]);

  useEffect(() => {
    if (!isConversationRoute) return;
    requestAnimationFrame(() => {
      sendVisibleReadReceipts();
    });
  }, [isConversationRoute, activeContactId, activeMessages, sendVisibleReadReceipts]);

  useEffect(() => {
    if (!isConversationRoute) return;
    if (!chatItems.length) return;
    const hasNewItems = chatItems.length > lastThreadItemCountRef.current;
    lastThreadItemCountRef.current = chatItems.length;
    if (!hasNewItems) return;
    if (!shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => scrollThreadToBottom("auto"));
  }, [chatItems, isConversationRoute]);

  useEffect(() => {
    if (!isConversationRoute) return;
    requestAnimationFrame(() => refreshThreadScrollState());
  }, [chatItems, isConversationRoute]);

  useEffect(() => {
    lastThreadItemCountRef.current = 0;
    shouldStickToBottomRef.current = true;
    showScrollDownRef.current = false;
    setShowScrollDown(false);
    if (!activeContactId) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => scrollThreadToBottom("auto"));
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [activeContactId]);

  useEffect(() => {
    const plan = openScrollPlanRef.current;
    if (!isConversationRoute || !activeContactId) {
      if (Array.isArray(plan.timers) && plan.timers.length) {
        plan.timers.forEach((timer) => clearTimeout(timer));
      }
      openScrollPlanRef.current = { contactId: "", untilMs: 0, timers: [] };
      return;
    }

    if (Array.isArray(plan.timers) && plan.timers.length) {
      plan.timers.forEach((timer) => clearTimeout(timer));
    }

    const nextPlan = {
      contactId: String(activeContactId),
      untilMs: Date.now() + 2600,
      timers: []
    };
    openScrollPlanRef.current = nextPlan;

    // Force-open at latest message even if content height settles late.
    [0, 120, 320, 700, 1200].forEach((delay) => {
      const timer = setTimeout(() => {
        if (openScrollPlanRef.current.contactId !== String(activeContactId)) return;
        shouldStickToBottomRef.current = true;
        scrollThreadToBottom("auto");
      }, delay);
      nextPlan.timers.push(timer);
    });

    return () => {
      if (Array.isArray(nextPlan.timers) && nextPlan.timers.length) {
        nextPlan.timers.forEach((timer) => clearTimeout(timer));
      }
    };
  }, [isConversationRoute, activeContactId]);

  useEffect(() => {
    if (!isConversationRoute || !activeContactId) return;
    const plan = openScrollPlanRef.current;
    if (plan.contactId !== String(activeContactId)) return;
    if (Date.now() > Number(plan.untilMs || 0)) return;
    shouldStickToBottomRef.current = true;
    requestAnimationFrame(() => scrollThreadToBottom("auto"));
  }, [chatItems.length, isConversationRoute, activeContactId]);

  const onThreadScroll = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      refreshThreadScrollState();
      processVisibleAutoSpeak();
      sendVisibleReadReceipts();
    });
  };

  useEffect(() => () => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = 0;
    }
  }, []);

  const openBubbleMenu = (event, item) => {
    event.preventDefault();
    setBubbleMenu({
      x: event.clientX || 120,
      y: event.clientY || 120,
      item
    });
  };

  const openBubbleMenuOnClick = (event, item) => {
    if (!item) return;
    if (event?.pointerType && event.pointerType !== "mouse") return;
    if (typeof event?.button === "number" && event.button !== 0) return;
    const target = event?.target;
    if (target?.closest?.("a, button, input, textarea, select, audio, video, img")) return;
    setBubbleMenu({
      x: event.clientX || 120,
      y: event.clientY || 120,
      item
    });
  };

  const onBubbleTouchStart = (item, touchEvent) => {
    const t = touchEvent.touches?.[0];
    if (!t) return;
    touchStartPointRef.current = { x: t.clientX, y: t.clientY };
    touchSwipeReplyRef.current = { triggered: false };
    longPressTimerRef.current = setTimeout(() => {
      setBubbleMenu({ x: t.clientX, y: t.clientY, item });
    }, 600);
  };

  const onBubbleTouchMove = (item, touchEvent) => {
    const t = touchEvent.touches?.[0];
    if (!t) return;
    const deltaX = t.clientX - touchStartPointRef.current.x;
    const deltaY = t.clientY - touchStartPointRef.current.y;
    const dx = Math.abs(deltaX);
    const dy = Math.abs(deltaY);
    if (dx > 16 || dy > 16) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    if (!item || item.kind !== "message" || touchSwipeReplyRef.current.triggered) return;
    if (dy > 24 || dx < 56 || dx < dy * 1.25) return;
    const source = item.raw || {};
    const replyPreview = trimReplyPreview(
      source?.audioUrl || source?.mediaType === "audio"
        ? "Voice message"
        : source?.mediaType === "image"
          ? "Photo"
          : source?.mediaType === "video"
            ? "Video"
            : source?.mediaUrl
              ? source?.fileName || "File"
              : decodeSignAssistText(source?.text || item.text)?.text || source?.text || item.text || "Message"
    );
    touchSwipeReplyRef.current = { triggered: true };
    setReplyDraft({
      id: String(source?.id || item.id || ""),
      senderName: item.mine ? "You" : (activeContact?.name || "User"),
      senderId: String(source?.senderId || ""),
      preview: replyPreview || "Message"
    });
    setShowEmojiTray(false);
    try {
      window.navigator?.vibrate?.(8);
    } catch {
      // vibration not available
    }
    setTimeout(() => composerInputRef.current?.focus(), 0);
  };

  const onBubbleTouchEnd = () => {
    touchSwipeReplyRef.current = { triggered: false };
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const closeBubbleMenu = () => setBubbleMenu(null);
  const hasDraft = inputText.trim().length > 0;

  const getBubbleDownloadInfo = (item) => {
    if (!item || item.kind !== "message") return null;
    const raw = item.raw || {};
    const hasMedia = Boolean(raw.mediaUrl || raw.audioUrl);
    if (!hasMedia) return null;
    const url = raw.mediaUrl ? resolveMediaUrl(raw.mediaUrl) : toApiUrl(raw.audioUrl);
    if (!url) return null;
    const mediaType = String(raw.mediaType || (raw.audioUrl ? "audio" : "")).toLowerCase();
    const rawFileName = String(raw.fileName || "").trim();
    const parsedName = (() => {
      try {
        const clean = url.split("?")[0].split("#")[0];
        const parts = clean.split("/");
        return parts[parts.length - 1] || "";
      } catch {
        return "";
      }
    })();
    let fileName = rawFileName || parsedName;
    if (!fileName || !/\.[a-z0-9]+$/i.test(fileName)) {
      const ext =
        mediaType === "image"
          ? "jpg"
          : mediaType === "video"
            ? "mp4"
            : mediaType === "audio"
              ? "webm"
              : "bin";
      fileName = `media-${Date.now()}.${ext}`;
    }
    return { url, fileName };
  };

  const saveBubbleMedia = async () => {
    const info = getBubbleDownloadInfo(bubbleMenu?.item);
    if (!info) return closeBubbleMenu();
    try {
      const res = await fetch(info.url, { credentials: "include" });
      if (!res.ok) throw new Error("download-failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = info.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(info.url, "_blank");
    }
    closeBubbleMenu();
  };

  const copyBubbleItem = async () => {
    const text = bubbleMenu?.item?.text || "";
    if (!text) return closeBubbleMenu();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
    closeBubbleMenu();
  };

  const deleteBubbleItem = () => {
    const item = bubbleMenu?.item;
    if (!item || !activeContactId) return closeBubbleMenu();
    if (item.kind === "message") {
      const rawId = item.raw?.id;
      if (rawId) {
        markMessageHiddenForMe(activeContactId, rawId);
        if (!chatFallbackMode && !String(rawId).startsWith("local_")) {
          const endpoints = [
            { method: "delete", url: `/api/chat/messages/${rawId}` },
            { method: "delete", url: `/api/chat/${activeContactId}/messages/${rawId}` },
            { method: "post", url: `/api/chat/messages/${rawId}/delete` },
            { method: "post", url: `/api/chat/${activeContactId}/messages/${rawId}/delete` }
          ];
          void (async () => {
            for (const ep of endpoints) {
              try {
                await api({ method: ep.method, url: ep.url });
                return;
              } catch {
                // try next endpoint
              }
            }
          })();
        }
      }
      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: (prev[activeContactId] || []).filter((m) => String(m?.id) !== String(rawId))
      }));
    } else if (item.kind === "call") {
      const callId = item.raw?.id;
      setCallHistoryByContact((prev) => {
        const next = {
          ...prev,
          [activeContactId]: (prev[activeContactId] || []).filter((c) => String(c?.id) !== String(callId))
        };
        historyRef.current = next;
        writeCallHistory(next);
        return next;
      });
    }
    closeBubbleMenu();
  };

  const deleteBubbleItemForEveryone = async () => {
    const item = bubbleMenu?.item;
    if (!item || !activeContactId || item.kind !== "message" || !item.mine) return closeBubbleMenu();
    const rawId = item.raw?.id;
    if (!rawId) return closeBubbleMenu();

    setMessagesByContact((prev) => ({
      ...prev,
      [activeContactId]: (prev[activeContactId] || []).map((m) => {
        if (String(m?.id) !== String(rawId)) return m;
        return {
          ...m,
          text: "This message was deleted",
          mediaUrl: "",
          mediaType: "",
          fileName: "",
          deletedForEveryone: true
        };
      })
    }));
    closeBubbleMenu();

    if (chatFallbackMode || String(rawId).startsWith("local_")) return;

    const endpoints = [
      { method: "delete", url: `/api/chat/messages/${rawId}/delete-for-everyone` },
      { method: "delete", url: `/api/chat/messages/${rawId}/everyone` },
      { method: "delete", url: `/api/chat/messages/${rawId}`, params: { scope: "everyone" } },
      { method: "delete", url: `/api/chat/${activeContactId}/messages/${rawId}`, data: { scope: "everyone" } },
      { method: "delete", url: `/api/chat/${activeContactId}/messages/${rawId}/delete-for-everyone` },
      { method: "post", url: `/api/chat/messages/${rawId}/delete-for-everyone` }
    ];

    let synced = false;
    for (const ep of endpoints) {
      try {
        await api({ method: ep.method, url: ep.url, params: ep.params, data: ep.data });
        synced = true;
        break;
      } catch {
        // try next endpoint
      }
    }

    if (!synced) {
      try {
        await api.post(`/api/chat/${activeContactId}/send`, { text: `${DELETE_FOR_EVERYONE_TOKEN}${rawId}` });
        synced = true;
      } catch {
        // keep local-only state
      }
    }

    if (!synced) {
      setError("Delete for everyone is applied locally, but backend sync was not available.");
    }
  };

  return (
    <div className={`chat-page ${isConversationRoute ? "chat-single-pane" : "chat-list-only"}`}>
      {!isConversationRoute && callActive && (callState.mode === "video" || groupCallActive) && (
        <button
          type="button"
          className="call-return-banner"
          onClick={() => {
            const targetId = callState.peerId && callState.peerId !== "group" ? callState.peerId : activeContactId;
            if (targetId) {
              navigate(`/chat/${targetId}`);
            }
          }}
        >
          Return to call {pipActive ? "(PiP closed)" : ""}
        </button>
      )}
      {!isConversationRoute && !isRequestsRoute && (
        <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <h2>Messages</h2>
          <div className="chat-sidebar-actions">
            <button
              type="button"
              className="chat-requests-link"
              onClick={() => navigate("/chat/requests")}
            >
              Requests
              {requestsTotal > 0 && <span className="chat-requests-count">{requestsTotal}</span>}
            </button>
            <button type="button" className="new-chat-btn" onClick={() => setNewChatOpen(true)}>
              + New Chat
            </button>
          </div>
        </div>
        <div className="chat-stories">
          <div className="chat-stories-head">
            <h3>Stories</h3>
            <button type="button" className="chat-story-add" onClick={() => navigate("/story/create")}>
              + Add
            </button>
          </div>
          <div className="chat-stories-row">
            <button type="button" className="chat-story-tile add" onClick={() => navigate("/story/create")}>
              <span className="chat-story-thumb">+</span>
              <small>Your story</small>
            </button>
            {storyGroups.map((group) => {
              const story = group.latest || group.items[0];
              const mediaUrl = resolveStoryMediaUrl(story?.mediaUrl || story?.url || "");
              const isVideo = isStoryVideo(mediaUrl);
              const baseLabel = getStoryGroupLabel(group);
              const label =
                group.items.length > 1 ? `${baseLabel} (${group.items.length})` : baseLabel;
              return (
                <button
                  key={group.key}
                  type="button"
                  className="chat-story-tile"
                  onClick={() => handleStoryTileClick(group)}
                  onPointerDown={startStoryLongPress(group)}
                  onPointerUp={cancelStoryLongPress}
                  onPointerLeave={cancelStoryLongPress}
                  onPointerCancel={cancelStoryLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isMyStoryGroup(group)) openStoryOptions(group);
                  }}
                >
                  <span className="chat-story-thumb">
                    {mediaUrl ? (
                      isVideo ? (
                        <video src={mediaUrl} muted playsInline preload="metadata" />
                      ) : (
                        <img src={mediaUrl} alt={label} />
                      )
                    ) : (
                      <span className="chat-story-fallback">{label.slice(0, 1).toUpperCase()}</span>
                    )}
                    {isVideo && <span className="chat-story-play">▶</span>}
                  </span>
                  <small>{label.length > 14 ? `${label.slice(0, 12)}...` : label}</small>
                </button>
              );
            })}
            {storyGroups.length === 0 && (
              <p className="chat-story-empty">No stories yet</p>
            )}
          </div>
        </div>
        <input
          type="text"
          className="chat-search"
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="chat-error">{error}</p>}
        {!error && !!shareHint && <p className="chat-empty">{shareHint}</p>}
        <div className="chat-contact-list">
          {filteredContacts.map((c) => {
            const presence = getContactPresence(c);
            const displayName = getContactDisplayName(c);
            const contactId = c?.id != null ? String(c.id) : "";
            const isActive = String(activeContactId) === contactId;
            const showActions = Boolean(contactId) && String(contactActionId) === contactId;
            const contactKey = contactId || c?.email || displayName;
            return (
              <div key={contactKey} className={`chat-contact-card ${isActive ? "active" : ""}`}>
                <button
                  type="button"
                  className={`chat-contact ${isActive ? "active" : ""}`}
                  onPointerDown={startContactLongPress(contactId)}
                  onPointerUp={(e) => handleContactPointerUp(e, c)}
                  onPointerLeave={stopContactLongPress}
                  onPointerCancel={stopContactLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleContactActions(contactId);
                  }}
                  onDoubleClick={() => openContact(c)}
                  onKeyDown={(e) => handleContactKeyDown(e, c)}
                >
                  <span className="chat-avatar">
                    {c.profilePic ? <img src={c.profilePic} alt={displayName} className="chat-avatar-img" /> : c.avatar}
                    <span className={`chat-presence-dot ${presence.online ? "is-online" : ""}`} />
                  </span>
                  <span className="chat-meta">
                    <span className="chat-meta-row">
                      <strong>{displayName}</strong>
                      <span className={`chat-status-pill ${presence.online ? "is-online" : ""}`}>
                        {presence.text}
                      </span>
                    </span>
                    <small>{c.lastMessage || "Tap to start chatting"}</small>
                  </span>
                </button>
                {showActions && (
                  <div className="chat-contact-actions">
                    <button
                      type="button"
                      className="chat-contact-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteConversation(c);
                      }}
                    >
                      Delete chat
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!error && filteredContacts.length === 0 && <p className="chat-empty">No users found</p>}
        </div>

        {newChatOpen && (
          <div className="new-chat-modal-backdrop" onClick={() => setNewChatOpen(false)}>
            <div className="new-chat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="new-chat-top">
                <h4>Start New Chat</h4>
                <button type="button" onClick={() => setNewChatOpen(false)}>
                  x
                </button>
              </div>
              <input
                type="text"
                className="chat-search"
                placeholder="Search people"
                value={newChatQuery}
                onChange={(e) => setNewChatQuery(e.target.value)}
              />
              <div className="new-chat-list">
                {searchingUsers && <p className="chat-empty">Searching users...</p>}
                {newChatCandidates.map((c) => {
                  const displayName = getContactDisplayName(c);
                  const canChat = canChatWith(c);
                  const outgoingPending = hasOutgoingRequest(c);
                  const rawRequestStatus = getRequestStatus(c);
                  const cleanedStatus =
                    !chatRequestsLoading && !outgoingPending &&
                    (rawRequestStatus === "requested" || rawRequestStatus === "pending")
                      ? ""
                      : rawRequestStatus;
                  const requestStatus = isFollowingContact(c)
                    ? "following"
                    : outgoingPending
                      ? "requested"
                      : cleanedStatus;
                  const requestLabel =
                    requestStatus === "following"
                      ? "Following"
                      : requestStatus === "requested" || requestStatus === "pending"
                        ? "Requested"
                        : requestStatus === "error"
                          ? "Retry"
                          : "Request";
                  return (
                    <div key={c.id} className="chat-contact-row">
                      <button
                        type="button"
                        className={`chat-contact ${canChat ? "" : "is-locked"}`}
                        onClick={canChat ? () => startNewChat(c) : undefined}
                        disabled={!canChat}
                      >
                        <span className="chat-avatar">
                          {c.profilePic ? <img src={c.profilePic} alt={displayName} className="chat-avatar-img" /> : c.avatar}
                        </span>
                        <span className="chat-meta">
                          <strong>{displayName}</strong>
                          <small>{c.email || c.username || "Start conversation"}</small>
                        </span>
                      </button>
                      {!canChat && (
                        <button
                          type="button"
                          className="chat-request-btn"
                          onClick={() => requestChatAccess(c)}
                          disabled={requestStatus === "requested" || requestStatus === "pending"}
                        >
                          {requestLabel}
                        </button>
                      )}
                    </div>
                  );
                })}
                {!searchingUsers && newChatCandidates.length === 0 && <p className="chat-empty">No users found</p>}
              </div>
            </div>
          </div>
        )}
        </aside>
      )}

      {!isConversationRoute && isRequestsRoute && (
        <section className="chat-requests-page">
          <div className="chat-requests-page-head">
            <button
              type="button"
              className="chat-requests-back"
              onClick={() => navigate("/chat")}
            >
              <FiArrowLeft /> Back
            </button>
            <h2>Chat Requests</h2>
            <span className="chat-requests-summary">
              {chatRequests.length} incoming / {filteredSentChatRequests.length} sent
            </span>
          </div>
          <div className="chat-requests-grid">
            <div className="chat-requests">
              <div className="chat-requests-head">
                <h3>Incoming</h3>
                {chatRequests.length > 0 && <span className="chat-requests-count">{chatRequests.length}</span>}
              </div>
              <div className="chat-requests-list">
                {chatRequestsLoading && <p className="chat-request-empty">Loading requests...</p>}
                {!chatRequestsLoading && !chatRequestError && chatRequests.length === 0 && (
                  <p className="chat-request-empty">No new requests</p>
                )}
                {chatRequestError && <p className="chat-request-error">{chatRequestError}</p>}
                {chatRequests.map((req) => {
                  const contact = resolveChatRequestContact(req);
                  if (!contact) return null;
                  const displayName = getContactDisplayName(contact);
                  const requestId = String(req?.id || "").trim();
                  const busy = Boolean(requestId && chatRequestBusyById[requestId]);
                  const actionable = Boolean(requestId);
                  return (
                    <div key={requestId || contact.id} className="chat-request-card">
                      <span className="chat-avatar">
                        {contact.profilePic ? (
                          <img src={contact.profilePic} alt={displayName} className="chat-avatar-img" />
                        ) : (
                          contact.avatar
                        )}
                      </span>
                      <span className="chat-request-meta">
                        <strong>{displayName}</strong>
                        <small>{contact.email || contact.username || "Chat request"}</small>
                      </span>
                      <div className="chat-request-actions">
                        <button
                          type="button"
                          className="chat-request-btn accept"
                          onClick={() => acceptChatRequest(req)}
                          disabled={!actionable || busy}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="chat-request-btn reject"
                          onClick={() => rejectChatRequest(req)}
                          disabled={!actionable || busy}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="chat-requests chat-requests-sent">
              <div className="chat-requests-head">
                <h3>Sent</h3>
                {filteredSentChatRequests.length > 0 && (
                  <span className="chat-requests-count">{filteredSentChatRequests.length}</span>
                )}
              </div>
              <div className="chat-requests-list">
                {chatRequestsLoading && filteredSentChatRequests.length === 0 && (
                  <p className="chat-request-empty">Loading requests...</p>
                )}
                {!chatRequestsLoading && filteredSentChatRequests.length === 0 && (
                  <p className="chat-request-empty">No sent requests</p>
                )}
                {filteredSentChatRequests.map((req) => {
                  const contact = resolveChatRequestContact(req);
                  if (!contact) return null;
                  const displayName = getContactDisplayName(contact);
                  return (
                    <div key={`sent-${req?.id || contact.id}`} className="chat-request-card">
                      <span className="chat-avatar">
                        {contact.profilePic ? (
                          <img src={contact.profilePic} alt={displayName} className="chat-avatar-img" />
                        ) : (
                          contact.avatar
                        )}
                      </span>
                      <span className="chat-request-meta">
                        <strong>{displayName}</strong>
                        <small>{contact.email || contact.username || "Awaiting response"}</small>
                      </span>
                      <span className="chat-request-status">Pending</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {isConversationRoute && (
      <section className={`chat-main ${showHeaderMenu ? "settings-open" : ""}`}>
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} aria-hidden="true" />
        {incomingCall && (
          <div className="incoming-call-popup" role="dialog" aria-live="polite" aria-label="Incoming call controls">
            <p className="incoming-call-popup-title">
              {incomingCall.mode === "video" ? "Incoming video call" : "Incoming audio call"}
            </p>
            <p className="incoming-call-popup-subtitle">{incomingCall.fromName} is calling</p>
            <div className="incoming-call-popup-actions">
              <button type="button" className="call-accept" onClick={acceptIncomingCall}>
                {incomingCall.mode === "video" ? <FiVideo /> : <FiPhone />} Attend
              </button>
              <button type="button" className="call-decline" onClick={declineIncomingCall}>
                <FiPhoneOff /> Decline
              </button>
              <button type="button" className="call-ring-toggle" onClick={toggleIncomingRingtoneMute}>
                {ringtoneMuted ? "Unmute ring" : "Mute ring"}
              </button>
            </div>
          </div>
        )}
        {callActive && callState.mode === "audio" && (
          <div className="active-call-popup" role="status" aria-live="polite" aria-label="Active call controls">
            <p className="active-call-popup-title">
              {callState.mode === "video" ? "Video call" : "Audio call"} with {callState.peerName || "User"}
            </p>
            <p className="active-call-popup-subtitle">
              {callStatusText} - Total {formatCallDuration(callDurationSec)}
            </p>
              <div className="active-call-popup-actions">
                <button type="button" className="call-ring-toggle" onClick={toggleMute}>
                  {isMuted ? "Unmute mic" : "Mute mic"}
                </button>
                <button type="button" className="call-ring-toggle" onClick={upgradeCallToVideo}>
                  Switch to video
                </button>
                <button type="button" className="call-decline" onClick={() => finishCall(true)}>
                  <FiPhoneOff /> End Call
              </button>
            </div>
          </div>
        )}
        {groupInviteOpen && (
          <div className="group-call-overlay" role="dialog" aria-label="Start group call">
            <div className="group-call-card">
              <h3>Start group video call</h3>
              <p>Select up to {GROUP_CALL_MAX} people</p>
              <div className="group-call-list">
                {contacts
                  .filter((c) => String(c?.id || "") !== String(myUserId))
                  .map((c) => {
                    const checked = groupInviteIds.includes(String(c.id));
                    const displayName = getContactDisplayName(c);
                    return (
                      <label key={c.id} className="group-call-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGroupInvite(c.id)}
                        />
                        <span>{displayName}</span>
                      </label>
                    );
                  })}
                {contacts.length === 0 && <p className="group-call-empty">No contacts available.</p>}
              </div>
              <div className="group-call-actions">
                <button
                  type="button"
                  className="group-call-start"
                  onClick={groupCallActive ? addPeopleToGroupCall : startGroupCall}
                >
                  {groupCallActive ? "Add people" : "Start call"}
                </button>
                <button type="button" className="group-call-cancel" onClick={() => setGroupInviteOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {callActive && !incomingCall && !showVideoCallScreen && (
          <button
            type="button"
            className="call-floating-end"
            onClick={() => finishCall(true)}
            title="End call"
          >
            <FiPhoneOff /> End call
          </button>
        )}

        {showVideoCallScreen && (
          <div className="wa-video-call-screen" role="dialog" aria-live="polite" aria-label="Video call screen">
            {groupCallActive ? (
              <div className="wa-video-grid">
                <div className="wa-video-tile is-local">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`wa-video-local ${isScreenSharing ? "is-screen" : "is-mirror"}`}
                    style={{ filter: activeVideoFilter.css }}
                    data-allow-simultaneous="true"
                  />
                  <span className="wa-video-name">You</span>
                </div>
                {groupRemoteTiles.map((tile) => (
                  <div className="wa-video-tile" key={tile.peerId}>
                    <video
                      autoPlay
                      playsInline
                      className={`wa-video-remote ${isScreenShareStream(tile.stream) ? "is-screen" : "is-mirror"}`}
                      style={{ filter: activeVideoFilter.css }}
                      data-allow-simultaneous="true"
                      ref={(el) => {
                        if (!el || !tile.stream) return;
                        if (el.srcObject !== tile.stream) el.srcObject = tile.stream;
                        el.play?.().catch(() => {});
                      }}
                    />
                    <span className="wa-video-name">{tile.name}</span>
                  </div>
                ))}
                {groupRemoteTiles.length === 0 && (
                  <div className="wa-video-remote-fallback" aria-live="polite">
                    <div className="wa-video-avatar">G</div>
                    <p>Waiting for others to join...</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`wa-video-remote ${remoteIsScreenShare ? "is-screen" : "is-mirror"}`}
                    style={{ filter: activeVideoFilter.css }}
                    data-allow-simultaneous="true"
                  />
                {!hasRemoteVideo && !hasRemoteAudio && (
                  <div className="wa-video-remote-indicator" aria-live="polite">
                    <span className="wa-video-remote-indicator-icon">◎</span>
                    <span className="wa-video-remote-indicator-text">Camera off</span>
                  </div>
                )}
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`wa-video-local ${isScreenSharing ? "is-screen" : "is-mirror"} ${localVideoPos ? "is-dragged" : ""}`}
                    style={{
                      filter: activeVideoFilter.css,
                      ...(localVideoPos
                        ? { left: `${localVideoPos.x}px`, top: `${localVideoPos.y}px`, right: "auto", bottom: "auto" }
                        : {})
                    }}
                    onPointerDown={startLocalVideoDrag}
                    data-allow-simultaneous="true"
                  />
              </>
            )}
            <div className="wa-video-top">
              <button
                type="button"
                className="wa-video-exit"
                onClick={() => {
                  const el = remoteVideoRef.current;
                  pipDismissedRef.current = false;
                  if (pipEnabled && el && typeof el.requestPictureInPicture === "function") {
                    el.requestPictureInPicture?.().catch(() => {});
                  }
                  navigate(-1);
                }}
                title="Exit call"
              >
                Exit
              </button>
              <p className="wa-video-peer">{callState.peerName || "User"}</p>
              <p className="wa-video-state">
                {callStatusText} - {formatCallDuration(callDurationSec)}
              </p>
            </div>
            {signAssistEnabled && (
              <div className="wa-sign-assist-panel" role="region" aria-label="Sign assist">
                <div className="wa-sign-assist-head">
                  <strong>Sign Assist</strong>
                  <label className="wa-sign-assist-auto">
                    <input
                      type="checkbox"
                      checked={signAssistAutoSpeak}
                      onChange={(e) => setAutoSpeakEnabled(e.target.checked)}
                    />
                    Auto-speak incoming
                  </label>
                  <label className="wa-sign-assist-auto">
                    <input
                      type="checkbox"
                      checked={signAssistContinuousMode}
                      onChange={(e) => setContinuousModeEnabled(e.target.checked)}
                    />
                    Continuous mode
                  </label>
                </div>
                <div className="wa-sign-assist-row">
                  <button
                    type="button"
                    className="wa-sign-assist-capture"
                    onClick={captureSignAssistFromVideo}
                    disabled={signAssistBusy}
                  >
                    {signAssistBusy ? "Capturing..." : "Capture Sign"}
                  </button>
                  <select
                    className="wa-sign-assist-gender"
                    value={signAssistVoiceGender}
                    onChange={(e) => setSignAssistVoiceGender(e.target.value)}
                    title="Voice gender"
                  >
                    <option value="female">Female voice</option>
                    <option value="male">Male voice</option>
                  </select>
                </div>
                <textarea
                  className="wa-sign-assist-input"
                  rows={2}
                  placeholder="Type or edit translated sign text..."
                  value={signAssistText}
                  onChange={(e) => setSignAssistText(e.target.value)}
                />
                <div className="wa-sign-assist-actions">
                  <button type="button" className="wa-sign-assist-send" onClick={sendSignAssistMessage}>
                    Send Sign Message
                  </button>
                  <button
                    type="button"
                    className="wa-sign-assist-toggle"
                    onClick={() => setSignAssistEnabled(false)}
                  >
                    Hide
                  </button>
                </div>
                {signAssistStatus && <p className="wa-sign-assist-status">{signAssistStatus}</p>}
              </div>
            )}
            {!FORCE_BEAUTY_FILTER && showVideoFilters && (
              <div className="wa-video-filter-panel" role="listbox" aria-label="Video filters">
                <div className="wa-filter-circle-grid">
                  {VIDEO_FILTER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={videoFilterId === preset.id}
                      className={`wa-filter-circle ${videoFilterId === preset.id ? "is-selected" : ""}`}
                      onClick={() => setVideoFilterId(preset.id)}
                      title={preset.label}
                    >
                      <span>{preset.short || preset.label.slice(0, 1)}</span>
                    </button>
                  ))}
                </div>
                <div className="wa-filter-selected-label">{activeVideoFilter?.label || "Beauty"}</div>
              </div>
            )}
            <div className="wa-video-controls">
              {callActive && (
                <button
                  type="button"
                  className="call-control"
                  onClick={openGroupInvite}
                  title="Add people"
                >
                  <FiUserPlus />
                </button>
              )}
              <button type="button" className="call-control" onClick={toggleMute} title="Mute mic">
                {isMuted ? <FiMicOff /> : <FiMic />}
              </button>
              <button type="button" className="call-control" onClick={toggleSpeaker} title="Speaker on/off">
                {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />}
              </button>
              <button
                type="button"
                className={`call-control ${isScreenSharing ? "is-active" : ""}`}
                onClick={toggleScreenShare}
                title="Screen share"
                disabled={callState.mode !== "video" || callState.phase === "idle"}
              >
                <FiMonitor />
              </button>
              <button type="button" className="call-control" onClick={toggleCamera} title="Camera on/off">
                {isCameraOff ? <FiVideoOff /> : <FiVideo />}
              </button>
              {!FORCE_BEAUTY_FILTER && (
                <button
                  type="button"
                  className={`call-control ${showVideoFilters ? "is-active" : ""}`}
                  onClick={() => setShowVideoFilters((prev) => !prev)}
                  title="Video filters"
                >
                  <FiSmile />
                </button>
              )}
              <button
                type="button"
                className={`call-control ${signAssistEnabled ? "is-active" : ""}`}
                onClick={() => setSignAssistEnabled((prev) => !prev)}
                title="Sign assist">
                <MdSignLanguage />
              </button>
              <button
                type="button"
                className="call-hangup"
                onClick={() => finishCall(true)}
                title="End call"
              >
                <FiPhoneOff />
              </button>
            </div>
          </div>
        )}

        {!activeContact && <p className="chat-placeholder">{isConversationRoute ? "Loading conversation..." : "Select a conversation"}</p>}

        {activeContact && (
          <>
            <header className="chat-header wa-header">
              <div className="chat-header-main-wrap">
                {isConversationRoute && showBackButton && (
                  <button type="button" className="chat-back-btn" onClick={() => navigate("/chat")} title="Back to inbox">
                    <FiArrowLeft />
                  </button>
                )}
                <button type="button" className="chat-header-main" onClick={() => goToProfile(activeContact)}>
                <span className="chat-avatar">
                  {activeContact.profilePic ? (
                    <img src={activeContact.profilePic} alt={activeContact.name} className="chat-avatar-img" />
                  ) : (
                    activeContact.avatar
                  )}
                </span>
                <span className="wa-header-meta">
                  <h3>{activeContact.name}</h3>
                  <small>
                    {headerPresenceText}
                    <span className="chat-ts-mode-badge" title={`Timestamp mode: ${tsModeLabel}`}>
                      {tsModeLabel}
                    </span>
                  </small>
                </span>
                </button>
              </div>

              <div className="chat-header-actions" ref={headerMenuWrapRef}>
                <div className="chat-call-menu-wrap">
                  <button
                    type="button"
                    className={`call-action call-action-menu ${showCallMenu ? "is-active" : ""}`}
                    title="Call options"
                    onClick={() => {
                      if (callActive || !!incomingCall) return;
                      setShowCallMenu((prev) => !prev);
                      setShowHeaderMenu(false);
                      setShowWallpaperPanel(false);
                    }}
                    disabled={callActive || !!incomingCall}
                    aria-haspopup="menu"
                    aria-expanded={showCallMenu}
                  >
                    <FiPhone className="call-action-icon" />
                    <FiChevronDown className="call-action-caret" />
                  </button>
                  {showCallMenu && (
                    <div className="chat-call-menu" ref={callMenuRef} role="menu">
                      <button
                        type="button"
                        className="chat-call-menu-item"
                        onClick={() => {
                          startOutgoingCall("audio");
                          setShowCallMenu(false);
                        }}
                        role="menuitem"
                      >
                        <FiPhone /> Voice call
                      </button>
                      <button
                        type="button"
                        className="chat-call-menu-item"
                        onClick={() => {
                          startOutgoingCall("video");
                          setShowCallMenu(false);
                        }}
                        role="menuitem"
                      >
                        <FiVideo /> Video call
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="call-action"
                  title="More options"
                  onClick={() => {
                    setShowHeaderMenu((prev) => !prev);
                    setShowCallMenu(false);
                    setShowWallpaperPanel(false);
                  }}
                >
                  <FiMoreVertical />
                </button>
              </div>
            </header>

            {showHeaderMenu && (
              <aside className="chat-header-menu" ref={headerMenuRef}>
                {callActive && (
                  <button
                    type="button"
                    className="chat-header-menu-row"
                    onClick={() => {
                      toggleSpeaker();
                      setShowHeaderMenu(false);
                    }}
                    title="Speaker on/off"
                  >
                    {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />} {isSpeakerOn ? "Speaker on" : "Speaker off"}
                  </button>
                )}
                <div className="chat-translate-card">
                  <label className="chat-header-menu-row chat-switch-row">
                    <span className="chat-menu-label-group">
                      <strong>Translator</strong>
                      <small>Auto-translate incoming messages</small>
                    </span>
                    <span className="chat-switch">
                      <input
                        type="checkbox"
                        checked={translatorEnabled}
                        onChange={(e) => setTranslatorEnabled(e.target.checked)}
                      />
                      <span className="chat-switch-track" />
                    </span>
                  </label>
                </div>
                <div className="chat-translate-card">
                  <label className="chat-header-menu-row chat-switch-row">
                    <span className="chat-menu-label-group">
                      <strong>Auto-speak</strong>
                      <small>Read incoming messages aloud</small>
                    </span>
                    <span className="chat-switch">
                      <input
                        type="checkbox"
                        checked={signAssistAutoSpeak}
                        onChange={(e) => setAutoSpeakEnabled(e.target.checked)}
                      />
                      <span className="chat-switch-track" />
                    </span>
                  </label>
                </div>
                {translatorEnabled && (
                  <label className="chat-header-menu-row chat-language-row">
                    <span className="chat-menu-label-group">
                      <strong>Language</strong>
                      <small>Select target language</small>
                    </span>
                    <select
                      className="chat-translate-select"
                      value={translatorLang}
                      onChange={(e) => setTranslatorLang(e.target.value)}
                    >
                      {TRANSLATE_LANG_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="chat-header-menu-row chat-language-row">
                  <span className="chat-menu-label-group">
                    <strong>Speak language</strong>
                    <small>Choose text-to-speech language</small>
                  </span>
                  <select
                    className="chat-translate-select"
                    value={speechLang}
                    onChange={(e) => setSpeechLang(e.target.value)}
                  >
                    {speechLangOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="chat-header-menu-row chat-language-row">
                  <span className="chat-menu-label-group">
                    <strong>Voice</strong>
                    <small>Select male or female voice</small>
                  </span>
                  <select
                    className="chat-translate-select"
                    value={speechVoiceGender}
                    onChange={(e) => setSpeechVoiceGender(e.target.value)}
                  >
                    <option value="female">Female voice</option>
                    <option value="male">Male voice</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="chat-header-menu-row chat-header-menu-link"
                  onClick={() => {
                    setShowWallpaperPanel(true);
                    setShowHeaderMenu(false);
                    setShowCallMenu(false);
                  }}
                >
                  <span className="chat-menu-label-group">
                    <strong>Chat wallpaper</strong>
                    <small>Choose background picture for this chat page</small>
                  </span>
                  <FiChevronDown />
                </button>
                {translatorError && <p className="chat-translate-error">{translatorError}</p>}
                <button
                  type="button"
                  className="chat-header-menu-row chat-header-danger-btn"
                  onClick={blockActiveContact}
                  disabled={activeContactBlocked}
                >
                  {activeContactBlocked ? "User blocked" : "Block user"}
                </button>
              </aside>
            )}
            {showWallpaperPanel && (
              <div className="chat-wallpaper-panel-backdrop" onClick={() => setShowWallpaperPanel(false)}>
                <div
                  className="chat-wallpaper-panel"
                  ref={wallpaperPanelRef}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="chat-wallpaper-panel-head">
                    <div className="chat-wallpaper-panel-title">
                      <strong>Chat wallpaper</strong>
                      <small>Choose background picture for this chat page</small>
                    </div>
                    <button
                      type="button"
                      className="chat-wallpaper-close"
                      onClick={() => setShowWallpaperPanel(false)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="chat-wallpaper-grid">
                    {CHAT_WALLPAPER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`chat-wallpaper-chip ${chatWallpaper?.presetId === preset.id ? "is-active" : ""}`}
                        onClick={() => selectChatWallpaperPreset(preset.id)}
                      >
                        <span
                          className="chat-wallpaper-chip-preview"
                          style={preset.image ? { backgroundImage: `url("${preset.image}")` } : undefined}
                        />
                        <small>{preset.label}</small>
                      </button>
                    ))}
                  </div>
                  <div className="chat-wallpaper-actions">
                    <button type="button" className="chat-wallpaper-upload" onClick={openWallpaperPicker}>
                      Upload Picture
                    </button>
                    {!!chatWallpaper?.image && (
                      <button
                        type="button"
                        className="chat-wallpaper-upload"
                        onClick={() => openWallpaperEditor(chatWallpaper)}
                      >
                        Preview / Adjust
                      </button>
                    )}
                    <button
                      type="button"
                      className="chat-wallpaper-upload secondary"
                      onClick={() => selectChatWallpaperPreset("none")}
                    >
                      Remove
                    </button>
                    <input
                      ref={wallpaperInputRef}
                      type="file"
                      accept="image/*"
                      className="chat-hidden-file-input"
                      onChange={onWallpaperPicked}
                    />
                  </div>
                </div>
              </div>
            )}

            {(incomingCall || (callActive && callState.mode === "audio") || callError) && (
              <div className="call-panel">
                {callLabel && <p className="call-status">{callLabel}</p>}
                {callError && <p className="call-error">{callError}</p>}

                {incomingCall && (
                  <div className="incoming-call-actions">
                    <button type="button" className="call-accept" onClick={acceptIncomingCall}>
                      {incomingCall.mode === "video" ? <FiVideo /> : <FiPhone />} Attend
                    </button>
                    <button type="button" className="call-decline" onClick={declineIncomingCall}>
                      <FiPhoneOff /> Decline
                    </button>
                  </div>
                )}

                {callActive && (
                  <>
                    {callState.mode === "audio" && (
                      <div className="audio-call-pill">
                        <span>{callState.peerName || "User"}</span>
                      </div>
                    )}

                    <div className="in-call-controls">
                      <button type="button" className="call-control" onClick={toggleMute} title="Mute mic">
                        {isMuted ? <FiMicOff /> : <FiMic />}
                      </button>
                      <button type="button" className="call-control" onClick={toggleSpeaker} title="Speaker on/off">
                        {isSpeakerOn ? <FiVolume2 /> : <FiVolumeX />}
                      </button>
                      {callState.mode === "audio" && (
                        <>
                          <button type="button" className="call-control" onClick={upgradeCallToVideo} title="Switch to video">
                            <FiVideo />
                          </button>
                          <button
                            type="button"
                            className="call-control"
                            onClick={openGroupInvite}
                            title="Group video call"
                            disabled={!!incomingCall}
                          >
                            <FiUsers />
                          </button>
                        </>
                      )}
                      <button type="button" className="call-hangup" onClick={() => finishCall(true)}>
                        <FiPhoneOff />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div ref={threadRef} onScroll={onThreadScroll} className="chat-thread wa-thread" style={threadWallpaperStyle}>

              {chatItems.map((item) => {
                if (item.kind === "day") {
                  return (
                    <div key={item.id} className="chat-day-sep">
                      {item.label}
                    </div>
                  );
                }
                const reelShare = item.kind === "message" ? extractReelShare(item.raw?.text || item.text) : null;
                const senderName = item.mine
                  ? "You"
                  : String(activeContact?.name || activeContact?.username || "User").trim();
                const senderInitial = senderName ? senderName.charAt(0).toUpperCase() : "U";
                const renderReelShareCard = (mediaUrl) => {
                  if (!reelShare) return null;
                  const openReel = () => {
                    if (reelShare?.href) navigate(reelShare.href);
                  };
                  const preview = reelShare?.id ? reelPreviewById[reelShare.id] : null;
                  const previewSrc = mediaUrl || preview?.src || "";
                  const previewPoster = preview?.poster || reelPosterBySrc[previewSrc] || "";
                  return (
                    <div className="chat-reel-wrap">
                      <div className={`chat-reel-card ${item.mine ? "mine" : "their"}`}>
                        <button type="button" className="chat-reel-media" onClick={openReel}>
                          {previewSrc && previewPoster ? (
                            <video
                              className="chat-reel-video"
                              src={previewSrc}
                              poster={previewPoster || undefined}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : previewPoster ? (
                            <img
                              className="chat-reel-video"
                              src={previewPoster}
                              alt="Reel preview"
                              loading="lazy"
                            />
                          ) : previewSrc ? (
                            <div className="chat-reel-video chat-reel-placeholder">Loading...</div>
                          ) : (
                            <div className="chat-reel-video chat-reel-placeholder">REEL</div>
                          )}
                          <div className="chat-reel-overlay">
                            <span className="chat-reel-play">▶</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  );
                };
                const enableBubbleMenu = item.kind === "message";
                const callCard = item.kind === "call" ? formatCallCard(item.raw) : null;
                return (
                  <div
                    key={item.id}
                    className={`chat-bubble ${
                      item.kind === "call" ? `call-log ${item.mine ? "mine" : "their"}` : item.mine ? "mine" : "their"
                    }`}
                    data-chat-msg-id={item.kind === "message" ? String(item.raw?.id || "") : undefined}
                    onContextMenu={enableBubbleMenu ? (e) => openBubbleMenu(e, item) : undefined}
                    onPointerUp={enableBubbleMenu ? (e) => openBubbleMenuOnClick(e, item) : undefined}
                    onTouchStart={enableBubbleMenu ? (e) => onBubbleTouchStart(item, e) : undefined}
                    onTouchMove={enableBubbleMenu ? (e) => onBubbleTouchMove(item, e) : undefined}
                    onTouchEnd={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                    onTouchCancel={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                  >
                    <div className={`chat-bubble-line ${item.kind === "call" ? "call-line" : ""}`}>
                      {item.kind === "message" && item.raw?.replyTo && (
                        <div className={`chat-reply-chip ${item.mine ? "mine" : "their"}`}>
                          <small>
                            {String(item.raw.replyTo.senderId || "") === String(myUserId)
                              ? "You"
                              : item.raw.replyTo.senderName || "Message"}
                          </small>
                          <span>{trimReplyPreview(item.raw.replyTo.preview || "Message")}</span>
                        </div>
                      )}
                      {item.kind === "message" && item.raw?.audioUrl ? (
                        <div className={`chat-voice-note ${item.mine ? "mine" : "their"}`}>
                          {item.mine && (
                            <span className="chat-voice-note-icon" aria-hidden="true">
                              <FiVolume2 />
                            </span>
                          )}
                          <audio controls preload="metadata" className="chat-audio" src={toApiUrl(item.raw.audioUrl)} />
                        </div>
                      ) : item.kind === "message" && item.raw?.mediaUrl ? (
                        (() => {
                          const mediaUrl = resolveMediaUrl(item.raw.mediaUrl);
                          const fileName = String(item.raw?.fileName || "");
                          const textLabel = String(item.raw?.text || "");
                          const looksAudio =
                            item.raw?.mediaType === "audio" ||
                            /\.(webm|ogg|mp3|m4a|wav|aac|opus)(\?|#|$)/i.test(fileName) ||
                            /\.(webm|ogg|mp3|m4a|wav|aac|opus)(\?|#|$)/i.test(textLabel) ||
                            /\.(webm|ogg|mp3|m4a|wav|aac|opus)(\?|#|$)/i.test(mediaUrl);
                          if (looksAudio) {
                            return (
                              <div className={`chat-voice-note ${item.mine ? "mine" : "their"}`}>
                                {item.mine && (
                                  <span className="chat-voice-note-icon" aria-hidden="true">
                                    <FiVolume2 />
                                  </span>
                                )}
                                <audio controls preload="metadata" className="chat-audio" src={mediaUrl} />
                              </div>
                            );
                          }
                          if (item.raw?.mediaType === "image") {
                            return (
                              <button
                                type="button"
                                className="chat-media-image-btn"
                                onClick={() => openImagePreview(mediaUrl, fileName || "image")}
                              >
                                <img
                                  src={mediaUrl}
                                  alt={fileName || "image"}
                                  className="chat-media-image"
                                />
                              </button>
                            );
                          }
                          if (item.raw?.mediaType === "video") {
                            if (reelShare) {
                              return renderReelShareCard(mediaUrl);
                            }
                            return (
                              <video controls preload="metadata" className="chat-media-video" src={mediaUrl} />
                            );
                          }
                          return (
                            <a className="chat-file-link" href={mediaUrl} target="_blank" rel="noreferrer">
                              File: {fileName || "Download file"}
                            </a>
                          );
                        })()
                      ) : item.kind === "message" && reelShare ? (
                        renderReelShareCard("")
                      ) : item.kind === "message" && /^\[Attachment:\s*.+\]$/i.test(String(item.raw?.text || "")) ? (
                        <span className="chat-attachment-text">{String(item.raw?.text || "")}</span>
                      ) : item.kind === "call" ? (
                        <div className="call-card">
                          <span className={`call-dot ${callCard?.tone ? `is-${callCard.tone}` : ""}`} aria-hidden="true">
                            {callCard?.icon === "video" ? <FiVideo /> : callCard?.icon === "off" ? <FiPhoneOff /> : <FiPhone />}
                          </span>
                          <span className="call-card-text">
                            <strong>{callCard?.title || "Call"}</strong>
                            <small>{callCard?.subtitle || ""}</small>
                          </span>
                        </div>
                      ) : (
                        <>
                          <span>{decodeSignAssistText(item.raw?.text || item.text)?.text || item.text}</span>
                          {item.kind === "message" && decodeSignAssistText(item.raw?.text || item.text) && (
                            <small className="chat-sign-assist-badge">
                              Sign Assist - Voice: {decodeSignAssistText(item.raw?.text || item.text)?.voiceGender || "neutral"}
                            </small>
                          )}
                          {item.kind === "message" && canTranslateMessage(item.raw) && translatorEnabled && (() => {
                            const msgKey = String(item.raw?.id || `${item.raw?.createdAt}_${item.raw?.text}`);
                            const translated = String(translatedIncomingById[msgKey] || "").trim();
                            if (!translated) return null;
                            if (translated.toLowerCase() === String(item.text || "").trim().toLowerCase()) return null;
                            return (
                              <small className="chat-translated-text" title="Translated">
                                {translated}
                              </small>
                            );
                          })()}
                        </>
                      )}
                    </div>
                    <small className="chat-bubble-time">
                      {formatMessageTime(item.createdAt)}
                      {item.kind === "message" && item.mine && (item.raw?.audioUrl || item.raw?.mediaType === "audio") && (
                        <span className="chat-voice-status-icon" title="Voice note" aria-label="Voice note">
                          <FiVolume2 />
                        </span>
                      )}
                      {item.kind === "message" && item.mine && (() => {
                        const tickState = getMessageTickState(item.raw);
                        if (!tickState) return null;
                        return (
                          <span className={`chat-read-ticks ${tickState}`} aria-label={tickState}>
                            {getTickSymbol(tickState)}
                          </span>
                        );
                      })()}
                    </small>
                  </div>
                );
              })}
              {threadItems.length === 0 && <p className="chat-empty-thread">No messages yet. Say hi.</p>}
            </div>
            {showScrollDown && (
              <button
                type="button"
                className="chat-scroll-bottom-btn"
                onClick={() => scrollThreadToBottom("smooth")}
                aria-label="Scroll to latest message"
                title="Scroll down"
              >
                <FiChevronDown />
              </button>
            )}

            {showEmojiTray && (
              <div className="emoji-tray" aria-label="Emoji and sticker picker">
                <div className="emoji-tray-tabs" role="tablist" aria-label="Picker tabs">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={pickerTab === "emoji"}
                    className={`emoji-tab ${pickerTab === "emoji" ? "is-active" : ""}`}
                    onClick={() => setPickerTab("emoji")}
                  >
                    Emojis
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={pickerTab === "sticker"}
                    className={`emoji-tab ${pickerTab === "sticker" ? "is-active" : ""}`}
                    onClick={() => setPickerTab("sticker")}
                  >
                    Stickers
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={pickerTab === "favorite"}
                    className={`emoji-tab ${pickerTab === "favorite" ? "is-active" : ""}`}
                    onClick={() => setPickerTab("favorite")}
                  >
                    Favorites
                  </button>
                </div>

                {pickerTab === "emoji" && (
                  <div className="emoji-grid" role="listbox" aria-label="Emoji picker">
                    {QUICK_EMOJIS.map((emoji) => (
                      <div key={`emoji-${emoji}`} className="emoji-chip-wrap">
                        <button type="button" className="emoji-chip" onClick={() => onEmojiPick(emoji)}>
                          {emoji}
                        </button>
                        <button
                          type="button"
                          className={`emoji-fav-btn ${isFavoritePick("emoji", emoji) ? "is-active" : ""}`}
                          title="Add to favorites"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoritePick({ type: "emoji", value: emoji, label: emoji });
                          }}
                        >
                          ?
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pickerTab === "sticker" && (
                  <div className="sticker-grid" role="listbox" aria-label="Sticker picker">
                    <button type="button" className="sticker-create-btn" onClick={openStickerPicker}>
                      + Create sticker from image
                    </button>
                    {customStickers.map((sticker) => (
                      <div key={sticker.id} className="sticker-chip-wrap sticker-image-wrap">
                        <button type="button" className="sticker-image-chip" onClick={() => onCustomStickerPick(sticker)}>
                          <img src={sticker.dataUrl} alt={sticker.name || "Sticker"} />
                          <small>{sticker.name || "My sticker"}</small>
                        </button>
                        <button
                          type="button"
                          className={`emoji-fav-btn ${isFavoritePick("customSticker", sticker.id) ? "is-active" : ""}`}
                          title="Add to favorites"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoritePick({ type: "customSticker", value: sticker.id, label: sticker.name || "My sticker" });
                          }}
                        >
                          ?
                        </button>
                        <button
                          type="button"
                          className="emoji-fav-btn"
                          title="Remove sticker"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomSticker(sticker.id);
                          }}
                        >
                          ?
                        </button>
                      </div>
                    ))}
                    {STICKER_PACKS.map((sticker) => (
                      <div key={sticker.id} className="sticker-chip-wrap">
                        <button type="button" className="sticker-chip" onClick={() => onStickerPick(sticker.value)}>
                          <span>{sticker.value}</span>
                          <small>{sticker.label}</small>
                        </button>
                        <button
                          type="button"
                          className={`emoji-fav-btn ${isFavoritePick("sticker", sticker.value) ? "is-active" : ""}`}
                          title="Add to favorites"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoritePick({ type: "sticker", value: sticker.value, label: sticker.label });
                          }}
                        >
                          ?
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pickerTab === "favorite" && (
                  <div className="sticker-grid" role="listbox" aria-label="Favorite picks">
                    {favoriteItemsForTray.length === 0 && (
                      <p className="emoji-empty">No favorites yet. Tap ? to save emojis and stickers.</p>
                    )}
                    {favoriteItemsForTray.map((fav, idx) => (
                      <div key={`${fav.type}-${fav.value}-${idx}`} className="sticker-chip-wrap">
                        <button
                          type="button"
                          className={fav.type === "sticker" ? "sticker-chip" : fav.type === "customSticker" ? "sticker-image-chip" : "emoji-chip"}
                          onClick={() => {
                            if (fav.type === "sticker") onStickerPick(fav.value);
                            else if (fav.type === "customSticker") onCustomStickerPick(fav.sticker);
                            else onEmojiPick(fav.value);
                          }}
                        >
                          {fav.type === "sticker" ? (
                            <>
                              <span>{fav.value}</span>
                              <small>{fav.label || "Sticker"}</small>
                            </>
                          ) : fav.type === "customSticker" ? (
                            <>
                              <img src={fav.sticker?.dataUrl} alt={fav.label || "Sticker"} />
                              <small>{fav.label || "My sticker"}</small>
                            </>
                          ) : (
                            fav.value
                          )}
                        </button>
                        <button
                          type="button"
                          className="emoji-fav-btn is-active"
                          title="Remove from favorites"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoritePick(fav);
                          }}
                        >
                          ?
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {replyDraft && (
              <div className="chat-reply-draft">
                <div className="chat-reply-draft-text">
                  <strong>
                    Replying to {String(replyDraft.senderId || "") === String(myUserId) ? "You" : (replyDraft.senderName || "User")}
                  </strong>
                  <span>{trimReplyPreview(replyDraft.preview || "Message")}</span>
                </div>
                <button type="button" className="chat-reply-draft-cancel" onClick={() => setReplyDraft(null)}>
                  Cancel
                </button>
              </div>
            )}

            <div className="chat-input-row wa-input-row">
              <button type="button" className="input-icon composer-emoji-btn" title="Emoji" onClick={toggleEmojiTray}>
                <FiSmile />
              </button>
              <input
                className="composer-input"
                ref={composerInputRef}
                type="text"
                placeholder="Message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />
              <button type="button" className="input-icon composer-attach-btn" title="Attach" onClick={openAttachPicker}>
                <FiPaperclip />
              </button>
              <button type="button" className="input-icon composer-camera-btn" title="Camera" onClick={openCameraPicker}>
                <FiCamera />
              </button>
              <select
                className="speech-lang-select composer-lang-select"
                value={speechLang}
                onChange={(e) => setSpeechLang(e.target.value)}
                title="Speech language"
              >
                {speechLangOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {hasDraft ? (
                <button
                  type="button"
                  className="chat-send-btn composer-send-btn"
                  onClick={sendMessage}
                  aria-label="Send message"
                >
                  <FiSend />
                </button>
              ) : (
                <div className="composer-voice-actions">
                  <button
                    type="button"
                    className={`mic-fab composer-send-btn ${isSpeechTyping ? "active" : ""}`}
                    title={isSpeechTyping ? "Stop speech typing" : "Mic: speak to type"}
                    onClick={toggleSpeechTyping}
                  >
                    {isSpeechTyping ? <FiMicOff /> : <FiMic />}
                  </button>
                  <button
                    type="button"
                    className={`mic-fab composer-send-btn ${isRecordingAudio ? "active" : ""}`}
                    title={isRecordingAudio ? "Stop and send voice note" : "Speaker: record voice note"}
                    onClick={toggleAudioRecording}
                  >
                    {isRecordingAudio ? <FiMicOff /> : <FiVolume2 />}
                  </button>
                </div>
              )}
              <input
                ref={attachInputRef}
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar"
                className="chat-hidden-file-input"
                onChange={onFilePicked}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="chat-hidden-file-input"
                onChange={onFilePicked}
              />
              <input
                ref={stickerInputRef}
                type="file"
                accept="image/*"
                className="chat-hidden-file-input"
                onChange={onStickerImagePicked}
              />
            </div>
            {showWallpaperEditor && wallpaperDraft?.image && (
              <div className="chat-wallpaper-editor-backdrop" onClick={closeWallpaperEditor}>
                <div className="chat-wallpaper-editor" onClick={(e) => e.stopPropagation()}>
                  <div className="chat-wallpaper-preview-head">
                    <strong>Live preview</strong>
                    <small>Adjust wallpaper as needed</small>
                  </div>
                  <div
                    className="chat-wallpaper-live-preview editor"
                    style={{
                      backgroundImage: `linear-gradient(rgba(2, 8, 16, 0.72), rgba(2, 8, 16, 0.78)), url("${wallpaperDraft.image}")`,
                      backgroundSize:
                        wallpaperDraft.fit === "contain"
                          ? `${Number(wallpaperDraft.zoom || 100)}% auto`
                          : wallpaperDraft.fit === "stretch"
                            ? "100% 100%"
                            : `${Number(wallpaperDraft.zoom || 100)}% ${Number(wallpaperDraft.zoom || 100)}%`,
                      backgroundPosition: `${Number(wallpaperDraft.x || 50)}% ${Number(wallpaperDraft.y || 50)}%`,
                      backgroundRepeat: "no-repeat"
                    }}
                  />
                  <div className="chat-wallpaper-control-grid">
                    <label className="chat-wallpaper-control">
                      <span>Fit</span>
                      <select
                        value={String(wallpaperDraft?.fit || "cover")}
                        onChange={(e) => updateWallpaperOptions({ fit: String(e.target.value || "cover") })}
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="stretch">Stretch</option>
                      </select>
                    </label>
                    <label className="chat-wallpaper-control">
                      <span>Zoom</span>
                      <input
                        type="range"
                        min="60"
                        max="220"
                        step="1"
                        value={Number(wallpaperDraft?.zoom || 100)}
                        onChange={(e) => updateWallpaperOptions({ zoom: Number(e.target.value) || 100 })}
                      />
                    </label>
                    <label className="chat-wallpaper-control">
                      <span>Horizontal</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Number(wallpaperDraft?.x || 50)}
                        onChange={(e) => updateWallpaperOptions({ x: Number(e.target.value) || 50 })}
                      />
                    </label>
                    <label className="chat-wallpaper-control">
                      <span>Vertical</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Number(wallpaperDraft?.y || 50)}
                        onChange={(e) => updateWallpaperOptions({ y: Number(e.target.value) || 50 })}
                      />
                    </label>
                  </div>
                  <div className="chat-wallpaper-editor-actions">
                    <button type="button" className="chat-wallpaper-upload secondary" onClick={closeWallpaperEditor}>
                      Cancel
                    </button>
                    <button type="button" className="chat-wallpaper-upload" onClick={applyWallpaperEditor}>
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
            {bubbleMenu && (
              <div className="bubble-menu-backdrop" onClick={closeBubbleMenu}>
                <div
                  className="bubble-menu"
                  style={{ top: bubbleMenu.y, left: bubbleMenu.x }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button type="button" onClick={copyBubbleItem}>Copy</button>
                  {getBubbleDownloadInfo(bubbleMenu?.item) && (
                    <button type="button" onClick={saveBubbleMedia}>Save to gallery</button>
                  )}
                  {bubbleMenu?.item?.kind === "message" && bubbleMenu?.item?.mine && (
                    <button type="button" className="bubble-menu-danger" onClick={deleteBubbleItemForEveryone}>
                      Delete for everyone
                    </button>
                  )}
                  <button type="button" onClick={deleteBubbleItem}>Delete</button>
                  <button type="button" onClick={closeBubbleMenu}>Cancel</button>
                </div>
              </div>
            )}
            {imagePreview && (
              <div className="chat-image-preview-backdrop" onClick={closeImagePreview}>
                <button
                  type="button"
                  className="chat-image-preview-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeImagePreview();
                  }}
                  aria-label="Close image preview"
                >
                  ×
                </button>
                <img
                  src={imagePreview.src}
                  alt={imagePreview.alt || "Image preview"}
                  className="chat-image-preview"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </>
        )}
      </section>
      )}
      {storyViewerIndex != null && activeStory && (
        <div className="chat-story-viewer-backdrop" onClick={closeStory}>
          <div className="chat-story-player" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const mediaUrl = resolvedStoryMediaUrl;
              const isVideo = resolvedStoryIsVideo;
              const label = String(activeStory?.storyText || activeStory?.caption || "").trim();
              const storyUserNameRaw = resolveStoryUsername(activeStory);
              const storyUserLabel = storyUserNameRaw
                ? storyUserNameRaw
                : String(activeStory?.userId || "") === String(myUserId || "")
                  ? "You"
                  : "Story";
              const isMyStoryItem = (() => {
                const storyUserId = String(getStoryUserIdValue(activeStory) || "").trim();
                if (storyUserId && myUserId && storyUserId === String(myUserId)) return true;
                const storyEmail = String(getStoryUserEmailValue(activeStory) || "").trim().toLowerCase();
                if (storyEmail && myEmail && storyEmail === String(myEmail || "").trim().toLowerCase()) return true;
                return false;
              })();
              const storyKey = storyKeyFor(activeStory, storyViewerIndex);
              const storyReaction = storyReactions?.[storyKey] || {};
              const storyLiked = Boolean(storyReaction.liked);
              const storyLikeCount = Number(activeStory?.likeCount || 0);
              const storyCommentCount = Number(activeStory?.commentCount || 0);
              const storyViewCount = Number(activeStory?.viewCount || 0);
              const storyOptionsGroup = storyViewerGroupKey
                ? storyGroupsByKey.get(storyViewerGroupKey)
                : null;
              const openViewerOptions = () => {
                const fallbackGroup =
                  !storyOptionsGroup && storyViewerItems.length
                    ? { key: storyViewerGroupKey || "viewer", items: storyViewerItems }
                    : null;
                const target = storyOptionsGroup || fallbackGroup;
                if (target) openStoryOptions(target);
              };
              const toggleStoryLike = async () => {
                const nextLiked = !storyLiked;
                setStoryReactions((prev) => {
                  const current = prev?.[storyKey] || {};
                  return {
                    ...prev,
                    [storyKey]: { ...current, liked: nextLiked }
                  };
                });

                const storyId = activeStory?.id;
                if (!storyId) return;
                try {
                  let payload = null;
                  if (nextLiked) {
                    const res = await api.post(`/api/stories/${storyId}/like`);
                    payload = res?.data;
                  } else {
                    const res = await api.delete(`/api/stories/${storyId}/like`);
                    payload = res?.data;
                  }
                  if (payload && typeof payload === "object") {
                    applyStoryStats(storyId, {
                      likeCount: payload.likeCount,
                      commentCount: payload.commentCount,
                      viewCount: payload.viewCount,
                      likedByMe: Boolean(payload.liked)
                    });
                  }
                } catch {
                  setStoryReactions((prev) => {
                    const current = prev?.[storyKey] || {};
                    return {
                      ...prev,
                      [storyKey]: { ...current, liked: !nextLiked }
                    };
                  });
                }
              };
              const submitStoryComment = async () => {
                const text = String(storyCommentDraft || "").trim();
                if (!text) return;
                setStoryCommentDraft("");
                setStoryCommentOpen(false);
                const storyId = activeStory?.id;
                if (!storyId) return;
                try {
                  const res = await api.post(`/api/stories/${storyId}/comment`, { text });
                  const payload = res?.data;
                  if (payload && typeof payload === "object") {
                    applyStoryStats(storyId, {
                      likeCount: payload.likeCount,
                      commentCount: payload.commentCount,
                      viewCount: payload.viewCount,
                      likedByMe: Boolean(payload.liked)
                    });
                  }
                } catch {
                  // ignore comment failure
                }
              };
              return (
                <>
                  <div className="chat-story-progress">
                    {storyViewerItems.map((story, idx) => {
                      const key = story?.id ? `${story.id}` : `${idx}`;
                      let width = 0;
                      if (idx < storyViewerIndex) width = 100;
                      else if (idx === storyViewerIndex) width = Math.round(storyPlayerProgress * 100);
                      return (
                        <div key={key} className="chat-story-progress-bar">
                          <span style={{ width: `${width}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="chat-story-player-header">
                    <div className="chat-story-player-meta">
                      <strong>{storyUserLabel || "Story"}</strong>
                      <span>
                        {storyViewerIndex + 1}/{storyViewerItems.length}
                      </span>
                    </div>
                    <div className="chat-story-player-actions">
                      {isVideo && mediaUrl && (
                        <button
                          type="button"
                          className="ghost"
                          aria-label={storyViewerMuted ? "Unmute story" : "Mute story"}
                          onClick={() => {
                            setStoryViewerMuted((prev) => {
                              const next = !prev;
                              if (storyViewerVideoRef.current) {
                                storyViewerVideoRef.current.muted = next;
                                if (!next) {
                                  storyViewerVideoRef.current.play?.().catch(() => {});
                                }
                              }
                              return next;
                            });
                          }}
                        >
                          {storyViewerMuted ? <FiVolumeX /> : <FiVolume2 />}
                        </button>
                      )}
                      {isMyStoryItem && (
                        <button
                          type="button"
                          className="ghost"
                          aria-label="Story options"
                          onClick={(event) => {
                            event.stopPropagation();
                            openViewerOptions();
                          }}
                        >
                          <FiMoreVertical />
                        </button>
                      )}
                      <button type="button" className="close" aria-label="Close story" onClick={closeStory}>
                        <FiX />
                      </button>
                    </div>
                  </div>
                  <div
                    className="chat-story-player-media"
                    onPointerDown={pauseStoryPlayback}
                    onPointerUp={resumeStoryPlayback}
                    onPointerLeave={resumeStoryPlayback}
                    onPointerCancel={resumeStoryPlayback}
                  >
                    {mediaUrl ? (
                      isVideo ? (
                        <video
                          key={mediaUrl}
                          ref={storyViewerVideoRef}
                          src={mediaUrl}
                          autoPlay
                          muted={storyViewerMuted}
                          playsInline
                          preload="auto"
                          controls={false}
                          onLoadedData={(event) => {
                            clearStoryViewerLoadTimer();
                            setStoryViewerLoading(false);
                            handleStoryVideoLoaded(event);
                          }}
                          onCanPlay={(event) => {
                            clearStoryViewerLoadTimer();
                            setStoryViewerLoading(false);
                            handleStoryVideoLoaded(event);
                          }}
                          onTimeUpdate={handleStoryVideoTimeUpdate}
                          onEnded={handleStoryVideoEnded}
                          onError={() => {
                            clearStoryViewerLoadTimer();
                            handleStoryViewerMediaError();
                          }}
                          onPlay={() => {
                            if (!storyPlayerPausedRef.current) {
                              setStoryPlayerPaused(false);
                            }
                          }}
                          onPause={() => {
                            if (!storyPlayerPausedRef.current) {
                              setStoryPlayerPaused(true);
                            }
                          }}
                        />
                      ) : (
                        <img
                          src={mediaUrl}
                          alt={label}
                          onLoad={() => setStoryViewerLoading(false)}
                          onError={handleStoryViewerMediaError}
                        />
                      )
                    ) : (
                      <div className="chat-story-player-empty">Story media not available</div>
                    )}
                    {storyViewerLoading && <div className="chat-story-player-status">Loading story...</div>}
                    {storyViewerLoadError && (
                      <div className="chat-story-player-status error">{storyViewerLoadError}</div>
                    )}
                    {storyPlayerPaused && !storyViewerLoadError && (
                      <div className="chat-story-player-paused">Paused</div>
                    )}
                  </div>
                  {label && <p className="chat-story-player-caption">{label}</p>}
                  <div className="chat-story-reactions">
                    <span className="chat-story-reaction-user">{storyUserLabel || "Story"}</span>
                    <div className="chat-story-reaction-buttons">
                      <button
                        type="button"
                        className={`chat-story-reaction-btn ${storyLiked ? "is-liked" : ""}`}
                        onClick={toggleStoryLike}
                      >
                        <FiHeart />
                        {storyLiked ? "Liked" : "Like"}
                      </button>
                      <button
                        type="button"
                        className="chat-story-reaction-btn"
                        onClick={() => setStoryCommentOpen((prev) => !prev)}
                      >
                        <FiMessageCircle />
                        Comment
                      </button>
                    </div>
                  </div>
                  {isMyStoryItem && (
                    <div className="chat-story-stats" aria-label="Story stats">
                      <span className="chat-story-stat">
                        <FiHeart />
                        {formatStoryCount(storyLikeCount)}
                      </span>
                      <span className="chat-story-stat">
                        <FiMessageCircle />
                        {formatStoryCount(storyCommentCount)}
                      </span>
                      <span className="chat-story-stat">
                        <FiEye />
                        {formatStoryCount(storyViewCount)}
                      </span>
                    </div>
                  )}
                  {storyCommentOpen && (
                    <div className="chat-story-comment-row">
                      <input
                        type="text"
                        placeholder="Add a comment..."
                        value={storyCommentDraft}
                        onChange={(e) => setStoryCommentDraft(e.target.value)}
                      />
                      <button type="button" aria-label="Send comment" onClick={submitStoryComment}>
                        <FiSend />
                      </button>
                    </div>
                  )}
                  {storyViewerItems.length > 1 && (
                    <div className="chat-story-player-nav">
                      <button
                        type="button"
                        className="prev"
                        onClick={(e) => {
                          e.stopPropagation();
                          goPrevStory();
                        }}
                        disabled={storyViewerIndex <= 0}
                        aria-label="Previous story"
                      />
                      <button
                        type="button"
                        className="next"
                        onClick={(e) => {
                          e.stopPropagation();
                          goNextStory();
                        }}
                        disabled={storyViewerIndex >= storyViewerItems.length - 1}
                        aria-label="Next story"
                      />
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
      {storyOptionsOpen && storyOptionsItems.length > 0 && (
        <div className="chat-story-options-backdrop" onClick={closeStoryOptions}>
          <div className="chat-story-options" onClick={(e) => e.stopPropagation()}>
            <h4>Story options</h4>
            <button
              type="button"
              onClick={() => {
                deleteStoryItems([storyOptionsItems[0]]);
                closeStoryOptions();
              }}
            >
              {storyOptionsItems.length > 1 ? "Delete latest story" : "Delete story"}
            </button>
            {storyOptionsItems.length > 1 && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  deleteStoryItems(storyOptionsItems);
                  closeStoryOptions();
                }}
              >
                Delete all stories
              </button>
            )}
            <button type="button" className="ghost" onClick={closeStoryOptions}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}










