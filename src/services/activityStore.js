import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import { isStoryOwnedByIdentity, readArchivedStories, readStoryIdentity } from "./storyStorage";

const HIGHLIGHTS_STORAGE_KEY = "socialsea_highlights_v1";
const NOTIFICATIONS_CACHE_KEY = "socialsea_notifications_cache_v1";
const COMMENT_ACTIVITY_KEY = "socialsea_activity_comments_v1";
const REPOST_ACTIVITY_KEY = "socialsea_activity_reposts_v1";
const STICKER_ACTIVITY_KEY = "socialsea_activity_stickers_v1";
const REVIEW_ACTIVITY_KEY = "socialsea_activity_reviews_v1";
const RECENTLY_DELETED_KEY = "socialsea_activity_recently_deleted_v1";
const WATCH_HISTORY_KEY = "socialsea_activity_watch_history_v1";
const ACCOUNT_HISTORY_KEY = "socialsea_activity_account_history_v1";
const RECENT_SEARCHES_KEY = "socialsea_activity_recent_searches_v1";
const LINK_HISTORY_KEY = "socialsea_activity_link_history_v1";
const TIME_SPENT_KEY = "socialsea_activity_time_spent_v1";

const DEFAULT_LIMIT = 80;
const LONG_VIDEO_SECONDS = 90;

export const ACTIVITY_SECTIONS = {
  likes: { id: "likes", title: "Likes", description: "Posts and reels you liked", iconKey: "heart", emptyMessage: "Your likes will show up here." },
  comments: { id: "comments", title: "Comments", description: "Comments you've posted", iconKey: "message-circle", emptyMessage: "Your comments will show up here." },
  reposts: { id: "reposts", title: "Reposts", description: "Posts and reels you've shared", iconKey: "repeat", emptyMessage: "Anything you share will appear here." },
  tags: { id: "tags", title: "Tags", description: "Mentions and tag notifications", iconKey: "tag", emptyMessage: "Tags and mentions will show up here." },
  stickerResponses: { id: "stickerResponses", title: "Sticker responses", description: "Sticker replies you've sent", iconKey: "smile", emptyMessage: "Sticker responses will show up here." },
  reviews: { id: "reviews", title: "Reviews", description: "Reviews and ratings you've left", iconKey: "star", emptyMessage: "Reviews you leave will show up here." },
  recentlyDeleted: { id: "recentlyDeleted", title: "Recently deleted", description: "Content removed from your profile", iconKey: "trash", emptyMessage: "Deleted posts will show up here." },
  archived: { id: "archived", title: "Archived", description: "Archived posts and stories", iconKey: "archive", emptyMessage: "Archived posts and stories will show up here." },
  posts: { id: "posts", title: "Posts", description: "Content you've shared", iconKey: "grid", emptyMessage: "Your posts will show up here." },
  reels: { id: "reels", title: "Reels", description: "Short videos you've shared", iconKey: "play-circle", emptyMessage: "Your reels will show up here." },
  highlights: { id: "highlights", title: "Highlights", description: "Highlights saved on your profile", iconKey: "sparkles", emptyMessage: "Your highlights will show up here." },
  notInterested: { id: "notInterested", title: "Not interested", description: "Content and creators you've hidden", iconKey: "eye-off", emptyMessage: "Hidden content will show up here." },
  interested: { id: "interested", title: "Interested", description: "Things you've saved or liked", iconKey: "heart-plus", emptyMessage: "Liked, saved and watch later content will show up here." },
  timeSpent: { id: "timeSpent", title: "Time spent", description: "Where you're spending time in SocialSea", iconKey: "clock", emptyMessage: "Time spent will appear after you browse the app." },
  watchHistory: { id: "watchHistory", title: "Watch history", description: "Videos and reels you've watched", iconKey: "history", emptyMessage: "Watched videos will show up here." },
  accountHistory: { id: "accountHistory", title: "Account history", description: "Recent account and settings changes", iconKey: "shield", emptyMessage: "Account changes will show up here." },
  recentSearches: { id: "recentSearches", title: "Recent searches", description: "People, posts and jobs you've searched", iconKey: "search", emptyMessage: "Recent searches will show up here." },
  linkHistory: { id: "linkHistory", title: "Link History", description: "External links you've opened", iconKey: "link", emptyMessage: "External links you open will show up here." }
};

export const ACTIVITY_SECTION_GROUPS = [
  { id: "interactions", title: "Interactions", sectionIds: ["likes", "comments", "reposts", "tags", "stickerResponses", "reviews"] },
  { id: "removed", title: "Removed and archived content", sectionIds: ["recentlyDeleted", "archived"] },
  { id: "shared", title: "Content you shared", sectionIds: ["posts", "reels", "highlights"] },
  { id: "suggested", title: "Suggested content", sectionIds: ["notInterested", "interested"] },
  { id: "usage", title: "How you use SocialSea", sectionIds: ["timeSpent", "watchHistory", "accountHistory", "recentSearches", "linkHistory"] }
];

const normalizeString = (value) => String(value ?? "").trim();
const normalizeLower = (value) => normalizeString(value).toLowerCase();
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

const parseJson = (rawValue, fallback) => {
  try {
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
};

const readJson = (key, fallback = []) => parseJson(localStorage.getItem(key), fallback);

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore local storage errors
  }
};

const uniqueBy = (items, getKey) => {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    if (!item) return;
    const key = normalizeString(getKey ? getKey(item, index) : item?.id || index);
    if (!key || map.has(key)) return;
    map.set(key, item);
  });
  return Array.from(map.values());
};

const normalizeDisplayName = (value) => {
  const raw = normalizeString(value);
  if (!raw) return "User";
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const readIdList = (key) => {
  const parsed = readJson(key, []);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizeString(item)).filter(Boolean);
  }
  if (parsed && typeof parsed === "object") {
    return Object.keys(parsed).filter((item) => parsed[item]);
  }
  return [];
};

const readNotificationsCache = () => {
  const parsed = readJson(NOTIFICATIONS_CACHE_KEY, { items: [] });
  return Array.isArray(parsed?.items) ? parsed.items : [];
};

const isVideoUrl = (value) =>
  /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/i.test(normalizeString(value));

const resolveContentId = (item) =>
  normalizeString(item?.id ?? item?.postId ?? item?.reelId ?? item?.storyId ?? item?.archiveId);

const resolveContentTitle = (item) =>
  normalizeString(
    item?.description ||
      item?.content ||
      item?.caption ||
      item?.storyText ||
      item?.title ||
      item?.label ||
      item?.name
  ) || "Untitled post";

const resolveOwnerName = (item) =>
  normalizeDisplayName(
    item?.ownerName ||
      item?.username ||
      item?.user?.name ||
      item?.user?.username ||
      item?.user?.email ||
      item?.email ||
      item?.name
  );

const resolveMediaUrl = (item) => {
  const raw =
    item?.mediaUrl ||
    item?.contentUrl ||
    item?.videoUrl ||
    item?.imageUrl ||
    item?.coverUrl ||
    item?.url ||
    item?.fileUrl ||
    "";
  const value = normalizeString(raw);
  if (!value) return "";
  return value.startsWith("http") ? value : toApiUrl(value);
};

const isVideoContent = (item) => {
  const type = normalizeLower(item?.type || item?.mediaType || item?.contentType || item?.mimeType);
  if (type.includes("video")) return true;
  if (item?.reel === true || item?.isVideo === true || item?.isShortVideo === true) return true;
  return isVideoUrl(resolveMediaUrl(item));
};

const isLikelyReel = (item, source) => {
  if (source === "reels") return true;
  if (item?.reel === true || item?.isShortVideo === true) return true;
  const duration = Number(item?.durationSeconds || item?.duration || 0);
  return duration > 0 && duration <= LONG_VIDEO_SECONDS;
};

const buildContentRoute = (item, source = "feed") => {
  const id = resolveContentId(item);
  if (!id) return "/feed";
  if (source === "stories") return "/stories";
  if (source === "highlights") return "/profile/me";
  if (source === "reels" || isLikelyReel(item, source)) return `/reels?post=${encodeURIComponent(id)}`;
  if (source === "watch") return `/watch/${encodeURIComponent(id)}`;
  return isVideoContent(item) ? `/watch/${encodeURIComponent(id)}` : "/feed";
};

const buildContentEntry = (item, source = "feed", overrides = {}) => {
  if (!item) return null;
  const contentId = resolveContentId(item);
  return {
    id: overrides.id || contentId || createId(source),
    contentId,
    kind: overrides.kind || "content",
    title: overrides.title || resolveContentTitle(item),
    subtitle: overrides.subtitle || resolveOwnerName(item),
    description: overrides.description || "",
    createdAt: overrides.createdAt || item?.createdAt || item?.time || item?.timestamp || item?.requestedAt || item?.at || nowIso(),
    mediaUrl: overrides.mediaUrl || resolveMediaUrl(item),
    isVideo: typeof overrides.isVideo === "boolean" ? overrides.isVideo : isVideoContent(item),
    route: overrides.route || buildContentRoute(item, source),
    source,
    raw: item
  };
};

const buildSimpleEntry = (entry, kind = "event") => {
  if (!entry) return null;
  return {
    id: normalizeString(entry.id) || createId(kind),
    kind,
    title: normalizeString(entry.title) || normalizeString(entry.query) || "Untitled",
    subtitle: normalizeString(entry.subtitle || entry.source || ""),
    description: normalizeString(entry.description || entry.text || entry.url || ""),
    createdAt: entry.createdAt || nowIso(),
    mediaUrl: normalizeString(entry.mediaUrl || ""),
    isVideo: entry.isVideo === true,
    route: normalizeString(entry.route || ""),
    url: normalizeString(entry.url || ""),
    milliseconds: Number(entry.milliseconds || 0)
  };
};

const readHighlights = () => {
  const parsed = readJson(HIGHLIGHTS_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
};

const addRecentEntry = (storageKey, entry, { limit = DEFAULT_LIMIT, dedupeKey } = {}) => {
  const normalized = {
    ...entry,
    id: normalizeString(entry?.id) || createId(storageKey),
    createdAt: entry?.createdAt || nowIso()
  };
  const key = normalizeString(dedupeKey ? dedupeKey(normalized) : normalized.id);
  const current = readJson(storageKey, []);
  const filtered = (Array.isArray(current) ? current : []).filter((item) => {
    if (!item) return false;
    const currentKey = normalizeString(dedupeKey ? dedupeKey(item) : item.id);
    return currentKey !== key;
  });
  writeJson(storageKey, [normalized, ...filtered].slice(0, limit));
  return normalized;
};

const identityCandidates = (item) => {
  const values = [
    item?.id,
    item?.userId,
    item?.ownerId,
    item?.authorId,
    item?.profileId,
    item?.user?.id,
    item?.email,
    item?.user?.email,
    item?.ownerEmail,
    item?.username,
    item?.user?.username,
    item?.name,
    item?.user?.name
  ];
  return values.map(normalizeLower).filter(Boolean);
};

const isOwnedByIdentity = (item, identity) => {
  const candidates = identityCandidates(item);
  const me = [identity?.userId, identity?.email, identity?.username, identity?.name]
    .map(normalizeLower)
    .filter(Boolean);
  return me.some((value) => candidates.includes(value));
};

const normalizeNotification = (item) => {
  const message = normalizeString(item?.message || item?.text || item?.body || item?.title);
  if (!message) return null;
  const lower = message.toLowerCase();
  let actor = normalizeDisplayName(item?.actorName || item?.senderName || item?.user?.name || item?.actorEmail);
  if (!actor || actor === "User") {
    const match = message.match(/^(.+?)\s+(liked|commented|mentioned|tagged|started following|requested to follow)\b/i);
    if (match?.[1]) actor = normalizeDisplayName(match[1]);
  }
  return {
    id: normalizeString(item?.id) || createId("notification"),
    title: actor || "Notification",
    subtitle: lower.includes("mention") || lower.includes("tag") ? "Tags and mentions" : "Notification",
    description: message,
    createdAt: item?.createdAt || item?.time || item?.at || nowIso(),
    kind: "event"
  };
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const requestActivityData = async (url, fallback = []) => {
  try {
    const res = await api.get(url, { suppressAuthRedirect: true, timeout: 6000 });
    return ensureArray(res?.data);
  } catch {
    return fallback;
  }
};

export const readActivityIdentity = () => {
  const fromStories = readStoryIdentity();
  return {
    userId: normalizeString(fromStories?.userId || sessionStorage.getItem("userId") || localStorage.getItem("userId")),
    email: normalizeLower(fromStories?.email || sessionStorage.getItem("email") || localStorage.getItem("email")),
    username: normalizeLower(fromStories?.username || sessionStorage.getItem("username") || localStorage.getItem("username")),
    name: normalizeLower(fromStories?.name || sessionStorage.getItem("name") || localStorage.getItem("name"))
  };
};

export const resolveRouteLabel = (pathname) => {
  const value = normalizeString(pathname).split("?")[0].split("#")[0];
  if (!value || value === "/") return "Home";
  if (value.startsWith("/feed")) return "Feed";
  if (value.startsWith("/reels")) return "Reels";
  if (value.startsWith("/watch")) return "Watch";
  if (value.startsWith("/chat")) return "Chat";
  if (value.startsWith("/notifications")) return "Notifications";
  if (value.startsWith("/profile")) return "Profile";
  if (value.startsWith("/jobs")) return "Jobs";
  if (value.startsWith("/saved")) return "Saved";
  if (value.startsWith("/stories")) return "Stories";
  if (value.startsWith("/settings/activity")) return "Your activity";
  if (value.startsWith("/settings")) return "Settings";
  if (value.startsWith("/ambulance")) return "Ambulance";
  if (value.startsWith("/sos")) return "SOS";
  return value
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .map((part) => normalizeDisplayName(part))
    .join(" / ");
};

export const recordCommentActivity = ({ postId, text, item, source = "feed" }) => {
  const body = normalizeString(text);
  if (!body) return null;
  return addRecentEntry(COMMENT_ACTIVITY_KEY, {
    id: createId("comment"),
    title: resolveContentTitle(item || { id: postId }),
    subtitle: resolveOwnerName(item) || normalizeDisplayName(source),
    description: body,
    createdAt: nowIso(),
    mediaUrl: resolveMediaUrl(item),
    isVideo: isVideoContent(item),
    route: item ? buildContentRoute(item, source) : "",
    source
  });
};

export const recordRepostActivity = ({ item, source = "feed", via = "chat" }) =>
  addRecentEntry(
    REPOST_ACTIVITY_KEY,
    {
      id: `${normalizeString(resolveContentId(item)) || createId("repost")}:${via}`,
      title: resolveContentTitle(item),
      subtitle: `Shared via ${normalizeDisplayName(via)}`,
      description: resolveOwnerName(item),
      createdAt: nowIso(),
      mediaUrl: resolveMediaUrl(item),
      isVideo: isVideoContent(item),
      route: buildContentRoute(item, source),
      source
    },
    { dedupeKey: (entry) => `${normalizeString(entry?.id)}` }
  );

export const recordStickerResponse = ({ label, target, route = "", mediaUrl = "" }) =>
  addRecentEntry(STICKER_ACTIVITY_KEY, {
    id: createId("sticker"),
    title: normalizeString(label) || "Sticker response",
    subtitle: normalizeString(target) || "Chat",
    description: "Sent a sticker response",
    createdAt: nowIso(),
    mediaUrl,
    route
  });

export const recordReviewActivity = ({ title, description, route = "" }) =>
  addRecentEntry(REVIEW_ACTIVITY_KEY, {
    id: createId("review"),
    title: normalizeString(title) || "Review",
    subtitle: "Review",
    description: normalizeString(description),
    createdAt: nowIso(),
    route
  });

export const recordRecentlyDeleted = ({ item, source = "profile" }) => {
  if (!item) return null;
  return addRecentEntry(
    RECENTLY_DELETED_KEY,
    {
      id: `${normalizeString(resolveContentId(item)) || createId("deleted")}:${source}`,
      title: resolveContentTitle(item),
      subtitle: "Removed from profile",
      description: resolveOwnerName(item),
      createdAt: nowIso(),
      mediaUrl: resolveMediaUrl(item),
      isVideo: isVideoContent(item),
      route: buildContentRoute(item, source),
      source
    },
    { dedupeKey: (entry) => entry.id }
  );
};

export const recordWatchHistory = ({ item, source = "watch" }) => {
  if (!item) return null;
  const contentId = normalizeString(resolveContentId(item));
  return addRecentEntry(
    WATCH_HISTORY_KEY,
    {
      id: contentId || createId("watch"),
      title: resolveContentTitle(item),
      subtitle: resolveOwnerName(item),
      description: source === "reels" ? "Watched in Reels" : "Watched video",
      createdAt: nowIso(),
      mediaUrl: resolveMediaUrl(item),
      isVideo: true,
      route: buildContentRoute(item, source),
      source
    },
    { dedupeKey: (entry) => normalizeString(entry?.id) }
  );
};

export const recordSearchActivity = ({ query, source = "app", resultsCount }) => {
  const text = normalizeString(query);
  if (text.length < 2) return null;
  return addRecentEntry(
    RECENT_SEARCHES_KEY,
    {
      id: `${source}:${text.toLowerCase()}`,
      title: text,
      subtitle: normalizeDisplayName(source),
      description:
        typeof resultsCount === "number" && Number.isFinite(resultsCount)
          ? `${resultsCount} result${resultsCount === 1 ? "" : "s"}`
          : "Search",
      createdAt: nowIso(),
      source
    },
    { dedupeKey: (entry) => normalizeString(entry?.id) }
  );
};

export const recordExternalLinkActivity = ({ url, label = "", source = "" }) => {
  const normalizedUrl = normalizeString(url);
  if (!normalizedUrl || !/^https?:\/\//i.test(normalizedUrl)) return null;
  return addRecentEntry(
    LINK_HISTORY_KEY,
    {
      id: normalizedUrl,
      title: normalizeString(label) || new URL(normalizedUrl).hostname,
      subtitle: normalizeDisplayName(source || "External link"),
      description: normalizedUrl,
      createdAt: nowIso(),
      url: normalizedUrl,
      source
    },
    { dedupeKey: (entry) => normalizeString(entry?.id || entry?.url) }
  );
};

export const recordAccountHistoryEntry = ({ action, detail = "", source = "" }) => {
  const title = normalizeString(action);
  if (!title) return null;
  return addRecentEntry(ACCOUNT_HISTORY_KEY, {
    id: createId("account"),
    title,
    subtitle: normalizeDisplayName(source || "account"),
    description: normalizeString(detail),
    createdAt: nowIso(),
    source
  });
};

export const recordTimeSpent = ({ pathname, milliseconds }) => {
  const path = normalizeString(pathname).split("?")[0].split("#")[0];
  const ms = Math.round(Number(milliseconds) || 0);
  if (!path || ms < 1000) return;

  const current = readJson(TIME_SPENT_KEY, { totalMs: 0, routes: {}, sessions: [] });
  const routes = current?.routes && typeof current.routes === "object" ? { ...current.routes } : {};
  const prevRoute = routes[path] || {};
  const label = resolveRouteLabel(path);
  routes[path] = {
    label,
    milliseconds: Math.max(0, Number(prevRoute.milliseconds || 0) + ms),
    visits: Math.max(0, Number(prevRoute.visits || 0) + 1),
    lastSpentAt: nowIso()
  };

  const sessions = Array.isArray(current?.sessions) ? current.sessions : [];
  sessions.unshift({
    id: createId("time"),
    title: label,
    subtitle: path,
    description: `${ms}ms`,
    milliseconds: ms,
    createdAt: nowIso()
  });

  writeJson(TIME_SPENT_KEY, {
    totalMs: Math.max(0, Number(current?.totalMs || 0) + ms),
    routes,
    sessions: sessions.slice(0, DEFAULT_LIMIT)
  });
};

export const readTimeSpentSummary = () => {
  const current = readJson(TIME_SPENT_KEY, { totalMs: 0, routes: {}, sessions: [] });
  const routes = current?.routes && typeof current.routes === "object" ? current.routes : {};
  const items = Object.entries(routes)
    .map(([path, value]) => ({
      id: path,
      kind: "stat",
      title: normalizeString(value?.label) || resolveRouteLabel(path),
      subtitle: path,
      description: `${Number(value?.visits || 0)} visit${Number(value?.visits || 0) === 1 ? "" : "s"}`,
      createdAt: value?.lastSpentAt || nowIso(),
      milliseconds: Math.max(0, Number(value?.milliseconds || 0))
    }))
    .sort((a, b) => b.milliseconds - a.milliseconds);

  return {
    totalMs: Math.max(0, Number(current?.totalMs || 0)),
    items
  };
};

export const loadActivitySnapshot = async () => {
  const identity = readActivityIdentity();

  const [feedItems, reelItems, ownPosts, notificationsFromApi] = await Promise.all([
    requestActivityData("/api/feed"),
    requestActivityData("/api/reels"),
    requestActivityData("/api/profile/me/posts"),
    requestActivityData("/api/notifications", readNotificationsCache())
  ]);

  const feedEntries = feedItems.map((item) => buildContentEntry(item, "feed")).filter(Boolean);
  const reelEntries = reelItems.map((item) => buildContentEntry(item, "reels")).filter(Boolean);
  const ownPostEntries = ownPosts.map((item) => buildContentEntry(item, "profile")).filter(Boolean);

  const contentIndex = new Map();
  [...reelEntries, ...feedEntries, ...ownPostEntries].forEach((entry) => {
    const key = normalizeString(entry?.contentId || entry?.id);
    if (!key || contentIndex.has(key)) return;
    contentIndex.set(key, entry);
  });

  const fallbackContentEntry = (id, subtitle = "") => ({
    id: normalizeString(id) || createId("content"),
    contentId: normalizeString(id),
    kind: "content",
    title: `Post ${normalizeString(id) ? `#${normalizeString(id)}` : ""}`.trim(),
    subtitle: subtitle || "SocialSea",
    description: "",
    createdAt: nowIso(),
    mediaUrl: "",
    isVideo: false,
    route: "/feed"
  });

  const pickContentByIds = (ids, subtitle = "") =>
    uniqueBy(
      ids.map((id) => contentIndex.get(normalizeString(id)) || fallbackContentEntry(id, subtitle)),
      (item) => normalizeString(item?.contentId || item?.id)
    );

  const likedItems = pickContentByIds(readIdList("likedPostIds"), "Liked");
  const savedItems = pickContentByIds([...readIdList("savedPostIds"), ...readIdList("savedReelIds")], "Saved");
  const watchLaterItems = pickContentByIds(readIdList("watchLaterPostIds"), "Watch later");
  const archivedPostItems = pickContentByIds(readIdList("archivedPostIds"), "Archived post");
  const interestedItems = uniqueBy([...likedItems, ...savedItems, ...watchLaterItems], (item) => normalizeString(item?.contentId || item?.id));

  const hiddenItems = pickContentByIds(readIdList("feedHiddenPostIds"), "Hidden");
  const blockedOwnerItems = readJson("feedBlockedOwnerKeys", [])
    .map((value, index) => ({
      id: `blocked-owner-${index}-${normalizeString(value)}`,
      kind: "event",
      title: normalizeDisplayName(value),
      subtitle: "Creator hidden",
      description: "You asked SocialSea not to recommend this creator.",
      createdAt: nowIso()
    }))
    .filter((item) => normalizeString(item?.title));

  const archivedStories = readArchivedStories()
    .filter((story) => isStoryOwnedByIdentity(story, identity))
    .map((story) =>
      buildContentEntry(
        {
          ...story,
          description: story?.caption || story?.storyText || "Archived story",
          username: story?.username || story?.name || story?.email
        },
        "stories",
        { subtitle: "Archived story" }
      )
    )
    .filter(Boolean);

  const highlights = readHighlights()
    .map((highlight) => {
      const firstItem = Array.isArray(highlight?.items) ? highlight.items[0] : null;
      return buildContentEntry(
        {
          ...firstItem,
          id: highlight?.id,
          title: highlight?.title,
          coverUrl: highlight?.coverUrl,
          description: highlight?.title
        },
        "highlights",
        {
          title: normalizeString(highlight?.title) || "Highlight",
          subtitle: `${Array.isArray(highlight?.items) ? highlight.items.length : 0} item${Array.isArray(highlight?.items) && highlight.items.length === 1 ? "" : "s"}`,
          createdAt: highlight?.createdAt || nowIso()
        }
      );
    })
    .filter(Boolean);

  const ownReels = uniqueBy(reelEntries.filter((entry) => isOwnedByIdentity(entry?.raw, identity)), (entry) => normalizeString(entry?.contentId || entry?.id));
  const ownReelIds = new Set(ownReels.map((entry) => normalizeString(entry?.contentId || entry?.id)));
  const candidateOwnPosts = uniqueBy([...ownPostEntries, ...feedEntries.filter((entry) => isOwnedByIdentity(entry?.raw, identity))], (entry) => normalizeString(entry?.contentId || entry?.id));
  const ownPostsOnly = candidateOwnPosts.filter((entry) => !ownReelIds.has(normalizeString(entry?.contentId || entry?.id)));

  const normalizedNotifications = ensureArray(notificationsFromApi).map(normalizeNotification).filter(Boolean);
  const tagItems = normalizedNotifications.filter((item) => {
    const haystack = `${normalizeLower(item?.title)} ${normalizeLower(item?.description)}`;
    return haystack.includes("mention") || haystack.includes("tag");
  });

  const timeSpent = readTimeSpentSummary();
  const commentHistory = readJson(COMMENT_ACTIVITY_KEY, []);
  const repostHistory = readJson(REPOST_ACTIVITY_KEY, []);
  const stickerHistory = readJson(STICKER_ACTIVITY_KEY, []);
  const reviewHistory = readJson(REVIEW_ACTIVITY_KEY, []);
  const deletedHistory = readJson(RECENTLY_DELETED_KEY, []);
  const watchHistory = readJson(WATCH_HISTORY_KEY, []);
  const accountHistory = readJson(ACCOUNT_HISTORY_KEY, []);
  const searchHistory = readJson(RECENT_SEARCHES_KEY, []);
  const linkHistory = readJson(LINK_HISTORY_KEY, []);

  return {
    identity,
    loadedAt: nowIso(),
    sections: {
      likes: { ...ACTIVITY_SECTIONS.likes, items: likedItems, count: likedItems.length },
      comments: { ...ACTIVITY_SECTIONS.comments, items: commentHistory.map((item) => buildSimpleEntry(item, "event")).filter(Boolean), count: commentHistory.length },
      reposts: { ...ACTIVITY_SECTIONS.reposts, items: repostHistory.map((item) => buildSimpleEntry(item, "event")).filter(Boolean), count: repostHistory.length },
      tags: { ...ACTIVITY_SECTIONS.tags, items: tagItems, count: tagItems.length },
      stickerResponses: { ...ACTIVITY_SECTIONS.stickerResponses, items: stickerHistory.map((item) => buildSimpleEntry(item, "event")).filter(Boolean), count: stickerHistory.length },
      reviews: { ...ACTIVITY_SECTIONS.reviews, items: reviewHistory.map((item) => buildSimpleEntry(item, "event")).filter(Boolean), count: reviewHistory.length },
      recentlyDeleted: { ...ACTIVITY_SECTIONS.recentlyDeleted, items: deletedHistory.map((item) => buildSimpleEntry(item, item?.mediaUrl ? "content" : "event")).filter(Boolean), count: deletedHistory.length },
      archived: { ...ACTIVITY_SECTIONS.archived, items: uniqueBy([...archivedPostItems, ...archivedStories], (item) => normalizeString(item?.id || item?.contentId)), count: archivedPostItems.length + archivedStories.length },
      posts: { ...ACTIVITY_SECTIONS.posts, items: ownPostsOnly, count: ownPostsOnly.length },
      reels: { ...ACTIVITY_SECTIONS.reels, items: ownReels, count: ownReels.length },
      highlights: { ...ACTIVITY_SECTIONS.highlights, items: highlights, count: highlights.length },
      notInterested: { ...ACTIVITY_SECTIONS.notInterested, items: [...hiddenItems, ...blockedOwnerItems], count: hiddenItems.length + blockedOwnerItems.length },
      interested: { ...ACTIVITY_SECTIONS.interested, items: interestedItems, count: interestedItems.length },
      timeSpent: { ...ACTIVITY_SECTIONS.timeSpent, items: timeSpent.items, count: timeSpent.items.length, summaryValue: timeSpent.totalMs },
      watchHistory: { ...ACTIVITY_SECTIONS.watchHistory, items: watchHistory.map((item) => buildSimpleEntry(item, item?.mediaUrl ? "content" : "event")).filter(Boolean), count: watchHistory.length },
      accountHistory: { ...ACTIVITY_SECTIONS.accountHistory, items: accountHistory.map((item) => buildSimpleEntry(item, "event")).filter(Boolean), count: accountHistory.length },
      recentSearches: { ...ACTIVITY_SECTIONS.recentSearches, items: searchHistory.map((item) => buildSimpleEntry(item, "event")).filter(Boolean), count: searchHistory.length },
      linkHistory: { ...ACTIVITY_SECTIONS.linkHistory, items: linkHistory.map((item) => buildSimpleEntry(item, "event")).filter(Boolean), count: linkHistory.length }
    }
  };
};
