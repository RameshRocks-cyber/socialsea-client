import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { FiBell } from "react-icons/fi";
import api from "../api/axios";
import { NOTIFICATION_BUDDY_CHARACTERS, normalizeNotificationBuddyCharacter } from "./notificationBuddyConfig";
import "./NotificationBuddy.css";


const SETTINGS_STORAGE_KEY = "socialsea_settings_v1";
const POLL_MS = 12000;
const LONG_PRESS_MS = 520;
const WALK_INTERVAL_MS = 220;
const WALK_STEP_PX = 5;
const DRAG_THRESHOLD_PX = 6;
const BOTTOM_TAP_THRESHOLD_PX = 18;
const HITBOX_INSET_X = 14;
const HITBOX_INSET_TOP = 18;
const HITBOX_INSET_BOTTOM = 6;
const MAX_PANEL_ITEMS = 10;
const PANEL_MAX_WIDTH = 230;
const PANEL_HORIZONTAL_MARGIN = 12;
const PANEL_EST_HEIGHT = 160;
const PANEL_GAP_PX = -18;
const DISMISS_ZONE_MIN_WIDTH = 120;
const DISMISS_ZONE_MAX_WIDTH = 180;
const DISMISS_ZONE_MIN_HEIGHT = 88;
const DISMISS_ZONE_MAX_HEIGHT = 140;
const DISMISS_ZONE_BOTTOM_PAD = 64;
const DISMISS_ZONE_MOBILE_PAD = 78;
const SHIMEJI_SCALE = 0.32;
const BASE_WIDTH = 160;
const BASE_HEIGHT = 208;
const EDGE_EPS = 0.75;
const EDGE_PAD = 0;
const CHARACTER_STORAGE_KEY = "socialsea_shimeji_character_v1";
const POSITION_STORAGE_KEY = "socialsea_shimeji_position_v1";
const DEFAULT_VOICE_RATE = 1;
const DEFAULT_VOICE_PITCH = 1;
const DEFAULT_BUDDY_SPEED = "medium";
const BUDDY_SPEED_MULTIPLIERS = {
  slow: 0.7,
  medium: 1,
  fast: 1.35
};

const CHARACTER_OPTIONS = NOTIFICATION_BUDDY_CHARACTERS;

const CHARACTER_ASSETS = {
  Lion: "/shimeji/lion.png",
  Dog: "/shimeji/dog.png",
  Puppy: "/shimeji/puppy.png",
  Cat: "/shimeji/cat.png",
  Panda: "/shimeji/panda.png",
  Bunny: "/shimeji/bunny.png",
  Penguin: "/shimeji/penguin.png",
  Mouse: "/shimeji/mouse.png",
  Dragon: "/shimeji/dragon.png",
  "Anime Hero": "/shimeji/hero.png",
  "Robot Cat": "/shimeji/robot.png",
  "Cartoon Kid": "/shimeji/kid.png"
};

const CHARACTER_SHEETS = {
  Lion: { src: "/shimeji/lion-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  Dog: { src: "/shimeji/dog-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  Cat: { src: "/shimeji/cat-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  Mouse: { src: "/shimeji/mouse-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  Dragon: { src: "/shimeji/dragon-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  "Anime Hero": { src: "/shimeji/hero-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  "Robot Cat": { src: "/shimeji/robot-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  "Cartoon Kid": { src: "/shimeji/kid-sheet.png", frameWidth: 128, frameHeight: 128, frames: 6, fps: 10 },
  "Brave Soldier": { src: "/shimeji/soldier-sheet.png", frameWidth: 90, frameHeight: 110, frames: 8, rows: 3, row: 0, fps: 12, scale: 1.24 },
  "Adventure Hunter": { src: "/shimeji/hunter-sheet.png", frameWidth: 90, frameHeight: 110, frames: 8, rows: 3, row: 0, fps: 12, scale: 1.24 }
};

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const mapFollowRequestToNotification = (request) => {
  const sender = request?.sender || {};
  const senderName = sender?.name || sender?.email || "User";
  const senderEmail = sender?.email || "";
  const senderIdentifier = senderEmail || sender?.id || senderName;
  const requestId = request?.id;
  return {
    id: requestId ? `fr-${requestId}` : `fr-${Math.random().toString(36).slice(2)}`,
    followRequestId: requestId,
    followRequestStatus: request?.status || "PENDING",
    isFollowRequest: true,
    kind: "follow",
    message: `${senderName} requested to follow you`,
    actorName: senderName,
    actorEmail: senderEmail || undefined,
    actorIdentifier: senderIdentifier,
    read: false,
    createdAt: request?.createdAt || request?.requestedAt || request?.time || null
  };
};

const mergeFollowRequestsWithNotifications = (notifications, followRequests) => {
  const base = Array.isArray(notifications) ? notifications : [];
  const requests = Array.isArray(followRequests) ? followRequests : [];
  if (!requests.length) return base;

  const existingRequestActors = new Set(
    base
      .filter((item) => String(item?.message || "").toLowerCase().includes("requested to follow"))
      .map((item) => normalizeKey(item?.actorEmail || item?.actorIdentifier))
      .filter(Boolean)
  );

  const mapped = requests
    .map(mapFollowRequestToNotification)
    .filter((item) => {
      const key = normalizeKey(item?.actorEmail || item?.actorIdentifier);
      if (key && existingRequestActors.has(key)) return false;
      return true;
    });

  if (!mapped.length) return base;
  return [...mapped, ...base];
};

const readDisplayName = () => {
  const name = sessionStorage.getItem("name") || localStorage.getItem("name");
  const username = sessionStorage.getItem("username") || localStorage.getItem("username");
  const email = sessionStorage.getItem("email") || localStorage.getItem("email");
  const raw = String(name || "").trim() || String(username || "").trim() || String(email || "").split("@")[0];
  if (!raw) return "there";
  const safe = raw.replace(/[^\w\s.-]/g, "").trim();
  return safe || "there";
};

const readStoredCharacter = () => {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};
    const fromSettings = normalizeNotificationBuddyCharacter(parsedSettings?.notificationBuddyCharacter);
    if (fromSettings) return fromSettings;
  } catch {
    // ignore storage issues
  }
  try {
    const stored = normalizeNotificationBuddyCharacter(localStorage.getItem(CHARACTER_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // ignore storage issues
  }
  return "Cat";
};

const writeStoredCharacter = (value) => {
  const safe = normalizeNotificationBuddyCharacter(value);
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};
    const base = parsedSettings && typeof parsedSettings === "object" ? parsedSettings : {};
    const next = { ...base, notificationBuddyCharacter: safe };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage issues
  }
  try {
    localStorage.setItem(CHARACTER_STORAGE_KEY, safe);
  } catch {
    // ignore storage issues
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ss-settings-update"));
    }
  } catch {
    // ignore dispatch failures
  }
};

const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);

const getPerimeterLength = (bounds) => {
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  return Math.max(1, 2 * (width + height));
};

const projectToBorder = (x, y, bounds) => {
  const clampedX = clampValue(x, bounds.minX, bounds.maxX);
  const clampedY = clampValue(y, bounds.minY, bounds.maxY);
  const candidates = [
    { edge: "top", dist: Math.abs(clampedY - bounds.minY), x: clampedX, y: bounds.minY },
    { edge: "right", dist: Math.abs(clampedX - bounds.maxX), x: bounds.maxX, y: clampedY },
    { edge: "bottom", dist: Math.abs(clampedY - bounds.maxY), x: clampedX, y: bounds.maxY },
    { edge: "left", dist: Math.abs(clampedX - bounds.minX), x: bounds.minX, y: clampedY }
  ];
  return candidates.reduce((best, item) => (item.dist < best.dist ? item : best), candidates[0]);
};

const pointToPerimeterProgress = (x, y, bounds) => {
  const projected = projectToBorder(x, y, bounds);
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  const localX = projected.x - bounds.minX;
  const localY = projected.y - bounds.minY;
  let progress = 0;
  if (projected.edge === "top") {
    progress = localX;
  } else if (projected.edge === "right") {
    progress = width + localY;
  } else if (projected.edge === "bottom") {
    progress = width + height + (width - localX);
  } else {
    progress = width + height + width + (height - localY);
  }
  return { progress, point: { x: projected.x, y: projected.y } };
};

const normalizeProgress = (value, perimeter) => {
  if (!Number.isFinite(value)) return 0;
  const mod = value % perimeter;
  return mod < 0 ? mod + perimeter : mod;
};

const progressToPoint = (progress, bounds) => {
  const perimeter = getPerimeterLength(bounds);
  const width = Math.max(0, bounds.maxX - bounds.minX);
  const height = Math.max(0, bounds.maxY - bounds.minY);
  let p = normalizeProgress(progress, perimeter);
  if (p <= width) return { x: bounds.minX + p, y: bounds.minY };
  p -= width;
  if (p <= height) return { x: bounds.maxX, y: bounds.minY + p };
  p -= height;
  if (p <= width) return { x: bounds.maxX - p, y: bounds.maxY };
  p -= width;
  return { x: bounds.minX, y: bounds.maxY - p };
};

const pickWalkSign = (point, bounds) => {
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const onTop = point.y <= bounds.minY + EDGE_EPS;
  const onBottom = point.y >= bounds.maxY - EDGE_EPS;
  const onLeft = point.x <= bounds.minX + EDGE_EPS;
  const onRight = point.x >= bounds.maxX - EDGE_EPS;

  if (onTop) return point.x < midX ? -1 : 1;
  if (onBottom) return point.x < midX ? 1 : -1;
  if (onRight) return point.y < midY ? -1 : 1;
  if (onLeft) return point.y < midY ? 1 : -1;
  return 1;
};

const getBounds = (node) => {
  const visualViewport = typeof window !== "undefined" ? window.visualViewport : null;
  const width = node?.offsetWidth ?? visualViewport?.width ?? window.innerWidth ?? 900;
  const height = node?.offsetHeight ?? visualViewport?.height ?? window.innerHeight ?? 700;
  const bottomPad = width <= 768 ? 60 : 48;
  const scaledWidth = BASE_WIDTH * SHIMEJI_SCALE;
  const scaledHeight = BASE_HEIGHT * SHIMEJI_SCALE;
  const minX = EDGE_PAD;
  const minY = 0;
  const maxX = Math.max(minX, width - EDGE_PAD - scaledWidth);
  const maxY = Math.max(minY, height - bottomPad - scaledHeight);
  return { width, height, minX, minY, maxX, maxY };
};

const getDefaultPosition = (node) => {
  const bounds = getBounds(node);
  return { x: clampValue(bounds.minX + 60, bounds.minX, bounds.maxX), y: bounds.maxY };
};

const readStoredPosition = () => {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  } catch {
    // ignore storage issues
  }
  return null;
};

const writeStoredPosition = (position) => {
  if (!position) return;
  const payload = { x: Number(position.x), y: Number(position.y) };
  if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage issues
  }
};

const readBuddyEnabled = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed?.notificationBuddy === "boolean") return parsed.notificationBuddy;
  } catch {
    // ignore storage issues
  }
  return true;
};

const readHideWhenEmpty = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed?.notificationBuddyHideWhenEmpty === "boolean") {
      return parsed.notificationBuddyHideWhenEmpty;
    }
  } catch {
    // ignore storage issues
  }
  return false;
};

const readVoicePrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const voiceEnabled =
      typeof parsed?.notificationBuddyVoiceEnabled === "boolean"
        ? parsed.notificationBuddyVoiceEnabled
        : true;
    const voiceName = String(parsed?.notificationBuddyVoiceName || "");
    const voiceRate = Number(parsed?.notificationBuddyVoiceRate);
    const voicePitch = Number(parsed?.notificationBuddyVoicePitch);
    return {
      enabled: voiceEnabled,
      name: voiceName,
      rate: Number.isFinite(voiceRate) && voiceRate > 0 ? voiceRate : DEFAULT_VOICE_RATE,
      pitch: Number.isFinite(voicePitch) && voicePitch > 0 ? voicePitch : DEFAULT_VOICE_PITCH
    };
  } catch {
    return { enabled: true, name: "", rate: DEFAULT_VOICE_RATE, pitch: DEFAULT_VOICE_PITCH };
  }
};

const readBuddySpeed = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const value = String(parsed?.notificationBuddySpeed || DEFAULT_BUDDY_SPEED).trim().toLowerCase();
    return BUDDY_SPEED_MULTIPLIERS[value] ? value : DEFAULT_BUDDY_SPEED;
  } catch {
    return DEFAULT_BUDDY_SPEED;
  }
};

const deriveKind = (item) => {
  const explicit = String(item?.kind || "").trim().toLowerCase();
  if (explicit) return explicit;
  const message = String(item?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("emergency") || lower.includes("sos")) return "emergency";
  if (lower.includes("message") || lower.includes("dm") || lower.includes("chat")) return "message";
  if (lower.includes("comment") || lower.includes("mentioned") || lower.includes("tagged")) return "comment";
  if (lower.includes("follow")) return "follow";
  if (lower.includes("like")) return "like";
  return "system";
};

const buildSpeechText = (name, count) => {
  const label = count === 1 ? "notification" : "notifications";
  return `${name}, you have ${count} new ${label}.`;
};

const getCharacterStyle = (character) => {
  const base = {
    renderMode: CHARACTER_ASSETS[character] ? "sprite" : "rig",
    headColor: "#f1f5ff",
    bodyColor: "#8ea4d5",
    tailTipColor: "#b8c6ec",
    accentColor: "#93c5fd",
    accentStrong: "#60a5fa",
    label: "Cat"
  };
  switch (character) {
    case "Lion":
      return {
        ...base,
        headColor: "#ffe8b8",
        bodyColor: "#f8b34c",
        tailTipColor: "#d97706",
        tail: "lion",
        mane: true,
        lionChest: true,
        accentColor: "#f59e0b",
        accentStrong: "#f97316",
        label: "Lion"
      };
    case "Dog":
      return {
        ...base,
        headColor: "#ffd9ba",
        bodyColor: "#f5a56b",
        tail: "dog",
        floppyEars: true,
        collar: true,
        tag: true,
        accentColor: "#fb923c",
        accentStrong: "#f97316",
        label: "Dog"
      };
    case "Cat":
      return {
        ...base,
        headColor: "#f1f5ff",
        bodyColor: "#8ea4d5",
        tailTipColor: "#b8c6ec",
        tail: "cat",
        catEars: true,
        stripes: true,
        accentColor: "#93c5fd",
        accentStrong: "#60a5fa",
        label: "Cat"
      };
    case "Puppy":
      return {
        ...base,
        headColor: "#ffe0c7",
        bodyColor: "#f3a86f",
        tail: "dog",
        floppyEars: true,
        collar: true,
        tag: true,
        accentColor: "#fb923c",
        accentStrong: "#f97316",
        label: "Puppy"
      };
    case "Panda":
      return {
        ...base,
        headColor: "#f5f5f5",
        bodyColor: "#9ca3af",
        tailTipColor: "#d1d5db",
        catEars: true,
        cheeks: true,
        accentColor: "#e5e7eb",
        accentStrong: "#6b7280",
        label: "Panda"
      };
    case "Bunny":
      return {
        ...base,
        headColor: "#fef3c7",
        bodyColor: "#f9a8d4",
        tail: "dog",
        floppyEars: true,
        cheeks: true,
        accentColor: "#fcd34d",
        accentStrong: "#f472b6",
        label: "Bunny"
      };
    case "Penguin":
      return {
        ...base,
        headColor: "#dbeafe",
        bodyColor: "#111827",
        cheekColor: "#bfdbfe",
        cheeks: true,
        accentColor: "#60a5fa",
        accentStrong: "#2563eb",
        label: "Penguin"
      };
    case "Mouse":
      return {
        ...base,
        headColor: "#fde8d7",
        bodyColor: "#7fb4db",
        tailTipColor: "#c7ddf1",
        tail: "cat",
        mouseEars: true,
        whiskers: true,
        cheeks: true,
        accentColor: "#7dd3fc",
        accentStrong: "#38bdf8",
        label: "Mouse"
      };
    case "Fox":
      return {
        ...base,
        headColor: "#ffe1c2",
        bodyColor: "#fb923c",
        tailTipColor: "#fff7ed",
        tail: "cat",
        catEars: true,
        cheeks: true,
        stripes: true,
        accentColor: "#fdba74",
        accentStrong: "#f97316",
        label: "Fox"
      };
    case "Dragon":
      return {
        ...base,
        headColor: "#dcfce7",
        bodyColor: "#34d399",
        tailColor: "#10b981",
        tailTipColor: "#a7f3d0",
        tail: "dragon",
        dragonEars: true,
        wings: true,
        dragonScales: true,
        accentColor: "#6ee7b7",
        accentStrong: "#10b981",
        label: "Dragon"
      };
    case "Anime Hero":
      return {
        ...base,
        headColor: "#ffe8c4",
        bodyColor: "#6aa9ff",
        hairColor: "#1f2937",
        hair: "spiky",
        belt: true,
        buckle: true,
        accentColor: "#f97316",
        accentStrong: "#2563eb",
        label: "Anime Hero"
      };
    case "Robot Cat":
      return {
        ...base,
        headColor: "#d5f3ff",
        bodyColor: "#6acbff",
        robotBell: true,
        whiskers: true,
        robotPanel: true,
        robotJoints: true,
        accentColor: "#38bdf8",
        accentStrong: "#0ea5e9",
        label: "Robot Cat"
      };
    case "Cartoon Kid":
      return {
        ...base,
        headColor: "#ffe3ba",
        bodyColor: "#ff7f7f",
        cheekColor: "#ffc0d8",
        cheeks: true,
        brows: true,
        belt: true,
        buckle: true,
        kidButtons: true,
        accentColor: "#fb7185",
        accentStrong: "#f43f5e",
        label: "Cartoon Kid"
      };
    case "Brave Soldier":
      return {
        ...base,
        renderMode: "sheet",
        headColor: "#f3d0a8",
        bodyColor: "#7a8764",
        hairColor: "#5b4639",
        brows: true,
        belt: true,
        buckle: true,
        accentColor: "#c2a469",
        accentStrong: "#7c5a36",
        label: "Brave Soldier"
      };
    case "Adventure Hunter":
      return {
        ...base,
        renderMode: "sheet",
        headColor: "#ffe2bb",
        bodyColor: "#7ca8c9",
        hairColor: "#3f4148",
        hair: "spiky",
        belt: true,
        buckle: true,
        brows: true,
        accentColor: "#93c5fd",
        accentStrong: "#3b82f6",
        label: "Adventure Hunter"
      };
    default:
      return {
        ...base,
        tail: "cat",
        catEars: true,
        stripes: true,
        label: "Cat"
      };
  }
};

export default function NotificationBuddy({ enabled = true }) {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState("list");
  const [alerting, setAlerting] = useState(false);
  const [speechText, setSpeechText] = useState("");
  const [speechVisible, setSpeechVisible] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [softHidden, setSoftHidden] = useState(false);
  const [dismissHover, setDismissHover] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [character, setCharacter] = useState(readStoredCharacter);
  const [spriteErrors, setSpriteErrors] = useState({});
  const [sheetStatus, setSheetStatus] = useState({});
  const [voicePrefs, setVoicePrefs] = useState(readVoicePrefs);
  const [buddySpeed, setBuddySpeed] = useState(readBuddySpeed);
  const initialPosition = useMemo(() => readStoredPosition(), []);
  const [position, setPosition] = useState(() => initialPosition || { x: 40, y: 0 });
  const positionRef = useRef(position);
  const hasStoredPositionRef = useRef(Boolean(initialPosition));
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    lastX: 0,
    lastY: 0,
    didDrag: false,
    allowTap: false
  });
  const [dragging, setDragging] = useState(false);
  const [direction, setDirection] = useState(1);
  const [settingsEnabled, setSettingsEnabled] = useState(readBuddyEnabled);
  const [hideWhenEmpty, setHideWhenEmpty] = useState(readHideWhenEmpty);
  const walkAreaRef = useRef(null);
  const rootRef = useRef(null);
  const panelModeRef = useRef(panelMode);
  const walkProgressRef = useRef(null);
  const walkSignRef = useRef(-1);
  const alertTimerRef = useRef(null);
  const speechTimerRef = useRef(null);
  const longPressRef = useRef({ timer: null, triggered: false });
  const lastUnreadRef = useRef(0);
  const hiddenUntilUnreadRef = useRef(null);
  const didInitRef = useRef(false);
  const canSpeakRef = useRef(false);
  const displayName = useMemo(() => readDisplayName(), []);
  const voicePrefsRef = useRef(voicePrefs);
  const buddySpeedRef = useRef(buddySpeed);

  useEffect(() => {
    voicePrefsRef.current = voicePrefs;
  }, [voicePrefs]);
  useEffect(() => {
    buddySpeedRef.current = buddySpeed;
  }, [buddySpeed]);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  useEffect(() => {
    panelModeRef.current = panelMode;
  }, [panelMode]);

  useEffect(() => {
    setSpriteErrors((prev) => {
      if (!prev?.[character]) return prev;
      const next = { ...prev };
      delete next[character];
      return next;
    });
  }, [character]);

  useEffect(() => {
    const config = CHARACTER_SHEETS[character];
    if (!config?.src) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setSheetStatus((prev) => ({ ...prev, [character]: "loaded" }));
    };
    img.onerror = () => {
      if (cancelled) return;
      setSheetStatus((prev) => ({ ...prev, [character]: "error" }));
    };
    img.src = config.src;
    return () => {
      cancelled = true;
    };
  }, [character]);

  const isOnNotificationsPage = location.pathname === "/notifications";
  const isEnabled = enabled && settingsEnabled;

  useEffect(() => {
    if (!isEnabled) return undefined;
    if (!hasStoredPositionRef.current) {
      const bounds = getBounds(walkAreaRef.current);
      const fallback = getDefaultPosition(walkAreaRef.current);
      const projected = pointToPerimeterProgress(fallback.x, fallback.y, bounds);
      setPosition(projected.point);
      walkProgressRef.current = projected.progress;
      walkSignRef.current = -1;
      hasStoredPositionRef.current = true;
    } else {
      setPosition((prev) => {
        const bounds = getBounds(walkAreaRef.current);
        const projected = pointToPerimeterProgress(prev.x, prev.y, bounds);
        walkProgressRef.current = projected.progress;
        walkSignRef.current = -1;
        return projected.point;
      });
    }

    const handleResize = () => {
      setPosition((prev) => {
        const bounds = getBounds(walkAreaRef.current);
        const projected = pointToPerimeterProgress(prev.x, prev.y, bounds);
        walkProgressRef.current = projected.progress;
        walkSignRef.current = -1;
        return projected.point;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isEnabled]);

  const unreadItems = useMemo(
    () => items.filter((item) => !item?.read),
    [items]
  );

  const unreadCount = unreadItems.length;

  const kindCounts = useMemo(() => {
    const counts = {
      message: 0,
      like: 0,
      comment: 0,
      follow: 0,
      system: 0,
      emergency: 0
    };
    unreadItems.forEach((item) => {
      const kind = deriveKind(item);
      if (counts[kind] == null) {
        counts.system += 1;
      } else {
        counts[kind] += 1;
      }
    });
    return counts;
  }, [unreadItems]);

  const panelListItems = useMemo(() => {
    const combined = unreadItems;
    const seen = new Set();
    const output = [];
    for (const entry of combined) {
      if (output.length >= MAX_PANEL_ITEMS) break;
      const key = String(entry?.id || entry?.followRequestId || entry?.message || "").trim();
      const safeKey = key || `entry-${output.length}`;
      if (seen.has(safeKey)) continue;
      seen.add(safeKey);
      output.push(entry);
    }
    return output;
  }, [unreadItems]);

  const showSpeech = (text, duration = 5200) => {
    setSpeechText(text);
    setSpeechVisible(true);
    setNoticeDismissed(false);
    if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
    speechTimerRef.current = window.setTimeout(() => {
      setSpeechVisible(false);
    }, duration);
  };

  const maybeSpeak = (text) => {
    const prefs = voicePrefsRef.current;
    if (prefs && prefs.enabled === false) return;
    if (!canSpeakRef.current) return;
    if (document.visibilityState === "hidden") return;
    if (!window.speechSynthesis) return;
    try {
      const synth = window.speechSynthesis;
      const voices = typeof synth.getVoices === "function" ? synth.getVoices() : [];
      const preferred =
        prefs?.name
          ? voices.find((voice) => voice.voiceURI === prefs.name || voice.name === prefs.name)
          : null;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = prefs?.rate || DEFAULT_VOICE_RATE;
      utter.pitch = prefs?.pitch || DEFAULT_VOICE_PITCH;
      utter.lang = "en-US";
      if (preferred) utter.voice = preferred;
      synth.speak(utter);
    } catch {
      // speech synthesis failed or blocked
    }
  };

  const triggerAlert = (text, speak = true) => {
    setAlerting(true);
    showSpeech(text);
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => {
      setAlerting(false);
    }, 3600);
    if (speak && !isOnNotificationsPage) {
      maybeSpeak(text);
    }
  };

  const openPanel = (mode) => {
    setPanelMode(mode);
    setPanelOpen(true);
    setSpeechVisible(false);
    setSpeechText("");
    setNoticeDismissed(true);
  };

  const togglePanel = (mode) => {
    setPanelMode(mode);
    if (!panelOpen || panelModeRef.current !== mode) {
      setSpeechVisible(false);
      setSpeechText("");
      setNoticeDismissed(true);
    }
    setPanelOpen((prev) => {
      if (!prev) return true;
      return panelModeRef.current === mode ? false : true;
    });
  };

  const isPointerInHitbox = (event) => {
    const target = event.currentTarget;
    if (!target?.getBoundingClientRect) return true;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const insetX = Math.min(HITBOX_INSET_X, rect.width * 0.14);
    const insetTop = Math.min(HITBOX_INSET_TOP, rect.height * 0.14);
    const insetBottom = Math.min(HITBOX_INSET_BOTTOM, rect.height * 0.08);
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return false;
    if (x < insetX || x > rect.width - insetX) return false;
    if (y < insetTop || y > rect.height - insetBottom) return false;
    return true;
  };

  const dropToBottom = () => {
    const bounds = getBounds(walkAreaRef.current);
    const nextX = clampValue(positionRef.current.x, bounds.minX, bounds.maxX);
    const nextY = bounds.maxY;
    setPosition({ x: nextX, y: nextY });
    hasStoredPositionRef.current = true;
    writeStoredPosition({ x: nextX, y: nextY });
    walkProgressRef.current = pointToPerimeterProgress(nextX, nextY, bounds).progress;
    walkSignRef.current = -1;
  };

  useEffect(() => {
    const enableSpeech = () => {
      canSpeakRef.current = true;
      window.removeEventListener("pointerdown", enableSpeech);
    };
    window.addEventListener("pointerdown", enableSpeech, { once: true });
    return () => window.removeEventListener("pointerdown", enableSpeech);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setSettingsEnabled(readBuddyEnabled());
      setCharacter(readStoredCharacter());
      setVoicePrefs(readVoicePrefs());
      setBuddySpeed(readBuddySpeed());
      setHideWhenEmpty(readHideWhenEmpty());
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("ss-settings-update", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("ss-settings-update", refresh);
    };
  }, []);

  useEffect(() => {
    if (!isEnabled) return undefined;
    let active = true;

    const fetchFollowRequests = async () => {
      const endpoints = ["/api/follow/requests", "/api/follow/pending-requests"];
      for (const url of endpoints) {
        try {
          const res = await api.get(url);
          return Array.isArray(res.data) ? res.data : [];
        } catch (err) {
          if (err?.response?.status === 404) continue;
          return [];
        }
      }
      return [];
    };

    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const [notifResult, followResult] = await Promise.allSettled([
          api.get("/api/notifications", { params: { limit: 120 } }),
          fetchFollowRequests()
        ]);

        const list = notifResult.status === "fulfilled" && Array.isArray(notifResult.value?.data)
          ? notifResult.value.data
          : [];
        const followRequests = followResult.status === "fulfilled" && Array.isArray(followResult.value)
          ? followResult.value
          : [];
        const merged = mergeFollowRequestsWithNotifications(list, followRequests);
        if (!active) return;
        setItems(merged);
        setLoaded(true);
      } catch {
        if (active) {
          setItems([]);
          setLoaded(true);
        }
      }
    };

    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isEnabled]);

  useEffect(() => {
    if (!isEnabled || panelOpen || dragging) return undefined;
    const interval = window.setInterval(() => {
      setPosition((prev) => {
        const bounds = getBounds(walkAreaRef.current);
        const perimeter = getPerimeterLength(bounds);
        const speedKey = buddySpeedRef.current || DEFAULT_BUDDY_SPEED;
        const multiplier = BUDDY_SPEED_MULTIPLIERS[speedKey] || 1;
        const baseStep = clampValue(perimeter / 220, 2, 6);
        const stepSize = clampValue(baseStep * multiplier, 1.5, 9);
        if (!Number.isFinite(walkProgressRef.current)) {
          const projected = pointToPerimeterProgress(prev.x, prev.y, bounds);
          walkProgressRef.current = projected.progress;
          walkSignRef.current = -1;
          return projected.point;
        }

        walkProgressRef.current = normalizeProgress(
          walkProgressRef.current + stepSize * walkSignRef.current,
          perimeter
        );

        const nextPoint = progressToPoint(walkProgressRef.current, bounds);
        const deltaX = nextPoint.x - prev.x;
        if (Math.abs(deltaX) > 0.1) setDirection(deltaX >= 0 ? 1 : -1);
        return nextPoint;
      });
    }, WALK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [direction, isEnabled, panelOpen, dragging]);

  useEffect(() => {
    if (!isEnabled) return;
    if (!loaded) return;
    if (!didInitRef.current) {
      didInitRef.current = true;
      lastUnreadRef.current = unreadCount;
      if (unreadCount > 0) {
        const text = buildSpeechText(displayName, unreadCount);
        showSpeech(text, 4200);
      }
      return;
    }
    if (unreadCount > lastUnreadRef.current) {
      const text = buildSpeechText(displayName, unreadCount);
      triggerAlert(text, true);
    }
    lastUnreadRef.current = unreadCount;
  }, [loaded, unreadCount, displayName, isEnabled]);

  useEffect(() => {
    if (!softHidden) return;
    const gate = hiddenUntilUnreadRef.current;
    if (gate == null) return;
    if (unreadCount > gate) {
      hiddenUntilUnreadRef.current = null;
      setSoftHidden(false);
      setNoticeDismissed(false);
    }
  }, [softHidden, unreadCount]);

  useEffect(() => {
    if (!panelOpen) return undefined;
    const handleOutside = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [panelOpen]);

  useEffect(() => {
    writeStoredCharacter(character);
  }, [character]);

  useEffect(() => {
    if (isEnabled) return;
    setPanelOpen(false);
    setAlerting(false);
    setSpeechVisible(false);
    setNoticeDismissed(false);
  }, [isEnabled]);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
      if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
      if (longPressRef.current?.timer) window.clearTimeout(longPressRef.current.timer);
    };
  }, []);
  const shouldRenderBuddy = isEnabled && !softHidden && !(hideWhenEmpty && unreadCount === 0);

  const getDismissZone = () => {
    const bounds = getBounds(walkAreaRef.current);
    const width = Math.min(DISMISS_ZONE_MAX_WIDTH, Math.max(DISMISS_ZONE_MIN_WIDTH, bounds.width * 0.3));
    const height = Math.min(DISMISS_ZONE_MAX_HEIGHT, Math.max(DISMISS_ZONE_MIN_HEIGHT, bounds.height * 0.18));
    const bottomPad = bounds.width <= 768 ? DISMISS_ZONE_MOBILE_PAD : DISMISS_ZONE_BOTTOM_PAD;
    const left = (bounds.width - width) / 2;
    const top = bounds.height - bottomPad - height;
    return {
      left,
      right: left + width,
      top,
      bottom: top + height,
      width,
      height,
      bottomPad
    };
  };

  const isPointInDismissZone = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const zone = getDismissZone();
    return x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
  };

  const hideBuddyUntilNext = () => {
    hiddenUntilUnreadRef.current = unreadCount;
    setSoftHidden(true);
    setDismissHover(false);
    setPanelOpen(false);
    setAlerting(false);
    setSpeechVisible(false);
    setSpeechText("");
    setNoticeDismissed(false);
  };

  const startLongPress = () => {
    longPressRef.current.triggered = false;
    if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current.timer = null;
  };

  const cancelLongPress = () => {
    if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer);
  };

  const handlePointerDown = (event) => {
    if (event.button && event.button !== 0) return;
    if (!isPointerInHitbox(event)) {
      dragRef.current.active = false;
      dragRef.current.allowTap = false;
      return;
    }
    setDismissHover(false);
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
      lastX: positionRef.current.x,
      lastY: positionRef.current.y,
      didDrag: false,
      allowTap: true
    };
    setDragging(false);
    startLongPress();
    if (event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture failures
      }
    }
  };

  const handlePointerMove = (event) => {
    const dragState = dragRef.current;
    if (!dragState.active || dragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const distance = Math.hypot(dx, dy);
    if (!dragState.didDrag && distance > DRAG_THRESHOLD_PX) {
      dragState.didDrag = true;
      cancelLongPress();
      setPanelOpen(false);
      setDragging(true);
    }
    if (!dragState.didDrag) return;
    setDismissHover(isPointInDismissZone(event.clientX, event.clientY));
    const bounds = getBounds(walkAreaRef.current);
    const projected = projectToBorder(dragState.originX + dx, dragState.originY + dy, bounds);
    dragState.lastX = projected.x;
    dragState.lastY = projected.y;
    setPosition({ x: projected.x, y: projected.y });
  };

  const handlePointerUp = (event) => {
    cancelLongPress();
    const dragState = dragRef.current;
    if (!dragState.active || dragState.pointerId !== event.pointerId || !dragState.allowTap) {
      dragRef.current.active = false;
      dragRef.current.allowTap = false;
      return;
    }
    dragState.active = false;
    dragState.allowTap = false;
    if (dragState.didDrag) {
      setDragging(false);
      if (isPointInDismissZone(event.clientX, event.clientY)) {
        hideBuddyUntilNext();
        return;
      }
      setDismissHover(false);
      const bounds = getBounds(walkAreaRef.current);
      const projected = pointToPerimeterProgress(dragState.lastX, dragState.lastY, bounds);
      walkProgressRef.current = projected.progress;
      walkSignRef.current = -1;
      setPosition(projected.point);
      hasStoredPositionRef.current = true;
      writeStoredPosition(projected.point);
      return;
    }
    setDragging(false);
    if (longPressRef.current.triggered) return;
    const bounds = getBounds(walkAreaRef.current);
    const isAtBottom = positionRef.current.y >= bounds.maxY - BOTTOM_TAP_THRESHOLD_PX;
    if (!isAtBottom) {
      setPanelOpen(false);
      dropToBottom();
      return;
    }
    togglePanel("list");
  };

  const handlePointerCancel = () => {
    cancelLongPress();
    dragRef.current.active = false;
    dragRef.current.allowTap = false;
    setDragging(false);
    setDismissHover(false);
  };

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount || "");
  const isHoldingNotice = unreadCount > 0 || speechVisible || alerting;
  const isWalking = isEnabled && !panelOpen && !dragging;

  const characterStyle = useMemo(() => getCharacterStyle(character), [character]);
  const characterVars = {
    "--head-color": characterStyle.headColor,
    "--body-color": characterStyle.bodyColor,
    "--tail-color": characterStyle.tailColor || characterStyle.bodyColor,
    "--tail-tip-color": characterStyle.tailTipColor || "#d97706",
    "--hair-color": characterStyle.hairColor || "#1f2937",
    "--cheek-color": characterStyle.cheekColor || "#f9a8d4",
    "--accent-color": characterStyle.accentColor || "#f59e0b",
    "--accent-strong": characterStyle.accentStrong || "#f97316",
    "--ss-buddy-scale": SHIMEJI_SCALE,
    "--ss-buddy-direction": direction
  };
  const sheetConfig = CHARACTER_SHEETS[character];
  const characterAsset = CHARACTER_ASSETS[character];
  const renderMode = characterStyle.renderMode || "rig";
  const sheetReady = sheetConfig && sheetStatus?.[character] === "loaded";
  const canUseSheet = renderMode === "sheet" && Boolean(sheetConfig?.src) && sheetReady;
  const canUseSprite = renderMode === "sprite" && !canUseSheet && Boolean(characterAsset) && !spriteErrors?.[character];
  const handleSpriteError = () => {
    setSpriteErrors((prev) => ({ ...prev, [character]: true }));
  };
  const sheetRows = Math.max(1, Number(sheetConfig?.rows) || 1);
  const sheetRowIndex = clampValue(Number(sheetConfig?.row) || 0, 0, sheetRows - 1);
  const sheetScale = sheetConfig?.scale ?? 1;
  const sheetStyle = sheetConfig
    ? {
        width: `${sheetConfig.frameWidth}px`,
        height: `${sheetConfig.frameHeight}px`,
        backgroundImage: `url(${sheetConfig.src})`,
        backgroundSize: `${sheetConfig.frameWidth * sheetConfig.frames}px ${sheetConfig.frameHeight * sheetRows}px`,
        backgroundPositionY: `${-1 * sheetConfig.frameHeight * sheetRowIndex}px`,
        transform: `translateX(-50%) scale(${sheetScale})`,
        transformOrigin: "center bottom",
        "--sheet-steps": sheetConfig.frames,
        "--sheet-max-x": `${-1 * sheetConfig.frameWidth * (sheetConfig.frames - 1)}px`,
        "--sheet-speed": `${(sheetConfig.frames / (sheetConfig.fps || 10)).toFixed(2)}s`
      }
    : undefined;

  const panelEntries = [
    { key: "message", label: "Msgs", count: kindCounts.message, tone: "message" },
    { key: "like", label: "Likes", count: kindCounts.like, tone: "like" },
    { key: "comment", label: "Comments", count: kindCounts.comment, tone: "comment" },
    { key: "follow", label: "Follows", count: kindCounts.follow, tone: "follow" },
    { key: "emergency", label: "SOS", count: kindCounts.emergency, tone: "emergency" },
    { key: "system", label: "Other", count: kindCounts.system, tone: "system" }
  ];

  const motionProfile =
    buddySpeed === "fast"
      ? { stepDuration: "0.5s", idleDuration: "1.25s" }
      : buddySpeed === "slow"
        ? { stepDuration: "0.86s", idleDuration: "1.8s" }
        : { stepDuration: "0.66s", idleDuration: "1.5s" };

  const actorStyle = {
    "--ss-step-duration": motionProfile.stepDuration,
    "--ss-idle-duration": motionProfile.idleDuration
  };
  const triggerStyle = {
    width: `${Math.round(BASE_WIDTH * SHIMEJI_SCALE)}px`,
    height: `${Math.round(BASE_HEIGHT * SHIMEJI_SCALE)}px`
  };
  const panelTitle =
    panelMode === "types"
      ? unreadCount > 0
        ? `${unreadCount} unread`
        : "No unread yet"
      : unreadCount > 0
        ? "New notifications"
        : "No new notifications";

  const panelHint =
    panelMode === "types"
      ? "Tap buddy at the bottom to see new notifications."
      : "Long press buddy to see notification types.";

  const panelLayout = useMemo(() => {
    const bounds = getBounds(walkAreaRef.current);
    const panelWidth = Math.max(200, Math.min(PANEL_MAX_WIDTH, bounds.width - PANEL_HORIZONTAL_MARGIN * 2));
    const buddyCenterX = position.x + (BASE_WIDTH * SHIMEJI_SCALE) / 2;
    const minCenter = panelWidth / 2 + PANEL_HORIZONTAL_MARGIN;
    const maxCenter = bounds.width - panelWidth / 2 - PANEL_HORIZONTAL_MARGIN;
    const clampedCenter = clampValue(buddyCenterX, minCenter, maxCenter);
    const offsetX = clampedCenter - buddyCenterX;
    const scaledHeight = BASE_HEIGHT * SHIMEJI_SCALE;
    const panelHeight = PANEL_EST_HEIGHT + (panelMode === "list" ? 24 : 0);
    const buddyBottom = position.y + scaledHeight;
    const spaceBelow = bounds.height - buddyBottom - PANEL_HORIZONTAL_MARGIN;
    const placeAbove = spaceBelow < panelHeight + 8;
    const belowOffset = Math.round(scaledHeight + PANEL_GAP_PX);
    const aboveOffset = Math.round(scaledHeight + PANEL_GAP_PX);
    return {
      width: panelWidth,
      offsetX,
      placeAbove,
      belowOffset,
      aboveOffset
    };
  }, [position.x, position.y, panelMode]);

  if (!shouldRenderBuddy) return null;

  return (
    <div ref={walkAreaRef} className="ss-shimeji-area">
      {dragging && (
        <div className={`ss-shimeji-dismiss ${dismissHover ? "is-active" : ""}`}>
          <span aria-hidden="true">×</span>
        </div>
      )}
      <div
        ref={rootRef}
        className={`ss-shimeji-walker ${alerting ? "is-alerting" : ""} ${isWalking ? "is-walking" : "is-idle"}`}
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          "--ss-travel-duration": `${WALK_INTERVAL_MS}ms`
        }}
      >
        <button
          type="button"
          className={`ss-shimeji-trigger ${isHoldingNotice ? "is-holding" : ""} ${dragging ? "is-dragging" : ""}`}
          style={triggerStyle}
          aria-label="Notification buddy"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerCancel}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="ss-shimeji-actor" style={actorStyle}>
            <div className={`ss-shimeji-figure ${canUseSprite || canUseSheet ? "has-sprite" : ""}`} style={characterVars}>
              {canUseSheet ? (
                <div className="ss-shimeji-sprite-sheet" style={sheetStyle} aria-hidden="true" />
              ) : canUseSprite ? (
                <img
                  className="ss-shimeji-sprite"
                  src={characterAsset}
                  alt={characterStyle.label}
                  draggable="false"
                  onError={handleSpriteError}
                />
              ) : (
                <>
                  {characterStyle.tail === "cat" && <div className="ss-shimeji-tail cat" />}
                  {characterStyle.tail === "dog" && <div className="ss-shimeji-tail dog" />}
                  {characterStyle.tail === "lion" && (
                    <div className="ss-shimeji-tail lion">
                      <span className="ss-shimeji-tail-tip" />
                    </div>
                  )}
                  {characterStyle.tail === "dragon" && (
                    <div className="ss-shimeji-tail dragon">
                      <span className="ss-shimeji-tail-tip" />
                    </div>
                  )}
                  {characterStyle.tail === "lightning" && (
                    <div className="ss-shimeji-tail lightning">
                      <span className="seg a" />
                      <span className="seg b" />
                      <span className="seg c" />
                      <span className="seg d" />
                    </div>
                  )}

                  {characterStyle.wings && (
                    <>
                      <div className="ss-shimeji-wing left" />
                      <div className="ss-shimeji-wing right" />
                    </>
                  )}

                  <div className={`ss-shimeji-head ${characterStyle.mane ? "has-mane" : ""}`}>
                    {characterStyle.catEars && (
                      <>
                        <div className="ss-shimeji-ear cat left" />
                        <div className="ss-shimeji-ear cat right" />
                      </>
                    )}
                    {characterStyle.floppyEars && (
                      <>
                        <div className="ss-shimeji-ear floppy left" />
                        <div className="ss-shimeji-ear floppy right" />
                      </>
                    )}
                    {characterStyle.mouseEars && (
                      <>
                        <div className="ss-shimeji-ear mouse left" />
                        <div className="ss-shimeji-ear mouse right" />
                      </>
                    )}
                    {characterStyle.dragonEars && (
                      <>
                        <div className="ss-shimeji-ear dragon left" />
                        <div className="ss-shimeji-ear dragon right" />
                      </>
                    )}

                    {characterStyle.hair === "spiky" && (
                      <>
                        <div className="ss-shimeji-hair spike a" />
                        <div className="ss-shimeji-hair spike b" />
                        <div className="ss-shimeji-hair spike c" />
                      </>
                    )}

                    <div className="ss-shimeji-eye left" />
                    <div className="ss-shimeji-eye right" />

                    {characterStyle.cheeks && (
                      <>
                        <div className="ss-shimeji-cheek left" />
                        <div className="ss-shimeji-cheek right" />
                      </>
                    )}

                    {characterStyle.whiskers && (
                      <>
                        <div className="ss-shimeji-whisker left a" />
                        <div className="ss-shimeji-whisker left b" />
                        <div className="ss-shimeji-whisker right a" />
                        <div className="ss-shimeji-whisker right b" />
                      </>
                    )}

                    {characterStyle.brows && (
                      <>
                        <div className="ss-shimeji-brow left" />
                        <div className="ss-shimeji-brow right" />
                      </>
                    )}

                    {characterStyle.robotBell && <div className="ss-shimeji-robot-bell" />}

                    <div className="ss-shimeji-mouth" />
                  </div>

                  <div className="ss-shimeji-arm left" />
                  <div className={`ss-shimeji-arm right ${isHoldingNotice ? "is-raised" : ""}`} />
                  <div className="ss-shimeji-body" />
                  {characterStyle.collar && <div className="ss-shimeji-accessory collar" />}
                  {characterStyle.tag && <div className="ss-shimeji-accessory tag" />}
                  {characterStyle.belt && <div className="ss-shimeji-accessory belt" />}
                  {characterStyle.buckle && <div className="ss-shimeji-accessory buckle" />}
                  {characterStyle.stripes && (
                    <>
                      <div className="ss-shimeji-accessory stripe a" />
                      <div className="ss-shimeji-accessory stripe b" />
                    </>
                  )}
                  {characterStyle.boltStripe && <div className="ss-shimeji-accessory bolt" />}
                  {characterStyle.robotPanel && (
                    <>
                      <div className="ss-shimeji-accessory robot-panel" />
                      <div className="ss-shimeji-accessory robot-panel small" />
                    </>
                  )}
                  {characterStyle.robotJoints && (
                    <>
                      <div className="ss-shimeji-accessory robot-joint left" />
                      <div className="ss-shimeji-accessory robot-joint right" />
                      <div className="ss-shimeji-accessory robot-hip left" />
                      <div className="ss-shimeji-accessory robot-hip right" />
                    </>
                  )}
                  {characterStyle.dragonScales && <div className="ss-shimeji-accessory scales" />}
                  {characterStyle.lionChest && <div className="ss-shimeji-accessory lion-chest" />}
                  {characterStyle.kidButtons && (
                    <>
                      <div className="ss-shimeji-accessory kid-button a" />
                      <div className="ss-shimeji-accessory kid-button b" />
                    </>
                  )}
                  <div className="ss-shimeji-leg left" />
                  <div className="ss-shimeji-leg right" />
                </>
              )}

            </div>
          </div>
        </button>

        {panelOpen && (
          <div
            className="ss-notify-buddy-panel"
            role="dialog"
            aria-label="Notifications"
            style={{
              maxWidth: `${panelLayout.width}px`,
              transform: `translateX(calc(-50% + ${panelLayout.offsetX}px))`,
              bottom: panelLayout.placeAbove ? `${panelLayout.aboveOffset}px` : "auto",
              top: panelLayout.placeAbove ? "auto" : `${panelLayout.belowOffset}px`
            }}
          >
            {panelMode === "types" ? (
              <div className="ss-notify-buddy-panel-list">
                {panelEntries.filter((entry) => entry.count > 0).length === 0 ? (
                  <div className="ss-notify-buddy-panel-empty">All quiet for now.</div>
                ) : (
                  panelEntries
                    .filter((entry) => entry.count > 0)
                    .map((entry) => (
                      <div key={entry.key} className={`ss-notify-buddy-panel-row tone-${entry.tone}`}>
                        <span className="ss-notify-buddy-panel-dot" aria-hidden="true" />
                        <span className="ss-notify-buddy-panel-label">{entry.label}</span>
                        <span className="ss-notify-buddy-panel-count">{entry.count}</span>
                      </div>
                    ))
                )}
              </div>
            ) : (
              <div className="ss-notify-buddy-panel-list is-notifications">
                {panelListItems.length === 0 ? (
                  <div className="ss-notify-buddy-panel-empty">No new notifications.</div>
                ) : (
                  panelListItems.map((entry, idx) => {
                    const kind = deriveKind(entry);
                    const labelMap = {
                      message: "Message",
                      like: "Like",
                      comment: "Comment",
                      follow: "Follow",
                      emergency: "SOS",
                      system: "Alert"
                    };
                    const label = labelMap[kind] || "Alert";
                    const rawText = String(entry?.message || entry?.title || "Notification").replace(/\\s+/g, " ").trim();
                    const text = rawText.length > 72 ? `${rawText.slice(0, 72).trim()}…` : rawText;
                    const key = String(entry?.id || entry?.followRequestId || `panel-${idx}`);
                    return (
                      <div key={key} className={`ss-notify-buddy-panel-item tone-${kind}`}>
                        <span className="ss-notify-buddy-panel-dot" aria-hidden="true" />
                        <div className="ss-notify-buddy-panel-item-main">
                          <span className="ss-notify-buddy-panel-item-text">{text}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
