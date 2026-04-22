import { mediaTypeForPost } from "./videoFeedClassifier";

export const FEED_PERSONALIZATION_VERSION = 1;
export const FEED_PERSONALIZATION_KEY_PREFIX = "socialsea_feed_personalization_v1";
export const FEED_SIGNAL_WEIGHTS = {
  view: 1.0,
  watch: 1.4,
  like: 3.5,
  share: 1.6,
  comment: 2.2,
};
export const FEED_WATCH_TIME_CHUNK_SECONDS = 12;
export const FEED_WATCH_TIME_CHUNK_WEIGHT = 0.32;
export const FEED_WATCH_TIME_MAX_CHUNKS_PER_POST = 30;
export const FEED_WATCH_TIME_MAX_STEP_SECONDS = 3;
export const FEED_WATCH_PROGRESS_MILESTONES = [
  { ratio: 0.35, weight: 0.7 },
  { ratio: 0.6, weight: 1.05 },
  { ratio: 0.85, weight: 1.45 },
  { ratio: 0.98, weight: 2.1 },
];

const PERSONALIZATION_MAX_TOKENS = 260;
const PERSONALIZATION_MAX_POSTS = 320;
const FEED_CATEGORY_KEYWORDS = {
  general: ["general", "daily", "random", "topic"],
  study: ["study", "biology", "zoology", "math", "physics", "chemistry", "education"],
  entertainment: ["entertainment", "fun", "show", "series", "celebrity"],
  social: ["social", "community", "people", "friends", "public"],
  news: ["news", "update", "breaking", "headline", "report"],
  music: ["music", "song", "audio", "album", "lyrics", "singer", "melody"],
  mixes: ["mix", "mixes", "remix", "mashup", "medley", "dj"],
  live: ["live", "livestream", "live stream", "streaming", "stream"],
  comedy: ["comedy", "funny", "joke", "memes", "laugh", "standup"],
  movies: ["movie", "movies", "cinema", "film", "trailer", "scene"],
  gaming: ["games", "physical game", "sport", "sports", "cricket", "football", "badminton", "basketball"],
  trending: ["trending", "viral", "popular", "hot", "trend"],
};

const parseMaybeJson = (value) => {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || (raw[0] !== "{" && raw[0] !== "[")) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const normalizeGenre = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

const trimWeightMap = (input, limit) => {
  const entries = Object.entries(input || {})
    .map(([key, value]) => [String(key || "").trim(), Number(value)])
    .filter(([key, value]) => key && Number.isFinite(value) && Math.abs(value) > 0.0001);
  if (entries.length <= limit) return Object.fromEntries(entries);
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return Object.fromEntries(entries.slice(0, limit));
};

const createDefaultPersonalizationState = (userKey = "guest") => ({
  version: FEED_PERSONALIZATION_VERSION,
  userKey,
  updatedAt: 0,
  tokenWeights: {},
  postWeights: {},
});

export const resolveFeedUserKey = () => {
  try {
    const userId =
      localStorage.getItem("userId") ||
      sessionStorage.getItem("userId") ||
      localStorage.getItem("username") ||
      sessionStorage.getItem("username");
    const normalized = String(userId || "").trim();
    return normalized || "guest";
  } catch {
    return "guest";
  }
};

const personalizationStorageKeyForUser = (userKey) =>
  `${FEED_PERSONALIZATION_KEY_PREFIX}:${String(userKey || "guest").trim() || "guest"}`;

export const readFeedPersonalizationState = (userKey) => {
  const resolvedUserKey = String(userKey || resolveFeedUserKey()).trim() || "guest";
  const fallback = createDefaultPersonalizationState(resolvedUserKey);
  try {
    const raw = localStorage.getItem(personalizationStorageKeyForUser(resolvedUserKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      version: FEED_PERSONALIZATION_VERSION,
      userKey: resolvedUserKey,
      updatedAt: Number(parsed.updatedAt) || 0,
      tokenWeights: trimWeightMap(parsed.tokenWeights || {}, PERSONALIZATION_MAX_TOKENS),
      postWeights: trimWeightMap(parsed.postWeights || {}, PERSONALIZATION_MAX_POSTS),
    };
  } catch {
    return fallback;
  }
};

export const persistFeedPersonalizationState = (userKey, state) => {
  const resolvedUserKey = String(userKey || resolveFeedUserKey()).trim() || "guest";
  try {
    const payload = {
      version: FEED_PERSONALIZATION_VERSION,
      userKey: resolvedUserKey,
      updatedAt: Number(state?.updatedAt) || Date.now(),
      tokenWeights: trimWeightMap(state?.tokenWeights || {}, PERSONALIZATION_MAX_TOKENS),
      postWeights: trimWeightMap(state?.postWeights || {}, PERSONALIZATION_MAX_POSTS),
    };
    localStorage.setItem(personalizationStorageKeyForUser(resolvedUserKey), JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
};

export const collectPersonalizationTokens = (post, localGenreMap = null) => {
  const tokens = new Set();
  const add = (value) => {
    const normalized = normalizeGenre(value);
    if (normalized) tokens.add(normalized);
  };
  const addMany = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((entry) => add(entry));
  };

  add(post?.category);
  add(post?.genre);
  add(post?.videoCategory);
  add(post?.contentCategory);
  add(post?.postCategory);
  add(post?.creatorCategory);
  add(post?.user?.category);
  add(post?.sourceType);
  add(localGenreMap?.[String(post?.id || "")]);
  addMany(post?.tags);
  addMany(post?.hashtags);

  const settings =
    parseMaybeJson(post?.videoSettings) ||
    parseMaybeJson(post?.settings) ||
    parseMaybeJson(post?.metadata);
  if (settings && typeof settings === "object") {
    add(settings?.category);
    add(settings?.genre);
    addMany(settings?.tags);
    if (settings?.creatorSettings && typeof settings.creatorSettings === "object") {
      add(settings.creatorSettings.category);
      add(settings.creatorSettings.genre);
      addMany(settings.creatorSettings.tags);
    }
  }

  const mediaType = String(mediaTypeForPost(post) || "").trim().toLowerCase();
  if (mediaType) tokens.add(mediaType);

  const searchable = `${post?.description || ""} ${post?.content || ""} ${post?.title || ""}`.toLowerCase();
  Object.entries(FEED_CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    if (keywords.some((word) => searchable.includes(String(word || "").toLowerCase()))) {
      tokens.add(category);
    }
  });

  return Array.from(tokens).filter(Boolean);
};

export const trackFeedPersonalizationSignal = ({
  state,
  userKey,
  post,
  signal = "view",
  customWeight = null,
  localGenreMap = null,
  extraTokens = [],
} = {}) => {
  if (!post?.id) return state;

  const resolvedUserKey = String(userKey || resolveFeedUserKey()).trim() || "guest";
  const baseWeight = Number(FEED_SIGNAL_WEIGHTS[signal] || FEED_SIGNAL_WEIGHTS.view || 1);
  const overrideWeight = Number(customWeight);
  const weight = Number.isFinite(overrideWeight) ? overrideWeight : baseWeight;
  if (!Number.isFinite(weight) || weight === 0) return state;

  const previous =
    state && typeof state === "object"
      ? {
          version: FEED_PERSONALIZATION_VERSION,
          userKey: resolvedUserKey,
          updatedAt: Number(state.updatedAt) || 0,
          tokenWeights: trimWeightMap(state.tokenWeights || {}, PERSONALIZATION_MAX_TOKENS),
          postWeights: trimWeightMap(state.postWeights || {}, PERSONALIZATION_MAX_POSTS),
        }
      : readFeedPersonalizationState(resolvedUserKey);

  const postId = String(post.id);
  const nextTokenWeights = { ...(previous.tokenWeights || {}) };
  const nextPostWeights = { ...(previous.postWeights || {}) };
  const tokens = collectPersonalizationTokens(post, localGenreMap);
  if (Array.isArray(extraTokens)) {
    extraTokens.forEach((token) => {
      const normalized = normalizeGenre(token);
      if (normalized) tokens.push(normalized);
    });
  }

  tokens.forEach((token) => {
    const key = normalizeGenre(token);
    if (!key) return;
    const prevWeight = Number(nextTokenWeights[key] || 0);
    nextTokenWeights[key] = Math.max(-500, Math.min(500, prevWeight + weight));
  });

  const prevPostWeight = Number(nextPostWeights[postId] || 0);
  nextPostWeights[postId] = Math.max(-500, Math.min(500, prevPostWeight + weight * 1.25));

  const nextState = {
    version: FEED_PERSONALIZATION_VERSION,
    userKey: resolvedUserKey,
    updatedAt: Date.now(),
    tokenWeights: trimWeightMap(nextTokenWeights, PERSONALIZATION_MAX_TOKENS),
    postWeights: trimWeightMap(nextPostWeights, PERSONALIZATION_MAX_POSTS),
  };
  persistFeedPersonalizationState(resolvedUserKey, nextState);
  return nextState;
};
