import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl } from "../api/baseUrl";
import "./SOSPage.css";

const SOS_SESSION_KEY = "socialsea_sos_session_v1";
const SOS_HISTORY_KEY = "socialsea_sos_history_v1";
const SOS_SIGNAL_KEY = "socialsea_sos_signal_v1";
const SOS_SIGNAL_CHANNEL = "socialsea_sos_signal_channel_v1";
const SOS_LIVE_PREVIEW_CHANNEL = "socialsea_sos_live_preview_channel_v1";
const SOS_LIVE_PREVIEW_FRAME_KEY = "socialsea_sos_live_preview_frame_v1";
const SOS_LIVE_PREVIEW_FRAME_KEY_PREFIX = "socialsea_sos_live_preview_frame_v1_";
const SOS_LIVE_RTC_SIGNAL_KEY = "socialsea_sos_live_rtc_signal_v1";
const SOS_LIVE_RTC_OFFER_KEY_PREFIX = "socialsea_sos_live_rtc_offer_v1_";
const SOS_LIVE_RTC_ANSWER_KEY_PREFIX = "socialsea_sos_live_rtc_answer_v1_";
const SOS_ACTIVE_OWNER_KEY = "socialsea_sos_active_owner_v1";
const HEARTBEAT_MS = 2000;
const RADIUS_METERS = 5000;
const LOCAL_SIGNAL_REBROADCAST_MS = 4000;

const uniqueNonEmpty = (arr) =>
  arr.filter((v, i) => {
    if (!v) return false;
    return arr.indexOf(v) === i;
  });

const isLoopbackHost = (host) => {
  const value = String(host || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1";
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

const BAD_EMERGENCY_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "43.205.213.14",
  "socialsea.co.in",
  "www.socialsea.co.in"
]);

const allowLocalEmergencyHosts =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());

const normalizeEmergencyBase = (rawBase) => {
  const value = String(rawBase || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (value === "/api") return "";
  if (value.startsWith("/")) return value;
  if (!/^https?:\/\//i.test(value)) return "";
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (BAD_EMERGENCY_HOSTS.has(host) && !allowLocalEmergencyHosts) return "";
  } catch {
    return "";
  }
  return value;
};

const emergencyBaseCandidates = () => {
  const isLocalDev =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
  const isHttpsPage =
    typeof window !== "undefined" &&
    String(window.location.protocol || "").toLowerCase() === "https:";
  const runtimeHost =
    typeof window !== "undefined" ? String(window.location.hostname || "").trim() : "";
  const runtimeHostBase =
    runtimeHost && (isLoopbackHost(runtimeHost) || isPrivateIpHost(runtimeHost))
      ? `http://${runtimeHost}:8080`
      : "";
  const storedBase =
    typeof window !== "undefined"
      ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
      : "";
  const rawList = uniqueNonEmpty(
    isLocalDev
      ? [
          "http://localhost:8080",
          "http://127.0.0.1:8080"
        ]
      : [
          getApiBaseUrl(),
          api.defaults.baseURL,
          storedBase,
          import.meta.env.VITE_API_URL,
          runtimeHostBase,
          "https://api.socialsea.co.in"
        ]
  );
  const list = uniqueNonEmpty(rawList.map(normalizeEmergencyBase).filter(Boolean));
  return list.filter((base) => !(isHttpsPage && /^http:\/\//i.test(String(base || ""))));
};

const buildEmergencyUrls = (suffix) => {
  const path = String(suffix || "").replace(/^\/+/, "");
  const urls = [`/api/emergency/${path}`];
  for (const rawBase of emergencyBaseCandidates()) {
    const base = String(rawBase || "").trim().replace(/\/+$/, "");
    if (!base) continue;
    if (base === "/api") {
      urls.push(`/api/emergency/${path}`);
      continue;
    }
    if (base.startsWith("/")) {
      urls.push(`${base}/api/emergency/${path}`);
      continue;
    }
    if (/\/api$/i.test(base)) {
      urls.push(`${base}/emergency/${path}`);
      urls.push(`${base.replace(/\/api$/i, "")}/api/emergency/${path}`);
      continue;
    }
    urls.push(`${base}/api/emergency/${path}`);
    urls.push(`${base}/emergency/${path}`);
  }
  return uniqueNonEmpty(urls);
};

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

const setSosActiveOwner = (isOwner) => {
  try {
    if (isOwner) {
      sessionStorage.setItem(SOS_ACTIVE_OWNER_KEY, "1");
    } else {
      sessionStorage.removeItem(SOS_ACTIVE_OWNER_KEY);
    }
  } catch {
    // ignore storage issues
  }
};

const nowIso = () => new Date().toISOString();
const liveFrameKeyFor = (alertLikeId) =>
  `${SOS_LIVE_PREVIEW_FRAME_KEY_PREFIX}${String(alertLikeId || "").trim()}`;
const liveOfferKeyFor = (alertLikeId) =>
  `${SOS_LIVE_RTC_OFFER_KEY_PREFIX}${String(alertLikeId || "").trim()}`;
const liveAnswerKeyFor = (alertLikeId) =>
  `${SOS_LIVE_RTC_ANSWER_KEY_PREFIX}${String(alertLikeId || "").trim()}`;
const normalizeAlertId = (value) => String(value || "").trim();
const alertIdsMatch = (a, b) => {
  const left = normalizeAlertId(a);
  const right = normalizeAlertId(b);
  if (!left || !right) return false;
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const nLeft = Number(left);
  const nRight = Number(right);
  if (Number.isFinite(nLeft) && Number.isFinite(nRight)) return nLeft === nRight;
  return false;
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to encode recording"));
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });

export default function SOSPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { alertId: routeAlertId } = useParams();
  const isLiveView = Boolean(routeAlertId);

  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [alertId, setAlertId] = useState(routeAlertId ? Number(routeAlertId) : null);
  const [alertDisplayId, setAlertDisplayId] = useState(routeAlertId ? String(routeAlertId) : null);
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastLocation, setLastLocation] = useState(null);
  const [locationCount, setLocationCount] = useState(0);
  const [recordingInfo, setRecordingInfo] = useState({
    audio: false,
    video: false,
    chunks: 0,
    bytes: 0
  });
  const [backendStatus, setBackendStatus] = useState("Not sent yet");
  const [liveFrameUrl, setLiveFrameUrl] = useState("");
  const [liveStreamAvailable, setLiveStreamAvailable] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const lastFrameAtRef = useRef(0);
  const hasMatchedLiveFrameRef = useRef(false);
  const latestPreviewFrameRef = useRef("");
  const latestPreviewFrameAtRef = useRef("");

  const watchIdRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const tickTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const startTapRef = useRef({ count: 0, lastAt: 0 });
  const previewVideoRef = useRef(null);
  const liveRemoteVideoRef = useRef(null);
  const sosSignalChannelRef = useRef(null);
  const livePreviewChannelRef = useRef(null);
  const senderRtcPeerRef = useRef(null);
  const viewerRtcPeerRef = useRef(null);
  const sosStompRef = useRef(null);
  const sosStompSubRef = useRef(null);
  const sosStompHandlerRef = useRef(null);
  const sosStompAlertRef = useRef("");
  const sosStompQueueRef = useRef([]);

  const session = useMemo(() => readJson(SOS_SESSION_KEY, null), []);

  const persistSession = (patch) => {
    const current = readJson(SOS_SESSION_KEY, {});
    writeJson(SOS_SESSION_KEY, { ...current, ...patch });
  };

  const appendHistory = (entry) => {
    const prev = readJson(SOS_HISTORY_KEY, []);
    const next = [entry, ...prev].slice(0, 30);
    writeJson(SOS_HISTORY_KEY, next);
  };

  useEffect(() => {
    const token = String(
      sessionStorage.getItem("accessToken") ||
        sessionStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        localStorage.getItem("token") ||
        localStorage.getItem("authToken") ||
        sessionStorage.getItem("authToken") ||
        ""
    ).trim();
    if (!token) return undefined;
    let disposed = false;
    let client = null;

    const init = async () => {
      try {
        const [{ Client }, sockjsModule] = await Promise.all([
          import("@stomp/stompjs"),
          import("sockjs-client/dist/sockjs")
        ]);
        if (disposed) return;
        const SockJS = sockjsModule?.default || sockjsModule;
        const base = getApiBaseUrl().replace(/\/+$/, "");

        client = new Client({
          webSocketFactory: () => new SockJS(`${base}/ws?token=${encodeURIComponent(token)}`),
          reconnectDelay: 2000,
          debug: () => {}
        });

        client.onConnect = () => {
          if (disposed) return;
          sosStompRef.current = client;
          const alertId = String(sosStompAlertRef.current || "").trim();
          if (alertId) {
            try {
              sosStompSubRef.current?.unsubscribe();
            } catch {
              // ignore
            }
            sosStompSubRef.current = client.subscribe(`/topic/sos/${encodeURIComponent(alertId)}`, (frame) => {
              try {
                const payload = JSON.parse(frame.body || "{}");
                const handler = sosStompHandlerRef.current;
                if (handler) {
                  handler(payload);
                } else {
                  const queue = sosStompQueueRef.current;
                  queue.push(payload);
                  if (queue.length > 50) queue.shift();
                }
              } catch {
                // ignore
              }
            });
          }
        };
        client.onStompError = () => {};
        client.onWebSocketError = () => {};
        client.onWebSocketClose = () => {};

        client.activate();
      } catch {
        // ignore stomp init errors
      }
    };

    init();

    return () => {
      disposed = true;
      try {
        sosStompSubRef.current?.unsubscribe();
      } catch {
        // ignore
      }
      sosStompSubRef.current = null;
      sosStompRef.current = null;
      if (client) {
        try {
          client.deactivate();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(() => {
    const activeAlertId = normalizeAlertId(routeAlertId || alertId || alertDisplayId);
    sosStompAlertRef.current = activeAlertId;
    const client = sosStompRef.current;
    if (!client || !client.connected || !activeAlertId) return;
    try {
      sosStompSubRef.current?.unsubscribe();
    } catch {
      // ignore
    }
    sosStompSubRef.current = client.subscribe(`/topic/sos/${encodeURIComponent(activeAlertId)}`, (frame) => {
      try {
        const payload = JSON.parse(frame.body || "{}");
        const handler = sosStompHandlerRef.current;
        if (handler) {
          handler(payload);
        } else {
          const queue = sosStompQueueRef.current;
          queue.push(payload);
          if (queue.length > 50) queue.shift();
        }
      } catch {
        // ignore
      }
    });
  }, [routeAlertId, alertId, alertDisplayId]);

  const broadcastSosSignal = (type, extras = {}) => {
    const payload = {
      type,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      at: nowIso(),
      senderUserId: String(localStorage.getItem("userId") || sessionStorage.getItem("userId") || "").trim(),
      ...extras
    };
    try {
      localStorage.setItem(SOS_SIGNAL_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
    try {
      if (!sosSignalChannelRef.current && typeof BroadcastChannel !== "undefined") {
        sosSignalChannelRef.current = new BroadcastChannel(SOS_SIGNAL_CHANNEL);
      }
      sosSignalChannelRef.current?.postMessage(payload);
    } catch {
      // ignore broadcast errors
    }
  };

  const closeSenderRtcPeer = () => {
    try {
      senderRtcPeerRef.current?.close();
    } catch {
      // ignore
    }
    senderRtcPeerRef.current = null;
  };

  const closeViewerRtcPeer = () => {
    try {
      viewerRtcPeerRef.current?.close();
    } catch {
      // ignore
    }
    viewerRtcPeerRef.current = null;
    setLiveStreamAvailable(false);
    const node = liveRemoteVideoRef.current;
    if (node?.srcObject) {
      try {
        node.pause();
        node.srcObject = null;
      } catch {
        // ignore
      }
    }
  };

  const publishSosSignal = (packet) => {
    const client = sosStompRef.current;
    const alertLikeId = normalizeAlertId(packet?.alertId);
    if (!client || !client.connected || !alertLikeId) return;
    try {
      client.publish({
        destination: `/app/sos.signal/${encodeURIComponent(alertLikeId)}`,
        body: JSON.stringify(packet)
      });
    } catch {
      // ignore publish errors
    }
  };

  const postLiveRtcSignal = (packet) => {
    try {
      if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
        livePreviewChannelRef.current = new BroadcastChannel(SOS_LIVE_PREVIEW_CHANNEL);
      }
      livePreviewChannelRef.current?.postMessage(packet);
    } catch {
      // ignore broadcast errors
    }
    try {
      localStorage.setItem(SOS_LIVE_RTC_SIGNAL_KEY, JSON.stringify(packet));
    } catch {
      // ignore storage issues
    }
    publishSosSignal(packet);
  };

  const getLocationOnce = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1500
      });
    });

  const startTicker = (fromIso) => {
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    const startMs = new Date(fromIso).getTime();
    tickTimerRef.current = setInterval(() => {
      const sec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsedSec(sec);
      persistSession({ elapsedSec: sec, updatedAt: nowIso() });
    }, 1000);
  };

  const callEmergency = async (method, suffix, data = undefined, extraConfig = {}) => {
    const urls = buildEmergencyUrls(suffix);
    const suffixText = String(suffix || "").toLowerCase();
    const isPublicEmergencyEndpoint =
      suffixText === "trigger" || suffixText === "active";
    let lastErr = null;
    for (const url of urls) {
      try {
        return await api.request({
          method,
          url,
          data,
          timeout: 9000,
          ...extraConfig
        });
      } catch (err) {
        lastErr = err;
        const status = Number(err?.response?.status || 0);
        if ((status === 401 || status === 403) && isPublicEmergencyEndpoint) {
          try {
            return await api.request({
              method,
              url,
              data,
              timeout: 9000,
              skipAuth: true,
              skipRefresh: true,
              suppressAuthRedirect: true,
              ...extraConfig
            });
          } catch (retryErr) {
            lastErr = retryErr;
          }
        }
        if ((status === 401 || status === 403) && !isPublicEmergencyEndpoint) throw err;
      }
    }
    throw lastErr || new Error("Emergency request failed");
  };

  const capturePreviewFrame = async () => {
    const stream = mediaStreamRef.current;
    const previewNode = previewVideoRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return "";

    let source = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let bitmap = null;

    if (previewNode && (previewNode.videoWidth || 0) > 0 && (previewNode.videoHeight || 0) > 0) {
      source = previewNode;
      sourceWidth = previewNode.videoWidth || 0;
      sourceHeight = previewNode.videoHeight || 0;
    } else if (stream) {
      const videoTrack = stream.getVideoTracks?.()?.[0] || null;
      if (videoTrack && typeof ImageCapture !== "undefined") {
        try {
          const imageCapture = new ImageCapture(videoTrack);
          bitmap = await imageCapture.grabFrame();
          source = bitmap;
          sourceWidth = bitmap?.width || 0;
          sourceHeight = bitmap?.height || 0;
        } catch {
          bitmap = null;
        }
      }
    }

    if (!sourceWidth || !sourceHeight || !source) return "";
    const targetW = Math.min(320, sourceWidth);
    const targetH = Math.max(1, Math.round((targetW * sourceHeight) / sourceWidth));
    canvas.width = targetW;
    canvas.height = targetH;
    try {
      ctx.drawImage(source, 0, 0, targetW, targetH);
    } catch {
      if (bitmap?.close) bitmap.close();
      return "";
    }
    if (bitmap?.close) bitmap.close();

    try {
      return canvas.toDataURL("image/jpeg", 0.5);
    } catch {
      return "";
    }
  };

  const sendHeartbeat = async (forcedLocation) => {
    if (!alertId) return;
    try {
      let latestFrame = String(latestPreviewFrameRef.current || "");
      let latestFrameAt = String(latestPreviewFrameAtRef.current || "");
      if (!latestFrame && recordingInfo.video && mediaStreamRef.current) {
        const frame = await capturePreviewFrame();
        if (frame) {
          latestFrame = frame;
          latestFrameAt = nowIso();
          latestPreviewFrameRef.current = frame;
          latestPreviewFrameAtRef.current = latestFrameAt;
        }
      }
      const payload = {
        latitude: forcedLocation?.latitude ?? lastLocation?.latitude ?? null,
        longitude: forcedLocation?.longitude ?? lastLocation?.longitude ?? null,
        audioActive: recordingInfo.audio,
        videoActive: recordingInfo.video,
        frontCameraEnabled: recordingInfo.video && cameraFacing === "user",
        backCameraEnabled: recordingInfo.video && cameraFacing === "environment",
        cameraFacing,
        // Backend fallback channel for cross-browser/profile live preview.
        previewFrame: latestFrame || null,
        previewFrameAt: latestFrameAt || null
      };
      await callEmergency("post", `${alertId}/heartbeat`, payload);
      setBackendStatus("Live connection active");
      persistSession({ backendStatus: "Live connection active", updatedAt: nowIso() });
    } catch (err) {
      setBackendStatus(`Heartbeat issue: ${err?.response?.status || ""} ${err?.message || ""}`.trim());
    }
  };

  const fetchPreviewFrame = async (alertLikeId) => {
    const id = String(alertLikeId || "").trim();
    if (!id) return false;
    const urls = buildEmergencyUrls(`${encodeURIComponent(id)}/preview-frame`);
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: "GET", credentials: "include" });
        if (!res.ok) continue;
        const data = await res.json();
        const frame = String(data?.frame || "").trim();
        if (frame) {
          lastFrameAtRef.current = Date.now();
          setLiveFrameUrl(frame);
          if (isLiveView) {
            setBackendStatus("Live preview connected");
          }
          return true;
        }
      } catch {
        // ignore preview fetch errors
      }
    }
    return false;
  };

  const startHeartbeat = () => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_MS);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  const startLocationWatch = () => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: nowIso()
        };
        setLastLocation(point);
        setLocationCount((prev) => {
          const next = prev + 1;
          persistSession({ lastLocation: point, locationCount: next, updatedAt: nowIso() });
          return next;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  };

  const stopLocationWatch = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const toggleCameraFacing = () => {
    if (status === "arming" || status === "active") {
      setMessage("Stop SOS to switch camera.");
      return;
    }
    setCameraFacing((prev) => (prev === "user" ? "environment" : "user"));
  };

  const getCameraStream = async (facingMode) => {
    const preferred = String(facingMode || "user");
    const baseConstraints = { audio: true, video: { facingMode: { exact: preferred } } };
    try {
      return await navigator.mediaDevices.getUserMedia(baseConstraints);
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: preferred } });
      } catch {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      }
    }
  };

  const startRecorder = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("Recording is not supported in this browser");
      return { audio: false, video: false };
    }

    const stream = await getCameraStream(cameraFacing);
    mediaStreamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    const audio = stream.getAudioTracks().length > 0;
    const video = stream.getVideoTracks().length > 0;
    setRecordingInfo({ audio, video, chunks: 0, bytes: 0 });
    persistSession({ recordingInfo: { audio, video, chunks: 0, bytes: 0 } });

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size <= 0) return;
      chunksRef.current.push(event.data);
      setRecordingInfo((prev) => {
        const next = {
          ...prev,
          chunks: prev.chunks + 1,
          bytes: prev.bytes + event.data.size
        };
        persistSession({ recordingInfo: next, updatedAt: nowIso() });
        return next;
      });
    };

    recorder.start(1000);
    return { audio, video };
  };

  const stopRecorder = async () =>
    new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: "video/webm" })
            : null;
        resolve(blob);
      };
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(null);
    });

  const cleanupMedia = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const startSos = async () => {
    if (status === "arming" || status === "active") return;
    setStatus("arming");
    setMessage("");
    try {
      const startIso = nowIso();
      let locationError = null;
      let mediaError = null;
      let locationCount = 0;
      let initialLocation = {
        latitude: null,
        longitude: null,
        accuracy: null,
        at: startIso
      };
      try {
        const pos = await getLocationOnce();
        initialLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: startIso
        };
        locationCount = 1;
      } catch (err) {
        locationError = err;
      }

      setStartedAt(startIso);
      setLastLocation(initialLocation);
      setLocationCount(locationCount);
      setElapsedSec(0);
      const reporterUserId = String(localStorage.getItem("userId") || sessionStorage.getItem("userId") || "").trim() || undefined;
      persistSession({
        active: true,
        triggeredByCurrentBrowser: true,
        startedAt: startIso,
        elapsedSec: 0,
        lastLocation: initialLocation,
        locationCount,
        alertId: null,
        alertDisplayId: null,
        reporterUserId,
        backendStatus: "Sending trigger...",
        updatedAt: startIso
      });
      setSosActiveOwner(true);
      broadcastSosSignal("triggering", {
        reporterUserId,
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
        radiusMeters: RADIUS_METERS
      });

      startTicker(startIso);
      startLocationWatch();
      let media = { audio: false, video: false };
      try {
        media = await startRecorder();
      } catch (err) {
        mediaError = err;
        const fallbackRecording = { audio: false, video: false, chunks: 0, bytes: 0 };
        setRecordingInfo(fallbackRecording);
        persistSession({ recordingInfo: fallbackRecording, updatedAt: nowIso() });
      }
      if (!mediaError && !media.audio && !media.video) {
        mediaError = new Error("Media unavailable");
      }

      const hasLocation = initialLocation.latitude != null && initialLocation.longitude != null;
      if (!hasLocation) {
        const localId = `LOCAL-${Date.now()}`;
        setAlertDisplayId(localId);
        const backendMessage = "Location unavailable. Local SOS is active.";
        setBackendStatus(backendMessage);
        persistSession({
          alertId: null,
          alertDisplayId: localId,
          reporterUserId,
          backendStatus: backendMessage,
          updatedAt: nowIso()
        });
        broadcastSosSignal("triggered-local", {
          localAlertId: localId,
          reporterUserId,
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          radiusMeters: RADIUS_METERS,
          backendMessage
        });
      } else {
        try {
          const payload = {
            latitude: initialLocation.latitude,
            longitude: initialLocation.longitude,
            accuracyMeters: initialLocation.accuracy,
            radiusMeters: RADIUS_METERS,
            reporterUserId,
            frontCameraEnabled: media.video && cameraFacing === "user",
            backCameraEnabled: media.video && cameraFacing === "environment",
            audioActive: media.audio,
            videoActive: media.video
          };

          const res = await callEmergency("post", "trigger", payload);

          const id = res?.data?.alertId || null;
          setAlertId(id);
          setAlertDisplayId(id ? String(id) : null);
          setBackendStatus("SOS sent to backend (5km)");
          persistSession({
            alertId: id,
            alertDisplayId: id ? String(id) : null,
            reporterUserId,
            backendStatus: "SOS sent to backend (5km)",
            updatedAt: nowIso()
          });
          broadcastSosSignal("triggered", {
            alertId: id,
            reporterUserId,
            latitude: initialLocation.latitude,
            longitude: initialLocation.longitude,
            radiusMeters: RADIUS_METERS
          });
        } catch (err) {
          const status = Number(err?.response?.status || 0);
          const localId = `LOCAL-${Date.now()}`;
          setAlertDisplayId(localId);
          const backendMessage = status === 404
            ? "Backend emergency endpoint not found (404). Local SOS is still active."
            : `Backend error: ${status || ""} ${err?.message || ""}`.trim();
          setBackendStatus(backendMessage);
          persistSession({
            alertId: null,
            alertDisplayId: localId,
            reporterUserId,
            backendStatus: backendMessage,
            updatedAt: nowIso()
          });
          broadcastSosSignal("triggered-local", {
            localAlertId: localId,
            reporterUserId,
            latitude: initialLocation.latitude,
            longitude: initialLocation.longitude,
            radiusMeters: RADIUS_METERS,
            backendMessage
          });
        }
      }

      setStatus("active");
      const insecureContext = typeof window !== "undefined" && window.isSecureContext === false;
      const secureHint = insecureContext
        ? " Open with https:// or http://localhost to enable full access."
        : "";
      const warnings = [];
      if (locationError) warnings.push("location");
      if (mediaError) warnings.push("camera/mic");
      if (warnings.length) {
        setMessage(`SOS started, but ${warnings.join(" and ")} access is blocked.${secureHint}`);
      } else {
        setMessage("ok bee Brave Help is on the way");
      }
    } catch (err) {
      setStatus("idle");
      setMessage(err?.message || "Failed to start SOS");
      persistSession({ active: false, updatedAt: nowIso() });
      setSosActiveOwner(false);
      stopLocationWatch();
      cleanupMedia();
      stopHeartbeat();
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    }
  };

  const stopSos = async () => {
    if (status !== "active") return;
    setStatus("stopping");
    const stoppedAt = nowIso();
    stopLocationWatch();
    stopHeartbeat();
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);

    try {
      const blob = await stopRecorder();
      const durationMs = startedAt ? Math.max(0, Date.now() - new Date(startedAt).getTime()) : 0;

      let mediaUrl = null;
      if (alertId) {
        try {
          const form = new FormData();
          if (blob) form.append("media", blob, `sos-${alertId}.webm`);
          form.append("durationMs", String(durationMs));
          const res = await callEmergency("post", `${alertId}/stop`, form, {
            headers: { "Content-Type": "multipart/form-data" }
          });
          mediaUrl = res?.data?.mediaUrl || null;
          setBackendStatus("SOS stopped and synced");
        } catch (err) {
          setBackendStatus(`Stop sync failed: ${err?.response?.status || ""} ${err?.message || ""}`.trim());
        }
      }

      let usedLocalFallbackMedia = false;
      if (!mediaUrl && blob) {
        usedLocalFallbackMedia = true;
        try {
          // Persist locally so Recorded Live keeps working after refresh.
          // Use data URL when reasonably small; fallback to object URL for very large clips.
          if (blob.size <= 2.5 * 1024 * 1024) {
            mediaUrl = await blobToDataUrl(blob);
          } else {
            mediaUrl = URL.createObjectURL(blob);
          }
        } catch {
          try {
            mediaUrl = URL.createObjectURL(blob);
          } catch {
            mediaUrl = null;
          }
        }
      }

      appendHistory({
        alertId,
        startedAt,
        stoppedAt,
        elapsedSec,
        lastLocation,
        locationCount,
        recordingInfo,
        mediaUrl,
        localOnly:
          !alertId ||
          !String(mediaUrl || "").trim() ||
          usedLocalFallbackMedia ||
          String(mediaUrl || "").startsWith("blob:") ||
          String(mediaUrl || "").startsWith("data:")
      });
      const stoppedRecordingInfo = {
        ...recordingInfo,
        audio: false,
        video: false
      };
      writeJson(SOS_SESSION_KEY, {
        active: false,
        triggeredByCurrentBrowser: true,
        startedAt,
        stoppedAt,
        elapsedSec,
        alertId,
        alertDisplayId: alertDisplayId || (alertId ? String(alertId) : null),
        reporterUserId: String(localStorage.getItem("userId") || sessionStorage.getItem("userId") || "").trim() || undefined,
        lastLocation,
        locationCount,
        recordingInfo: stoppedRecordingInfo,
        backendStatus: "Stopped",
        updatedAt: stoppedAt
      });
      setSosActiveOwner(false);
      setStatus("stopped");
      setMessage("SOS stopped.");
      setRecordingInfo(stoppedRecordingInfo);
      setBackendStatus("Stopped");
      const stoppedId = String(alertId || alertDisplayId || "").trim();
      if (stoppedId) {
        postLiveRtcSignal({
          type: "rtc-stop",
          alertId: stoppedId,
          at: stoppedAt
        });
      }
      closeSenderRtcPeer();
      const clearPacket = {
        type: "frame-clear",
        alertId: stoppedId,
        at: stoppedAt
      };
      latestPreviewFrameRef.current = "";
      latestPreviewFrameAtRef.current = "";
      try {
        if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
          livePreviewChannelRef.current = new BroadcastChannel(SOS_LIVE_PREVIEW_CHANNEL);
        }
        livePreviewChannelRef.current?.postMessage(clearPacket);
      } catch {
        // ignore broadcast errors
      }
      try {
        localStorage.setItem(SOS_LIVE_PREVIEW_FRAME_KEY, JSON.stringify(clearPacket));
        if (stoppedId) {
          localStorage.setItem(liveFrameKeyFor(stoppedId), JSON.stringify(clearPacket));
        }
      } catch {
        // ignore storage errors
      }
      broadcastSosSignal("stopped", {
        alertId,
        reporterUserId: String(localStorage.getItem("userId") || sessionStorage.getItem("userId") || "").trim() || undefined
      });
    } finally {
      cleanupMedia();
    }
  };

  const onStartTap = () => {
    if (status === "arming" || status === "active") return;
    const now = Date.now();
    const prev = startTapRef.current;
    const count = now - prev.lastAt <= 2200 ? prev.count + 1 : 1;
    startTapRef.current = { count, lastAt: now };

    if (count === 1) {
      setMessage("Tap Start SOS 2 more times to confirm.");
      return;
    }
    if (count === 2) {
      setMessage("One more tap to start SOS.");
      return;
    }

    startTapRef.current = { count: 0, lastAt: 0 };
    startSos();
  };

  useEffect(() => {
    if (isLiveView || !alertId || status !== "active") return;
    sendHeartbeat();
    startHeartbeat();
    return () => stopHeartbeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveView, alertId, status, recordingInfo.audio, recordingInfo.video]);

  useEffect(() => {
    if (status !== "active" || isLiveView) return undefined;
    const timer = setInterval(() => {
      broadcastSosSignal("active", {
        alertId,
        reporterUserId: String(localStorage.getItem("userId") || sessionStorage.getItem("userId") || "").trim() || undefined,
        latitude: lastLocation?.latitude ?? null,
        longitude: lastLocation?.longitude ?? null,
        radiusMeters: RADIUS_METERS
      });
    }, LOCAL_SIGNAL_REBROADCAST_MS);
    return () => clearInterval(timer);
  }, [status, isLiveView, alertId, lastLocation?.latitude, lastLocation?.longitude]);

  useEffect(() => {
    if (isLiveView || status !== "active" || !recordingInfo.video) return undefined;
    const stream = mediaStreamRef.current;
    const initialPreviewNode = previewVideoRef.current;
    if (!stream && !initialPreviewNode) return undefined;

    try {
      if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
        livePreviewChannelRef.current = new BroadcastChannel(SOS_LIVE_PREVIEW_CHANNEL);
      }
    } catch {
      // Continue with localStorage fallback even if BroadcastChannel fails.
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return undefined;
    const videoTrack = stream?.getVideoTracks?.()?.[0] || null;
    const canUseImageCapture = typeof ImageCapture !== "undefined" && videoTrack;
    const imageCapture = canUseImageCapture ? new ImageCapture(videoTrack) : null;
    let frameBusy = false;
    const hiddenSource = document.createElement("video");
    hiddenSource.playsInline = true;
    hiddenSource.muted = true;
    if (stream) {
      hiddenSource.srcObject = stream;
      hiddenSource.play().catch(() => {});
    }

    const sendFrame = async () => {
      if (frameBusy) return;
      frameBusy = true;
      try {
        let source = null;
        let sourceWidth = 0;
        let sourceHeight = 0;
        let sourceBitmap = null;

        if (imageCapture) {
          try {
            sourceBitmap = await imageCapture.grabFrame();
            source = sourceBitmap;
            sourceWidth = sourceBitmap?.width || 0;
            sourceHeight = sourceBitmap?.height || 0;
          } catch {
            sourceBitmap = null;
          }
        }

        if (!source) {
          const previewNode = previewVideoRef.current;
          const activeSource =
            previewNode && (previewNode.videoWidth || 0) > 0 && (previewNode.videoHeight || 0) > 0
              ? previewNode
              : hiddenSource;
          source = activeSource;
          sourceWidth = activeSource.videoWidth || 0;
          sourceHeight = activeSource.videoHeight || 0;
        }

        if (!sourceWidth || !sourceHeight) return;

        const targetW = Math.min(320, sourceWidth);
        const targetH = Math.max(1, Math.round((targetW * sourceHeight) / sourceWidth));
        canvas.width = targetW;
        canvas.height = targetH;
        try {
          ctx.drawImage(source, 0, 0, targetW, targetH);
        } catch {
          return;
        } finally {
          if (sourceBitmap?.close) sourceBitmap.close();
        }

        let frame = "";
        try {
          frame = canvas.toDataURL("image/jpeg", 0.5);
        } catch {
          frame = "";
        }
        if (!frame) return;
        const activeId = String(alertId || alertDisplayId || "").trim();
        if (!activeId) return;
        const packet = {
          type: "frame",
          alertId: activeId,
          at: nowIso(),
          frame
        };
        latestPreviewFrameRef.current = frame;
        latestPreviewFrameAtRef.current = packet.at;
        try {
          livePreviewChannelRef.current?.postMessage(packet);
        } catch {
          // ignore broadcast errors
        }
        try {
          localStorage.setItem(SOS_LIVE_PREVIEW_FRAME_KEY, JSON.stringify(packet));
          localStorage.setItem(liveFrameKeyFor(activeId), JSON.stringify(packet));
        } catch {
          // ignore storage issues
        }
      } finally {
        frameBusy = false;
      }
    };

    const timer = setInterval(() => {
      void sendFrame();
    }, 400);
    return () => {
      clearInterval(timer);
      try {
        hiddenSource.pause();
        hiddenSource.srcObject = null;
      } catch {
        // ignore
      }
    };
  }, [isLiveView, status, recordingInfo.video, alertId, alertDisplayId]);

  useEffect(() => {
    if (isLiveView || status !== "active") {
      closeSenderRtcPeer();
      return undefined;
    }
    const stream = mediaStreamRef.current;
    const activeId = String(alertId || alertDisplayId || "").trim();
    if (!stream || !activeId) return undefined;

    let disposed = false;
    let onMessage = null;
    let onStorage = null;

    const startSenderPeer = async () => {
      try {
        try {
          if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
            livePreviewChannelRef.current = new BroadcastChannel(SOS_LIVE_PREVIEW_CHANNEL);
          }
        } catch {
          // ignore
        }
        const channel = livePreviewChannelRef.current;
        if (!channel) return;

        closeSenderRtcPeer();
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });
        senderRtcPeerRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        pc.onicecandidate = (event) => {
          if (!event?.candidate || disposed) return;
          postLiveRtcSignal({
            type: "rtc-candidate",
            from: "sender",
            alertId: activeId,
            at: nowIso(),
            candidate: event.candidate
          });
        };

        onMessage = async (event) => {
          if (disposed || senderRtcPeerRef.current !== pc) return;
          const data = event?.data || {};
          const type = String(data?.type || "");
          const incomingId = String(data?.alertId || "").trim();
          if (!incomingId || incomingId !== activeId) return;
          try {
            if (type === "rtc-answer" && data?.answer) {
              if (!pc.currentRemoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                setBackendStatus("Live stream connected");
              }
            } else if (type === "rtc-candidate" && data?.from === "viewer" && data?.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else if (type === "rtc-stop") {
              closeSenderRtcPeer();
            }
          } catch {
            // ignore rtc signaling errors
          }
        };
        channel.addEventListener("message", onMessage);
        const handler = (payload) => {
          void onMessage({ data: payload });
        };
        sosStompHandlerRef.current = handler;
        if (sosStompQueueRef.current.length) {
          const pending = sosStompQueueRef.current.splice(0);
          pending.forEach((item) => {
            try {
              handler(item);
            } catch {
              // ignore
            }
          });
        }
        onStorage = (event) => {
          if (event?.key !== SOS_LIVE_RTC_SIGNAL_KEY || !event?.newValue) return;
          try {
            const data = JSON.parse(event.newValue);
            void onMessage({ data });
          } catch {
            // ignore malformed payload
          }
        };
        window.addEventListener("storage", onStorage);

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await pc.setLocalDescription(offer);
        postLiveRtcSignal({
          type: "rtc-offer",
          from: "sender",
          alertId: activeId,
          at: nowIso(),
          offer
        });
        setBackendStatus("Live stream initializing...");
      } catch {
        setBackendStatus("Live stream signaling failed");
      }
    };

    void startSenderPeer();
    return () => {
      disposed = true;
      if (livePreviewChannelRef.current && onMessage) {
        livePreviewChannelRef.current.removeEventListener("message", onMessage);
      }
      sosStompHandlerRef.current = null;
      if (onStorage) {
        window.removeEventListener("storage", onStorage);
      }
      closeSenderRtcPeer();
    };
  }, [isLiveView, status, alertId, alertDisplayId, recordingInfo.audio, recordingInfo.video]);

  useEffect(() => {
    if (!isLiveView) return undefined;
    const routeId = normalizeAlertId(routeAlertId);
    if (!routeId) return undefined;
    hasMatchedLiveFrameRef.current = false;
    try {
      if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
        livePreviewChannelRef.current = new BroadcastChannel(SOS_LIVE_PREVIEW_CHANNEL);
      }
    } catch {
      // Continue with localStorage fallback even if BroadcastChannel fails.
    }
    const channel = livePreviewChannelRef.current;

    const onMessage = (event) => {
      const data = event?.data || {};
      const type = String(data?.type || "");
      if (type === "frame-clear") {
        const incomingId = normalizeAlertId(data?.alertId);
        if (!incomingId || !alertIdsMatch(incomingId, routeId)) return;
        hasMatchedLiveFrameRef.current = false;
        setLiveFrameUrl("");
        return;
      }
      if (type !== "frame") return;
      const incomingId = normalizeAlertId(data?.alertId);
      const frame = String(data?.frame || "");
      if (!frame) return;
      const exactMatch = incomingId && alertIdsMatch(incomingId, routeId);
      if (!exactMatch && hasMatchedLiveFrameRef.current) return;
      if (exactMatch) hasMatchedLiveFrameRef.current = true;
      lastFrameAtRef.current = Date.now();
      setLiveFrameUrl(frame);
      setBackendStatus("Live preview connected");
    };

    const readStorageFrame = () => {
      try {
        const raw =
          localStorage.getItem(liveFrameKeyFor(routeId)) ||
          localStorage.getItem(SOS_LIVE_PREVIEW_FRAME_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        const incomingId = normalizeAlertId(data?.alertId);
        const type = String(data?.type || "");
        if (type === "frame-clear") {
          if (!incomingId || !alertIdsMatch(incomingId, routeId)) return;
          hasMatchedLiveFrameRef.current = false;
          setLiveFrameUrl("");
          return;
        }
        const frame = String(data?.frame || "");
        if (!frame) return;
        const exactMatch = incomingId && alertIdsMatch(incomingId, routeId);
        if (!exactMatch && hasMatchedLiveFrameRef.current) return;
        if (exactMatch) hasMatchedLiveFrameRef.current = true;
        lastFrameAtRef.current = Date.now();
        setLiveFrameUrl(frame);
        setBackendStatus("Live preview connected");
      } catch {
        // ignore storage issues
      }
    };

    const onStorage = (event) => {
      const perAlertKey = liveFrameKeyFor(routeId);
      if (event?.key !== SOS_LIVE_PREVIEW_FRAME_KEY && event?.key !== perAlertKey) return;
      readStorageFrame();
    };

    if (channel) channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    const timer = setInterval(() => {
      readStorageFrame();
      if (lastFrameAtRef.current && Date.now() - lastFrameAtRef.current > 2200) {
        setLiveFrameUrl("");
      }
    }, 160);
    readStorageFrame();
    return () => {
      if (channel) channel.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      clearInterval(timer);
    };
  }, [isLiveView, routeAlertId]);

  useEffect(() => {
    const node = liveRemoteVideoRef.current;
    if (!isLiveView || !node) return undefined;
    if (!liveStreamAvailable) {
      try {
        node.pause();
        node.srcObject = null;
      } catch {
        // ignore
      }
      return undefined;
    }
    node.muted = true;
    node.autoplay = true;
    node.playsInline = true;
    node.play().catch(() => {});
    return undefined;
  }, [isLiveView, liveStreamAvailable]);

  useEffect(() => {
    if (!isLiveView) {
      closeViewerRtcPeer();
      return undefined;
    }
    const routeId = normalizeAlertId(routeAlertId);
    if (!routeId) return undefined;

    let disposed = false;
    let onMessage = null;

    const ensureViewerPeer = () => {
      if (viewerRtcPeerRef.current) return viewerRtcPeerRef.current;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      viewerRtcPeerRef.current = pc;
      pc.ontrack = (event) => {
        const remoteStream = event?.streams?.[0];
        const node = liveRemoteVideoRef.current;
        if (remoteStream && node) {
          node.srcObject = remoteStream;
          node.muted = true;
          node.autoplay = true;
          node.playsInline = true;
          node.play().catch(() => {});
          setLiveStreamAvailable(true);
          setBackendStatus("Live stream connected");
        }
      };
      pc.onicecandidate = (event) => {
        if (!event?.candidate || disposed) return;
        postLiveRtcSignal({
          type: "rtc-candidate",
          from: "viewer",
          alertId: routeId,
          at: nowIso(),
          candidate: event.candidate
        });
      };
      pc.onconnectionstatechange = () => {
        const state = String(pc.connectionState || "");
        if (state === "failed" || state === "closed" || state === "disconnected") {
          setLiveStreamAvailable(false);
        }
      };
      return pc;
    };

    const handleRtcPacket = async (data) => {
      if (disposed) return;
      const type = String(data?.type || "");
      const incomingId = normalizeAlertId(data?.alertId);
      if (!incomingId || !alertIdsMatch(incomingId, routeId)) return;
      try {
        if (type === "rtc-stop") {
          closeViewerRtcPeer();
          setLiveFrameUrl("");
          return;
        }
        if (type === "rtc-offer" && data?.offer) {
          closeViewerRtcPeer();
          const pc = ensureViewerPeer();
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          postLiveRtcSignal({
            type: "rtc-answer",
            from: "viewer",
            alertId: routeId,
            at: nowIso(),
            answer
          });
          return;
        }
        if (type === "rtc-candidate" && data?.from === "sender" && data?.candidate) {
          const pc = ensureViewerPeer();
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch {
        // ignore rtc errors, fallback preview still available
      }
    };

    const startViewer = () => {
      try {
        if (!livePreviewChannelRef.current && typeof BroadcastChannel !== "undefined") {
          livePreviewChannelRef.current = new BroadcastChannel(SOS_LIVE_PREVIEW_CHANNEL);
        }
      } catch {
        // ignore
      }
      const channel = livePreviewChannelRef.current;
      onMessage = (event) => {
        void handleRtcPacket(event?.data || {});
      };
      const handler = (payload) => {
        void handleRtcPacket(payload);
      };
      sosStompHandlerRef.current = handler;
      if (sosStompQueueRef.current.length) {
        const pending = sosStompQueueRef.current.splice(0);
        pending.forEach((item) => {
          try {
            handler(item);
          } catch {
            // ignore
          }
        });
      }
      if (channel) channel.addEventListener("message", onMessage);
      const readStoredSignal = () => {
        try {
          const raw = localStorage.getItem(SOS_LIVE_RTC_SIGNAL_KEY);
          if (!raw) return;
          const payload = JSON.parse(raw);
          void handleRtcPacket(payload);
        } catch {
          // ignore malformed payload
        }
      };
      const onStorage = (event) => {
        if (event?.key !== SOS_LIVE_RTC_SIGNAL_KEY || !event?.newValue) return;
        try {
          const payload = JSON.parse(event.newValue);
          void handleRtcPacket(payload);
        } catch {
          // ignore malformed payload
        }
      };
      window.addEventListener("storage", onStorage);
      const timer = setInterval(readStoredSignal, 350);
      readStoredSignal();
      return () => {
        if (channel && onMessage) channel.removeEventListener("message", onMessage);
        sosStompHandlerRef.current = null;
        window.removeEventListener("storage", onStorage);
        clearInterval(timer);
      };
    };

    const cleanupSignal = startViewer();
    return () => {
      disposed = true;
      cleanupSignal?.();
      closeViewerRtcPeer();
    };
  }, [isLiveView, routeAlertId]);

  useEffect(() => {
    const previewEl = previewVideoRef.current;
    if (!previewEl) return undefined;

    const stream = mediaStreamRef.current;
    const canPreview =
      !isLiveView &&
      (status === "arming" || status === "active" || status === "stopping") &&
      recordingInfo.video &&
      stream;

    if (canPreview) {
      previewEl.srcObject = stream;
      previewEl.muted = true;
      previewEl.play().catch(() => {});
    } else if (previewEl.srcObject) {
      previewEl.pause();
      previewEl.srcObject = null;
    }

    return () => {
      if (previewEl.srcObject && previewEl.srcObject !== mediaStreamRef.current) {
        previewEl.pause();
        previewEl.srcObject = null;
      }
    };
  }, [isLiveView, status, recordingInfo.video]);

  useEffect(() => {
    if (!routeAlertId) return;
    let cancelled = false;
    let lastCoordKey = "";
    const poll = async () => {
      try {
        let res = null;
        let usedAssist = false;
        try {
          res = await callEmergency("get", `${routeAlertId}/assist`);
          usedAssist = true;
        } catch {
          res = await callEmergency("get", `${routeAlertId}`);
        }
        if (cancelled) return;
        const data = res?.data || {};
        const lat = data.latitude != null ? data.latitude : null;
        const lon = data.longitude != null ? data.longitude : null;
        const coordKey = lat != null && lon != null ? `${lat},${lon}` : "";
        setAlertId(data.alertId || Number(routeAlertId));
        setAlertDisplayId(String(data.alertId || routeAlertId || ""));
        setStatus(data.active ? "active" : "stopped");
        setStartedAt(data.startedAt || null);
        setLastLocation(
          lat != null && lon != null
            ? { latitude: lat, longitude: lon, accuracy: null, at: data.lastHeartbeatAt || nowIso() }
            : null
        );
        if (coordKey && coordKey !== lastCoordKey) {
          lastCoordKey = coordKey;
          setLocationCount((prev) => prev + 1);
        }
        setRecordingInfo((prev) => ({
          ...prev,
          audio: usedAssist ? Boolean(data.active) : Boolean(data.audioActive),
          video: usedAssist ? Boolean(data.active) : Boolean(data.videoActive)
        }));
        const backendFrame = String(
          data.previewFrame || data.liveFrame || data.frame || data.lastPreviewFrame || data.lastFrame || ""
        ).trim();
        if (backendFrame) {
          lastFrameAtRef.current = Date.now();
          setLiveFrameUrl(backendFrame);
          if (isLiveView) {
            setBackendStatus("Live preview connected");
          }
        }
        if (!backendFrame && Date.now() - lastFrameAtRef.current > 2000) {
          await fetchPreviewFrame(routeAlertId);
        }
        setBackendStatus(
          data.active
            ? usedAssist
              ? "Live location active"
              : "Live connection active"
            : "Session stopped"
        );
      } catch (err) {
        if (!cancelled) {
          setBackendStatus(`Live status failed: ${err?.response?.status || ""}`);
          if (Date.now() - lastFrameAtRef.current > 2000) {
            await fetchPreviewFrame(routeAlertId);
          }
        }
      }
    };
    poll();
    const timer = setInterval(poll, isLiveView ? 800 : HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [routeAlertId, isLiveView]);

  useEffect(() => {
    if (session?.active && !isLiveView) {
      setStatus("active");
      setStartedAt(session.startedAt || null);
      setAlertId(session.alertId || null);
      setAlertDisplayId(session.alertDisplayId || (session.alertId ? String(session.alertId) : null));
      setLastLocation(session.lastLocation || null);
      setLocationCount(session.locationCount || 0);
      setRecordingInfo(session.recordingInfo || { audio: false, video: false, chunks: 0, bytes: 0 });
      setBackendStatus(session.backendStatus || "Local SOS active");
      if (session.startedAt) {
        const sec = Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
        setElapsedSec(sec);
      }
    }
  }, [isLiveView, session]);

  useEffect(() => {
    if (isLiveView) return undefined;
    const q = new URLSearchParams(location.search);
    if (q.get("arm") === "1") {
      startSos();
      q.delete("arm");
      const nextSearch = q.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : ""
        },
        { replace: true }
      );
    }
    return () => {
      if (sosSignalChannelRef.current) {
        sosSignalChannelRef.current.close();
        sosSignalChannelRef.current = null;
      }
      if (livePreviewChannelRef.current) {
        livePreviewChannelRef.current.close();
        livePreviewChannelRef.current = null;
      }
      closeSenderRtcPeer();
      closeViewerRtcPeer();
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      stopHeartbeat();
      stopLocationWatch();
      cleanupMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiveView]);

  return (
    <section className="sos-page">
      <div className="sos-card">
        <header className="sos-head">
          <h1>{isLiveView ? "SOS Live Connection" : "SOS Control Center"}</h1>
          <button type="button" onClick={() => navigate(-1)}>Back</button>
        </header>

        <div className={`sos-status ${status}`}>
          Status: <strong>{status.toUpperCase()}</strong>
        </div>

        {message && <div className="sos-msg">{message}</div>}

        <div className="sos-grid">
          <div>
            <h3>Location</h3>
            <p>Latitude: {lastLocation?.latitude ?? "-"}</p>
            <p>Longitude: {lastLocation?.longitude ?? "-"}</p>
            <p>Accuracy: {lastLocation?.accuracy ? `${Math.round(lastLocation.accuracy)} m` : "-"}</p>
            <p>Updates: {locationCount}</p>
          </div>
          <div>
            <h3>Live Audio/Video</h3>
            <p>Audio: {recordingInfo.audio ? "Live" : "Off"}</p>
            <p>Video: {recordingInfo.video ? "Live" : "Off"}</p>
            <p>Camera: {cameraFacing === "user" ? "Front" : "Back"}</p>
            <p>Chunks: {recordingInfo.chunks}</p>
            <p>Bytes: {recordingInfo.bytes}</p>
          </div>
        </div>

        <div className="sos-meta">
          <p>Started At: {startedAt || "-"}</p>
          <p>Elapsed: {elapsedSec}s</p>
          <p>Alert Id: {alertDisplayId || alertId || "-"}</p>
          <p>Radius: {RADIUS_METERS / 1000} km</p>
          <p>Backend: {backendStatus}</p>
        </div>

        <div className="sos-preview-card">
          <h3>Live Camera Preview</h3>
          <div className="sos-preview-shell">
            {isLiveView && (
              <video
                ref={liveRemoteVideoRef}
                className="sos-preview-video"
                playsInline
                autoPlay
                muted
                controls
                style={{ display: liveStreamAvailable ? "block" : "none" }}
                onClick={() => {
                  const node = liveRemoteVideoRef.current;
                  if (!node) return;
                  try {
                    node.muted = false;
                    node.play().catch(() => {});
                  } catch {
                    // ignore
                  }
                }}
              />
            )}
            {isLiveView && !liveStreamAvailable && !!liveFrameUrl && (
              <img src={liveFrameUrl} alt="Live SOS preview" className="sos-preview-video" />
            )}
            {!isLiveView && <video ref={previewVideoRef} className="sos-preview-video" playsInline muted />}
            {!isLiveView && !(recordingInfo.video && (status === "arming" || status === "active" || status === "stopping")) && (
              <div className="sos-preview-empty">Camera preview will appear when SOS recording starts.</div>
            )}
            {isLiveView && !liveStreamAvailable && !liveFrameUrl && (
              <div className="sos-preview-empty">Waiting for live preview from SOS sender tab...</div>
            )}
          </div>
        </div>

        {!isLiveView && (
          <div className="sos-actions">
            <button
              type="button"
              className="sos-camera-toggle"
              onClick={toggleCameraFacing}
              disabled={status === "arming" || status === "active"}
            >
              {cameraFacing === "user" ? "Switch to Back Camera" : "Switch to Front Camera"}
            </button>
            <button type="button" className="sos-start" onClick={onStartTap} disabled={status === "arming" || status === "active"}>
              Start SOS
            </button>
            <button type="button" className="sos-stop" onClick={stopSos} disabled={status !== "active"}>
              Stop SOS
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

