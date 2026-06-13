import { toApiUrl } from "../api/baseUrl";

const isPlaceholderMediaToken = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  if (
    lower === "null" ||
    lower === "undefined" ||
    lower === "none" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "nan"
  ) {
    return true;
  }
  const compact = raw.replace(/\s+/g, "");
  if (!/[/:.#?]/.test(raw) && /^[a-z]{1,2}$/i.test(compact)) {
    return true;
  }
  const withoutHost = raw.replace(/^https?:\/\/[^/]+/i, "");
  const cleanPath = withoutHost.split(/[?#]/)[0] || "";
  if (/^\/?api\/[a-z]{1,2}$/i.test(cleanPath)) return true;
  if (/^\/?[a-z]{1,2}$/i.test(cleanPath)) return true;
  return false;
};

export const resolveMediaUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw || isPlaceholderMediaToken(raw)) return "";
  if (/^(blob:|data:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return toApiUrl(raw);
};

const CLOUDINARY_IMAGE_MARKER = "/image/upload/";
const CLOUDINARY_THUMBNAIL_TRANSFORM = "c_fill,g_auto,w_480,h_480,f_auto,q_auto";
const CLOUDINARY_MEDIUM_TRANSFORM = "c_limit,w_1280,f_auto,q_auto";

function splitUrlSuffix(value) {
  const raw = String(value || "").trim();
  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");
  const suffixIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);

  return {
    base: suffixIndex >= 0 ? raw.slice(0, suffixIndex) : raw,
    suffix: suffixIndex >= 0 ? raw.slice(suffixIndex) : ""
  };
}

function applyCloudinaryTransform(mediaUrl, transformation) {
  if (!mediaUrl || !transformation) return mediaUrl;
  const markerIndex = mediaUrl.indexOf(CLOUDINARY_IMAGE_MARKER);
  if (markerIndex < 0) return mediaUrl;

  const { base, suffix } = splitUrlSuffix(mediaUrl);
  const prefix = base.substring(0, markerIndex + CLOUDINARY_IMAGE_MARKER.length);
  const rest = base.substring(markerIndex + CLOUDINARY_IMAGE_MARKER.length);
  if (!rest) return mediaUrl;

  const transformedRest = rest.startsWith(`${transformation}/`) ? rest : `${transformation}/${rest}`;
  return `${prefix}${transformedRest}${suffix}`;
}

export function resolveImageVariantUrl(value, variant = "thumbnail") {
  const resolved = resolveMediaUrl(value);
  if (!resolved) return "";
  if (/^(blob:|data:)/i.test(resolved)) return resolved;

  const normalizedVariant = String(variant || "thumbnail").trim().toLowerCase();
  if (normalizedVariant === "original" || normalizedVariant === "full" || normalizedVariant === "source") {
    return resolved;
  }

  const transformation =
    normalizedVariant === "medium"
      ? CLOUDINARY_MEDIUM_TRANSFORM
      : CLOUDINARY_THUMBNAIL_TRANSFORM;

  return resolved.includes(CLOUDINARY_IMAGE_MARKER)
    ? applyCloudinaryTransform(resolved, transformation)
    : resolved;
}

export function resolvePostImageUrl(post, variant = "thumbnail") {
  const normalizedVariant = String(variant || "thumbnail").trim().toLowerCase();
  const candidates =
    normalizedVariant === "medium"
      ? [
          { value: post?.mediumUrl, transform: false },
          { value: post?.thumbnailUrl, transform: false },
          { value: post?.thumbUrl, transform: false },
          { value: post?.posterUrl, transform: false },
          { value: post?.coverImageUrl, transform: true },
          { value: post?.coverImage, transform: true },
          { value: post?.imageUrl, transform: true },
          { value: post?.mediaUrl, transform: true },
          { value: post?.contentUrl, transform: true }
        ]
      : normalizedVariant === "original"
        ? [
            { value: post?.contentUrl, transform: false },
            { value: post?.mediaUrl, transform: false },
            { value: post?.imageUrl, transform: false },
            { value: post?.coverImageUrl, transform: false },
            { value: post?.coverImage, transform: false },
            { value: post?.posterUrl, transform: false },
            { value: post?.thumbnailUrl, transform: false }
          ]
        : [
            { value: post?.thumbnailUrl, transform: false },
            { value: post?.thumbUrl, transform: false },
            { value: post?.posterUrl, transform: false },
            { value: post?.coverImageUrl, transform: true },
            { value: post?.coverImage, transform: true },
            { value: post?.imageUrl, transform: true },
            { value: post?.mediumUrl, transform: false },
            { value: post?.mediaUrl, transform: true },
            { value: post?.contentUrl, transform: true }
          ];

  for (const candidate of candidates) {
    const source = String(candidate?.value || "").trim();
    if (!source) continue;
    const resolved = candidate.transform
      ? resolveImageVariantUrl(source, normalizedVariant)
      : resolveMediaUrl(source);
    if (resolved) return resolved;
  }
  return "";
}
