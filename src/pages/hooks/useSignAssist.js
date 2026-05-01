import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/axios";
import { getApiBaseUrl } from "../../api/baseUrl";

const SIGN_ASSIST_TOKEN = "__SS_SIGN_ASSIST__:";
export const SIGN_VOICE_GENDERS = ["female", "male"];
const SIGN_LOCAL_TF_SCRIPT = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const SIGN_LOCAL_HANDPOSE_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js";
const SIGN_LIVE_DEBOUNCE_MS = 2200;
const SIGN_LIVE_MAX_BUFFER_CHARS = 320;
const SIGN_LIVE_CONTINUOUS_COOLDOWN_MS = 1400;
const SIGN_SEQUENCE_FRAME_WINDOW = 18;

const normalizeLangCode = (value) => String(value || "").trim().replace("_", "-");

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

const readAutoSpeakPrefsFromStorage = (storageKey) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      enabled: Boolean(parsed?.enabled),
      enabledAt: Number(parsed?.enabledAt || 0)
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
  const [signAssistEnabled, setSignAssistEnabled] = useState(false);
  const [signAssistText, setSignAssistText] = useState("");
  const [signAssistVoiceGender, setSignAssistVoiceGender] = useState("female");
  const readAutoSpeakPrefs = useCallback(
    () => readAutoSpeakPrefsFromStorage(chatAutoSpeakKey),
    [chatAutoSpeakKey]
  );
  const autoSpeakPrefsRef = useRef(readAutoSpeakPrefs());
  const autoSpeakEnabledAtRef = useRef(autoSpeakPrefsRef.current.enabledAt || 0);
  const [signAssistAutoSpeak, setSignAssistAutoSpeak] = useState(() => autoSpeakPrefsRef.current.enabled);
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

  const sendSignAssistMessage = useCallback(async ({ text = null, source = "video-call", clearAfter = true, silent = false } = {}) => {
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

    if (!ok && !silent) {
      setSignAssistStatus("Failed to send sign message.");
    }
    signAssistSendingRef.current = false;
  }, [sendTextPayload, signAssistText, signAssistVoiceGender]);

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

  const detectLocalSignText = useCallback(async (videoEl) => {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return "";
    try {
      if (!signLocalModelRef.current && !signLocalModelLoadingRef.current) {
        updateSignAssistDebug({ localModelStatus: "loading" });
      }
      await loadExternalScript(SIGN_LOCAL_TF_SCRIPT, "tfjs-chat-sign");
      await loadExternalScript(SIGN_LOCAL_HANDPOSE_SCRIPT, "handpose-chat-sign");
      if (!window?.handpose) {
        updateSignAssistDebug({
          localModelStatus: "unavailable",
          lastError: "handpose library missing"
        });
        return "";
      }

      if (!signLocalModelRef.current) {
        if (!signLocalModelLoadingRef.current) {
          signLocalModelLoadingRef.current = window.handpose.load();
        }
        signLocalModelRef.current = await signLocalModelLoadingRef.current;
        updateSignAssistDebug({ localModelStatus: "loaded", lastError: "" });
      }

      const predictions = await signLocalModelRef.current.estimateHands(videoEl, true);
      if (!Array.isArray(predictions) || predictions.length === 0) return "";
      const landmarks = predictions[0]?.landmarks || [];
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
      const localText = inferLocalSignText(landmarks);
      if (localText) {
        updateSignAssistDebug({
          lastDetection: localText,
          lastDetectionSource: "local",
          lastDetectionAt: Date.now()
        });
      }
      return localText;
    } catch (err) {
      updateSignAssistDebug({
        localModelStatus: "error",
        lastError: String(err?.message || "Local detection failed")
      });
      return "";
    }
  }, [detectSequenceSignText, pushSequenceFrame, updateSignAssistDebug]);

  const captureLocalSignBurst = useCallback(async (videoEl, attempts = 6, delayMs = 180) => {
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
  }, []);

  const flushSignLiveBuffer = useCallback((reason = "idle") => {
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
  }, [sendSignAssistMessage]);

  const pushSignLiveBuffer = useCallback((detected) => {
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
  }, [flushSignLiveBuffer]);

  const handleContinuousSign = useCallback((detected) => {
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
  }, [sendSignAssistMessage]);

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
  }, [
    callState.mode,
    callState.phase,
    detectLocalSignText,
    handleContinuousSign,
    localVideoRef,
    pushSignLiveBuffer,
    resetSignLiveBuffer,
    signAssistBusy,
    signAssistContinuousMode,
    signAssistEnabled
  ]);

  const captureSignAssistFromVideo = useCallback(async () => {
    const video = localVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
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
      apiStatus: signApiUnavailableRef.current ? "local-fallback" : "requesting",
      lastError: ""
    });

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
        const localDetected = await captureLocalSignBurst(video);
        if (localDetected) {
          setSignAssistText(localDetected);
          setSignAssistStatus("Sign detected locally. Review and send.");
          updateSignAssistDebug({ apiStatus: "local-fallback", lastError: "" });
        } else {
          setSignAssistText((prev) => String(prev || "").trim() || draft);
          setSignAssistStatus("Sign draft ready. Edit and send.");
          updateSignAssistDebug({ apiStatus: "local-fallback" });
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
        "http://127.0.0.1:8080"
      ].filter((v, i, arr) => v && arr.indexOf(v) === i);

      const endpointCandidates = [
        "/api/accessibility/sign-to-text",
        "/api/sign-language/translate",
        "/api/sign-to-text"
      ];

      let translated = "";
      let translatedNote = "";
      let translatedConfidence = NaN;
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
          setSignAssistText(translated);
          setSignAssistStatus("Sign translated. Review and send.");
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
        setSignAssistStatus("No text detected. Try better lighting/hand visibility.");
      } else {
        const localDetected = await captureLocalSignBurst(video);
        if (localDetected) {
          setSignAssistText(localDetected);
          setSignAssistStatus("Sign detected locally. Review and send.");
          return;
        }
        setSignAssistText((prev) => String(prev || "").trim() || draft);
        if (onlyMissingRoutes) {
          signApiUnavailableRef.current = true;
          setSignAssistStatus("Sign draft ready. Edit and send.");
          updateSignAssistDebug({ apiStatus: "missing-route" });
        } else {
          setSignAssistStatus("Sign draft ready. Edit and send.");
          updateSignAssistDebug({
            apiStatus: "error",
            lastError: "Sign API request failed"
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
  }, [activeContactId, captureLocalSignBurst, localVideoRef, speechLang, updateSignAssistDebug]);

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
    autoSpeakEnabledAtRef.current = enabledAt;
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

  const setContinuousModeEnabled = useCallback((nextValue) => {
    const next = Boolean(nextValue);
    setSignAssistContinuousMode(next);
    resetSignLiveBuffer();
  }, [resetSignLiveBuffer]);

  useEffect(() => {
    if (!signAssistAutoSpeak || !activeContactId) return;
    const contactKey = String(activeContactId || "");
    const visibleIds = getVisibleThreadMessageIdsRef.current?.() || new Set();
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
        const payload = getSpeakableIncomingPayloadRef.current?.(msg);
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
    translatorEnabled
  ]);

  useEffect(() => {
    const contactKey = String(activeContactId || "");
    if (contactKey) {
      autoSpeakBootstrappedByContactRef.current[contactKey] = false;
      spokenSignMessageIdsRef.current = new Set();
    }
  }, [activeContactId]);

  const processVisibleAutoSpeak = useCallback(() => {
    if (!signAssistAutoSpeak || !activeContactId) return;
    const visibleIds = getVisibleThreadMessageIdsRef.current?.() || new Set();
    if (!visibleIds.size) return;
    const enabledAt = autoSpeakEnabledAtRef.current || 0;
    activeMessages.forEach((msg) => {
      if (!msg || msg.mine) return;
      const msgId = String(msg?.id || "");
      if (!msgId || spokenSignMessageIdsRef.current.has(msgId)) return;
      if (!visibleIds.has(msgId)) return;
      const createdAtMs = toEpochMs(msg?.createdAt || 0);
      if (enabledAt && createdAtMs && createdAtMs < enabledAt) return;
      const payload = getSpeakableIncomingPayloadRef.current?.(msg);
      if (!payload?.text) return;
      spokenSignMessageIdsRef.current.add(msgId);
      speakSignAssistText(payload.text, payload.voiceGender || "female");
    });
  }, [activeContactId, activeMessages, signAssistAutoSpeak, speakSignAssistText, toEpochMs]);

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
