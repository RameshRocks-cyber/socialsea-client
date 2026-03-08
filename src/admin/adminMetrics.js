const NOTICE_STORAGE_KEY = "adminModerationNotices";

export const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const formatCompact = (value) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(toNumber(value));

export const formatDateTime = (value) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

export const emailToName = (email) => {
  const raw = String(email || "").split("@")[0].trim();
  if (!raw) return "User";
  return raw
    .replace(/\d+$/g, "")
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const getUserDisplayName = (user) =>
  user?.name || emailToName(user?.email) || user?.username || `User ${user?.id || ""}`.trim();

export const getPostOwner = (post) =>
  post?.username || post?.user?.name || emailToName(post?.email || post?.user?.email) || "Unknown";

export const getPostType = (post) => {
  const explicit = String(post?.type || "").toUpperCase();
  if (explicit) return explicit;
  return post?.reel ? "VIDEO" : "IMAGE";
};

const readCounter = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (Array.isArray(value)) return value.length;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

export const getPostLikes = (post) =>
  readCounter(post, ["likesCount", "likeCount", "likes", "totalLikes", "likedByCount"]);

export const getPostViews = (post) =>
  readCounter(post, ["viewsCount", "viewCount", "views", "plays", "playCount", "watchCount", "impressions"]);

export const getPostComments = (post) =>
  readCounter(post, ["commentsCount", "commentCount", "comments", "totalComments"]);

export const getCreatedAt = (entity) =>
  entity?.createdAt || entity?.createdDate || entity?.time || entity?.timestamp || entity?.at || null;

export const buildGrowthEstimate = (points) => {
  if (!Array.isArray(points) || points.length < 2) {
    return { trend: "Stable", deltaPct: 0, nextValue: 0, dailyAverage: 0 };
  }

  const ordered = [...points]
    .map((item) => ({ label: item.label, value: toNumber(item.value) }))
    .filter((item) => item.label)
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));

  if (ordered.length < 2) {
    return { trend: "Stable", deltaPct: 0, nextValue: ordered[0]?.value || 0, dailyAverage: 0 };
  }

  const first = ordered[0].value;
  const last = ordered[ordered.length - 1].value;
  const deltas = [];
  for (let i = 1; i < ordered.length; i += 1) {
    deltas.push(ordered[i].value - ordered[i - 1].value);
  }

  const dailyAverage = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const deltaPct = first > 0 ? ((last - first) / first) * 100 : last > 0 ? 100 : 0;
  const nextValue = Math.max(0, Math.round(last + dailyAverage));
  const trend = dailyAverage > 0.5 ? "Growing" : dailyAverage < -0.5 ? "Falling" : "Stable";

  return {
    trend,
    deltaPct,
    nextValue,
    dailyAverage
  };
};

export const loadModerationNotices = () => {
  try {
    const raw = localStorage.getItem(NOTICE_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveModerationNotice = (notice) => {
  const next = [notice, ...loadModerationNotices()].slice(0, 300);
  localStorage.setItem(NOTICE_STORAGE_KEY, JSON.stringify(next));
  return next;
};
