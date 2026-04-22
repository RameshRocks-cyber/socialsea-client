export const SHORT_VIDEO_SECONDS = 90;

const VIDEO_FILE_EXT_REGEX = /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/i;
const IMAGE_FILE_EXT_REGEX = /\.(png|jpe?g|gif|webp|bmp|avif|svg|heic|heif)(\?|#|$)/i;

const asText = (value) => String(value || "").trim();
const asLower = (value) => asText(value).toLowerCase();

const parseClockDuration = (raw) => {
  const text = asText(raw);
  if (!text.includes(":")) return 0;
  const parts = text
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return 0;
  if (parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return 0;
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return 0;
  if (values.length === 3) {
    return values[0] * 3600 + values[1] * 60 + values[2];
  }
  return values[0] * 60 + values[1];
};

const isTruthyFlag = (value) => {
  if (value === true || value === 1) return true;
  const raw = asLower(value);
  return raw === "true" || raw === "1" || raw === "yes";
};

const toDurationSeconds = (raw) => {
  if (typeof raw === "string") {
    const clockSeconds = parseClockDuration(raw);
    if (clockSeconds > 0) return clockSeconds;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Some APIs send duration in milliseconds.
  return n > 10000 ? n / 1000 : n;
};

const readDurationCandidates = (post) => [
  post?.durationSeconds,
  post?.durationInSeconds,
  post?.videoDurationSeconds,
  post?.videoDurationInSeconds,
  post?.duration,
  post?.durationSec,
  post?.videoDuration,
  post?.length,
  post?.lengthSeconds,
  post?.videoLength,
  post?.videoLengthSeconds,
  post?.durationMs,
  post?.videoDurationMs,
  post?.runtime,
  post?.runtimeSeconds,
  post?.durationLabel,
  post?.videoDurationLabel
];

export const readDurationSeconds = (post, durationHint = 0) => {
  const hint = toDurationSeconds(durationHint);
  if (hint > 0) return hint;
  const candidates = readDurationCandidates(post);
  for (const raw of candidates) {
    const seconds = toDurationSeconds(raw);
    if (seconds > 0) return seconds;
  }
  return 0;
};

export const mediaTypeForPost = (post) => {
  const rawType = asLower(post?.type || post?.mediaType || post?.contentType || post?.mimeType || "");
  if (rawType.includes("video")) return "VIDEO";
  if (rawType.includes("image")) return "IMAGE";

  const mediaUrl = asLower(post?.contentUrl || post?.mediaUrl || post?.videoUrl || post?.url || post?.fileUrl || "");
  if (VIDEO_FILE_EXT_REGEX.test(mediaUrl)) return "VIDEO";
  if (IMAGE_FILE_EXT_REGEX.test(mediaUrl)) return "IMAGE";

  if (isTruthyFlag(post?.reel) || isTruthyFlag(post?.isReel)) return "VIDEO";
  return "IMAGE";
};

export const isExplicitReelPost = (post) => {
  if (isTruthyFlag(post?.reel) || isTruthyFlag(post?.isReel)) return true;

  const sourceType = asLower(post?.sourceType || post?.source || "");
  if (sourceType.includes("reel")) return true;

  const rawType = asLower(post?.type || post?.mediaType || post?.contentType || post?.mimeType || "");
  return rawType.includes("reel");
};

export const isExplicitShortPost = (post) => {
  if (isExplicitReelPost(post)) return false;
  if (isTruthyFlag(post?.isShortVideo) || isTruthyFlag(post?.isShort)) return true;
  if (isTruthyFlag(post?.shortVideo) || isTruthyFlag(post?.short)) return true;

  const rawType = asLower(post?.type || post?.mediaType || post?.contentType || post?.mimeType || "");
  return rawType.includes("short");
};

export const classifyVideoBucket = (
  post,
  { durationHint = 0, shortSeconds = SHORT_VIDEO_SECONDS, defaultUnknown = "long", sourceHint = "" } = {}
) => {
  if (mediaTypeForPost(post) !== "VIDEO") return "non-video";

  const duration = readDurationSeconds(post, durationHint);
  if (duration > shortSeconds) return "long";
  if (isExplicitReelPost(post, sourceHint)) return "reel";
  if (isExplicitShortPost(post)) return "short";
  if (duration > 0) return "short";
  return defaultUnknown === "short" ? "short" : "long";
};
