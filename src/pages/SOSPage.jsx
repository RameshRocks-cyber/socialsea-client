import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import "./SOSPage.css";

const SOS_SESSION_KEY = "socialsea_sos_session_v1";
const SOS_HISTORY_KEY = "socialsea_sos_history_v1";
const HEARTBEAT_MS = 5000;
const RADIUS_METERS = 5000;

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

const nowIso = () => new Date().toISOString();

export default function SOSPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { alertId: routeAlertId } = useParams();
  const isLiveView = Boolean(routeAlertId);

  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [alertId, setAlertId] = useState(routeAlertId ? Number(routeAlertId) : null);
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

  const watchIdRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const tickTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const startTapRef = useRef({ count: 0, lastAt: 0 });
  const previewVideoRef = useRef(null);

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

  const sendHeartbeat = async (forcedLocation) => {
    if (!alertId) return;
    try {
      const payload = {
        latitude: forcedLocation?.latitude ?? lastLocation?.latitude ?? null,
        longitude: forcedLocation?.longitude ?? lastLocation?.longitude ?? null,
        audioActive: recordingInfo.audio,
        videoActive: recordingInfo.video
      };
      await api.post(`/api/emergency/${alertId}/heartbeat`, payload);
      setBackendStatus("Live connection active");
      persistSession({ backendStatus: "Live connection active", updatedAt: nowIso() });
    } catch (err) {
      setBackendStatus(`Heartbeat issue: ${err?.response?.status || ""} ${err?.message || ""}`.trim());
    }
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

  const startRecorder = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("Recording is not supported in this browser");
      return { audio: false, video: false };
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
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
      const pos = await getLocationOnce();
      const startIso = nowIso();
      const initialLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: startIso
      };

      setStartedAt(startIso);
      setLastLocation(initialLocation);
      setLocationCount(1);
      setElapsedSec(0);
      persistSession({
        active: true,
        startedAt: startIso,
        elapsedSec: 0,
        lastLocation: initialLocation,
        locationCount: 1,
        alertId: null,
        backendStatus: "Sending trigger...",
        updatedAt: startIso
      });

      startTicker(startIso);
      startLocationWatch();
      const media = await startRecorder();

      try {
        const res = await api.post("/api/emergency/trigger", {
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          accuracyMeters: initialLocation.accuracy,
          radiusMeters: RADIUS_METERS,
          frontCameraEnabled: media.video,
          backCameraEnabled: false,
          audioActive: media.audio,
          videoActive: media.video
        });
        const id = res?.data?.alertId || null;
        setAlertId(id);
        setBackendStatus("SOS sent to backend (5km)");
        persistSession({ alertId: id, backendStatus: "SOS sent to backend (5km)", updatedAt: nowIso() });
      } catch (err) {
        const backendMessage = err?.response?.status === 404
          ? "Backend emergency endpoint not found (404). Local SOS is still active."
          : `Backend error: ${err?.response?.status || ""} ${err?.message || ""}`.trim();
        setBackendStatus(backendMessage);
        persistSession({ backendStatus: backendMessage, updatedAt: nowIso() });
      }

      setStatus("active");
      setMessage("ok bee Brave Help is on the way");
    } catch (err) {
      setStatus("idle");
      setMessage(err?.message || "Failed to start SOS");
      persistSession({ active: false, updatedAt: nowIso() });
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
          const res = await api.post(`/api/emergency/${alertId}/stop`, form, {
            headers: { "Content-Type": "multipart/form-data" }
          });
          mediaUrl = res?.data?.mediaUrl || null;
          setBackendStatus("SOS stopped and synced");
        } catch (err) {
          setBackendStatus(`Stop sync failed: ${err?.response?.status || ""} ${err?.message || ""}`.trim());
        }
      }

      appendHistory({
        startedAt,
        stoppedAt,
        elapsedSec,
        lastLocation,
        locationCount,
        recordingInfo,
        mediaUrl
      });
      const stoppedRecordingInfo = {
        ...recordingInfo,
        audio: false,
        video: false
      };
      writeJson(SOS_SESSION_KEY, {
        active: false,
        startedAt,
        stoppedAt,
        elapsedSec,
        alertId,
        lastLocation,
        locationCount,
        recordingInfo: stoppedRecordingInfo,
        backendStatus: "Stopped",
        updatedAt: stoppedAt
      });
      setStatus("stopped");
      setMessage("SOS stopped.");
      setRecordingInfo(stoppedRecordingInfo);
      setBackendStatus("Stopped");
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
    if (!alertId || status !== "active") return;
    sendHeartbeat();
    startHeartbeat();
    return () => stopHeartbeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId, status, recordingInfo.audio, recordingInfo.video]);

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
    const poll = async () => {
      try {
        const res = await api.get(`/api/emergency/${routeAlertId}`);
        if (cancelled) return;
        const data = res?.data || {};
        setAlertId(data.alertId || Number(routeAlertId));
        setStatus(data.active ? "active" : "stopped");
        setStartedAt(data.startedAt || null);
        setLastLocation(
          data.latitude != null && data.longitude != null
            ? { latitude: data.latitude, longitude: data.longitude, accuracy: null, at: data.lastHeartbeatAt || nowIso() }
            : null
        );
        setRecordingInfo((prev) => ({
          ...prev,
          audio: Boolean(data.audioActive),
          video: Boolean(data.videoActive)
        }));
        setBackendStatus(data.active ? "Live connection active" : "Session stopped");
      } catch (err) {
        if (!cancelled) setBackendStatus(`Live status failed: ${err?.response?.status || ""}`);
      }
    };
    poll();
    const timer = setInterval(poll, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [routeAlertId]);

  useEffect(() => {
    if (session?.active && !isLiveView) {
      setStatus("active");
      setStartedAt(session.startedAt || null);
      setAlertId(session.alertId || null);
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
            <p>Chunks: {recordingInfo.chunks}</p>
            <p>Bytes: {recordingInfo.bytes}</p>
          </div>
        </div>

        <div className="sos-meta">
          <p>Started At: {startedAt || "-"}</p>
          <p>Elapsed: {elapsedSec}s</p>
          <p>Alert Id: {alertId || "-"}</p>
          <p>Radius: {RADIUS_METERS / 1000} km</p>
          <p>Backend: {backendStatus}</p>
        </div>

        <div className="sos-preview-card">
          <h3>Live Camera Preview</h3>
          <div className="sos-preview-shell">
            <video ref={previewVideoRef} className="sos-preview-video" playsInline muted />
            {!(recordingInfo.video && (status === "arming" || status === "active" || status === "stopping")) && (
              <div className="sos-preview-empty">Camera preview will appear when SOS recording starts.</div>
            )}
          </div>
        </div>

        {!isLiveView && (
          <div className="sos-actions">
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
