import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCamera,
  FiChevronDown,
  FiMic,
  FiMicOff,
  FiMoreVertical,
  FiPaperclip,
  FiPhone,
  FiPhoneOff,
  FiSmile,
  FiVolume2,
  FiVolumeX,
  FiVideo,
  FiVideoOff
} from "react-icons/fi";
import { MdSignLanguage } from "react-icons/md";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { clearAuthStorage } from "../auth";
import { SETTINGS_KEY, readSoundPrefs } from "./soundPrefs";
import "./Chat.css";

const POLL_MS = 1200;
const LOCAL_CHAT_KEY = "socialsea_chat_fallback_v1";
const HIDDEN_CHAT_MSG_IDS_KEY = "socialsea_hidden_msg_ids_v1";
const CALL_HISTORY_KEY = "socialsea_call_history_v1";
const CALL_SIGNAL_LOCAL_KEY = "socialsea_call_signal_local_v1";
const CHAT_READ_RECEIPT_KEY = "socialsea_chat_read_receipt_v1";
const CHAT_READ_RECEIPT_CHANNEL = "socialsea-chat-read-receipt";
const CHAT_MESSAGE_LOCAL_KEY = "socialsea_chat_message_local_v1";
const CHAT_MESSAGE_CHANNEL = "socialsea-chat-message";
const CALL_ACCEPT_TARGET_KEY = "socialsea_call_accept_target_v1";
const CALL_RING_MS = 30000;
const CALL_POLL_MS = 1200;
const CALL_SIGNAL_MAX_AGE_MS = 45000;
const CHAT_ONLINE_WINDOW_MS = 600000;
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 10
};
const CHAT_FAVORITES_KEY = "socialsea_chat_favorites_v1";
const CHAT_CUSTOM_STICKERS_KEY = "socialsea_chat_custom_stickers_v1";
const CHAT_TRANSLATOR_KEY = "socialsea_chat_translator_v1";
const CHAT_WALLPAPER_KEY = "socialsea_chat_wallpaper_v1";
const BLOCKED_USERS_KEY = "socialsea_blocked_users_v1";
const DELETE_FOR_EVERYONE_TOKEN = "__SS_DELETE_EVERYONE__:";
const SIGN_ASSIST_TOKEN = "__SS_SIGN_ASSIST__:";
const SIGN_VOICE_GENDERS = ["female", "male"];
const SIGN_LOCAL_TF_SCRIPT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const SIGN_LOCAL_HANDPOSE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js";
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
  { id: "graphite", label: "Graphite", image: createWallpaperSvgData("#090909", "#1a1d23", "#8a8d95", "#f4f4f4") }
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

  const isolatedIndexUp = indexUp && middleFolded && ringFolded && pinkyFolded;
  const isolatedIndexDown = indexDown && middleFolded && ringFolded && pinkyFolded;
  const victory = indexUp && middleUp && !ringUp && !pinkyUp;
  const openPalm = indexUp && middleUp && ringUp && pinkyUp;
  const fist = !indexUp && middleFolded && ringFolded && pinkyFolded;
  const thumbsUp = thumbRaised && !indexUp && middleFolded && ringFolded && pinkyFolded;

  if (isolatedIndexUp) return "I need help.";
  if (isolatedIndexDown) return "I am okay.";
  if (thumbsUp) return "Okay, understood.";
  if (victory) return "Yes.";
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
const VIDEO_FILTER_PRESETS = [
  { id: "beauty_soft", label: "Beauty", css: "brightness(1.06) saturate(1.14) contrast(1.05)" },
  { id: "studio_clear", label: "Studio", css: "brightness(1.08) contrast(1.1) saturate(1.06)" },
  { id: "porcelain", label: "Porcelain", css: "brightness(1.12) contrast(0.96) saturate(1.08)" },
  { id: "warm_glow", label: "Warm Glow", css: "brightness(1.08) saturate(1.16) sepia(0.14)" },
  { id: "golden_hour", label: "Golden Hour", css: "brightness(1.09) saturate(1.2) sepia(0.18) hue-rotate(-8deg)" },
  { id: "cool_luxe", label: "Cool Luxe", css: "brightness(1.04) contrast(1.1) saturate(0.95) hue-rotate(10deg)" },
  { id: "vivid_pop", label: "Vivid Pop", css: "brightness(1.08) contrast(1.16) saturate(1.32)" },
  { id: "cute_blush", label: "Cute Blush", css: "brightness(1.1) contrast(1.02) saturate(1.22) hue-rotate(-12deg)" },
  { id: "comic_pop", label: "Comic Pop", css: "contrast(1.35) saturate(1.4) brightness(1.05)" },
  { id: "retro_film", label: "Retro Film", css: "sepia(0.28) contrast(1.08) saturate(0.96) brightness(1.05)" },
  { id: "mono_classic", label: "Mono Classic", css: "grayscale(1) contrast(1.12) brightness(1.05)" },
  { id: "cinema_noir", label: "Cinema Noir", css: "grayscale(1) contrast(1.28) brightness(0.92)" }
];

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

  const [myUserId, setMyUserId] = useState(String(safeGetItem("userId") || ""));
  const [myEmail, setMyEmail] = useState(String(safeGetItem("email") || ""));

  const [contacts, setContacts] = useState([]);
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

  const [incomingCall, setIncomingCall] = useState(null);
  const [callState, setCallState] = useState({
    phase: "idle",
    mode: "audio",
    peerId: "",
    peerName: "",
    initiatedByMe: false
  });
  const [callError, setCallError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [ringtoneMuted, setRingtoneMuted] = useState(false);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [callHistoryByContact, setCallHistoryByContact] = useState({});
  const [videoFilterId, setVideoFilterId] = useState("beauty_soft");
  const [showVideoFilters, setShowVideoFilters] = useState(false);
  const [bubbleMenu, setBubbleMenu] = useState(null);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
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
  const [nowTick, setNowTick] = useState(Date.now());
  const [soundPrefs, setSoundPrefs] = useState(readSoundPrefs);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [callPhaseNote, setCallPhaseNote] = useState("");
  const [signAssistEnabled, setSignAssistEnabled] = useState(false);
  const [signAssistText, setSignAssistText] = useState("");
  const [signAssistVoiceGender, setSignAssistVoiceGender] = useState("female");
  const [signAssistAutoSpeak, setSignAssistAutoSpeak] = useState(false);
  const [signAssistBusy, setSignAssistBusy] = useState(false);
  const [signAssistStatus, setSignAssistStatus] = useState("");
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

  const stompRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callStateRef = useRef(callState);
  const callStartedAtRef = useRef(null);
  const callConnectedLoggedRef = useRef(false);
  const audioCtxRef = useRef(null);
  const ringtoneTimerRef = useRef(null);
  const outgoingRingTimerRef = useRef(null);
  const customRingtoneAudioRef = useRef(null);
  const disconnectGuardTimerRef = useRef(null);
  const historyRef = useRef({});
  const seenSignalsRef = useRef(new Set());
  const longPressTimerRef = useRef(null);
  const touchStartPointRef = useRef({ x: 0, y: 0 });
  const tabIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const callChannelRef = useRef(null);
  const readReceiptChannelRef = useRef(null);
  const messageChannelRef = useRef(null);
  const seenReadReceiptsRef = useRef(new Set());
  const lastReadReceiptSentByContactRef = useRef({});
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
  }, [callState.phase, callState.mode]);

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
    const onStorage = (event) => {
      if (!event || event.key === SETTINGS_KEY) {
        setSoundPrefs(readSoundPrefs());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const localThreadKey = (a, b) => [String(a || ""), String(b || "")].sort().join(":");

  const readLocalChat = () => {
    try {
      const raw = safeGetItem(LOCAL_CHAT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeLocalChat = (data) => {
    safeSetItem(LOCAL_CHAT_KEY, JSON.stringify(data));
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

  const normalizeTimestamp = (value) => {
    if (!value && value !== 0) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      const ms = asNumber < 1000000000000 ? asNumber * 1000 : asNumber;
      return new Date(ms).toISOString();
    }
    if (typeof value === "string") {
      const raw = value.trim();
      // Backend may send ISO-like time without timezone; treat it as UTC for consistent ordering/display.
      const noZoneIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw);
      if (noZoneIso) return new Date(`${raw}Z`).toISOString();
    }
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    return new Date().toISOString();
  };

  const normalizeMessage = (message, otherId = "") => {
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

    return {
      ...message,
      id:
        message?.id ||
        [
          senderId || "unknown",
          receiverId || otherId || "unknown",
          normalizeTimestamp(message?.createdAt || message?.sentAt || message?.timestamp || message?.time),
          String(message?.text ?? message?.message ?? message?.content ?? "")
        ].join("|"),
      senderId: senderId || undefined,
      receiverId: receiverId || undefined,
      text: String(message?.text ?? message?.message ?? message?.content ?? ""),
      audioUrl: String(message?.audioUrl || ""),
      speechTyped: Boolean(message?.speechTyped),
      mediaUrl: String(message?.mediaUrl || ""),
      mediaType: String(message?.mediaType || ""),
      fileName: String(message?.fileName || ""),
      createdAt: normalizeTimestamp(message?.createdAt || message?.sentAt || message?.timestamp || message?.time),
      mine
    };
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

  const mapUserToContact = (u) => {
    const toBool = (value) => {
      if (typeof value === "boolean") return value;
      const raw = String(value || "").trim().toLowerCase();
      return raw === "true" || raw === "1" || raw === "online" || raw === "active" || raw === "yes";
    };
    const id = String(u?.userId || u?.id || "");
    const rawName = u?.name || u?.email || `User ${id}`;
    const name = normalizeDisplayName(rawName);
    const profilePicRaw = u?.profilePicUrl || u?.profilePic || u?.avatar || u?.user?.profilePicUrl || u?.user?.profilePic || "";
    const lastActiveAt =
      u?.lastActiveAt ||
      u?.lastSeenAt ||
      u?.lastSeen ||
      u?.locationUpdatedAt ||
      u?.lastAt ||
      u?.updatedAt ||
      u?.timestamp ||
      u?.user?.locationUpdatedAt ||
      u?.user?.lastSeenAt ||
      u?.user?.lastSeen ||
      "";
    const online =
      toBool(u?.online) ||
      toBool(u?.isOnline) ||
      toBool(u?.active) ||
      toBool(u?.presence) ||
      toBool(u?.status) ||
      toBool(u?.user?.online) ||
      toBool(u?.user?.isOnline) ||
      toBool(u?.user?.active);
    return {
      id,
      name,
      email: u?.email || "",
      avatar: (name[0] || "U").toUpperCase(),
      profilePic: profilePicRaw ? toApiUrl(profilePicRaw) : "",
      lastMessage: u?.lastMessage || "",
      lastActiveAt,
      online
    };
  };

  const mergeContacts = (base, extra) => {
    const byId = new Map();
    [...base, ...extra].forEach((c) => {
      if (!c?.id) return;
      if (!byId.has(c.id)) byId.set(c.id, c);
      else byId.set(c.id, { ...byId.get(c.id), ...c });
    });
    return Array.from(byId.values());
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

  const clearDisconnectGuardTimer = () => {
    if (disconnectGuardTimerRef.current) {
      clearTimeout(disconnectGuardTimerRef.current);
      disconnectGuardTimerRef.current = null;
    }
  };

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
    stopStream(localStreamRef.current);
    stopStream(remoteStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setHasRemoteVideo(false);
    setCallPhaseNote("");
    setIsMuted(false);
    setIsCameraOff(false);
  };

  const closePeer = () => {
    try {
      peerRef.current?.close();
    } catch {
      // ignore close errors
    }
    peerRef.current = null;
  };

  const finishCall = (notifyPeer = false, reason = "") => {
    const current = callStateRef.current;

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
    setCallState({ phase: "idle", mode: "audio", peerId: "", peerName: "", initiatedByMe: false });
    if (reason) {
      setCallError(reason);
      window.setTimeout(() => setCallError(""), 2500);
    }
  };

  const ensureLocalStream = async (mode) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 2,
        sampleRate: 48000
      },
      video: mode === "video"
        ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 }
          }
        : false
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  };

  const createPeerConnection = (targetUserId, mode) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = pc;
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

    const markConnected = () => {
      clearDisconnectGuardTimer();
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
        setHasRemoteVideo(true);
        event.track.onmute = () => setHasRemoteVideo(false);
        event.track.onunmute = () => setHasRemoteVideo(true);
        event.track.onended = () => setHasRemoteVideo(false);
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
      markConnected();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        markConnected();
        return;
      }
      if (state === "disconnected") {
        markReconnecting();
        clearDisconnectGuardTimer();
        disconnectGuardTimerRef.current = setTimeout(() => {
          const currentState = peerRef.current?.connectionState;
          if (currentState === "disconnected") {
            finishCall(false, "Call disconnected");
          }
        }, 6500);
        return;
      }
      if (state === "failed" || state === "closed") {
        finishCall(false, "Call ended");
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
        finishCall(false, "Network issue ended the call");
      }
    };

    return pc;
  };

  const applySdpQualityHints = (sdp, mode) => {
    let next = String(sdp || "");
    next = next.replace(
      /a=fmtp:111 ([^\r\n]*)/g,
      (all, cfg) => `a=fmtp:111 ${cfg};stereo=1;sprop-stereo=1;maxaveragebitrate=128000;cbr=1;usedtx=0`
    );
    if (mode === "video" && /m=video/.test(next) && !/b=AS:1800/.test(next)) {
      next = next.replace(/m=video[^\r\n]*\r?\n/, (line) => `${line}b=AS:1800\r\n`);
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
          enc.maxBitrate = 128000;
          enc.dtx = false;
        }
        if (mode === "video" && sender.track.kind === "video") {
          enc.maxBitrate = 1800000;
          enc.maxFramerate = 30;
        }
        void sender.setParameters(params).catch(() => {});
      });
    } catch {
      // ignore unsupported sender parameter tuning
    }
  };

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
    const signature = `${type}|${fromId}|${signal?.timestamp || ""}|${signal?.sdp || ""}|${signal?.candidate || ""}`;
    if (seenSignalsRef.current.has(signature)) return;
    seenSignalsRef.current.add(signature);
    if (seenSignalsRef.current.size > 1000) {
      seenSignalsRef.current.clear();
    }
    if (!type || !fromId || fromId === myUserId) return;

    ensureSignalContact(signal);
    const current = callStateRef.current;
    const terminalTypes = new Set(["hangup", "reject", "busy", "answer", "accepted", "ended"]);

    if (incomingCall?.fromUserId && fromId === String(incomingCall.fromUserId) && terminalTypes.has(type)) {
      stopRingtone();
      setIncomingCall(null);
      setRingtoneMuted(false);
    }

    if (type === "offer") {
      if (Number.isFinite(signalMs) && signalMs > 0 && Date.now() - signalMs > CALL_SIGNAL_MAX_AGE_MS) {
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
          setCallState({ phase: "idle", mode: "audio", peerId: "", peerName: "", initiatedByMe: false });
        } else {
          sendSignal(fromId, { type: "busy", mode: signal?.mode || "audio" });
          return;
        }
      }
      if (callStateRef.current.phase !== "idle") {
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
        sdp: signal?.sdp || ""
      });
      setRingtoneMuted(false);
      setActiveContactId(fromId);
      navigate(`/chat/${fromId}`);
      startRingtone(true);
      playNotificationBeep();
      maybeShowBrowserNotification(
        "Incoming call",
        `${signal?.mode === "video" ? "Video" : "Audio"} call from ${normalizeDisplayName(signal?.fromName || signal?.fromEmail || "User")}`
      );
      return;
    }

    if (!current.peerId || current.peerId !== fromId) return;

    if (type === "answer" && signal?.sdp && peerRef.current) {
      try {
        await peerRef.current.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        stopOutgoingRing();
        setCallState((prev) => ({ ...prev, phase: "connecting" }));
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
      senderId: Number(senderId || contactIdForThread),
      receiverId: Number(myUserId) || null,
      text,
      audioUrl: payload?.audioUrl || "",
      mediaUrl: payload?.mediaUrl || "",
      mediaType: payload?.mediaType || "",
      fileName: payload?.fileName || "",
      createdAt: payload?.createdAt || new Date().toISOString(),
      mine: false
    }, contactIdForThread);
    const hiddenIds = getHiddenMessageSetForContact(contactIdForThread);
    if (hiddenIds.has(String(nextMessage.id || ""))) return;
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
                : text;

    setMessagesByContact((prev) => {
      const existing = Array.isArray(prev[contactIdForThread]) ? prev[contactIdForThread] : [];
      const exists = existing.some((m) => String(m?.id || "") === String(nextMessage.id));
      if (exists) return prev;
      return { ...prev, [contactIdForThread]: [...existing, nextMessage] };
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
            lastMessage: text
          }
        ]);
      }
      return next.map((c) =>
        c.id === contactIdForThread
          ? {
              ...c,
              lastMessage: preview || c.lastMessage,
              lastActiveAt: new Date().toISOString(),
              online: true
            }
          : c
      );
    });

    playMessageAlert();
    const senderName = normalizeDisplayName(payload?.senderName || payload?.senderEmail || "New message");
    maybeShowBrowserNotification(senderName, preview || "You have a new message");
    shouldStickToBottomRef.current = true;
    setTimeout(() => scrollThreadToBottom("smooth"), 50);
    if (contactIdForThread === String(activeContactId)) {
      setTimeout(() => {
        loadThread(contactIdForThread).catch(() => {});
      }, 120);
    }
  };

  const startOutgoingCall = async (mode) => {
    if (!activeContactId) return;
    if (activeContactId === myUserId) {
      setCallError("Cannot call your own account");
      return;
    }
    if (chatFallbackMode) {
      setCallError("Calls need backend WebSocket connection");
      return;
    }
    if (callStateRef.current.phase !== "idle") return;
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCallError("Your browser does not support media calls");
      return;
    }

    const targetId = String(activeContactId);
    const targetName =
      contacts.find((c) => c.id === targetId)?.name || normalizeDisplayName(`User ${targetId}`);

    try {
      setCallError("");
      const stream = await ensureLocalStream(mode);
      const pc = createPeerConnection(targetId, mode);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      tuneSendersForQuality(pc, mode);

      const offer = await pc.createOffer();
      offer.sdp = applySdpQualityHints(offer.sdp, mode);
      await pc.setLocalDescription(offer);

      setCallState({
        phase: "dialing",
        mode,
        peerId: targetId,
        peerName: targetName,
        initiatedByMe: true
      });
      startOutgoingRing();
      pushCallHistory(targetId, {
        direction: "outgoing",
        mode,
        status: "calling",
        peerName: targetName
      });

      sendSignal(targetId, {
        type: "offer",
        mode,
        sdp: offer.sdp
      });

      clearCallTimer();
      callTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current.phase === "dialing" || callStateRef.current.phase === "connecting") {
          finishCall(true, "No answer");
        }
      }, CALL_RING_MS);
    } catch {
      finishCall(false, "Could not start call. Allow mic/camera and try again.");
    }
  };

  const acceptIncomingCall = async () => {
    const call = incomingCall;
    if (!call?.fromUserId || !call?.sdp) {
      setCallError("Could not answer: missing call offer details");
      return;
    }
    try {
      stopRingtone();
      pushCallHistory(call.fromUserId, {
        direction: "incoming",
        mode: call.mode,
        status: "accepted",
        peerName: call.fromName
      });
      setCallError("");
      const stream = await ensureLocalStream(call.mode);
      const pc = createPeerConnection(call.fromUserId, call.mode);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      tuneSendersForQuality(pc, call.mode);

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
        initiatedByMe: false
      });
      setIncomingCall(null);
      setRingtoneMuted(false);
    } catch {
      finishCall(false, "Could not connect this call");
    }
  };

  const declineIncomingCall = () => {
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
    if ((!incomingCall || !incomingCall?.sdp) && target?.sdp) {
      setIncomingCall({
        fromUserId: String(target.fromUserId),
        fromName: String(target.fromName || "User"),
        mode: target.mode === "video" ? "video" : "audio",
        sdp: String(target.sdp || "")
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

  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0];
    if (!videoTrack) return;
    const nextOff = !isCameraOff;
    videoTrack.enabled = !nextOff;
    setIsCameraOff(nextOff);
  };

  const loadConversations = async () => {
    let list = [];
    try {
      const res = await api.get("/api/chat/conversations", {
        params: { _: Date.now() }
      });
      list = Array.isArray(res.data) ? res.data.map(mapUserToContact) : [];
      setContacts((prev) => mergeContacts(list, prev));
      setChatFallbackMode(false);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        setChatFallbackMode(true);
      } else if (status === 401 || status === 403) {
        setChatFallbackMode(false);
        setError("Session expired for this server. Please login again.");
        clearAuthStorage();
        navigate("/login", { replace: true });
      } else {
        throw err;
      }
    }

    if (contactId) {
      setActiveContactId(String(contactId));
      return;
    }
    setActiveContactId((prev) => prev || (list[0]?.id || ""));
  };

  const loadDiscoveryContacts = async () => {
    const [feedRes, reelsRes] = await Promise.allSettled([api.get("/api/feed"), api.get("/api/reels")]);
    const me = Number(safeGetItem("userId"));

    const toContacts = (items) =>
      (Array.isArray(items) ? items : [])
        .map((p) => p?.user)
        .filter((u) => u?.id && Number(u.id) !== me)
        .map((u) => mapUserToContact(u));

    const fromFeed = feedRes.status === "fulfilled" ? toContacts(feedRes.value?.data) : [];
    const fromReels = reelsRes.status === "fulfilled" ? toContacts(reelsRes.value?.data) : [];
    setContacts((prev) => mergeContacts(prev, [...fromFeed, ...fromReels]));
  };

  const loadThread = async (otherId) => {
    if (!otherId) return;
    const hiddenIds = getHiddenMessageSetForContact(otherId);
    if (chatFallbackMode) {
      const all = readLocalChat();
      const key = localThreadKey(myUserId, otherId);
      const normalized = (Array.isArray(all[key]) ? all[key] : []).map((m) => normalizeMessage(m, otherId));
      const deleteTargets = new Set(normalized.map((m) => parseDeleteTargetId(m?.text)).filter(Boolean).map(String));
      const visible = normalized.filter((m) => !parseDeleteTargetId(m?.text));
      const list = applyDeleteTargetsToList(visible, deleteTargets).filter((m) => !hiddenIds.has(String(m?.id || "")));
      setMessagesByContact((prev) => ({ ...prev, [String(otherId)]: list }));
      return;
    }
    const res = await api.get(`/api/chat/${otherId}/messages`, {
      params: { _: Date.now() }
    });
    const normalized = (Array.isArray(res.data) ? res.data : []).map((m) => normalizeMessage(m, otherId));
    const deleteTargets = new Set(normalized.map((m) => parseDeleteTargetId(m?.text)).filter(Boolean).map(String));
    const visible = normalized.filter((m) => !parseDeleteTargetId(m?.text));
    const list = applyDeleteTargetsToList(visible, deleteTargets).filter((m) => !hiddenIds.has(String(m?.id || "")));
    setMessagesByContact((prev) => {
      const key = String(otherId);
      const oldList = Array.isArray(prev[key]) ? prev[key] : [];
      const pendingLocalMedia = oldList.filter((m) => String(m?.id || "").startsWith("local_media_"));
      const oldSignatureSet = new Set(
        oldList.map((m) => `${m?.id || ""}_${m?.createdAt || ""}_${m?.text || ""}`)
      );
      const newIncoming = list.filter((m) => {
        if (m?.mine) return false;
        const sig = `${m?.id || ""}_${m?.createdAt || ""}_${m?.text || ""}`;
        return !oldSignatureSet.has(sig);
      });
      if (oldList.length > 0 && newIncoming.length > 0) {
        playMessageAlert();
        const latest = newIncoming[newIncoming.length - 1];
        const senderName = contacts.find((c) => c.id === key)?.name || "New message";
        maybeShowBrowserNotification(senderName, String(latest?.text || "You have a new message"));
      }
      const merged = [...list, ...pendingLocalMedia].sort((a, b) => {
        const at = new Date(normalizeTimestamp(a?.createdAt || 0)).getTime();
        const bt = new Date(normalizeTimestamp(b?.createdAt || 0)).getTime();
        return at - bt;
      });
      return { ...prev, [key]: merged };
    });
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
      const discovery = await Promise.resolve(loadDiscoveryContacts())
        .then(() => true)
        .catch((err) => {
          console.error(err);
          return false;
        });

      if (!active) return;
      if (!convo && !discovery) setError("Failed to load chat contacts");
      else setError("");
    };

    boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!contactId) return;
    setActiveContactId(String(contactId));
  }, [contactId]);

  useEffect(() => {
    if (!activeContactId) return;
    shouldStickToBottomRef.current = true;
    loadThread(activeContactId).catch(() => {});
  }, [activeContactId]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations().catch(() => {});
      if (activeContactId) loadThread(activeContactId).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeContactId, contactId]);

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
        const base = getApiBaseUrl().replace(/\/+$/, "");

        const client = new Client({
          webSocketFactory: () => new SockJS(`${base}/ws?token=${encodeURIComponent(token)}`),
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
    if (!query.trim()) {
      setSidebarSearchUsers([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/api/profile/search", { params: { q: query.trim() } });
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setSidebarSearchUsers(data.map(mapUserToContact));
      } catch {
        if (!cancelled) setSidebarSearchUsers([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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
        const res = await api.get("/api/profile/search", { params: { q } });
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setSearchUsers(data.map(mapUserToContact));
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
      return (contactIdValue && blockedId && contactIdValue === blockedId) || (emailValue && blockedEmail && emailValue === blockedEmail);
    });
  };

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = !q
      ? contacts
      : contacts.filter((c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));

    const merged = new Map();
    [...local, ...sidebarSearchUsers].forEach((c) => {
      if (!c?.id) return;
      if (!merged.has(c.id)) merged.set(c.id, c);
    });
    const lowerEmail = String(myEmail || "").toLowerCase();
    return Array.from(merged.values()).filter((c) => {
      if (c.id === myUserId) return false;
      if (lowerEmail && String(c.email || "").toLowerCase() === lowerEmail) return false;
      if (isBlockedContact(c)) return false;
      return true;
    });
  }, [contacts, query, sidebarSearchUsers, myUserId, myEmail, blockedUsers]);

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
    const lowerEmail = String(myEmail || "").toLowerCase();
    return Array.from(merged.values()).filter((c) => {
      if (c.id === myUserId) return false;
      if (lowerEmail && String(c.email || "").toLowerCase() === lowerEmail) return false;
      if (isBlockedContact(c)) return false;
      return true;
    });
  }, [contacts, newChatQuery, searchUsers, myUserId, myEmail, blockedUsers]);

  const openContact = (contact) => {
    const c = mapUserToContact(contact);
    if (!c.id || c.id === myUserId || (myEmail && c.email && c.email.toLowerCase() === myEmail.toLowerCase())) {
      setError("Cannot chat/call with your own account.");
      return;
    }
    if (isBlockedContact(c)) {
      setError("This user is blocked.");
      return;
    }
    setContacts((prev) => mergeContacts(prev, [c]));
    setActiveContactId(c.id);
    navigate(`/chat/${c.id}`);
  };

  const startNewChat = (contact) => {
    openContact(contact);
    setNewChatOpen(false);
    setNewChatQuery("");
  };

  const activeContact = contacts.find((c) => c.id === activeContactId) || null;
  const activeContactBlocked = activeContact ? isBlockedContact(activeContact) : false;
  const activeMessages = messagesByContact[activeContactId] || [];
  const isConversationRoute = Boolean(contactId);
  const activeCallHistory = Array.isArray(callHistoryByContact[activeContactId])
    ? callHistoryByContact[activeContactId]
    : [];

  const formatLastSeen = (value) => {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "lastseen at --";
    const now = new Date(nowTick);
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return `lastseen today at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase()}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `lastseen yesterday at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase()}`;
    }
    return `lastseen ${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase()}`;
  };

  const peerLatestMessageTs = activeMessages
    .filter((m) => !m?.mine)
    .reduce((max, m) => {
      const t = new Date(m?.createdAt || 0).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
  const peerLatestCallTs = activeCallHistory.reduce((max, c) => {
    const t = new Date(c?.at || 0).getTime();
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const threadLatestTs = activeMessages.reduce((max, m) => {
    const t = new Date(m?.createdAt || 0).getTime();
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const peerLatestProfileTs = new Date(activeContact?.lastActiveAt || 0).getTime();
  const peerLatestActivityTs = Math.max(
    peerLatestMessageTs,
    peerLatestCallTs,
    Number.isFinite(peerLatestProfileTs) ? peerLatestProfileTs : 0,
    threadLatestTs
  );
  const hasExplicitOnline = Boolean(activeContact?.online);
  const isPeerOnline = hasExplicitOnline || (peerLatestActivityTs > 0 && nowTick - peerLatestActivityTs <= CHAT_ONLINE_WINDOW_MS);
  const headerPresenceText = isPeerOnline
    ? "online"
    : peerLatestActivityTs > 0
      ? formatLastSeen(peerLatestActivityTs)
      : "lastseen at --";

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
      if (chatFallbackMode) {
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

      const res = await api.post(`/api/chat/${activeContactId}/send`, { text: cleanText });
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
    await sendTextPayload(text, { clearComposer: true });
  };

  const sendSignAssistMessage = async () => {
    const plainText = String(signAssistText || "").trim();
    if (!plainText) {
      setSignAssistStatus("Type translated sign text first.");
      return;
    }
    const payloadText = encodeSignAssistText(plainText, signAssistVoiceGender, "video-call");
    if (!payloadText) {
      setSignAssistStatus("Unable to prepare sign message.");
      return;
    }

    const ok = await sendTextPayload(payloadText, {
      previewText: `Sign: ${plainText}`,
      onSent: () => {
        setSignAssistStatus("Sign message sent.");
        setSignAssistText("");
      }
    });

    if (!ok) {
      setSignAssistStatus("Failed to send sign message.");
    }
  };

  const detectLocalSignText = async (videoEl) => {
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
      return inferLocalSignText(predictions[0]?.landmarks || []);
    } catch {
      return "";
    }
  };

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

  useEffect(() => {
    if (!signAssistAutoSpeak || !activeContactId) return;
    const contactKey = String(activeContactId || "");
    const visibleIds = getVisibleThreadMessageIds();
    if (!autoSpeakBootstrappedByContactRef.current[contactKey]) {
      const visibleQueue = [];
      activeMessages.forEach((msg) => {
        if (!msg || msg.mine) return;
        const msgId = String(msg?.id || "");
        const payload = getSpeakableIncomingPayload(msg);
        if (!msgId || !payload?.text) return;
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
    activeMessages.forEach((msg) => {
      if (!msg || msg.mine) return;
      const msgId = String(msg?.id || "");
      if (!msgId || spokenSignMessageIdsRef.current.has(msgId)) return;
      if (!visibleIds.has(msgId)) return;
      const payload = getSpeakableIncomingPayload(msg);
      if (!payload?.text) return;
      spokenSignMessageIdsRef.current.add(msgId);
      speakSignAssistText(payload.text, payload.voiceGender || "female");
    });
  };

  const goToProfile = (contact) => {
    if (!contact?.id) return;
    navigate(`/profile/${contact.id}`);
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
            ? "?? Voice message"
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

    if (chatFallbackMode) {
      return;
    }

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post(`/api/chat/${activeContactId}/send-media`, form);
      const sent = normalizeMessage({ ...(res?.data || {}), mine: true }, activeContactId);
      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: (prev[activeContactId] || []).map((m) => String(m?.id) === localTempId ? sent : m)
      }));
      setContacts((prev) =>
        prev.map((c) => (
          c.id === activeContactId
            ? { ...c, lastMessage: sent.text || (kind === "audio" ? "?? Voice message" : "[File]") }
            : c
        ))
      );
      shouldStickToBottomRef.current = true;
      setTimeout(() => scrollThreadToBottom("smooth"), 50);
    } catch {
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
            const normalizedCurrent = currentFinal.toLowerCase();
            const normalizedPart = part.toLowerCase();

            // Avoid appending duplicated final chunks produced by continuous recognition.
            if (!normalizedCurrent.endsWith(normalizedPart)) {
              speechFinalTranscriptRef.current = `${currentFinal} ${part}`.replace(/\s+/g, " ").trim();
            }
          } else {
            interim = `${interim} ${part}`.replace(/\s+/g, " ").trim();
          }
        }

        speechInterimTranscriptRef.current = interim;
        const combined = `${speechFinalTranscriptRef.current} ${speechInterimTranscriptRef.current}`
          .replace(/\s+/g, " ")
          .trim();

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
        await sendMediaFile(file, { forcedKind: "audio", previewText: "?? Voice message" });
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

  const callActive = callState.phase !== "idle";
  const showVideoCallScreen = callActive && callState.mode === "video";
  const activeVideoFilter = useMemo(
    () => VIDEO_FILTER_PRESETS.find((preset) => preset.id === videoFilterId) || VIDEO_FILTER_PRESETS[0],
    [videoFilterId]
  );
  const callStatusText = callPhaseNote || (callState.phase === "in-call" ? "Connected" : "Connecting...");
  const callLabel = incomingCall
    ? `${incomingCall.mode === "video" ? "Video" : "Audio"} call from ${incomingCall.fromName}`
    : callActive
      ? `${callState.mode === "video" ? "Video" : "Audio"} call with ${callState.peerName || "User"}`
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
    return `${mode} ? ${suffixMap[status] || status}`;
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
    if (status === "connected" || status === "accepted") {
      return {
        title,
        subtitle: "Connected",
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
    const isRead =
      Boolean(message.readAt || message.seenAt) ||
      message.read === true ||
      message.seen === true ||
      rawStatus === "read" ||
      rawStatus === "seen";
    if (isRead) return "read";
    if (isPeerOnline && activeContactId) return "read";

    const messageTs = new Date(normalizeTimestamp(message.createdAt || 0)).getTime();
    const idText = String(message.id || "");
    const isLocalPendingId =
      idText.startsWith("local_") ||
      idText.startsWith("tmp_") ||
      idText.startsWith("temp_");
    const oldEnough = Number.isFinite(messageTs) ? Date.now() - messageTs > 1500 : true;
    const isDelivered =
      Boolean(message.deliveredAt || message.receivedAt) ||
      message.delivered === true ||
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
  }, [activeContactId]);

  useEffect(() => {
    const onDocClick = (event) => {
      const wrap = headerMenuWrapRef.current;
      const panel = headerMenuRef.current;
      if (wrap?.contains(event.target)) return;
      if (panel?.contains(event.target)) return;
      setShowHeaderMenu(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setTranslatedIncomingById({});
    setTranslatorError("");
  }, [activeContactId, translatorEnabled, translatorLang]);

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

  useEffect(() => {
    if (!isConversationRoute) return;
    if (!myUserId || !activeContactId) return;
    const incoming = (Array.isArray(activeMessages) ? activeMessages : []).filter((m) => !m?.mine);
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

  const onBubbleTouchStart = (item, touchEvent) => {
    const t = touchEvent.touches?.[0];
    if (!t) return;
    touchStartPointRef.current = { x: t.clientX, y: t.clientY };
    longPressTimerRef.current = setTimeout(() => {
      setBubbleMenu({ x: t.clientX, y: t.clientY, item });
    }, 600);
  };

  const onBubbleTouchMove = (touchEvent) => {
    const t = touchEvent.touches?.[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - touchStartPointRef.current.x);
    const dy = Math.abs(t.clientY - touchStartPointRef.current.y);
    if (dx > 16 || dy > 16) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const onBubbleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const closeBubbleMenu = () => setBubbleMenu(null);
  const hasDraft = inputText.trim().length > 0;

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
      {!isConversationRoute && (
        <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <h2>Messages</h2>
          <button type="button" className="new-chat-btn" onClick={() => setNewChatOpen(true)}>
            + New Chat
          </button>
        </div>
        <input
          type="text"
          className="chat-search"
          placeholder="Search chats"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="chat-error">{error}</p>}
        <div className="chat-contact-list">
          {filteredContacts.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chat-contact ${activeContactId === c.id ? "active" : ""}`}
              onClick={() => openContact(c)}
            >
              <span className="chat-avatar">
                {c.profilePic ? <img src={c.profilePic} alt={c.name} className="chat-avatar-img" /> : c.avatar}
              </span>
              <span className="chat-meta">
                <strong>{c.name}</strong>
                <small>{c.lastMessage || "Tap to start chatting"}</small>
              </span>
            </button>
          ))}
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
                {newChatCandidates.map((c) => (
                  <button key={c.id} type="button" className="chat-contact" onClick={() => startNewChat(c)}>
                    <span className="chat-avatar">
                      {c.profilePic ? <img src={c.profilePic} alt={c.name} className="chat-avatar-img" /> : c.avatar}
                    </span>
                    <span className="chat-meta">
                      <strong>{c.name}</strong>
                      <small>{c.email || "Start conversation"}</small>
                    </span>
                  </button>
                ))}
                {!searchingUsers && newChatCandidates.length === 0 && <p className="chat-empty">No users found</p>}
              </div>
            </div>
          </div>
        )}
        </aside>
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
              {callStatusText} ? Total {formatCallDuration(callDurationSec)}
            </p>
            <div className="active-call-popup-actions">
              <button type="button" className="call-ring-toggle" onClick={toggleMute}>
                {isMuted ? "Unmute mic" : "Mute mic"}
              </button>
              <button type="button" className="call-decline" onClick={() => finishCall(true)}>
                <FiPhoneOff /> End Call
              </button>
            </div>
          </div>
        )}
        {callActive && !incomingCall && (
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
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="wa-video-remote"
              style={{ filter: activeVideoFilter.css }}
              data-allow-simultaneous="true"
            />
            {!hasRemoteVideo && (
              <div className="wa-video-remote-fallback" aria-live="polite">
                <div className="wa-video-avatar">{(callState.peerName || "U").charAt(0).toUpperCase()}</div>
                <p>{callState.peerName || "User"} camera is off or still connecting</p>
              </div>
            )}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="wa-video-local"
              style={{ filter: activeVideoFilter.css }}
              data-allow-simultaneous="true"
            />
            <div className="wa-video-top">
              <p className="wa-video-peer">{callState.peerName || "User"}</p>
              <p className="wa-video-state">
                {callStatusText} ? {formatCallDuration(callDurationSec)}
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
            {showVideoFilters && (
              <div className="wa-video-filter-panel" role="listbox" aria-label="Video filters">
                {VIDEO_FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="option"
                    aria-selected={videoFilterId === preset.id}
                    className={`wa-filter-chip ${videoFilterId === preset.id ? "is-selected" : ""}`}
                    onClick={() => {
                      setVideoFilterId(preset.id);
                      setShowVideoFilters(false);
                    }}
                    title={preset.label}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
            <div className="wa-video-controls">
              <button type="button" className="call-control" onClick={toggleMute} title="Mute/Unmute">
                {isMuted ? <FiMicOff /> : <FiMic />}
              </button>
              <button type="button" className="call-control" onClick={toggleCamera} title="Camera on/off">
                {isCameraOff ? <FiVideoOff /> : <FiVideo />}
              </button>
              <button
                type="button"
                className={`call-control ${showVideoFilters ? "is-active" : ""}`}
                onClick={() => setShowVideoFilters((prev) => !prev)}
                title="Video filters"
              >
                <FiSmile />
              </button>
              <button
                type="button"
                className={`call-control ${signAssistEnabled ? "is-active" : ""}`}
                onClick={() => setSignAssistEnabled((prev) => !prev)}
                title="Sign assist">
                <MdSignLanguage />
              </button>
              <button type="button" className="call-hangup" onClick={() => finishCall(true)}>
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
                {isConversationRoute && (
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
                  <small>{headerPresenceText}</small>
                </span>
                </button>
              </div>

              <div className="chat-header-actions" ref={headerMenuWrapRef}>
                <button
                  type="button"
                  className="call-action"
                  title="Audio call"
                  onClick={() => startOutgoingCall("audio")}
                  disabled={chatFallbackMode || callActive || !!incomingCall}
                >
                  <FiPhone />
                </button>
                <button
                  type="button"
                  className="call-action"
                  title="Video call"
                  onClick={() => startOutgoingCall("video")}
                  disabled={chatFallbackMode || callActive || !!incomingCall}
                >
                  <FiVideo />
                </button>
                <button
                  type="button"
                  className="call-action"
                  title={signAssistAutoSpeak ? "Auto-speak on" : "Auto-speak off"}
                  onClick={() => setAutoSpeakEnabled(!signAssistAutoSpeak)}
                >
                  {signAssistAutoSpeak ? <FiVolume2 /> : <FiVolumeX />}
                </button>
                <button
                  type="button"
                  className="call-action"
                  title="More options"
                  onClick={() => setShowHeaderMenu((prev) => !prev)}
                >
                  <FiMoreVertical />
                </button>
              </div>
            </header>

            {showHeaderMenu && (
              <aside className="chat-header-menu" ref={headerMenuRef}>
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
                <div className="chat-translate-card chat-wallpaper-card">
                  <div className="chat-menu-label-group">
                    <strong>Chat wallpaper</strong>
                    <small>Choose background picture for this chat page</small>
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
                      <button type="button" className="call-control" onClick={toggleMute} title="Mute/Unmute">
                        {isMuted ? <FiMicOff /> : <FiMic />}
                      </button>
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
                    onTouchStart={enableBubbleMenu ? (e) => onBubbleTouchStart(item, e) : undefined}
                    onTouchMove={enableBubbleMenu ? onBubbleTouchMove : undefined}
                    onTouchEnd={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                    onTouchCancel={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                  >
                    <div className={`chat-bubble-line ${item.kind === "call" ? "call-line" : ""}`}>
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
                        item.raw?.mediaType === "image" ? (
                          <img
                            src={resolveMediaUrl(item.raw.mediaUrl)}
                            alt={item.raw?.fileName || "image"}
                            className="chat-media-image"
                          />
                        ) : item.raw?.mediaType === "video" ? (
                          <video controls preload="metadata" className="chat-media-video" src={resolveMediaUrl(item.raw.mediaUrl)} />
                        ) : item.raw?.mediaType === "audio" ? (
                          <div className={`chat-voice-note ${item.mine ? "mine" : "their"}`}>
                            {item.mine && (
                              <span className="chat-voice-note-icon" aria-hidden="true">
                                <FiVolume2 />
                              </span>
                            )}
                            <audio controls preload="metadata" className="chat-audio" src={resolveMediaUrl(item.raw.mediaUrl)} />
                          </div>
                        ) : (
                          <a className="chat-file-link" href={resolveMediaUrl(item.raw.mediaUrl)} target="_blank" rel="noreferrer">
                            ?? {item.raw?.fileName || "Download file"}
                          </a>
                        )
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
                <button type="button" className="chat-send-btn composer-send-btn" onClick={sendMessage}>
                  Send
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
          </>
        )}
      </section>
      )}
    </div>
  );
}








