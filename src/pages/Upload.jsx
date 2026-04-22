import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiCamera,
  FiCrop,
  FiDroplet,
  FiEye,
  FiFilm,
  FiFilter,
  FiHeart,
  FiImage,
  FiLayers,
  FiMaximize2,
  FiMessageSquare,
  FiMic,
  FiMove,
  FiMusic,
  FiRotateCcw,
  FiRotateCw,
  FiScissors,
  FiSliders,
  FiSmile,
  FiSun,
  FiType,
  FiZap
} from "react-icons/fi";
import { useLocation } from "react-router-dom";
import api from "../api/axios";
import { CONTENT_TYPE_OPTIONS, readContentTypePrefs } from "./contentPrefs";
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
  hue: 0,
  blur: 0,
  grayscale: 0,
  vignette: 0,
  panX: 0,
  panY: 0
};

const PRESETS = {
  custom: { label: "Custom" },
  vibrant: { label: "Vibrant", brightness: 104, contrast: 108, saturation: 130, warmth: 8, blur: 0, grayscale: 0 },
  vintage: { label: "Vintage", brightness: 96, contrast: 92, saturation: 85, warmth: 22, blur: 0, grayscale: 8 },
  mono: { label: "Mono", brightness: 102, contrast: 115, saturation: 0, warmth: 0, blur: 0, grayscale: 100 },
  soft: { label: "Soft", brightness: 106, contrast: 94, saturation: 92, warmth: 10, blur: 1, grayscale: 0 },
  sunrise: { label: "Sunrise", brightness: 108, contrast: 96, saturation: 116, warmth: 18, hue: -6, vignette: 10 },
  urban: { label: "Urban", brightness: 98, contrast: 118, saturation: 106, warmth: -4, hue: 8, vignette: 16 },
  pearl: { label: "Pearl", brightness: 110, contrast: 92, saturation: 86, warmth: 6, blur: 0.4, vignette: 8 }
};

const IMAGE_TOOL_OPTIONS = [
  { key: "looks", label: "Looks", Icon: FiSun },
  { key: "frame", label: "Frame", Icon: FiCrop },
  { key: "move", label: "Move", Icon: FiMove },
  { key: "shape", label: "Shape", Icon: FiSliders }
];

const VIDEO_TOOL_OPTIONS = [
  { key: "edit", label: "Edit", Icon: FiScissors },
  { key: "add-clips", label: "Clips", Icon: FiFilm },
  { key: "audio", label: "Audio", Icon: FiMusic },
  { key: "text", label: "Text", Icon: FiType },
  { key: "overlay", label: "Blend", Icon: FiLayers },
  { key: "stickers", label: "Stickers", Icon: FiSmile },
  { key: "captions", label: "Captions", Icon: FiMessageSquare },
  { key: "voiceover", label: "Voice", Icon: FiMic },
  { key: "filters", label: "Filters", Icon: FiFilter },
  { key: "import-audio", label: "Import", Icon: FiDroplet }
];

const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const QUALITY_TARGET_OPTIONS = ["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p"];
const COVER_MODE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "fit", label: "Fit" },
  { value: "fill", label: "Fill" }
];
const POSITION_OPTIONS = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "center", label: "Center" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" }
];
const VIDEO_FILTER_OPTIONS = ["normal", "cinematic", "vivid", "mono", "vintage", "clean", "sunset"];
const STICKER_OPTIONS = [
  { value: "none", label: "Off", Icon: null },
  { value: "spark", label: "Spark", Icon: FiZap },
  { value: "love", label: "Love", Icon: FiHeart },
  { value: "glow", label: "Glow", Icon: FiSun },
  { value: "frame", label: "Frame", Icon: FiImage },
  { value: "chat", label: "Chat", Icon: FiMessageSquare }
];

const defaultVideoEdits = {
  trimStart: 0,
  trimEnd: 0,
  playbackSpeed: 1,
  volume: 100,
  muted: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  hue: 0,
  softness: 0,
  vignette: 0,
  filterPreset: "normal",
  overlayText: "",
  overlayOpacity: 70,
  overlayMode: "screen",
  textSize: 34,
  textPosition: "bottom-center",
  sticker: "none",
  stickerSize: 72,
  stickerPosition: "top-right",
  captionsStyle: "classic",
  voiceoverGain: 100,
  importedAudioName: "",
  extraClipCount: 0,
  qualityTarget: "1080p",
  coverMode: "auto"
};

const getOverlayPlacementStyle = (position) => {
  switch (position) {
    case "top-left":
      return { top: "7%", left: "6%" };
    case "top-right":
      return { top: "7%", right: "6%" };
    case "bottom-left":
      return { bottom: "9%", left: "6%" };
    case "bottom-right":
      return { bottom: "9%", right: "6%" };
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "bottom-center":
    default:
      return { bottom: "9%", left: "50%", transform: "translateX(-50%)" };
  }
};

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

const readContentTypeConfig = () => {
  const prefs = readContentTypePrefs();
  const allowed = new Set(prefs.contentTypes);
  const options = CONTENT_TYPE_OPTIONS.filter((opt) => allowed.has(opt.value));
  const safeOptions = options.length ? options : CONTENT_TYPE_OPTIONS;
  const defaultType =
    safeOptions.find((opt) => opt.value === prefs.defaultType)?.value ||
    safeOptions[0]?.value ||
    "study";
  return { options: safeOptions, defaultType };
};

export default function Upload() {
  const location = useLocation();
  const videoRef = useRef(null);
  const initialContentTypeConfig = readContentTypeConfig();
  const [file, setFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState(defaultEdits);
  const [activeImageTool, setActiveImageTool] = useState("looks");
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [videoMeta, setVideoMeta] = useState({ duration: 0, width: 0, height: 0 });
  const [videoEdits, setVideoEdits] = useState(defaultVideoEdits);
  const [activeVideoTool, setActiveVideoTool] = useState("edit");
  const [extraClips, setExtraClips] = useState([]);
  const [creatorSettings, setCreatorSettings] = useState({
    audience: "public",
    allowComments: true,
    allowRemix: true,
    allowDownload: false,
    autoCaptions: true,
    ageRestriction: "all",
    category: initialContentTypeConfig.defaultType,
    scheduleAt: ""
  });
  const [contentTypeConfig, setContentTypeConfig] = useState(initialContentTypeConfig);
  const uploadType = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get("type") || "").toLowerCase();
  }, [location.search]);
  const isReelUpload = uploadType === "reel";
  const isLongVideoUpload = uploadType === "long-video" || uploadType === "long" || uploadType === "watch";
  const isPhotoPostUpload = !isReelUpload && !isLongVideoUpload;

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const refresh = () => {
      const next = readContentTypeConfig();
      setContentTypeConfig(next);
      setCreatorSettings((prev) => {
        const stillValid = next.options.some((opt) => opt.value === prev.category);
        if (stillValid) return prev;
        return { ...prev, category: next.defaultType };
      });
    };
    refresh();
    window.addEventListener("ss-settings-update", refresh);
    return () => window.removeEventListener("ss-settings-update", refresh);
  }, []);

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
    const warmHueRotate = -Math.round(edits.warmth / 2) + Number(edits.hue || 0);
    return `brightness(${edits.brightness}%) contrast(${edits.contrast}%) saturate(${edits.saturation}%) sepia(${warmSepia}%) hue-rotate(${warmHueRotate}deg) blur(${edits.blur}px) grayscale(${edits.grayscale}%)`;
  }, [edits]);

  const resetEdits = () => setEdits(defaultEdits);

  const setEdit = (key, value) => setEdits((prev) => ({ ...prev, [key]: value, preset: "custom" }));
  const setVideoEdit = (key, value) => setVideoEdits((prev) => ({ ...prev, [key]: value }));
  const setCreatorSetting = (key, value) => setCreatorSettings((prev) => ({ ...prev, [key]: value }));

  const videoFilterStyle = useMemo(() => {
    const presetTuning = {
      normal: { b: 1, c: 1, s: 1, sepia: 0, hue: 0 },
      cinematic: { b: 0.96, c: 1.18, s: 0.9, sepia: 8, hue: -4 },
      vivid: { b: 1.05, c: 1.08, s: 1.24, sepia: 0, hue: 4 },
      mono: { b: 1, c: 1.1, s: 0.01, sepia: 0, hue: 0 },
      vintage: { b: 1.04, c: 0.94, s: 0.84, sepia: 18, hue: -6 },
      clean: { b: 1.06, c: 1.02, s: 1.08, sepia: 0, hue: 0 },
      sunset: { b: 1.02, c: 0.98, s: 1.12, sepia: 20, hue: -10 }
    };
    const tuning = presetTuning[videoEdits.filterPreset] || presetTuning.normal;
    const warmthSepia = Math.max(0, Number(videoEdits.warmth || 0) * 0.55 + tuning.sepia);
    const hueRotate = Number(videoEdits.hue || 0) + tuning.hue;
    const blurPx = Math.max(0, Number(videoEdits.softness || 0) / 30);
    return `brightness(${Math.round(videoEdits.brightness * tuning.b)}%) contrast(${Math.round(videoEdits.contrast * tuning.c)}%) saturate(${Math.round(videoEdits.saturation * tuning.s)}%) sepia(${warmthSepia}%) hue-rotate(${hueRotate}deg) blur(${blurPx.toFixed(2)}px)`;
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

  const imageVignetteStyle = useMemo(() => {
    const amount = Math.max(0, Number(edits.vignette || 0));
    if (!amount) return null;
    const alpha = Math.min(0.82, amount / 110);
    return {
      background: `radial-gradient(circle at center, rgba(0,0,0,0) 42%, rgba(0,0,0,0) 62%, rgba(0,0,0,${alpha}) 100%)`
    };
  }, [edits.vignette]);

  const videoVignetteStyle = useMemo(() => {
    const amount = Math.max(0, Number(videoEdits.vignette || 0));
    if (!amount) return null;
    const alpha = Math.min(0.78, amount / 120);
    return {
      background: `radial-gradient(circle at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.04) 58%, rgba(0,0,0,${alpha}) 100%)`
    };
  }, [videoEdits.vignette]);

  const selectedSticker = useMemo(
    () => STICKER_OPTIONS.find((item) => item.value === videoEdits.sticker) || STICKER_OPTIONS[0],
    [videoEdits.sticker]
  );
  const StickerPreviewIcon = selectedSticker?.Icon || null;

  const videoObjectFit =
    videoEdits.coverMode === "fill" ? "cover" : videoEdits.coverMode === "fit" ? "contain" : "contain";

  const renderStudioSlider = ({ key, label, value, min, max, step = 1, onChange, suffix = "" }) => (
    <label key={key} className="studio-slider">
      <div className="studio-slider-head">
        <span>{label}</span>
        <strong>{`${value}${suffix}`}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
    </label>
  );

  const imageLookControls = [
    { key: "brightness", label: "Brightness", value: edits.brightness, min: 60, max: 150, suffix: "%", onChange: (e) => setEdit("brightness", Number(e.target.value)) },
    { key: "contrast", label: "Contrast", value: edits.contrast, min: 70, max: 150, suffix: "%", onChange: (e) => setEdit("contrast", Number(e.target.value)) },
    { key: "saturation", label: "Saturation", value: edits.saturation, min: 0, max: 180, suffix: "%", onChange: (e) => setEdit("saturation", Number(e.target.value)) },
    { key: "warmth", label: "Warmth", value: edits.warmth, min: 0, max: 50, onChange: (e) => setEdit("warmth", Number(e.target.value)) },
    { key: "hue", label: "Hue", value: edits.hue, min: -30, max: 30, onChange: (e) => setEdit("hue", Number(e.target.value)) },
    { key: "blur", label: "Softness", value: edits.blur, min: 0, max: 4, step: 0.1, onChange: (e) => setEdit("blur", Number(e.target.value)) },
    { key: "grayscale", label: "Fade to mono", value: edits.grayscale, min: 0, max: 100, suffix: "%", onChange: (e) => setEdit("grayscale", Number(e.target.value)) },
    { key: "vignette", label: "Vignette", value: edits.vignette, min: 0, max: 60, onChange: (e) => setEdit("vignette", Number(e.target.value)) }
  ];

  const imageFrameControls = [
    { key: "zoom", label: "Zoom", value: Number(edits.zoom.toFixed(2)), min: 1, max: 2.2, step: 0.01, onChange: (e) => setEdit("zoom", Number(e.target.value)) }
  ];

  const imageMoveControls = [
    { key: "panX", label: "Pan X", value: edits.panX, min: -140, max: 140, onChange: (e) => setEdit("panX", Number(e.target.value)) },
    { key: "panY", label: "Pan Y", value: edits.panY, min: -140, max: 140, onChange: (e) => setEdit("panY", Number(e.target.value)) }
  ];

  const videoLookControls = [
    { key: "brightness", label: "Brightness", value: videoEdits.brightness, min: 60, max: 150, suffix: "%", onChange: (e) => setVideoEdit("brightness", Number(e.target.value)) },
    { key: "contrast", label: "Contrast", value: videoEdits.contrast, min: 70, max: 150, suffix: "%", onChange: (e) => setVideoEdit("contrast", Number(e.target.value)) },
    { key: "saturation", label: "Saturation", value: videoEdits.saturation, min: 0, max: 180, suffix: "%", onChange: (e) => setVideoEdit("saturation", Number(e.target.value)) },
    { key: "warmth", label: "Warmth", value: videoEdits.warmth, min: 0, max: 50, onChange: (e) => setVideoEdit("warmth", Number(e.target.value)) },
    { key: "hue", label: "Hue", value: videoEdits.hue, min: -30, max: 30, onChange: (e) => setVideoEdit("hue", Number(e.target.value)) },
    { key: "softness", label: "Softness", value: videoEdits.softness, min: 0, max: 60, onChange: (e) => setVideoEdit("softness", Number(e.target.value)) },
    { key: "vignette", label: "Vignette", value: videoEdits.vignette, min: 0, max: 60, onChange: (e) => setVideoEdit("vignette", Number(e.target.value)) }
  ];

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
      hue: preset.hue ?? prev.hue,
      blur: preset.blur ?? prev.blur,
      grayscale: preset.grayscale ?? prev.grayscale,
      vignette: preset.vignette ?? prev.vignette
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

    if (Number(edits.vignette || 0) > 0) {
      const alpha = Math.min(0.78, Number(edits.vignette || 0) / 120);
      const gradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        Math.min(canvas.width, canvas.height) * 0.18,
        canvas.width / 2,
        canvas.height / 2,
        Math.max(canvas.width, canvas.height) * 0.68
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.62, "rgba(0,0,0,0)");
      gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

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
    setActiveImageTool("looks");
    setPreviewOriginal(false);
    setVideoMeta({ duration: 0, width: 0, height: 0 });
    setActiveVideoTool("edit");
    setExtraClips([]);
    setVideoEdits(defaultVideoEdits);
    setCreatorSettings({
      audience: "public",
      allowComments: true,
      allowRemix: true,
      allowDownload: false,
      autoCaptions: true,
      ageRestriction: "all",
      category: contentTypeConfig.defaultType,
      scheduleAt: ""
    });
  };

  const applyPickedFiles = (fileList) => {
    const nextFiles = Array.from(fileList || []);
    setSelectedFiles(nextFiles);
    setActiveFileIndex(0);
    setFile(nextFiles[0] || null);
    setMsg("");
    setEdits(defaultEdits);
    setActiveImageTool("looks");
    setPreviewOriginal(false);
    setActiveVideoTool("edit");
    setExtraClips([]);
    setVideoMeta({ duration: 0, width: 0, height: 0 });
    setVideoEdits(defaultVideoEdits);
  };

  const openCameraStudio = () => {
    if (typeof window.__ssOpenCameraStudio === "function") {
      window.__ssOpenCameraStudio({ forceOpen: true });
      return;
    }
    window.dispatchEvent(new Event("ss:open-camera"));
  };

  const upload = async () => {
    const filesToUpload = selectedFiles.length ? selectedFiles : file ? [file] : [];
    if (!filesToUpload.length) {
      setMsg("File required");
      return;
    }
    if (isReelUpload || isLongVideoUpload) {
      if (filesToUpload.length !== 1) {
        setMsg(isReelUpload ? "Please choose a single video for a reel." : "Please choose a single video for a long video post.");
        return;
      }
      if (!filesToUpload[0]?.type?.startsWith("video/")) {
        setMsg(isReelUpload ? "Reels must be a video file." : "Long video uploads must be a video file.");
        return;
      }
    }

    if (isPhotoPostUpload) {
      const hasVideo = filesToUpload.some((entry) => String(entry?.type || "").startsWith("video/"));
      if (hasVideo) {
        setMsg("Post uploads are photo-only now. Use Long Video to share videos.");
        return;
      }
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
        if (isReelUpload) {
          form.append("isReel", "true");
          form.append("reel", "true");
          form.append("isShortVideo", "true");
          form.append("type", "reel");
        } else if (isLongVideoUpload) {
          form.append("isLongVideo", "true");
          form.append("isShortVideo", "false");
          form.append("type", "long_video");
        }
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
              if (isReelUpload || isLongVideoUpload) throw firstErr;
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

  const uploadHeading = isReelUpload ? "Create Reel" : isLongVideoUpload ? "Create Long Video" : "Create Post";
  const uploadSubtitle = isReelUpload
    ? "Upload a short video for reels."
    : isLongVideoUpload
      ? "Upload a long video for the long videos feed."
      : "Create your photo post.";
  const filePickerLabel = isReelUpload || isLongVideoUpload ? "Choose video" : "Choose photo";
  const fileAccept = isReelUpload || isLongVideoUpload ? "video/*" : "image/*";
  const allowMultipleFiles = isPhotoPostUpload;

  return (
    <div className="upload-page">
      <section className="upload-panel">
        <h2>{uploadHeading}</h2>
        <p className="upload-subtitle">{uploadSubtitle}</p>

        <div className="upload-pick-row">
          <label className="upload-file-pick">
            {filePickerLabel}
            <input
              type="file"
              accept={fileAccept}
              multiple={allowMultipleFiles}
              onChange={(e) => {
                applyPickedFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          <button type="button" className="upload-camera-pick" onClick={openCameraStudio} title="Open Camera">
            <FiCamera />
          </button>
        </div>
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

        <div className="studio-panel-block creator-settings-grid studio-content-type">
          <label>
            Content type
            <select
              value={creatorSettings.category}
              onChange={(e) => setCreatorSetting("category", e.target.value)}
            >
              {contentTypeConfig.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

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
                {!previewOriginal && imageVignetteStyle && (
                  <div className="upload-preview-vignette" style={imageVignetteStyle} />
                )}
              </div>
            )}

            {isVideo && (
              <div className="upload-preview-video-wrap">
                <div className="upload-preview-video-stage">
                  <video
                    ref={videoRef}
                    src={previewUrl}
                    className="upload-preview-video"
                    controls
                    style={{
                      filter: previewOriginal ? "none" : videoFilterStyle,
                      objectFit: videoObjectFit
                    }}
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
                  {!previewOriginal && videoEdits.overlayText && (
                    <div
                      className="upload-preview-overlay-text"
                      style={{
                        ...getOverlayPlacementStyle(videoEdits.textPosition),
                        opacity: Math.max(0.1, Number(videoEdits.overlayOpacity || 0) / 100),
                        fontSize: `${Math.max(18, Number(videoEdits.textSize || 34))}px`,
                        mixBlendMode: videoEdits.overlayMode
                      }}
                    >
                      {videoEdits.overlayText}
                    </div>
                  )}
                  {!previewOriginal && StickerPreviewIcon && (
                    <div
                      className="upload-preview-overlay-sticker"
                      style={{
                        ...getOverlayPlacementStyle(videoEdits.stickerPosition),
                        fontSize: `${Math.max(34, Number(videoEdits.stickerSize || 72))}px`,
                        mixBlendMode: videoEdits.overlayMode
                      }}
                    >
                      <StickerPreviewIcon />
                    </div>
                  )}
                  {!previewOriginal && videoVignetteStyle && (
                    <div className="upload-preview-vignette" style={videoVignetteStyle} />
                  )}
                </div>
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
          <div className="upload-tools media-studio image-studio">
            <div className="studio-heading">
              <div>
                <h3>Photo Studio</h3>
                <p>Give the image a warmer, softer, or more focused feel without the chunky boxes.</p>
              </div>
              <div className="studio-heading-actions">
                <button
                  type="button"
                  className="studio-soft-btn"
                  onMouseDown={() => setPreviewOriginal(true)}
                  onMouseUp={() => setPreviewOriginal(false)}
                  onMouseLeave={() => setPreviewOriginal(false)}
                  onTouchStart={() => setPreviewOriginal(true)}
                  onTouchEnd={() => setPreviewOriginal(false)}
                >
                  <FiEye />
                  <span>Hold to compare</span>
                </button>
                <button type="button" className="studio-soft-btn" onClick={resetEdits}>
                  <FiRotateCcw />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div className="studio-tool-strip">
              {IMAGE_TOOL_OPTIONS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`studio-tool-btn ${activeImageTool === key ? "active" : ""}`}
                  onClick={() => setActiveImageTool(key)}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {activeImageTool === "looks" && (
              <>
                <div className="studio-inline-row">
                  <span className="studio-inline-label">Mood</span>
                  <div className="pill-group studio-chip-row">
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
                <div className="studio-slider-grid">
                  {imageLookControls.map(renderStudioSlider)}
                </div>
              </>
            )}

            {activeImageTool === "frame" && (
              <>
                <div className="studio-inline-row">
                  <span className="studio-inline-label">Aspect</span>
                  <div className="pill-group studio-chip-row">
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
                <div className="studio-slider-grid">
                  {imageFrameControls.map(renderStudioSlider)}
                </div>
                <button
                  type="button"
                  className="studio-soft-btn studio-soft-btn-inline"
                  onClick={() => {
                    setEdit("aspect", "orig");
                    setEdit("zoom", 1);
                  }}
                >
                  <FiMaximize2 />
                  <span>Reset frame</span>
                </button>
              </>
            )}

            {activeImageTool === "move" && (
              <>
                <p className="studio-helper">Slide the subject into place after you zoom or crop.</p>
                <div className="studio-slider-grid">
                  {imageMoveControls.map(renderStudioSlider)}
                </div>
              </>
            )}

            {activeImageTool === "shape" && (
              <>
                <div className="studio-inline-row">
                  <span className="studio-inline-label">Quick actions</span>
                  <div className="pill-group studio-chip-row studio-action-row">
                    <button type="button" onClick={() => setEdit("rotate", (edits.rotate - 90 + 360) % 360)}>
                      <FiRotateCcw />
                      <span>Left</span>
                    </button>
                    <button type="button" onClick={() => setEdit("rotate", (edits.rotate + 90) % 360)}>
                      <FiRotateCw />
                      <span>Right</span>
                    </button>
                    <button type="button" onClick={() => setEdit("flipH", !edits.flipH)}>
                      <FiMove />
                      <span>Flip H</span>
                    </button>
                    <button type="button" onClick={() => setEdit("flipV", !edits.flipV)}>
                      <FiSliders />
                      <span>Flip V</span>
                    </button>
                  </div>
                </div>
                <p className="studio-helper">Use smaller moves here so the photo still feels natural and human.</p>
              </>
            )}
          </div>
        )}

        {isVideo && (
          <div className="upload-tools video-tools media-studio">
            <div className="studio-heading">
              <div>
                <h3>Creator Video Studio</h3>
                <p>Shape the pace, look, audio, and story with a softer creator flow.</p>
              </div>
              <div className="studio-heading-actions">
                <button
                  type="button"
                  className="studio-soft-btn"
                  onMouseDown={() => setPreviewOriginal(true)}
                  onMouseUp={() => setPreviewOriginal(false)}
                  onMouseLeave={() => setPreviewOriginal(false)}
                  onTouchStart={() => setPreviewOriginal(true)}
                  onTouchEnd={() => setPreviewOriginal(false)}
                >
                  <FiEye />
                  <span>Hold to compare</span>
                </button>
                <button
                  type="button"
                  className="studio-soft-btn"
                  onClick={() => {
                    setVideoEdits((prev) => ({ ...defaultVideoEdits, trimEnd: videoMeta.duration || prev.trimEnd || 0 }));
                    setExtraClips([]);
                  }}
                >
                  <FiRotateCcw />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div className="studio-tool-strip">
              {VIDEO_TOOL_OPTIONS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`studio-tool-btn ${activeVideoTool === key ? "active" : ""}`}
                  onClick={() => setActiveVideoTool(key)}
                  aria-label={label}
                  title={label}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {activeVideoTool === "edit" && (
              <>
                <div className="studio-section-split">
                  <div>
                    <div className="studio-inline-row">
                      <span className="studio-inline-label">Trim</span>
                      <span className="studio-inline-value">{videoTrimSummary.clipLen}s clip</span>
                    </div>
                    <div className="studio-slider-grid">
                      {renderStudioSlider({
                        key: "trimStart",
                        label: "Start",
                        value: videoTrimSummary.start,
                        min: 0,
                        max: trimStartMax || 0,
                        step: 0.1,
                        suffix: "s",
                        onChange: (e) => setVideoEdit("trimStart", Number(e.target.value))
                      })}
                      {renderStudioSlider({
                        key: "trimEnd",
                        label: "End",
                        value: videoTrimSummary.end,
                        min: Math.min(videoEdits.trimStart + 0.2, trimEndMax || 0),
                        max: trimEndMax || 0,
                        step: 0.1,
                        suffix: "s",
                        onChange: (e) => setVideoEdit("trimEnd", Number(e.target.value))
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="studio-inline-row">
                      <span className="studio-inline-label">Playback</span>
                      <div className="pill-group studio-chip-row">
                        {PLAYBACK_SPEED_OPTIONS.map((speed) => (
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
                    <div className="studio-inline-row">
                      <span className="studio-inline-label">Frame</span>
                      <div className="pill-group studio-chip-row">
                        {COVER_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={videoEdits.coverMode === option.value ? "active" : ""}
                            onClick={() => setVideoEdit("coverMode", option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="studio-slider-grid">
                  {videoLookControls.map(renderStudioSlider)}
                </div>

                <div className="studio-inline-row">
                  <span className="studio-inline-label">Output</span>
                  <div className="pill-group studio-chip-row">
                    {QUALITY_TARGET_OPTIONS.map((q) => (
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
              <div className="studio-panel-block">
                <label className="upload-file-pick studio-upload-inline">
                  <FiFilm />
                  <span>Add supporting clips</span>
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
                <p className="studio-helper">{extraClips.length} extra clip(s) selected. You can use these later for a richer reel cut.</p>
              </div>
            )}

            {activeVideoTool === "audio" && (
              <div className="studio-panel-block">
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "volume",
                    label: "Volume",
                    value: videoEdits.volume,
                    min: 0,
                    max: 100,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("volume", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "voiceoverGain",
                    label: "Voice boost",
                    value: videoEdits.voiceoverGain,
                    min: 0,
                    max: 200,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("voiceoverGain", Number(e.target.value))
                  })}
                </div>
                <div className="pill-group studio-chip-row studio-action-row">
                  <button
                    type="button"
                    className={videoEdits.muted ? "active" : ""}
                    onClick={() => setVideoEdit("muted", !videoEdits.muted)}
                  >
                    {videoEdits.muted ? "Muted" : "Audio on"}
                  </button>
                </div>
              </div>
            )}

            {activeVideoTool === "text" && (
              <div className="studio-panel-block">
                <label className="studio-input-field">
                  <span>Overlay text</span>
                  <input
                    type="text"
                    value={videoEdits.overlayText}
                    placeholder="Say something real..."
                    onChange={(e) => setVideoEdit("overlayText", e.target.value)}
                  />
                </label>
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "textSize",
                    label: "Text size",
                    value: videoEdits.textSize,
                    min: 18,
                    max: 72,
                    suffix: "px",
                    onChange: (e) => setVideoEdit("textSize", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "overlayOpacity",
                    label: "Text opacity",
                    value: videoEdits.overlayOpacity,
                    min: 0,
                    max: 100,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("overlayOpacity", Number(e.target.value))
                  })}
                </div>
                <div className="studio-inline-row">
                  <span className="studio-inline-label">Placement</span>
                  <div className="pill-group studio-chip-row">
                    {POSITION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={videoEdits.textPosition === option.value ? "active" : ""}
                        onClick={() => setVideoEdit("textPosition", option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeVideoTool === "overlay" && (
              <div className="studio-panel-block creator-settings-grid">
                <label>
                  Blend mode
                  <select
                    value={videoEdits.overlayMode}
                    onChange={(e) => setVideoEdit("overlayMode", e.target.value)}
                  >
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="multiply">Multiply</option>
                    <option value="soft-light">Soft light</option>
                  </select>
                </label>
                <label>
                  Preview framing
                  <select
                    value={videoEdits.coverMode}
                    onChange={(e) => setVideoEdit("coverMode", e.target.value)}
                  >
                    {COVER_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {activeVideoTool === "stickers" && (
              <div className="studio-panel-block">
                <div className="pill-group studio-chip-row studio-icon-chip-row">
                  {STICKER_OPTIONS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      className={videoEdits.sticker === value ? "active" : ""}
                      onClick={() => setVideoEdit("sticker", value)}
                    >
                      {Icon ? <Icon /> : <FiEye />}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "stickerSize",
                    label: "Sticker size",
                    value: videoEdits.stickerSize,
                    min: 34,
                    max: 120,
                    suffix: "px",
                    onChange: (e) => setVideoEdit("stickerSize", Number(e.target.value))
                  })}
                </div>
                <div className="studio-inline-row">
                  <span className="studio-inline-label">Placement</span>
                  <div className="pill-group studio-chip-row">
                    {POSITION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={videoEdits.stickerPosition === option.value ? "active" : ""}
                        onClick={() => setVideoEdit("stickerPosition", option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeVideoTool === "captions" && (
              <div className="studio-panel-block creator-settings-grid">
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
              <div className="studio-panel-block">
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "voiceoverGainOnly",
                    label: "Voice presence",
                    value: videoEdits.voiceoverGain,
                    min: 0,
                    max: 200,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("voiceoverGain", Number(e.target.value))
                  })}
                </div>
              </div>
            )}

            {activeVideoTool === "filters" && (
              <div className="studio-panel-block">
                <div className="pill-group studio-chip-row">
                  {VIDEO_FILTER_OPTIONS.map((preset) => (
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
              <div className="studio-panel-block">
                <label className="upload-file-pick studio-upload-inline">
                  <FiMusic />
                  <span>Import soundtrack</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const audioFile = e.target.files?.[0];
                      setVideoEdit("importedAudioName", audioFile?.name || "");
                    }}
                  />
                </label>
                <p className="studio-helper">
                  {videoEdits.importedAudioName
                    ? `Imported: ${videoEdits.importedAudioName}`
                    : "No soundtrack selected yet."}
                </p>
              </div>
            )}

            <div className="studio-heading studio-heading-secondary">
              <div>
                <h3>Publish Settings</h3>
                <p>Set who can watch, comment, remix, or download before you publish.</p>
              </div>
            </div>

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
                Age restriction
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
                Schedule (optional)
                <input
                  type="datetime-local"
                  value={creatorSettings.scheduleAt}
                  onChange={(e) => setCreatorSetting("scheduleAt", e.target.value)}
                />
              </label>
            </div>

            <div className="pill-group studio-chip-row studio-action-row">
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
                Auto captions {creatorSettings.autoCaptions ? "On" : "Off"}
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
