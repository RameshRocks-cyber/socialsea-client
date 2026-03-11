import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import "./Upload.css";

const POST_GENRE_MAP_KEY = "socialsea_post_genre_map_v1";
const MAX_UPLOAD_FILE_SIZE_BYTES = 80 * 1024 * 1024;

const ASPECT_OPTIONS = [
  { label: "Original", value: "orig" },
  { label: "1:1", value: "1:1" },
  { label: "4:5", value: "4:5" },
  { label: "16:9", value: "16:9" }
];

const defaultEdits = {
  aspect: "orig",
  preset: "custom",
  zoom: 1,
  rotate: 0,
  flipH: false,
  flipV: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  blur: 0,
  grayscale: 0,
  panX: 0,
  panY: 0
};

const PRESETS = {
  custom: { label: "Custom" },
  vibrant: { label: "Vibrant", brightness: 104, contrast: 108, saturation: 130, warmth: 8, blur: 0, grayscale: 0 },
  vintage: { label: "Vintage", brightness: 96, contrast: 92, saturation: 85, warmth: 22, blur: 0, grayscale: 8 },
  mono: { label: "Mono", brightness: 102, contrast: 115, saturation: 0, warmth: 0, blur: 0, grayscale: 100 },
  soft: { label: "Soft", brightness: 106, contrast: 94, saturation: 92, warmth: 10, blur: 1, grayscale: 0 }
};

const VIDEO_TOOL_OPTIONS = [
  { key: "edit", label: "Edit", symbol: "✂" },
  { key: "add-clips", label: "Add clips", symbol: "+" },
  { key: "audio", label: "Audio", symbol: "♪" },
  { key: "text", label: "Text", symbol: "Aa" },
  { key: "overlay", label: "Overlay", symbol: "◫" },
  { key: "stickers", label: "Stickers", symbol: "★" },
  { key: "captions", label: "Captions", symbol: "CC" },
  { key: "voiceover", label: "Voiceover", symbol: "◉" },
  { key: "filters", label: "Filters", symbol: "◎" },
  { key: "import-audio", label: "Import audio", symbol: "♫" }
];

function parseUploadError(err) {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
    try {
      return JSON.stringify(data);
    } catch {
      return "Upload failed";
    }
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return "Upload failed";
}

const sanitizeCreatorSettings = (settings) => {
  const next = { ...(settings || {}) };
  if (!String(next.scheduleAt || "").trim()) {
    delete next.scheduleAt;
  }
  return next;
};

export default function Upload() {
  const videoRef = useRef(null);
  const [file, setFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState(defaultEdits);
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [videoMeta, setVideoMeta] = useState({ duration: 0, width: 0, height: 0 });
  const [videoEdits, setVideoEdits] = useState({
    trimStart: 0,
    trimEnd: 0,
    playbackSpeed: 1,
    volume: 100,
    muted: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    filterPreset: "normal",
    overlayText: "",
    overlayOpacity: 70,
    overlayMode: "screen",
    sticker: "none",
    captionsStyle: "classic",
    voiceoverGain: 100,
    importedAudioName: "",
    extraClipCount: 0,
    qualityTarget: "1080p",
    coverMode: "auto"
  });
  const [activeVideoTool, setActiveVideoTool] = useState("edit");
  const [extraClips, setExtraClips] = useState([]);
  const [creatorSettings, setCreatorSettings] = useState({
    audience: "public",
    allowComments: true,
    allowRemix: true,
    allowDownload: false,
    autoCaptions: true,
    ageRestriction: "all",
    category: "general",
    scheduleAt: ""
  });

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isImage = useMemo(() => !!file?.type?.startsWith("image/"), [file]);
  const isVideo = useMemo(() => !!file?.type?.startsWith("video/"), [file]);
  const trimEndMax = Math.max(videoMeta.duration, 0);
  const trimStartMax = Math.max(0, (videoEdits.trimEnd || videoMeta.duration || 0) - 0.2);

  const aspectValue = useMemo(() => {
    switch (edits.aspect) {
      case "1:1":
        return "1 / 1";
      case "4:5":
        return "4 / 5";
      case "16:9":
        return "16 / 9";
      default:
        return "auto";
    }
  }, [edits.aspect]);

  const filterStyle = useMemo(() => {
    const warmSepia = Math.max(0, edits.warmth);
    const warmHueRotate = -Math.round(edits.warmth / 2);
    return `brightness(${edits.brightness}%) contrast(${edits.contrast}%) saturate(${edits.saturation}%) sepia(${warmSepia}%) hue-rotate(${warmHueRotate}deg) blur(${edits.blur}px) grayscale(${edits.grayscale}%)`;
  }, [edits]);

  const resetEdits = () => setEdits(defaultEdits);

  const setEdit = (key, value) => setEdits((prev) => ({ ...prev, [key]: value, preset: "custom" }));
  const setVideoEdit = (key, value) => setVideoEdits((prev) => ({ ...prev, [key]: value }));
  const setCreatorSetting = (key, value) => setCreatorSettings((prev) => ({ ...prev, [key]: value }));

  const videoFilterStyle = useMemo(() => {
    const presetTuning = {
      normal: { b: 1, c: 1, s: 1 },
      cinematic: { b: 0.96, c: 1.18, s: 0.9 },
      vivid: { b: 1.05, c: 1.08, s: 1.24 },
      mono: { b: 1, c: 1.1, s: 0.01 },
      vintage: { b: 1.04, c: 0.94, s: 0.84 }
    };
    const tuning = presetTuning[videoEdits.filterPreset] || presetTuning.normal;
    return `brightness(${Math.round(videoEdits.brightness * tuning.b)}%) contrast(${Math.round(videoEdits.contrast * tuning.c)}%) saturate(${Math.round(videoEdits.saturation * tuning.s)}%)`;
  }, [videoEdits]);

  const videoTrimSummary = useMemo(() => {
    const start = Number(videoEdits.trimStart || 0);
    const end = Number(videoEdits.trimEnd || 0);
    const duration = Number(videoMeta.duration || 0);
    const safeEnd = end > 0 ? end : duration;
    const clipLen = Math.max(0, safeEnd - start);
    return {
      start: start.toFixed(1),
      end: safeEnd.toFixed(1),
      clipLen: clipLen.toFixed(1)
    };
  }, [videoEdits, videoMeta]);

  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = Number(videoEdits.playbackSpeed || 1);
    video.volume = Math.max(0, Math.min(1, Number(videoEdits.volume || 0) / 100));
    video.muted = !!videoEdits.muted;
  }, [isVideo, videoEdits.playbackSpeed, videoEdits.volume, videoEdits.muted]);

  const applyPreset = (key) => {
    const preset = PRESETS[key];
    if (!preset) return;
    if (key === "custom") {
      setEdits((prev) => ({ ...prev, preset: "custom" }));
      return;
    }
    setEdits((prev) => ({
      ...prev,
      preset: key,
      brightness: preset.brightness ?? prev.brightness,
      contrast: preset.contrast ?? prev.contrast,
      saturation: preset.saturation ?? prev.saturation,
      warmth: preset.warmth ?? prev.warmth,
      blur: preset.blur ?? prev.blur,
      grayscale: preset.grayscale ?? prev.grayscale
    }));
  };

  const processImage = async (sourceFile) => {
    const bitmap = await createImageBitmap(sourceFile);
    const [aw, ah] = (() => {
      if (edits.aspect === "1:1") return [1, 1];
      if (edits.aspect === "4:5") return [4, 5];
      if (edits.aspect === "16:9") return [16, 9];
      return [bitmap.width, bitmap.height];
    })();

    const longEdge = 1080;
    const canvasWidth =
      edits.aspect === "orig"
        ? Math.min(longEdge, bitmap.width)
        : aw >= ah
          ? longEdge
          : Math.round((longEdge * aw) / ah);
    const canvasHeight =
      edits.aspect === "orig"
        ? Math.min(longEdge, bitmap.height)
        : aw >= ah
          ? Math.round((longEdge * ah) / aw)
          : longEdge;

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return sourceFile;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const coverScale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const drawW = bitmap.width * coverScale * edits.zoom;
    const drawH = bitmap.height * coverScale * edits.zoom;
    const rad = (edits.rotate * Math.PI) / 180;

    ctx.save();
    ctx.translate(canvas.width / 2 + edits.panX, canvas.height / 2 + edits.panY);
    ctx.rotate(rad);
    ctx.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1);
    ctx.filter = filterStyle;
    ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return sourceFile;
    return new File([blob], `edited_${Date.now()}.jpg`, { type: "image/jpeg" });
  };

  const resetUploadForm = () => {
    setFile(null);
    setSelectedFiles([]);
    setActiveFileIndex(0);
    setCaption("");
    setEdits(defaultEdits);
    setVideoMeta({ duration: 0, width: 0, height: 0 });
    setActiveVideoTool("edit");
    setExtraClips([]);
    setVideoEdits({
      trimStart: 0,
      trimEnd: 0,
      playbackSpeed: 1,
      volume: 100,
      muted: false,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      filterPreset: "normal",
      overlayText: "",
      overlayOpacity: 70,
      overlayMode: "screen",
      sticker: "none",
      captionsStyle: "classic",
      voiceoverGain: 100,
      importedAudioName: "",
      extraClipCount: 0,
      qualityTarget: "1080p",
      coverMode: "auto"
    });
    setCreatorSettings({
      audience: "public",
      allowComments: true,
      allowRemix: true,
      allowDownload: false,
      autoCaptions: true,
      ageRestriction: "all",
      category: "general",
      scheduleAt: ""
    });
  };

  const upload = async () => {
    const filesToUpload = selectedFiles.length ? selectedFiles : file ? [file] : [];
    if (!filesToUpload.length) {
      setMsg("File required");
      return;
    }

    try {
      setLoading(true);
      let successCount = 0;
      let failedCount = 0;
      const failedMessages = [];
      for (let i = 0; i < filesToUpload.length; i += 1) {
        const currentFile = filesToUpload[i];
        if (Number(currentFile?.size || 0) > MAX_UPLOAD_FILE_SIZE_BYTES) {
          failedCount += 1;
          failedMessages.push(`${currentFile?.name || "file"} is too large (max 80MB).`);
          continue;
        }
        const currentIsImage = !!currentFile?.type?.startsWith("image/");
        const currentIsVideo = !!currentFile?.type?.startsWith("video/");
        const shouldApplyImageEdit = filesToUpload.length === 1 && currentIsImage && file && currentFile === file;

        const form = new FormData();
        const uploadFile = shouldApplyImageEdit ? await processImage(currentFile) : currentFile;
        form.append("file", uploadFile);
        if (caption?.trim()) form.append("caption", caption.trim());
        if (currentIsVideo) {
          const safeCreatorSettings = sanitizeCreatorSettings(creatorSettings);
          form.append(
            "videoSettings",
            JSON.stringify({
              edits: videoEdits,
              creatorSettings: safeCreatorSettings
            })
          );
        }

        try {
          let res = null;
          try {
            res = await api.post("/api/posts/upload", form, {
              headers: { "Content-Type": "multipart/form-data" }
            });
          } catch (firstErr) {
            const status = Number(firstErr?.response?.status || 0);
            // Some backend variants fail on extra multipart fields; retry with strict file-only payload.
            if (status >= 500) {
              const fallbackForm = new FormData();
              fallbackForm.append("file", uploadFile);
              res = await api.post("/api/posts/upload", fallbackForm, {
                headers: { "Content-Type": "multipart/form-data" }
              });
            } else {
              throw firstErr;
            }
          }
          if (!res) throw new Error("Upload failed");
          successCount += 1;
          try {
            const createdId = String(res?.data?.id || res?.data?.postId || "").trim();
            const selectedGenre = String(creatorSettings.category || "").trim().toLowerCase();
            if (createdId && selectedGenre) {
              const raw = localStorage.getItem(POST_GENRE_MAP_KEY);
              const parsed = raw ? JSON.parse(raw) : {};
              const next = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
              next[createdId] = selectedGenre;
              localStorage.setItem(POST_GENRE_MAP_KEY, JSON.stringify(next));
            }
          } catch {
            // ignore local genre cache errors
          }
        } catch (itemErr) {
          const status = Number(itemErr?.response?.status || 0);
          if (status >= 500 && currentFile?.size > 60 * 1024 * 1024) {
            setMsg("Upload failed: video may be too large for backend limit. Try a smaller file.");
          }
          const itemReason = parseUploadError(itemErr);
          failedMessages.push(
            `${currentFile?.name || `File ${i + 1}`}: ${status ? `(${status}) ` : ""}${itemReason}`
          );
          failedCount += 1;
        }
      }
      if (successCount > 0 && failedCount === 0) setMsg(`${successCount} post(s) uploaded successfully`);
      else if (successCount > 0 && failedCount > 0) {
        const details = failedMessages[0] ? ` First error: ${failedMessages[0]}` : "";
        setMsg(`${successCount} uploaded, ${failedCount} failed.${details}`);
      } else {
        setMsg(failedMessages[0] || "Upload failed");
      }
      if (successCount > 0) resetUploadForm();
    } catch (err) {
      console.error(err);
      setMsg(parseUploadError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      <section className="upload-panel">
        <h2>Create Post</h2>
        <p className="upload-subtitle">Edit before posting like Instagram.</p>

        <label className="upload-file-pick">
          Choose photo/video
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => {
              const nextFiles = Array.from(e.target.files || []);
              setSelectedFiles(nextFiles);
              setActiveFileIndex(0);
              setFile(nextFiles[0] || null);
              setMsg("");
              setEdits(defaultEdits);
              setActiveVideoTool("edit");
              setExtraClips([]);
              setVideoMeta({ duration: 0, width: 0, height: 0 });
            }}
          />
        </label>
        {selectedFiles.length > 1 && (
          <>
            <p className="video-note">
              {selectedFiles.length} files selected. Clicking upload will create {selectedFiles.length} posts.
            </p>
            <div className="upload-selected-list" role="list" aria-label="Selected files">
              {selectedFiles.map((selected, idx) => {
                const isVideoFile = String(selected?.type || "").startsWith("video/");
                const label = `${idx + 1}. ${selected?.name || "file"}`;
                return (
                  <button
                    key={`${selected.name}-${selected.size}-${idx}`}
                    type="button"
                    role="listitem"
                    className={`upload-selected-item ${activeFileIndex === idx ? "is-active" : ""}`}
                    onClick={() => {
                      setActiveFileIndex(idx);
                      setFile(selected);
                      setVideoMeta({ duration: 0, width: 0, height: 0 });
                    }}
                    title={label}
                  >
                    <span className="upload-selected-kind">{isVideoFile ? "Video" : "Image"}</span>
                    <span className="upload-selected-name">{label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <input
          className="upload-caption"
          placeholder="Write a caption..."
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        {previewUrl && (
          <div className="upload-preview-wrap">
            {isImage && (
              <div className="upload-preview-frame" style={{ aspectRatio: aspectValue }}>
                <img
                  src={previewUrl}
                  alt="preview"
                  className="upload-preview-media"
                  style={{
                    filter: previewOriginal ? "none" : filterStyle,
                    transform: `translate(${edits.panX}px, ${edits.panY}px) rotate(${edits.rotate}deg) scale(${edits.zoom}) scaleX(${edits.flipH ? -1 : 1}) scaleY(${edits.flipV ? -1 : 1})`
                  }}
                />
              </div>
            )}

            {isVideo && (
              <div className="upload-preview-video-wrap">
                <video
                  ref={videoRef}
                  src={previewUrl}
                  className="upload-preview-video"
                  controls
                  style={{ filter: videoFilterStyle }}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    const duration = Number(v.duration || 0);
                    setVideoMeta({
                      duration,
                      width: Number(v.videoWidth || 0),
                      height: Number(v.videoHeight || 0)
                    });
                    setVideoEdits((prev) => ({
                      ...prev,
                      trimStart: 0,
                      trimEnd: duration
                    }));
                  }}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    const trimStart = Number(videoEdits.trimStart || 0);
                    const trimEnd = Number(videoEdits.trimEnd || 0);
                    if (trimEnd > trimStart && v.currentTime > trimEnd) {
                      v.currentTime = trimStart;
                      v.play().catch(() => {});
                    }
                  }}
                />
                <p className="video-meta-line">
                  {videoMeta.width > 0 && videoMeta.height > 0
                    ? `${videoMeta.width}x${videoMeta.height}`
                    : "Video"}{" "}
                  | Duration: {Number(videoMeta.duration || 0).toFixed(1)}s
                </p>
              </div>
            )}
          </div>
        )}

        {isImage && (
          <div className="upload-tools">
            <div className="tool-row">
              <span>Presets</span>
              <div className="pill-group">
                {Object.entries(PRESETS).map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    className={edits.preset === key ? "active" : ""}
                    onClick={() => applyPreset(key)}
                  >
                    {value.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="tool-row">
              <span>Aspect</span>
              <div className="pill-group">
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={edits.aspect === opt.value ? "active" : ""}
                    onClick={() => setEdit("aspect", opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="tool-row">
              <span>Transform</span>
              <div className="pill-group">
                <button type="button" onClick={() => setEdit("rotate", (edits.rotate - 90 + 360) % 360)}>Rotate Left</button>
                <button type="button" onClick={() => setEdit("rotate", (edits.rotate + 90) % 360)}>Rotate Right</button>
                <button type="button" onClick={() => setEdit("flipH", !edits.flipH)}>Flip H</button>
                <button type="button" onClick={() => setEdit("flipV", !edits.flipV)}>Flip V</button>
              </div>
            </div>

            <div className="tool-row">
              <span>Preview</span>
              <div className="pill-group">
                <button
                  type="button"
                  onMouseDown={() => setPreviewOriginal(true)}
                  onMouseUp={() => setPreviewOriginal(false)}
                  onMouseLeave={() => setPreviewOriginal(false)}
                  onTouchStart={() => setPreviewOriginal(true)}
                  onTouchEnd={() => setPreviewOriginal(false)}
                >
                  Hold for Original
                </button>
              </div>
            </div>

            <div className="slider-grid">
              <label>Zoom <input type="range" min="1" max="2.2" step="0.01" value={edits.zoom} onChange={(e) => setEdit("zoom", Number(e.target.value))} /></label>
              <label>Brightness <input type="range" min="60" max="150" value={edits.brightness} onChange={(e) => setEdit("brightness", Number(e.target.value))} /></label>
              <label>Contrast <input type="range" min="70" max="150" value={edits.contrast} onChange={(e) => setEdit("contrast", Number(e.target.value))} /></label>
              <label>Saturation <input type="range" min="0" max="180" value={edits.saturation} onChange={(e) => setEdit("saturation", Number(e.target.value))} /></label>
              <label>Warmth <input type="range" min="0" max="50" value={edits.warmth} onChange={(e) => setEdit("warmth", Number(e.target.value))} /></label>
              <label>Blur <input type="range" min="0" max="4" step="0.1" value={edits.blur} onChange={(e) => setEdit("blur", Number(e.target.value))} /></label>
              <label>Grayscale <input type="range" min="0" max="100" value={edits.grayscale} onChange={(e) => setEdit("grayscale", Number(e.target.value))} /></label>
              <label>Pan X <input type="range" min="-140" max="140" value={edits.panX} onChange={(e) => setEdit("panX", Number(e.target.value))} /></label>
              <label>Pan Y <input type="range" min="-140" max="140" value={edits.panY} onChange={(e) => setEdit("panY", Number(e.target.value))} /></label>
            </div>

            <button type="button" className="reset-btn" onClick={resetEdits}>Reset Edits</button>
          </div>
        )}

        {isVideo && (
          <div className="upload-tools video-tools">
            <h3>Creator Video Studio</h3>

            <div className="video-action-bar">
              {VIDEO_TOOL_OPTIONS.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  className={activeVideoTool === tool.key ? "active" : ""}
                  onClick={() => setActiveVideoTool(tool.key)}
                  aria-label={tool.label}
                  title={tool.label}
                >
                  <span className="video-action-symbol">{tool.symbol}</span>
                </button>
              ))}
            </div>

            {activeVideoTool === "edit" && (
              <>
                <div className="tool-row">
                  <span>Trim</span>
                  <div className="slider-grid">
                    <label>
                      Start: {videoTrimSummary.start}s
                      <input
                        type="range"
                        min="0"
                        max={trimStartMax || 0}
                        step="0.1"
                        value={videoEdits.trimStart}
                        onChange={(e) => setVideoEdit("trimStart", Number(e.target.value))}
                      />
                    </label>
                    <label>
                      End: {videoTrimSummary.end}s
                      <input
                        type="range"
                        min={Math.min(videoEdits.trimStart + 0.2, trimEndMax || 0)}
                        max={trimEndMax || 0}
                        step="0.1"
                        value={videoEdits.trimEnd}
                        onChange={(e) => setVideoEdit("trimEnd", Number(e.target.value))}
                      />
                    </label>
                  </div>
                </div>

                <p className="video-note">Clip length: {videoTrimSummary.clipLen}s</p>

                <div className="tool-row">
                  <span>Playback</span>
                  <div className="pill-group">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        className={Number(videoEdits.playbackSpeed) === speed ? "active" : ""}
                        onClick={() => setVideoEdit("playbackSpeed", speed)}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="slider-grid">
                  <label>
                    Brightness
                    <input
                      type="range"
                      min="60"
                      max="150"
                      value={videoEdits.brightness}
                      onChange={(e) => setVideoEdit("brightness", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Contrast
                    <input
                      type="range"
                      min="70"
                      max="150"
                      value={videoEdits.contrast}
                      onChange={(e) => setVideoEdit("contrast", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Saturation
                    <input
                      type="range"
                      min="0"
                      max="180"
                      value={videoEdits.saturation}
                      onChange={(e) => setVideoEdit("saturation", Number(e.target.value))}
                    />
                  </label>
                </div>

                <div className="tool-row">
                  <span>Output</span>
                  <div className="pill-group">
                    {["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p"].map((q) => (
                      <button
                        key={q}
                        type="button"
                        className={videoEdits.qualityTarget === q ? "active" : ""}
                        onClick={() => setVideoEdit("qualityTarget", q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeVideoTool === "add-clips" && (
              <div className="video-tool-panel">
                <label className="upload-file-pick">
                  Add clips
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={(e) => {
                      const clips = Array.from(e.target.files || []);
                      setExtraClips(clips);
                      setVideoEdit("extraClipCount", clips.length);
                    }}
                  />
                </label>
                <p className="video-note">{extraClips.length} extra clip(s) selected.</p>
              </div>
            )}

            {activeVideoTool === "audio" && (
              <div className="video-tool-panel slider-grid">
                <label>
                  Volume: {videoEdits.volume}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={videoEdits.volume}
                    onChange={(e) => setVideoEdit("volume", Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>Audio Mode</span>
                  <button
                    type="button"
                    className={videoEdits.muted ? "toggle-btn active" : "toggle-btn"}
                    onClick={() => setVideoEdit("muted", !videoEdits.muted)}
                  >
                    {videoEdits.muted ? "Muted" : "Audio On"}
                  </button>
                </label>
              </div>
            )}

            {activeVideoTool === "text" && (
              <div className="video-tool-panel slider-grid">
                <label>
                  Overlay text
                  <input
                    type="text"
                    value={videoEdits.overlayText}
                    placeholder="Add text"
                    onChange={(e) => setVideoEdit("overlayText", e.target.value)}
                  />
                </label>
                <label>
                  Text opacity: {videoEdits.overlayOpacity}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={videoEdits.overlayOpacity}
                    onChange={(e) => setVideoEdit("overlayOpacity", Number(e.target.value))}
                  />
                </label>
              </div>
            )}

            {activeVideoTool === "overlay" && (
              <div className="video-tool-panel creator-settings-grid">
                <label>
                  Overlay blend
                  <select
                    value={videoEdits.overlayMode}
                    onChange={(e) => setVideoEdit("overlayMode", e.target.value)}
                  >
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="multiply">Multiply</option>
                    <option value="soft-light">Soft Light</option>
                  </select>
                </label>
                <label>
                  Overlay opacity: {videoEdits.overlayOpacity}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={videoEdits.overlayOpacity}
                    onChange={(e) => setVideoEdit("overlayOpacity", Number(e.target.value))}
                  />
                </label>
              </div>
            )}

            {activeVideoTool === "stickers" && (
              <div className="video-tool-panel">
                <div className="pill-group">
                  {["none", "fire", "heart", "star", "wow", "party"].map((sticker) => (
                    <button
                      key={sticker}
                      type="button"
                      className={videoEdits.sticker === sticker ? "active" : ""}
                      onClick={() => setVideoEdit("sticker", sticker)}
                    >
                      {sticker}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeVideoTool === "captions" && (
              <div className="video-tool-panel creator-settings-grid">
                <label>
                  Captions style
                  <select
                    value={videoEdits.captionsStyle}
                    onChange={(e) => setVideoEdit("captionsStyle", e.target.value)}
                  >
                    <option value="classic">Classic</option>
                    <option value="karaoke">Karaoke</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </label>
                <label>
                  Auto captions
                  <button
                    type="button"
                    className={creatorSettings.autoCaptions ? "toggle-btn active" : "toggle-btn"}
                    onClick={() => setCreatorSetting("autoCaptions", !creatorSettings.autoCaptions)}
                  >
                    {creatorSettings.autoCaptions ? "Enabled" : "Disabled"}
                  </button>
                </label>
              </div>
            )}

            {activeVideoTool === "voiceover" && (
              <div className="video-tool-panel slider-grid">
                <label>
                  Voiceover gain: {videoEdits.voiceoverGain}%
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={videoEdits.voiceoverGain}
                    onChange={(e) => setVideoEdit("voiceoverGain", Number(e.target.value))}
                  />
                </label>
              </div>
            )}

            {activeVideoTool === "filters" && (
              <div className="video-tool-panel">
                <div className="pill-group">
                  {["normal", "cinematic", "vivid", "mono", "vintage"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={videoEdits.filterPreset === preset ? "active" : ""}
                      onClick={() => setVideoEdit("filterPreset", preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeVideoTool === "import-audio" && (
              <div className="video-tool-panel">
                <label className="upload-file-pick">
                  Import audio
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const audioFile = e.target.files?.[0];
                      setVideoEdit("importedAudioName", audioFile?.name || "");
                    }}
                  />
                </label>
                <p className="video-note">
                  {videoEdits.importedAudioName
                    ? `Imported: ${videoEdits.importedAudioName}`
                    : "No audio selected yet."}
                </p>
              </div>
            )}

            <h3>Creator Publish Settings</h3>
            <div className="creator-settings-grid">
              <label>
                Audience
                <select
                  value={creatorSettings.audience}
                  onChange={(e) => setCreatorSetting("audience", e.target.value)}
                >
                  <option value="public">Public</option>
                  <option value="followers">Followers</option>
                  <option value="private">Only Me</option>
                </select>
              </label>

              <label>
                Age Restriction
                <select
                  value={creatorSettings.ageRestriction}
                  onChange={(e) => setCreatorSetting("ageRestriction", e.target.value)}
                >
                  <option value="all">All ages</option>
                  <option value="13+">13+</option>
                  <option value="18+">18+</option>
                </select>
              </label>

              <label>
                Genre
                <select
                  value={creatorSettings.category}
                  onChange={(e) => setCreatorSetting("category", e.target.value)}
                >
                  <option value="general">General</option>
                  <option value="music">Music</option>
                  <option value="mixes">Mixes</option>
                  <option value="news">News</option>
                  <option value="live">Live</option>
                  <option value="comedy">Comedy</option>
                  <option value="movies">Movies</option>
                  <option value="gaming">Gaming</option>
                  <option value="trending">Trending</option>
                  <option value="education">Education</option>
                  <option value="fitness">Fitness</option>
                  <option value="vlog">Vlog</option>
                </select>
              </label>

              <label>
                Schedule (optional)
                <input
                  type="datetime-local"
                  value={creatorSettings.scheduleAt}
                  onChange={(e) => setCreatorSetting("scheduleAt", e.target.value)}
                />
              </label>
            </div>

            <div className="pill-group">
              <button
                type="button"
                className={creatorSettings.allowComments ? "active" : ""}
                onClick={() => setCreatorSetting("allowComments", !creatorSettings.allowComments)}
              >
                Comments {creatorSettings.allowComments ? "On" : "Off"}
              </button>
              <button
                type="button"
                className={creatorSettings.allowRemix ? "active" : ""}
                onClick={() => setCreatorSetting("allowRemix", !creatorSettings.allowRemix)}
              >
                Remix {creatorSettings.allowRemix ? "On" : "Off"}
              </button>
              <button
                type="button"
                className={creatorSettings.allowDownload ? "active" : ""}
                onClick={() => setCreatorSetting("allowDownload", !creatorSettings.allowDownload)}
              >
                Download {creatorSettings.allowDownload ? "On" : "Off"}
              </button>
              <button
                type="button"
                className={creatorSettings.autoCaptions ? "active" : ""}
                onClick={() => setCreatorSetting("autoCaptions", !creatorSettings.autoCaptions)}
              >
                Auto Captions {creatorSettings.autoCaptions ? "On" : "Off"}
              </button>
            </div>
          </div>
        )}

        <button className="upload-submit" onClick={upload} disabled={loading}>
          {loading ? "Uploading..." : "Upload Post"}
        </button>

        {msg && <p className="upload-msg">{msg}</p>}
      </section>
    </div>
  );
}
