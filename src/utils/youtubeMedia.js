const YT_ID_REGEX = /^[A-Za-z0-9_-]{6,}$/;
const YT_WATCH_ID_REGEX = /[?&]v=([A-Za-z0-9_-]{6,})/i;
const YT_SHORTS_ID_REGEX = /\/shorts\/([A-Za-z0-9_-]{6,})/i;
const YT_BE_ID_REGEX = /youtu\.be\/([A-Za-z0-9_-]{6,})/i;
const YT_EMBED_ID_REGEX = /\/embed\/([A-Za-z0-9_-]{6,})/i;

const asText = (value) => String(value || "").trim();

export const extractYouTubeVideoId = (input) => {
  const text = asText(input);
  if (!text) return "";

  if (!text.includes("http") && YT_ID_REGEX.test(text)) return text;

  const candidates = [YT_WATCH_ID_REGEX, YT_SHORTS_ID_REGEX, YT_BE_ID_REGEX, YT_EMBED_ID_REGEX];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
};

export const isYouTubeMedia = (itemOrUrl) => {
  if (!itemOrUrl) return false;

  const playbackType = asText(itemOrUrl?.playbackType).toUpperCase();
  if (playbackType.includes("YOUTUBE")) return true;

  const source = asText(itemOrUrl?.source || itemOrUrl?.sourceType).toUpperCase();
  if (source.includes("YOUTUBE")) return true;

  if (asText(itemOrUrl?.youtubeVideoId)) return true;

  const url = asText(
    itemOrUrl?.embedUrl ||
      itemOrUrl?.watchUrl ||
      itemOrUrl?.contentUrl ||
      itemOrUrl?.mediaUrl ||
      itemOrUrl?.videoUrl ||
      itemOrUrl
  ).toLowerCase();

  return url.includes("youtube.com/") || url.includes("youtu.be/");
};

export const youTubeEmbedUrlFor = (
  itemOrUrl,
  { autoplay = false, mute = false, loop = false, controls = true, enableJsApi = false } = {}
) => {
  const id = extractYouTubeVideoId(
    itemOrUrl?.embedUrl ||
      itemOrUrl?.watchUrl ||
      itemOrUrl?.contentUrl ||
      itemOrUrl?.mediaUrl ||
      itemOrUrl?.videoUrl ||
      itemOrUrl?.youtubeVideoId ||
      itemOrUrl
  );
  if (!id) return "";

  const params = new URLSearchParams();
  params.set("rel", "0");
  params.set("modestbranding", "1");
  params.set("playsinline", "1");
  params.set("autoplay", autoplay ? "1" : "0");
  params.set("mute", mute ? "1" : "0");
  params.set("controls", controls ? "1" : "0");
  params.set("iv_load_policy", "3");
  params.set("fs", "0");
  params.set("disablekb", "1");
  if (loop) {
    params.set("loop", "1");
    params.set("playlist", id);
  }
  if (enableJsApi) {
    params.set("enablejsapi", "1");
  }

  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
};

export const youTubeThumbnailUrlFor = (itemOrUrl) => {
  const id = extractYouTubeVideoId(
    itemOrUrl?.thumbnailUrl ||
      itemOrUrl?.posterUrl ||
      itemOrUrl?.thumbUrl ||
      itemOrUrl?.thumbnail ||
      itemOrUrl?.poster ||
      itemOrUrl?.embedUrl ||
      itemOrUrl?.watchUrl ||
      itemOrUrl?.contentUrl ||
      itemOrUrl?.mediaUrl ||
      itemOrUrl?.videoUrl ||
      itemOrUrl?.youtubeVideoId ||
      itemOrUrl
  );
  if (!id) return "";
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
};

export const posterUrlFor = (item) => {
  const candidate = asText(
    item?.posterUrl ||
      item?.thumbnailUrl ||
      item?.thumbUrl ||
      item?.thumbnail ||
      item?.poster ||
      item?.previewUrl ||
      item?.preview ||
      ""
  );
  return candidate || youTubeThumbnailUrlFor(item);
};

