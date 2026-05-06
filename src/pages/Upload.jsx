import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiCamera,
  FiCrop,
  FiDroplet,
  FiBookmark,
  FiEye,
  FiFilm,
  FiFilter,
  FiHeart,
  FiImage,
  FiLink2,
  FiLock,
  FiMaximize2,
  FiMessageSquare,
  FiMic,
  FiMove,
  FiMusic,
  FiPause,
  FiPlay,
  FiRotateCcw,
  FiRotateCw,
  FiScissors,
  FiSettings,
  FiSkipBack,
  FiSkipForward,
  FiSliders,
  FiSmile,
  FiSun,
  FiTrash2,
  FiType,
  FiZap
} from "react-icons/fi";
import { useLocation } from "react-router-dom";
import api from "../api/axios";
import { CONTENT_TYPE_OPTIONS, readContentTypePrefs } from "./contentPrefs";
import "./Upload.css";

const POST_GENRE_MAP_KEY = "socialsea_post_genre_map_v1";
const MAX_IMAGE_UPLOAD_FILE_SIZE_BYTES = 80 * 1024 * 1024;`r`nconst MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES = 1024 * 1024 * 1024;

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
  { key: "pro-apps", label: "Workflows", Icon: FiSettings },
  { key: "edit", label: "Edit", Icon: FiScissors },
  { key: "timeline-pro", label: "Timeline", Icon: FiMaximize2 },
  { key: "transform-pro", label: "Transform", Icon: FiMove },
  { key: "grading-pro", label: "Grading", Icon: FiSun },
  { key: "fx-pro", label: "Blur", Icon: FiDroplet },
  { key: "motion-pro", label: "Motion", Icon: FiRotateCw },
  { key: "audio-pro", label: "Audio", Icon: FiMic },
  { key: "titles-pro", label: "Titles", Icon: FiType },
  { key: "cover", label: "Cover", Icon: FiImage },
  { key: "add-clips", label: "Clips", Icon: FiFilm },
  { key: "text", label: "Text", Icon: FiType },
  { key: "overlay", label: "Overlay", Icon: FiLink2 },
  { key: "stickers", label: "Stickers", Icon: FiSmile },
  { key: "captions", label: "Captions", Icon: FiMessageSquare },
  { key: "filters", label: "Filters", Icon: FiFilter },
  { key: "import-audio", label: "Import Audio", Icon: FiMusic }
];
const VIDEO_TOOL_OPTION_BY_KEY = VIDEO_TOOL_OPTIONS.reduce((lookup, option) => {
  lookup[option.key] = option;
  return lookup;
}, {});
const VIDEO_TOOL_GROUPS = [
  {
    key: "cut",
    label: "Cut + Arrange",
    note: "Trim, split, and structure your sequence.",
    tools: ["edit", "timeline-pro", "add-clips", "transform-pro", "cover"]
  },
  {
    key: "look",
    label: "Look + Motion",
    note: "Color style, camera movement, and polish.",
    tools: ["grading-pro", "fx-pro", "motion-pro", "filters", "pro-apps"]
  },
  {
    key: "graphics",
    label: "Text + Graphics",
    note: "Titles, overlays, stickers, and on-screen messaging.",
    tools: ["titles-pro", "text", "overlay", "stickers"]
  },
  {
    key: "sound",
    label: "Audio + Captions",
    note: "Voice, soundtrack, and subtitle controls.",
    tools: ["audio-pro", "import-audio", "captions"]
  }
];
const VIDEO_TOOL_GROUP_BY_TOOL_KEY = VIDEO_TOOL_GROUPS.reduce((lookup, group) => {
  group.tools.forEach((toolKey) => {
    lookup[toolKey] = group.key;
  });
  return lookup;
}, {});
const VIDEO_TOOL_KEY_SET = new Set(VIDEO_TOOL_OPTIONS.map((option) => option.key));
const VIDEO_TOOL_KEY_ALIASES = {
  timeline: "timeline-pro",
  transform: "transform-pro",
  grading: "grading-pro",
  fx: "fx-pro",
  motion: "motion-pro",
  titles: "titles-pro",
  audio: "audio-pro"
};
const resolveVideoToolKey = (rawKey) => {
  const key = String(rawKey || "").trim();
  if (!key) return "edit";
  const alias = VIDEO_TOOL_KEY_ALIASES[key] || key;
  return VIDEO_TOOL_KEY_SET.has(alias) ? alias : "edit";
};
const getVideoToolGroupKey = (toolKey) => {
  const resolvedToolKey = resolveVideoToolKey(toolKey);
  return VIDEO_TOOL_GROUP_BY_TOOL_KEY[resolvedToolKey] || VIDEO_TOOL_GROUPS[0].key;
};
const VIDEO_BOTTOM_PAGES = [
  { key: "details", label: "Details" },
  { key: "timeline", label: "Editor Studio" },
  { key: "publish", label: "Publish Settings" }
];
const PREMIERE_PROJECT_DRAFT_STORAGE_KEY = "socialsea_premiere_project_draft_v1";
const PREMIERE_MENU_GROUPS = [
  {
    key: "file",
    label: "File",
    items: [
      { key: "new-project", label: "New Project", action: "file.new-project" },
      { key: "new-sequence", label: "New Sequence", action: "file.new-sequence" },
      { key: "open-project", label: "Open Project", action: "file.open-project" },
      { key: "close-project", label: "Close / Close Project", action: "file.close-project" },
      { separator: true },
      { key: "save", label: "Save", action: "file.save" },
      { key: "save-as", label: "Save As", action: "file.save-as" },
      { key: "save-copy", label: "Save a Copy", action: "file.save-copy" },
      { separator: true },
      { key: "import", label: "Import", action: "file.import" },
      { key: "import-browser", label: "Import from Media Browser", action: "file.import-browser" },
      { key: "export-media", label: "Export Media", action: "file.export-media" },
      { key: "export-shotcut-mlt", label: "Export Shotcut Project (.mlt)", action: "file.export-shotcut-mlt" },
      { key: "send-media-encoder", label: "Send to Media Encoder", action: "file.send-media-encoder" },
      { key: "media-properties", label: "Get Media File Properties", action: "file.media-properties" },
      { separator: true },
      { key: "exit", label: "Exit / Quit", action: "file.exit" }
    ]
  },
  {
    key: "edit",
    label: "Edit",
    items: [
      { key: "undo", label: "Undo", action: "edit.undo" },
      { key: "redo", label: "Redo", action: "edit.redo" },
      { separator: true },
      { key: "cut", label: "Cut", action: "edit.cut" },
      { key: "copy", label: "Copy", action: "edit.copy" },
      { key: "paste", label: "Paste", action: "edit.paste" },
      { key: "paste-attributes", label: "Paste Attributes", action: "edit.paste-attributes" },
      { key: "clear", label: "Clear", action: "edit.clear" },
      { key: "ripple-delete", label: "Ripple Delete", action: "edit.ripple-delete" },
      { key: "duplicate", label: "Duplicate", action: "edit.duplicate" },
      { separator: true },
      { key: "select-all", label: "Select All", action: "edit.select-all" },
      { key: "deselect-all", label: "Deselect All", action: "edit.deselect-all" },
      { key: "find", label: "Find", action: "edit.find" },
      { key: "edit-original", label: "Edit Original", action: "edit.edit-original" },
      { key: "keyboard-shortcuts", label: "Keyboard Shortcuts", action: "edit.keyboard-shortcuts" },
      { key: "preferences", label: "Preferences / Settings", action: "edit.preferences" },
      { separator: true },
      { key: "track-text-shortcut", label: "Text 0", action: "track-text.focus" },
      { key: "track-video-shortcut", label: "Video 1", action: "track-video.focus" },
      { key: "track-audio-shortcut", label: "Audio 0", action: "track-audio.focus" }
    ]
  },
  {
    key: "clip",
    label: "Clip",
    items: [
      { key: "make-subclip", label: "Make Subclip", action: "clip.make-subclip" },
      { key: "audio-channels", label: "Audio Channels", action: "clip.audio-channels" },
      { key: "audio-gain", label: "Audio Gain", action: "clip.audio-gain" },
      { key: "speed-duration", label: "Speed / Duration", action: "clip.speed-duration" },
      { separator: true },
      { key: "insert", label: "Insert", action: "clip.insert" },
      { key: "overwrite", label: "Overwrite", action: "clip.overwrite" },
      { key: "enable", label: "Enable", action: "clip.enable" },
      { key: "link", label: "Link", action: "clip.link" },
      { key: "unlink", label: "Unlink", action: "clip.unlink" },
      { key: "group", label: "Group", action: "clip.group" },
      { key: "ungroup", label: "Ungroup", action: "clip.ungroup" },
      { key: "synchronize", label: "Synchronize", action: "clip.synchronize" },
      { key: "nest", label: "Nest", action: "clip.nest" },
      { key: "modify", label: "Modify", action: "clip.modify" }
    ]
  },
  {
    key: "sequence",
    label: "Sequence",
    items: [
      { key: "sequence-settings", label: "Sequence Settings", action: "sequence.settings" },
      { key: "render-effects", label: "Render Effects In to Out", action: "sequence.render-effects" },
      { key: "render", label: "Render In to Out", action: "sequence.render" },
      { key: "match-frame", label: "Match Frame", action: "sequence.match-frame" },
      { key: "reverse-match-frame", label: "Reverse Match Frame", action: "sequence.reverse-match-frame" },
      { key: "add-edit", label: "Add Edit", action: "sequence.add-edit" },
      { key: "add-edit-all", label: "Add Edit to All Tracks", action: "sequence.add-edit-all" },
      { key: "trim-edit", label: "Trim Edit", action: "sequence.trim-edit" },
      { key: "apply-video-transition", label: "Apply Video Transition", action: "sequence.apply-video-transition" },
      { key: "apply-audio-transition", label: "Apply Audio Transition", action: "sequence.apply-audio-transition" },
      { key: "lift", label: "Lift", action: "sequence.lift" },
      { key: "extract", label: "Extract", action: "sequence.extract" },
      { key: "zoom-in", label: "Zoom In", action: "sequence.zoom-in" },
      { key: "zoom-out", label: "Zoom Out", action: "sequence.zoom-out" },
      { key: "snap", label: "Snap in Timeline", action: "sequence.snap" },
      { key: "make-subsequence", label: "Make Subsequence", action: "sequence.make-subsequence" },
      { key: "add-caption-track", label: "Add Caption Track", action: "sequence.add-caption-track" }
    ]
  },
  {
    key: "markers",
    label: "Markers",
    items: [
      { key: "mark-in", label: "Mark In", action: "markers.mark-in" },
      { key: "mark-out", label: "Mark Out", action: "markers.mark-out" },
      { key: "mark-clip", label: "Mark Clip", action: "markers.mark-clip" },
      { key: "mark-selection", label: "Mark Selection", action: "markers.mark-selection" },
      { key: "go-in", label: "Go to In", action: "markers.go-in" },
      { key: "go-out", label: "Go to Out", action: "markers.go-out" },
      { key: "clear-in", label: "Clear In", action: "markers.clear-in" },
      { key: "clear-out", label: "Clear Out", action: "markers.clear-out" },
      { key: "clear-in-out", label: "Clear In and Out", action: "markers.clear-in-out" },
      { key: "add-marker", label: "Add Marker", action: "markers.add-marker" },
      { key: "go-next-marker", label: "Go to Next Marker", action: "markers.go-next" },
      { key: "go-prev-marker", label: "Go to Previous Marker", action: "markers.go-prev" },
      { key: "clear-selected-marker", label: "Clear Selected Marker", action: "markers.clear-selected" },
      { key: "clear-all-markers", label: "Clear All Markers", action: "markers.clear-all" }
    ]
  },
  {
    key: "graphics",
    label: "Graphics and Titles",
    items: [
      { key: "new-layer", label: "New Layer", action: "graphics.new-layer" },
      { key: "text", label: "Text", action: "graphics.text" },
      { key: "rectangle", label: "Rectangle", action: "graphics.rectangle" },
      { key: "ellipse", label: "Ellipse", action: "graphics.ellipse" },
      { key: "arrange", label: "Arrange", action: "graphics.arrange" },
      { key: "bring-front", label: "Bring to Front", action: "graphics.bring-front" },
      { key: "bring-forward", label: "Bring Forward", action: "graphics.bring-forward" },
      { key: "send-backward", label: "Send Backward", action: "graphics.send-backward" },
      { key: "send-back", label: "Send to Back", action: "graphics.send-back" },
      { key: "select-next", label: "Select Next Layer", action: "graphics.select-next" },
      { key: "select-prev", label: "Select Previous Layer", action: "graphics.select-prev" },
      { key: "export-mogrt", label: "Export as Motion Graphics Template", action: "graphics.export-mogrt" }
    ]
  },
  {
    key: "view",
    label: "View",
    items: [
      { key: "show-rulers", label: "Show Rulers", action: "view.show-rulers" },
      { key: "show-guides", label: "Show Guides", action: "view.show-guides" },
      { key: "add-guide", label: "Add Guide", action: "view.add-guide" },
      { key: "lock-guides", label: "Lock Guides", action: "view.lock-guides" },
      { key: "clear-guides", label: "Clear Guides", action: "view.clear-guides" },
      { key: "snap-monitor", label: "Snap in Program Monitor", action: "view.snap-monitor" },
      { key: "safe-margins", label: "Safe Margins", action: "view.safe-margins" },
      { key: "display-mode", label: "Display Mode", action: "view.display-mode" },
      { key: "zoom", label: "Zoom / Magnification", action: "view.zoom" },
      { key: "timecode-options", label: "Timecode Display Options", action: "view.timecode-options" }
    ]
  },
  {
    key: "window",
    label: "Window",
    items: [
      { key: "workspaces", label: "Workspaces", action: "window.workspaces" },
      { key: "all-panels", label: "All Panels", action: "window.all-panels" },
      { key: "assembly", label: "Assembly", action: "window.assembly" },
      { key: "audio", label: "Audio", action: "window.audio" },
      { key: "captions-graphics", label: "Captions and Graphics", action: "window.captions-graphics" },
      { key: "color", label: "Color", action: "window.color" },
      { key: "editing", label: "Editing", action: "window.editing" },
      { key: "effects-workspace", label: "Effects", action: "window.effects-workspace" },
      { key: "essential", label: "Essential", action: "window.essential" },
      { key: "learning", label: "Learning", action: "window.learning" },
      { key: "reset-layout", label: "Reset to Saved Layout", action: "window.reset-layout" },
      { separator: true },
      { key: "audio-clip-mixer", label: "Audio Clip Mixer", action: "window.audio-clip-mixer" },
      { key: "audio-track-mixer", label: "Audio Track Mixer", action: "window.audio-track-mixer" },
      { key: "effect-controls", label: "Effect Controls", action: "window.effect-controls" },
      { key: "effects-panel", label: "Effects", action: "window.effects-panel" },
      { key: "media-browser", label: "Media Browser", action: "window.media-browser" },
      { key: "program-monitor", label: "Program Monitor", action: "window.program-monitor" },
      { key: "projects", label: "Projects", action: "window.projects" },
      { key: "source-monitor", label: "Source Monitor", action: "window.source-monitor" },
      { key: "timeline", label: "Timeline", action: "window.timeline" }
    ]
  },
  {
    key: "help",
    label: "Help",
    items: [
      { key: "premiere-help", label: "Premiere Pro Help", action: "help.premiere-help" },
      { key: "learn", label: "Learn / Tutorials", action: "help.learn" },
      { key: "whats-new", label: "What's New", action: "help.whats-new" },
      { key: "compat-report", label: "System Compatibility Report", action: "help.compat-report" },
      { key: "account", label: "Manage Account / Sign In", action: "help.account" },
      { key: "updates", label: "Updates", action: "help.updates" },
      { key: "about", label: "About Premiere Pro", action: "help.about" }
    ]
  }
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
const VIDEO_FILTER_OPTIONS = [
  "normal",
  "cinematic",
  "mono",
  "vintage",
  "sunset",
  "teal-orange",
  "noir",
  "dream",
  "neon",
  "documentary"
];
const VIDEO_PRESET_TUNING = {
  normal: { b: 1, c: 1, s: 1, sepia: 0, hue: 0 },
  cinematic: { b: 0.96, c: 1.18, s: 0.9, sepia: 8, hue: -4 },
  vivid: { b: 1.05, c: 1.08, s: 1.24, sepia: 0, hue: 4 },
  mono: { b: 1, c: 1.1, s: 0.01, sepia: 0, hue: 0 },
  vintage: { b: 1.04, c: 0.94, s: 0.84, sepia: 18, hue: -6 },
  clean: { b: 1.06, c: 1.02, s: 1.08, sepia: 0, hue: 0 },
  sunset: { b: 1.02, c: 0.98, s: 1.12, sepia: 20, hue: -10 },
  "teal-orange": { b: 1, c: 1.14, s: 1.12, sepia: 10, hue: 12 },
  noir: { b: 0.9, c: 1.26, s: 0.04, sepia: 4, hue: 0 },
  dream: { b: 1.1, c: 0.88, s: 1.2, sepia: 8, hue: -8 },
  neon: { b: 1.08, c: 1.22, s: 1.42, sepia: 0, hue: 16 },
  documentary: { b: 1.02, c: 1.06, s: 0.82, sepia: 6, hue: -2 }
};
const SERVER_VIDEO_FILTER_PRESETS = new Set([
  "normal",
  "cinematic",
  "mono",
  "vintage",
  "sunset",
  "teal-orange",
  "noir",
  "dream",
  "neon",
  "documentary"
]);
const VIDEO_LOOK_CONTROL_SPECS = [
  { key: "brightness", label: "Brightness", min: 60, max: 150, suffix: "%" },
  { key: "contrast", label: "Contrast", min: 70, max: 150, suffix: "%" },
  { key: "saturation", label: "Saturation", min: 0, max: 180, suffix: "%" },
  { key: "hue", label: "Hue", min: -30, max: 30 },
  { key: "softness", label: "Softness", min: 0, max: 60 }
];
const TRANSITION_OPTIONS = ["cut", "fade", "dissolve", "zoom", "swipe"];
const LUT_PRESET_OPTIONS = ["none", "rec709-clean", "teal-orange", "cinematic-gold", "bw-film", "night-city"];
const KEYFRAME_EASE_OPTIONS = ["linear", "ease-in", "ease-out", "ease-in-out", "bezier-soft"];
const BLUR_TARGET_OPTIONS = [
  { value: "none", label: "Off" },
  { value: "face", label: "Face blur" },
  { value: "logo", label: "Logo blur" },
  { value: "object", label: "Object blur" },
  { value: "custom", label: "Custom region" }
];
const BLUR_SHAPE_OPTIONS = [
  { value: "rectangle", label: "Rectangle" },
  { value: "circle", label: "Circle" }
];
const BLUR_TRACKING_OPTIONS = [
  { value: "off", label: "Static" },
  { value: "smooth", label: "Smooth tracking" },
  { value: "aggressive", label: "Aggressive tracking" }
];
const BLUR_TRACK_MAX_POINTS = 240;
const BLUR_TRACK_MIN_DURATION = 0.6;
const BLUR_FACE_MAX_SUBJECTS = 8;
const BLUR_TRACK_MAX_INTERPOLATION_GAP = 0.58;
const BLUR_TRACK_MIN_CONFIDENCE = 0.36;
const BLUR_PREVIEW_CLICK_SELECT_THRESHOLD_PCT = 0.65;
const BLUR_PREVIEW_MIN_DRAW_SIZE_PCT = 1.2;
const BLUR_PREVIEW_HANDLE_HIT_RADIUS_PCT = 2.2;
const BLUR_PREVIEW_TOOL_OPTIONS = [
  { value: "select", label: "Arrow / Select" },
  { value: "draw", label: "Draw Tool" }
];
const BLUR_PREVIEW_RESIZE_HANDLES = ["nw", "ne", "sw", "se"];
const BLUR_MEDIAPIPE_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const BLUR_MEDIAPIPE_FACE_MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const TITLE_TEMPLATE_OPTIONS = ["clean", "bold-news", "cinema-intro", "gaming-lower-third", "minimal-lower-third"];
const TITLE_ANIMATION_OPTIONS = ["none", "slide-up", "typewriter", "pop", "glitch-in", "fade-in"];
const READY_MADE_WORKFLOW_OPTIONS = [
  {
    key: "davinci-resolve",
    label: "DaVinci Resolve",
    badge: "Best free pro workflow",
    note: "Hollywood style grade + edit + audio workflow in one flow.",
    bestFor: "Color grading and cinema editing",
    mainTools: [
      "Edit page: trim, cut, and arrange clips",
      "Color page: node-based Hollywood level grading",
      "Fusion: VFX, animation, and motion graphics",
      "Fairlight: professional audio repair and mixing",
      "Cut page: fast workflow for quick assemblies"
    ],
    options: [
      "HDR editing and face refinement tuning",
      "Advanced node graph control",
      "Multi-user collaboration"
    ],
    focusTool: "grading-pro",
    focusLookControl: "highlights",
    features: [
      "Cut + trim timeline control",
      "Cinematic color grading",
      "Audio mixing and leveling",
      "Motion graphics workflow"
    ],
    edits: {
      workflowPreset: "davinci-resolve",
      filterPreset: "cinematic",
      lutPreset: "cinematic-gold",
      hdrBoost: 58,
      highlights: 12,
      shadows: 16,
      saturation: 108,
      vibrance: 116,
      blackPoint: 18,
      grain: 18,
      sharpness: 28,
      transitionType: "dissolve",
      transitionDuration: 0.6,
      stabilization: 34,
      noiseRemoval: 42,
      autoSyncAudio: true,
      loudnessTarget: -14,
      keyframeEase: "bezier-soft",
      titleTemplate: "cinema-intro",
      titleAnimation: "fade-in",
      introDuration: 2.8
    }
  },
  {
    key: "adobe-premiere-pro",
    label: "Adobe Premiere Pro",
    badge: "Industry standard workflow",
    note: "Multi-track story edit flow with transitions and After Effects style handoff.",
    bestFor: "YouTube, films, and professional editors",
    mainTools: [
      "Timeline editing: cut, trim, and arrange clips",
      "Multi-camera editing lanes",
      "Color grading with LUT support",
      "Audio cleanup, mixing, and voice enhancement",
      "Text, titles, and speech-to-text caption workflow"
    ],
    options: [
      "4K and 8K export targets",
      "Photoshop and After Effects integration style",
      "Cloud collaboration style workflow"
    ],
    focusTool: "timeline-pro",
    focusLookControl: "contrast",
    features: [
      "Multi-track style clip workflow",
      "Effects and transition stack",
      "Balanced voice and music mix",
      "After Effects ready title pacing"
    ],
    edits: {
      workflowPreset: "adobe-premiere-pro",
      filterPreset: "clean",
      lutPreset: "rec709-clean",
      hdrBoost: 36,
      highlights: 6,
      shadows: 9,
      saturation: 104,
      vibrance: 108,
      sharpness: 16,
      transitionType: "fade",
      transitionDuration: 0.4,
      effectGlow: 12,
      stabilization: 20,
      panDrift: 10,
      zoomPulse: 8,
      autoSyncAudio: true,
      noiseRemoval: 30,
      loudnessTarget: -14,
      keyframeEase: "ease-in-out",
      titleTemplate: "bold-news",
      titleAnimation: "slide-up",
      introDuration: 2
    }
  },
  {
    key: "final-cut-pro",
    label: "Final Cut Pro",
    badge: "Best for Mac speed",
    note: "Fast magnetic timeline flow tuned for quick professional delivery.",
    bestFor: "Fast editing on Mac-style workflows",
    mainTools: [
      "Magnetic timeline style clip alignment",
      "Multicam track editing",
      "Color wheels and curve style balancing",
      "Motion graphics and title system",
      "Background rendering style output"
    ],
    options: [
      "Optimized high performance workflow",
      "Smooth 4K to 8K handling targets",
      "Fast export pipeline"
    ],
    focusTool: "timeline-pro",
    focusLookControl: "saturation",
    features: [
      "Quick assembly timeline",
      "Fast title finishing",
      "Stable multicam cadence",
      "Performance-first render pacing"
    ],
    edits: {
      workflowPreset: "final-cut-pro",
      filterPreset: "clean",
      lutPreset: "rec709-clean",
      hdrBoost: 30,
      highlights: 4,
      shadows: 8,
      saturation: 106,
      vibrance: 110,
      sharpness: 14,
      transitionType: "cut",
      transitionDuration: 0.25,
      stabilization: 28,
      panDrift: 14,
      zoomPulse: 12,
      autoSyncAudio: true,
      noiseRemoval: 22,
      loudnessTarget: -14,
      keyframeEase: "ease-out",
      titleTemplate: "minimal-lower-third",
      titleAnimation: "pop",
      introDuration: 1.8
    }
  },
  {
    key: "adobe-after-effects",
    label: "Adobe After Effects",
    badge: "VFX and motion graphics",
    note: "Effect-heavy compositing profile for cinematic motion graphics and advanced overlays.",
    bestFor: "Visual effects, compositing, and motion design",
    mainTools: [
      "Motion graphics for animated text and logo systems",
      "Green screen and chroma key compositing",
      "Tracking and layered compositing",
      "Cinematic effect stacks and overlays",
      "VFX-first timeline tuning"
    ],
    options: [
      "Built for Premiere round-trip style workflow",
      "Template-ready intro and outro setup",
      "Advanced compositing controls"
    ],
    focusTool: "fx-pro",
    focusLookControl: "contrast",
    features: [
      "Compositing-driven preset",
      "Tracking and mask bias",
      "VFX glow and glitch blend",
      "Title animation emphasis"
    ],
    edits: {
      workflowPreset: "adobe-after-effects",
      filterPreset: "neon",
      lutPreset: "night-city",
      contrast: 112,
      saturation: 114,
      vibrance: 124,
      transitionType: "dissolve",
      transitionDuration: 0.55,
      effectGlow: 34,
      effectGlitch: 22,
      chromaKeyEnabled: true,
      chromaStrength: 58,
      motionTrackingEnabled: true,
      keyframeEase: "bezier-soft",
      overlayMode: "screen",
      titleTemplate: "cinema-intro",
      titleAnimation: "glitch-in",
      introDuration: 3
    }
  },
  {
    key: "kinemaster-mobile",
    label: "KineMaster",
    badge: "Mobile pro editor",
    note: "Phone-first multi-layer editing with quick transitions, chroma, and speed controls.",
    bestFor: "Quick professional editing on phone",
    mainTools: [
      "Multi-layer edit workflow",
      "Chroma key and blend overlays",
      "Speed control and transition packs",
      "Audio layering and quick leveling"
    ],
    options: [
      "Mobile-optimized handling",
      "Fast social publish flow",
      "Template-style quick starts"
    ],
    focusTool: "edit",
    focusLookControl: "brightness",
    features: [
      "Fast cut and trim profile",
      "Phone-native control pacing",
      "Quick overlays and stickers",
      "Lightweight export tuning"
    ],
    edits: {
      workflowPreset: "kinemaster-mobile",
      filterPreset: "vivid",
      lutPreset: "none",
      transitionType: "swipe",
      transitionDuration: 0.35,
      playbackSpeed: 1.1,
      zoomPulse: 10,
      effectBlur: 4,
      autoSyncAudio: true,
      noiseRemoval: 14,
      titleTemplate: "bold-news",
      titleAnimation: "slide-up",
      introDuration: 1.2
    }
  },
  {
    key: "premiere-rush-mobile",
    label: "Adobe Premiere Rush",
    badge: "Simple + cloud sync style",
    note: "Balanced mobile profile for quick cuts, clean look, and cross-device style continuity.",
    bestFor: "Fast cross-device editing",
    mainTools: [
      "Simple timeline arrangement",
      "Quick color balancing",
      "Audio leveling and cleanup basics",
      "Title and caption readiness"
    ],
    options: [
      "Cloud-sync style workflow",
      "Quick publish outputs",
      "Clean social-ready presets"
    ],
    focusTool: "edit",
    focusLookControl: "contrast",
    features: [
      "Fast story assembly",
      "Clean color pass",
      "Voice and music balance",
      "Quick title finishing"
    ],
    edits: {
      workflowPreset: "premiere-rush-mobile",
      filterPreset: "clean",
      lutPreset: "rec709-clean",
      transitionType: "fade",
      transitionDuration: 0.3,
      brightness: 103,
      contrast: 104,
      saturation: 102,
      autoSyncAudio: true,
      noiseRemoval: 18,
      titleTemplate: "clean",
      titleAnimation: "fade-in",
      introDuration: 1.4
    }
  },
  {
    key: "capcut-mobile",
    label: "CapCut",
    badge: "AI and template heavy",
    note: "Trend-focused mobile workflow with AI-like effects, captions, and quick remixes.",
    bestFor: "Short-form content and fast trend editing",
    mainTools: [
      "Template-driven quick edit flow",
      "AI-style effects and transitions",
      "Auto caption and text overlays",
      "Multi-layer music and voice balance"
    ],
    options: [
      "Fast mobile publish speed",
      "Stylized social filters",
      "Quick remix-ready output"
    ],
    focusTool: "filters",
    focusLookControl: "vibrance",
    features: [
      "Trend-forward effect stack",
      "Auto-caption friendly setup",
      "Fast pacing transitions",
      "Template-friendly typography"
    ],
    edits: {
      workflowPreset: "capcut-mobile",
      filterPreset: "dream",
      lutPreset: "teal-orange",
      transitionType: "zoom",
      transitionDuration: 0.3,
      vibrance: 122,
      saturation: 114,
      effectGlow: 20,
      effectGlitch: 10,
      autoSyncAudio: true,
      noiseRemoval: 12,
      titleTemplate: "gaming-lower-third",
      titleAnimation: "typewriter",
      captionsStyle: "classic",
      introDuration: 1
    }
  }
];
const STICKER_OPTIONS = [
  { value: "none", label: "Off", Icon: null },
  { value: "spark", label: "Spark", Icon: FiZap },
  { value: "love", label: "Love", Icon: FiHeart },
  { value: "glow", label: "Glow", Icon: FiSun },
  { value: "frame", label: "Frame", Icon: FiImage },
  { value: "chat", label: "Chat", Icon: FiMessageSquare }
];
const STICKER_TEXT_FALLBACK = {
  spark: "âš¡",
  love: "â¤",
  glow: "â˜€",
  frame: "â–£",
  chat: "ðŸ’¬"
};

const defaultVideoEdits = {
  workflowPreset: "custom",
  trimStart: 0,
  trimEnd: 0,
  splitPoint: 0,
  splitPoints: [],
  reversePlayback: false,
  coverTime: 0,
  playbackSpeed: 1,
  volume: 100,
  muted: false,
  cropZoom: 100,
  cropX: 50,
  cropY: 50,
  rotate: 0,
  flipH: false,
  flipV: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  vibrance: 100,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
  hue: 0,
  tint: 0,
  sharpness: 0,
  softness: 0,
  grain: 0,
  fade: 0,
  blackPoint: 0,
  vignette: 0,
  lutPreset: "none",
  hdrBoost: 0,
  lutFileName: "",
  transitionType: "cut",
  transitionDuration: 0.4,
  blurMode: "global",
  effectBlur: 0,
  blurFace: 0,
  blurLogo: 0,
  blurCustom: 0,
  blurCustomX: 50,
  blurCustomY: 50,
  blurCustomWidth: 30,
  blurCustomHeight: 30,
  blurTargetType: "none",
  blurShape: "rectangle",
  blurIntensity: 45,
  blurFeather: 8,
  blurTracking: "off",
  blurStart: 0,
  blurEnd: 0,
  blurX: 33,
  blurY: 24,
  blurWidth: 34,
  blurHeight: 34,
  blurTrackPoints: [],
  blurSubjects: [],
  activeBlurSubjectId: "",
  effectGlow: 0,
  effectGlitch: 0,
  chromaKeyEnabled: false,
  chromaStrength: 50,
  maskShape: "none",
  maskFeather: 0,
  keyframeEase: "linear",
  motionTrackingEnabled: false,
  stabilization: 0,
  panDrift: 0,
  zoomPulse: 0,
  noiseRemoval: 0,
  autoSyncAudio: false,
  loudnessTarget: -14,
  deEss: 0,
  titleTemplate: "clean",
  titleAnimation: "slide-up",
  lowerThirdText: "",
  introDuration: 2,
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

const TIMELINE_TRACKS = [
  { id: "video-1", label: "Video 1", accepts: ["video"] },
  { id: "overlay-1", label: "Overlay 1", accepts: ["text", "sticker"] },
  { id: "overlay-2", label: "Overlay 2", accepts: ["text", "sticker"] },
  { id: "audio-1", label: "Audio 1", accepts: ["audio"] }
];

const TIMELINE_BASE_CANVAS_WIDTH = 1280;
const TIMELINE_MIN_CLIP_SECONDS = 0.2;

const timelineTrackForType = (type) => {
  if (type === "video") return "video-1";
  if (type === "audio") return "audio-1";
  return "overlay-1";
};

const clipAllowedOnTrack = (clip, trackId) => {
  const track = TIMELINE_TRACKS.find((item) => item.id === trackId);
  if (!track || !clip) return false;
  return track.accepts.includes(clip.type);
};

const makeTimelineClipId = (type = "clip") =>
  `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeBlurFaceSubjectId = () =>
  `face-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatTimelineTime = (seconds) => {
  const value = Math.max(0, Number(seconds || 0));
  const total = Math.floor(value);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const ms = Math.floor((value - total) * 10);
  return `${mins}:${String(secs).padStart(2, "0")}.${ms}`;
};

const formatTimelineTimecode = (seconds, fps = 30) => {
  const value = Math.max(0, Number(seconds || 0));
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const frame = Math.floor((value - totalSeconds) * fps);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
};

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, value));
const cloneSerializable = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const isOverlayTimelineClip = (clipLike) => {
  const clip = clipLike || {};
  return (clip.type === "text" || clip.type === "sticker") && clip.disabled !== true;
};
const resolveTimelineShapeKind = (clipLike) => {
  const raw = String(clipLike?.payload?.graphicShape || "").trim().toLowerCase();
  if (raw === "ellipse" || raw === "circle") return "ellipse";
  if (raw === "rectangle" || raw === "rect") return "rectangle";
  return "";
};
const isTimelineShapeClip = (clipLike) => {
  const clip = clipLike || {};
  return clip.type === "text" && !!resolveTimelineShapeKind(clip);
};
const resolveBlurTargetType = (rawValue) => {
  const raw = String(rawValue || "").trim().toLowerCase();
  if (BLUR_TARGET_OPTIONS.some((option) => option.value === raw)) return raw;
  if (["global", "off"].includes(raw)) return "none";
  if (["people", "person", "head"].includes(raw)) return "face";
  if (["brand", "watermark"].includes(raw)) return "logo";
  if (["item", "thing"].includes(raw)) return "object";
  if (["region", "area"].includes(raw)) return "custom";
  return "none";
};
const defaultBlurRegionForTarget = (targetType) => {
  switch (resolveBlurTargetType(targetType)) {
    case "face":
      return { x: 36, y: 16, width: 30, height: 34, shape: "circle" };
    case "logo":
      return { x: 72, y: 5, width: 22, height: 14, shape: "rectangle" };
    case "object":
      return { x: 34, y: 34, width: 30, height: 28, shape: "rectangle" };
    case "custom":
      return { x: 33, y: 24, width: 34, height: 34, shape: "rectangle" };
    default:
      return { x: 33, y: 24, width: 34, height: 34, shape: "rectangle" };
  }
};
const resolveBlurShape = (rawShape, fallback = "rectangle") => {
  const shape = String(rawShape || "").trim().toLowerCase();
  if (shape === "circle" || shape === "ellipse") return "circle";
  if (shape === "rectangle" || shape === "rect" || shape === "box") return "rectangle";
  return fallback;
};
const resolveBlurTracking = (rawTracking, fallback = "off") => {
  const tracking = String(rawTracking || "").trim().toLowerCase();
  if (BLUR_TRACKING_OPTIONS.some((option) => option.value === tracking)) return tracking;
  return fallback;
};
const clampBlurRegionPct = (regionLike) => {
  const region = regionLike || {};
  const width = clampNumber(toNumber(region.width, 30), 1, 100);
  const height = clampNumber(toNumber(region.height, 30), 1, 100);
  const x = clampNumber(toNumber(region.x, 35), 0, Math.max(0, 100 - width));
  const y = clampNumber(toNumber(region.y, 20), 0, Math.max(0, 100 - height));
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4))
  };
};
const centerDistanceSq = (aLike, bLike) => {
  const a = aLike || {};
  const b = bLike || {};
  const ax = Number(a.x || 0) + Number(a.width || 0) / 2;
  const ay = Number(a.y || 0) + Number(a.height || 0) / 2;
  const bx = Number(b.x || 0) + Number(b.width || 0) / 2;
  const by = Number(b.y || 0) + Number(b.height || 0) / 2;
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
const detectionConfidence = (detectionLike) => {
  const detection = detectionLike || {};
  const direct = Number(detection?.score);
  if (Number.isFinite(direct)) return clampNumber(direct, 0, 1);
  const categoryScore = Number(Array.isArray(detection?.categories) ? detection.categories[0]?.score : NaN);
  if (Number.isFinite(categoryScore)) return clampNumber(categoryScore, 0, 1);
  return 1;
};
const bboxToBlurRegionPct = (bboxLike, videoWidth, videoHeight, shape = "rectangle", feather = 0) => {
  const bbox = bboxLike || {};
  const rawX = toNumber(bbox.x ?? bbox.left ?? bbox.originX ?? bbox.xMin, 0);
  const rawY = toNumber(bbox.y ?? bbox.top ?? bbox.originY ?? bbox.yMin, 0);
  const rawW = Math.max(1, toNumber(bbox.width, 1));
  const rawH = Math.max(1, toNumber(bbox.height, 1));
  const safeW = Math.max(1, toNumber(videoWidth, 1));
  const safeH = Math.max(1, toNumber(videoHeight, 1));
  let x = (rawX / safeW) * 100;
  let y = (rawY / safeH) * 100;
  let width = (rawW / safeW) * 100;
  let height = (rawH / safeH) * 100;

  const shapeKey = resolveBlurShape(shape, "rectangle");
  const facePad = shapeKey === "circle" ? 0.18 : 0.14;
  const featherPad = clampNumber(toNumber(feather, 0), 0, 40) / 260;
  const padX = width * (facePad + featherPad * 0.25);
  const padY = height * (facePad + featherPad * 0.35);
  x -= padX / 2;
  y -= padY / 2;
  width += padX;
  height += padY;

  if (shapeKey === "circle") {
    const size = Math.max(width, height);
    const cx = x + width / 2;
    const cy = y + height / 2;
    width = size;
    height = size;
    x = cx - size / 2;
    y = cy - size / 2;
  }

  return clampBlurRegionPct({ x, y, width, height });
};
const normalizeBlurTrackPoints = (pointsLike, duration) => {
  const safeDuration = Math.max(0, toNumber(duration, 0));
  const list = Array.isArray(pointsLike) ? pointsLike : [];
  return list
    .map((point) => {
      const time = clampNumber(toNumber(point?.time, 0), 0, safeDuration || Number.MAX_SAFE_INTEGER);
      const region = clampBlurRegionPct(point || {});
      const visible = point?.visible !== false;
      return {
        time: Number(time.toFixed(3)),
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        visible
      };
    })
    .sort((a, b) => a.time - b.time);
};
const getBlurTrackRegionAtTime = (pointsLike, currentTime) => {
  const points = Array.isArray(pointsLike) ? pointsLike : [];
  if (!points.length) return null;
  const t = Math.max(0, toNumber(currentTime, 0));
  if (points.length === 1 || t <= Number(points[0].time || 0)) {
    return points[0]?.visible === false ? null : points[0];
  }
  const last = points[points.length - 1];
  if (t >= Number(last.time || 0)) return last?.visible === false ? null : last;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    const prevT = Number(prev.time || 0);
    const nextT = Number(next.time || 0);
    if (nextT <= prevT) continue;
    if (t < prevT || t > nextT) continue;
    if (nextT - prevT > BLUR_TRACK_MAX_INTERPOLATION_GAP) return null;
    if (prev?.visible === false || next?.visible === false) return null;
    const ratio = clampNumber((t - prevT) / (nextT - prevT), 0, 1);
    return {
      x: Number((prev.x + (next.x - prev.x) * ratio).toFixed(4)),
      y: Number((prev.y + (next.y - prev.y) * ratio).toFixed(4)),
      width: Number((prev.width + (next.width - prev.width) * ratio).toFixed(4)),
      height: Number((prev.height + (next.height - prev.height) * ratio).toFixed(4))
    };
  }
  return points[0]?.visible === false ? null : points[0];
};
const normalizeBlurSubjects = (subjectsLike, duration) => {
  const safeDuration = Math.max(0, toNumber(duration, 0));
  const list = Array.isArray(subjectsLike) ? subjectsLike : [];
  return list
    .map((item, index) => {
      const id = String(item?.id || `face-${index + 1}`).trim();
      const labelRaw = String(item?.label || "").trim();
      const label = labelRaw || `Face ${index + 1}`;
      const shape = resolveBlurShape(item?.shape || item?.blurShape, "circle");
      const intensity = clampNumber(toNumber(item?.intensity, item?.blurIntensity), 0, 100);
      const feather = clampNumber(toNumber(item?.feather, item?.blurFeather), 0, 40);
      const tracking = resolveBlurTracking(item?.tracking || item?.blurTracking, "smooth");
      const start = Math.max(0, toNumber(item?.start, item?.blurStart));
      const endRaw = Math.max(0, toNumber(item?.end, item?.blurEnd));
      const end = endRaw > start + 0.05 ? endRaw : 0;
      const points = normalizeBlurTrackPoints(
        item?.trackPoints || item?.points || item?.blurTrackPoints,
        safeDuration
      ).slice(0, BLUR_TRACK_MAX_POINTS);
      const thumb = typeof item?.thumb === "string" ? item.thumb : "";
      return {
        id,
        label,
        shape,
        intensity,
        feather,
        tracking,
        start,
        end,
        trackPoints: points,
        thumb
      };
    })
    .filter((item) => item.trackPoints.length >= 2)
    .slice(0, BLUR_FACE_MAX_SUBJECTS);
};
const remapBlurTrackGeometry = (pointsLike, patchLike) => {
  const points = Array.isArray(pointsLike) ? pointsLike : [];
  if (!points.length) return [];
  const patch = patchLike || {};
  const firstVisible = points.find((point) => point?.visible !== false) || points[0];
  if (!firstVisible) return points;
  const current = clampBlurRegionPct(firstVisible);
  const nextWidth =
    patch.width == null ? current.width : clampNumber(toNumber(patch.width, current.width), 1, 100);
  const nextHeight =
    patch.height == null ? current.height : clampNumber(toNumber(patch.height, current.height), 1, 100);
  const nextX =
    patch.x == null
      ? current.x
      : clampNumber(toNumber(patch.x, current.x), 0, Math.max(0, 100 - nextWidth));
  const nextY =
    patch.y == null
      ? current.y
      : clampNumber(toNumber(patch.y, current.y), 0, Math.max(0, 100 - nextHeight));
  const dx = nextX - current.x;
  const dy = nextY - current.y;
  const scaleW = current.width > 0 ? nextWidth / current.width : 1;
  const scaleH = current.height > 0 ? nextHeight / current.height : 1;
  return points.map((point) => {
    const p = clampBlurRegionPct(point || {});
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    const nextPointWidth = clampNumber(p.width * scaleW, 1, 100);
    const nextPointHeight = clampNumber(p.height * scaleH, 1, 100);
    const nextPointX = clampNumber(cx - nextPointWidth / 2 + dx, 0, Math.max(0, 100 - nextPointWidth));
    const nextPointY = clampNumber(cy - nextPointHeight / 2 + dy, 0, Math.max(0, 100 - nextPointHeight));
    return {
      ...point,
      x: Number(nextPointX.toFixed(4)),
      y: Number(nextPointY.toFixed(4)),
      width: Number(nextPointWidth.toFixed(4)),
      height: Number(nextPointHeight.toFixed(4))
    };
  });
};
const resolveBlurIntensityForTarget = (edits, targetType) => {
  const source = edits || {};
  const target = resolveBlurTargetType(targetType || source.blurTargetType || source.blurMode);
  const explicit = Number(source.blurIntensity);
  if (Number.isFinite(explicit) && target !== "none") {
    return clampNumber(explicit, 0, 100);
  }
  if (target === "face") return clampNumber(toNumber(source.blurFace, 0), 0, 100);
  if (target === "logo") return clampNumber(toNumber(source.blurLogo, 0), 0, 100);
  if (target === "object" || target === "custom") return clampNumber(toNumber(source.blurCustom, 0), 0, 100);
  return 0;
};

const normalizeVideoEditsForServer = (videoEdits) => {
  const source = videoEdits || {};
  const presetKey = String(source.filterPreset || "normal").toLowerCase();
  const tuning = VIDEO_PRESET_TUNING[presetKey] || VIDEO_PRESET_TUNING.normal;

  const exposureBoost = toNumber(source.exposure, 0) * 0.55;
  const highlightsBoost = toNumber(source.highlights, 0) * 0.35;
  const shadowsLift = toNumber(source.shadows, 0) * 0.22;
  const sharpnessBoost = toNumber(source.sharpness, 0) * 0.2;
  const vibranceBoost = (toNumber(source.vibrance, 100) - 100) * 0.72;
  const blackPointBoost = toNumber(source.blackPoint, 0) * 0.45;

  const brightness = clampNumber(
    Math.round(toNumber(source.brightness, 100) * tuning.b + exposureBoost + highlightsBoost + shadowsLift),
    40,
    220
  );
  const contrast = clampNumber(
    Math.round(
      toNumber(source.contrast, 100) * tuning.c +
      blackPointBoost +
      sharpnessBoost -
      toNumber(source.shadows, 0) * 0.16
    ),
    40,
    220
  );
  const saturation = clampNumber(
    Math.round(toNumber(source.saturation, 100) * tuning.s + vibranceBoost + sharpnessBoost * 0.1),
    0,
    260
  );
  const hue = clampNumber(
    toNumber(source.hue, 0) + tuning.hue + toNumber(source.tint, 0) * 0.45 - toNumber(source.warmth, 0) * 0.22,
    -180,
    180
  );
  const blurMode = String(source.blurMode || "").toLowerCase();
  let blurTargetType = resolveBlurTargetType(source.blurTargetType || source.blurTarget || blurMode);
  if (blurTargetType === "none" && ["face", "logo", "custom"].includes(blurMode)) {
    blurTargetType = blurMode === "custom" ? "custom" : blurMode;
  }
  const presetRegion = defaultBlurRegionForTarget(blurTargetType);
  const blurShape = resolveBlurShape(source.blurShape || source.maskShape, presetRegion.shape);
  const blurTracking = resolveBlurTracking(
    source.blurTracking,
    source.motionTrackingEnabled ? "smooth" : "off"
  );
  const blurWidth = clampNumber(toNumber(source.blurWidth, source.blurCustomWidth ?? presetRegion.width), 1, 100);
  const blurHeight = clampNumber(toNumber(source.blurHeight, source.blurCustomHeight ?? presetRegion.height), 1, 100);
  const customCenterX = clampNumber(toNumber(source.blurCustomX, presetRegion.x + presetRegion.width / 2), 0, 100);
  const customCenterY = clampNumber(toNumber(source.blurCustomY, presetRegion.y + presetRegion.height / 2), 0, 100);
  const fallbackX = customCenterX - blurWidth / 2;
  const fallbackY = customCenterY - blurHeight / 2;
  const blurX = clampNumber(toNumber(source.blurX, fallbackX), 0, 99);
  const blurY = clampNumber(toNumber(source.blurY, fallbackY), 0, 99);
  const blurStart = Math.max(0, toNumber(source.blurStart, 0));
  const blurEndRaw = Math.max(0, toNumber(source.blurEnd, 0));
  const blurEnd = blurEndRaw > blurStart + 0.05 ? blurEndRaw : 0;
  const targetIntensityKey =
    blurTargetType === "face" ? "blurFace" : blurTargetType === "logo" ? "blurLogo" : "blurCustom";
  const blurIntensity = clampNumber(
    toNumber(source.blurIntensity, source[targetIntensityKey] ?? source.blurCustom ?? 45),
    0,
    100
  );
  const blurFeather = clampNumber(toNumber(source.blurFeather, source.maskFeather), 0, 40);
  const safeTrackDuration = Math.max(toNumber(source.blurEnd, 0), toNumber(source.trimEnd, 0), 0);
  const blurTrackPoints = normalizeBlurTrackPoints(
    source.blurTrackPoints,
    safeTrackDuration
  ).slice(0, BLUR_TRACK_MAX_POINTS);
  const blurSubjects = normalizeBlurSubjects(source.blurSubjects, safeTrackDuration);
  const requestedActiveBlurSubjectId = String(source.activeBlurSubjectId || "").trim();
  const activeBlurSubject =
    blurSubjects.find((subject) => subject.id === requestedActiveBlurSubjectId) || blurSubjects[0] || null;
  const resolvedBlurShape = activeBlurSubject ? activeBlurSubject.shape : blurShape;
  const resolvedBlurIntensity = activeBlurSubject
    ? clampNumber(toNumber(activeBlurSubject.intensity, blurIntensity), 0, 100)
    : blurIntensity;
  const resolvedBlurFeather = activeBlurSubject
    ? clampNumber(toNumber(activeBlurSubject.feather, blurFeather), 0, 40)
    : blurFeather;
  const resolvedBlurTracking = activeBlurSubject
    ? resolveBlurTracking(activeBlurSubject.tracking, blurTracking)
    : blurTracking;
  const resolvedBlurStart = activeBlurSubject
    ? Math.max(0, toNumber(activeBlurSubject.start, blurStart))
    : blurStart;
  const resolvedBlurEndRaw = activeBlurSubject
    ? Math.max(0, toNumber(activeBlurSubject.end, blurEnd))
    : blurEnd;
  const resolvedBlurEnd = resolvedBlurEndRaw > resolvedBlurStart + 0.05 ? resolvedBlurEndRaw : 0;
  const resolvedBlurTrackPoints = activeBlurSubject
    ? normalizeBlurTrackPoints(activeBlurSubject.trackPoints, safeTrackDuration).slice(0, BLUR_TRACK_MAX_POINTS)
    : blurTrackPoints;
  const firstResolvedPoint = resolvedBlurTrackPoints[0] || null;
  const resolvedBlurWidth = firstResolvedPoint
    ? clampNumber(toNumber(firstResolvedPoint.width, blurWidth), 1, 100)
    : blurWidth;
  const resolvedBlurHeight = firstResolvedPoint
    ? clampNumber(toNumber(firstResolvedPoint.height, blurHeight), 1, 100)
    : blurHeight;
  const resolvedBlurX = firstResolvedPoint
    ? clampNumber(toNumber(firstResolvedPoint.x, blurX), 0, Math.max(0, 100 - resolvedBlurWidth))
    : blurX;
  const resolvedBlurY = firstResolvedPoint
    ? clampNumber(toNumber(firstResolvedPoint.y, blurY), 0, Math.max(0, 100 - resolvedBlurHeight))
    : blurY;
  if (blurSubjects.length > 0) {
    blurTargetType = "face";
  }
  const compatMode = blurTargetType === "none" ? "global" : blurTargetType === "object" ? "custom" : blurTargetType;
  const compatFace = compatMode === "face" ? resolvedBlurIntensity : clampNumber(toNumber(source.blurFace, 0), 0, 100);
  const compatLogo = compatMode === "logo" ? blurIntensity : clampNumber(toNumber(source.blurLogo, 0), 0, 100);
  const compatCustom =
    compatMode === "custom" ? blurIntensity : clampNumber(toNumber(source.blurCustom, 0), 0, 100);

  const normalized = {
    ...source,
    brightness,
    contrast,
    saturation,
    hue,
    softness: clampNumber(toNumber(source.softness, 0), 0, 60),
    blurMode: compatMode,
    effectBlur: clampNumber(toNumber(source.effectBlur, 0), 0, 100),
    blurFace: compatFace,
    blurLogo: compatLogo,
    blurCustom: compatCustom,
    blurCustomX: Number((resolvedBlurX + resolvedBlurWidth / 2).toFixed(3)),
    blurCustomY: Number((resolvedBlurY + resolvedBlurHeight / 2).toFixed(3)),
    blurCustomWidth: Number(resolvedBlurWidth.toFixed(3)),
    blurCustomHeight: Number(resolvedBlurHeight.toFixed(3)),
    blurTargetType,
    blurShape: resolvedBlurShape,
    blurIntensity: Number(resolvedBlurIntensity.toFixed(3)),
    blurFeather: Number(resolvedBlurFeather.toFixed(3)),
    blurTracking: resolvedBlurTracking,
    blurStart: Number(resolvedBlurStart.toFixed(3)),
    blurEnd: Number(resolvedBlurEnd.toFixed(3)),
    blurX: Number(resolvedBlurX.toFixed(3)),
    blurY: Number(resolvedBlurY.toFixed(3)),
    blurWidth: Number(resolvedBlurWidth.toFixed(3)),
    blurHeight: Number(resolvedBlurHeight.toFixed(3)),
    blurTrackPoints: resolvedBlurTrackPoints,
    blurSubjects: blurSubjects.map((subject) => ({
      id: subject.id,
      label: subject.label,
      shape: subject.shape,
      intensity: Number(clampNumber(toNumber(subject.intensity, 0), 0, 100).toFixed(3)),
      feather: Number(clampNumber(toNumber(subject.feather, 0), 0, 40).toFixed(3)),
      tracking: resolveBlurTracking(subject.tracking, "smooth"),
      start: Number(Math.max(0, toNumber(subject.start, 0)).toFixed(3)),
      end: Number(Math.max(0, toNumber(subject.end, 0)).toFixed(3)),
      trackPoints: normalizeBlurTrackPoints(subject.trackPoints, safeTrackDuration).slice(0, BLUR_TRACK_MAX_POINTS)
    })),
    activeBlurSubjectId: activeBlurSubject?.id || "",
    maskShape: resolvedBlurShape,
    maskFeather: Number(resolvedBlurFeather.toFixed(3)),
    motionTrackingEnabled: resolvedBlurTracking !== "off"
  };

  if (!SERVER_VIDEO_FILTER_PRESETS.has(String(normalized.filterPreset || "").toLowerCase())) {
    normalized.filterPreset = "normal";
  }

  return normalized;
};

const normalizeTimelineClipsForServer = (clips, rawDuration) => {
  const safeDuration = Math.max(TIMELINE_MIN_CLIP_SECONDS, toNumber(rawDuration, 0));
  const allowedPositions = new Set(POSITION_OPTIONS.map((option) => option.value));
  const source = Array.isArray(clips) ? clips : [];

  return source
    .map((clip) => {
      const type = String(clip?.type || "").trim().toLowerCase();
      if (!["video", "text", "sticker", "audio"].includes(type)) return null;

      const maxStart = Math.max(0, safeDuration - TIMELINE_MIN_CLIP_SECONDS);
      const start = clampNumber(toNumber(clip?.start, 0), 0, maxStart);
      const end = clampNumber(
        toNumber(clip?.end, start + TIMELINE_MIN_CLIP_SECONDS),
        start + TIMELINE_MIN_CLIP_SECONDS,
        safeDuration
      );
      const fallbackTrackId = timelineTrackForType(type);
      const requestedTrackId = String(clip?.trackId || fallbackTrackId).trim() || fallbackTrackId;
      const trackId = clipAllowedOnTrack({ type }, requestedTrackId) ? requestedTrackId : fallbackTrackId;

      const payload = {};
      if (type === "text") {
        const text = String(clip?.payload?.text || clip?.label || "").trim();
        if (!text) return null;
        const position = String(clip?.payload?.textPosition || "bottom-center").trim();
        const graphicShape = resolveTimelineShapeKind(clip);
        payload.text = text;
        payload.textSize = clampNumber(toNumber(clip?.payload?.textSize, 34), 16, 128);
        payload.textPosition = allowedPositions.has(position) ? position : "bottom-center";
        payload.overlayOpacity = clampNumber(toNumber(clip?.payload?.overlayOpacity, 70), 0, 100);
        payload.overlayMode = String(clip?.payload?.overlayMode || "screen").trim() || "screen";
        if (graphicShape) payload.graphicShape = graphicShape;
      } else if (type === "sticker") {
        const sticker = String(clip?.payload?.sticker || "").trim();
        if (!sticker || sticker === "none") return null;
        const position = String(clip?.payload?.stickerPosition || "top-right").trim();
        payload.sticker = sticker;
        payload.stickerSize = clampNumber(toNumber(clip?.payload?.stickerSize, 72), 34, 180);
        payload.stickerPosition = allowedPositions.has(position) ? position : "top-right";
        payload.overlayMode = String(clip?.payload?.overlayMode || "screen").trim() || "screen";
      }

      return {
        id: String(clip?.id || makeTimelineClipId(type)),
        type,
        trackId,
        start: Number(start.toFixed(4)),
        end: Number(end.toFixed(4)),
        label: String(clip?.label || "").trim().slice(0, 120),
        payload
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
};

const applyTimelineToVideoEdits = (videoEdits, timelineClips) => {
  const source = { ...(videoEdits || {}) };
  const clips = Array.isArray(timelineClips) ? timelineClips : [];
  if (!clips.length) return source;

  const videoClips = clips
    .filter((clip) => clip.type === "video")
    .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  if (videoClips.length) {
    const firstVideoClip = videoClips[0];
    const lastVideoClip = videoClips[videoClips.length - 1];
    source.trimStart = Number(toNumber(firstVideoClip.start, source.trimStart || 0).toFixed(4));
    source.trimEnd = Number(
      toNumber(lastVideoClip.end, source.trimEnd || 0).toFixed(4)
    );
  }

  const firstTextClip = clips.find((clip) => clip.type === "text" && String(clip?.payload?.text || "").trim());
  if (firstTextClip) {
    source.overlayText = String(firstTextClip.payload.text || "").trim();
    source.textSize = clampNumber(toNumber(firstTextClip?.payload?.textSize, source.textSize || 34), 16, 128);
    source.textPosition = String(firstTextClip?.payload?.textPosition || source.textPosition || "bottom-center");
    source.overlayOpacity = clampNumber(
      toNumber(firstTextClip?.payload?.overlayOpacity, source.overlayOpacity || 70),
      0,
      100
    );
    source.overlayMode = String(firstTextClip?.payload?.overlayMode || source.overlayMode || "screen");
  }

  const firstStickerClip = clips.find((clip) => clip.type === "sticker" && String(clip?.payload?.sticker || "").trim());
  if (firstStickerClip) {
    source.sticker = String(firstStickerClip.payload.sticker || source.sticker || "none");
    source.stickerSize = clampNumber(toNumber(firstStickerClip?.payload?.stickerSize, source.stickerSize || 72), 34, 180);
    source.stickerPosition = String(firstStickerClip?.payload?.stickerPosition || source.stickerPosition || "top-right");
    source.overlayMode = String(firstStickerClip?.payload?.overlayMode || source.overlayMode || "screen");
  }

  return source;
};

const normalizeTrimWindowForServer = (videoEdits, durationSeconds) => {
  const next = { ...(videoEdits || {}) };
  const safeDuration = Math.max(0, toNumber(durationSeconds, 0));
  if (safeDuration <= 0) return next;

  const trimStart = clampNumber(toNumber(next.trimStart, 0), 0, Math.max(0, safeDuration - 0.05));
  const trimEndRaw = toNumber(next.trimEnd, 0);
  const fullRange =
    trimStart <= 0.05 &&
    (trimEndRaw <= 0 || Math.abs(trimEndRaw - safeDuration) <= 0.08);

  if (fullRange) {
    next.trimStart = 0;
    next.trimEnd = 0;
    return next;
  }

  const minEnd = Math.min(safeDuration, trimStart + 0.05);
  const trimEnd = clampNumber(trimEndRaw, minEnd, safeDuration);
  next.trimStart = Number(trimStart.toFixed(4));
  next.trimEnd = Number(trimEnd.toFixed(4));
  return next;
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
  const sourceMonitorMenuRef = useRef(null);
  const premiereMenuBarRef = useRef(null);
  const mediaPickerInputRef = useRef(null);
  const projectPickerInputRef = useRef(null);
  const timelineWorkspaceRef = useRef(null);
  const timelineViewportRef = useRef(null);
  const timelineTrackRefs = useRef({});
  const timelineClipboardRef = useRef(null);
  const timelineHistoryRef = useRef({ undo: [], redo: [] });
  const timelineHistoryCaptureBlockedRef = useRef(false);
  const timelineLastSnapshotRef = useRef("");
  const blurMediaPipeFaceDetectorRef = useRef(null);
  const blurMediaPipeFaceDetectorLoadRef = useRef(null);
  const blurFaceSubjectCounterRef = useRef(1);
  const previewStageRef = useRef(null);
  const blurPreviewDragRef = useRef(null);
  const initialContentTypeConfig = readContentTypeConfig();
  const [file, setFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [msg, setMsg] = useState("");
  const [activePremiereMenuKey, setActivePremiereMenuKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState(defaultEdits);
  const [activeImageTool, setActiveImageTool] = useState("looks");
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [videoMeta, setVideoMeta] = useState({ duration: 0, width: 0, height: 0 });
  const [videoEdits, setVideoEdits] = useState(defaultVideoEdits);
  const [activeVideoLookControl, setActiveVideoLookControl] = useState(VIDEO_LOOK_CONTROL_SPECS[0].key);
  const [activeVideoTool, setActiveVideoTool] = useState(() => resolveVideoToolKey("edit"));
  const [activeVideoToolGroup, setActiveVideoToolGroup] = useState(() => getVideoToolGroupKey("edit"));
  const [activeVideoBottomPage, setActiveVideoBottomPage] = useState("timeline");
  const [timelineUpperMode, setTimelineUpperMode] = useState("video");
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelinePlayhead, setTimelinePlayhead] = useState(0);
  const [timelineClips, setTimelineClips] = useState([]);
  const [timelineSelectedClipId, setTimelineSelectedClipId] = useState("");
  const [timelineClipDrawerOpen, setTimelineClipDrawerOpen] = useState(true);
  const [timelinePreviewPlaying, setTimelinePreviewPlaying] = useState(false);
  const [timelineEditTool, setTimelineEditTool] = useState("select");
  const [timelineSnapEnabled, setTimelineSnapEnabled] = useState(true);
  const [timelineLinkedClips, setTimelineLinkedClips] = useState(true);
  const [sourceMonitorPanelVisible, setSourceMonitorPanelVisible] = useState(true);
  const [sourceMonitorUndocked, setSourceMonitorUndocked] = useState(false);
  const [timelineInspectorOpen, setTimelineInspectorOpen] = useState(true);
  const [timelineSettingsOpen, setTimelineSettingsOpen] = useState(true);
  const [timelineVoiceInputOn, setTimelineVoiceInputOn] = useState(false);
  const [timelineCaptionsOn, setTimelineCaptionsOn] = useState(false);
  const [timelineRulersVisible, setTimelineRulersVisible] = useState(true);
  const [timelineGuidesVisible, setTimelineGuidesVisible] = useState(false);
  const [timelineGuidesLocked, setTimelineGuidesLocked] = useState(false);
  const [timelineGuides, setTimelineGuides] = useState([]);
  const [monitorSafeMarginsVisible, setMonitorSafeMarginsVisible] = useState(false);
  const [timelineTimecodeDisplay, setTimelineTimecodeDisplay] = useState("timecode");
  const [timelineMarkers, setTimelineMarkers] = useState([]);
  const [sourceMonitorMenuOpen, setSourceMonitorMenuOpen] = useState(false);
  const [sourceMonitorOpenClipIds, setSourceMonitorOpenClipIds] = useState([]);
  const [coverFrames, setCoverFrames] = useState([]);
  const [customCoverFile, setCustomCoverFile] = useState(null);
  const [customCoverPreviewUrl, setCustomCoverPreviewUrl] = useState("");
  const [extraClips, setExtraClips] = useState([]);
  const [blurTrackBusy, setBlurTrackBusy] = useState(false);
  const [blurTrackStatus, setBlurTrackStatus] = useState("");
  const [blurPreviewTool, setBlurPreviewTool] = useState("select");
  const [blurPreviewHoverCursor, setBlurPreviewHoverCursor] = useState("default");
  const [blurPreviewDraftRegion, setBlurPreviewDraftRegion] = useState(null);
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
  const [showPublishSettings, setShowPublishSettings] = useState(true);
  const [showPublicSettings, setShowPublicSettings] = useState(true);
  const [contentTypeConfig, setContentTypeConfig] = useState(initialContentTypeConfig);
  const uploadType = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get("type") || "").toLowerCase();
  }, [location.search]);
  const isReelUpload = uploadType === "reel";
  const isLongVideoUpload = uploadType === "long-video" || uploadType === "long" || uploadType === "watch";
  const isPhotoPostUpload = !isReelUpload && !isLongVideoUpload;
  const preferWhiteVideoWorkspace = isReelUpload;
  const isPublicAudience = creatorSettings.audience === "public";
  const timelineDuration = Math.max(0.5, Number(videoMeta.duration || 0));
  const formatTimelineDisplayTime = (seconds) => (
    timelineTimecodeDisplay === "seconds"
      ? `${formatTimelineTime(seconds)}s`
      : formatTimelineTimecode(seconds)
  );
  const buildTimelineEditorSnapshot = useCallback((includePlayhead = false) => {
    const snapshot = {
      caption,
      videoTitle,
      activeVideoTool,
      activeVideoToolGroup,
      activeVideoBottomPage,
      timelineUpperMode,
      timelineZoom,
      timelineClips: cloneSerializable(timelineClips),
      timelineSelectedClipId,
      timelineEditTool,
      timelineSnapEnabled,
      timelineLinkedClips,
      sourceMonitorPanelVisible,
      sourceMonitorUndocked,
      timelineInspectorOpen,
      timelineSettingsOpen,
      timelineVoiceInputOn,
      timelineCaptionsOn,
      timelineRulersVisible,
      timelineGuidesVisible,
      timelineGuidesLocked,
      timelineGuides: cloneSerializable(timelineGuides),
      monitorSafeMarginsVisible,
      timelineTimecodeDisplay,
      timelineMarkers: cloneSerializable(timelineMarkers),
      videoEdits: cloneSerializable(videoEdits),
      creatorSettings: cloneSerializable(creatorSettings)
    };
    if (includePlayhead) snapshot.timelinePlayhead = Number(timelinePlayhead || 0);
    return snapshot;
  }, [
    caption,
    videoTitle,
    activeVideoTool,
    activeVideoToolGroup,
    activeVideoBottomPage,
    timelineUpperMode,
    timelineZoom,
    timelineClips,
    timelineSelectedClipId,
    timelineEditTool,
    timelineSnapEnabled,
    timelineLinkedClips,
    sourceMonitorPanelVisible,
    sourceMonitorUndocked,
    timelineInspectorOpen,
    timelineSettingsOpen,
    timelineVoiceInputOn,
    timelineCaptionsOn,
    timelineRulersVisible,
    timelineGuidesVisible,
    timelineGuidesLocked,
    timelineGuides,
    monitorSafeMarginsVisible,
    timelineTimecodeDisplay,
    timelineMarkers,
    videoEdits,
    creatorSettings,
    timelinePlayhead
  ]);
  const applyTimelineEditorSnapshot = (snapshotLike = {}, options = {}) => {
    const snapshot = snapshotLike && typeof snapshotLike === "object" ? snapshotLike : {};
    const { includePlayhead = true } = options;
    setCaption(String(snapshot.caption || ""));
    setVideoTitle(String(snapshot.videoTitle || ""));
    setActiveVideoTool(resolveVideoToolKey(snapshot.activeVideoTool || "edit"));
    setActiveVideoToolGroup(getVideoToolGroupKey(snapshot.activeVideoTool || "edit"));
    setActiveVideoBottomPage(
      VIDEO_BOTTOM_PAGES.some((page) => page.key === snapshot.activeVideoBottomPage)
        ? snapshot.activeVideoBottomPage
        : "timeline"
    );
    setTimelineUpperMode(["video", "text", "audio"].includes(snapshot.timelineUpperMode) ? snapshot.timelineUpperMode : "video");
    setTimelineZoom(clampNumber(toNumber(snapshot.timelineZoom, 1), 0.5, 3));
    setTimelineClips(Array.isArray(snapshot.timelineClips) ? cloneSerializable(snapshot.timelineClips) : []);
    setTimelineSelectedClipId(String(snapshot.timelineSelectedClipId || ""));
    setTimelineEditTool(["select", "trim", "ripple", "blade"].includes(snapshot.timelineEditTool) ? snapshot.timelineEditTool : "select");
    setTimelineSnapEnabled(Boolean(snapshot.timelineSnapEnabled));
    setTimelineLinkedClips(Boolean(snapshot.timelineLinkedClips));
    setSourceMonitorPanelVisible(snapshot.sourceMonitorPanelVisible !== false);
    setSourceMonitorUndocked(Boolean(snapshot.sourceMonitorUndocked));
    setTimelineInspectorOpen(snapshot.timelineInspectorOpen !== false);
    setTimelineSettingsOpen(snapshot.timelineSettingsOpen !== false);
    setTimelineVoiceInputOn(Boolean(snapshot.timelineVoiceInputOn));
    setTimelineCaptionsOn(Boolean(snapshot.timelineCaptionsOn));
    setTimelineRulersVisible(snapshot.timelineRulersVisible !== false);
    setTimelineGuidesVisible(Boolean(snapshot.timelineGuidesVisible));
    setTimelineGuidesLocked(Boolean(snapshot.timelineGuidesLocked));
    setTimelineGuides(Array.isArray(snapshot.timelineGuides) ? cloneSerializable(snapshot.timelineGuides) : []);
    setMonitorSafeMarginsVisible(Boolean(snapshot.monitorSafeMarginsVisible));
    setTimelineTimecodeDisplay(snapshot.timelineTimecodeDisplay === "seconds" ? "seconds" : "timecode");
    setTimelineMarkers(Array.isArray(snapshot.timelineMarkers) ? cloneSerializable(snapshot.timelineMarkers) : []);
    if (snapshot.videoEdits && typeof snapshot.videoEdits === "object") {
      setVideoEdits((prev) => ({ ...prev, ...cloneSerializable(snapshot.videoEdits) }));
    }
    if (snapshot.creatorSettings && typeof snapshot.creatorSettings === "object") {
      setCreatorSettings((prev) => ({ ...prev, ...cloneSerializable(snapshot.creatorSettings) }));
    }
    if (includePlayhead) {
      setTimelinePlayhead(clampNumber(toNumber(snapshot.timelinePlayhead, 0), 0, timelineDuration));
    }
  };
  const clearTimelineHistory = () => {
    timelineHistoryRef.current = { undo: [], redo: [] };
    timelineLastSnapshotRef.current = "";
    timelineHistoryCaptureBlockedRef.current = true;
  };

  useEffect(() => {
    const snapshot = buildTimelineEditorSnapshot(false);
    const serialized = JSON.stringify(snapshot);
    if (!timelineLastSnapshotRef.current) {
      timelineLastSnapshotRef.current = serialized;
      return;
    }
    if (serialized === timelineLastSnapshotRef.current) return;
    if (timelineHistoryCaptureBlockedRef.current) {
      timelineLastSnapshotRef.current = serialized;
      timelineHistoryCaptureBlockedRef.current = false;
      return;
    }
    const history = timelineHistoryRef.current;
    history.undo.push(cloneSerializable(JSON.parse(timelineLastSnapshotRef.current)));
    if (history.undo.length > 120) history.undo.shift();
    history.redo = [];
    timelineLastSnapshotRef.current = serialized;
  }, [
    caption,
    videoTitle,
    activeVideoTool,
    activeVideoToolGroup,
    activeVideoBottomPage,
    timelineUpperMode,
    timelineZoom,
    timelineClips,
    timelineSelectedClipId,
    timelineEditTool,
    timelineSnapEnabled,
    timelineLinkedClips,
    sourceMonitorPanelVisible,
    sourceMonitorUndocked,
    timelineInspectorOpen,
    timelineSettingsOpen,
    timelineVoiceInputOn,
    timelineCaptionsOn,
    timelineRulersVisible,
    timelineGuidesVisible,
    timelineGuidesLocked,
    timelineGuides,
    monitorSafeMarginsVisible,
    timelineTimecodeDisplay,
    timelineMarkers,
    videoEdits,
    creatorSettings,
    buildTimelineEditorSnapshot
  ]);

  useEffect(() => {
    if (!activePremiereMenuKey) return undefined;
    const onPointerDown = (event) => {
      if (!premiereMenuBarRef.current) return;
      if (!premiereMenuBarRef.current.contains(event.target)) {
        setActivePremiereMenuKey("");
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setActivePremiereMenuKey("");
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePremiereMenuKey]);

  useEffect(() => {
    const resolved = resolveVideoToolKey(activeVideoTool);
    if (resolved !== activeVideoTool) {
      setActiveVideoTool(resolved);
    }
  }, [activeVideoTool]);

  useEffect(() => {
    const nextGroup = getVideoToolGroupKey(activeVideoTool);
    setActiveVideoToolGroup((prev) => (prev === nextGroup ? prev : nextGroup));
  }, [activeVideoTool]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const className = "ss-theme-white";
    const hadWhiteTheme = document.body.classList.contains(className);
    if (preferWhiteVideoWorkspace) {
      if (!hadWhiteTheme) {
        document.body.classList.add(className);
      }
      return () => {
        if (!hadWhiteTheme) {
          document.body.classList.remove(className);
        }
      };
    }
    if (hadWhiteTheme) {
      document.body.classList.remove(className);
    }
    return undefined;
  }, [preferWhiteVideoWorkspace]);

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
    if (!customCoverFile) {
      setCustomCoverPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(customCoverFile);
    setCustomCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [customCoverFile]);

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

  useEffect(() => {
    if (!isVideo || !previewUrl || Number(videoMeta.duration || 0) <= 0) {
      setCoverFrames([]);
      return;
    }

    let cancelled = false;

    const captureFrames = async () => {
      const probe = document.createElement("video");
      probe.src = previewUrl;
      probe.muted = true;
      probe.preload = "auto";
      probe.playsInline = true;

      await new Promise((resolve, reject) => {
        const onLoaded = () => resolve();
        const onError = () => reject(new Error("Unable to load video for cover frames"));
        probe.addEventListener("loadeddata", onLoaded, { once: true });
        probe.addEventListener("error", onError, { once: true });
      });

      const safeDuration = Math.max(0.2, Number(videoMeta.duration || probe.duration || 0));
      const frameCount = 7;
      const ratio = Math.max(0.5, Number(videoMeta.width || probe.videoWidth || 16) / Math.max(1, Number(videoMeta.height || probe.videoHeight || 9)));
      const thumbWidth = 116;
      const thumbHeight = Math.max(64, Math.round(thumbWidth / ratio));
      const canvas = document.createElement("canvas");
      canvas.width = thumbWidth;
      canvas.height = thumbHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const seekTo = (time) =>
        new Promise((resolve, reject) => {
          const onSeeked = () => resolve();
          const onError = () => reject(new Error("Unable to seek video for cover frame"));
          probe.addEventListener("seeked", onSeeked, { once: true });
          probe.addEventListener("error", onError, { once: true });
          probe.currentTime = Math.min(Math.max(time, 0), Math.max(0.01, safeDuration - 0.05));
        });

      const frames = [];
      for (let i = 0; i < frameCount; i += 1) {
        if (cancelled) return;
        const t = frameCount === 1 ? 0 : (safeDuration * i) / (frameCount - 1);
        try {
          await seekTo(t);
          ctx.drawImage(probe, 0, 0, thumbWidth, thumbHeight);
          frames.push({
            index: i,
            time: Number(t.toFixed(1)),
            src: canvas.toDataURL("image/jpeg", 0.78)
          });
        } catch {
          // Skip failed frame capture and continue.
        }
      }

      if (!cancelled) setCoverFrames(frames);
    };

    captureFrames().catch(() => {
      if (!cancelled) setCoverFrames([]);
    });

    return () => {
      cancelled = true;
    };
  }, [isVideo, previewUrl, videoMeta.duration, videoMeta.width, videoMeta.height]);

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
  const blurTrackDurationFromEdits = useCallback((editsLike) =>
    Math.max(
      Number(videoMeta.duration || 0),
      Number(timelineDuration || 0),
      toNumber(editsLike?.blurEnd, 0),
      toNumber(editsLike?.trimEnd, 0)
    ), [timelineDuration, videoMeta.duration]);
  const blurSubjectsFromEdits = useCallback((editsLike) =>
    normalizeBlurSubjects(editsLike?.blurSubjects, blurTrackDurationFromEdits(editsLike)), [blurTrackDurationFromEdits]);
  const applyBlurSubjectToFields = (source, subjectLike) => {
    const subject = subjectLike || null;
    if (!subject) {
      return {
        ...source,
        blurTrackPoints: []
      };
    }
    const points = normalizeBlurTrackPoints(subject.trackPoints, blurTrackDurationFromEdits(source));
    const firstPoint = points.find((point) => point?.visible !== false) || points[0] || null;
    const width = clampNumber(toNumber(firstPoint?.width, source.blurWidth ?? 34), 1, 100);
    const height = clampNumber(toNumber(firstPoint?.height, source.blurHeight ?? 34), 1, 100);
    const x = clampNumber(toNumber(firstPoint?.x, source.blurX ?? 33), 0, Math.max(0, 100 - width));
    const y = clampNumber(toNumber(firstPoint?.y, source.blurY ?? 24), 0, Math.max(0, 100 - height));
    const shape = resolveBlurShape(subject.shape, source.blurShape || "circle");
    const intensity = clampNumber(toNumber(subject.intensity, source.blurIntensity ?? 45), 0, 100);
    const feather = clampNumber(toNumber(subject.feather, source.blurFeather ?? 8), 0, 40);
    const tracking = resolveBlurTracking(subject.tracking, "smooth");
    const start = Math.max(0, toNumber(subject.start, 0));
    const endRaw = Math.max(0, toNumber(subject.end, 0));
    const end = endRaw > start + 0.05 ? endRaw : 0;
    return {
      ...source,
      blurTargetType: "face",
      blurMode: "face",
      blurShape: shape,
      maskShape: shape,
      blurIntensity: intensity,
      blurFace: intensity,
      blurFeather: feather,
      maskFeather: feather,
      blurTracking: tracking,
      motionTrackingEnabled: tracking !== "off",
      blurStart: start,
      blurEnd: end,
      blurTrackPoints: points,
      blurX: x,
      blurY: y,
      blurWidth: width,
      blurHeight: height,
      blurCustomX: x + width / 2,
      blurCustomY: y + height / 2,
      blurCustomWidth: width,
      blurCustomHeight: height
    };
  };
  const syncBlurSubjectsState = (source, subjectsLike, preferredActiveId = "", forceFaceTarget = true) => {
    const subjects = normalizeBlurSubjects(subjectsLike, blurTrackDurationFromEdits(source));
    if (!subjects.length) {
      return {
        ...source,
        blurSubjects: [],
        activeBlurSubjectId: "",
        blurTrackPoints: []
      };
    }
    const chosenId = String(preferredActiveId || source.activeBlurSubjectId || "").trim();
    const active = subjects.find((subject) => subject.id === chosenId) || subjects[0];
    let next = {
      ...source,
      blurSubjects: subjects,
      activeBlurSubjectId: active.id
    };
    if (forceFaceTarget || resolveBlurTargetType(next.blurTargetType || next.blurMode) === "face") {
      next = applyBlurSubjectToFields(next, active);
    }
    return next;
  };
  const selectBlurSubject = (subjectId) => {
    const id = String(subjectId || "").trim();
    if (!id) return;
    setVideoEdits((prev) => syncBlurSubjectsState(prev, blurSubjectsFromEdits(prev), id, true));
  };
  const removeBlurSubject = (subjectId) => {
    const id = String(subjectId || "").trim();
    setVideoEdits((prev) => {
      const subjects = blurSubjectsFromEdits(prev).filter((subject) => subject.id !== id);
      if (!subjects.length) {
        return {
          ...prev,
          blurSubjects: [],
          activeBlurSubjectId: "",
          blurTrackPoints: []
        };
      }
      return syncBlurSubjectsState(prev, subjects, subjects[0].id, true);
    });
  };
  const updateActiveBlurSubject = (updater) => {
    if (typeof updater !== "function") return;
    setVideoEdits((prev) => {
      const subjects = blurSubjectsFromEdits(prev);
      if (!subjects.length) return prev;
      const activeId = String(prev.activeBlurSubjectId || "").trim();
      const activeSubject = subjects.find((subject) => subject.id === activeId) || subjects[0];
      if (!activeSubject) return prev;
      const changed = updater(activeSubject);
      if (!changed || typeof changed !== "object") return prev;
      const nextSubjects = subjects.map((subject) =>
        subject.id === activeSubject.id
          ? {
              ...subject,
              ...changed,
              trackPoints: normalizeBlurTrackPoints(
                changed.trackPoints ?? subject.trackPoints,
                blurTrackDurationFromEdits(prev)
              )
            }
          : subject
      );
      return syncBlurSubjectsState(prev, nextSubjects, activeSubject.id, true);
    });
  };
  const setBlurTargetType = (targetType) => {
    const resolvedTarget = resolveBlurTargetType(targetType);
    const presetRegion = defaultBlurRegionForTarget(resolvedTarget);
    const compatMode = resolvedTarget === "none" ? "global" : resolvedTarget === "object" ? "custom" : resolvedTarget;
    setVideoEdits((prev) => {
      const next = {
        ...prev,
        blurTargetType: resolvedTarget,
        blurMode: compatMode,
        blurShape: resolvedTarget === "none" ? prev.blurShape : presetRegion.shape,
        blurTracking: resolveBlurTracking(prev.blurTracking, prev.motionTrackingEnabled ? "smooth" : "off"),
        blurX: resolvedTarget === "none" ? prev.blurX : presetRegion.x,
        blurY: resolvedTarget === "none" ? prev.blurY : presetRegion.y,
        blurWidth: resolvedTarget === "none" ? prev.blurWidth : presetRegion.width,
        blurHeight: resolvedTarget === "none" ? prev.blurHeight : presetRegion.height,
        blurCustomX:
          resolvedTarget === "none" ? prev.blurCustomX : presetRegion.x + presetRegion.width / 2,
        blurCustomY:
          resolvedTarget === "none" ? prev.blurCustomY : presetRegion.y + presetRegion.height / 2,
        blurCustomWidth: resolvedTarget === "none" ? prev.blurCustomWidth : presetRegion.width,
        blurCustomHeight: resolvedTarget === "none" ? prev.blurCustomHeight : presetRegion.height,
        blurTrackPoints: resolvedTarget === "face" ? prev.blurTrackPoints || [] : []
      };
      if (resolvedTarget === "face") {
        const existingSubjects = blurSubjectsFromEdits(prev);
        if (existingSubjects.length) {
          return syncBlurSubjectsState(next, existingSubjects, prev.activeBlurSubjectId, true);
        }
      }
      if (resolvedTarget !== "none" && Number(resolveBlurIntensityForTarget(next, resolvedTarget)) <= 0.1) {
        next.blurIntensity = 45;
      }
      if (resolvedTarget === "face") next.blurFace = next.blurIntensity;
      if (resolvedTarget === "logo") next.blurLogo = next.blurIntensity;
      if (resolvedTarget === "object" || resolvedTarget === "custom") next.blurCustom = next.blurIntensity;
      return next;
    });
    if (resolvedTarget !== "face") {
      setBlurTrackStatus("");
    }
    if (resolvedTarget === "custom" || resolvedTarget === "object") {
      setBlurPreviewTool("draw");
    } else if (resolvedTarget === "face") {
      setBlurPreviewTool("select");
    } else if (resolvedTarget === "none") {
      setBlurPreviewTool("select");
    }
  };
  const resetBlurSettings = () => {
    setVideoEdits((prev) => ({
      ...prev,
      blurMode: "global",
      blurTargetType: "none",
      blurShape: "rectangle",
      blurIntensity: 45,
      blurFeather: 8,
      blurTracking: "off",
      blurStart: 0,
      blurEnd: 0,
      effectBlur: 0,
      blurFace: 0,
      blurLogo: 0,
      blurCustom: 0,
      blurX: 33,
      blurY: 24,
      blurWidth: 34,
      blurHeight: 34,
      blurTrackPoints: [],
      blurSubjects: [],
      activeBlurSubjectId: "",
      blurCustomX: 50,
      blurCustomY: 50,
      blurCustomWidth: 30,
      blurCustomHeight: 30,
      maskShape: "none",
      maskFeather: 0,
      motionTrackingEnabled: false
    }));
    setBlurTrackStatus("");
  };
  const createBlurFaceDetector = async (trackMode) => {
    const isNativeAvailable = typeof window !== "undefined" && typeof window.FaceDetector === "function";
    if (isNativeAvailable) {
      const detector = new window.FaceDetector({
        fastMode: trackMode !== "aggressive",
        maxDetectedFaces: 6
      });
      return {
        backend: "native",
        detect: async (frame, timestampMs) => {
          void timestampMs;
          const results = await detector.detect(frame);
          return Array.isArray(results) ? results : [];
        }
      };
    }

    if (!blurMediaPipeFaceDetectorRef.current) {
      if (!blurMediaPipeFaceDetectorLoadRef.current) {
        blurMediaPipeFaceDetectorLoadRef.current = (async () => {
          const vision = await import("@mediapipe/tasks-vision");
          const { FilesetResolver, FaceDetector } = vision;
          const fileset = await FilesetResolver.forVisionTasks(BLUR_MEDIAPIPE_WASM_BASE);
          return FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: BLUR_MEDIAPIPE_FACE_MODEL_ASSET, delegate: "CPU" },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.42,
            minSuppressionThreshold: 0.25
          });
        })();
      }
      try {
        blurMediaPipeFaceDetectorRef.current = await blurMediaPipeFaceDetectorLoadRef.current;
      } catch (error) {
        blurMediaPipeFaceDetectorLoadRef.current = null;
        throw error;
      }
    }

    return {
      backend: "mediapipe",
      detect: async (frame, timestampMs) => {
        const detector = blurMediaPipeFaceDetectorRef.current;
        if (!detector?.detectForVideo) return [];
        const safeTimestamp = Math.max(0, Math.round(Number(timestampMs || 0)));
        const result = detector.detectForVideo(frame, safeTimestamp);
        return Array.isArray(result?.detections) ? result.detections : [];
      }
    };
  };
  const buildFaceBlurTrack = async () => {
    if (blurTrackBusy) return;
    if (!isVideo) {
      setBlurTrackStatus("Face tracking works for video only.");
      return;
    }
    const video = videoRef.current;
    if (!video) {
      setBlurTrackStatus("Video preview is not ready yet.");
      return;
    }
    const duration = Math.max(0.1, Number(videoMeta.duration || video.duration || timelineDuration || 0));
    const requestedStart = clampNumber(Number(videoEdits.blurStart || timelinePlayhead || 0), 0, duration);
    const requestedEndRaw = clampNumber(Number(videoEdits.blurEnd || 0), 0, duration);
    const requestedEnd =
      requestedEndRaw > requestedStart + BLUR_TRACK_MIN_DURATION
        ? requestedEndRaw
        : Math.min(duration, requestedStart + Math.max(8, duration * 0.08));
    if (requestedEnd <= requestedStart + 0.08) {
      setBlurTrackStatus("Set a longer blur range first.");
      return;
    }

    setBlurTrackBusy(true);
    setBlurTrackStatus("Tracking face...");
    const wasPaused = video.paused;
    const originalTime = Number(video.currentTime || 0);
    const trackMode = resolveBlurTracking(videoEdits.blurTracking, videoEdits.motionTrackingEnabled ? "smooth" : "off");
    let detector;
    try {
      detector = await createBlurFaceDetector(trackMode);
    } catch {
      setBlurTrackStatus(
        "Face tracking could not start. Native API is unavailable and MediaPipe model failed to load."
      );
      setBlurTrackBusy(false);
      return;
    }
    const roughStep =
      trackMode === "aggressive" ? 0.14 : trackMode === "smooth" ? 0.22 : 0.28;
    const sampleCount = Math.max(
      4,
      Math.min(BLUR_TRACK_MAX_POINTS, Math.ceil((requestedEnd - requestedStart) / roughStep) + 1)
    );
    const step = (requestedEnd - requestedStart) / Math.max(1, sampleCount - 1);
    const shape = resolveBlurShape(videoEdits.blurShape || videoEdits.maskShape, "circle");
    const feather = Number(videoEdits.blurFeather ?? videoEdits.maskFeather ?? 8);
    const baseRegion = clampBlurRegionPct({
      x: Number(videoEdits.blurX ?? 33),
      y: Number(videoEdits.blurY ?? 24),
      width: Number(videoEdits.blurWidth ?? 34),
      height: Number(videoEdits.blurHeight ?? 34)
    });
    const selectedTrackRegion =
      activeBlurSubject?.trackPoints?.length
        ? getBlurTrackRegionAtTime(activeBlurSubject.trackPoints, requestedStart)
        : null;
    const initialRegion = selectedTrackRegion || baseRegion;
    const minConfidence =
      trackMode === "aggressive"
        ? Math.max(0.24, BLUR_TRACK_MIN_CONFIDENCE - 0.08)
        : trackMode === "off"
          ? Math.max(0.3, BLUR_TRACK_MIN_CONFIDENCE - 0.02)
          : BLUR_TRACK_MIN_CONFIDENCE;

    const seekTo = (timeSeconds) =>
      new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          video.removeEventListener("seeked", finish);
          video.removeEventListener("error", finish);
          resolve();
        };
        const timer = window.setTimeout(finish, 900);
        video.addEventListener("seeked", finish, { once: true });
        video.addEventListener("error", finish, { once: true });
        try {
          video.currentTime = clampNumber(Number(timeSeconds || 0), 0, duration);
        } catch {
          finish();
        }
      });
    const makeFaceThumb = (regionLike) => {
      const region = clampBlurRegionPct(regionLike || {});
      const vw = Math.max(1, Number(video.videoWidth || videoMeta.width || 1));
      const vh = Math.max(1, Number(video.videoHeight || videoMeta.height || 1));
      const sx = clampNumber(Math.round((region.x / 100) * vw), 0, vw - 1);
      const sy = clampNumber(Math.round((region.y / 100) * vh), 0, vh - 1);
      const sw = clampNumber(Math.round((region.width / 100) * vw), 1, vw - sx);
      const sh = clampNumber(Math.round((region.height / 100) * vh), 1, vh - sy);
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      try {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 64, 64);
        return canvas.toDataURL("image/jpeg", 0.78);
      } catch {
        return "";
      }
    };

    try {
      if (!video.paused) video.pause();
      const points = [];
      let anchorRegion = { ...initialRegion };
      let thumb = "";
      let missingCount = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        const time = requestedStart + step * index;
        await seekTo(time);
        let detections = [];
        try {
          detections = await detector.detect(video, time * 1000);
        } catch {
          detections = [];
        }
        const candidates = (Array.isArray(detections) ? detections : [])
          .map((item) => {
            const region = bboxToBlurRegionPct(
              item?.boundingBox || item,
              Number(video.videoWidth || videoMeta.width || 1),
              Number(video.videoHeight || videoMeta.height || 1),
              shape,
              feather
            );
            if (!region) return null;
            return {
              region,
              score: detectionConfidence(item)
            };
          })
          .filter((candidate) => candidate && candidate.score >= minConfidence);
        const targetRegion = points.length ? points[points.length - 1] : anchorRegion;
        const selectedRaw = candidates.reduce((best, candidate) => {
          const region = candidate.region;
          const baseArea = Math.max(1, Number(anchorRegion.width || 1) * Number(anchorRegion.height || 1));
          const candidateArea = Math.max(1, Number(region.width || 1) * Number(region.height || 1));
          const areaRatio = candidateArea / baseArea;
          const areaPenalty = Math.abs(Math.log(Math.max(0.2, Math.min(5, areaRatio))));
          const distancePenalty = centerDistanceSq(region, targetRegion);
          const confidencePenalty = (1 - candidate.score) * 95;
          const metric = distancePenalty + areaPenalty * 140 + confidencePenalty;
          if (!best || metric < best.metric) {
            return { metric, candidate };
          }
          return best;
        }, null);
        const picked = selectedRaw?.candidate || null;
        const jumpLimitPct = Math.max(10, Math.max(Number(anchorRegion.width || 0), Number(anchorRegion.height || 0)) * 2.1);
        const scaleWidth = Math.max(0.01, Number(picked?.region?.width || 1)) / Math.max(0.01, Number(anchorRegion.width || 1));
        const scaleHeight = Math.max(0.01, Number(picked?.region?.height || 1)) / Math.max(0.01, Number(anchorRegion.height || 1));
        const growthAllowed =
          Number(picked?.region?.width || 0) <= Math.max(42, Number(anchorRegion.width || 0) * 2.1) &&
          Number(picked?.region?.height || 0) <= Math.max(42, Number(anchorRegion.height || 0) * 2.1);
        const scaleAllowed = points.length
          ? scaleWidth >= 0.48 && scaleWidth <= 2.35 && scaleHeight >= 0.48 && scaleHeight <= 2.35
          : true;
        const selected =
          picked &&
          centerDistanceSq(picked.region, anchorRegion) <= jumpLimitPct * jumpLimitPct &&
          growthAllowed &&
          scaleAllowed
            ? picked.region
            : null;
        if (!selected) {
          missingCount += 1;
          points.push({
            time: Number(time.toFixed(3)),
            x: anchorRegion.x,
            y: anchorRegion.y,
            width: anchorRegion.width,
            height: anchorRegion.height,
            visible: false
          });
          continue;
        }

        const alpha = trackMode === "aggressive" ? 0.72 : trackMode === "smooth" ? 0.5 : 0.38;
        const smoothed = points.length
          ? clampBlurRegionPct({
              x: points[points.length - 1].x + (selected.x - points[points.length - 1].x) * alpha,
              y: points[points.length - 1].y + (selected.y - points[points.length - 1].y) * alpha,
              width:
                points[points.length - 1].width +
                (selected.width - points[points.length - 1].width) * alpha,
              height:
                points[points.length - 1].height +
                (selected.height - points[points.length - 1].height) * alpha
            })
          : selected;

        points.push({
          time: Number(time.toFixed(3)),
          x: smoothed.x,
          y: smoothed.y,
          width: smoothed.width,
          height: smoothed.height,
          visible: true
        });
        if (!thumb) thumb = makeFaceThumb(smoothed);
        anchorRegion = smoothed;
      }

      const normalizedPoints = normalizeBlurTrackPoints(points, duration);
      const visiblePoints = normalizedPoints.filter((point) => point.visible !== false);
      if (visiblePoints.length < 2) {
        setBlurTrackStatus("Could not lock on face. Try clearer frame or longer range.");
        return;
      }

      const firstPoint = visiblePoints[0];
      const lastPoint = visiblePoints[visiblePoints.length - 1];
      const subjectLabel = `Face ${blurFaceSubjectCounterRef.current}`;
      blurFaceSubjectCounterRef.current += 1;
      const subject = {
        id: makeBlurFaceSubjectId(),
        label: subjectLabel,
        shape,
        intensity: clampNumber(toNumber(videoEdits.blurIntensity, videoEdits.blurFace || 45), 0, 100),
        feather: clampNumber(feather, 0, 40),
        tracking: trackMode === "off" ? "smooth" : trackMode,
        start: Number(firstPoint.time.toFixed(3)),
        end: Number(lastPoint.time.toFixed(3)),
        trackPoints: normalizedPoints,
        thumb
      };
      setVideoEdits((prev) => {
        const existing = blurSubjectsFromEdits(prev);
        const appended = [...existing, subject].slice(-BLUR_FACE_MAX_SUBJECTS);
        return syncBlurSubjectsState(
          {
            ...prev,
            blurTargetType: "face",
            blurMode: "face"
          },
          appended,
          subject.id,
          true
        );
      });
      const backendLabel = detector?.backend === "mediapipe" ? "MediaPipe" : "Native";
      const hiddenNote = missingCount > 0 ? ` Hidden on ${missingCount} samples.` : "";
      setBlurTrackStatus(
        `${subjectLabel} tracked with ${visiblePoints.length} visible points (${backendLabel}).${hiddenNote}`
      );
    } finally {
      await seekTo(originalTime);
      if (!wasPaused) {
        video.play().catch(() => {});
      }
      setBlurTrackBusy(false);
    }
  };
  const setCreatorSetting = (key, value) => {
    setCreatorSettings((prev) => ({ ...prev, [key]: value }));
    if (key === "audience") {
      setShowPublicSettings(value === "public");
    }
  };
  const togglePublicSettings = () => {
    if (!isPublicAudience) {
      setCreatorSetting("audience", "public");
      setShowPublicSettings(true);
      return;
    }
    setShowPublicSettings((prev) => !prev);
  };
  const activeVideoWorkflow = useMemo(
    () => READY_MADE_WORKFLOW_OPTIONS.find((workflow) => workflow.key === videoEdits.workflowPreset) || null,
    [videoEdits.workflowPreset]
  );

  const videoFilterStyle = useMemo(() => {
    const tuning = VIDEO_PRESET_TUNING[videoEdits.filterPreset] || VIDEO_PRESET_TUNING.normal;
    const exposureBoost = Number(videoEdits.exposure || 0) * 0.55;
    const highlightsBoost = Number(videoEdits.highlights || 0) * 0.35;
    const shadowsLift = Number(videoEdits.shadows || 0) * 0.22;
    const sharpnessBoost = Number(videoEdits.sharpness || 0) * 0.2;
    const vibranceBoost = (Number(videoEdits.vibrance || 100) - 100) * 0.72;
    const blackPointBoost = Number(videoEdits.blackPoint || 0) * 0.45;

    const warmthSepia = clampNumber(Math.max(0, Number(videoEdits.warmth || 0) * 0.55 + tuning.sepia), 0, 100);
    const hueRotate = Number(videoEdits.hue || 0) + tuning.hue + Number(videoEdits.tint || 0) * 0.45;
    const softnessBlurPx = clampNumber(
      Math.max(0, Number(videoEdits.softness || 0) / 30 - sharpnessBoost / 260),
      0,
      2.2
    );
    const resolvedTarget = resolveBlurTargetType(videoEdits.blurTargetType || videoEdits.blurMode);
    const legacyRegionalBasis =
      resolvedTarget === "none"
        ? Math.max(
            Number(videoEdits.blurFace || 0) * 0.92,
            Number(videoEdits.blurLogo || 0) * 0.88,
            Number(videoEdits.blurCustom || 0) * 0.95
          )
        : 0;
    const fxBlurPx = clampNumber(Math.max(Number(videoEdits.effectBlur || 0), legacyRegionalBasis) / 14, 0, 8);
    const blurPx = clampNumber(softnessBlurPx + fxBlurPx, 0, 10);
    const brightness = clampNumber(
      Math.round(Number(videoEdits.brightness || 100) * tuning.b + exposureBoost + highlightsBoost + shadowsLift),
      40,
      220
    );
    const contrast = clampNumber(
      Math.round(Number(videoEdits.contrast || 100) * tuning.c + blackPointBoost + sharpnessBoost - Number(videoEdits.shadows || 0) * 0.16),
      40,
      220
    );
    const saturation = clampNumber(
      Math.round(Number(videoEdits.saturation || 100) * tuning.s + vibranceBoost + sharpnessBoost * 0.1),
      0,
      260
    );
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${warmthSepia}%) hue-rotate(${hueRotate}deg) blur(${blurPx.toFixed(2)}px)`;
  }, [videoEdits]);

  const videoFadeStyle = useMemo(() => {
    const fade = Math.max(0, Number(videoEdits.fade || 0));
    if (!fade) return null;
    const opacity = Math.min(0.42, fade / 160);
    return {
      background: `rgba(255, 255, 255, ${opacity.toFixed(3)})`,
      mixBlendMode: "screen"
    };
  }, [videoEdits.fade]);

  const videoTintOverlayStyle = useMemo(() => {
    const tint = Number(videoEdits.tint || 0);
    if (!tint) return null;
    const opacity = Math.min(0.22, Math.abs(tint) / 210);
    const color = tint > 0 ? "255, 80, 172" : "96, 220, 150";
    return {
      background: `rgba(${color}, ${opacity.toFixed(3)})`,
      mixBlendMode: "soft-light"
    };
  }, [videoEdits.tint]);

  const videoGrainStyle = useMemo(() => {
    const grain = Math.max(0, Number(videoEdits.grain || 0));
    if (!grain) return null;
    return {
      opacity: Math.min(0.34, grain / 230),
      backgroundImage:
        "radial-gradient(rgba(255,255,255,0.40) 0.5px, transparent 0.5px), radial-gradient(rgba(0,0,0,0.30) 0.5px, transparent 0.5px)",
      backgroundSize: "3px 3px, 4px 4px",
      backgroundPosition: "0 0, 1px 1px",
      mixBlendMode: "overlay"
    };
  }, [videoEdits.grain]);

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
  const selectedCoverFrame = useMemo(() => {
    if (!coverFrames.length) return null;
    const target = Number(videoEdits.coverTime || 0);
    return coverFrames.reduce((best, frame) =>
      Math.abs(frame.time - target) < Math.abs(best.time - target) ? frame : best
    , coverFrames[0]);
  }, [coverFrames, videoEdits.coverTime]);

  const videoObjectFit = useMemo(() => {
    const cropZoom = Number(videoEdits.cropZoom || 100);
    const cropX = Number(videoEdits.cropX || 50);
    const cropY = Number(videoEdits.cropY || 50);
    const hasCropFraming = Math.abs(cropZoom - 100) > 0.01 || Math.abs(cropX - 50) > 0.01 || Math.abs(cropY - 50) > 0.01;
    if (hasCropFraming) return "cover";
    return videoEdits.coverMode === "fill" ? "cover" : videoEdits.coverMode === "fit" ? "contain" : "contain";
  }, [videoEdits.coverMode, videoEdits.cropZoom, videoEdits.cropX, videoEdits.cropY]);

  const videoPreviewTransform = useMemo(() => {
    const rotation = Number(videoEdits.rotate || 0);
    const zoom = Math.max(0.5, Number(videoEdits.cropZoom || 100) / 100);
    const cropX = Math.max(0, Math.min(100, Number(videoEdits.cropX || 50)));
    const cropY = Math.max(0, Math.min(100, Number(videoEdits.cropY || 50)));
    const offsetX = clampNumber((50 - cropX) * 0.55, -30, 30);
    const offsetY = clampNumber((50 - cropY) * 0.55, -30, 30);
    const flipX = videoEdits.flipH ? -1 : 1;
    const flipY = videoEdits.flipV ? -1 : 1;
    return `translate(${offsetX}%, ${offsetY}%) rotate(${rotation}deg) scale(${zoom}) scaleX(${flipX}) scaleY(${flipY})`;
  }, [videoEdits.rotate, videoEdits.cropZoom, videoEdits.cropX, videoEdits.cropY, videoEdits.flipH, videoEdits.flipV]);
  const videoPreviewObjectPosition = `${Math.max(0, Math.min(100, Number(videoEdits.cropX || 50)))}% ${Math.max(0, Math.min(100, Number(videoEdits.cropY || 50)))}%`;
  const activeBlurTargetType = resolveBlurTargetType(videoEdits.blurTargetType || videoEdits.blurMode);
  const blurFaceSubjects = useMemo(() => blurSubjectsFromEdits(videoEdits), [videoEdits, blurSubjectsFromEdits]);
  const activeBlurSubject = useMemo(() => {
    if (!blurFaceSubjects.length) return null;
    const activeId = String(videoEdits.activeBlurSubjectId || "").trim();
    return blurFaceSubjects.find((subject) => subject.id === activeId) || blurFaceSubjects[0];
  }, [blurFaceSubjects, videoEdits.activeBlurSubjectId]);
  useEffect(() => {
    if (!blurFaceSubjects.length) {
      blurFaceSubjectCounterRef.current = 1;
      return;
    }
    let maxLabelIndex = 0;
    for (const subject of blurFaceSubjects) {
      const match = String(subject?.label || "").match(/(\d+)\s*$/);
      if (!match) continue;
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) {
        maxLabelIndex = Math.max(maxLabelIndex, parsed);
      }
    }
    blurFaceSubjectCounterRef.current = Math.max(blurFaceSubjectCounterRef.current, maxLabelIndex + 1);
  }, [blurFaceSubjects]);
  const activeBlurIntensity = resolveBlurIntensityForTarget(videoEdits, activeBlurTargetType);
  const blurPreviewRegions = useMemo(() => {
    if (activeBlurTargetType === "none") return [];
    const safeDuration = Math.max(Number(videoMeta.duration || 0), Number(timelineDuration || 0));
    const toPreview = (subjectLike, fallbackIntensity) => {
      const subject = subjectLike || {};
      const shape = resolveBlurShape(
        subject.shape || videoEdits.blurShape || videoEdits.maskShape,
        activeBlurTargetType === "face" ? "circle" : "rectangle"
      );
      const points = normalizeBlurTrackPoints(subject.trackPoints || videoEdits.blurTrackPoints, safeDuration);
      const trackedRegion = getBlurTrackRegionAtTime(points, timelinePlayhead);
      const fallbackRegion = clampBlurRegionPct({
        x: toNumber(subject.x, toNumber(videoEdits.blurX, 33)),
        y: toNumber(subject.y, toNumber(videoEdits.blurY, 24)),
        width: toNumber(subject.width, toNumber(videoEdits.blurWidth, 34)),
        height: toNumber(subject.height, toNumber(videoEdits.blurHeight, 34))
      });
      const baseRegion = trackedRegion || fallbackRegion;
      if (!trackedRegion && points.length > 0) return null;
      const width = clampNumber(toNumber(baseRegion.width, 34), 1, 100);
      const height = clampNumber(toNumber(baseRegion.height, 34), 1, 100);
      const left = clampNumber(toNumber(baseRegion.x, 33), 0, Math.max(0, 100 - width));
      const top = clampNumber(toNumber(baseRegion.y, 24), 0, Math.max(0, 100 - height));
      const start = Math.max(0, toNumber(subject.start, toNumber(videoEdits.blurStart, 0)));
      const end = Math.max(0, toNumber(subject.end, toNumber(videoEdits.blurEnd, 0)));
      const hasRange = end > start + 0.05;
      const inTimeRange = !hasRange || (timelinePlayhead >= start && timelinePlayhead <= end);
      if (!inTimeRange) return null;
      const feather = clampNumber(toNumber(subject.feather, toNumber(videoEdits.blurFeather, 8)), 0, 40);
      const tracking = resolveBlurTracking(
        subject.tracking || videoEdits.blurTracking,
        videoEdits.motionTrackingEnabled ? "smooth" : "off"
      );
      const intensity = clampNumber(toNumber(subject.intensity, fallbackIntensity), 0, 100);
      if (intensity <= 0.1) return null;
      const regionId = String(subject.id || "").trim();
      return {
        id: regionId,
        left,
        top,
        width,
        height,
        shape,
        feather,
        tracking,
        pxBlur: clampNumber(intensity / 12, 0.8, 12),
        selected:
          activeBlurTargetType === "face" &&
          !!regionId &&
          String(activeBlurSubject?.id || "").trim() === regionId
      };
    };

    if (activeBlurTargetType === "face" && blurFaceSubjects.length) {
      return blurFaceSubjects
        .map((subject) => toPreview(subject, toNumber(subject.intensity, activeBlurIntensity)))
        .filter(Boolean);
    }
    const single = toPreview(null, activeBlurIntensity);
    return single ? [single] : [];
  }, [
    activeBlurIntensity,
    activeBlurTargetType,
    activeBlurSubject?.id,
    blurFaceSubjects,
    timelineDuration,
    timelinePlayhead,
    videoEdits,
    videoMeta.duration
  ]);
  const blurPreviewEditEnabled = isVideo && activeVideoTool === "fx-pro" && activeBlurTargetType !== "none";
  const blurPreviewActiveRegion = useMemo(() => {
    if (!blurPreviewRegions.length) return null;
    if (activeBlurTargetType === "face") {
      const activeId = String(activeBlurSubject?.id || "").trim();
      if (activeId) {
        const matched = blurPreviewRegions.find((region) => String(region.id || "").trim() === activeId);
        if (matched) return matched;
      }
    }
    return blurPreviewRegions[0];
  }, [activeBlurSubject?.id, activeBlurTargetType, blurPreviewRegions]);
  const getPreviewPointerPoint = (pointerLike) => {
    const stage = previewStageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const clientX = Number(pointerLike?.clientX ?? 0);
    const clientY = Number(pointerLike?.clientY ?? 0);
    const x = clampNumber(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clampNumber(((clientY - rect.top) / rect.height) * 100, 0, 100);
    return { x, y };
  };
  const getDrawnBlurRegion = (startLike, endLike, minSize = BLUR_PREVIEW_MIN_DRAW_SIZE_PCT) => {
    const start = startLike || { x: 50, y: 50 };
    const end = endLike || start;
    const rawX = Math.min(Number(start.x || 0), Number(end.x || 0));
    const rawY = Math.min(Number(start.y || 0), Number(end.y || 0));
    const rawWidth = Math.abs(Number(end.x || 0) - Number(start.x || 0));
    const rawHeight = Math.abs(Number(end.y || 0) - Number(start.y || 0));
    const width = Math.max(Number(minSize || BLUR_PREVIEW_MIN_DRAW_SIZE_PCT), rawWidth);
    const height = Math.max(Number(minSize || BLUR_PREVIEW_MIN_DRAW_SIZE_PCT), rawHeight);
    return clampBlurRegionPct({
      x: rawX,
      y: rawY,
      width,
      height
    });
  };
  const getCenteredBlurRegion = (pointLike, sourceRegionLike) => {
    const point = pointLike || { x: 50, y: 50 };
    const source = clampBlurRegionPct(sourceRegionLike || {});
    const width = clampNumber(toNumber(source.width, 24), BLUR_PREVIEW_MIN_DRAW_SIZE_PCT, 100);
    const height = clampNumber(toNumber(source.height, 24), BLUR_PREVIEW_MIN_DRAW_SIZE_PCT, 100);
    return clampBlurRegionPct({
      x: Number(point.x || 50) - width / 2,
      y: Number(point.y || 50) - height / 2,
      width,
      height
    });
  };
  const resolvePreviewResizeCursor = (handle) => (
    handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize"
  );
  const getPreviewRegionHandlePoint = (region, handle) => {
    const left = Number(region?.left || 0);
    const top = Number(region?.top || 0);
    const right = left + Number(region?.width || 0);
    const bottom = top + Number(region?.height || 0);
    switch (handle) {
      case "nw":
        return { x: left, y: top };
      case "ne":
        return { x: right, y: top };
      case "sw":
        return { x: left, y: bottom };
      case "se":
      default:
        return { x: right, y: bottom };
    }
  };
  const getBlurPreviewRegionHit = (pointLike) => {
    const point = pointLike || null;
    if (!point) return null;
    if (blurPreviewTool === "select" && blurPreviewActiveRegion) {
      for (const handle of BLUR_PREVIEW_RESIZE_HANDLES) {
        const handlePoint = getPreviewRegionHandlePoint(blurPreviewActiveRegion, handle);
        if (
          Math.abs(point.x - Number(handlePoint.x || 0)) <= BLUR_PREVIEW_HANDLE_HIT_RADIUS_PCT &&
          Math.abs(point.y - Number(handlePoint.y || 0)) <= BLUR_PREVIEW_HANDLE_HIT_RADIUS_PCT
        ) {
          return {
            kind: "handle",
            handle,
            cursor: resolvePreviewResizeCursor(handle),
            region: blurPreviewActiveRegion
          };
        }
      }
    }
    for (let index = blurPreviewRegions.length - 1; index >= 0; index -= 1) {
      const region = blurPreviewRegions[index];
      const left = Number(region?.left || 0);
      const top = Number(region?.top || 0);
      const width = Number(region?.width || 0);
      const height = Number(region?.height || 0);
      if (
        point.x >= left &&
        point.x <= left + width &&
        point.y >= top &&
        point.y <= top + height
      ) {
        return { kind: "body", cursor: "move", region };
      }
    }
    return null;
  };
  const getCurrentEditableRegion = () => {
    if (activeBlurTargetType === "face") {
      return clampBlurRegionPct(
        getBlurTrackRegionAtTime(activeBlurSubject?.trackPoints, timelinePlayhead) || {
          x: Number(videoEdits.blurX || 33),
          y: Number(videoEdits.blurY || 24),
          width: Number(videoEdits.blurWidth || 34),
          height: Number(videoEdits.blurHeight || 34)
        }
      );
    }
    return clampBlurRegionPct({
      x: Number(videoEdits.blurX || 33),
      y: Number(videoEdits.blurY || 24),
      width: Number(videoEdits.blurWidth || 34),
      height: Number(videoEdits.blurHeight || 34)
    });
  };
  const getDraggedRegionForMode = (drag, pointLike) => {
    const point = pointLike || null;
    if (!drag || !point || !drag.initialRegion) return null;
    const start = drag.start || point;
    const dx = Number(point.x || 0) - Number(start.x || 0);
    const dy = Number(point.y || 0) - Number(start.y || 0);
    const base = clampBlurRegionPct(drag.initialRegion);
    if (drag.mode === "move") {
      return clampBlurRegionPct({
        x: base.x + dx,
        y: base.y + dy,
        width: base.width,
        height: base.height
      });
    }
    if (drag.mode !== "resize") return null;
    const minSize = BLUR_PREVIEW_MIN_DRAW_SIZE_PCT;
    let left = base.x;
    let top = base.y;
    let right = base.x + base.width;
    let bottom = base.y + base.height;
    if (String(drag.handle || "").includes("w")) {
      left = clampNumber(base.x + dx, 0, right - minSize);
    }
    if (String(drag.handle || "").includes("e")) {
      right = clampNumber(base.x + base.width + dx, left + minSize, 100);
    }
    if (String(drag.handle || "").includes("n")) {
      top = clampNumber(base.y + dy, 0, bottom - minSize);
    }
    if (String(drag.handle || "").includes("s")) {
      bottom = clampNumber(base.y + base.height + dy, top + minSize, 100);
    }
    return clampBlurRegionPct({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    });
  };
  const applyManualBlurRegion = (regionLike) => {
    const region = clampBlurRegionPct(regionLike || {});
    setVideoEdits((prev) => {
      if (activeBlurTargetType === "face") {
        const duration = blurTrackDurationFromEdits(prev);
        const subjects = blurSubjectsFromEdits(prev);
        const activeId = String(prev.activeBlurSubjectId || "").trim();
        const active = subjects.find((subject) => subject.id === activeId) || subjects[0] || null;
        if (active) {
          const nextSubjects = subjects.map((subject) => {
            if (subject.id !== active.id) return subject;
            return {
              ...subject,
              trackPoints: normalizeBlurTrackPoints(
                remapBlurTrackGeometry(subject.trackPoints, region),
                duration
              )
            };
          });
          return syncBlurSubjectsState(
            {
              ...prev,
              blurTargetType: "face",
              blurMode: "face"
            },
            nextSubjects,
            active.id,
            true
          );
        }
        const shape = resolveBlurShape(prev.blurShape || prev.maskShape, "circle");
        const intensity = clampNumber(toNumber(prev.blurIntensity, prev.blurFace || 45), 0, 100);
        const feather = clampNumber(toNumber(prev.blurFeather, prev.maskFeather || 8), 0, 40);
        const tracking = resolveBlurTracking(prev.blurTracking, prev.motionTrackingEnabled ? "smooth" : "off");
        const currentTime = clampNumber(
          Number(videoRef.current?.currentTime || timelinePlayhead || 0),
          0,
          Math.max(0, duration || 0)
        );
        const nextTime = Math.min(Math.max(currentTime + 0.1, 0), Math.max(0, duration || currentTime + 0.1));
        const backTime = Math.max(0, currentTime - 0.1);
        const secondTime = nextTime > currentTime + 0.0001 ? nextTime : backTime;
        const points = normalizeBlurTrackPoints(
          [
            { time: Number(currentTime.toFixed(3)), ...region, visible: true },
            { time: Number(secondTime.toFixed(3)), ...region, visible: true }
          ],
          duration
        );
        const nextLabelIndex = blurFaceSubjectCounterRef.current;
        blurFaceSubjectCounterRef.current += 1;
        const subject = {
          id: makeBlurFaceSubjectId(),
          label: `Face ${nextLabelIndex}`,
          shape,
          intensity,
          feather,
          tracking: tracking === "off" ? "smooth" : tracking,
          start: Number(Math.min(currentTime, secondTime).toFixed(3)),
          end: Number(Math.max(currentTime, secondTime).toFixed(3)),
          trackPoints: points,
          thumb: ""
        };
        const appended = [...subjects, subject].slice(-BLUR_FACE_MAX_SUBJECTS);
        return syncBlurSubjectsState(
          {
            ...prev,
            blurTargetType: "face",
            blurMode: "face"
          },
          appended,
          subject.id,
          true
        );
      }
      return {
        ...prev,
        blurX: region.x,
        blurY: region.y,
        blurWidth: region.width,
        blurHeight: region.height,
        blurCustomX: Number((region.x + region.width / 2).toFixed(3)),
        blurCustomY: Number((region.y + region.height / 2).toFixed(3)),
        blurCustomWidth: region.width,
        blurCustomHeight: region.height
      };
    });
  };
  const handleBlurPreviewPointerDown = (event) => {
    if (!blurPreviewEditEnabled) return;
    if (Number(event.button) !== 0) return;
    const point = getPreviewPointerPoint(event);
    if (!point) return;
    const hit = blurPreviewTool === "select" ? getBlurPreviewRegionHit(point) : null;
    const hitRegion = hit?.region || null;
    const hitRegionId = String(hitRegion?.id || "").trim();
    if (activeBlurTargetType === "face" && hitRegionId) {
      selectBlurSubject(hitRegionId);
    }
    const shape = resolveBlurShape(
      hitRegion?.shape ||
        (activeBlurTargetType === "face" ? activeBlurSubject?.shape : videoEdits.blurShape || videoEdits.maskShape),
      activeBlurTargetType === "face" ? "circle" : "rectangle"
    );
    const nextMode =
      blurPreviewTool === "draw"
        ? "draw"
        : hit?.kind === "handle"
        ? "resize"
        : hit?.kind === "body"
        ? "move"
        : "select-only";
    blurPreviewDragRef.current = {
      pointerId: Number(event.pointerId),
      start: point,
      last: point,
      moved: false,
      startedOnRegionId: hitRegionId,
      mode: nextMode,
      handle: hit?.handle || "",
      initialRegion:
        hitRegion && (nextMode === "move" || nextMode === "resize")
          ? clampBlurRegionPct({
              x: Number(hitRegion.left || 0),
              y: Number(hitRegion.top || 0),
              width: Number(hitRegion.width || 0),
              height: Number(hitRegion.height || 0)
            })
          : null,
      shape
    };
    if (nextMode === "move") setBlurPreviewHoverCursor("move");
    if (nextMode === "resize") setBlurPreviewHoverCursor(resolvePreviewResizeCursor(hit?.handle));
    setBlurPreviewDraftRegion(null);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore pointer capture errors
    }
    event.preventDefault();
  };
  const handleBlurPreviewPointerMove = (event) => {
    const drag = blurPreviewDragRef.current;
    if (!drag) {
      if (!blurPreviewEditEnabled) return;
      if (blurPreviewTool === "draw") {
        if (blurPreviewHoverCursor !== "crosshair") setBlurPreviewHoverCursor("crosshair");
        return;
      }
      const point = getPreviewPointerPoint(event);
      const hit = getBlurPreviewRegionHit(point);
      const nextCursor = hit?.cursor || "default";
      if (nextCursor !== blurPreviewHoverCursor) {
        setBlurPreviewHoverCursor(nextCursor);
      }
      return;
    }
    if (drag.pointerId !== Number(event.pointerId)) return;
    const point = getPreviewPointerPoint(event);
    if (!point) return;
    drag.last = point;
    const dx = Math.abs(point.x - Number(drag.start?.x || 0));
    const dy = Math.abs(point.y - Number(drag.start?.y || 0));
    const moved = dx >= BLUR_PREVIEW_CLICK_SELECT_THRESHOLD_PCT || dy >= BLUR_PREVIEW_CLICK_SELECT_THRESHOLD_PCT;
    drag.moved = drag.moved || moved;
    if (!drag.moved || drag.mode === "select-only") {
      setBlurPreviewDraftRegion(null);
      return;
    }
    if (drag.mode === "draw") {
      const region = getDrawnBlurRegion(drag.start, point);
      setBlurPreviewDraftRegion({ ...region, shape: drag.shape });
      event.preventDefault();
      return;
    }
    if (drag.mode === "move" || drag.mode === "resize") {
      const region = getDraggedRegionForMode(drag, point);
      if (region) {
        setBlurPreviewDraftRegion({ ...region, shape: drag.shape });
      }
      event.preventDefault();
      return;
    }
    event.preventDefault();
  };
  const finishBlurPreviewDrag = (event, cancelled = false) => {
    const drag = blurPreviewDragRef.current;
    if (!drag) return;
    if (drag.pointerId !== Number(event.pointerId)) return;
    const pointerPoint = getPreviewPointerPoint(event) || drag.last || drag.start || { x: 50, y: 50 };
    const currentRegion = getCurrentEditableRegion();
    if (!cancelled) {
      const shouldOnlySelectExisting = !!drag.startedOnRegionId && !drag.moved;
      if (drag.mode === "draw") {
        if (!shouldOnlySelectExisting) {
          const nextRegion = drag.moved
            ? getDrawnBlurRegion(drag.start, pointerPoint)
            : getCenteredBlurRegion(pointerPoint, currentRegion);
          applyManualBlurRegion(nextRegion);
          setBlurTrackStatus(
            activeBlurTargetType === "face"
              ? "Face region updated from preview."
              : "Blur region updated from preview."
          );
        }
      } else if ((drag.mode === "move" || drag.mode === "resize") && drag.moved) {
        const nextRegion = getDraggedRegionForMode(drag, pointerPoint);
        if (nextRegion) {
          applyManualBlurRegion(nextRegion);
          setBlurTrackStatus(
            drag.mode === "move"
              ? "Blur region moved from preview."
              : "Blur region resized from preview."
          );
        }
      }
    }
    blurPreviewDragRef.current = null;
    setBlurPreviewDraftRegion(null);
    if (blurPreviewTool === "draw") {
      setBlurPreviewHoverCursor("crosshair");
    } else {
      setBlurPreviewHoverCursor("default");
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore pointer capture errors
    }
  };
  const handleBlurPreviewPointerUp = (event) => {
    finishBlurPreviewDrag(event, false);
  };
  const handleBlurPreviewPointerCancel = (event) => {
    finishBlurPreviewDrag(event, true);
  };
  const handleBlurPreviewPointerLeave = () => {
    if (blurPreviewDragRef.current) return;
    if (blurPreviewTool === "draw") {
      if (blurPreviewHoverCursor !== "crosshair") setBlurPreviewHoverCursor("crosshair");
    } else if (blurPreviewHoverCursor !== "default") {
      setBlurPreviewHoverCursor("default");
    }
  };
  useEffect(() => {
    if (!blurPreviewEditEnabled) {
      setBlurPreviewHoverCursor((prev) => (prev === "default" ? prev : "default"));
      return;
    }
    if (blurPreviewTool === "draw") {
      setBlurPreviewHoverCursor((prev) => (prev === "crosshair" ? prev : "crosshair"));
      return;
    }
    setBlurPreviewHoverCursor((prev) => (prev === "default" ? prev : "default"));
  }, [blurPreviewEditEnabled, blurPreviewTool]);

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

  const videoLookControls = VIDEO_LOOK_CONTROL_SPECS.map((control) => ({
    ...control,
    value: Number(videoEdits[control.key] ?? 0),
    onChange: (e) => setVideoEdit(control.key, Number(e.target.value))
  }));
  const activeVideoLookControlConfig =
    videoLookControls.find((control) => control.key === activeVideoLookControl) || videoLookControls[0];

  useEffect(() => {
    if (!videoLookControls.some((control) => control.key === activeVideoLookControl)) {
      setActiveVideoLookControl(videoLookControls[0]?.key || "brightness");
    }
  }, [activeVideoLookControl, videoLookControls]);

  useEffect(() => {
    if (!isVideo) return;
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = Number(videoEdits.playbackSpeed || 1);
    video.volume = Math.max(0, Math.min(1, Number(videoEdits.volume || 0) / 100));
    video.muted = !!videoEdits.muted;
  }, [isVideo, videoEdits.playbackSpeed, videoEdits.volume, videoEdits.muted]);

  useEffect(() => {
    if (!isVideo) {
      setTimelinePreviewPlaying(false);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const syncPlaybackState = () => {
      setTimelinePreviewPlaying(!video.paused && !video.ended);
    };
    syncPlaybackState();
    video.addEventListener("play", syncPlaybackState);
    video.addEventListener("pause", syncPlaybackState);
    video.addEventListener("ended", syncPlaybackState);
    return () => {
      video.removeEventListener("play", syncPlaybackState);
      video.removeEventListener("pause", syncPlaybackState);
      video.removeEventListener("ended", syncPlaybackState);
    };
  }, [isVideo, previewUrl]);

  const timelineCanvasWidth = Math.max(920, Math.round(TIMELINE_BASE_CANVAS_WIDTH * Math.max(0.5, timelineZoom)));

  const timelineTicks = useMemo(() => {
    const marks = [];
    const approxCount = Math.max(6, Math.min(20, Math.floor(timelineCanvasWidth / 120)));
    const rawStep = timelineDuration / approxCount;
    const niceSteps = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600];
    const step = niceSteps.find((item) => item >= rawStep) || Math.max(1, Math.ceil(rawStep));
    for (let value = 0; value <= timelineDuration + 0.0001; value += step) {
      marks.push(Number(value.toFixed(4)));
    }
    if (!marks.length || marks[marks.length - 1] < timelineDuration) marks.push(timelineDuration);
    return marks;
  }, [timelineCanvasWidth, timelineDuration]);

  const secondsToTimelinePx = (seconds) => {
    const safe = clampNumber(Number(seconds || 0), 0, timelineDuration);
    return (safe / timelineDuration) * timelineCanvasWidth;
  };

  const timelinePxToSeconds = (pixels) => {
    const ratio = clampNumber(Number(pixels || 0) / Math.max(1, timelineCanvasWidth), 0, 1);
    return ratio * timelineDuration;
  };

  const getTimelineSecondsFromClientX = (clientX) => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return 0;
    const rect = viewport.getBoundingClientRect();
    const local = viewport.scrollLeft + (Number(clientX || 0) - rect.left);
    return timelinePxToSeconds(local);
  };

  const seekVideoToTimelineSeconds = (seconds) => {
    const safe = clampNumber(Number(seconds || 0), 0, timelineDuration);
    setTimelinePlayhead(safe);
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = safe;
    } catch {
      // ignore seek errors
    }
  };

  const selectedTimelineClip = useMemo(
    () => timelineClips.find((clip) => clip.id === timelineSelectedClipId) || null,
    [timelineClips, timelineSelectedClipId]
  );
  const selectedTimelineClipIsShape = useMemo(
    () => isTimelineShapeClip(selectedTimelineClip),
    [selectedTimelineClip]
  );

  useEffect(() => {
    if (!selectedTimelineClip) return;
    const nextMode =
      selectedTimelineClip.type === "audio"
        ? "audio"
        : selectedTimelineClip.type === "text" || selectedTimelineClip.type === "sticker"
          ? "text"
          : "video";
    setTimelineUpperMode(nextMode);
  }, [selectedTimelineClip]);

  const sortedTimelineClips = useMemo(
    () => [...timelineClips].sort((a, b) => a.start - b.start),
    [timelineClips]
  );

  const timelineGalleryClips = useMemo(
    () =>
      sortedTimelineClips.map((clip, idx) => {
        const fallbackLabel =
          clip.type === "video"
            ? `Clip ${idx + 1}`
            : clip.type === "text"
              ? "Title"
              : clip.type === "sticker"
                ? "Sticker"
                : "Audio";
        const rawLabel = String(clip.label || "").trim();
        const displayLabel =
          clip.type === "video"
            ? `Clip ${idx + 1}`
            : rawLabel || fallbackLabel;
        return {
          ...clip,
          label: displayLabel
        };
      }),
    [sortedTimelineClips]
  );

  const timelinePanelRows = TIMELINE_TRACKS.map((track, index) => ({
    ...track,
    code: ["V2", "V1", "A1", "A2"][index] || track.label,
    kind: index < 2 ? "video" : "audio"
  }));

  const timelineClipMatchesMode = (clip, mode) => {
    if (!clip) return false;
    if (mode === "text") return clip.type === "text" || clip.type === "sticker";
    if (mode === "audio") return clip.type === "audio";
    return clip.type === "video";
  };

  const timelineModeClips = useMemo(() => {
    const filtered = timelineGalleryClips.filter((clip) => timelineClipMatchesMode(clip, timelineUpperMode));
    return filtered.length ? filtered : timelineGalleryClips;
  }, [timelineGalleryClips, timelineUpperMode]);

  const timelineModeCounts = useMemo(
    () => ({
      text: timelineGalleryClips.filter((clip) => timelineClipMatchesMode(clip, "text")).length,
      video: timelineGalleryClips.filter((clip) => timelineClipMatchesMode(clip, "video")).length,
      audio: timelineGalleryClips.filter((clip) => timelineClipMatchesMode(clip, "audio")).length
    }),
    [timelineGalleryClips]
  );
  const premiereMenuGroups = useMemo(
    () =>
      PREMIERE_MENU_GROUPS.map((menu) => {
        if (menu.key !== "edit") return menu;
        return {
          ...menu,
          items: menu.items.map((item) => {
            if (!item?.action) return item;
            if (item.action === "track-text.focus") {
              return { ...item, label: `Text ${timelineModeCounts.text}` };
            }
            if (item.action === "track-video.focus") {
              return { ...item, label: `Video ${timelineModeCounts.video}` };
            }
            if (item.action === "track-audio.focus") {
              return { ...item, label: `Audio ${timelineModeCounts.audio}` };
            }
            return item;
          })
        };
      }),
    [timelineModeCounts]
  );

  const sourceMonitorVideoClips = useMemo(
    () => timelineGalleryClips.filter((clip) => clip.type === "video"),
    [timelineGalleryClips]
  );

  useEffect(() => {
    const availableIds = sourceMonitorVideoClips.map((clip) => clip.id);
    setSourceMonitorOpenClipIds((prev) => {
      const next = prev.filter((id) => availableIds.includes(id));
      availableIds.forEach((id) => {
        if (!next.includes(id)) next.push(id);
      });
      return next;
    });
  }, [sourceMonitorVideoClips]);

  const sourceMonitorOpenClips = useMemo(() => {
    if (!sourceMonitorOpenClipIds.length) return [];
    const openIdSet = new Set(sourceMonitorOpenClipIds);
    return sourceMonitorVideoClips.filter((clip) => openIdSet.has(clip.id));
  }, [sourceMonitorOpenClipIds, sourceMonitorVideoClips]);

  const activeSourceMonitorClip = useMemo(() => {
    if (!sourceMonitorOpenClips.length) return null;
    if (
      selectedTimelineClip &&
      selectedTimelineClip.type === "video" &&
      sourceMonitorOpenClipIds.includes(selectedTimelineClip.id)
    ) {
      return selectedTimelineClip;
    }
    const safePlayhead = Number(timelinePlayhead || 0);
    return (
      sourceMonitorOpenClips.find(
        (clip) =>
          safePlayhead >= Number(clip.start || 0) &&
          safePlayhead <= Number(clip.end || 0)
      ) || sourceMonitorOpenClips[0]
    );
  }, [sourceMonitorOpenClips, selectedTimelineClip, sourceMonitorOpenClipIds, timelinePlayhead]);

  useEffect(() => {
    if (!sourceMonitorMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!sourceMonitorMenuRef.current) return;
      if (!sourceMonitorMenuRef.current.contains(event.target)) {
        setSourceMonitorMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSourceMonitorMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sourceMonitorMenuOpen]);

  const setTimelineUpperModeWithFocus = (mode) => {
    setTimelineUpperMode(mode);
    setActiveVideoBottomPage("timeline");
    if (mode === "text") {
      setActiveVideoTool("text");
    } else if (mode === "audio") {
      setActiveVideoTool("audio-pro");
    } else {
      setActiveVideoTool("edit");
    }
    const first = timelineGalleryClips.find((clip) => timelineClipMatchesMode(clip, mode));
    if (first) {
      setTimelineSelectedClipId(first.id);
    }
  };

  const timelineClipFrameSrcById = useMemo(() => {
    if (!Array.isArray(coverFrames) || coverFrames.length === 0) return {};
    const next = {};
    timelineGalleryClips.forEach((clip) => {
      if (clip.type !== "video") return;
      const midpoint = (Number(clip.start || 0) + Number(clip.end || 0)) / 2;
      let bestFrame = coverFrames[0];
      let bestDistance = Math.abs(Number(bestFrame?.time || 0) - midpoint);
      for (const frame of coverFrames) {
        const distance = Math.abs(Number(frame?.time || 0) - midpoint);
        if (distance < bestDistance) {
          bestFrame = frame;
          bestDistance = distance;
        }
      }
      if (bestFrame?.src) next[clip.id] = bestFrame.src;
    });
    return next;
  }, [coverFrames, timelineGalleryClips]);

  const updateTimelineClip = (clipId, updater) => {
    setTimelineClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== clipId) return clip;
        const next = typeof updater === "function" ? updater(clip) : { ...clip, ...(updater || {}) };
        return next;
      })
    );
  };

  const focusTimelineClipForEditing = (clip, mode = "timeline") => {
    if (!clip) return;
    setTimelineSelectedClipId(clip.id);
    setActiveVideoBottomPage("timeline");
    if (mode === "studio") {
      if (clip.type === "text") setActiveVideoTool("text");
      else if (clip.type === "sticker") setActiveVideoTool("stickers");
      else if (clip.type === "audio") setActiveVideoTool("audio-pro");
      else setActiveVideoTool("edit");
    }
    const midpoint = (Number(clip.start || 0) + Number(clip.end || 0)) / 2;
    seekVideoToTimelineSeconds(midpoint);
  };

  const activeTimelineOverlayClips = useMemo(
    () =>
      timelineClips.filter(
        (clip) =>
          isOverlayTimelineClip(clip) &&
          timelinePlayhead >= Number(clip.start || 0) &&
          timelinePlayhead <= Number(clip.end || 0)
      ),
    [timelineClips, timelinePlayhead]
  );

  const hasTimelineOverlayClips = useMemo(
    () => timelineClips.some((clip) => isOverlayTimelineClip(clip)),
    [timelineClips]
  );

  const addTimelineTextClip = (options = {}) => {
    const opts = options && typeof options === "object" ? options : {};
    const allowFallbackText = opts.allowFallbackText === true;
    const fallbackPrefix = String(opts.fallbackPrefix || "Title").trim() || "Title";
    const requestedText = String(opts.text || "").trim();
    const existingText = String(videoEdits.overlayText || "").trim();
    const text =
      requestedText ||
      existingText ||
      (allowFallbackText ? `${fallbackPrefix} ${Math.max(1, timelineModeCounts.text + 1)}` : "");
    if (!text) return null;
    const start = clampNumber(timelinePlayhead, 0, Math.max(0, timelineDuration - TIMELINE_MIN_CLIP_SECONDS));
    const end = clampNumber(start + 3.5, start + TIMELINE_MIN_CLIP_SECONDS, timelineDuration);
    const next = {
      id: makeTimelineClipId("text"),
      type: "text",
      trackId: timelineTrackForType("text"),
      start,
      end,
      label: text.length > 22 ? `${text.slice(0, 22)}...` : text,
      payload: {
        text,
        textSize: Number(videoEdits.textSize || 34),
        textPosition: videoEdits.textPosition || "bottom-center",
        overlayOpacity: Number(videoEdits.overlayOpacity || 70),
        overlayMode: videoEdits.overlayMode || "screen"
      }
    };
    setTimelineClips((prev) => [...prev, next]);
    setTimelineSelectedClipId(next.id);
    if (!existingText && !requestedText && allowFallbackText) {
      setVideoEdits((prev) => ({ ...prev, overlayText: text }));
    }
    return next;
  };

  const addTimelineShapeClip = (shapeKind = "rectangle") => {
    const shape = String(shapeKind || "").trim().toLowerCase() === "ellipse" ? "ellipse" : "rectangle";
    const labelBase = shape === "ellipse" ? "Ellipse" : "Rectangle";
    const start = clampNumber(timelinePlayhead, 0, Math.max(0, timelineDuration - TIMELINE_MIN_CLIP_SECONDS));
    const end = clampNumber(start + 3.2, start + TIMELINE_MIN_CLIP_SECONDS, timelineDuration);
    const next = {
      id: makeTimelineClipId("text"),
      type: "text",
      trackId: timelineTrackForType("text"),
      start,
      end,
      label: `${labelBase} ${Math.max(1, timelineModeCounts.text + 1)}`,
      payload: {
        text: labelBase,
        graphicShape: shape,
        textSize: clampNumber(Number(videoEdits.textSize || 34) * 2.25, 54, 220),
        textPosition: videoEdits.textPosition || "center",
        overlayOpacity: clampNumber(Number(videoEdits.overlayOpacity || 70), 10, 100),
        overlayMode: videoEdits.overlayMode || "screen"
      }
    };
    setTimelineClips((prev) => [...prev, next]);
    setTimelineSelectedClipId(next.id);
    return next;
  };

  const addTimelineStickerClip = () => {
    const sticker = String(videoEdits.sticker || "none").trim();
    if (!sticker || sticker === "none") return null;
    const start = clampNumber(timelinePlayhead, 0, Math.max(0, timelineDuration - TIMELINE_MIN_CLIP_SECONDS));
    const end = clampNumber(start + 2.8, start + TIMELINE_MIN_CLIP_SECONDS, timelineDuration);
    const selected = STICKER_OPTIONS.find((item) => item.value === sticker);
    const next = {
      id: makeTimelineClipId("sticker"),
      type: "sticker",
      trackId: timelineTrackForType("sticker"),
      start,
      end,
      label: selected?.label || "Sticker",
      payload: {
        sticker,
        stickerSize: Number(videoEdits.stickerSize || 72),
        stickerPosition: videoEdits.stickerPosition || "top-right",
        overlayMode: videoEdits.overlayMode || "screen"
      }
    };
    setTimelineClips((prev) => [...prev, next]);
    setTimelineSelectedClipId(next.id);
    return next;
  };

  const moveOverlayLayerById = (clipId, placement = "forward") => {
    const targetClipId = String(clipId || "").trim();
    if (!targetClipId) return { ok: false, reason: "missing" };
    let result = "missing";
    setTimelineClips((prev) => {
      const overlayTrackIndexes = [];
      prev.forEach((clip, index) => {
        if (isOverlayTimelineClip(clip)) overlayTrackIndexes.push(index);
      });
      if (!overlayTrackIndexes.length) {
        result = "none";
        return prev;
      }
      const currentOverlayIndex = overlayTrackIndexes.findIndex((index) => prev[index].id === targetClipId);
      if (currentOverlayIndex < 0) {
        result = "missing";
        return prev;
      }
      let targetOverlayIndex = currentOverlayIndex;
      if (placement === "front") targetOverlayIndex = overlayTrackIndexes.length - 1;
      else if (placement === "back") targetOverlayIndex = 0;
      else if (placement === "forward") targetOverlayIndex = Math.min(overlayTrackIndexes.length - 1, currentOverlayIndex + 1);
      else if (placement === "backward") targetOverlayIndex = Math.max(0, currentOverlayIndex - 1);
      if (targetOverlayIndex === currentOverlayIndex) {
        result = "edge";
        return prev;
      }
      const sourceIndex = overlayTrackIndexes[currentOverlayIndex];
      const destinationIndex = overlayTrackIndexes[targetOverlayIndex];
      const next = [...prev];
      const [movingClip] = next.splice(sourceIndex, 1);
      const adjustedDestination = sourceIndex < destinationIndex ? destinationIndex - 1 : destinationIndex;
      next.splice(adjustedDestination, 0, movingClip);
      result = "moved";
      return next;
    });
    if (result === "moved") {
      setTimelineSelectedClipId(targetClipId);
      setTimelineUpperMode("text");
      setActiveVideoBottomPage("timeline");
      return { ok: true, reason: result };
    }
    return { ok: false, reason: result };
  };

  const resolveSelectedOverlayLayerId = () => {
    if (isOverlayTimelineClip(selectedTimelineClip)) return selectedTimelineClip.id;
    const fallback = timelineClips.find((clip) => isOverlayTimelineClip(clip));
    if (!fallback) return "";
    setTimelineSelectedClipId(fallback.id);
    return fallback.id;
  };

  const deleteSelectedTimelineClip = () => {
    if (!timelineSelectedClipId || selectedTimelineClip?.type === "video") return;
    setTimelineClips((prev) => prev.filter((clip) => clip.id !== timelineSelectedClipId));
    setTimelineSelectedClipId("");
  };

  const splitTimelineClipAtSeconds = (clip, splitSeconds, options = {}) => {
    if (!clip) return false;
    const fallbackToMidpoint = !!options.fallbackToMidpoint;
    const start = Number(clip.start || 0);
    const end = Number(clip.end || 0);
    const minSplit = start + TIMELINE_MIN_CLIP_SECONDS;
    const maxSplit = end - TIMELINE_MIN_CLIP_SECONDS;
    if (minSplit >= maxSplit) return false;

    const requestedSplit = clampNumber(Number(splitSeconds || 0), start, end);
    let splitAt = requestedSplit;
    if (fallbackToMidpoint && (splitAt <= minSplit || splitAt >= maxSplit)) {
      const fallbackSplit = (start + end) / 2;
      splitAt = clampNumber(fallbackSplit, minSplit, maxSplit);
    }

    if (splitAt <= minSplit || splitAt >= maxSplit) return false;

    const leftClip = {
      ...clip,
      id: makeTimelineClipId(clip.type),
      end: splitAt
    };
    const rightClip = {
      ...clip,
      id: makeTimelineClipId(clip.type),
      start: splitAt
    };

    setTimelineClips((prev) => {
      const next = prev.filter((item) => item.id !== clip.id);
      next.push(leftClip, rightClip);
      return next;
    });
    setTimelineSelectedClipId(rightClip.id);
    return true;
  };

  const splitSelectedTimelineClip = () => {
    if (!selectedTimelineClip) return;
    splitTimelineClipAtSeconds(selectedTimelineClip, timelinePlayhead);
  };

  const stepTimelineBySeconds = (deltaSeconds) => {
    const next = clampNumber(Number(timelinePlayhead || 0) + Number(deltaSeconds || 0), 0, timelineDuration);
    seekVideoToTimelineSeconds(next);
  };

  const markMonitorInAtPlayhead = () => {
    const duration = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
    const start = clampNumber(Number(timelinePlayhead || 0), 0, duration);
    setVideoEdits((prev) => {
      const prevEndRaw = Math.max(0, Number(prev.trimEnd || 0));
      const minEnd = Math.min(duration, start + 0.05);
      const nextEnd =
        prevEndRaw > minEnd
          ? clampNumber(prevEndRaw, minEnd, duration)
          : clampNumber(duration, minEnd, duration);
      return {
        ...prev,
        trimStart: Number(start.toFixed(3)),
        trimEnd: Number(nextEnd.toFixed(3))
      };
    });
  };

  const markMonitorOutAtPlayhead = () => {
    const duration = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
    const rawOut = clampNumber(Number(timelinePlayhead || 0), 0, duration);
    setVideoEdits((prev) => {
      const start = clampNumber(Number(prev.trimStart || 0), 0, Math.max(0, duration - 0.05));
      const minOut = Math.min(duration, start + 0.05);
      const out = clampNumber(rawOut, minOut, duration);
      return {
        ...prev,
        trimStart: Number(start.toFixed(3)),
        trimEnd: Number(out.toFixed(3))
      };
    });
  };

  const goToMonitorInPoint = () => {
    const duration = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
    const start = clampNumber(Number(videoEdits.trimStart || 0), 0, duration);
    seekVideoToTimelineSeconds(start);
  };

  const goToMonitorOutPoint = () => {
    const duration = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
    const start = clampNumber(Number(videoEdits.trimStart || 0), 0, Math.max(0, duration - 0.05));
    const rawEnd = Math.max(0, Number(videoEdits.trimEnd || 0));
    const end = rawEnd > start + 0.05 ? clampNumber(rawEnd, start + 0.05, duration) : duration;
    seekVideoToTimelineSeconds(end);
  };

  const stepTimelineByFrame = (direction = 1) => {
    const frameStep = 1 / 30;
    stepTimelineBySeconds(frameStep * (direction >= 0 ? 1 : -1));
  };

  const addTimelineMarker = () => {
    const marker = Number(clampNumber(timelinePlayhead, 0, timelineDuration).toFixed(2));
    setTimelineMarkers((prev) => {
      if (prev.some((value) => Math.abs(Number(value || 0) - marker) <= 0.05)) return prev;
      return [...prev, marker].sort((a, b) => a - b);
    });
  };

  const removeTimelineMarker = (markerSeconds) => {
    const safeMarker = Number(markerSeconds || 0);
    setTimelineMarkers((prev) => prev.filter((value) => Math.abs(Number(value || 0) - safeMarker) > 0.05));
  };

  const toggleTimelineFullscreen = () => {
    if (typeof document === "undefined") return;
    const isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
      document.exitFullscreen?.().catch(() => {});
      return;
    }
    timelineWorkspaceRef.current?.requestFullscreen?.().catch(() => {});
  };

  const triggerTimelineRender = () => {
    const clipCount = Array.isArray(timelineClips) ? timelineClips.length : 0;
    setMsg(`Render started for ${clipCount} timeline clip${clipCount === 1 ? "" : "s"}.`);
  };

  const toggleTimelinePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      video.play().catch(() => {});
      return;
    }
    video.pause();
  };

  const insertOrOverwriteAtPlayhead = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a timeline clip first.");
      return;
    }
    const applied = splitTimelineClipAtSeconds(selectedTimelineClip, timelinePlayhead, { fallbackToMidpoint: true });
    if (applied) {
      setMsg("Insert/overwrite marker applied at playhead.");
      return;
    }
    setMsg("Could not apply insert/overwrite at this playhead.");
  };

  const exportCurrentFrame = () => {
    const duration = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
    const frameTime = clampNumber(Number(timelinePlayhead || 0), 0, duration);
    setVideoEdits((prev) => ({
      ...prev,
      coverMode: "video_frame",
      coverTime: Number(frameTime.toFixed(3))
    }));
    setCustomCoverFile(null);
    setMsg(`Frame captured for cover at ${formatTimelineTime(frameTime)}.`);
  };

  const toggleMonitorButtonEditor = () => {
    setTimelineSettingsOpen((prev) => !prev);
  };

  const addMonitorButton = () => {
    addTimelineMarker();
  };

  const openSourceMonitorClip = (clipId) => {
    const clip = sourceMonitorOpenClips.find((item) => item.id === clipId);
    if (!clip) return;
    focusTimelineClipForEditing(clip, "timeline");
    seekVideoToTimelineSeconds(Number(clip.start || 0));
    setSourceMonitorMenuOpen(false);
  };

  const closeSourceMonitorClip = (clipId) => {
    const clip = sourceMonitorOpenClips.find((item) => item.id === clipId);
    if (!clip) return;
    setSourceMonitorOpenClipIds((prev) => prev.filter((id) => id !== clipId));
    const remaining = sourceMonitorOpenClips.filter((item) => item.id !== clipId);
    if (remaining.length > 0) {
      const nextClip = remaining[0];
      focusTimelineClipForEditing(nextClip, "timeline");
      seekVideoToTimelineSeconds(Number(nextClip.start || 0));
      setMsg(`Closed source clip: ${String(clip.label || "Clip").trim() || "Clip"}.`);
    } else {
      setMsg("All source clips are closed.");
    }
    setSourceMonitorMenuOpen(false);
  };

  const closeAllSourceMonitorClips = () => {
    if (!sourceMonitorOpenClips.length) {
      setSourceMonitorMenuOpen(false);
      return;
    }
    setSourceMonitorOpenClipIds([]);
    setSourceMonitorMenuOpen(false);
    setMsg("All source clips closed.");
  };

  const toggleSourceMonitorDockState = () => {
    setSourceMonitorPanelVisible(true);
    setSourceMonitorUndocked((prev) => !prev);
    setSourceMonitorMenuOpen(false);
  };

  const closeSourceMonitorPanel = () => {
    setSourceMonitorPanelVisible(false);
    setSourceMonitorMenuOpen(false);
  };

  const focusAdjacentTimelineClip = (direction = 1) => {
    if (!sortedTimelineClips.length) return;
    const step = direction >= 0 ? 1 : -1;
    if (timelineSelectedClipId) {
      const selectedIndex = sortedTimelineClips.findIndex((clip) => clip.id === timelineSelectedClipId);
      if (selectedIndex >= 0) {
        const nextIndex = clampNumber(selectedIndex + step, 0, sortedTimelineClips.length - 1);
        focusTimelineClipForEditing(sortedTimelineClips[nextIndex], "timeline");
        return;
      }
    }

    const safePlayhead = Number(timelinePlayhead || 0);
    if (step > 0) {
      const next = sortedTimelineClips.find((clip) => Number(clip.start || 0) > safePlayhead + 0.01) || sortedTimelineClips[sortedTimelineClips.length - 1];
      focusTimelineClipForEditing(next, "timeline");
      return;
    }

    const prev =
      [...sortedTimelineClips].reverse().find((clip) => Number(clip.end || 0) < safePlayhead - 0.01) ||
      sortedTimelineClips[0];
    focusTimelineClipForEditing(prev, "timeline");
  };

  const openTimelineStudioTool = (toolKey) => {
    if (toolKey === "effects") {
      setActiveVideoTool("fx-pro");
      return;
    }
    if (toolKey === "audio") {
      setActiveVideoTool("audio-pro");
      return;
    }
    if (toolKey === "settings") {
      setTimelineSettingsOpen((prev) => !prev);
      return;
    }
    if (toolKey === "captions") {
      setTimelineCaptionsOn((prev) => !prev);
      setActiveVideoTool("captions");
      return;
    }
    if (toolKey === "mic") {
      setTimelineVoiceInputOn((prev) => !prev);
      setActiveVideoTool("audio-pro");
      return;
    }
    if (toolKey === "color") {
      setActiveVideoTool("grading-pro");
      return;
    }
    if (toolKey === "filters") {
      setActiveVideoTool("filters");
      return;
    }
    if (toolKey === "audio-level-up") {
      setActiveVideoTool("audio-pro");
      return;
    }
  };

  const activateVideoTool = (toolKey) => {
    const resolvedToolKey = resolveVideoToolKey(toolKey);
    setActiveVideoTool(resolvedToolKey);
    setActiveVideoToolGroup(getVideoToolGroupKey(resolvedToolKey));
    if (resolvedToolKey === "audio-pro" || resolvedToolKey === "import-audio") {
      setTimelineUpperMode("audio");
      return;
    }
    if (
      resolvedToolKey === "text" ||
      resolvedToolKey === "stickers" ||
      resolvedToolKey === "captions" ||
      resolvedToolKey === "titles-pro" ||
      resolvedToolKey === "overlay"
    ) {
      setTimelineUpperMode("text");
      return;
    }
    setTimelineUpperMode("video");
  };

  const buildPremiereProjectPayload = () => ({
    version: 1,
    app: "SocialSea Timeline Studio",
    savedAt: new Date().toISOString(),
    media: {
      fileName: String(file?.name || "").trim(),
      fileType: String(file?.type || "").trim(),
      duration: Number(videoMeta.duration || timelineDuration || 0)
    },
    editor: buildTimelineEditorSnapshot(true)
  });

  const downloadPremiereProjectPayload = (payload, fileSuffix = "project") => {
    const safeSuffix = String(fileSuffix || "project")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "") || "project";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `socialsea-${safeSuffix}-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 50);
  };

  const downloadTextArtifact = (content, fileName, mimeType = "text/plain;charset=utf-8") => {
    const blob = new Blob([String(content || "")], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 50);
  };

  const buildShotcutMltProjectText = () => {
    const escapeXml = (value) =>
      String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    const toFrame = (seconds, fps) => Math.max(0, Math.round(Number(seconds || 0) * fps));
    const resolveShotcutAlign = (position) => {
      const key = String(position || "").trim().toLowerCase();
      if (key === "top-left") return { halign: "left", valign: "top" };
      if (key === "top-right") return { halign: "right", valign: "top" };
      if (key === "center") return { halign: "center", valign: "middle" };
      if (key === "bottom-left") return { halign: "left", valign: "bottom" };
      if (key === "bottom-right") return { halign: "right", valign: "bottom" };
      if (key === "bottom-center") return { halign: "center", valign: "bottom" };
      return { halign: "center", valign: "bottom" };
    };
    const stickerText = (clip) => {
      const stickerValue = String(clip?.payload?.sticker || "").trim();
      return STICKER_TEXT_FALLBACK[stickerValue] || String(clip?.label || "Sticker");
    };
    const overlayText = (clip) => {
      if (clip?.type === "sticker") return stickerText(clip);
      const shapeKind = resolveTimelineShapeKind(clip);
      if (shapeKind === "ellipse") return "â—¯";
      if (shapeKind === "rectangle") return "â–­";
      return String(clip?.payload?.text || clip?.label || "Text");
    };

    const projectDuration = Math.max(
      TIMELINE_MIN_CLIP_SECONDS,
      Number(videoMeta.duration || timelineDuration || 0) || 0
    );
    const fps = 30;
    const width = Math.max(2, Math.round(Number(videoMeta.width || 1920) || 1920));
    const height = Math.max(2, Math.round(Number(videoMeta.height || 1080) || 1080));
    const lastFrame = Math.max(1, toFrame(projectDuration, fps) - 1);

    const sourceName = String(file?.name || "video.mp4").trim() || "video.mp4";
    const sourceId = "main_source";
    const sourcePlaylistId = "playlist0";
    const videoTimelineClips = [...timelineClips]
      .filter((clip) => clip?.type === "video" && clip?.disabled !== true)
      .sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
    const overlayTimelineClips = timelineClips.filter((clip) => isOverlayTimelineClip(clip));

    const videoEntryLines = [];
    let timelineCursor = 0;
    if (videoTimelineClips.length) {
      videoTimelineClips.forEach((clip) => {
        const start = clampNumber(toFrame(clip.start, fps), 0, lastFrame);
        const end = clampNumber(
          Math.max(start, toFrame(clip.end, fps) - 1),
          start,
          lastFrame
        );
        if (start > timelineCursor) {
          videoEntryLines.push(`    <blank length="${Math.max(1, start - timelineCursor)}"/>`);
        }
        videoEntryLines.push(
          `    <entry producer="${sourceId}" in="${start}" out="${end}"/>`
        );
        timelineCursor = end + 1;
      });
      if (timelineCursor <= lastFrame) {
        videoEntryLines.push(`    <blank length="${Math.max(1, lastFrame - timelineCursor + 1)}"/>`);
      }
    } else {
      videoEntryLines.push(`    <entry producer="${sourceId}" in="0" out="${lastFrame}"/>`);
    }

    const overlayFilterLines = overlayTimelineClips
      .map((clip) => {
        const start = clampNumber(toFrame(clip.start, fps), 0, lastFrame);
        const end = clampNumber(Math.max(start, toFrame(clip.end, fps) - 1), start, lastFrame);
        if (end < start) return "";
        const rawText = overlayText(clip).slice(0, 220);
        const { halign, valign } = resolveShotcutAlign(
          clip?.type === "sticker" ? clip?.payload?.stickerPosition : clip?.payload?.textPosition
        );
        const opacity = clampNumber(
          Number(clip?.payload?.overlayOpacity || 70) / 100,
          0.05,
          1
        );
        const shapeKind = resolveTimelineShapeKind(clip);
        const baseSize = shapeKind
          ? clampNumber(Number(clip?.payload?.textSize || 84), 24, 240)
          : clip?.type === "sticker"
            ? clampNumber(Number(clip?.payload?.stickerSize || 72), 24, 240)
            : clampNumber(Number(clip?.payload?.textSize || 34), 16, 240);
        const size = Math.round(baseSize);
        const safeText = escapeXml(rawText);
        return [
          `    <filter in="${start}" out="${end}">`,
          `      <property name="mlt_service">dynamictext</property>`,
          `      <property name="shotcut:filter">dynamicText</property>`,
          `      <property name="argument">${safeText}</property>`,
          `      <property name="geometry">0%/0%:100%x100%:100</property>`,
          `      <property name="fgcolour">0xffffffff</property>`,
          `      <property name="olcolour">0x000000ff</property>`,
          `      <property name="outline">2</property>`,
          `      <property name="size">${size}</property>`,
          `      <property name="halign">${halign}</property>`,
          `      <property name="valign">${valign}</property>`,
          `      <property name="opacity">${opacity.toFixed(3)}</property>`,
          `    </filter>`
        ].join("\n");
      })
      .filter(Boolean);

    const xmlLines = [
      `<?xml version="1.0" encoding="utf-8"?>`,
      `<mlt LC_NUMERIC="C" version="7.0.0" title="Shotcut version 25.05.11" producer="main_tractor">`,
      `  <profile description="SocialSea Export" width="${width}" height="${height}" progressive="1" sample_aspect_num="1" sample_aspect_den="1" display_aspect_num="${width}" display_aspect_den="${height}" frame_rate_num="${fps}" frame_rate_den="1" colorspace="709"/>`,
      `  <chain id="${sourceId}" out="${lastFrame}">`,
      `    <property name="resource">${escapeXml(sourceName)}</property>`,
      `    <property name="mlt_service">avformat-novalidate</property>`,
      `    <property name="shotcut:caption">${escapeXml(sourceName)}</property>`,
      `    <property name="shotcut:detail">${escapeXml(sourceName)}</property>`,
      `  </chain>`,
      `  <producer id="black" out="${lastFrame}">`,
      `    <property name="resource">black</property>`,
      `    <property name="mlt_service">color</property>`,
      `  </producer>`,
      `  <playlist id="main bin">`,
      `    <entry producer="${sourceId}" in="0" out="${lastFrame}"/>`,
      `  </playlist>`,
      `  <playlist id="background">`,
      `    <entry producer="black" in="0" out="${lastFrame}"/>`,
      `  </playlist>`,
      `  <playlist id="${sourcePlaylistId}">`,
      ...videoEntryLines,
      `  </playlist>`,
      `  <tractor id="main_tractor" out="${lastFrame}">`,
      `    <property name="shotcut">1</property>`,
      `    <property name="shotcut:trackHeight">86</property>`,
      `    <property name="shotcut:scaleFactor">1.0</property>`,
      `    <multitrack>`,
      `      <track producer="background"/>`,
      `      <track producer="${sourcePlaylistId}"/>`,
      `    </multitrack>`,
      ...overlayFilterLines,
      `  </tractor>`,
      `</mlt>`
    ];
    return xmlLines.join("\n");
  };

  const applyPremiereProjectPayload = (payloadLike, sourceLabel = "Project") => {
    const payload = payloadLike && typeof payloadLike === "object" ? payloadLike : null;
    if (!payload) {
      setMsg(`${sourceLabel} could not be loaded.`);
      return;
    }
    const editor =
      payload.editor && typeof payload.editor === "object"
        ? payload.editor
        : payload;
    timelineHistoryCaptureBlockedRef.current = true;
    applyTimelineEditorSnapshot(editor, { includePlayhead: true });
    setMsg(`${sourceLabel} loaded.`);
  };

  const savePremiereProjectDraft = () => {
    try {
      const payload = buildPremiereProjectPayload();
      localStorage.setItem(PREMIERE_PROJECT_DRAFT_STORAGE_KEY, JSON.stringify(payload));
      setMsg("Project saved to local draft.");
    } catch {
      setMsg("Could not save the project draft in this browser.");
    }
  };

  const createTimelineClipClone = (clipLike, preferredStart = null) => {
    const source = clipLike && typeof clipLike === "object" ? clipLike : null;
    if (!source) return null;
    const length = Math.max(
      TIMELINE_MIN_CLIP_SECONDS,
      Number(source.end || 0) - Number(source.start || 0)
    );
    const startCandidate = preferredStart == null
      ? Number(source.start || 0)
      : Number(preferredStart || 0);
    const start = clampNumber(
      startCandidate,
      0,
      Math.max(0, timelineDuration - TIMELINE_MIN_CLIP_SECONDS)
    );
    const end = clampNumber(start + length, start + TIMELINE_MIN_CLIP_SECONDS, timelineDuration);
    return {
      ...cloneSerializable(source),
      id: makeTimelineClipId(source.type || "clip"),
      start: Number(start.toFixed(4)),
      end: Number(end.toFixed(4))
    };
  };

  const copySelectedTimelineClip = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a clip first.");
      return false;
    }
    timelineClipboardRef.current = cloneSerializable(selectedTimelineClip);
    setMsg(`Copied ${String(selectedTimelineClip.label || selectedTimelineClip.type || "clip")} to clipboard.`);
    return true;
  };

  const pasteTimelineClipFromClipboard = () => {
    const copied = timelineClipboardRef.current;
    if (!copied || typeof copied !== "object") {
      setMsg("Clipboard is empty.");
      return false;
    }
    const clone = createTimelineClipClone(copied, timelinePlayhead);
    if (!clone) {
      setMsg("Clipboard clip could not be pasted.");
      return false;
    }
    setTimelineClips((prev) => [...prev, clone].sort((a, b) => Number(a.start || 0) - Number(b.start || 0)));
    setTimelineSelectedClipId(clone.id);
    seekVideoToTimelineSeconds(clone.start);
    setMsg("Clip pasted at playhead.");
    return true;
  };

  const duplicateSelectedTimelineClip = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a clip first.");
      return false;
    }
    const insertAt = Number(selectedTimelineClip.end || 0) + 0.05;
    const clone = createTimelineClipClone(selectedTimelineClip, insertAt);
    if (!clone) {
      setMsg("Duplicate failed.");
      return false;
    }
    setTimelineClips((prev) => [...prev, clone].sort((a, b) => Number(a.start || 0) - Number(b.start || 0)));
    setTimelineSelectedClipId(clone.id);
    seekVideoToTimelineSeconds(clone.start);
    setMsg("Clip duplicated.");
    return true;
  };

  const liftSelectedTimelineClip = () => {
    if (!selectedTimelineClip || selectedTimelineClip.type === "video") {
      setMsg("Lift is available for non-main clips only.");
      return false;
    }
    const removedId = selectedTimelineClip.id;
    setTimelineClips((prev) => prev.filter((clip) => clip.id !== removedId));
    setTimelineSelectedClipId("");
    setMsg("Lift applied.");
    return true;
  };

  const extractSelectedTimelineClip = () => {
    if (!selectedTimelineClip || selectedTimelineClip.type === "video") {
      setMsg("Extract is available for non-main clips only.");
      return false;
    }
    const selected = selectedTimelineClip;
    const gap = Math.max(TIMELINE_MIN_CLIP_SECONDS, Number(selected.end || 0) - Number(selected.start || 0));
    const removedId = selected.id;
    const safeStart = Number(selected.start || 0);
    const safeEnd = Number(selected.end || 0);
    setTimelineClips((prev) =>
      prev
        .filter((clip) => clip.id !== removedId)
        .map((clip) => {
          if (clip.trackId !== selected.trackId) return clip;
          const clipStart = Number(clip.start || 0);
          const clipEnd = Number(clip.end || 0);
          if (clipStart + 0.0001 < safeEnd) return clip;
          return {
            ...clip,
            start: Number(clampNumber(clipStart - gap, 0, timelineDuration).toFixed(4)),
            end: Number(clampNumber(clipEnd - gap, TIMELINE_MIN_CLIP_SECONDS, timelineDuration).toFixed(4))
          };
        })
    );
    setTimelineSelectedClipId("");
    seekVideoToTimelineSeconds(safeStart);
    setMsg("Extract applied with ripple shift.");
    return true;
  };

  const toggleSelectedClipEnabled = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a clip first.");
      return false;
    }
    const selectedId = selectedTimelineClip.id;
    let enabled = true;
    setTimelineClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== selectedId) return clip;
        enabled = clip.disabled === true;
        return { ...clip, disabled: clip.disabled !== true };
      })
    );
    setMsg(enabled ? "Clip enabled." : "Clip disabled.");
    return true;
  };

  const groupSelectedTimelineClip = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a clip first.");
      return false;
    }
    const existingGroupId = String(selectedTimelineClip.groupId || "").trim();
    const groupId = existingGroupId || `group-${Date.now().toString(36)}`;
    updateTimelineClip(selectedTimelineClip.id, { groupId });
    setTimelineLinkedClips(true);
    setMsg("Clip grouped.");
    return true;
  };

  const ungroupSelectedTimelineClip = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a clip first.");
      return false;
    }
    updateTimelineClip(selectedTimelineClip.id, (clip) => {
      const next = { ...(clip || {}) };
      delete next.groupId;
      return next;
    });
    setMsg("Clip ungrouped.");
    return true;
  };

  const synchronizeSelectedTimelineClip = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a clip first.");
      return false;
    }
    const selected = selectedTimelineClip;
    const selectedType = String(selected.type || "").trim().toLowerCase();
    const candidates = timelineClips.filter((clip) => {
      if (!clip || clip.id === selected.id || clip.disabled === true) return false;
      const type = String(clip.type || "").trim().toLowerCase();
      if (selectedType === "audio") return type === "video";
      if (selectedType === "video") return type === "audio";
      return type === "video";
    });
    if (!candidates.length) {
      setMsg("No compatible clip found to sync against.");
      return false;
    }
    const selectedMidpoint = (Number(selected.start || 0) + Number(selected.end || 0)) / 2;
    const anchor = candidates.reduce((best, clip) => {
      if (!best) return clip;
      const bestMid = (Number(best.start || 0) + Number(best.end || 0)) / 2;
      const clipMid = (Number(clip.start || 0) + Number(clip.end || 0)) / 2;
      return Math.abs(clipMid - selectedMidpoint) < Math.abs(bestMid - selectedMidpoint) ? clip : best;
    }, null);
    const selectedLength = Math.max(
      TIMELINE_MIN_CLIP_SECONDS,
      Number(selected.end || 0) - Number(selected.start || 0)
    );
    const nextStart = clampNumber(Number(anchor?.start || 0), 0, Math.max(0, timelineDuration - TIMELINE_MIN_CLIP_SECONDS));
    const nextEnd = clampNumber(nextStart + selectedLength, nextStart + TIMELINE_MIN_CLIP_SECONDS, timelineDuration);
    updateTimelineClip(selected.id, {
      start: Number(nextStart.toFixed(4)),
      end: Number(nextEnd.toFixed(4))
    });
    seekVideoToTimelineSeconds(nextStart);
    setMsg("Clip synchronized to nearest matching track.");
    return true;
  };

  const nestSelectedTimelineClip = () => {
    if (!selectedTimelineClip) {
      setMsg("Select a clip first.");
      return false;
    }
    const nested = cloneSerializable(selectedTimelineClip);
    if (!nested || typeof nested !== "object") {
      setMsg("Could not create nested clip.");
      return false;
    }
    const safeLabel = String(nested.label || nested.type || "Clip").trim() || "Clip";
    nested.id = makeTimelineClipId(String(nested.type || "clip"));
    nested.label = `Nest: ${safeLabel}`.slice(0, 120);
    setTimelineClips([nested]);
    setTimelineSelectedClipId(nested.id);
    setTimelineUpperMode(nested.type === "audio" ? "audio" : nested.type === "video" ? "video" : "text");
    setActiveVideoBottomPage("timeline");
    setMsg("Nested subsequence created from selected clip.");
    return true;
  };

  const addEditAcrossAllTracks = () => {
    const splitAt = clampNumber(Number(timelinePlayhead || 0), 0, timelineDuration);
    let splitCount = 0;
    const next = [];
    timelineClips.forEach((clip) => {
      const start = Number(clip.start || 0);
      const end = Number(clip.end || 0);
      if (splitAt <= start + TIMELINE_MIN_CLIP_SECONDS || splitAt >= end - TIMELINE_MIN_CLIP_SECONDS) {
        next.push(clip);
        return;
      }
      splitCount += 1;
      next.push(
        { ...clip, id: makeTimelineClipId(clip.type), end: Number(splitAt.toFixed(4)) },
        { ...clip, id: makeTimelineClipId(clip.type), start: Number(splitAt.toFixed(4)) }
      );
    });
    if (!splitCount) {
      setMsg("No clips crossed the playhead.");
      return false;
    }
    setTimelineClips(next.sort((a, b) => Number(a.start || 0) - Number(b.start || 0)));
    setMsg(`Add Edit to All Tracks applied to ${splitCount} clip${splitCount === 1 ? "" : "s"}.`);
    return true;
  };

  const goToAdjacentMarker = (direction = 1) => {
    if (!timelineMarkers.length) {
      setMsg("No markers found.");
      return false;
    }
    const sorted = [...timelineMarkers].sort((a, b) => Number(a || 0) - Number(b || 0));
    const now = Number(timelinePlayhead || 0);
    const threshold = direction >= 0 ? now + 0.01 : now - 0.01;
    let target = null;
    if (direction >= 0) {
      target = sorted.find((value) => Number(value || 0) > threshold);
      if (target == null) target = sorted[0];
    } else {
      target = [...sorted].reverse().find((value) => Number(value || 0) < threshold);
      if (target == null) target = sorted[sorted.length - 1];
    }
    seekVideoToTimelineSeconds(Number(target || 0));
    return true;
  };

  const clearNearestMarkerToPlayhead = () => {
    if (!timelineMarkers.length) {
      setMsg("No marker available at playhead.");
      return false;
    }
    const now = Number(timelinePlayhead || 0);
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    timelineMarkers.forEach((value) => {
      const distance = Math.abs(Number(value || 0) - now);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = Number(value || 0);
      }
    });
    if (nearest == null || nearestDistance > 0.35) {
      setMsg("Move playhead near a marker to clear it.");
      return false;
    }
    removeTimelineMarker(nearest);
    setMsg("Nearest marker cleared.");
    return true;
  };

  const focusAdjacentOverlayLayer = (direction = 1) => {
    const layers = timelineClips.filter((clip) => isOverlayTimelineClip(clip));
    if (!layers.length) {
      setMsg("No active overlay layers found.");
      return false;
    }
    const currentIdx = layers.findIndex((clip) => clip.id === timelineSelectedClipId);
    let target = null;
    if (currentIdx < 0) {
      target = direction >= 0 ? layers[0] : layers[layers.length - 1];
    } else {
      const nextIdx = clampNumber(currentIdx + (direction >= 0 ? 1 : -1), 0, layers.length - 1);
      target = layers[nextIdx];
    }
    if (!target) return false;
    focusTimelineClipForEditing(target, "timeline");
    return true;
  };

  const runTimelineUndo = () => {
    const history = timelineHistoryRef.current;
    if (!history.undo.length) {
      setMsg("Nothing to undo.");
      return false;
    }
    const current = buildTimelineEditorSnapshot(false);
    const previous = history.undo.pop();
    history.redo.push(cloneSerializable(current));
    if (history.redo.length > 120) history.redo.shift();
    timelineHistoryCaptureBlockedRef.current = true;
    applyTimelineEditorSnapshot(previous, { includePlayhead: false });
    setMsg("Undo applied.");
    return true;
  };

  const runTimelineRedo = () => {
    const history = timelineHistoryRef.current;
    if (!history.redo.length) {
      setMsg("Nothing to redo.");
      return false;
    }
    const current = buildTimelineEditorSnapshot(false);
    const next = history.redo.pop();
    history.undo.push(cloneSerializable(current));
    if (history.undo.length > 120) history.undo.shift();
    timelineHistoryCaptureBlockedRef.current = true;
    applyTimelineEditorSnapshot(next, { includePlayhead: false });
    setMsg("Redo applied.");
    return true;
  };

  const executePremiereMenuAction = (action) => {
    if (!action) return;
    switch (action) {
      case "track-text.add-layer": {
        const baseText = String(videoEdits.overlayText || "").trim() || `Title ${timelineModeCounts.text + 1}`;
        const start = clampNumber(timelinePlayhead, 0, Math.max(0, timelineDuration - TIMELINE_MIN_CLIP_SECONDS));
        const end = clampNumber(start + 3.5, start + TIMELINE_MIN_CLIP_SECONDS, timelineDuration);
        const next = {
          id: makeTimelineClipId("text"),
          type: "text",
          trackId: timelineTrackForType("text"),
          start,
          end,
          label: baseText.length > 22 ? `${baseText.slice(0, 22)}...` : baseText,
          payload: {
            text: baseText,
            textSize: Number(videoEdits.textSize || 34),
            textPosition: videoEdits.textPosition || "bottom-center",
            overlayOpacity: Number(videoEdits.overlayOpacity || 70),
            overlayMode: videoEdits.overlayMode || "screen"
          }
        };
        setTimelineClips((prev) => [...prev, next]);
        setTimelineSelectedClipId(next.id);
        setTimelineUpperMode("text");
        setActiveVideoTool("titles-pro");
        setActiveVideoBottomPage("timeline");
        if (!String(videoEdits.overlayText || "").trim()) {
          setVideoEdits((prev) => ({ ...prev, overlayText: baseText }));
        }
        setMsg("Text layer added.");
        return;
      }
      case "track-text.add-sticker":
        if (String(videoEdits.sticker || "none").trim() === "none") {
          setMsg("Select a sticker first, then add it from this menu.");
          return;
        }
        addTimelineStickerClip();
        setTimelineUpperMode("text");
        setActiveVideoTool("stickers");
        setActiveVideoBottomPage("timeline");
        setMsg("Sticker layer added.");
        return;
      case "track-text.focus":
        setTimelineUpperMode("text");
        setActiveVideoTool("titles-pro");
        setActiveVideoBottomPage("timeline");
        setMsg("Text track focused.");
        return;
      case "track-text.select-next":
        focusAdjacentOverlayLayer(1);
        return;
      case "track-text.select-prev":
        focusAdjacentOverlayLayer(-1);
        return;
      case "track-text.toggle-captions":
        setTimelineCaptionsOn((prev) => !prev);
        setTimelineUpperMode("text");
        setActiveVideoTool("captions");
        setActiveVideoBottomPage("timeline");
        return;
      case "track-video.focus":
        setTimelineUpperMode("video");
        setActiveVideoTool("edit");
        setActiveVideoBottomPage("timeline");
        setMsg("Video track focused.");
        return;
      case "track-video.new-sequence": {
        const duration = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
        if (duration <= 0.05) {
          setMsg("Import a video first to create a sequence.");
          return;
        }
        const baseClip = {
          id: makeTimelineClipId("video"),
          type: "video",
          trackId: "video-1",
          start: 0,
          end: duration,
          label: file?.name || "Main video"
        };
        setTimelineClips([baseClip]);
        setTimelineSelectedClipId(baseClip.id);
        setTimelinePlayhead(0);
        setTimelineMarkers([]);
        setTimelineUpperMode("video");
        setActiveVideoBottomPage("timeline");
        setMsg("Video sequence created.");
        return;
      }
      case "track-video.split":
        if (!selectedTimelineClip || selectedTimelineClip.type !== "video") {
          setMsg("Select a video clip first.");
          return;
        }
        splitSelectedTimelineClip();
        setMsg("Video clip split at playhead.");
        return;
      case "track-video.transition":
        setVideoEdits((prev) => ({ ...prev, transitionType: "fade", transitionDuration: 0.4 }));
        setMsg("Default video transition applied.");
        return;
      case "track-video.toggle-link":
        setTimelineLinkedClips((prev) => !prev);
        return;
      case "track-video.zoom-fit":
        setTimelineZoom(1);
        setMsg("Timeline zoom reset to 100%.");
        return;
      case "track-audio.focus":
      case "track-audio.open-mixer":
        setTimelineUpperMode("audio");
        setActiveVideoTool("audio-pro");
        setActiveVideoBottomPage("timeline");
        setMsg("Audio controls opened.");
        return;
      case "track-audio.toggle-mute":
        setVideoEdits((prev) => ({ ...prev, muted: !prev.muted }));
        return;
      case "track-audio.auto-sync":
        setVideoEdits((prev) => ({ ...prev, autoSyncAudio: !prev.autoSyncAudio }));
        return;
      case "track-audio.add-marker":
        addTimelineMarker();
        setMsg("Audio marker added.");
        return;
      case "track-audio.normalize":
        setTimelineUpperMode("audio");
        setActiveVideoTool("audio-pro");
        setVideoEdits((prev) => ({ ...prev, loudnessTarget: -14 }));
        setMsg("Audio loudness target set to -14 LUFS.");
        return;
      case "file.new-project":
        resetUploadForm();
        setMsg("New project created.");
        return;
      case "file.new-sequence": {
        const duration = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
        if (duration <= 0.05) {
          setMsg("Import a video first to create a sequence.");
          return;
        }
        const baseClip = {
          id: makeTimelineClipId("video"),
          type: "video",
          trackId: "video-1",
          start: 0,
          end: duration,
          label: file?.name || "Main video"
        };
        setTimelineClips([baseClip]);
        setTimelineSelectedClipId(baseClip.id);
        setTimelinePlayhead(0);
        setTimelineMarkers([]);
        setTimelineUpperMode("video");
        setActiveVideoBottomPage("timeline");
        setMsg("New sequence created from current media.");
        return;
      }
      case "file.open-project":
        projectPickerInputRef.current?.click();
        setMsg("Choose a saved project JSON file.");
        return;
      case "file.close-project":
        resetUploadForm();
        setMsg("Project closed.");
        return;
      case "file.save":
        savePremiereProjectDraft();
        return;
      case "file.save-as":
        downloadPremiereProjectPayload(buildPremiereProjectPayload(), "save-as");
        setMsg("Project exported as JSON.");
        return;
      case "file.save-copy":
        downloadPremiereProjectPayload(buildPremiereProjectPayload(), "copy");
        setMsg("Project copy exported.");
        return;
      case "file.import":
      case "file.import-browser":
        mediaPickerInputRef.current?.click();
        setMsg("Select media to import.");
        return;
      case "file.export-media":
        triggerTimelineRender();
        return;
      case "file.export-shotcut-mlt": {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const mltText = buildShotcutMltProjectText();
        downloadTextArtifact(mltText, `socialsea-shotcut-${stamp}.mlt`, "application/xml;charset=utf-8");
        setMsg("Shotcut project exported as .mlt (open in Shotcut and relink media if prompted).");
        return;
      }
      case "file.send-media-encoder":
        triggerTimelineRender();
        setTimeout(() => {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const mltText = buildShotcutMltProjectText();
          downloadTextArtifact(mltText, `socialsea-media-encoder-${stamp}.mlt`, "application/xml;charset=utf-8");
          setMsg("Render started and Shotcut .mlt exported for external encoding.");
        }, 0);
        return;
      case "file.media-properties":
        setMsg(
          `${file?.name || "No media"} | ${videoMeta.width || 0}x${videoMeta.height || 0} | ${Number(
            videoMeta.duration || 0
          ).toFixed(2)}s`
        );
        return;
      case "file.exit":
        setMsg("Use browser/tab close to quit this web editor.");
        return;
      case "edit.undo":
        runTimelineUndo();
        return;
      case "edit.redo":
        runTimelineRedo();
        return;
      case "edit.cut":
        if (copySelectedTimelineClip()) liftSelectedTimelineClip();
        return;
      case "edit.copy":
        copySelectedTimelineClip();
        return;
      case "edit.paste":
        pasteTimelineClipFromClipboard();
        return;
      case "edit.paste-attributes": {
        if (!selectedTimelineClip || !timelineClipboardRef.current) {
          setMsg("Copy a clip and select a destination clip first.");
          return;
        }
        const copied = timelineClipboardRef.current;
        const selectedId = selectedTimelineClip.id;
        setTimelineClips((prev) =>
          prev.map((clip) =>
            clip.id === selectedId
              ? {
                  ...clip,
                  payload: cloneSerializable(copied.payload || clip.payload || {}),
                  disabled: copied.disabled === true
                }
              : clip
          )
        );
        setMsg("Clip attributes pasted.");
        return;
      }
      case "edit.clear":
        liftSelectedTimelineClip();
        return;
      case "edit.ripple-delete":
        extractSelectedTimelineClip();
        return;
      case "edit.duplicate":
        duplicateSelectedTimelineClip();
        return;
      case "edit.select-all":
        setSourceMonitorOpenClipIds(sourceMonitorVideoClips.map((clip) => clip.id));
        setMsg("All video clips selected in Source Monitor list.");
        return;
      case "edit.deselect-all":
        setTimelineSelectedClipId("");
        setMsg("Selection cleared.");
        return;
      case "edit.find":
        setActiveVideoBottomPage("timeline");
        setMsg("Use the clip drawer to find clips by type and time.");
        return;
      case "edit.edit-original":
        mediaPickerInputRef.current?.click();
        setMsg("Pick replacement media to edit original.");
        return;
      case "edit.keyboard-shortcuts":
        setMsg("Shortcuts: space play/pause, click timeline to seek, drag clip handles to trim.");
        return;
      case "edit.preferences":
        setTimelineSettingsOpen(true);
        setMsg("Preferences opened in Timeline Settings.");
        return;
      case "clip.make-subclip":
        splitSelectedTimelineClip();
        setMsg("Subclip created at playhead.");
        return;
      case "clip.audio-channels":
      case "clip.audio-gain":
        setTimelineUpperMode("audio");
        setActiveVideoTool("audio-pro");
        setMsg("Audio controls opened.");
        return;
      case "clip.speed-duration":
        setActiveVideoTool("edit");
        setMsg("Use Playback Speed under Edit controls for speed/duration.");
        return;
      case "clip.insert":
      case "clip.overwrite":
        insertOrOverwriteAtPlayhead();
        return;
      case "clip.enable":
        toggleSelectedClipEnabled();
        return;
      case "clip.link":
        setTimelineLinkedClips(true);
        setMsg("Clip linking enabled.");
        return;
      case "clip.unlink":
        setTimelineLinkedClips(false);
        setMsg("Clip linking disabled.");
        return;
      case "clip.group":
        groupSelectedTimelineClip();
        return;
      case "clip.ungroup":
        ungroupSelectedTimelineClip();
        return;
      case "clip.synchronize":
        synchronizeSelectedTimelineClip();
        return;
      case "clip.nest":
        nestSelectedTimelineClip();
        return;
      case "clip.modify":
        if (!selectedTimelineClip) {
          setMsg("Select a clip first.");
          return;
        }
        setTimelineInspectorOpen(true);
        setActiveVideoBottomPage("timeline");
        setMsg("Clip inspector opened.");
        return;
      case "sequence.settings":
        setTimelineSettingsOpen((prev) => !prev);
        return;
      case "sequence.render-effects":
      case "sequence.render":
        triggerTimelineRender();
        return;
      case "sequence.match-frame":
        focusAdjacentTimelineClip(1);
        return;
      case "sequence.reverse-match-frame":
        focusAdjacentTimelineClip(-1);
        return;
      case "sequence.add-edit":
        splitSelectedTimelineClip();
        return;
      case "sequence.add-edit-all":
        addEditAcrossAllTracks();
        return;
      case "sequence.trim-edit":
        setTimelineEditTool("trim");
        setMsg("Trim tool enabled.");
        return;
      case "sequence.apply-video-transition":
        setVideoEdits((prev) => ({ ...prev, transitionType: "fade", transitionDuration: 0.4 }));
        setMsg("Video transition applied: Fade (0.4s).");
        return;
      case "sequence.apply-audio-transition":
        setActiveVideoTool("audio-pro");
        setVideoEdits((prev) => ({ ...prev, autoSyncAudio: true }));
        setMsg("Audio transition setup opened.");
        return;
      case "sequence.lift":
        liftSelectedTimelineClip();
        return;
      case "sequence.extract":
        extractSelectedTimelineClip();
        return;
      case "sequence.zoom-in":
        setTimelineZoom((prev) => clampNumber(Number(prev || 1) + 0.1, 0.5, 3));
        return;
      case "sequence.zoom-out":
        setTimelineZoom((prev) => clampNumber(Number(prev || 1) - 0.1, 0.5, 3));
        return;
      case "sequence.snap":
        setTimelineSnapEnabled((prev) => !prev);
        return;
      case "sequence.make-subsequence":
        if (!selectedTimelineClip) {
          setMsg("Select a clip first to create subsequence.");
          return;
        }
        setTimelineClips([cloneSerializable(selectedTimelineClip)]);
        setTimelineSelectedClipId(selectedTimelineClip.id);
        setMsg("Subsequence created from selected clip.");
        return;
      case "sequence.add-caption-track":
        setTimelineCaptionsOn(true);
        setActiveVideoTool("captions");
        setTimelineUpperMode("text");
        setMsg("Caption track enabled.");
        return;
      case "markers.mark-in":
        markMonitorInAtPlayhead();
        setMsg("Mark In set at playhead.");
        return;
      case "markers.mark-out":
        markMonitorOutAtPlayhead();
        setMsg("Mark Out set at playhead.");
        return;
      case "markers.mark-clip":
        addTimelineMarker();
        setMsg("Clip marker added.");
        return;
      case "markers.mark-selection":
        if (!selectedTimelineClip) {
          setMsg("Select a clip first.");
          return;
        }
        setTimelineMarkers((prev) => {
          const merged = new Set(prev.map((v) => Number(v.toFixed(2))));
          merged.add(Number(Number(selectedTimelineClip.start || 0).toFixed(2)));
          merged.add(Number(Number(selectedTimelineClip.end || 0).toFixed(2)));
          return [...merged].sort((a, b) => a - b);
        });
        setMsg("Selection markers added.");
        return;
      case "markers.go-in":
        goToMonitorInPoint();
        return;
      case "markers.go-out":
        goToMonitorOutPoint();
        return;
      case "markers.clear-in":
        setVideoEdits((prev) => ({ ...prev, trimStart: 0 }));
        setMsg("Mark In cleared.");
        return;
      case "markers.clear-out":
        setVideoEdits((prev) => ({ ...prev, trimEnd: 0 }));
        setMsg("Mark Out cleared.");
        return;
      case "markers.clear-in-out":
        setVideoEdits((prev) => ({ ...prev, trimStart: 0, trimEnd: 0 }));
        setMsg("In and Out cleared.");
        return;
      case "markers.add-marker":
        addTimelineMarker();
        return;
      case "markers.go-next":
        goToAdjacentMarker(1);
        return;
      case "markers.go-prev":
        goToAdjacentMarker(-1);
        return;
      case "markers.clear-selected":
        clearNearestMarkerToPlayhead();
        return;
      case "markers.clear-all":
        setTimelineMarkers([]);
        setMsg("All markers cleared.");
        return;
      case "graphics.new-layer":
      case "graphics.text": {
        const next = addTimelineTextClip({ allowFallbackText: true });
        setActiveVideoTool("titles-pro");
        setTimelineUpperMode("text");
        setActiveVideoBottomPage("timeline");
        setMsg(next ? "Text layer added." : "Could not add a text layer.");
        return;
      }
      case "graphics.rectangle": {
        const next = addTimelineShapeClip("rectangle");
        setActiveVideoTool("overlay");
        setTimelineUpperMode("text");
        setActiveVideoBottomPage("timeline");
        setMsg(next ? "Rectangle layer added." : "Could not add rectangle layer.");
        return;
      }
      case "graphics.ellipse": {
        const next = addTimelineShapeClip("ellipse");
        setActiveVideoTool("overlay");
        setTimelineUpperMode("text");
        setActiveVideoBottomPage("timeline");
        setMsg(next ? "Ellipse layer added." : "Could not add ellipse layer.");
        return;
      }
      case "graphics.arrange": {
        const layerId = resolveSelectedOverlayLayerId();
        setActiveVideoTool("titles-pro");
        setTimelineUpperMode("text");
        setTimelineInspectorOpen(true);
        setActiveVideoBottomPage("timeline");
        setMsg(
          layerId
            ? "Arrange mode ready. Use Bring/Send commands to change layer order."
            : "Add a text, sticker, or shape layer first."
        );
        return;
      }
      case "graphics.bring-front": {
        const layerId = resolveSelectedOverlayLayerId();
        if (!layerId) {
          setMsg("Select a text, sticker, or shape layer first.");
          return;
        }
        const moved = moveOverlayLayerById(layerId, "front");
        setMsg(moved.ok ? "Layer moved to front." : moved.reason === "edge" ? "Layer is already at the front." : "Could not move layer.");
        return;
      }
      case "graphics.bring-forward": {
        const layerId = resolveSelectedOverlayLayerId();
        if (!layerId) {
          setMsg("Select a text, sticker, or shape layer first.");
          return;
        }
        const moved = moveOverlayLayerById(layerId, "forward");
        setMsg(moved.ok ? "Layer moved forward." : moved.reason === "edge" ? "Layer is already in front." : "Could not move layer.");
        return;
      }
      case "graphics.send-backward": {
        const layerId = resolveSelectedOverlayLayerId();
        if (!layerId) {
          setMsg("Select a text, sticker, or shape layer first.");
          return;
        }
        const moved = moveOverlayLayerById(layerId, "backward");
        setMsg(moved.ok ? "Layer sent backward." : moved.reason === "edge" ? "Layer is already at the back." : "Could not move layer.");
        return;
      }
      case "graphics.send-back": {
        const layerId = resolveSelectedOverlayLayerId();
        if (!layerId) {
          setMsg("Select a text, sticker, or shape layer first.");
          return;
        }
        const moved = moveOverlayLayerById(layerId, "back");
        setMsg(moved.ok ? "Layer sent to back." : moved.reason === "edge" ? "Layer is already at the back." : "Could not move layer.");
        return;
      }
      case "graphics.select-next":
        focusAdjacentOverlayLayer(1);
        return;
      case "graphics.select-prev":
        focusAdjacentOverlayLayer(-1);
        return;
      case "graphics.export-mogrt":
        downloadPremiereProjectPayload(buildPremiereProjectPayload(), "mogrt-template");
        setMsg("Motion graphics template exported as project JSON.");
        return;
      case "view.show-rulers":
        setTimelineRulersVisible((prev) => !prev);
        return;
      case "view.show-guides":
        setTimelineGuidesVisible((prev) => !prev);
        return;
      case "view.add-guide": {
        if (timelineGuidesLocked) {
          setMsg("Guides are locked.");
          return;
        }
        const guideAt = Number(clampNumber(timelinePlayhead, 0, timelineDuration).toFixed(2));
        setTimelineGuides((prev) => {
          if (prev.some((value) => Math.abs(Number(value || 0) - guideAt) <= 0.05)) return prev;
          return [...prev, guideAt].sort((a, b) => a - b);
        });
        setTimelineGuidesVisible(true);
        setMsg(`Guide added at ${formatTimelineDisplayTime(guideAt)}.`);
        return;
      }
      case "view.lock-guides":
        setTimelineGuidesLocked((prev) => !prev);
        return;
      case "view.clear-guides":
        if (timelineGuidesLocked) {
          setMsg("Unlock guides first.");
          return;
        }
        setTimelineGuides([]);
        setMsg("Guides cleared.");
        return;
      case "view.snap-monitor":
        setTimelineSnapEnabled((prev) => !prev);
        setMsg("Program monitor snapping toggled.");
        return;
      case "view.safe-margins":
        setMonitorSafeMarginsVisible((prev) => !prev);
        return;
      case "view.display-mode":
        setPreviewOriginal((prev) => !prev);
        setMsg("Display mode toggled.");
        return;
      case "view.zoom":
        setTimelineZoom((prev) => (Number(prev || 1) >= 2.2 ? 1 : clampNumber(Number(prev || 1) + 0.2, 0.5, 3)));
        return;
      case "view.timecode-options":
        setTimelineTimecodeDisplay((prev) => (prev === "timecode" ? "seconds" : "timecode"));
        return;
      case "window.workspaces":
        setActiveVideoBottomPage("timeline");
        setMsg("Workspace menu opened in timeline mode.");
        return;
      case "window.all-panels":
        setSourceMonitorPanelVisible(true);
        setTimelineInspectorOpen(true);
        setTimelineSettingsOpen(true);
        setMsg("All panels shown.");
        return;
      case "window.assembly":
      case "window.editing":
        setActiveVideoBottomPage("timeline");
        setActiveVideoTool("edit");
        setTimelineUpperMode("video");
        return;
      case "window.audio":
      case "window.audio-clip-mixer":
      case "window.audio-track-mixer":
        setActiveVideoBottomPage("timeline");
        setActiveVideoTool("audio-pro");
        setTimelineUpperMode("audio");
        return;
      case "window.captions-graphics":
        setActiveVideoBottomPage("timeline");
        setActiveVideoTool("captions");
        setTimelineUpperMode("text");
        return;
      case "window.color":
        setActiveVideoBottomPage("timeline");
        setActiveVideoTool("grading-pro");
        return;
      case "window.effects-workspace":
      case "window.effects-panel":
        setActiveVideoBottomPage("timeline");
        setActiveVideoTool("fx-pro");
        return;
      case "window.essential":
        setActiveVideoBottomPage("details");
        return;
      case "window.learning":
        setActiveVideoBottomPage("details");
        setActiveVideoTool("pro-apps");
        setMsg("Learning tips are shown in Details and Help menu.");
        return;
      case "window.reset-layout":
        setSourceMonitorPanelVisible(true);
        setSourceMonitorUndocked(false);
        setTimelineInspectorOpen(true);
        setTimelineSettingsOpen(true);
        setTimelineClipDrawerOpen(true);
        setTimelineRulersVisible(true);
        setTimelineGuidesVisible(false);
        setMsg("Layout reset.");
        return;
      case "window.effect-controls":
        setTimelineInspectorOpen((prev) => !prev);
        return;
      case "window.media-browser":
        mediaPickerInputRef.current?.click();
        setMsg("Media browser opened.");
        return;
      case "window.program-monitor":
      case "window.source-monitor":
        setSourceMonitorPanelVisible((prev) => !prev);
        return;
      case "window.projects":
        setTimelineClipDrawerOpen((prev) => !prev);
        return;
      case "window.timeline":
        setActiveVideoBottomPage("timeline");
        return;
      case "help.premiere-help":
        setMsg("Help: use File for project work, Sequence for timeline edits, and Window for panel layout.");
        return;
      case "help.learn":
        setMsg("Tutorial tip: start with Edit -> split clips, then Sequence -> transitions, then Audio.");
        return;
      case "help.whats-new":
        setMsg("What's New: Premiere-style menu bar and command routing are now enabled.");
        return;
      case "help.compat-report":
        setMsg(`Compatibility: ${navigator?.platform || "web"} | ${navigator?.userAgent || "browser"}`);
        return;
      case "help.account":
        setMsg("Account/sign-in is managed by SocialSea app settings.");
        return;
      case "help.updates":
        setMsg("Updates are delivered with new SocialSea deployments.");
        return;
      case "help.about":
        setMsg("About: SocialSea Timeline Studio (Premiere-style workflow).");
        return;
      default:
        setMsg("Menu action is not mapped yet.");
    }
  };

  const onProjectPickerChange = async (event) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    try {
      const text = await picked.text();
      const parsed = JSON.parse(text);
      applyPremiereProjectPayload(parsed, picked.name || "Project file");
    } catch {
      setMsg("Invalid project file. Use a JSON project exported from this editor.");
    }
  };

  const beginTimelineClipPointerAction = (event, clipId, mode = "move") => {
    event.preventDefault();
    event.stopPropagation();
    const clip = timelineClips.find((item) => item.id === clipId);
    if (!clip) return;
    if (timelineEditTool === "blade") {
      splitTimelineClipAtSeconds(clip, getTimelineSecondsFromClientX(event.clientX), { fallbackToMidpoint: true });
      return;
    }
    const resolvedMode =
      mode === "move" && (timelineEditTool === "trim" || timelineEditTool === "ripple")
        ? "resize-end"
        : mode;
    setTimelineSelectedClipId(clipId);
    const snapStep = timelineSnapEnabled ? 0.1 : 0;
    const rawDragStartSeconds = getTimelineSecondsFromClientX(event.clientX);
    const dragStartSeconds = snapStep > 0
      ? clampNumber(Math.round(rawDragStartSeconds / snapStep) * snapStep, 0, timelineDuration)
      : rawDragStartSeconds;
    const initial = {
      ...clip,
      start: Number(clip.start || 0),
      end: Number(clip.end || 0)
    };
    const clipLength = Math.max(TIMELINE_MIN_CLIP_SECONDS, initial.end - initial.start);

    const onMove = (moveEvent) => {
      const rawCurrentSeconds = getTimelineSecondsFromClientX(moveEvent.clientX);
      const currentSeconds =
        snapStep > 0
          ? clampNumber(Math.round(rawCurrentSeconds / snapStep) * snapStep, 0, timelineDuration)
          : rawCurrentSeconds;
      const delta = currentSeconds - dragStartSeconds;
      setTimelineClips((prev) => {
        let rippleDelta = 0;
        const updated = prev.map((item) => {
          if (item.id !== clipId) return item;
          let next = { ...item };
          if (resolvedMode === "resize-start") {
            next.start = clampNumber(
              initial.start + delta,
              0,
              Math.max(0, Number(next.end || initial.end) - TIMELINE_MIN_CLIP_SECONDS)
            );
          } else if (resolvedMode === "resize-end") {
            next.end = clampNumber(
              initial.end + delta,
              Math.min(timelineDuration, Number(next.start || initial.start) + TIMELINE_MIN_CLIP_SECONDS),
              timelineDuration
            );
            rippleDelta = next.end - initial.end;
          } else {
            const movedStart = clampNumber(initial.start + delta, 0, Math.max(0, timelineDuration - clipLength));
            next.start = movedStart;
            next.end = movedStart + clipLength;
            const hoveredTrackId = Object.entries(timelineTrackRefs.current).find(([, node]) => {
              if (!node) return false;
              const rect = node.getBoundingClientRect();
              return moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom;
            })?.[0];
            if (hoveredTrackId && clipAllowedOnTrack(next, hoveredTrackId)) {
              next.trackId = hoveredTrackId;
            }
          }
          return next;
        });

        if (timelineEditTool !== "ripple" || resolvedMode !== "resize-end" || Math.abs(rippleDelta) < 0.001) {
          return updated;
        }

        return updated.map((item) => {
          if (item.id === clipId) return item;
          if (item.trackId !== initial.trackId) return item;
          const itemStart = Number(item.start || 0);
          const itemEnd = Number(item.end || 0);
          if (itemStart < initial.end - 0.0001) return item;
          return {
            ...item,
            start: clampNumber(itemStart + rippleDelta, 0, timelineDuration),
            end: clampNumber(itemEnd + rippleDelta, TIMELINE_MIN_CLIP_SECONDS, timelineDuration)
          };
        });
      });
      seekVideoToTimelineSeconds(currentSeconds);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

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
    clearTimelineHistory();
    timelineClipboardRef.current = null;
    setFile(null);
    setSelectedFiles([]);
    setActiveFileIndex(0);
    setCaption("");
    setVideoTitle("");
    setEdits(defaultEdits);
    setActiveImageTool("looks");
    setPreviewOriginal(false);
    setVideoMeta({ duration: 0, width: 0, height: 0 });
    setActiveVideoTool("edit");
    setActiveVideoBottomPage("timeline");
    setActiveVideoLookControl(VIDEO_LOOK_CONTROL_SPECS[0].key);
    setCoverFrames([]);
    setCustomCoverFile(null);
    setCustomCoverPreviewUrl("");
    setExtraClips([]);
    setBlurTrackBusy(false);
    setBlurTrackStatus("");
    setVideoEdits(defaultVideoEdits);
    setTimelineZoom(1);
    setTimelinePlayhead(0);
    setTimelineClips([]);
    setTimelineSelectedClipId("");
    setTimelineEditTool("select");
    setTimelineSnapEnabled(true);
    setTimelineLinkedClips(true);
    setSourceMonitorPanelVisible(true);
    setSourceMonitorUndocked(false);
    setTimelineInspectorOpen(true);
    setTimelineSettingsOpen(true);
    setTimelineVoiceInputOn(false);
    setTimelineCaptionsOn(false);
    setTimelineRulersVisible(true);
    setTimelineGuidesVisible(false);
    setTimelineGuidesLocked(false);
    setTimelineGuides([]);
    setMonitorSafeMarginsVisible(false);
    setTimelineTimecodeDisplay("timecode");
    setTimelineMarkers([]);
    setSourceMonitorMenuOpen(false);
    setSourceMonitorOpenClipIds([]);
    setActivePremiereMenuKey("");
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
    setShowPublishSettings(true);
    setShowPublicSettings(true);
  };

  const applyPickedFiles = (fileList) => {
    clearTimelineHistory();
    timelineClipboardRef.current = null;
    const nextFiles = Array.from(fileList || []);
    setSelectedFiles(nextFiles);
    setActiveFileIndex(0);
    setFile(nextFiles[0] || null);
    setMsg("");
    setEdits(defaultEdits);
    setActiveImageTool("looks");
    setPreviewOriginal(false);
    setActiveVideoTool("edit");
    setActiveVideoBottomPage("timeline");
    setActiveVideoLookControl(VIDEO_LOOK_CONTROL_SPECS[0].key);
    setCoverFrames([]);
    setCustomCoverFile(null);
    setCustomCoverPreviewUrl("");
    setExtraClips([]);
    setBlurTrackBusy(false);
    setBlurTrackStatus("");
    setVideoMeta({ duration: 0, width: 0, height: 0 });
    setVideoEdits(defaultVideoEdits);
    setTimelineZoom(1);
    setTimelinePlayhead(0);
    setTimelineClips([]);
    setTimelineSelectedClipId("");
    setTimelineEditTool("select");
    setTimelineSnapEnabled(true);
    setTimelineLinkedClips(true);
    setSourceMonitorPanelVisible(true);
    setSourceMonitorUndocked(false);
    setTimelineInspectorOpen(true);
    setTimelineSettingsOpen(true);
    setTimelineVoiceInputOn(false);
    setTimelineCaptionsOn(false);
    setTimelineRulersVisible(true);
    setTimelineGuidesVisible(false);
    setTimelineGuidesLocked(false);
    setTimelineGuides([]);
    setMonitorSafeMarginsVisible(false);
    setTimelineTimecodeDisplay("timecode");
    setTimelineMarkers([]);
    setSourceMonitorMenuOpen(false);
    setSourceMonitorOpenClipIds([]);
    setActivePremiereMenuKey("");
  };

  const applyVideoWorkflow = (workflowKey) => {
    const workflow = READY_MADE_WORKFLOW_OPTIONS.find((item) => item.key === workflowKey);
    if (!workflow) return;
    setVideoEdits((prev) => ({ ...prev, ...workflow.edits }));
    if (workflow.focusTool) setActiveVideoTool(workflow.focusTool);
    if (workflow.focusLookControl) setActiveVideoLookControl(workflow.focusLookControl);
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
        setMsg(isReelUpload ? "Please choose a single video for a clip." : "Please choose a single video for a long video post.");
        return;
      }
      if (!filesToUpload[0]?.type?.startsWith("video/")) {
        setMsg(isReelUpload ? "Clips must be a video file." : "Long video uploads must be a video file.");
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
      let videoEditsNotAppliedCount = 0;
      const failedMessages = [];
      for (let i = 0; i < filesToUpload.length; i += 1) {
        const currentFile = filesToUpload[i];
        const currentIsImage = !!currentFile?.type?.startsWith("image/");
        const currentIsVideo = !!currentFile?.type?.startsWith("video/");
        const fileSizeLimit = currentIsVideo ? MAX_VIDEO_UPLOAD_FILE_SIZE_BYTES : MAX_IMAGE_UPLOAD_FILE_SIZE_BYTES;
        if (Number(currentFile?.size || 0) > fileSizeLimit) {
          const limitLabel = currentIsVideo ? "1GB" : "80MB";
          failedCount += 1;
          failedMessages.push(`${currentFile?.name || "file"} is too large (max ${limitLabel}).`);
          continue;
        }
        const shouldApplyImageEdit = filesToUpload.length === 1 && currentIsImage && file && currentFile === file;

        const form = new FormData();
        const uploadFile = shouldApplyImageEdit ? await processImage(currentFile) : currentFile;
        const safeCaption = caption?.trim();
        const safeVideoTitle = videoTitle?.trim();
        const normalizedVideoEdits = currentIsVideo ? normalizeVideoEditsForServer(videoEdits) : null;
        const normalizedTimelineClips = currentIsVideo
          ? normalizeTimelineClipsForServer(timelineClips, timelineDuration)
          : [];
        const timelineAwareVideoEdits = currentIsVideo
          ? applyTimelineToVideoEdits(normalizedVideoEdits, normalizedTimelineClips)
          : null;
        const serverVideoEdits = currentIsVideo
          ? normalizeTrimWindowForServer(timelineAwareVideoEdits, timelineDuration)
          : null;
        const changedVideoEdits = currentIsVideo
          ? JSON.stringify(serverVideoEdits || videoEdits || {}) !== JSON.stringify(defaultVideoEdits)
          : false;
        form.append("file", uploadFile);
        if (safeCaption) form.append("caption", safeCaption);
        if (currentIsVideo && safeVideoTitle) form.append("title", safeVideoTitle);
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
          const safeCoverTime = Math.max(0, Number(videoEdits.coverTime || 0));
          form.append(
            "videoSettings",
            JSON.stringify({
              title: safeVideoTitle || undefined,
              description: safeCaption || undefined,
              edits: serverVideoEdits || timelineAwareVideoEdits || normalizedVideoEdits || videoEdits,
              creatorSettings: safeCreatorSettings,
              timeline: normalizedTimelineClips.length
                ? {
                    version: 1,
                    duration: Number(Math.max(0, timelineDuration).toFixed(4)),
                    clips: normalizedTimelineClips
                  }
                : undefined,
              cover: {
                mode: customCoverFile ? "custom_image" : "video_frame",
                frameTime: safeCoverTime,
                nearestFrameTime: selectedCoverFrame ? selectedCoverFrame.time : safeCoverTime
              }
            })
          );
          if (customCoverFile) {
            form.append("coverImage", customCoverFile);
          }
        }

        try {
          let res = null;
          try {
            res = await api.post("/api/posts/upload", form);
          } catch (firstErr) {
            const status = Number(firstErr?.response?.status || 0);
            if (status === 400 && currentIsVideo) {
              // Some deployed backends reject optional multipart fields (videoSettings/coverImage).
              // Retry with minimal payload so uploads still work.
              const minimalForm = new FormData();
              minimalForm.append("file", uploadFile);
              if (caption?.trim()) minimalForm.append("caption", caption.trim());
              if (isReelUpload) {
                minimalForm.append("isReel", "true");
                minimalForm.append("reel", "true");
                minimalForm.append("type", "reel");
              } else if (isLongVideoUpload) {
                minimalForm.append("isLongVideo", "true");
                minimalForm.append("type", "long_video");
              }
              res = await api.post("/api/posts/upload", minimalForm);
            } else {
            // Some backend variants fail on extra multipart fields; retry with strict file-only payload.
              if (status >= 500) {
                if (isReelUpload || isLongVideoUpload) throw firstErr;
                const fallbackForm = new FormData();
                fallbackForm.append("file", uploadFile);
                res = await api.post("/api/posts/upload", fallbackForm);
              } else {
                throw firstErr;
              }
            }
          }
          if (!res) throw new Error("Upload failed");
          if (currentIsVideo && changedVideoEdits && res?.data?.editsApplied === false) {
            videoEditsNotAppliedCount += 1;
          }
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
      if (successCount > 0 && failedCount === 0) {
        if (videoEditsNotAppliedCount > 0) {
          setMsg(`${successCount} post(s) uploaded. Some selected video controls are preview-only and were not rendered on server.`);
        } else {
          setMsg(`${successCount} post(s) uploaded successfully`);
        }
      }
      else if (successCount > 0 && failedCount > 0) {
        const details = failedMessages[0] ? ` First error: ${failedMessages[0]}` : "";
        const warning = videoEditsNotAppliedCount > 0
          ? " Some selected video controls were preview-only."
          : "";
        setMsg(`${successCount} uploaded, ${failedCount} failed.${details}${warning}`);
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

  const uploadHeading = isReelUpload ? "Create Clip" : isLongVideoUpload ? "Create Long Video" : "Create Post";
  const uploadSubtitle = isReelUpload
    ? "Upload a short video for clips."
    : isLongVideoUpload
      ? ""
      : "Create your photo post.";
  const filePickerLabel = isReelUpload || isLongVideoUpload ? "Choose video" : "Choose photo";
  const fileAccept = isReelUpload || isLongVideoUpload ? "video/*" : "image/*";
  const allowMultipleFiles = isPhotoPostUpload;
  const isVideoWorkspace = isVideo || preferWhiteVideoWorkspace;
  const uploadPageClassName = isVideoWorkspace ? "upload-page video-upload-page" : "upload-page";
  const uploadPanelClassName = isVideoWorkspace ? "upload-panel upload-panel-pro-video" : "upload-panel";
  const activeVideoToolGroupConfig =
    VIDEO_TOOL_GROUPS.find((group) => group.key === activeVideoToolGroup) || VIDEO_TOOL_GROUPS[0];

  return (
    <div className={uploadPageClassName}>
      <section className={uploadPanelClassName}>
        <h2>{uploadHeading}</h2>
        {uploadSubtitle ? <p className="upload-subtitle">{uploadSubtitle}</p> : null}

        {!isVideoWorkspace && (
          <div className="upload-pick-row">
            <label className="upload-file-pick">
              {filePickerLabel}
              <input
                ref={mediaPickerInputRef}
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
        )}
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
                      setCustomCoverFile(null);
                      setCustomCoverPreviewUrl("");
                      setCoverFrames([]);
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

        {previewUrl && isImage && (
          <div className="upload-preview-wrap">
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
          </div>
        )}

        {isImage && (
          <div className="upload-tools media-studio image-studio">
            <div className="studio-heading">
              <div>
                <h3>Photo Studio</h3>
                <p>Give the image a warmer, softer, or more focused feel without the chunky boxes.</p>
              </div>
              <div className="studio-heading-actions studio-quick-actions">
                <button
                  type="button"
                  className="studio-soft-btn studio-soft-btn-icon"
                  aria-label="Hold to compare"
                  title="Hold to compare"
                  onMouseDown={() => setPreviewOriginal(true)}
                  onMouseUp={() => setPreviewOriginal(false)}
                  onMouseLeave={() => setPreviewOriginal(false)}
                  onTouchStart={() => setPreviewOriginal(true)}
                  onTouchEnd={() => setPreviewOriginal(false)}
                >
                  <FiEye />
                </button>
                <button
                  type="button"
                  className="studio-soft-btn studio-soft-btn-icon"
                  aria-label="Reset"
                  title="Reset"
                  onClick={resetEdits}
                >
                  <FiRotateCcw />
                </button>
              </div>
            </div>

            <div className="studio-tool-strip">
              {IMAGE_TOOL_OPTIONS.map((option) => {
                const { key, label } = option;
                const IconComponent = option.Icon;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`studio-tool-btn ${activeImageTool === key ? "active" : ""}`}
                    onClick={() => setActiveImageTool(key)}
                  >
                    <IconComponent />
                    <span>{label}</span>
                  </button>
                );
              })}
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
          <div className={`video-editor-layout ${activeVideoBottomPage === "timeline" ? "video-editor-layout-timeline" : ""}`}>
            {previewUrl && sourceMonitorPanelVisible && (
              <aside className={`video-preview-dock ${sourceMonitorUndocked ? "is-undocked" : ""}`}>
                <div className="video-preview-sticky">
                  <div className="premiere-monitor-shell">
                    <div className="premiere-monitor-top">
                      <span className="premiere-monitor-title">
                        Source: {activeSourceMonitorClip ? (String(activeSourceMonitorClip.label || "Clip").trim() || "Clip") : "No clip loaded"}
                      </span>
                      <div className="premiere-monitor-menu-shell" ref={sourceMonitorMenuRef}>
                        <button
                          type="button"
                          className={`premiere-monitor-menu-btn ${sourceMonitorMenuOpen ? "open" : ""}`}
                          onClick={() => setSourceMonitorMenuOpen((prev) => !prev)}
                          aria-label="Source monitor menu"
                          aria-haspopup="menu"
                          aria-expanded={sourceMonitorMenuOpen}
                        >
                          <span className="premiere-monitor-menu" aria-hidden="true">&#9776;</span>
                        </button>
                        {sourceMonitorMenuOpen && (
                          <div className="premiere-monitor-menu-dropdown" role="menu" aria-label="Source monitor clips">
                            <div className="premiere-monitor-menu-section-label">Open clips</div>
                            {sourceMonitorOpenClips.length > 0 ? (
                              sourceMonitorOpenClips.map((clip, index) => {
                                const clipName = String(clip.label || `Clip ${index + 1}`).trim() || `Clip ${index + 1}`;
                                const isActive = activeSourceMonitorClip?.id === clip.id;
                                return (
                                  <button
                                    key={`source-monitor-clip-${clip.id}`}
                                    type="button"
                                    className={`premiere-monitor-menu-item ${isActive ? "active" : ""}`}
                                    role="menuitem"
                                    onClick={() => openSourceMonitorClip(clip.id)}
                                  >
                                    <span className="premiere-monitor-menu-item-check" aria-hidden="true">{isActive ? "v" : ""}</span>
                                    <span className="premiere-monitor-menu-item-label">{clipName}</span>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="premiere-monitor-menu-empty">No clips loaded</div>
                            )}
                            <div className="premiere-monitor-menu-line" />
                            <button
                              type="button"
                              className="premiere-monitor-menu-item"
                              role="menuitem"
                              onClick={() => activeSourceMonitorClip && closeSourceMonitorClip(activeSourceMonitorClip.id)}
                              disabled={!activeSourceMonitorClip}
                            >
                              <span className="premiere-monitor-menu-item-check" aria-hidden="true" />
                              <span className="premiere-monitor-menu-item-label">Close</span>
                            </button>
                            <button
                              type="button"
                              className="premiere-monitor-menu-item"
                              role="menuitem"
                              onClick={closeAllSourceMonitorClips}
                              disabled={!sourceMonitorOpenClips.length}
                            >
                              <span className="premiere-monitor-menu-item-check" aria-hidden="true" />
                              <span className="premiere-monitor-menu-item-label">Close All</span>
                            </button>
                            <div className="premiere-monitor-menu-line" />
                            <button
                              type="button"
                              className="premiere-monitor-menu-item"
                              role="menuitem"
                              onClick={toggleSourceMonitorDockState}
                            >
                              <span className="premiere-monitor-menu-item-check" aria-hidden="true" />
                              <span className="premiere-monitor-menu-item-label">
                                {sourceMonitorUndocked ? "Dock Panel" : "Undock Panel"}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="premiere-monitor-menu-item"
                              role="menuitem"
                              onClick={closeSourceMonitorPanel}
                            >
                              <span className="premiere-monitor-menu-item-check" aria-hidden="true" />
                              <span className="premiere-monitor-menu-item-label">Close Panel</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="upload-preview-video-wrap video-preview-dock-frame premiere-monitor-frame">
                    <div
                      ref={previewStageRef}
                      className={`upload-preview-video-stage ${blurPreviewEditEnabled ? "blur-preview-edit-enabled" : ""} ${
                        blurPreviewEditEnabled ? `blur-preview-tool-${blurPreviewTool}` : ""
                      }`.trim()}
                      style={{
                        ...(videoMeta.width > 0 && videoMeta.height > 0
                          ? { aspectRatio: `${videoMeta.width} / ${videoMeta.height}` }
                          : {}),
                        ...(blurPreviewEditEnabled
                          ? { cursor: blurPreviewTool === "draw" ? "crosshair" : blurPreviewHoverCursor }
                          : {})
                      }}
                      onPointerDown={handleBlurPreviewPointerDown}
                      onPointerMove={handleBlurPreviewPointerMove}
                      onPointerUp={handleBlurPreviewPointerUp}
                      onPointerCancel={handleBlurPreviewPointerCancel}
                      onPointerLeave={handleBlurPreviewPointerLeave}
                    >
                      <video
                        ref={videoRef}
                        src={previewUrl}
                        className="upload-preview-video"
                        controls={false}
                        style={{
                          filter: previewOriginal ? "none" : videoFilterStyle,
                          objectFit: videoObjectFit,
                          objectPosition: videoPreviewObjectPosition,
                          transform: videoPreviewTransform,
                          transformOrigin: "center center",
                          width: "100%",
                          height: "100%"
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
                            trimEnd: duration,
                            coverTime: Math.min(duration, Math.max(0, Number(prev.coverTime || 0)))
                          }));
                          const baseClip = {
                            id: makeTimelineClipId("video"),
                            type: "video",
                            trackId: "video-1",
                            start: 0,
                            end: duration,
                            label: file?.name || "Main video"
                          };
                          setTimelineZoom(1);
                          setTimelinePlayhead(0);
                          setTimelineClips([baseClip]);
                          setTimelineSelectedClipId(baseClip.id);
                        }}
                        onTimeUpdate={(e) => {
                          const v = e.currentTarget;
                          const current = Number(v.currentTime || 0);
                          setTimelinePlayhead(current);
                          const trimStart = Number(videoEdits.trimStart || 0);
                          const trimEnd = Number(videoEdits.trimEnd || 0);
                          if (trimEnd > trimStart && v.currentTime > trimEnd) {
                            v.currentTime = trimStart;
                            v.play().catch(() => {});
                          }
                        }}
                      />
                      {monitorSafeMarginsVisible && (
                        <div className="premiere-safe-margins" aria-hidden="true">
                          <div className="premiere-safe-margins-title" />
                          <div className="premiere-safe-margins-action" />
                        </div>
                      )}
                      {!previewOriginal && videoFadeStyle && (
                        <div className="upload-preview-filter-overlay" style={videoFadeStyle} />
                      )}
                      {!previewOriginal && videoTintOverlayStyle && (
                        <div className="upload-preview-filter-overlay" style={videoTintOverlayStyle} />
                      )}
                      {!previewOriginal && videoGrainStyle && (
                        <div className="upload-preview-filter-overlay upload-preview-grain-overlay" style={videoGrainStyle} />
                      )}
                      {!previewOriginal &&
                        blurPreviewRegions.map((region, regionIndex) => {
                          const isActiveRegion =
                            activeBlurTargetType === "face" ? Boolean(region.selected) : regionIndex === 0;
                          return (
                            <div
                              key={`blur-region-${region.id || "single"}-${region.left}-${region.top}`}
                              className={`upload-preview-blur-region ${
                                region.tracking !== "off" ? `is-tracking-${region.tracking}` : ""
                              } ${
                                blurPreviewEditEnabled && isActiveRegion ? "is-selected" : ""
                              }`.trim()}
                              style={{
                                left: `${region.left}%`,
                                top: `${region.top}%`,
                                width: `${region.width}%`,
                                height: `${region.height}%`,
                                borderRadius: region.shape === "circle" ? "999px" : "16px",
                                border:
                                  blurPreviewEditEnabled && isActiveRegion
                                    ? "1px solid rgba(92, 232, 255, 0.9)"
                                    : "none",
                                outline: "none",
                                boxShadow:
                                  blurPreviewEditEnabled && isActiveRegion
                                    ? "0 0 0 1px rgba(92, 232, 255, 0.34)"
                                    : "none",
                                background: "transparent",
                                backdropFilter: `blur(${region.pxBlur.toFixed(2)}px)`,
                                WebkitBackdropFilter: `blur(${region.pxBlur.toFixed(2)}px)`,
                                opacity: 0.96
                              }}
                            >
                              {blurPreviewEditEnabled && blurPreviewTool === "select" && isActiveRegion && (
                                <div className="upload-preview-blur-handle-set" aria-hidden="true">
                                  <span className="upload-preview-blur-handle is-nw" />
                                  <span className="upload-preview-blur-handle is-ne" />
                                  <span className="upload-preview-blur-handle is-sw" />
                                  <span className="upload-preview-blur-handle is-se" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {!previewOriginal && blurPreviewEditEnabled && blurPreviewDraftRegion && (
                        <div
                          className="upload-preview-blur-region upload-preview-blur-region-draft"
                          style={{
                            left: `${blurPreviewDraftRegion.x}%`,
                            top: `${blurPreviewDraftRegion.y}%`,
                            width: `${blurPreviewDraftRegion.width}%`,
                            height: `${blurPreviewDraftRegion.height}%`,
                            borderRadius: blurPreviewDraftRegion.shape === "circle" ? "999px" : "16px"
                          }}
                        />
                      )}
                      {!previewOriginal &&
                        (activeTimelineOverlayClips.length > 0 ? (
                          activeTimelineOverlayClips.map((clip) => {
                            if (clip.type === "sticker") {
                              const stickerValue = String(clip.payload?.sticker || "none");
                              const stickerOption = STICKER_OPTIONS.find((item) => item.value === stickerValue);
                              const StickerIcon = stickerOption?.Icon;
                              if (!StickerIcon) return null;
                              return (
                                <div
                                  key={clip.id}
                                  className="upload-preview-overlay-sticker"
                                  style={{
                                    ...getOverlayPlacementStyle(clip.payload?.stickerPosition || "top-right"),
                                    fontSize: `${Math.max(34, Number(clip.payload?.stickerSize || 72))}px`,
                                    mixBlendMode: clip.payload?.overlayMode || "screen"
                                  }}
                                >
                                  <StickerIcon />
                                </div>
                              );
                            }
                            const shapeKind = resolveTimelineShapeKind(clip);
                            if (shapeKind) {
                              const shapeSize = clampNumber(Number(clip.payload?.textSize || 84), 36, 240);
                              const widthPx = shapeKind === "ellipse" ? shapeSize : shapeSize * 1.2;
                              const heightPx = shapeKind === "ellipse" ? shapeSize : Math.max(32, shapeSize * 0.72);
                              return (
                                <div
                                  key={clip.id}
                                  className={`upload-preview-overlay-shape ${shapeKind === "ellipse" ? "is-ellipse" : "is-rectangle"}`}
                                  style={{
                                    ...getOverlayPlacementStyle(clip.payload?.textPosition || "center"),
                                    opacity: Math.max(0.1, Number(clip.payload?.overlayOpacity || 70) / 100),
                                    width: `${widthPx.toFixed(1)}px`,
                                    height: `${heightPx.toFixed(1)}px`,
                                    mixBlendMode: clip.payload?.overlayMode || "screen"
                                  }}
                                />
                              );
                            }
                            return (
                              <div
                                key={clip.id}
                                className="upload-preview-overlay-text"
                                style={{
                                  ...getOverlayPlacementStyle(clip.payload?.textPosition || "bottom-center"),
                                  opacity: Math.max(0.1, Number(clip.payload?.overlayOpacity || 70) / 100),
                                  fontSize: `${Math.max(18, Number(clip.payload?.textSize || 34))}px`,
                                  mixBlendMode: clip.payload?.overlayMode || "screen"
                                }}
                              >
                                {clip.payload?.text || clip.label || ""}
                              </div>
                            );
                          })
                        ) : !hasTimelineOverlayClips ? (
                          <>
                            {videoEdits.overlayText && (
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
                            {StickerPreviewIcon && (
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
                          </>
                        ) : null)}
                      {!previewOriginal && videoVignetteStyle && (
                        <div className="upload-preview-vignette" style={videoVignetteStyle} />
                      )}
                    </div>
                    </div>
                    <div className="premiere-monitor-readout-row">
                      <span className="premiere-monitor-time premiere-monitor-time-active">
                        {formatTimelineDisplayTime(timelinePlayhead)}
                      </span>
                      <button type="button" className="premiere-monitor-select" aria-label="Display fit">
                        Fit
                      </button>
                      <button type="button" className="premiere-monitor-select" aria-label="Preview quality">
                        1/2
                      </button>
                      <span className="premiere-monitor-tool" title="Monitor options" aria-hidden="true">
                        <FiSettings />
                      </span>
                      <span className="premiere-monitor-time">
                        {formatTimelineDisplayTime(videoMeta.duration || 0)}
                      </span>
                    </div>
                    <div className="premiere-monitor-scrub-row">
                      <input
                        type="range"
                        className="premiere-monitor-scrub"
                        min={0}
                        max={1000}
                        step={1}
                        value={Math.round(
                          clampNumber(
                            (Number(timelinePlayhead || 0) / Math.max(0.001, Number(videoMeta.duration || timelineDuration || 0))) * 1000,
                            0,
                            1000
                          )
                        )}
                        onChange={(e) => {
                          const ratio = clampNumber(Number(e.target.value || 0) / 1000, 0, 1);
                          const total = Math.max(0, Number(videoMeta.duration || timelineDuration || 0));
                          seekVideoToTimelineSeconds(total * ratio);
                        }}
                        aria-label="Monitor timeline scrub"
                      />
                    </div>
                    <div className="premiere-monitor-controls">
                      <button type="button" className="premiere-monitor-btn" onClick={markMonitorInAtPlayhead} title="Mark In" aria-label="Mark In">
                        {"{"}
                      </button>
                      <button type="button" className="premiere-monitor-btn premiere-monitor-btn-text" onClick={goToMonitorInPoint} title="Go to In point" aria-label="Go to In point">
                        |&lt;
                      </button>
                      <button type="button" className="premiere-monitor-btn premiere-monitor-btn-text" onClick={() => stepTimelineByFrame(-1)} title="Step back one frame" aria-label="Step back one frame">
                        &lt;
                      </button>
                      <button
                        type="button"
                        className="premiere-monitor-btn premiere-monitor-btn-play"
                        onClick={toggleTimelinePlayback}
                        title={timelinePreviewPlaying ? "Pause / Stop" : "Play"}
                        aria-label={timelinePreviewPlaying ? "Pause / Stop" : "Play"}
                      >
                        {timelinePreviewPlaying ? <FiPause /> : <FiPlay />}
                      </button>
                      <button type="button" className="premiere-monitor-btn premiere-monitor-btn-text" onClick={() => stepTimelineByFrame(1)} title="Step forward one frame" aria-label="Step forward one frame">
                        &gt;
                      </button>
                      <button type="button" className="premiere-monitor-btn premiere-monitor-btn-text" onClick={goToMonitorOutPoint} title="Go to Out point" aria-label="Go to Out point">
                        &gt;|
                      </button>
                      <button type="button" className="premiere-monitor-btn" onClick={markMonitorOutAtPlayhead} title="Mark Out" aria-label="Mark Out">
                        {"}"}
                      </button>
                      <button type="button" className="premiere-monitor-btn premiere-monitor-btn-text" onClick={addTimelineMarker} title="Add marker / mark clip" aria-label="Add marker / mark clip">
                        M
                      </button>
                      <button type="button" className="premiere-monitor-btn premiere-monitor-btn-text" onClick={insertOrOverwriteAtPlayhead} disabled={!selectedTimelineClip} title="Insert / Overwrite" aria-label="Insert / Overwrite">
                        []
                      </button>
                      <button type="button" className="premiere-monitor-btn" onClick={exportCurrentFrame} title="Export frame" aria-label="Export frame">
                        <FiCamera />
                      </button>
                      <button type="button" className="premiere-monitor-btn" onClick={toggleMonitorButtonEditor} title="Button editor / Customize buttons" aria-label="Button editor / Customize buttons">
                        <FiSliders />
                      </button>
                      <button type="button" className="premiere-monitor-btn premiere-monitor-btn-text" onClick={addMonitorButton} title="Add button" aria-label="Add button">
                        +
                      </button>
                    </div>
                    <p className="video-meta-line">
                      {videoMeta.width > 0 && videoMeta.height > 0 ? `${videoMeta.width}x${videoMeta.height}` : "Video"} | Duration:{" "}
                      {Number(videoMeta.duration || 0).toFixed(1)}s
                    </p>
                  </div>
                </div>
              </aside>
            )}
            <div className="upload-tools video-tools media-studio video-editor-panel">
              {isVideoWorkspace && (
                <div className="premiere-menu-bar-shell" ref={premiereMenuBarRef}>
                  <div
                    className="premiere-menu-bar"
                    role="menubar"
                    aria-label="Premiere style editor menu"
                    onMouseLeave={() => setActivePremiereMenuKey("")}
                  >
                    {premiereMenuGroups.map((menu) => (
                      <div
                        key={`premiere-menu-${menu.key}`}
                        className="premiere-menu-group"
                        onMouseEnter={() => {
                          setActivePremiereMenuKey(menu.key);
                        }}
                      >
                        <button
                          type="button"
                          className={`premiere-menu-trigger ${activePremiereMenuKey === menu.key ? "active" : ""}`}
                          onFocus={() => setActivePremiereMenuKey(menu.key)}
                          onClick={() => {
                            setActivePremiereMenuKey((prev) => (prev === menu.key ? "" : menu.key));
                          }}
                          aria-haspopup="menu"
                          aria-expanded={activePremiereMenuKey === menu.key}
                        >
                          {menu.label}
                        </button>
                        {activePremiereMenuKey === menu.key && (
                          <div className="premiere-menu-dropdown" role="menu" aria-label={`${menu.label} options`}>
                            {menu.items.map((item, index) =>
                              item.separator ? (
                                <div
                                  key={`premiere-menu-sep-${menu.key}-${index}`}
                                  className="premiere-menu-separator"
                                  aria-hidden="true"
                                />
                              ) : (
                                <button
                                  key={`premiere-menu-item-${menu.key}-${item.key}`}
                                  type="button"
                                  className="premiere-menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    executePremiereMenuAction(item.action);
                                    setActivePremiereMenuKey("");
                                  }}
                                >
                                  {item.label}
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div
                      className="premiere-page-tabs premiere-page-tabs-inline"
                      role="tablist"
                      aria-label="Video setup pages"
                    >
                      {VIDEO_BOTTOM_PAGES.map((page) => (
                        <button
                          key={`menu-page-${page.key}`}
                          type="button"
                          role="tab"
                          aria-selected={activeVideoBottomPage === page.key}
                          className={activeVideoBottomPage === page.key ? "premiere-menu-page-tab active" : "premiere-menu-page-tab"}
                          onClick={() => setActiveVideoBottomPage(page.key)}
                        >
                          {page.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeVideoBottomPage === "timeline" && isVideo && (
                <div className="upload-clip-strip-shell upload-clip-strip-shell-compact timeline-left-panel">
                  <div className="upload-clip-strip-head">
                    <div className="upload-clip-strip-title">
                      <div className="upload-clip-strip-title-row">
                        <strong>Project / Media</strong>
                        <button
                          type="button"
                          className={`timeline-clip-drawer-toggle timeline-clip-drawer-toggle-title ${timelineClipDrawerOpen ? "active" : ""}`}
                          onClick={() => setTimelineClipDrawerOpen((prev) => !prev)}
                          aria-expanded={timelineClipDrawerOpen}
                          aria-controls="timeline-clip-drawer"
                        >
                          <FiFilm />
                          <span>{timelineClipDrawerOpen ? "Close Media" : "Open Media"}</span>
                        </button>
                      </div>
                      <span>{timelineGalleryClips.length} media item{timelineGalleryClips.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="upload-clip-upper-modes" role="tablist" aria-label="Timeline edit modes">
                      {[
                        { key: "text", label: "Text", count: timelineModeCounts.text },
                        { key: "video", label: "Video", count: timelineModeCounts.video },
                        { key: "audio", label: "Audio", count: timelineModeCounts.audio }
                      ].map((mode) => (
                        <button
                          key={mode.key}
                          type="button"
                          role="tab"
                          aria-selected={timelineUpperMode === mode.key}
                          className={timelineUpperMode === mode.key ? "active" : ""}
                          onClick={() => setTimelineUpperModeWithFocus(mode.key)}
                        >
                          {mode.label}
                          <small>{mode.count}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="timeline-tool-groups">
                    <div className="timeline-tool-group-tabs" role="tablist" aria-label="Editor tool categories">
                      {VIDEO_TOOL_GROUPS.map((group) => (
                        <button
                          key={`timeline-tool-group-${group.key}`}
                          type="button"
                          role="tab"
                          aria-selected={activeVideoToolGroup === group.key}
                          className={activeVideoToolGroup === group.key ? "active" : ""}
                          onClick={() => setActiveVideoToolGroup(group.key)}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>
                    <div className="timeline-tool-group-panel" role="toolbar" aria-label={`${activeVideoToolGroupConfig.label} tools`}>
                      <div className="timeline-tool-group-grid">
                        {activeVideoToolGroupConfig.tools.map((toolKey) => {
                          const option = VIDEO_TOOL_OPTION_BY_KEY[toolKey];
                          if (!option) return null;
                          const { key, label, Icon } = option;
                          return (
                            <button
                              key={`timeline-left-${key}`}
                              type="button"
                              className={`timeline-tool-btn ${activeVideoTool === key ? "active" : ""}`}
                              onClick={() => activateVideoTool(key)}
                              title={label}
                              aria-label={label}
                            >
                              <Icon />
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="timeline-tool-group-hint">{activeVideoToolGroupConfig.note}</p>
                  </div>
                  <div className="timeline-clip-drawer-shell">
                    <div
                      id="timeline-clip-drawer"
                      className={`upload-clip-bin upload-clip-bin-top timeline-clip-drawer ${timelineClipDrawerOpen ? "open" : ""}`}
                      aria-label="Cut clips"
                      aria-hidden={!timelineClipDrawerOpen}
                    >
                      <div className="upload-clip-bin-grid timeline-clip-drawer-grid" role="list" aria-label="Cut clips">
                        {timelineModeClips.map((clip, idx) => {
                          const isActive = timelineSelectedClipId === clip.id;
                          const clipLabel = clip.label || `Clip ${idx + 1}`;
                          const clipStart = Number(clip.start || 0);
                          const clipEnd = Number(clip.end || 0);
                          const clipMidpoint = (clipStart + clipEnd) / 2;
                          const clipFrameSrc = timelineClipFrameSrcById[clip.id] || "";
                          const isShapeClip = isTimelineShapeClip(clip);
                          const clipVisualType = isShapeClip ? "shape" : clip.type;

                          return (
                            <button
                              key={clip.id}
                              type="button"
                              role="listitem"
                              className={`upload-clip-bin-item ${isActive ? "active" : ""}`}
                              onClick={() => focusTimelineClipForEditing(clip, "timeline")}
                              title={`${clipLabel} (${formatTimelineTime(clipStart)} - ${formatTimelineTime(clipEnd)})`}
                            >
                              <div className="upload-clip-visual">
                                {clip.type === "video" ? (
                                  clipFrameSrc ? (
                                    <img src={clipFrameSrc} alt={clipLabel} className="upload-clip-thumb" />
                                  ) : (
                                    <video
                                      className="upload-clip-thumb"
                                      src={`${previewUrl}#t=${Math.max(0.05, clipMidpoint).toFixed(3)}`}
                                      muted
                                      preload="metadata"
                                      playsInline
                                    />
                                  )
                                ) : (
                                  <div className={`upload-clip-placeholder upload-clip-placeholder-${clipVisualType}`}>
                                    {clip.type === "text" ? (isShapeClip ? <FiCrop /> : <FiType />) : clip.type === "sticker" ? <FiSmile /> : <FiMusic />}
                                  </div>
                                )}
                                <span className={`upload-clip-type upload-clip-type-${clipVisualType}`}>
                                  {clip.type === "video" ? <FiFilm /> : clip.type === "text" ? (isShapeClip ? <FiCrop /> : <FiType />) : clip.type === "sticker" ? <FiSmile /> : <FiMusic />}
                                  {clipVisualType}
                                </span>
                              </div>
                              <div className="upload-clip-bin-meta">
                                <strong>{clipLabel}</strong>
                                <small>{`${formatTimelineTime(clipStart)} - ${formatTimelineTime(clipEnd)}`}</small>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {!timelineClipDrawerOpen && (
                      <p className="timeline-clip-drawer-note">
                        {timelineModeClips.length} clip{timelineModeClips.length === 1 ? "" : "s"} ready. Tap Open Media to view.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeVideoBottomPage === "details" && (
                <div className="studio-panel-block video-details-page">
                  <label className="studio-input-field">
                    Video title
                    <input
                      type="text"
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      placeholder="Add a video title"
                      maxLength={180}
                    />
                  </label>
                  <label className="studio-input-field">
                    Description
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Write a description..."
                      rows={4}
                      maxLength={4000}
                    />
                  </label>
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
              )}

              {activeVideoBottomPage === "timeline" && (
                <div className="timeline-studio-stack">
                  <div className="studio-heading timeline-studio-heading">
                    <div>
                      <h3>Timeline + Creator Studio</h3>
                      <p>Edit timing and creative controls in one combined workspace.</p>
                    </div>
                    <div className="studio-heading-actions studio-quick-actions">
                      <button
                        type="button"
                        className="studio-soft-btn studio-soft-btn-icon"
                        aria-label="Hold to compare"
                        title="Hold to compare"
                        onMouseDown={() => setPreviewOriginal(true)}
                        onMouseUp={() => setPreviewOriginal(false)}
                        onMouseLeave={() => setPreviewOriginal(false)}
                        onTouchStart={() => setPreviewOriginal(true)}
                        onTouchEnd={() => setPreviewOriginal(false)}
                      >
                        <FiEye />
                      </button>
                      <button
                        type="button"
                        className="studio-soft-btn studio-soft-btn-icon"
                        aria-label="Reset"
                        title="Reset"
                        onClick={() => {
                          setVideoEdits((prev) => ({
                            ...defaultVideoEdits,
                            trimEnd: videoMeta.duration || prev.trimEnd || 0,
                            coverTime: 0
                          }));
                          setActiveVideoLookControl(VIDEO_LOOK_CONTROL_SPECS[0].key);
                          setExtraClips([]);
                          setCustomCoverFile(null);
                          setCustomCoverPreviewUrl("");
                        }}
                      >
                        <FiRotateCcw />
                      </button>
                    </div>
                  </div>

                  <div className="timeline-studio-panel-scroll">
            {activeVideoTool === "pro-apps" && (
              <div className="studio-panel-block">
                <p className="studio-helper">
                  Choose a ready-made professional workflow. It applies tuned settings in one click.
                </p>
                <div className="studio-workflow-grid">
                  {READY_MADE_WORKFLOW_OPTIONS.map((workflow) => {
                    const isApplied = videoEdits.workflowPreset === workflow.key;
                    return (
                      <article
                        key={workflow.key}
                        className={`studio-workflow-card ${isApplied ? "active" : ""}`}
                      >
                        <div className="studio-workflow-head">
                          <h4>{workflow.label}</h4>
                          <span>{workflow.badge}</span>
                        </div>
                        <p>{workflow.note}</p>
                        {workflow.bestFor && (
                          <p className="studio-workflow-best-for">
                            <strong>Best for:</strong> {workflow.bestFor}
                          </p>
                        )}
                        {Array.isArray(workflow.mainTools) && workflow.mainTools.length > 0 && (
                          <div className="studio-workflow-detail-block">
                            <h5>Main Tools</h5>
                            <ul className="studio-workflow-list">
                              {workflow.mainTools.map((tool) => (
                                <li key={`${workflow.key}-tool-${tool}`}>{tool}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(workflow.options) && workflow.options.length > 0 && (
                          <div className="studio-workflow-detail-block">
                            <h5>Options</h5>
                            <ul className="studio-workflow-list">
                              {workflow.options.map((option) => (
                                <li key={`${workflow.key}-opt-${option}`}>{option}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="studio-workflow-features">
                          {workflow.features.map((feature) => (
                            <span key={feature}>{feature}</span>
                          ))}
                        </div>
                        <div className="pill-group studio-chip-row studio-workflow-actions">
                          <button
                            type="button"
                            className={isApplied ? "active" : ""}
                            onClick={() => applyVideoWorkflow(workflow.key)}
                          >
                            {isApplied ? "Applied" : "Apply workflow"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveVideoTool(workflow.focusTool)}
                          >
                            Open panel
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <p className="video-note">
                  Active workflow: {activeVideoWorkflow ? activeVideoWorkflow.label : "Custom manual setup"}
                </p>
              </div>
            )}

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
                        value: Number(videoTrimSummary.start),
                        min: 0,
                        max: trimStartMax || 0,
                        step: 0.1,
                        suffix: "s",
                        onChange: (e) => setVideoEdit("trimStart", Number(e.target.value))
                      })}
                      {renderStudioSlider({
                        key: "trimEnd",
                        label: "End",
                        value: Number(videoTrimSummary.end),
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
                    <div className="pill-group studio-chip-row studio-action-row">
                      <button
                        type="button"
                        className={videoEdits.reversePlayback ? "active" : ""}
                        onClick={() => setVideoEdit("reversePlayback", !videoEdits.reversePlayback)}
                      >
                        Reverse {videoEdits.reversePlayback ? "On" : "Off"}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="video-note">Use Grading, Blur, Audio, Text, Stickers, and Filters tabs for final-render controls.</p>
              </>
            )}

            {activeVideoTool === "timeline-pro" && (
              <div className="studio-panel-block">
                <p className="studio-helper">Timeline control for cut, split, and reverse workflow.</p>
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "splitPoint",
                    label: "Split marker",
                    value: Number(videoEdits.splitPoint || 0).toFixed(1),
                    min: Number(videoEdits.trimStart || 0),
                    max: Number(videoEdits.trimEnd || videoMeta.duration || 0),
                    step: 0.1,
                    suffix: "s",
                    onChange: (e) => setVideoEdit("splitPoint", Number(e.target.value))
                  })}
                </div>
                <div className="pill-group studio-chip-row studio-action-row">
                  <button
                    type="button"
                    onClick={() => {
                      const splitValue = Number(videoEdits.splitPoint || 0);
                      const maxEnd = Number(videoEdits.trimEnd || videoMeta.duration || 0);
                      if (splitValue <= Number(videoEdits.trimStart || 0) || splitValue >= maxEnd) return;
                      setVideoEdits((prev) => {
                        const next = [...(prev.splitPoints || []), Number(splitValue.toFixed(1))]
                          .sort((a, b) => a - b)
                          .filter((value, idx, arr) => idx === 0 || Math.abs(value - arr[idx - 1]) > 0.05);
                        return { ...prev, splitPoints: next };
                      });
                    }}
                  >
                    Add split
                  </button>
                  <button
                    type="button"
                    className={videoEdits.reversePlayback ? "active" : ""}
                    onClick={() => setVideoEdit("reversePlayback", !videoEdits.reversePlayback)}
                  >
                    Reverse {videoEdits.reversePlayback ? "On" : "Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoEdits((prev) => ({ ...prev, splitPoints: [] }))}
                  >
                    Clear splits
                  </button>
                </div>
                <p className="video-note">
                  Split points: {(videoEdits.splitPoints || []).length ? (videoEdits.splitPoints || []).map((p) => `${Number(p).toFixed(1)}s`).join(", ") : "none"}
                </p>
              </div>
            )}

            {activeVideoTool === "transform-pro" && (
              <div className="studio-panel-block">
                <p className="studio-helper">Crop, rotate, and flip controls for frame composition.</p>
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "cropZoom",
                    label: "Crop zoom",
                    value: Number(videoEdits.cropZoom || 100),
                    min: 100,
                    max: 220,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("cropZoom", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "cropX",
                    label: "Crop X",
                    value: Number(videoEdits.cropX || 50),
                    min: 0,
                    max: 100,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("cropX", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "cropY",
                    label: "Crop Y",
                    value: Number(videoEdits.cropY || 50),
                    min: 0,
                    max: 100,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("cropY", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "rotate",
                    label: "Rotate",
                    value: Number(videoEdits.rotate || 0),
                    min: -180,
                    max: 180,
                    suffix: "deg",
                    onChange: (e) => setVideoEdit("rotate", Number(e.target.value))
                  })}
                </div>
                <div className="pill-group studio-chip-row studio-action-row">
                  <button
                    type="button"
                    className={videoEdits.flipH ? "active" : ""}
                    onClick={() => setVideoEdit("flipH", !videoEdits.flipH)}
                  >
                    Flip H
                  </button>
                  <button
                    type="button"
                    className={videoEdits.flipV ? "active" : ""}
                    onClick={() => setVideoEdit("flipV", !videoEdits.flipV)}
                  >
                    Flip V
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoEdits((prev) => ({ ...prev, cropZoom: 100, cropX: 50, cropY: 50, rotate: 0, flipH: false, flipV: false }))}
                  >
                    Reset transform
                  </button>
                </div>
              </div>
            )}

            {activeVideoTool === "grading-pro" && (
              <div className="studio-panel-block">
                <p className="studio-helper">These color controls are rendered in the final video export.</p>
                <div className="studio-look-picker">
                  {videoLookControls.map((control) => (
                    <button
                      key={control.key}
                      type="button"
                      className={`studio-look-option ${activeVideoLookControl === control.key ? "active" : ""}`}
                      onClick={() => setActiveVideoLookControl(control.key)}
                    >
                      <span>{control.label}</span>
                      <strong>{`${control.value}${control.suffix || ""}`}</strong>
                    </button>
                  ))}
                </div>
                <div className="studio-look-slider-wrap">
                  {activeVideoLookControlConfig && renderStudioSlider(activeVideoLookControlConfig)}
                </div>
              </div>
            )}

            {activeVideoTool === "fx-pro" && (
              <div className="studio-panel-block">
                <p className="studio-helper">
                  Choose what to blur, how soft the mask should be, how tracking behaves, and the timeline range.
                  Blur settings are rendered in final export.
                </p>
                <p className="video-note">
                  Mouse edit ({blurPreviewTool === "draw" ? "Draw tool" : "Arrow/Select tool"}): use the preview like a normal editor.
                </p>
                <div className="pill-group studio-chip-row">
                  <button
                    type="button"
                    className={activeBlurTargetType === "face" ? "active" : ""}
                    onClick={() => {
                      setBlurTargetType("face");
                      setBlurPreviewTool("select");
                      setBlurTrackStatus("Face target ready. Use arrow tool to select/move/resize.");
                    }}
                  >
                    Select Person (Mouse)
                  </button>
                  <button
                    type="button"
                    className={activeBlurTargetType === "custom" ? "active" : ""}
                    onClick={() => {
                      setBlurTargetType("custom");
                      setBlurPreviewTool("draw");
                      setBlurTrackStatus("Custom region ready. Drag on preview to draw blur box.");
                    }}
                  >
                    Draw Region (Mouse)
                  </button>
                </div>
                <div className="pill-group studio-chip-row">
                  {BLUR_PREVIEW_TOOL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={blurPreviewTool === option.value ? "active" : ""}
                      onClick={() => setBlurPreviewTool(option.value)}
                      disabled={activeBlurTargetType === "none"}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="studio-look-picker">
                  {BLUR_TARGET_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`studio-look-option ${activeBlurTargetType === option.value ? "active" : ""}`}
                      onClick={() => setBlurTargetType(option.value)}
                    >
                      <span>{option.label}</span>
                      <strong>
                        {option.value === "none"
                          ? `${Number(videoEdits.effectBlur || 0)}%`
                          : `${Math.round(resolveBlurIntensityForTarget(videoEdits, option.value))}%`}
                      </strong>
                    </button>
                  ))}
                </div>
                <div className="creator-settings-grid">
                  <label>
                    Mask shape
                    <select
                      value={
                        resolveBlurShape(
                          activeBlurTargetType === "face" && activeBlurSubject
                            ? activeBlurSubject.shape
                            : videoEdits.blurShape || videoEdits.maskShape,
                          "rectangle"
                        )
                      }
                      onChange={(e) => {
                        const shape = resolveBlurShape(e.target.value, "rectangle");
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({ ...subject, shape }));
                        } else {
                          setVideoEdits((prev) => ({ ...prev, blurShape: shape, maskShape: shape }));
                        }
                      }}
                      disabled={activeBlurTargetType === "none"}
                    >
                      {BLUR_SHAPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tracking
                    <select
                      value={
                        resolveBlurTracking(
                          activeBlurTargetType === "face" && activeBlurSubject
                            ? activeBlurSubject.tracking
                            : videoEdits.blurTracking,
                          videoEdits.motionTrackingEnabled ? "smooth" : "off"
                        )
                      }
                      onChange={(e) => {
                        const tracking = resolveBlurTracking(e.target.value, "off");
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({ ...subject, tracking }));
                        } else {
                          setVideoEdits((prev) => ({
                            ...prev,
                            blurTracking: tracking,
                            motionTrackingEnabled: tracking !== "off"
                          }));
                        }
                      }}
                      disabled={activeBlurTargetType === "none"}
                    >
                      {BLUR_TRACKING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {activeBlurTargetType !== "none" && (
                  <div className="pill-group studio-chip-row studio-action-row">
                    <button
                      type="button"
                      onClick={buildFaceBlurTrack}
                      disabled={blurTrackBusy}
                    >
                      {blurTrackBusy ? "Tracking..." : "Track Face In Range"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          removeBlurSubject(activeBlurSubject.id);
                          setBlurTrackStatus("Selected face track removed.");
                          return;
                        }
                        setVideoEdits((prev) => ({ ...prev, blurTrackPoints: [] }));
                        setBlurTrackStatus("Face track cleared.");
                      }}
                      disabled={
                        activeBlurTargetType === "face"
                          ? !activeBlurSubject
                          : !Array.isArray(videoEdits.blurTrackPoints) || videoEdits.blurTrackPoints.length < 2
                      }
                    >
                      {activeBlurTargetType === "face" && activeBlurSubject ? "Remove Selected Face" : "Clear Face Track"}
                    </button>
                  </div>
                )}
                {activeBlurTargetType === "face" && blurFaceSubjects.length > 0 && (
                  <div className="blur-face-strip">
                    {blurFaceSubjects.map((subject) => (
                      <div
                        key={`blur-face-subject-${subject.id}`}
                        className={`blur-face-chip ${
                          activeBlurSubject?.id === subject.id ? "active" : ""
                        }`.trim()}
                      >
                        <button type="button" className="blur-face-chip-main" onClick={() => selectBlurSubject(subject.id)}>
                          {subject.thumb ? <img src={subject.thumb} alt={subject.label} /> : <span className="blur-face-chip-dot" />}
                          <span>{subject.label}</span>
                        </button>
                        <button
                          type="button"
                          className="blur-face-chip-remove"
                          aria-label={`Remove ${subject.label}`}
                          onClick={() => removeBlurSubject(subject.id)}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {activeBlurTargetType !== "none" && blurTrackStatus && (
                  <p className="video-note">{blurTrackStatus}</p>
                )}
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "effectBlur",
                    label: "Global blur",
                    value: Number(videoEdits.effectBlur || 0),
                    min: 0,
                    max: 100,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("effectBlur", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "blurIntensity",
                    label: "Region intensity",
                    value: Number(
                      activeBlurTargetType === "face" && activeBlurSubject
                        ? toNumber(activeBlurSubject.intensity, videoEdits.blurIntensity)
                        : resolveBlurIntensityForTarget(videoEdits, activeBlurTargetType)
                    ),
                    min: 0,
                    max: 100,
                    suffix: "%",
                    onChange: (e) => {
                      const nextValue = Number(e.target.value);
                      if (activeBlurTargetType === "face" && activeBlurSubject) {
                        updateActiveBlurSubject((subject) => ({ ...subject, intensity: nextValue }));
                        return;
                      }
                      setVideoEdits((prev) => {
                        const next = { ...prev, blurIntensity: nextValue };
                        if (activeBlurTargetType === "face") next.blurFace = nextValue;
                        if (activeBlurTargetType === "logo") next.blurLogo = nextValue;
                        if (activeBlurTargetType === "object" || activeBlurTargetType === "custom") {
                          next.blurCustom = nextValue;
                        }
                        return next;
                      });
                    }
                  })}
                  {renderStudioSlider({
                    key: "blurFeather",
                    label: "Feather",
                    value: Number(
                      activeBlurTargetType === "face" && activeBlurSubject
                        ? toNumber(activeBlurSubject.feather, videoEdits.blurFeather ?? videoEdits.maskFeather ?? 8)
                        : videoEdits.blurFeather ?? videoEdits.maskFeather ?? 8
                    ),
                    min: 0,
                    max: 40,
                    suffix: "%",
                    onChange: (e) => {
                      const nextValue = Number(e.target.value);
                      if (activeBlurTargetType === "face" && activeBlurSubject) {
                        updateActiveBlurSubject((subject) => ({ ...subject, feather: nextValue }));
                        return;
                      }
                      setVideoEdits((prev) => ({
                        ...prev,
                        blurFeather: nextValue,
                        maskFeather: nextValue
                      }));
                    }
                  })}
                </div>
                {activeBlurTargetType !== "none" && (
                  <div className="studio-slider-grid">
                    {renderStudioSlider({
                      key: "blurX",
                      label: "Region X",
                      value: Number(videoEdits.blurX ?? 33),
                      min: 0,
                      max: 100,
                      suffix: "%",
                      onChange: (e) => {
                        const nextX = Number(e.target.value);
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({
                            ...subject,
                            trackPoints: remapBlurTrackGeometry(subject.trackPoints, { x: nextX })
                          }));
                          return;
                        }
                        setVideoEdits((prev) => {
                          const width = Number(prev.blurWidth ?? 34);
                          return {
                            ...prev,
                            blurX: nextX,
                            blurCustomX: nextX + width / 2
                          };
                        });
                      }
                    })}
                    {renderStudioSlider({
                      key: "blurY",
                      label: "Region Y",
                      value: Number(videoEdits.blurY ?? 24),
                      min: 0,
                      max: 100,
                      suffix: "%",
                      onChange: (e) => {
                        const nextY = Number(e.target.value);
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({
                            ...subject,
                            trackPoints: remapBlurTrackGeometry(subject.trackPoints, { y: nextY })
                          }));
                          return;
                        }
                        setVideoEdits((prev) => {
                          const height = Number(prev.blurHeight ?? 34);
                          return {
                            ...prev,
                            blurY: nextY,
                            blurCustomY: nextY + height / 2
                          };
                        });
                      }
                    })}
                    {renderStudioSlider({
                      key: "blurWidth",
                      label: "Region width",
                      value: Number(videoEdits.blurWidth ?? 34),
                      min: 1,
                      max: 100,
                      suffix: "%",
                      onChange: (e) => {
                        const nextWidth = Number(e.target.value);
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({
                            ...subject,
                            trackPoints: remapBlurTrackGeometry(subject.trackPoints, { width: nextWidth })
                          }));
                          return;
                        }
                        setVideoEdits((prev) => ({
                          ...prev,
                          blurWidth: nextWidth,
                          blurCustomWidth: nextWidth
                        }));
                      }
                    })}
                    {renderStudioSlider({
                      key: "blurHeight",
                      label: "Region height",
                      value: Number(videoEdits.blurHeight ?? 34),
                      min: 1,
                      max: 100,
                      suffix: "%",
                      onChange: (e) => {
                        const nextHeight = Number(e.target.value);
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({
                            ...subject,
                            trackPoints: remapBlurTrackGeometry(subject.trackPoints, { height: nextHeight })
                          }));
                          return;
                        }
                        setVideoEdits((prev) => ({
                          ...prev,
                          blurHeight: nextHeight,
                          blurCustomHeight: nextHeight
                        }));
                      }
                    })}
                  </div>
                )}
                {activeBlurTargetType !== "none" && (
                  <div className="studio-slider-grid">
                    {renderStudioSlider({
                      key: "blurStart",
                      label: "Blur start",
                      value: Number(videoEdits.blurStart || 0),
                      min: 0,
                      max: Math.max(0, Number(timelineDuration || videoMeta.duration || 0)),
                      step: 0.1,
                      suffix: "s",
                      onChange: (e) => {
                        const nextValue = Number(e.target.value);
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({ ...subject, start: nextValue }));
                          return;
                        }
                        setVideoEdit("blurStart", nextValue);
                      }
                    })}
                    {renderStudioSlider({
                      key: "blurEnd",
                      label: "Blur end",
                      value: Number(videoEdits.blurEnd || 0),
                      min: 0,
                      max: Math.max(0, Number(timelineDuration || videoMeta.duration || 0)),
                      step: 0.1,
                      suffix: "s",
                      onChange: (e) => {
                        const nextValue = Number(e.target.value);
                        if (activeBlurTargetType === "face" && activeBlurSubject) {
                          updateActiveBlurSubject((subject) => ({ ...subject, end: nextValue }));
                          return;
                        }
                        setVideoEdit("blurEnd", nextValue);
                      }
                    })}
                  </div>
                )}
                <div className="pill-group studio-chip-row studio-action-row">
                  <button
                    type="button"
                    onClick={() => setBlurTargetType(activeBlurTargetType)}
                    disabled={activeBlurTargetType === "none"}
                  >
                    Re-center target
                  </button>
                  <button
                    type="button"
                    onClick={resetBlurSettings}
                  >
                    Reset blur panel
                  </button>
                </div>
              </div>
            )}

            {activeVideoTool === "motion-pro" && (
              <div className="studio-panel-block">
                <p className="studio-helper">Keyframes, tracking, and stabilization controls.</p>
                <div className="creator-settings-grid">
                  <label>
                    Keyframe easing
                    <select
                      value={videoEdits.keyframeEase}
                      onChange={(e) => setVideoEdit("keyframeEase", e.target.value)}
                    >
                      {KEYFRAME_EASE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tracking
                    <button
                      type="button"
                      className={videoEdits.motionTrackingEnabled ? "toggle-btn active" : "toggle-btn"}
                      onClick={() => setVideoEdit("motionTrackingEnabled", !videoEdits.motionTrackingEnabled)}
                    >
                      {videoEdits.motionTrackingEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </label>
                </div>
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "stabilization",
                    label: "Stabilization",
                    value: Number(videoEdits.stabilization || 0),
                    min: 0,
                    max: 100,
                    onChange: (e) => setVideoEdit("stabilization", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "panDrift",
                    label: "Pan effect",
                    value: Number(videoEdits.panDrift || 0),
                    min: -100,
                    max: 100,
                    onChange: (e) => setVideoEdit("panDrift", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "zoomPulse",
                    label: "Zoom motion",
                    value: Number(videoEdits.zoomPulse || 0),
                    min: 0,
                    max: 100,
                    onChange: (e) => setVideoEdit("zoomPulse", Number(e.target.value))
                  })}
                </div>
              </div>
            )}

            {activeVideoTool === "audio-pro" && (
              <div className="studio-panel-block">
                <p className="studio-helper">Audio controls below are rendered in final export.</p>
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "volume",
                    label: "Volume",
                    value: Number(videoEdits.volume || 100),
                    min: 0,
                    max: 100,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("volume", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "voiceoverGain",
                    label: "Voice boost",
                    value: Number(videoEdits.voiceoverGain || 100),
                    min: 0,
                    max: 200,
                    suffix: "%",
                    onChange: (e) => setVideoEdit("voiceoverGain", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "noiseRemoval",
                    label: "Noise removal",
                    value: Number(videoEdits.noiseRemoval || 0),
                    min: 0,
                    max: 100,
                    onChange: (e) => setVideoEdit("noiseRemoval", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "deEss",
                    label: "Voice de-ess",
                    value: Number(videoEdits.deEss || 0),
                    min: 0,
                    max: 100,
                    onChange: (e) => setVideoEdit("deEss", Number(e.target.value))
                  })}
                  {renderStudioSlider({
                    key: "loudnessTarget",
                    label: "Loudness target",
                    value: Number(videoEdits.loudnessTarget || -14),
                    min: -24,
                    max: -8,
                    suffix: " LUFS",
                    onChange: (e) => setVideoEdit("loudnessTarget", Number(e.target.value))
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

            {activeVideoTool === "titles-pro" && (
              <div className="studio-panel-block">
                <p className="studio-helper">Animated lower-thirds, titles, and intro systems.</p>
                <div className="creator-settings-grid">
                  <label>
                    Title template
                    <select
                      value={videoEdits.titleTemplate}
                      onChange={(e) => setVideoEdit("titleTemplate", e.target.value)}
                    >
                      {TITLE_TEMPLATE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Title animation
                    <select
                      value={videoEdits.titleAnimation}
                      onChange={(e) => setVideoEdit("titleAnimation", e.target.value)}
                    >
                      {TITLE_ANIMATION_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="studio-input-field">
                  <span>Lower third text</span>
                  <input
                    type="text"
                    value={videoEdits.lowerThirdText}
                    placeholder="Name | Role | Channel"
                    onChange={(e) => setVideoEdit("lowerThirdText", e.target.value)}
                  />
                </label>
                <div className="studio-slider-grid">
                  {renderStudioSlider({
                    key: "introDuration",
                    label: "Intro duration",
                    value: Number(videoEdits.introDuration || 2).toFixed(1),
                    min: 0,
                    max: 10,
                    step: 0.1,
                    suffix: "s",
                    onChange: (e) => setVideoEdit("introDuration", Number(e.target.value))
                  })}
                </div>
              </div>
            )}

            {activeVideoTool === "cover" && (
              <div className="studio-panel-block">
                <p className="studio-helper">
                  Pick the cover from the timeline, or upload a custom cover image like Instagram.
                </p>
                {renderStudioSlider({
                  key: "coverTime",
                  label: "Cover frame",
                  value: Number(videoEdits.coverTime || 0).toFixed(1),
                  min: 0,
                  max: trimEndMax || 0,
                  step: 0.1,
                  suffix: "s",
                  onChange: (e) => {
                    setVideoEdit("coverTime", Number(e.target.value));
                    setCustomCoverFile(null);
                  }
                })}
                <div className="studio-cover-strip">
                  {coverFrames.map((frame) => {
                    const isActive = !customCoverFile && Math.abs(Number(videoEdits.coverTime || 0) - frame.time) <= 0.15;
                    return (
                      <button
                        key={`cover-frame-${frame.index}-${frame.time}`}
                        type="button"
                        className={`studio-cover-frame ${isActive ? "active" : ""}`}
                        onClick={() => {
                          setVideoEdit("coverTime", frame.time);
                          setCustomCoverFile(null);
                        }}
                      >
                        <img src={frame.src} alt={`Cover frame ${frame.time}s`} />
                        <span>{frame.time.toFixed(1)}s</span>
                      </button>
                    );
                  })}
                </div>
                <div className="studio-cover-actions">
                  <label className="upload-file-pick studio-upload-inline">
                    <FiImage />
                    <span>{customCoverFile ? "Change custom cover" : "Upload custom cover"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const imageFile = e.target.files?.[0] || null;
                        setCustomCoverFile(imageFile);
                      }}
                    />
                  </label>
                  {customCoverFile && (
                    <button
                      type="button"
                      className="studio-soft-btn"
                      onClick={() => setCustomCoverFile(null)}
                    >
                      Use timeline frame
                    </button>
                  )}
                </div>
                {customCoverPreviewUrl && (
                  <div className="studio-custom-cover-preview">
                    <img src={customCoverPreviewUrl} alt="Custom cover preview" />
                    <p className="video-note">
                      Custom cover selected{customCoverFile?.name ? `: ${customCoverFile.name}` : ""}.
                    </p>
                  </div>
                )}
                {!customCoverFile && selectedCoverFrame && (
                  <p className="video-note">Timeline cover selected at {selectedCoverFrame.time.toFixed(1)}s.</p>
                )}
              </div>
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
                <p className="studio-helper">{extraClips.length} extra clip(s) selected. You can use these later for a richer clip cut.</p>
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
                <p className="video-note">
                  Blend/framing settings update studio preview. Final export applies server-supported edits.
                </p>
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
                  </div>
                </div>
              )}

            {activeVideoBottomPage === "timeline" && (
              <section className="video-timeline-workspace" ref={timelineWorkspaceRef}>
                <div className="studio-heading studio-heading-secondary timeline-heading">
                  <div>
                    <h3>Timeline Editor</h3>
                    <p>Arrange clips and timing here while using the Creator Studio tools above.</p>
                  </div>
                </div>

                {timelineSettingsOpen && (!selectedTimelineClip || !timelineInspectorOpen) && (
                  <div className="timeline-quick-panel">
                    <div className="timeline-quick-panel-block">
                      <strong>Timeline Settings</strong>
                      <label className="timeline-inline-check">
                        <input type="checkbox" checked={timelineSnapEnabled} onChange={(e) => setTimelineSnapEnabled(e.target.checked)} />
                        Snap to grid
                      </label>
                      <label className="timeline-inline-check">
                        <input type="checkbox" checked={timelineLinkedClips} onChange={(e) => setTimelineLinkedClips(e.target.checked)} />
                        Link clips
                      </label>
                    </div>
                  </div>
                )}

                <div className="timeline-panel">
                  <div className="timeline-header">
                    <div className="timeline-timecode">{formatTimelineTimecode(timelinePlayhead)}</div>
                    <div className="timeline-icons">
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineEditTool === "select" ? "active" : ""}`}
                        title="Selection tool"
                        aria-label="Selection tool"
                        onClick={() => setTimelineEditTool("select")}
                      >
                        <FiMove />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineEditTool === "trim" ? "active" : ""}`}
                        title="Trim tool"
                        aria-label="Trim tool"
                        onClick={() => setTimelineEditTool("trim")}
                      >
                        <FiCrop />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineEditTool === "ripple" ? "active" : ""}`}
                        title="Ripple edit tool"
                        aria-label="Ripple edit tool"
                        onClick={() => setTimelineEditTool("ripple")}
                      >
                        <FiRotateCw />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineEditTool === "blade" ? "active" : ""}`}
                        title="Blade tool"
                        aria-label="Blade tool"
                        onClick={() => setTimelineEditTool("blade")}
                      >
                        <FiScissors />
                      </button>
                      <button
                        type="button"
                        className="timeline-icon-btn"
                        title="Delete selected clip"
                        aria-label="Delete selected clip"
                        onClick={deleteSelectedTimelineClip}
                        disabled={!selectedTimelineClip || selectedTimelineClip.type === "video"}
                      >
                        <FiTrash2 />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineSnapEnabled ? "active" : ""}`}
                        title="Snap"
                        aria-label="Snap"
                        onClick={() => setTimelineSnapEnabled((prev) => !prev)}
                      >
                        <FiZap />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineLinkedClips ? "active" : ""}`}
                        title="Linked Selection"
                        aria-label="Linked Selection"
                        onClick={() => setTimelineLinkedClips((prev) => !prev)}
                      >
                        <FiLink2 />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${sourceMonitorPanelVisible ? "active" : ""}`}
                        title="Viewer toggle"
                        aria-label="Viewer toggle"
                        onClick={() => setSourceMonitorPanelVisible((prev) => !prev)}
                      >
                        <FiEye />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineInspectorOpen ? "active" : ""}`}
                        title="Inspector panel"
                        aria-label="Inspector panel"
                        onClick={() => setTimelineInspectorOpen((prev) => !prev)}
                      >
                        <FiSliders />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${activeVideoTool === "fx-pro" ? "active" : ""}`}
                        title="Effects tools"
                        aria-label="Effects tools"
                        onClick={() => openTimelineStudioTool("effects")}
                      >
                        <FiDroplet />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${activeVideoTool === "grading-pro" ? "active" : ""}`}
                        title="Color tools"
                        aria-label="Color tools"
                        onClick={() => openTimelineStudioTool("color")}
                      >
                        <FiSun />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${activeVideoTool === "audio-pro" ? "active" : ""}`}
                        title="Audio mixer"
                        aria-label="Audio mixer"
                        onClick={() => openTimelineStudioTool("audio")}
                      >
                        <FiMic />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineSettingsOpen ? "active" : ""}`}
                        title="Settings"
                        aria-label="Settings"
                        onClick={() => openTimelineStudioTool("settings")}
                      >
                        <FiSettings />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineVoiceInputOn ? "active" : ""}`}
                        title="Microphone input"
                        aria-label="Microphone input"
                        onClick={() => openTimelineStudioTool("mic")}
                      >
                        <FiMic />
                      </button>
                      <button
                        type="button"
                        className="timeline-icon-btn"
                        title="Fullscreen view"
                        aria-label="Fullscreen view"
                        onClick={toggleTimelineFullscreen}
                      >
                        <FiMaximize2 />
                      </button>
                      <button
                        type="button"
                        className="timeline-icon-btn"
                        title="Export render"
                        aria-label="Export render"
                        onClick={triggerTimelineRender}
                      >
                        <FiFilm />
                      </button>
                      <button
                        type="button"
                        className={`timeline-icon-btn ${timelineCaptionsOn ? "active" : ""}`}
                        title="Closed Captions"
                        aria-label="Closed Captions"
                        onClick={() => setTimelineCaptionsOn((prev) => !prev)}
                      >
                        CC
                      </button>
                    </div>
                  </div>

                  <div className="timeline-main">
                    <div className="track-controls">
                      <div className="empty-corner">
                        <span aria-hidden="true">
                          <FiLock />
                        </span>
                        <span aria-hidden="true">
                          <FiZap />
                        </span>
                        <span aria-hidden="true">CC</span>
                      </div>

                      {timelinePanelRows.map((row) => (
                        <div key={row.id} className="track-row">
                          <div className={`track-name ${row.kind === "audio" ? "dark" : ""}`}>{row.code}</div>
                          <div className="track-label">{row.label}</div>
                          <div className="track-buttons">
                            {row.kind === "audio" ? (
                              <>
                                <span title="Mute">M</span>
                                <span title="Solo">S</span>
                                <span title="Record">
                                  <FiMic />
                                </span>
                              </>
                            ) : (
                              <>
                                <span title="Lock">
                                  <FiLock />
                                </span>
                                <span title="Visibility">
                                  <FiEye />
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="timeline-area">
                      <div
                        className="timeline-scroll-area"
                        ref={timelineViewportRef}
                        onPointerDown={(event) => {
                          const target = event.target;
                          if (!(target instanceof Element)) return;
                          if (target.closest(".clip, .timeline-marker")) return;
                          seekVideoToTimelineSeconds(getTimelineSecondsFromClientX(event.clientX));
                        }}
                      >
                        <div className="timeline-canvas" style={{ width: `${timelineCanvasWidth}px` }}>
                          <div className="ruler">
                            <div className="time-numbers">
                              {timelineTicks.map((tick) => (
                                <span key={`timeline-time-${tick}`} style={{ left: `${secondsToTimelinePx(tick)}px` }}>
                                  {formatTimelineTimecode(tick)}
                                </span>
                              ))}
                            </div>

                            <div className="ticks" />
                            <div className="render-bar" />

                            {timelineMarkers.map((marker) => {
                              const left = secondsToTimelinePx(marker);
                              const isActive = Math.abs(Number(marker || 0) - Number(timelinePlayhead || 0)) <= 0.08;
                              return (
                                <button
                                  key={`timeline-marker-${marker}`}
                                  type="button"
                                  className={`timeline-marker ${isActive ? "active" : ""}`}
                                  style={{ left: `${left}px` }}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    seekVideoToTimelineSeconds(marker);
                                  }}
                                  onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    removeTimelineMarker(marker);
                                  }}
                                  title={`${formatTimelineDisplayTime(marker)} (double click to remove)`}
                                  aria-label={`Timeline marker at ${formatTimelineDisplayTime(marker)}`}
                                />
                              );
                            })}
                          </div>

                          <div className="tracks">
                            {timelinePanelRows.map((row, rowIndex) => {
                              const clips = sortedTimelineClips.filter((clip) => clip.trackId === row.id);
                              return (
                                <div
                                  key={row.id}
                                  className="edit-row"
                                  ref={(node) => {
                                    timelineTrackRefs.current[row.id] = node;
                                  }}
                                >
                                  {clips.map((clip) => {
                                    const left = secondsToTimelinePx(clip.start);
                                    const width = Math.max(10, secondsToTimelinePx(clip.end) - secondsToTimelinePx(clip.start));
                                    const toneClass =
                                      clip.type === "audio"
                                        ? "audio-green"
                                        : rowIndex % 2 === 0
                                          ? "video-purple"
                                          : "video-blue";
                                    const clipLabel = clip.disabled === true ? `${clip.label || clip.type} (Off)` : clip.label || clip.type;
                                    return (
                                      <button
                                        key={clip.id}
                                        type="button"
                                        className={`clip ${toneClass} ${clip.type === "audio" ? "is-audio" : ""} ${
                                          timelineSelectedClipId === clip.id ? "selected" : ""
                                        } ${clip.disabled === true ? "is-disabled" : ""}`}
                                        style={{ left: `${left}px`, width: `${width}px` }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          focusTimelineClipForEditing(clip, "timeline");
                                        }}
                                        onPointerDown={(e) => beginTimelineClipPointerAction(e, clip.id, "move")}
                                        aria-label={`${clipLabel} ${formatTimelineTime(clip.start)} to ${formatTimelineTime(clip.end)}`}
                                      >
                                        {clip.type === "audio" ? (
                                          <>
                                            <div className="waveform" aria-hidden="true" />
                                            <span className="fx-badge">fx</span>
                                            <span className="clip-label sr-only">{clipLabel}</span>
                                          </>
                                        ) : (
                                          <>
                                            <span className="clip-icon" aria-hidden="true" />
                                            <span className="clip-label">{clipLabel}</span>
                                          </>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })}

                            <div className="playhead" style={{ left: `${secondsToTimelinePx(timelinePlayhead)}px` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="timeline-label">Timeline</div>
                </div>

                {selectedTimelineClip && timelineInspectorOpen && (
                  <div className="timeline-clip-inspector">
                    <label>
                      Track
                      <select
                        value={selectedTimelineClip.trackId}
                        onChange={(e) => {
                          const nextTrackId = e.target.value;
                          if (!clipAllowedOnTrack(selectedTimelineClip, nextTrackId)) return;
                          updateTimelineClip(selectedTimelineClip.id, { trackId: nextTrackId });
                        }}
                      >
                        {TIMELINE_TRACKS.filter((track) => clipAllowedOnTrack(selectedTimelineClip, track.id)).map((track) => (
                          <option key={track.id} value={track.id}>
                            {track.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Start
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={Math.max(
                          0,
                          Number(selectedTimelineClip.end || 0) - TIMELINE_MIN_CLIP_SECONDS
                        )}
                        value={Number(selectedTimelineClip.start || 0).toFixed(1)}
                        onChange={(e) => {
                          const value = clampNumber(
                            Number(e.target.value),
                            0,
                            Math.max(0, Number(selectedTimelineClip.end || 0) - TIMELINE_MIN_CLIP_SECONDS)
                          );
                          updateTimelineClip(selectedTimelineClip.id, { start: value });
                        }}
                      />
                    </label>
                    <label>
                      End
                      <input
                        type="number"
                        step="0.1"
                        min={Math.min(
                          timelineDuration,
                          Number(selectedTimelineClip.start || 0) + TIMELINE_MIN_CLIP_SECONDS
                        )}
                        max={timelineDuration}
                        value={Number(selectedTimelineClip.end || 0).toFixed(1)}
                        onChange={(e) => {
                          const value = clampNumber(
                            Number(e.target.value),
                            Math.min(
                              timelineDuration,
                              Number(selectedTimelineClip.start || 0) + TIMELINE_MIN_CLIP_SECONDS
                            ),
                            timelineDuration
                          );
                          updateTimelineClip(selectedTimelineClip.id, { end: value });
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="studio-soft-btn"
                      onClick={() =>
                        seekVideoToTimelineSeconds(
                          (Number(selectedTimelineClip.start || 0) + Number(selectedTimelineClip.end || 0)) / 2
                        )
                      }
                    >
                      Jump to Clip
                    </button>

                    {selectedTimelineClip.type === "text" && (
                      <>
                        {!selectedTimelineClipIsShape && (
                          <label className="timeline-clip-wide">
                            Text
                            <input
                              type="text"
                              value={String(selectedTimelineClip.payload?.text || "")}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                  ...clip,
                                  label: value.length > 22 ? `${value.slice(0, 22)}...` : value || "Title",
                                  payload: {
                                    ...(clip.payload || {}),
                                    text: value
                                  }
                                }));
                              }}
                              placeholder="Add clip text"
                              maxLength={180}
                            />
                          </label>
                        )}
                        {selectedTimelineClipIsShape && (
                          <label>
                            Shape
                            <select
                              value={resolveTimelineShapeKind(selectedTimelineClip) || "rectangle"}
                              onChange={(e) =>
                                updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                  ...clip,
                                  label: e.target.value === "ellipse" ? "Ellipse Layer" : "Rectangle Layer",
                                  payload: {
                                    ...(clip.payload || {}),
                                    graphicShape: e.target.value,
                                    text: e.target.value === "ellipse" ? "Ellipse" : "Rectangle"
                                  }
                                }))
                              }
                            >
                              <option value="rectangle">Rectangle</option>
                              <option value="ellipse">Ellipse</option>
                            </select>
                          </label>
                        )}
                        <label>
                          {selectedTimelineClipIsShape ? "Size" : "Text Size"}
                          <input
                            type="number"
                            min={selectedTimelineClipIsShape ? 24 : 16}
                            max={selectedTimelineClipIsShape ? 240 : 128}
                            step="1"
                            value={Number(selectedTimelineClip.payload?.textSize || (selectedTimelineClipIsShape ? 84 : 34))}
                            onChange={(e) => {
                              const value = selectedTimelineClipIsShape
                                ? clampNumber(Number(e.target.value), 24, 240)
                                : clampNumber(Number(e.target.value), 16, 128);
                              updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                ...clip,
                                payload: {
                                  ...(clip.payload || {}),
                                  textSize: value
                                }
                              }));
                            }}
                          />
                        </label>
                        <label>
                          Opacity
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={Number(selectedTimelineClip.payload?.overlayOpacity || 70)}
                            onChange={(e) => {
                              const value = clampNumber(Number(e.target.value), 0, 100);
                              updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                ...clip,
                                payload: {
                                  ...(clip.payload || {}),
                                  overlayOpacity: value
                                }
                              }));
                            }}
                          />
                        </label>
                        <label>
                          Position
                          <select
                            value={String(selectedTimelineClip.payload?.textPosition || "bottom-center")}
                            onChange={(e) =>
                              updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                ...clip,
                                payload: {
                                  ...(clip.payload || {}),
                                  textPosition: e.target.value
                                }
                              }))
                            }
                          >
                            {POSITION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    {selectedTimelineClip.type === "sticker" && (
                      <>
                        <label>
                          Sticker
                          <select
                            value={String(selectedTimelineClip.payload?.sticker || "spark")}
                            onChange={(e) =>
                              updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                ...clip,
                                label:
                                  STICKER_OPTIONS.find((item) => item.value === e.target.value)?.label || "Sticker",
                                payload: {
                                  ...(clip.payload || {}),
                                  sticker: e.target.value
                                }
                              }))
                            }
                          >
                            {STICKER_OPTIONS.filter((item) => item.value !== "none").map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Size
                          <input
                            type="number"
                            min="34"
                            max="180"
                            step="1"
                            value={Number(selectedTimelineClip.payload?.stickerSize || 72)}
                            onChange={(e) => {
                              const value = clampNumber(Number(e.target.value), 34, 180);
                              updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                ...clip,
                                payload: {
                                  ...(clip.payload || {}),
                                  stickerSize: value
                                }
                              }));
                            }}
                          />
                        </label>
                        <label>
                          Position
                          <select
                            value={String(selectedTimelineClip.payload?.stickerPosition || "top-right")}
                            onChange={(e) =>
                              updateTimelineClip(selectedTimelineClip.id, (clip) => ({
                                ...clip,
                                payload: {
                                  ...(clip.payload || {}),
                                  stickerPosition: e.target.value
                                }
                              }))
                            }
                          >
                            {POSITION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}


              {activeVideoBottomPage === "publish" && (
                <>
            <div className="studio-heading studio-heading-secondary">
              <div>
                <h3>Publish Settings</h3>
                <p>Set who can watch, comment, remix, or download before you publish.</p>
              </div>
              <div className="studio-heading-actions">
                <button
                  type="button"
                  className={showPublishSettings ? "toggle-btn active" : "toggle-btn"}
                  onClick={() => setShowPublishSettings((prev) => !prev)}
                >
                  Publish settings {showPublishSettings ? "On" : "Off"}
                </button>
              </div>
            </div>

            {showPublishSettings ? (
              <>
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

                <div className="studio-public-settings-row">
                  <div className="studio-public-settings-copy">
                    <h4>Public settings</h4>
                    <p>
                      {isPublicAudience
                        ? "Toggle who can comment, remix, download, or auto-caption this post."
                        : "Public-only controls are hidden. Switch audience to Public to edit them."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={isPublicAudience && showPublicSettings ? "toggle-btn active" : "toggle-btn"}
                    onClick={togglePublicSettings}
                  >
                    {isPublicAudience
                      ? `Public options ${showPublicSettings ? "On" : "Off"}`
                      : "Switch to Public"}
                  </button>
                </div>

                {isPublicAudience && showPublicSettings ? (
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
                ) : (
                  <p className="studio-helper studio-public-settings-note">
                    {isPublicAudience
                      ? "Public options are currently hidden."
                      : "Public options are available only for a Public audience."}
                  </p>
                )}
              </>
            ) : (
              <p className="studio-helper studio-public-settings-note">
                Publish settings are hidden.
              </p>
            )}
                </>
              )}
          </div>
          </div>
        )}
        {!isVideoWorkspace && (
          <div className="upload-footer-bar">
            <button
              className={`upload-submit ${isVideoWorkspace ? "upload-submit-compact" : ""}`}
              onClick={upload}
              disabled={loading}
            >
              {loading ? "Uploading..." : "Upload Post"}
            </button>
          </div>
        )}

        <input
          ref={projectPickerInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={onProjectPickerChange}
        />

        {msg && <p className="upload-msg">{msg}</p>}
      </section>
    </div>
  );
}




