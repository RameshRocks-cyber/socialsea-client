import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearLiveBroadcast, readLiveBroadcast, subscribeLiveBroadcast, writeLiveBroadcast } from "../utils/liveBroadcast";
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

export default function LiveStart() {
  const navigate = useNavigate();
  const [liveState, setLiveState] = useState(() => readLiveBroadcast());
  const [title, setTitle] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [filterKey, setFilterKey] = useState("normal");
  const [languageKey, setLanguageKey] = useState("en");
  const [viewerLanguage, setViewerLanguage] = useState(() => localStorage.getItem("live_view_language") || "en");
  const [translateEnabled, setTranslateEnabled] = useState(() => localStorage.getItem("live_translate_on") === "1");
  const [viewerNotice, setViewerNotice] = useState("");
  const [mediaError, setMediaError] = useState("");
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeLiveBroadcast((next) => setLiveState(next));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      stopAllStreams();
    };
  }, []);

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

  const stopStream = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  };

  const stopAllStreams = () => {
    stopStream(cameraStreamRef.current);
    stopStream(screenStreamRef.current);
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

  const ensureCameraPreview = async () => {
    setMediaError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true
      });
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
    setAudioEnabled(next);
  };

  const toggleVideo = () => {
    const stream = screenSharing ? screenStreamRef.current : cameraStreamRef.current;
    if (!stream) return;
    const next = !videoEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setVideoEnabled(next);
  };

  const startScreenShare = async () => {
    setMediaError("");
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
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
    stopAllStreams();
    applyStreamToVideo(null);
    setPreviewReady(false);
    setScreenSharing(false);
  };

  const activeFilter = useMemo(
    () => FILTER_OPTIONS.find((item) => item.key === filterKey) || FILTER_OPTIONS[0],
    [filterKey]
  );

  const startLive = () => {
    const now = Date.now();
    writeLiveBroadcast({
      id: now,
      title: title.trim() || `Live with ${hostName}`,
      hostName,
      language: languageKey,
      filter: filterKey,
      screenSharing,
      startedAt: now,
      expiresAt: now + 2 * 60 * 60 * 1000,
      active: true
    });
  };

  const endLive = () => clearLiveBroadcast();

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

  return (
    <section className="live-start-page">
      <div className="live-start-card">
        <h1>Live Studio</h1>
        {previewReady && (
          <div className="live-start-preview">
            <video
              ref={videoRef}
              className="live-start-video"
              style={{ filter: activeFilter.css }}
              muted
              playsInline
            />
            {!videoEnabled && (
              <div className="live-start-preview-empty">
                <p>Camera is off</p>
              </div>
            )}
          </div>
        )}

        {mediaError && <p className="live-start-error">{mediaError}</p>}

        <div className="live-start-controls">
          <button type="button" onClick={ensureCameraPreview}>
            {previewReady && !screenSharing ? "Refresh Camera" : "Enable Camera"}
          </button>
          <button type="button" onClick={toggleAudio} disabled={!previewReady}>
            {audioEnabled ? "Mute Mic" : "Unmute Mic"}
          </button>
          <button type="button" onClick={toggleVideo} disabled={!previewReady}>
            {videoEnabled ? "Camera Off" : "Camera On"}
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

        {liveState && (
          <div className="live-viewer-panel">
            <h3>Viewer Audio Language</h3>
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
      </div>
    </section>
  );
}
