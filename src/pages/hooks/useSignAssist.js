import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { getApiBaseUrl } from "../../api/baseUrl";

const SIGN_ASSIST_TOKEN = "__SS_SIGN_ASSIST__:";
export const SIGN_VOICE_GENDERS = ["female", "male"];
const SIGN_LOCAL_TF_SCRIPT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const SIGN_LOCAL_HANDPOSE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js";
const SIGN_MEDIAPIPE_WASM_BASES = [
  "/mediapipe/tasks-vision/wasm",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
];
const SIGN_MEDIAPIPE_MODEL_ASSETS = [
  "/mediapipe/models/hand_landmarker.task",
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "https://storage.googleapis.com/mediapipe-assets/hand_landmarker.task"
];
const SIGN_LIVE_MAX_BUFFER_CHARS = 320;
const SIGN_LIVE_CONTINUOUS_COOLDOWN_MS = 80;
const SIGN_LIVE_STABLE_FRAMES_REQUIRED = 1;
const SIGN_LIVE_NOISY_SIGN_EXTRA_FRAMES = 1;
const SIGN_LIVE_REPEAT_BLOCK_MS = 2200;
const SIGN_LIVE_DEDUPE_WINDOW_MS = 3200;
const SIGN_LIVE_MIN_SEND_GAP_MS = 500;
const SIGN_MANUAL_REPEAT_BLOCK_MS = 3500;
const SIGN_SEND_CACHE_TTL_MS = 10 * 60 * 1000;
const SIGN_LIVE_IDLE_RESET_MS = 700;
const SIGN_LIVE_REPEAT_APPEND_MS = 380;
const SIGN_LIVE_NO_DETECT_RESET_MS = 240;
const SIGN_LIVE_RELEASE_AFTER_NO_DETECT_MS = 220;
const SIGN_SEQUENCE_FRAME_WINDOW = 18;
const SIGN_LIVE_POLL_MS = 100;
const SIGN_LOCAL_ERROR_COOLDOWN_MS = 1200;
const SIGN_LOCAL_UNAVAILABLE_COOLDOWN_MS = 2500;
const SIGN_SCRIPT_LOAD_TIMEOUT_MS = 8000;
const SIGN_MODEL_LOAD_TIMEOUT_MS = 9000;
const SIGN_AUTO_API_INTERVAL_MS = 550;
const SIGN_AUTO_API_MAX_W = 360;
const SIGN_FALLBACK_SIGN_TEXT = "I am signing. Please watch my video.";
const SIGN_LOCAL_DETECT_MIN_INTERVAL_MS = 70;
const SIGN_MOTION_SAMPLE_W = 96;
const SIGN_MOTION_SAMPLE_H = 54;
const SIGN_MOTION_ACTIVE_THRESHOLD = 2.2;
const SIGN_MOTION_FALLBACK_STREAK_REQUIRED = 8;
const SIGN_FALLBACK_HOLD_MS = 700;
const SIGN_CAPTURE_NO_FRAME_WARMUP_MS = 1200;
const SIGN_NO_FRAME_FALLBACK_INTERVAL_MS = 2600;

const normalizeLangCode = (value) => String(value || "").trim().replace("_", "-");
const isAbsoluteHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());
const normalizeSignTextKey = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
const SIGN_LIVE_NOISY_TEXT_KEYS = new Set([
  "yes.",
  "no.",
  "good.",
  "please wait.",
  "call me.",
  "i am okay.",
  "i am signing. please watch my video."
]);
const isNoisyLiveSignText = (text) => SIGN_LIVE_NOISY_TEXT_KEYS.has(normalizeSignTextKey(text));
const SIGN_ASSIST_OFFLINE_ONLY =
  String(import.meta.env.VITE_SIGN_ASSIST_OFFLINE_ONLY || "false")
    .trim()
    .toLowerCase() === "true";
const SIGN_LOCAL_MODEL_ORDER = Array.from(new Set(
  String(import.meta.env.VITE_SIGN_LOCAL_MODEL_ORDER || "mediapipe,tfjs")
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
)).filter((item) => item === "mediapipe" || item === "tfjs");
const withTimeout = (promise, timeoutMs, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });

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

export const decodeSignAssistText = (rawText) => {
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

const signScriptLoadPromises = new Map();
const loadExternalScript = (src, id) => {
  if (typeof document === "undefined") return Promise.reject(new Error("No document"));
  const cached = signScriptLoadPromises.get(id);
  if (cached) return cached;

  const existing = document.getElementById(id);
  if (existing?.dataset?.loaded === "true") return Promise.resolve();
  const existingReadyState = String(existing?.readyState || "").toLowerCase();
  if (existing && (existingReadyState === "loaded" || existingReadyState === "complete")) {
    existing.dataset.loaded = "true";
    return Promise.resolve();
  }

  const script = existing || document.createElement("script");
  if (!existing) {
    script.src = src;
    script.id = id;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
  }

  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      script.removeEventListener("load", done);
      script.removeEventListener("error", fail);
    };
    const complete = (ok, message = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      signScriptLoadPromises.delete(id);
      if (ok) {
        script.dataset.loaded = "true";
        resolve();
        return;
      }
      if (!existing && script.parentNode && script.dataset.loaded !== "true") {
        try {
          script.parentNode.removeChild(script);
        } catch {
          // ignore remove failures
        }
      }
      reject(new Error(message || `Failed to load ${src}`));
    };
    const done = () => {
      complete(true);
    };
    const fail = () => {
      complete(false, `Failed to load ${src}`);
    };
    const timeout = setTimeout(() => {
      const readyState = String(script.readyState || "").toLowerCase();
      if (script.dataset.loaded === "true" || readyState === "loaded" || readyState === "complete") {
        complete(true);
        return;
      }
      complete(false, `Timed out loading ${src}`);
    }, SIGN_SCRIPT_LOAD_TIMEOUT_MS);

    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      document.head.appendChild(script);
      return;
    }
    setTimeout(() => {
      const readyState = String(script.readyState || "").toLowerCase();
      if (script.dataset.loaded === "true" || readyState === "loaded" || readyState === "complete") {
        complete(true);
      }
    }, 0);
  });

  signScriptLoadPromises.set(id, promise);
  return promise;
};

const SIGN_INTENT_TEXTS = {
  help: { en: "I need help.", hi: "Mujhe madad chahiye.", te: "Naaku sahayam kavali.", ta: "Enakku uthavi venum." },
  okay: { en: "I am okay.", hi: "Main theek hoon.", te: "Nenu baagunnanu.", ta: "Naan sariyaga irukken." },
  call_me: { en: "Call me.", hi: "Mujhe call karo.", te: "Nannu call cheyyandi.", ta: "Ennai call pannunga." },
  love_you: { en: "I love you.", hi: "Main aapse pyar karta hoon.", te: "Nenu ninnu premistunnanu.", ta: "Naan unnai kadhalikkiren." },
  yes: { en: "Yes.", hi: "Haan.", te: "Avunu.", ta: "Aam." },
  no: { en: "No.", hi: "Nahin.", te: "Kaadu.", ta: "Illai." },
  wait: { en: "Please wait.", hi: "Kripya intezar kijiye.", te: "Dayachesi wait cheyyandi.", ta: "Dhaya seidhu kaathirunga." },
  coming: { en: "I am coming.", hi: "Main aa raha hoon.", te: "Nenu vastunnanu.", ta: "Naan varugiren." },
  hello: { en: "Hello.", hi: "Namaste.", te: "Namaskaram.", ta: "Vanakkam." },
  thank_you: { en: "Thank you.", hi: "Dhanyavaad.", te: "Dhanyavadamulu.", ta: "Nandri." },
  sorry: { en: "Sorry.", hi: "Maaf kijiye.", te: "Kshaminchandi.", ta: "Mannikkavum." },
  stop: { en: "Stop.", hi: "Rukiye.", te: "Aapandi.", ta: "Niruthunga." },
  danger: { en: "Danger.", hi: "Khatra.", te: "Pramadam.", ta: "Aabathu." },
  emergency: { en: "Emergency.", hi: "Emergency hai.", te: "Emergency.", ta: "Emergency." },
  one: { en: "One.", hi: "Ek.", te: "Okati.", ta: "Ondru." },
  two: { en: "Two.", hi: "Do.", te: "Rendu.", ta: "Irandu." },
  three: { en: "Three.", hi: "Teen.", te: "Moodu.", ta: "Moondru." },
  four: { en: "Four.", hi: "Chaar.", te: "Nalugu.", ta: "Naangu." },
  five: { en: "Five.", hi: "Paanch.", te: "Aidu.", ta: "Aindhu." },
  good: { en: "Good.", hi: "Achha.", te: "Bagundi.", ta: "Nalla irukku." },
  bad: { en: "Not okay.", hi: "Theek nahin hai.", te: "Baagoledu.", ta: "Sari illai." }
};

const resolveSignLocale = (languageHint) => {
  const normalized = normalizeLangCode(languageHint || "en").toLowerCase();
  const base = String(normalized.split("-")[0] || "").trim();
  return base || "en";
};

const estimateHandArea = (landmarks) => {
  if (!Array.isArray(landmarks) || !landmarks.length) return 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  landmarks.forEach((pt) => {
    const x = Number(pt?.[0] || 0);
    const y = Number(pt?.[1] || 0);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  return width * height;
};

const localizeSignIntent = (intent, languageHint) => {
  const table = SIGN_INTENT_TEXTS[String(intent || "").trim()];
  if (!table) return "";
  const locale = resolveSignLocale(languageHint);
  return String(table[locale] || table.en || "").trim();
};

const inferLocalSignText = (landmarks, languageHint = "en") => {
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
  const thumbMiddlePinch = distance(thumbTip, middleTip) < handSize * 0.24;
  const thumbRingPinch = distance(thumbTip, ringTip) < handSize * 0.24;
  const thumbPinkyPinch = distance(thumbTip, pinkyTip) < handSize * 0.24;

  const isolatedIndexUp = indexUp && middleFolded && ringFolded && pinkyFolded;
  const isolatedIndexDown = indexDown && middleFolded && ringFolded && pinkyFolded && thumbDown;
  const victory = indexUp && middleUp && !ringUp && !pinkyUp;
  const openPalm = indexUp && middleUp && ringUp && pinkyUp;
  const fist = !indexUp && middleFolded && ringFolded && pinkyFolded;
  const thumbsUp = thumbRaised && !indexUp && middleFolded && ringFolded && pinkyFolded;
  const thumbsDown = thumbDown && !indexUp && middleFolded && ringFolded && pinkyFolded;
  const callMe = thumbRaised && pinkyUp && middleFolded && ringFolded && !indexUp;
  const iLoveYou = thumbRaised && indexUp && pinkyUp && middleFolded && ringFolded;
  const okSign = thumbIndexPinch && middleUp && ringUp && pinkyUp;
  const threeUp = indexUp && middleUp && ringUp && !pinkyUp && !thumbRaised;
  const comingGesture = indexUp && middleUp && ringUp && !pinkyUp && thumbRaised;
  const twoUp = indexUp && middleUp && !ringUp && !pinkyUp && !thumbRaised;
  const oneUp = indexUp && !middleUp && !ringUp && !pinkyUp && !thumbRaised;
  const fourUp = indexUp && middleUp && ringUp && pinkyUp && !thumbRaised;
  const fiveUp = indexUp && middleUp && ringUp && pinkyUp && thumbRaised;
  const stopPalm = openPalm && thumbDown;

  if (isolatedIndexUp) return localizeSignIntent("help", languageHint);
  if (isolatedIndexDown) return localizeSignIntent("okay", languageHint);
  if (callMe) return localizeSignIntent("call_me", languageHint);
  if (iLoveYou) return localizeSignIntent("love_you", languageHint);
  if (okSign) return localizeSignIntent("okay", languageHint);
  if (thumbsUp && thumbTip[1] < wrist[1] - handSize * 0.22) return localizeSignIntent("good", languageHint);
  if (thumbsDown) return localizeSignIntent("bad", languageHint);
  if (stopPalm) return localizeSignIntent("stop", languageHint);
  if (victory) return localizeSignIntent("yes", languageHint);
  if (comingGesture) return localizeSignIntent("coming", languageHint);
  if (fist) return localizeSignIntent("no", languageHint);
  if (openPalm && thumbDown) return localizeSignIntent("wait", languageHint);
  if (fiveUp) return localizeSignIntent("hello", languageHint);
  if (fourUp) return localizeSignIntent("four", languageHint);
  if (threeUp) return localizeSignIntent("three", languageHint);
  if (twoUp) return localizeSignIntent("two", languageHint);
  if (oneUp) return localizeSignIntent("one", languageHint);
  if (thumbMiddlePinch && thumbRingPinch && thumbPinkyPinch && !indexUp) return localizeSignIntent("thank_you", languageHint);

  // Relaxed fallback matching so low-light or blurred frames still map to a usable phrase.
  const relaxedIsUp = (tip, pip) => tip[1] < pip[1];
  const relaxedIndexUp = relaxedIsUp(indexTip, indexPip);
  const relaxedMiddleUp = relaxedIsUp(middleTip, middlePip);
  const relaxedRingUp = relaxedIsUp(ringTip, ringPip);
  const relaxedPinkyUp = relaxedIsUp(pinkyTip, pinkyPip);
  const relaxedThumbUp = thumbTip[1] < wrist[1] - handSize * 0.02;
  const relaxedUpCount = [relaxedIndexUp, relaxedMiddleUp, relaxedRingUp, relaxedPinkyUp].filter(Boolean).length + (relaxedThumbUp ? 1 : 0);

  if (relaxedUpCount >= 4) return localizeSignIntent("wait", languageHint);
  if (!relaxedIndexUp && !relaxedMiddleUp && !relaxedRingUp && !relaxedPinkyUp && !relaxedThumbUp) return localizeSignIntent("no", languageHint);
  if (relaxedIndexUp && relaxedMiddleUp && !relaxedRingUp && !relaxedPinkyUp) return localizeSignIntent("yes", languageHint);
  if (relaxedThumbUp && relaxedUpCount <= 2) return localizeSignIntent("good", languageHint);
  if (relaxedIndexUp && relaxedUpCount <= 2) return localizeSignIntent("help", languageHint);
  return "";
};

const readAutoSpeakPrefsFromStorage = (storageKey) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const enabledRaw = parsed?.enabled;
    const enabled =
      enabledRaw === true ||
      enabledRaw === 1 ||
      String(enabledRaw || "").trim().toLowerCase() === "true";
    const enabledAtRaw = Number(parsed?.enabledAt || 0);
    const enabledAt = Number.isFinite(enabledAtRaw) && enabledAtRaw > 0
      ? enabledAtRaw
      : (enabled ? Date.now() : 0);
    return {
      enabled,
      enabledAt
    };
  } catch {
    return { enabled: false, enabledAt: 0 };
  }
};

export const useSignAssist = ({
  chatAutoSpeakKey,
  callState,
  localStreamRef,
  setIsCameraOff,
  localVideoRef,
  sendTextPayload,
  speechLang,
  activeContactId,
  activeMessages,
  getVisibleThreadMessageIds,
  getSpeakableIncomingPayload,
  toEpochMs,
  translatorEnabled,
  translatedIncomingById,
  speechVoiceGender
}) => {
  const [signAssistEnabled, setSignAssistEnabledRaw] = useState(false);
  const [signAssistText, setSignAssistText] = useState("");
  const [signAssistVoiceGender, setSignAssistVoiceGender] = useState("female");
  const readAutoSpeakPrefs = useCallback(
    () => readAutoSpeakPrefsFromStorage(chatAutoSpeakKey),
    [chatAutoSpeakKey]
  );
  const autoSpeakPrefsRef = useRef(readAutoSpeakPrefs());
  const autoSpeakEnabledAtRef = useRef(autoSpeakPrefsRef.current.enabledAt || 0);
  const [signAssistAutoSpeak, setSignAssistAutoSpeak] = useState(() => autoSpeakPrefsRef.current.enabled);
  const autoSpeakSessionEnabledAtRef = useRef(autoSpeakPrefsRef.current.enabled ? Date.now() : 0);
  const [signAssistContinuousMode, setSignAssistContinuousMode] = useState(false);
  const [signAssistBusy, setSignAssistBusy] = useState(false);
  const [signAssistStatus, setSignAssistStatus] = useState("");
  const [signAssistDebugOpen, setSignAssistDebugOpen] = useState(false);
  const [signAssistDebug, setSignAssistDebug] = useState({
    localModelStatus: "idle",
    sequenceModelStatus: "idle",
    apiStatus: "idle",
    lastDetection: "",
    lastDetectionSource: "",
    lastDetectionAt: 0,
    lastError: "",
    lastUpdateAt: 0
  });
  const spokenSignMessageIdsRef = useRef(new Set());
  const autoSpeakBootstrappedByContactRef = useRef({});
  const signApiUnavailableRef = useRef(false);
  const signLocalModelRef = useRef(null);
  const signLocalModelLoadingRef = useRef(null);
  const signFallbackCaptureVideoRef = useRef(null);
  const signLivePollTimerRef = useRef(null);
  const signLiveDetectInFlightRef = useRef(false);
  const signNoFrameSinceRef = useRef(0);
  const signNoFrameLastFallbackAtRef = useRef(0);
  const signLocalDetectCooldownUntilRef = useRef(0);
  const signAutoApiLastAtRef = useRef(0);
  const signLastLocalDetectAtRef = useRef(0);
  const signLastDetectedTextRef = useRef("");
  const signLastDetectedAtRef = useRef(0);
  const signLastFallbackAtRef = useRef(0);
  const signHandVisibleRef = useRef(false);
  const signHandHiddenSinceRef = useRef(0);
  const signHandHiddenTicksRef = useRef(0);
  const signHandNoTextStreakRef = useRef(0);
  const signMotionNoTextStreakRef = useRef(0);
  const signMotionFrameRef = useRef({
    canvas: null,
    ctx: null,
    prevLuma: null
  });
  const signLiveBufferRef = useRef({
    parts: [],
    lastDetected: "",
    firstAt: 0,
    lastAppendAt: 0,
    lastAt: 0,
    lastSent: "",
    lastContinuousText: "",
    lastContinuousAt: 0
  });
  const signAssistSendingRef = useRef(false);
  const signRecentSendMapRef = useRef(new Map());
  const signLastSendAtRef = useRef(0);
  const signContinuousCandidateRef = useRef({ text: "", count: 0, at: 0 });
  const signLiveStartedAtRef = useRef(0);
  const signLiveResendGateRef = useRef({
    lastSentText: "",
    released: true,
    noDetectSince: 0
  });
  const signSequenceFramesRef = useRef([]);
  const signSequenceModelRef = useRef(null);
  const signSequenceModelLoadingRef = useRef(null);
  const getVisibleThreadMessageIdsRef = useRef(getVisibleThreadMessageIds);
  const getSpeakableIncomingPayloadRef = useRef(getSpeakableIncomingPayload);

  useEffect(() => {
    getVisibleThreadMessageIdsRef.current = getVisibleThreadMessageIds;
  }, [getVisibleThreadMessageIds]);

  useEffect(() => {
    getSpeakableIncomingPayloadRef.current = getSpeakableIncomingPayload;
  }, [getSpeakableIncomingPayload]);

  const updateSignAssistDebug = useCallback((patch = {}) => {
    setSignAssistDebug((prev) => ({
      ...prev,
      ...patch,
      lastUpdateAt: Date.now()
    }));
  }, []);

  useEffect(() => {
    if (!signAssistEnabled) return;
    if (callState.mode !== "video" || callState.phase === "idle") return;
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0];
    if (videoTrack && !videoTrack.enabled) {
      videoTrack.enabled = true;
      setIsCameraOff(false);
    }
  }, [callState.mode, callState.phase, localStreamRef, setIsCameraOff, signAssistEnabled]);

  useEffect(() => {
    if (!signAssistAutoSpeak) return;
    if (!autoSpeakEnabledAtRef.current) {
      autoSpeakEnabledAtRef.current = Date.now();
      try {
        localStorage.setItem(chatAutoSpeakKey, JSON.stringify({
          enabled: true,
          enabledAt: autoSpeakEnabledAtRef.current
        }));
      } catch {
        // ignore storage failures
      }
    }
  }, [chatAutoSpeakKey, signAssistAutoSpeak]);

  const resolveSignAssistTargetId = useCallback(() => {
    const activeTargetId = String(activeContactId || "").trim();
    if (activeTargetId) return activeTargetId;
    const callPeerId = String(callState?.peerId || "").trim();
    if (!callPeerId || callPeerId.toLowerCase() === "group") return "";
    return callPeerId;
  }, [activeContactId, callState?.peerId]);

  const ensureFallbackCaptureVideo = useCallback(() => {
    if (typeof document === "undefined") return null;
    let videoEl = signFallbackCaptureVideoRef.current;
    if (!videoEl) {
      videoEl = document.createElement("video");
      videoEl.muted = true;
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.setAttribute("aria-hidden", "true");
      videoEl.style.position = "fixed";
      videoEl.style.left = "-9999px";
      videoEl.style.top = "-9999px";
      videoEl.style.width = "1px";
      videoEl.style.height = "1px";
      videoEl.style.opacity = "0";
      videoEl.style.pointerEvents = "none";
      try {
        document.body.appendChild(videoEl);
      } catch {
        // ignore append failures
      }
      signFallbackCaptureVideoRef.current = videoEl;
    }

    const localStream = localStreamRef.current;
    const directStream = localVideoRef.current?.srcObject;
    const streamCandidate = localStream instanceof MediaStream
      ? localStream
      : (directStream instanceof MediaStream ? directStream : null);
    if (streamCandidate && videoEl.srcObject !== streamCandidate) {
      try {
        videoEl.srcObject = streamCandidate;
        videoEl.play?.().catch(() => {});
      } catch {
        // ignore fallback video attach failures
      }
    }
    return videoEl;
  }, [localStreamRef, localVideoRef]);

  const getLiveVideoTrack = useCallback((videoEl) => {
    const stream = videoEl?.srcObject;
    if (!(stream instanceof MediaStream)) return null;
    const track = stream.getVideoTracks?.()[0] || null;
    if (!track) return null;
    if (track.readyState === "ended") return null;
    return track;
  }, []);

  const getCaptureFrameSize = useCallback((videoEl) => {
    const width = Number(videoEl?.videoWidth || 0);
    const height = Number(videoEl?.videoHeight || 0);
    if (width > 0 && height > 0) return { width, height };
    const track = getLiveVideoTrack(videoEl);
    if (!track) return { width: 0, height: 0 };
    const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
    const trackWidth = Number(settings?.width || 0);
    const trackHeight = Number(settings?.height || 0);
    if (trackWidth > 0 && trackHeight > 0) return { width: trackWidth, height: trackHeight };
    return { width: 0, height: 0 };
  }, [getLiveVideoTrack]);

  const getCaptureVideoElement = useCallback(() => {
    const direct = localVideoRef.current;
    if (direct && direct.videoWidth && direct.videoHeight) return direct;
    const fallback = ensureFallbackCaptureVideo();
    if (fallback && fallback.videoWidth && fallback.videoHeight) return fallback;
    if (direct && getLiveVideoTrack(direct)) return direct;
    if (fallback && getLiveVideoTrack(fallback)) return fallback;
    return direct || fallback || null;
  }, [ensureFallbackCaptureVideo, getLiveVideoTrack, localVideoRef]);

  const sendSignAssistMessage = useCallback(async ({ text = null, source = "video-call", clearAfter = true, silent = false } = {}) => {
    const plainText = String(text ?? signAssistText ?? "").trim();
    const sourceKey = String(source || "video-call").trim().toLowerCase();
    const isLiveSource = sourceKey.startsWith("live");
    if (!plainText) {
      if (!silent) setSignAssistStatus("Type translated sign text first.");
      return false;
    }
    if (signAssistSendingRef.current) return false;

    const targetContactId = resolveSignAssistTargetId();
    if (!targetContactId) {
      setSignAssistStatus("No chat recipient found. Open this caller chat and try again.");
      return false;
    }

    const now = Date.now();
    const normalizedTextKey = normalizeSignTextKey(plainText);
    const dedupeKey = `${targetContactId}|${normalizedTextKey}`;
    const dedupeWindowMs = isLiveSource ? SIGN_LIVE_DEDUPE_WINDOW_MS : SIGN_MANUAL_REPEAT_BLOCK_MS;
    for (const [key, at] of signRecentSendMapRef.current.entries()) {
      if (!Number.isFinite(at) || now - at > SIGN_SEND_CACHE_TTL_MS) {
        signRecentSendMapRef.current.delete(key);
      }
    }
    if (dedupeWindowMs > 0) {
      const lastSameSentAt = Number(signRecentSendMapRef.current.get(dedupeKey) || 0);
      if (lastSameSentAt && now - lastSameSentAt < dedupeWindowMs) {
        if (!silent) setSignAssistStatus("Same sign already sent. Show a new sign.");
        return false;
      }
    }
    if (isLiveSource && signLastSendAtRef.current && now - signLastSendAtRef.current < SIGN_LIVE_MIN_SEND_GAP_MS) {
      return false;
    }

    signAssistSendingRef.current = true;
    const payloadText = encodeSignAssistText(plainText, signAssistVoiceGender, sourceKey);
    if (!payloadText) {
      if (!silent) setSignAssistStatus("Unable to prepare sign message.");
      signAssistSendingRef.current = false;
      return false;
    }

    try {
      const ok = await sendTextPayload(payloadText, {
        targetContactId,
        previewText: `Sign: ${plainText}`,
        onSent: () => {
          if (!silent) setSignAssistStatus("Sign message sent.");
          if (clearAfter) setSignAssistText("");
        }
      });

      if (!ok && !silent) {
        setSignAssistStatus("Failed to send sign message.");
      }
      if (ok && dedupeWindowMs > 0) {
        signRecentSendMapRef.current.set(dedupeKey, Date.now());
      }
      if (ok) signLastSendAtRef.current = Date.now();
      return ok;
    } catch {
      if (!silent) {
        setSignAssistStatus("Failed to send sign message.");
      }
      return false;
    } finally {
      signAssistSendingRef.current = false;
    }
  }, [resolveSignAssistTargetId, sendTextPayload, signAssistText, signAssistVoiceGender]);

  const ensureSequenceModel = useCallback(async () => {
    const modelUrl = String(import.meta.env.VITE_SIGN_SEQUENCE_MODEL_URL || "").trim();
    if (!modelUrl) {
      updateSignAssistDebug({ sequenceModelStatus: "not-configured" });
      return null;
    }
    if (signSequenceModelRef.current) {
      updateSignAssistDebug({ sequenceModelStatus: "loaded" });
      return signSequenceModelRef.current;
    }
    if (!signSequenceModelLoadingRef.current) {
      updateSignAssistDebug({ sequenceModelStatus: "loading" });
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
    try {
      signSequenceModelRef.current = await signSequenceModelLoadingRef.current;
      updateSignAssistDebug({
        sequenceModelStatus: signSequenceModelRef.current ? "loaded" : "unavailable"
      });
      return signSequenceModelRef.current;
    } catch (err) {
      signSequenceModelLoadingRef.current = null;
      updateSignAssistDebug({
        sequenceModelStatus: "failed",
        lastError: String(err?.message || "Failed to load sequence model")
      });
      return null;
    }
  }, [updateSignAssistDebug]);

  const pushSequenceFrame = useCallback((landmarks) => {
    if (!Array.isArray(landmarks) || !landmarks.length) return;
    const frames = signSequenceFramesRef.current;
    frames.push({ landmarks, at: Date.now() });
    if (frames.length > SIGN_SEQUENCE_FRAME_WINDOW) {
      frames.splice(0, frames.length - SIGN_SEQUENCE_FRAME_WINDOW);
    }
  }, []);

  const detectSequenceSignText = useCallback(async () => {
    try {
      const model = await ensureSequenceModel();
      if (!model) return "";
      const frames = signSequenceFramesRef.current;
      if (frames.length < Math.min(8, SIGN_SEQUENCE_FRAME_WINDOW)) return "";
      const payload = frames.map((f) => f.landmarks);
      if (typeof model.predict === "function") {
        const result = await model.predict(payload);
        const text = String(result?.text || result || "").trim();
        if (text) {
          updateSignAssistDebug({
            lastDetection: text,
            lastDetectionSource: "sequence",
            lastDetectionAt: Date.now()
          });
        }
        return text;
      }
      if (typeof model.infer === "function") {
        const result = await model.infer(payload);
        const text = String(result?.text || result || "").trim();
        if (text) {
          updateSignAssistDebug({
            lastDetection: text,
            lastDetectionSource: "sequence",
            lastDetectionAt: Date.now()
          });
        }
        return text;
      }
      return "";
    } catch (err) {
      updateSignAssistDebug({
        sequenceModelStatus: "error",
        lastError: String(err?.message || "Sequence detection failed")
      });
      return "";
    }
  }, [ensureSequenceModel, updateSignAssistDebug]);

  const loadMediaPipeSignModel = useCallback(async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const { FilesetResolver, HandLandmarker } = vision || {};
    if (!FilesetResolver?.forVisionTasks || !HandLandmarker?.createFromOptions) {
      throw new Error("MediaPipe hand landmarker runtime missing");
    }
    const delegates = SIGN_ASSIST_OFFLINE_ONLY ? ["CPU"] : ["CPU", "GPU"];
    const wasmBases = SIGN_ASSIST_OFFLINE_ONLY
      ? [SIGN_MEDIAPIPE_WASM_BASES[0]]
      : SIGN_MEDIAPIPE_WASM_BASES;
    const modelAssets = SIGN_ASSIST_OFFLINE_ONLY
      ? [SIGN_MEDIAPIPE_MODEL_ASSETS[0]]
      : SIGN_MEDIAPIPE_MODEL_ASSETS;
    const failures = [];

    for (const wasmBase of wasmBases) {
      let fileset = null;
      try {
        fileset = await FilesetResolver.forVisionTasks(wasmBase);
      } catch (error) {
        failures.push(`wasm(${wasmBase}): ${error?.message || error}`);
        continue;
      }
      for (const modelAssetPath of modelAssets) {
        for (const delegate of delegates) {
          try {
            const estimator = await withTimeout(
              HandLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath, delegate },
                runningMode: "VIDEO",
                numHands: 2,
                minHandDetectionConfidence: 0.12,
                minHandPresenceConfidence: 0.1,
                minTrackingConfidence: 0.1
              }),
              SIGN_MODEL_LOAD_TIMEOUT_MS,
              "MediaPipe sign model load"
            );
            if (estimator) {
              return { provider: "mediapipe", model: estimator };
            }
          } catch (error) {
            failures.push(`${delegate}(${wasmBase}, ${modelAssetPath}): ${error?.message || error}`);
          }
        }
      }
    }
    const summary = failures.slice(0, 4).join(" | ");
    throw new Error(`MediaPipe hand model unavailable${summary ? `: ${summary}` : ""}`);
  }, []);

  const loadTfjsSignModel = useCallback(async () => {
    if (!window?.tf) {
      await loadExternalScript(SIGN_LOCAL_TF_SCRIPT, "tfjs-chat-sign");
    }
    if (!window?.handpose) {
      await loadExternalScript(SIGN_LOCAL_HANDPOSE_SCRIPT, "handpose-chat-sign");
    }
    if (!window?.handpose) throw new Error("handpose library missing");
    const estimator = await withTimeout(
      window.handpose.load(),
      SIGN_MODEL_LOAD_TIMEOUT_MS,
      "TFJS sign model load"
    );
    if (!estimator) throw new Error("handpose model unavailable");
    return { provider: "tfjs", model: estimator };
  }, []);

  const preloadLocalSignModel = useCallback(async () => {
    if (signLocalModelRef.current) {
      return signLocalModelRef.current;
    }
    if (Date.now() < signLocalDetectCooldownUntilRef.current) return null;
    try {
      if (!signLocalModelLoadingRef.current) {
        updateSignAssistDebug({ localModelStatus: "loading" });
        signLocalModelLoadingRef.current = (async () => {
          const ordered = SIGN_LOCAL_MODEL_ORDER.length
            ? SIGN_LOCAL_MODEL_ORDER
            : ["mediapipe", "tfjs"];
          const failures = [];
          for (const provider of ordered) {
            try {
              if (provider === "mediapipe") return await loadMediaPipeSignModel();
              if (provider === "tfjs") return await loadTfjsSignModel();
            } catch (error) {
              failures.push(`${provider}: ${error?.message || error}`);
            }
          }
          throw new Error(failures.join(" | ") || "No local sign model providers available");
        })();
      }
      signLocalModelRef.current = await signLocalModelLoadingRef.current;
      const provider = String(signLocalModelRef.current?.provider || "local");
      updateSignAssistDebug({ localModelStatus: `loaded-${provider}`, lastError: "" });
      return signLocalModelRef.current;
    } catch (err) {
      signLocalModelLoadingRef.current = null;
      signLocalDetectCooldownUntilRef.current = Date.now() + SIGN_LOCAL_UNAVAILABLE_COOLDOWN_MS;
      updateSignAssistDebug({
        localModelStatus: "unavailable",
        lastError: String(err?.message || "Local sign model unavailable")
      });
      return null;
    }
  }, [loadMediaPipeSignModel, loadTfjsSignModel, updateSignAssistDebug]);

  const detectLocalSignText = useCallback(async (videoEl, options = {}) => {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return "";
    const waitForModel = options?.waitForModel !== false;
    let localModel = signLocalModelRef.current;
    if (!localModel) {
      if (!waitForModel) {
        if (
          Date.now() >= signLocalDetectCooldownUntilRef.current &&
          !signLocalModelLoadingRef.current
        ) {
          void preloadLocalSignModel();
        }
        return "";
      }
      localModel = await preloadLocalSignModel();
    }
    if (!localModel) return "";
    try {
      let landmarks = [];
      let handLandmarkSets = [];
      const provider = String(localModel?.provider || "").toLowerCase();

      if (provider === "mediapipe" && typeof localModel?.model?.detectForVideo === "function") {
        const nowPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
        const result = localModel.model.detectForVideo(videoEl, nowPerf);
        const normalizedSets = Array.isArray(result?.landmarks)
          ? result.landmarks.filter((set) => Array.isArray(set) && set.length)
          : [];
        if (!normalizedSets.length) {
          signHandVisibleRef.current = false;
          if (!signHandHiddenSinceRef.current) signHandHiddenSinceRef.current = Date.now();
          return "";
        }
        signHandVisibleRef.current = true;
        signHandHiddenSinceRef.current = 0;
        const width = Number(videoEl.videoWidth || videoEl.width || 1);
        const height = Number(videoEl.videoHeight || videoEl.height || 1);
        handLandmarkSets = normalizedSets.map((set) =>
          set.map((pt) => [
            Number(pt?.x || 0) * width,
            Number(pt?.y || 0) * height,
            Number(pt?.z || 0) * width
          ])
        );
      } else {
        const handposeModel = localModel?.model || localModel;
        const predictions = await handposeModel.estimateHands(videoEl, true);
        if (!Array.isArray(predictions) || predictions.length === 0) {
          signHandVisibleRef.current = false;
          if (!signHandHiddenSinceRef.current) signHandHiddenSinceRef.current = Date.now();
          return "";
        }
        signHandVisibleRef.current = true;
        signHandHiddenSinceRef.current = 0;
        handLandmarkSets = predictions
          .map((pred) => pred?.landmarks || [])
          .filter((set) => Array.isArray(set) && set.length);
      }

      if (!handLandmarkSets.length) {
        signHandVisibleRef.current = false;
        if (!signHandHiddenSinceRef.current) signHandHiddenSinceRef.current = Date.now();
        return "";
      }

      const sortedByArea = [...handLandmarkSets].sort((a, b) => estimateHandArea(b) - estimateHandArea(a));
      landmarks = sortedByArea[0] || handLandmarkSets[0] || [];
      if (!landmarks.length) return "";

      pushSequenceFrame(landmarks);
      const sequenceText = await detectSequenceSignText();
      if (sequenceText) {
        updateSignAssistDebug({
          lastDetection: sequenceText,
          lastDetectionSource: "sequence",
          lastDetectionAt: Date.now()
        });
        return sequenceText;
      }
      const localCandidates = sortedByArea
        .map((set) => inferLocalSignText(set, speechLang || "en-IN"))
        .filter(Boolean);
      const localText = localCandidates[0] || inferLocalSignText(landmarks, speechLang || "en-IN");
      if (localText) {
        updateSignAssistDebug({
          lastDetection: localText,
          lastDetectionSource: "local",
          lastDetectionAt: Date.now()
        });
      }
      return localText;
    } catch (err) {
      signHandVisibleRef.current = false;
      if (!signHandHiddenSinceRef.current) signHandHiddenSinceRef.current = Date.now();
      signLocalDetectCooldownUntilRef.current = Date.now() + SIGN_LOCAL_ERROR_COOLDOWN_MS;
      updateSignAssistDebug({
        localModelStatus: "error",
        lastError: String(err?.message || "Local detection failed")
      });
      return "";
    }
  }, [detectSequenceSignText, preloadLocalSignModel, pushSequenceFrame, speechLang, updateSignAssistDebug]);

  useEffect(() => {
    if (!signAssistEnabled) return;
    if (callState.mode !== "video" || callState.phase === "idle") return;
    ensureFallbackCaptureVideo();
    let cancelled = false;
    const startFast = () => {
      setSignAssistStatus("Sign Assist ready. Warming up offline AI...");
      void preloadLocalSignModel().then((model) => {
        if (cancelled) return;
        if (model) {
          signLocalDetectCooldownUntilRef.current = 0;
          setSignAssistStatus("Sign Assist ready. Show your hand to capture.");
          return;
        }
        if (SIGN_ASSIST_OFFLINE_ONLY) {
          setSignAssistStatus("Offline AI is warming. Show your hand and keep camera stable.");
          return;
        }
        setSignAssistStatus("Sign Assist ready. Using server capture.");
      }).catch(() => {
        if (cancelled) return;
        if (SIGN_ASSIST_OFFLINE_ONLY) {
          setSignAssistStatus("Offline AI warm-up failed. Refresh and try again.");
        } else {
          setSignAssistStatus("Sign Assist ready. Using server capture.");
        }
      });
    };
    void startFast();
    return () => {
      cancelled = true;
    };
  }, [callState.mode, callState.phase, ensureFallbackCaptureVideo, preloadLocalSignModel, signAssistEnabled]);

  useEffect(() => {
    if (callState.mode !== "video" || callState.phase === "idle") return;
    if (signLocalModelRef.current || signLocalModelLoadingRef.current) return;
    if (Date.now() < signLocalDetectCooldownUntilRef.current) return;
    ensureFallbackCaptureVideo();
    const warmTimer = setTimeout(() => {
      void preloadLocalSignModel();
    }, 120);
    return () => clearTimeout(warmTimer);
  }, [callState.mode, callState.phase, ensureFallbackCaptureVideo, preloadLocalSignModel]);

  const captureLocalSignBurst = useCallback(async (videoEl, attempts = 4, delayMs = 70) => {
    if (!videoEl) return "";
    const total = Math.max(1, Math.floor(Number(attempts) || 1));
    for (let i = 0; i < total; i += 1) {
      const detected = String(await detectLocalSignText(videoEl)).trim();
      if (detected) return detected;
      if (i < total - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return "";
  }, [detectLocalSignText]);

  const resetSignLiveBuffer = useCallback(() => {
    const buffer = signLiveBufferRef.current;
    buffer.parts = [];
    buffer.lastDetected = "";
    buffer.firstAt = 0;
    buffer.lastAppendAt = 0;
    buffer.lastAt = 0;
    buffer.lastSent = "";
    buffer.lastContinuousAt = 0;
    buffer.lastContinuousText = "";
    signContinuousCandidateRef.current = { text: "", count: 0, at: 0 };
    signAutoApiLastAtRef.current = 0;
    signLastLocalDetectAtRef.current = 0;
    signLastDetectedAtRef.current = 0;
    signLastDetectedTextRef.current = "";
    signLastFallbackAtRef.current = 0;
    signNoFrameSinceRef.current = 0;
    signNoFrameLastFallbackAtRef.current = 0;
    signLiveStartedAtRef.current = 0;
    signHandVisibleRef.current = false;
    signHandHiddenSinceRef.current = 0;
    signHandHiddenTicksRef.current = 0;
    signHandNoTextStreakRef.current = 0;
    signMotionNoTextStreakRef.current = 0;
    signMotionFrameRef.current = {
      canvas: null,
      ctx: null,
      prevLuma: null
    };
    signLiveResendGateRef.current = {
      lastSentText: "",
      released: true,
      noDetectSince: 0
    };
    signSequenceFramesRef.current = [];
  }, []);

  const flushSignLiveBuffer = useCallback(() => {
    const buffer = signLiveBufferRef.current;
    if (!buffer.parts.length) return;
    const message = buffer.parts.join(" ").replace(/\s+/g, " ").trim();
    if (!message) return;
    if (buffer.lastSent && buffer.lastSent === message) return;
    buffer.lastSent = message;
    buffer.parts = [];
    buffer.firstAt = 0;
    buffer.lastAppendAt = 0;
    setSignAssistText("");
    setSignAssistStatus("Sending sign message...");
    void sendSignAssistMessage({ text: message, source: "live", clearAfter: true, silent: true });
  }, [sendSignAssistMessage]);

  const pushSignLiveBuffer = useCallback((detected) => {
    const clean = String(detected || "").trim();
    if (!clean) return;
    const buffer = signLiveBufferRef.current;
    const now = Date.now();

    const sameAsLastPart = buffer.parts.length > 0 && buffer.parts[buffer.parts.length - 1] === clean;
    const canAppendRepeat =
      sameAsLastPart &&
      buffer.lastAppendAt > 0 &&
      now - buffer.lastAppendAt >= SIGN_LIVE_REPEAT_APPEND_MS;

    if (!sameAsLastPart || canAppendRepeat) {
      buffer.parts.push(clean);
      if (!buffer.firstAt) buffer.firstAt = now;
      buffer.lastAppendAt = now;
      buffer.lastAt = now;
    }
    buffer.lastDetected = clean;

    let text = buffer.parts.join(" ").replace(/\s+/g, " ").trim();
    while (text.length > SIGN_LIVE_MAX_BUFFER_CHARS && buffer.parts.length > 1) {
      buffer.parts.shift();
      text = buffer.parts.join(" ").replace(/\s+/g, " ").trim();
    }
    setSignAssistText(text);
    setSignAssistStatus("Sign captured.");
  }, []);

  const handleContinuousSign = useCallback((detected) => {
    const clean = String(detected || "").trim();
    if (!clean) return;
    const buffer = signLiveBufferRef.current;
    const gate = signLiveResendGateRef.current;
    const now = Date.now();
    if (clean !== gate.lastSentText) {
      gate.released = true;
    }
    gate.noDetectSince = 0;
    const candidate = signContinuousCandidateRef.current;
    const isFallbackText = normalizeSignTextKey(clean) === normalizeSignTextKey(SIGN_FALLBACK_SIGN_TEXT);
    const requiredFrames = isFallbackText
      ? 1
      : (SIGN_LIVE_STABLE_FRAMES_REQUIRED + (isNoisyLiveSignText(clean) ? SIGN_LIVE_NOISY_SIGN_EXTRA_FRAMES : 0));
    if (candidate.text !== clean) {
      candidate.text = clean;
      candidate.count = 1;
      candidate.at = now;
      if (requiredFrames > 1) return;
    } else {
      candidate.count += 1;
      candidate.at = now;
    }
    if (candidate.count < requiredFrames) return;
    candidate.count = 0;
    if (clean === gate.lastSentText && !gate.released) {
      return;
    }
    if (buffer.lastContinuousText === clean && now - buffer.lastContinuousAt < SIGN_LIVE_REPEAT_BLOCK_MS) {
      return;
    }
    setSignAssistText(clean);
    setSignAssistStatus("Sign captured. Sending now...");
    void sendSignAssistMessage({ text: clean, source: "live-continuous", clearAfter: true, silent: true })
      .then((sent) => {
        if (!sent) return;
        buffer.lastContinuousText = clean;
        buffer.lastContinuousAt = Date.now();
        gate.lastSentText = clean;
        gate.released = false;
        gate.noDetectSince = 0;
      })
      .catch(() => {});
  }, [sendSignAssistMessage]);

  const sampleVideoMotion = useCallback((videoEl) => {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return 0;
    try {
      const motionState = signMotionFrameRef.current;
      if (!motionState.canvas) {
        const canvas = document.createElement("canvas");
        canvas.width = SIGN_MOTION_SAMPLE_W;
        canvas.height = SIGN_MOTION_SAMPLE_H;
        motionState.canvas = canvas;
        motionState.ctx = canvas.getContext("2d", { willReadFrequently: true });
      }
      const canvas = motionState.canvas;
      const ctx = motionState.ctx;
      if (!canvas || !ctx) return 0;

      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const luma = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0, j = 0; i < pixels.length; i += 4, j += 1) {
        // Weighted luminance approximation with green bias for stability.
        luma[j] = ((pixels[i] * 3) + (pixels[i + 1] * 4) + pixels[i + 2]) >> 3;
      }

      const prev = motionState.prevLuma;
      motionState.prevLuma = luma;
      if (!prev || prev.length !== luma.length) return 0;

      let totalDiff = 0;
      for (let i = 0; i < luma.length; i += 2) {
        totalDiff += Math.abs(luma[i] - prev[i]);
      }
      const samples = Math.max(1, Math.floor(luma.length / 2));
      return totalDiff / samples;
    } catch {
      return 0;
    }
  }, []);

  const tryAutoApiDetect = useCallback(async (videoEl) => {
    if (SIGN_ASSIST_OFFLINE_ONLY) return "";
    const now = Date.now();
    if (now - signAutoApiLastAtRef.current < SIGN_AUTO_API_INTERVAL_MS) return "";
    signAutoApiLastAtRef.current = now;
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return "";

    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, SIGN_AUTO_API_MAX_W / videoEl.videoWidth);
      canvas.width = Math.max(160, Math.floor(videoEl.videoWidth * scale));
      canvas.height = Math.max(120, Math.floor(videoEl.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("Frame capture failed"));
        }, "image/jpeg", 0.78);
      });

      const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
      const envBase = String(getApiBaseUrl() || "").replace(/\/+$/, "");
      const baseCandidates = [
        defaultBase,
        envBase,
        "http://localhost:8080",
        "http://127.0.0.1:8080"
      ].filter((v, i, arr) => v && arr.indexOf(v) === i);

      const endpoint = "/api/accessibility/sign-to-text";
      const guidanceNotes = new Set([
        "captured",
        "low_light",
        "low_contrast",
        "invalid_image",
        "io_error",
        "not_configured",
        "translate_error"
      ]);

      let onlyMissingRoutes = true;
      let authRejected = false;
      let lastRequestError = "";

      for (const base of baseCandidates) {
        const form = new FormData();
        form.append("frame", blob, "sign-frame-auto.jpg");
        form.append("lang", speechLang || "en-IN");
        form.append("contactId", String(activeContactId || ""));
        try {
          const res = await api.post(endpoint, form, {
            baseURL: base,
            suppressAuthRedirect: true,
            allowCrossOriginAuth: isAbsoluteHttpUrl(base),
            bypassEndpointGuard: true
          });
          const translatedNote = String(res?.data?.note || "").trim().toLowerCase();
          const translated = String(res?.data?.text || res?.data?.translation || "").trim();
          const looksLikeGuidance =
            guidanceNotes.has(translatedNote) ||
            /^sign captured\b/i.test(translated) ||
            /^please (turn on|increase) (more )?light/i.test(translated) ||
            /^move hand closer\b/i.test(translated);
          updateSignAssistDebug({ apiStatus: "online", lastError: "" });
          signApiUnavailableRef.current = false;
          if (translated && !looksLikeGuidance) {
            return translated;
          }
          return "";
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          if (!(status === 404 || status === 405 || status === 0)) {
            onlyMissingRoutes = false;
          }
          if (status === 401 || status === 403) authRejected = true;
          if (!lastRequestError) {
            lastRequestError = status > 0
              ? `Sign API failed with ${status}`
              : String(err?.message || "Sign API request failed");
          }
        }
      }

      if (authRejected) {
        updateSignAssistDebug({
          apiStatus: "unauthorized",
          lastError: lastRequestError || "Sign API authorization failed"
        });
      } else if (onlyMissingRoutes) {
        signApiUnavailableRef.current = true;
        updateSignAssistDebug({ apiStatus: "missing-route" });
      } else {
        updateSignAssistDebug({
          apiStatus: "error",
          lastError: lastRequestError || "Sign API request failed"
        });
      }
      return "";
    } catch (err) {
      updateSignAssistDebug({
        apiStatus: "error",
        lastError: String(err?.message || "Auto sign detect failed")
      });
      return "";
    }
  }, [activeContactId, speechLang, updateSignAssistDebug]);

  useEffect(() => {
    if (!signAssistEnabled || callState.mode !== "video" || callState.phase === "idle") {
      if (signLivePollTimerRef.current) {
        clearInterval(signLivePollTimerRef.current);
        signLivePollTimerRef.current = null;
      }
      signLiveDetectInFlightRef.current = false;
      resetSignLiveBuffer();
      return;
    }

    signLastDetectedTextRef.current = "";
    signLastDetectedAtRef.current = 0;
    signHandHiddenTicksRef.current = 0;
    signLiveStartedAtRef.current = Date.now();
    setSignAssistStatus((prev) => {
      const current = String(prev || "").trim();
      if (!current || /^starting sign assist\b/i.test(current)) {
        return "Sign Assist is live. Auto-capture sends each sign immediately.";
      }
      return current;
    });

    const tick = async () => {
      if (signAssistBusy || signLiveDetectInFlightRef.current) return;
      const video = getCaptureVideoElement();
      if (!video) return;
      const frameSize = getCaptureFrameSize(video);
      const hasFrame = frameSize.width > 0 && frameSize.height > 0;
      if (!hasFrame) {
        try {
          video.play?.().catch(() => {});
        } catch {
          // ignore playback warmup failures
        }
        const now = Date.now();
        const liveTrack = getLiveVideoTrack(video);
        if (!liveTrack) {
          signNoFrameSinceRef.current = 0;
          updateSignAssistDebug({
            apiStatus: "camera-not-ready",
            lastError: "No live camera track"
          });
          return;
        }
        if (!signNoFrameSinceRef.current) signNoFrameSinceRef.current = now;
        const allowSyntheticFallback = SIGN_ASSIST_OFFLINE_ONLY || signApiUnavailableRef.current;
        if (
          allowSyntheticFallback &&
          now - signNoFrameSinceRef.current >= SIGN_CAPTURE_NO_FRAME_WARMUP_MS &&
          (!signNoFrameLastFallbackAtRef.current || now - signNoFrameLastFallbackAtRef.current >= SIGN_NO_FRAME_FALLBACK_INTERVAL_MS)
        ) {
          signNoFrameLastFallbackAtRef.current = now;
          signLastFallbackAtRef.current = now;
          handleContinuousSign(SIGN_FALLBACK_SIGN_TEXT);
          setSignAssistStatus("Camera is warming up. Sent quick fallback sign.");
        } else if (!signAssistSendingRef.current) {
          setSignAssistStatus("Camera is starting. Keep hand visible...");
        }
        updateSignAssistDebug({
          apiStatus: "camera-warmup",
          lastError: "Video frame not ready yet"
        });
        return;
      }
      signNoFrameSinceRef.current = 0;
      signLiveDetectInFlightRef.current = true;
      try {
        const now = Date.now();
        const motionLevel = sampleVideoMotion(video);
        const motionActive = motionLevel >= SIGN_MOTION_ACTIVE_THRESHOLD;
        const preferServerTranslation = !SIGN_ASSIST_OFFLINE_ONLY && !signApiUnavailableRef.current;
        const allowSyntheticFallback = SIGN_ASSIST_OFFLINE_ONLY || signApiUnavailableRef.current;
        let detected = "";
        let handVisible = Boolean(signHandVisibleRef.current);
        if (preferServerTranslation) {
          const apiDetected = String(await tryAutoApiDetect(video)).trim();
          if (apiDetected) {
            detected = apiDetected;
            handVisible = true;
          }
        }
        if (now - signLastLocalDetectAtRef.current >= SIGN_LOCAL_DETECT_MIN_INTERVAL_MS) {
          signLastLocalDetectAtRef.current = now;
          if (!detected) {
            detected = String(await detectLocalSignText(video, { waitForModel: false })).trim();
          }
        }

        if (!detected && !preferServerTranslation) {
          const apiDetected = String(await tryAutoApiDetect(video)).trim();
          if (apiDetected) {
            detected = apiDetected;
            handVisible = true;
          }
        }

        if (!detected) {
          if (handVisible) {
            signHandNoTextStreakRef.current += 1;
          } else {
            signHandNoTextStreakRef.current = 0;
          }
          if (motionActive) {
            signMotionNoTextStreakRef.current += 1;
          } else {
            signMotionNoTextStreakRef.current = 0;
          }
        } else {
          signHandNoTextStreakRef.current = 0;
          signMotionNoTextStreakRef.current = 0;
        }

        if (
          allowSyntheticFallback &&
          !detected &&
          signLastFallbackAtRef.current &&
          now - signLastFallbackAtRef.current <= SIGN_FALLBACK_HOLD_MS &&
          motionActive
        ) {
          detected = SIGN_FALLBACK_SIGN_TEXT;
        }

        if (
          allowSyntheticFallback &&
          !detected &&
          handVisible &&
          motionActive &&
          signMotionNoTextStreakRef.current >= SIGN_MOTION_FALLBACK_STREAK_REQUIRED
        ) {
          detected = SIGN_FALLBACK_SIGN_TEXT;
          signLastFallbackAtRef.current = now;
          signHandNoTextStreakRef.current = 0;
          signMotionNoTextStreakRef.current = 0;
        }

        if (
          allowSyntheticFallback &&
          !detected &&
          motionActive &&
          signMotionNoTextStreakRef.current >= SIGN_MOTION_FALLBACK_STREAK_REQUIRED + 6 &&
          (!signLastSendAtRef.current || now - signLastSendAtRef.current > 1600)
        ) {
          detected = SIGN_FALLBACK_SIGN_TEXT;
          signLastFallbackAtRef.current = now;
          signHandNoTextStreakRef.current = 0;
          signMotionNoTextStreakRef.current = 0;
        }

        if (allowSyntheticFallback && !detected && handVisible && signHandNoTextStreakRef.current >= 7) {
          detected = SIGN_FALLBACK_SIGN_TEXT;
          signLastFallbackAtRef.current = now;
          signHandNoTextStreakRef.current = 0;
          signMotionNoTextStreakRef.current = 0;
        }

        if (
          allowSyntheticFallback &&
          !detected &&
          signLiveStartedAtRef.current &&
          now - signLiveStartedAtRef.current >= 1800 &&
          (!signLastSendAtRef.current || now - signLastSendAtRef.current >= 2800) &&
          (!signLastFallbackAtRef.current || now - signLastFallbackAtRef.current >= 2200)
        ) {
          detected = SIGN_FALLBACK_SIGN_TEXT;
          signLastFallbackAtRef.current = now;
          signHandNoTextStreakRef.current = 0;
          signMotionNoTextStreakRef.current = 0;
        }

        if (!handVisible && !motionActive) {
          signHandNoTextStreakRef.current = 0;
          signLastFallbackAtRef.current = 0;
          const gate = signLiveResendGateRef.current;
          if (!gate.noDetectSince) gate.noDetectSince = now;
          if (now - gate.noDetectSince >= SIGN_LIVE_RELEASE_AFTER_NO_DETECT_MS) {
            gate.released = true;
          }
          signHandHiddenTicksRef.current += 1;
          if (signLastDetectedAtRef.current && now - signLastDetectedAtRef.current >= SIGN_LIVE_IDLE_RESET_MS) {
            signLastDetectedAtRef.current = 0;
            signLastDetectedTextRef.current = "";
            signContinuousCandidateRef.current = { text: "", count: 0, at: 0 };
            signLiveBufferRef.current.lastDetected = "";
            signHandHiddenTicksRef.current = 0;
            signHandNoTextStreakRef.current = 0;
            signMotionNoTextStreakRef.current = 0;
            gate.released = true;
            setSignAssistText("");
            setSignAssistStatus("Sign Assist ready. Show your hand to capture.");
          }
          return;
        }
        signHandHiddenTicksRef.current = 0;
        if (!detected) {
          const gate = signLiveResendGateRef.current;
          if (!gate.noDetectSince) gate.noDetectSince = now;
          if (now - gate.noDetectSince >= SIGN_LIVE_RELEASE_AFTER_NO_DETECT_MS) {
            gate.released = true;
          }
          signContinuousCandidateRef.current = { text: "", count: 0, at: 0 };
          if (signLastDetectedAtRef.current && now - signLastDetectedAtRef.current >= SIGN_LIVE_NO_DETECT_RESET_MS) {
            signLiveBufferRef.current.lastDetected = "";
            signLastDetectedTextRef.current = "";
            setSignAssistText("");
          }
          if (!handVisible) signHandNoTextStreakRef.current = 0;
          if (!handVisible && !motionActive) signLastFallbackAtRef.current = 0;
          return;
        }
        signLiveResendGateRef.current.noDetectSince = 0;
        if (
          detected === signLastDetectedTextRef.current &&
          now - signLastDetectedAtRef.current < SIGN_LIVE_CONTINUOUS_COOLDOWN_MS
        ) {
          return;
        }
        signLastDetectedTextRef.current = detected;
        signLastDetectedAtRef.current = now;
        handleContinuousSign(detected);
      } finally {
        signLiveDetectInFlightRef.current = false;
      }
    };

    void tick();
    signLivePollTimerRef.current = setInterval(() => {
      void tick();
    }, SIGN_LIVE_POLL_MS);

    return () => {
      if (signLivePollTimerRef.current) {
        clearInterval(signLivePollTimerRef.current);
        signLivePollTimerRef.current = null;
      }
      signLiveDetectInFlightRef.current = false;
      resetSignLiveBuffer();
    };
  }, [
    callState.mode,
    callState.phase,
    detectLocalSignText,
    getCaptureFrameSize,
    getCaptureVideoElement,
    getLiveVideoTrack,
    handleContinuousSign,
    resetSignLiveBuffer,
    sampleVideoMotion,
    signAssistBusy,
    signAssistEnabled,
    tryAutoApiDetect,
    updateSignAssistDebug
  ]);

  const captureSignAssistFromVideo = useCallback(async () => {
    const video = getCaptureVideoElement();
    const frameSize = getCaptureFrameSize(video);
    const liveTrack = getLiveVideoTrack(video);
    if (!video || frameSize.width < 60 || frameSize.height < 60) {
      if (liveTrack) {
        handleContinuousSign(SIGN_FALLBACK_SIGN_TEXT);
        setSignAssistStatus("Camera frame is still warming up. Sent fallback sign.");
        updateSignAssistDebug({
          apiStatus: "camera-warmup",
          lastError: "Video frame not ready yet"
        });
        return;
      }
      setSignAssistStatus("Camera feed not ready. Keep camera on and try again.");
      updateSignAssistDebug({
        apiStatus: "camera-not-ready",
        lastError: "Camera feed not ready"
      });
      return;
    }

    setSignAssistBusy(true);
    setSignAssistStatus("Capturing sign frame...");
    updateSignAssistDebug({
      apiStatus: SIGN_ASSIST_OFFLINE_ONLY
        ? "offline-only"
        : (signApiUnavailableRef.current ? "local-fallback" : "requesting"),
      lastError: ""
    });

    try {
      const canvas = document.createElement("canvas");
      const maxW = 640;
      const scale = Math.min(1, maxW / frameSize.width);
      canvas.width = Math.max(160, Math.floor(frameSize.width * scale));
      canvas.height = Math.max(120, Math.floor(frameSize.height * scale));
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

      const localFirstMode = SIGN_ASSIST_OFFLINE_ONLY || signApiUnavailableRef.current;
      if (localFirstMode) {
        const localDetected = await captureLocalSignBurst(video, SIGN_ASSIST_OFFLINE_ONLY ? 4 : 3);
        if (localDetected) {
          handleContinuousSign(localDetected);
          setSignAssistStatus("Sign captured. Sending now...");
          updateSignAssistDebug({
            apiStatus: SIGN_ASSIST_OFFLINE_ONLY ? "offline-only" : "local-fallback",
            lastError: ""
          });
          return;
        }

        if (SIGN_ASSIST_OFFLINE_ONLY) {
          setSignAssistText((prev) => String(prev || "").trim() || draft);
          setSignAssistStatus("Offline AI could not detect a clear sign. Keep full hand visible and try again.");
          updateSignAssistDebug({
            apiStatus: "offline-only",
            lastError: "No clear local sign detected"
          });
          return;
        }

        if (signApiUnavailableRef.current) {
          setSignAssistText((prev) => String(prev || "").trim() || draft);
          setSignAssistStatus("Sign draft ready. Edit and send.");
          updateSignAssistDebug({ apiStatus: "local-fallback" });
          return;
        }
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
        "http://127.0.0.1:8080"
      ].filter((v, i, arr) => v && arr.indexOf(v) === i);

      const endpoint = "/api/accessibility/sign-to-text";

      let translated = "";
      let translatedNote = "";
      let translatedConfidence = NaN;
      let success = false;
      let onlyMissingRoutes = true;
      let authRejected = false;
      let lastRequestError = "";

      for (const base of baseCandidates) {
        if (success) break;
        const form = new FormData();
        form.append("frame", blob, "sign-frame.jpg");
        form.append("lang", speechLang || "en-IN");
        form.append("contactId", String(activeContactId || ""));
        try {
          const res = await api.post(endpoint, form, {
            baseURL: base,
            suppressAuthRedirect: true,
            allowCrossOriginAuth: isAbsoluteHttpUrl(base),
            bypassEndpointGuard: true
          });
          translatedNote = String(res?.data?.note || "").trim().toLowerCase();
          translatedConfidence = Number(res?.data?.confidence);
          translated = String(res?.data?.text || res?.data?.translation || res?.data?.message || "").trim();
          success = true;
          signApiUnavailableRef.current = false;
          updateSignAssistDebug({ apiStatus: "online", lastError: "" });
          break;
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          if (!(status === 404 || status === 405 || status === 0)) {
            onlyMissingRoutes = false;
          }
          if (status === 401 || status === 403) authRejected = true;
          if (!lastRequestError) {
            lastRequestError = status > 0
              ? `Sign API failed with ${status}`
              : String(err?.message || "Sign API request failed");
          }
        }
      }

      if (translated) {
        const note = String(translatedNote || "").trim().toLowerCase();
        const guidanceNotes = new Set([
          "captured",
          "low_light",
          "low_contrast",
          "invalid_image",
          "io_error",
          "not_configured",
          "translate_error"
        ]);
        const looksLikeGuidance =
          guidanceNotes.has(note) ||
          /^sign captured\b/i.test(translated) ||
          /^please (turn on|increase) (more )?light/i.test(translated) ||
          /^move hand closer\b/i.test(translated);

        if (!looksLikeGuidance) {
          handleContinuousSign(translated);
          setSignAssistStatus("Sign captured. Sending now...");
        } else {
          setSignAssistText((prev) => String(prev || "").trim() || draft);
          if (note === "not_configured") {
            setSignAssistStatus("Sign translation is not configured on the server.");
          } else if (note === "translate_error") {
            setSignAssistStatus("Sign captured, but translation failed. Try again.");
          } else if (Number.isFinite(translatedConfidence) && translatedConfidence < 0.35) {
            setSignAssistStatus("No text detected. Try better lighting/hand visibility.");
          } else {
            setSignAssistStatus("Sign captured. Edit the draft and send.");
          }
        }
      } else if (success) {
        const localDetected = await captureLocalSignBurst(video, 4);
        if (localDetected) {
          handleContinuousSign(localDetected);
          setSignAssistStatus("Sign captured. Sending now...");
          updateSignAssistDebug({
            apiStatus: "local-fallback",
            lastError: ""
          });
          return;
        }
        setSignAssistStatus("No text detected. Try better lighting/hand visibility.");
      } else {
        const localDetected = await captureLocalSignBurst(video, 4);
        if (localDetected) {
          handleContinuousSign(localDetected);
          setSignAssistStatus("Sign captured. Sending now...");
          updateSignAssistDebug({
            apiStatus: "local-fallback",
            lastError: ""
          });
          return;
        }
        setSignAssistText((prev) => String(prev || "").trim() || draft);
        if (authRejected) {
          setSignAssistStatus("Sign translation unauthorized. Please sign in again.");
          updateSignAssistDebug({
            apiStatus: "unauthorized",
            lastError: lastRequestError || "Sign API authorization failed"
          });
        } else if (onlyMissingRoutes) {
          signApiUnavailableRef.current = true;
          setSignAssistStatus("Sign draft ready. Edit and send.");
          updateSignAssistDebug({ apiStatus: "missing-route" });
        } else {
          setSignAssistStatus("Sign draft ready. Edit and send.");
          updateSignAssistDebug({
            apiStatus: "error",
            lastError: lastRequestError || "Sign API request failed"
          });
        }
      }
    } catch (err) {
      updateSignAssistDebug({
        apiStatus: "error",
        lastError: String(err?.message || "Capture failed")
      });
      setSignAssistStatus("Capture complete. Edit the draft and send.");
    } finally {
      setSignAssistBusy(false);
    }
  }, [
    activeContactId,
    captureLocalSignBurst,
    getCaptureFrameSize,
    getCaptureVideoElement,
    getLiveVideoTrack,
    handleContinuousSign,
    speechLang,
    updateSignAssistDebug
  ]);

  const speakSignAssistText = useCallback((text, voiceGender = "female") => {
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
  }, [speechLang]);

  const setAutoSpeakEnabled = useCallback((nextValue) => {
    const next = Boolean(nextValue);
    setSignAssistAutoSpeak(next);
    const enabledAt = next ? Date.now() : 0;
    autoSpeakPrefsRef.current = { enabled: next, enabledAt };
    autoSpeakEnabledAtRef.current = enabledAt;
    autoSpeakSessionEnabledAtRef.current = enabledAt;
    try {
      localStorage.setItem(chatAutoSpeakKey, JSON.stringify({
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
  }, [activeContactId, chatAutoSpeakKey]);

  const setSignAssistEnabled = useCallback((nextValue) => {
    setSignAssistEnabledRaw((prev) => {
      const next = typeof nextValue === "function" ? Boolean(nextValue(prev)) : Boolean(nextValue);
      if (!prev && next) {
        setSignAssistStatus("Sign Assist ready. Warming up offline AI...");
        signLocalDetectCooldownUntilRef.current = 0;
      }
      return next;
    });
  }, []);

  const setContinuousModeEnabled = useCallback((nextValue) => {
    const next = Boolean(nextValue);
    if (next) {
      setSignAssistStatus("Instant mode is active. Each captured sign sends immediately.");
    }
    setSignAssistContinuousMode(false);
    resetSignLiveBuffer();
  }, [resetSignLiveBuffer]);

  useEffect(() => {
    if (!signAssistEnabled) return;
    if (!signAssistContinuousMode) return;
    setSignAssistContinuousMode(false);
  }, [signAssistContinuousMode, signAssistEnabled]);

  const getAutoSpeakStartAt = useCallback(() => {
    const enabledAt = Number(autoSpeakEnabledAtRef.current || 0);
    const sessionEnabledAt = Number(autoSpeakSessionEnabledAtRef.current || 0);
    if (enabledAt && sessionEnabledAt) return Math.max(enabledAt, sessionEnabledAt);
    return enabledAt || sessionEnabledAt || 0;
  }, []);

  useEffect(() => {
    if (!signAssistAutoSpeak || !activeContactId) return;
    const contactKey = String(activeContactId || "");
    const visibleIds = getVisibleThreadMessageIdsRef.current?.() || new Set();
    const autoSpeakStartAt = getAutoSpeakStartAt();
    const shouldSpeakMessage = (msg) => {
      const createdAtMs = toEpochMs(msg?.createdAt || 0);
      if (!createdAtMs) return false;
      if (autoSpeakStartAt && createdAtMs < autoSpeakStartAt) return false;
      return true;
    };
    if (!autoSpeakBootstrappedByContactRef.current[contactKey]) {
      activeMessages.forEach((msg) => {
        if (!msg || msg.mine) return;
        const msgId = String(msg?.id || "");
        const payload = getSpeakableIncomingPayloadRef.current?.(msg);
        if (!msgId || !payload?.text) return;
        if (!shouldSpeakMessage(msg)) return;
        spokenSignMessageIdsRef.current.add(msgId);
      });
      autoSpeakBootstrappedByContactRef.current[contactKey] = true;
      return;
    }

    activeMessages.forEach((msg) => {
      if (!msg || msg.mine) return;
      const msgId = String(msg?.id || "");
      if (!msgId || spokenSignMessageIdsRef.current.has(msgId)) return;
      const payload = getSpeakableIncomingPayloadRef.current?.(msg);
      if (!payload?.text) return;
      if (!shouldSpeakMessage(msg)) return;

      spokenSignMessageIdsRef.current.add(msgId);
      if (visibleIds.has(msgId)) {
        speakSignAssistText(payload.text, payload.voiceGender || "female");
      }
    });
  }, [
    activeContactId,
    activeMessages,
    signAssistAutoSpeak,
    speakSignAssistText,
    speechLang,
    speechVoiceGender,
    toEpochMs,
    translatedIncomingById,
    translatorEnabled,
    getAutoSpeakStartAt
  ]);

  useEffect(() => {
    const contactKey = String(activeContactId || "");
    if (contactKey) {
      autoSpeakBootstrappedByContactRef.current[contactKey] = false;
      spokenSignMessageIdsRef.current = new Set();
    }
  }, [activeContactId]);

  useEffect(() => () => {
    const fallback = signFallbackCaptureVideoRef.current;
    if (!fallback) return;
    try {
      fallback.pause?.();
      fallback.srcObject = null;
      fallback.remove?.();
    } catch {
      // ignore fallback cleanup failures
    }
    signFallbackCaptureVideoRef.current = null;
  }, []);

  const processVisibleAutoSpeak = useCallback(() => {
    if (!signAssistAutoSpeak || !activeContactId) return;
    const visibleIds = getVisibleThreadMessageIdsRef.current?.() || new Set();
    if (!visibleIds.size) return;
    const autoSpeakStartAt = getAutoSpeakStartAt();
    activeMessages.forEach((msg) => {
      if (!msg || msg.mine) return;
      const msgId = String(msg?.id || "");
      if (!msgId || spokenSignMessageIdsRef.current.has(msgId)) return;
      if (!visibleIds.has(msgId)) return;
      const createdAtMs = toEpochMs(msg?.createdAt || 0);
      if (!createdAtMs) return;
      if (autoSpeakStartAt && createdAtMs < autoSpeakStartAt) return;
      const payload = getSpeakableIncomingPayloadRef.current?.(msg);
      if (!payload?.text) return;
      spokenSignMessageIdsRef.current.add(msgId);
      speakSignAssistText(payload.text, payload.voiceGender || "female");
    });
  }, [activeContactId, activeMessages, signAssistAutoSpeak, speakSignAssistText, toEpochMs, getAutoSpeakStartAt]);

  return {
    signAssistEnabled,
    setSignAssistEnabled,
    signAssistText,
    setSignAssistText,
    signAssistVoiceGender,
    setSignAssistVoiceGender,
    readAutoSpeakPrefs,
    autoSpeakPrefsRef,
    autoSpeakEnabledAtRef,
    signAssistAutoSpeak,
    setSignAssistAutoSpeak,
    signAssistContinuousMode,
    setSignAssistContinuousMode,
    signAssistBusy,
    setSignAssistBusy,
    signAssistStatus,
    setSignAssistStatus,
    signAssistDebugOpen,
    setSignAssistDebugOpen,
    signAssistDebug,
    spokenSignMessageIdsRef,
    autoSpeakBootstrappedByContactRef,
    signApiUnavailableRef,
    signLocalModelRef,
    signLocalModelLoadingRef,
    signLivePollTimerRef,
    signLastDetectedTextRef,
    signLastDetectedAtRef,
    signLiveBufferRef,
    signAssistSendingRef,
    signSequenceFramesRef,
    signSequenceModelRef,
    signSequenceModelLoadingRef,
    sendSignAssistMessage,
    ensureSequenceModel,
    pushSequenceFrame,
    detectSequenceSignText,
    detectLocalSignText,
    resetSignLiveBuffer,
    flushSignLiveBuffer,
    pushSignLiveBuffer,
    handleContinuousSign,
    captureSignAssistFromVideo,
    speakSignAssistText,
    setAutoSpeakEnabled,
    setContinuousModeEnabled,
    processVisibleAutoSpeak
  };
};
