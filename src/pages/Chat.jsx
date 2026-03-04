import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCamera,
  FiMic,
  FiMicOff,
  FiMoreVertical,
  FiPaperclip,
  FiPhone,
  FiPhoneOff,
  FiSmile,
  FiVideo,
  FiVideoOff
} from "react-icons/fi";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { clearAuthStorage } from "../auth";
import "./Chat.css";

const POLL_MS = 1200;
const LOCAL_CHAT_KEY = "socialsea_chat_fallback_v1";
const CALL_HISTORY_KEY = "socialsea_call_history_v1";
const CALL_SIGNAL_LOCAL_KEY = "socialsea_call_signal_local_v1";
const CALL_ACCEPT_TARGET_KEY = "socialsea_call_accept_target_v1";
const CALL_RING_MS = 30000;
const CALL_POLL_MS = 1200;
const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const CHAT_FAVORITES_KEY = "socialsea_chat_favorites_v1";
const CHAT_CUSTOM_STICKERS_KEY = "socialsea_chat_custom_stickers_v1";
const DELETE_FOR_EVERYONE_TOKEN = "__SS_DELETE_EVERYONE__:";
const EMOJI_GROUPS = [
  { name: "Smileys", items: ["😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤩", "🥳", "😭", "😡"] },
  { name: "Gestures", items: ["🙏", "👍", "👎", "👏", "🙌", "🤝", "✌️", "🤟", "👌", "💪", "👀", "👋"] },
  { name: "Hearts", items: ["❤️", "🩷", "🧡", "💛", "💚", "🩵", "💙", "💜", "🖤", "🤍", "💖", "💯"] },
  { name: "Fun", items: ["🎉", "🔥", "✨", "🌈", "⚡", "🎵", "🎶", "🍿", "☕", "🍕", "🧠", "🎯"] }
];
const QUICK_EMOJIS = EMOJI_GROUPS.flatMap((group) => group.items);
const STICKER_PACKS = [
  { id: "party", label: "Party", value: "🎉🥳🎊" },
  { id: "love", label: "Love", value: "💖🥰❤️" },
  { id: "thanks", label: "Thanks", value: "🙏✨😊" },
  { id: "wow", label: "Wow", value: "🤯🔥👏" },
  { id: "laugh", label: "LOL", value: "😂🤣😆" },
  { id: "angry", label: "Angry", value: "😤⚡😡" },
  { id: "sleepy", label: "Sleepy", value: "😴🌙💤" },
  { id: "food", label: "Food", value: "🍕🍔🍟" },
  { id: "coffee", label: "Break", value: "☕🍪🙂" },
  { id: "victory", label: "Victory", value: "🏆💯🎯" },
  { id: "coding", label: "Coding", value: "💻⚙️🚀" },
  { id: "travel", label: "Travel", value: "✈️🌍📸" }
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
  const [speechLang, setSpeechLang] = useState("en-IN");
  const [nowTick, setNowTick] = useState(Date.now());

  const stompRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const callTimeoutRef = useRef(null);
  const callStateRef = useRef(callState);
  const callStartedAtRef = useRef(null);
  const callConnectedLoggedRef = useRef(false);
  const audioCtxRef = useRef(null);
  const ringtoneTimerRef = useRef(null);
  const outgoingRingTimerRef = useRef(null);
  const historyRef = useRef({});
  const seenSignalsRef = useRef(new Set());
  const longPressTimerRef = useRef(null);
  const touchStartPointRef = useRef({ x: 0, y: 0 });
  const tabIdRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const callChannelRef = useRef(null);
  const composerInputRef = useRef(null);
  const attachInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const stickerInputRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const speechBaseTextRef = useRef("");
  const speechFinalTextRef = useRef("");
  const suppressSpeechWriteRef = useRef(false);
  const threadRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const lastThreadItemCountRef = useRef(0);

  const SPEECH_LANG_OPTIONS = [
    { value: "en-IN", label: "English" },
    { value: "te-IN", label: "తెలుగు" },
    { value: "hi-IN", label: "हिन्दी" },
    { value: "ta-IN", label: "தமிழ்" },
    { value: "kn-IN", label: "ಕನ್ನಡ" },
    { value: "ml-IN", label: "മലയാളം" },
    { value: "ru-RU", label: "Русский" },
    { value: "ur-PK", label: "اردو" },
    { value: "ja-JP", label: "日本語" },
    { value: "fr-FR", label: "Français" }
  ];

  useEffect(() => {
    safeSetItem(CHAT_FAVORITES_KEY, JSON.stringify(favoritePicks));
  }, [favoritePicks]);

  useEffect(() => {
    safeSetItem(CHAT_CUSTOM_STICKERS_KEY, JSON.stringify(customStickers));
  }, [customStickers]);

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

  const playNotificationBeep = () => {
    void playTone(820, 120, 0.08, "triangle");
    window.setTimeout(() => void playTone(980, 120, 0.07, "triangle"), 140);
  };

  const playMessageAlert = () => {
    void playTone(920, 130, 0.1, "triangle");
    window.setTimeout(() => void playTone(1120, 140, 0.09, "triangle"), 150);
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
  };

  const stopOutgoingRing = () => {
    if (outgoingRingTimerRef.current) {
      clearInterval(outgoingRingTimerRef.current);
      outgoingRingTimerRef.current = null;
    }
  };

  const startRingtone = (force = false) => {
    if (ringtoneMuted && !force) return;
    stopRingtone();
    const ring = () => {
      void playTone(640, 320, 0.22, "square");
      window.setTimeout(() => void playTone(760, 360, 0.2, "square"), 280);
    };
    ring();
    ringtoneTimerRef.current = setInterval(ring, 1400);
  };

  const startOutgoingRing = () => {
    stopOutgoingRing();
    const ring = () => {
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
  };

  const mapUserToContact = (u) => {
    const id = String(u?.userId || u?.id || "");
    const rawName = u?.name || u?.email || `User ${id}`;
    const name = normalizeDisplayName(rawName);
    const profilePicRaw = u?.profilePicUrl || u?.profilePic || u?.avatar || u?.user?.profilePicUrl || u?.user?.profilePic || "";
    return {
      id,
      name,
      email: u?.email || "",
      avatar: (name[0] || "U").toUpperCase(),
      profilePic: profilePicRaw ? toApiUrl(profilePicRaw) : "",
      lastMessage: u?.lastMessage || ""
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
    stopStream(localStreamRef.current);
    stopStream(remoteStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
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
    const hasActiveCall = current.phase !== "idle" || !!current.peerId;
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
    // Keep pending incoming offer visible when stale callbacks try to end a non-active call.
    if (hasActiveCall) {
      setIncomingCall(null);
    }
    setCallState({ phase: "idle", mode: "audio", peerId: "", peerName: "", initiatedByMe: false });
    if (reason) {
      setCallError(reason);
      window.setTimeout(() => setCallError(""), 2500);
    }
  };

  const ensureLocalStream = async (mode) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video"
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

    const markConnected = () => {
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
      markConnected();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        markConnected();
        return;
      }
      if (state === "failed" || state === "closed" || state === "disconnected") {
        finishCall(false, "Call ended");
      }
    };

    return pc;
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
    const signature = `${type}|${fromId}|${signal?.timestamp || ""}|${signal?.sdp || ""}|${signal?.candidate || ""}`;
    if (seenSignalsRef.current.has(signature)) return;
    seenSignalsRef.current.add(signature);
    if (seenSignalsRef.current.size > 1000) {
      seenSignalsRef.current.clear();
    }
    if (!type || !fromId || fromId === myUserId) return;

    ensureSignalContact(signal);
    const current = callStateRef.current;

    if (type === "offer") {
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

    if (type === "hangup") {
      finishCall(false, "Call ended");
    }
  };

  const onIncomingChatMessage = (payload) => {
    const senderId = String(payload?.senderId || "");
    if (!senderId || senderId === myUserId) return;
    const text = String(payload?.text || "");
    const deleteTargetId = parseDeleteTargetId(text);
    if (deleteTargetId) {
      setMessagesByContact((prev) => {
        const existing = Array.isArray(prev[senderId]) ? prev[senderId] : [];
        const next = applyDeleteTargetsToList(existing, new Set([String(deleteTargetId)]));
        return { ...prev, [senderId]: next };
      });
      setContacts((prev) => prev.map((c) => (c.id === senderId ? { ...c, lastMessage: "This message was deleted" } : c)));
      shouldStickToBottomRef.current = true;
      setTimeout(() => scrollThreadToBottom("smooth"), 50);
      return;
    }
    const nextMessage = normalizeMessage({
      id: payload?.id || `${payload?.createdAt || Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      senderId: Number(senderId),
      receiverId: Number(myUserId) || null,
      text,
      audioUrl: payload?.audioUrl || "",
      createdAt: payload?.createdAt || new Date().toISOString(),
      mine: false
    }, senderId);

    setMessagesByContact((prev) => {
      const existing = Array.isArray(prev[senderId]) ? prev[senderId] : [];
      const exists = existing.some((m) => String(m?.id || "") === String(nextMessage.id));
      if (exists) return prev;
      return { ...prev, [senderId]: [...existing, nextMessage] };
    });

    setContacts((prev) => {
      const found = prev.find((c) => c.id === senderId);
      let next = prev;
      if (!found) {
        const name = normalizeDisplayName(
          payload?.senderName || payload?.senderEmail || payload?.fromName || payload?.fromEmail || `User ${senderId}`
        );
        next = mergeContacts(prev, [
          {
            id: senderId,
            name,
            email: payload?.senderEmail || payload?.fromEmail || "",
            avatar: (name[0] || "U").toUpperCase(),
            lastMessage: text
          }
        ]);
      }
      const preview = nextMessage.audioUrl ? "🎤 Voice message" : text;
      return next.map((c) => (c.id === senderId ? { ...c, lastMessage: preview || c.lastMessage } : c));
    });

    playMessageAlert();
    const senderName = normalizeDisplayName(payload?.senderName || payload?.senderEmail || "New message");
    maybeShowBrowserNotification(senderName, text || "You have a new message");
    shouldStickToBottomRef.current = true;
    setTimeout(() => scrollThreadToBottom("smooth"), 50);
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

      const offer = await pc.createOffer();
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

      await pc.setRemoteDescription({ type: "offer", sdp: call.sdp });
      const answer = await pc.createAnswer();
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
    if (!incomingCall?.fromUserId) return;
    let target = null;
    try {
      const raw = sessionStorage.getItem(CALL_ACCEPT_TARGET_KEY);
      target = raw ? JSON.parse(raw) : null;
    } catch {
      target = null;
    }
    if (!target?.fromUserId) return;
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
      const res = await api.get("/api/chat/conversations");
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
    if (chatFallbackMode) {
      const all = readLocalChat();
      const key = localThreadKey(myUserId, otherId);
      const normalized = (Array.isArray(all[key]) ? all[key] : []).map((m) => normalizeMessage(m, otherId));
      const deleteTargets = new Set(normalized.map((m) => parseDeleteTargetId(m?.text)).filter(Boolean).map(String));
      const visible = normalized.filter((m) => !parseDeleteTargetId(m?.text));
      const list = applyDeleteTargetsToList(visible, deleteTargets);
      setMessagesByContact((prev) => ({ ...prev, [String(otherId)]: list }));
      return;
    }
    const res = await api.get(`/api/chat/${otherId}/messages`);
    const normalized = (Array.isArray(res.data) ? res.data : []).map((m) => normalizeMessage(m, otherId));
    const deleteTargets = new Set(normalized.map((m) => parseDeleteTargetId(m?.text)).filter(Boolean).map(String));
    const visible = normalized.filter((m) => !parseDeleteTargetId(m?.text));
    const list = applyDeleteTargetsToList(visible, deleteTargets);
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
      return true;
    });
  }, [contacts, query, sidebarSearchUsers, myUserId, myEmail]);

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
      return true;
    });
  }, [contacts, newChatQuery, searchUsers, myUserId, myEmail]);

  const openContact = (contact) => {
    const c = mapUserToContact(contact);
    if (!c.id || c.id === myUserId || (myEmail && c.email && c.email.toLowerCase() === myEmail.toLowerCase())) {
      setError("Cannot chat/call with your own account.");
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
  const activeMessages = messagesByContact[activeContactId] || [];
  const isConversationRoute = Boolean(contactId);
  const activeCallHistory = Array.isArray(callHistoryByContact[activeContactId])
    ? callHistoryByContact[activeContactId]
    : [];

  const formatLastSeen = (value) => {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "lastseen recently";
    const now = new Date(nowTick);
    const deltaMs = now.getTime() - d.getTime();
    if (deltaMs < 3600000) {
      const mins = Math.max(1, Math.floor(deltaMs / 60000));
      return `lastseen ${mins} min ago`;
    }
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
  const peerLatestActivityTs = Math.max(peerLatestMessageTs, peerLatestCallTs);
  const isPeerOnline = peerLatestActivityTs > 0 && nowTick - peerLatestActivityTs <= 120000;
  const headerPresenceText = isPeerOnline
    ? "online"
    : peerLatestActivityTs > 0
      ? formatLastSeen(peerLatestActivityTs)
      : "lastseen recently";

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || !activeContactId) return;
    if (activeContactId === myUserId) {
      setError("Cannot send message to your own account.");
      return;
    }

    // Clear composer immediately on send and stop live speech updates
    suppressSpeechWriteRef.current = true;
    setInputText("");
    setShowEmojiTray(false);
    stopAudioRecording();
    speechBaseTextRef.current = "";
    speechFinalTextRef.current = "";
    setTimeout(() => composerInputRef.current?.focus(), 0);

    try {
      if (chatFallbackMode) {
        const mine = normalizeMessage({
          id: Date.now(),
          senderId: Number(myUserId) || null,
          receiverId: Number(activeContactId) || null,
          text,
          createdAt: new Date().toISOString(),
          mine: true
        }, activeContactId);
        const all = readLocalChat();
        const key = localThreadKey(myUserId, activeContactId);
        const nextList = [...(Array.isArray(all[key]) ? all[key] : []), mine];
        all[key] = nextList;
        writeLocalChat(all);
        setMessagesByContact((prev) => ({ ...prev, [activeContactId]: nextList }));
        setContacts((prev) => prev.map((c) => (c.id === activeContactId ? { ...c, lastMessage: text } : c)));
        setError("Server chat unavailable on this backend. Using local chat mode.");
        shouldStickToBottomRef.current = true;
        setTimeout(() => scrollThreadToBottom("smooth"), 50);
        return;
      }

      const res = await api.post(`/api/chat/${activeContactId}/send`, { text });
      const sent = normalizeMessage(
        { ...(res?.data || {}), text, mine: true, senderId: myUserId, receiverId: activeContactId, createdAt: (res?.data || {})?.createdAt || new Date().toISOString() },
        activeContactId
      );
      setMessagesByContact((prev) => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), sent]
      }));
      setContacts((prev) => prev.map((c) => (c.id === activeContactId ? { ...c, lastMessage: text } : c)));
      shouldStickToBottomRef.current = true;
      setTimeout(() => scrollThreadToBottom("smooth"), 50);
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
    } finally {
      // let any queued speech events finish without rewriting input
      setTimeout(() => {
        suppressSpeechWriteRef.current = false;
      }, 300);
    }
  };

  const goToProfile = (contact) => {
    if (!contact?.id) return;
    navigate(`/profile/${contact.id}`);
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

  const sendMediaFile = async (file) => {
    if (!file || !activeContactId) return;
    const type = String(file.type || "").toLowerCase();
    const kind = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : "file";
    const localTempId = `local_media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const localPreview = normalizeMessage({
      id: localTempId,
      senderId: Number(myUserId) || null,
      receiverId: Number(activeContactId) || null,
      text: kind === "image" ? "[Image]" : kind === "video" ? "[Video]" : "[File]",
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
      setContacts((prev) => prev.map((c) => (c.id === activeContactId ? { ...c, lastMessage: sent.text || "[File]" } : c)));
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

  const stopAudioRecording = () => {
    const recognition = speechRecognitionRef.current;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore stop errors
      }
    }
  };

  const toggleAudioRecording = () => {
    if (isRecordingAudio) {
      stopAudioRecording();
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Speech typing is not supported in this browser. Use Chrome/Edge.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      speechRecognitionRef.current = recognition;
      speechBaseTextRef.current = String(inputText || "").trim();
      speechFinalTextRef.current = "";

      recognition.lang = speechLang || navigator.language || "en-IN";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        if (suppressSpeechWriteRef.current) return;
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const part = String(event.results[i]?.[0]?.transcript || "").trim();
          if (!part) continue;
          if (event.results[i].isFinal) {
            speechFinalTextRef.current = `${speechFinalTextRef.current} ${part}`.trim();
          } else {
            interim = `${interim} ${part}`.trim();
          }
        }
        const merged = [speechBaseTextRef.current, speechFinalTextRef.current, interim]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        setInputText(merged);
      };

      recognition.onerror = (event) => {
        const code = String(event?.error || "");
        if (code !== "aborted") {
          if (code === "not-allowed" || code === "service-not-allowed") {
            setError("Microphone permission is blocked. Allow mic access for speech typing.");
          } else if (code === "no-speech") {
            setError("No speech detected. Try speaking again.");
          } else {
            setError("Speech typing failed. Please try again.");
          }
        }
      };

      recognition.onend = () => {
        speechRecognitionRef.current = null;
        speechBaseTextRef.current = "";
        speechFinalTextRef.current = "";
        setIsRecordingAudio(false);
        setTimeout(() => composerInputRef.current?.focus(), 0);
      };

      recognition.start();
      setError("");
      setIsRecordingAudio(true);
    } catch {
      speechRecognitionRef.current = null;
      setIsRecordingAudio(false);
      setError("Unable to start speech typing. Check microphone access.");
    }
  };

  const callActive = callState.phase !== "idle";
  const showVideoCallScreen = callActive && callState.mode === "video";
  const callLabel = incomingCall
    ? `${incomingCall.mode === "video" ? "Video" : "Audio"} call from ${incomingCall.fromName}`
    : callActive
      ? `${callState.mode === "video" ? "Video" : "Audio"} call with ${callState.peerName || "User"}`
      : "";
  const formatCallTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };
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
    return `${mode} • ${suffixMap[status] || status}`;
  };

  const formatCallCard = (entry) => {
    const incoming = entry?.direction === "incoming";
    const modeLabel = entry?.mode === "video" ? "video call" : "voice call";
    const status = String(entry?.status || "ended");

    if (status === "missed") {
      return {
        title: `Missed ${modeLabel}`,
        subtitle: incoming ? "Tap to call back" : "No answer"
      };
    }
    if (status === "declined") {
      return {
        title: `Declined ${modeLabel}`,
        subtitle: incoming ? "You declined" : "Declined by recipient"
      };
    }
    if (status === "connected" || status === "accepted") {
      return {
        title: modeLabel[0].toUpperCase() + modeLabel.slice(1),
        subtitle: "Connected"
      };
    }
    if (status === "calling" || status === "ringing") {
      return {
        title: modeLabel[0].toUpperCase() + modeLabel.slice(1),
        subtitle: status === "calling" ? "Calling..." : "Ringing..."
      };
    }
    if (status === "busy") {
      return {
        title: `${modeLabel[0].toUpperCase() + modeLabel.slice(1)} busy`,
        subtitle: "User is busy"
      };
    }
    return {
      title: modeLabel[0].toUpperCase() + modeLabel.slice(1),
      subtitle: "Ended"
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
    if (!isConversationRoute) return;
    if (!chatItems.length) return;
    const hasNewItems = chatItems.length > lastThreadItemCountRef.current;
    lastThreadItemCountRef.current = chatItems.length;
    if (!hasNewItems) return;
    if (!shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => scrollThreadToBottom("auto"));
  }, [chatItems, isConversationRoute]);

  useEffect(() => {
    lastThreadItemCountRef.current = 0;
    shouldStickToBottomRef.current = true;
    if (!activeContactId) return;
    requestAnimationFrame(() => scrollThreadToBottom("auto"));
  }, [activeContactId]);

  const onThreadScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 100;
  };

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
      <section className="chat-main">
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
              {callState.phase === "in-call" ? "Connected" : "Connecting..."} • Total {formatCallDuration(callDurationSec)}
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
        {showVideoCallScreen && (
          <div className="wa-video-call-screen" role="dialog" aria-live="polite" aria-label="Video call screen">
            <video ref={remoteVideoRef} autoPlay playsInline className="wa-video-remote" data-allow-simultaneous="true" />
            <video ref={localVideoRef} autoPlay playsInline muted className="wa-video-local" data-allow-simultaneous="true" />
            <div className="wa-video-top">
              <p className="wa-video-peer">{callState.peerName || "User"}</p>
              <p className="wa-video-state">
                {callState.phase === "in-call" ? "Connected" : "Connecting..."} • {formatCallDuration(callDurationSec)}
              </p>
            </div>
            <div className="wa-video-controls">
              <button type="button" className="call-control" onClick={toggleMute} title="Mute/Unmute">
                {isMuted ? <FiMicOff /> : <FiMic />}
              </button>
              <button type="button" className="call-control" onClick={toggleCamera} title="Camera on/off">
                {isCameraOff ? <FiVideoOff /> : <FiVideo />}
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

              <div className="chat-header-actions">
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
                <button type="button" className="call-action" title="More options">
                  <FiMoreVertical />
                </button>
              </div>
            </header>

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

            <div ref={threadRef} onScroll={onThreadScroll} className="chat-thread wa-thread">

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
                    onContextMenu={enableBubbleMenu ? (e) => openBubbleMenu(e, item) : undefined}
                    onTouchStart={enableBubbleMenu ? (e) => onBubbleTouchStart(item, e) : undefined}
                    onTouchMove={enableBubbleMenu ? onBubbleTouchMove : undefined}
                    onTouchEnd={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                    onTouchCancel={enableBubbleMenu ? onBubbleTouchEnd : undefined}
                  >
                    <div className={`chat-bubble-line ${item.kind === "call" ? "call-line" : ""}`}>
                      {item.kind === "message" && item.raw?.audioUrl ? (
                        <audio controls preload="metadata" className="chat-audio" src={toApiUrl(item.raw.audioUrl)} />
                      ) : item.kind === "message" && item.raw?.mediaUrl ? (
                        item.raw?.mediaType === "image" ? (
                          <img
                            src={resolveMediaUrl(item.raw.mediaUrl)}
                            alt={item.raw?.fileName || "image"}
                            className="chat-media-image"
                          />
                        ) : item.raw?.mediaType === "video" ? (
                          <video controls preload="metadata" className="chat-media-video" src={resolveMediaUrl(item.raw.mediaUrl)} />
                        ) : (
                          <a className="chat-file-link" href={resolveMediaUrl(item.raw.mediaUrl)} target="_blank" rel="noreferrer">
                            📎 {item.raw?.fileName || "Download file"}
                          </a>
                        )
                      ) : item.kind === "message" && /^\[Attachment:\s*.+\]$/i.test(String(item.raw?.text || "")) ? (
                        <span className="chat-attachment-text">{String(item.raw?.text || "")}</span>
                      ) : item.kind === "call" ? (
                        <div className="call-card">
                          <span className="call-dot" aria-hidden="true">📞</span>
                          <span className="call-card-text">
                            <strong>{callCard?.title || "Call"}</strong>
                            <small>{callCard?.subtitle || ""}</small>
                          </span>
                        </div>
                      ) : (
                        <span>{item.text}</span>
                      )}
                    </div>
                    <small className="chat-bubble-time">{formatMessageTime(item.createdAt)}</small>
                  </div>
                );
              })}
              {threadItems.length === 0 && <p className="chat-empty-thread">No messages yet. Say hi.</p>}
            </div>

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
                          ★
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
                          ★
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
                          ×
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
                          ★
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pickerTab === "favorite" && (
                  <div className="sticker-grid" role="listbox" aria-label="Favorite picks">
                    {favoriteItemsForTray.length === 0 && (
                      <p className="emoji-empty">No favorites yet. Tap ★ to save emojis and stickers.</p>
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
                          ★
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="chat-input-row wa-input-row">
              <button type="button" className="input-icon" title="Emoji" onClick={toggleEmojiTray}>
                <FiSmile />
              </button>
              <input
                ref={composerInputRef}
                type="text"
                placeholder="Message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />
              <button type="button" className="input-icon" title="Attach" onClick={openAttachPicker}>
                <FiPaperclip />
              </button>
              <button type="button" className="input-icon" title="Camera" onClick={openCameraPicker}>
                <FiCamera />
              </button>
              <select
                className="speech-lang-select"
                value={speechLang}
                onChange={(e) => setSpeechLang(e.target.value)}
                title="Speech language"
              >
                {SPEECH_LANG_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {hasDraft ? (
                <button type="button" className="chat-send-btn" onClick={sendMessage}>
                  Send
                </button>
              ) : (
                <button
                  type="button"
                  className={`mic-fab ${isRecordingAudio ? "active" : ""}`}
                  title={isRecordingAudio ? "Stop speech typing" : "Speak to type message"}
                  onClick={toggleAudioRecording}
                >
                  {isRecordingAudio ? <FiMicOff /> : <FiMic />}
                </button>
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


