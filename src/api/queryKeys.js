const normalizeKeyPart = (value) => String(value ?? "").trim().toLowerCase();

export const feedPageQueryKey = () => ["feed-page"];

export const feedTimelineQueryKey = (feedUserKey = "") => ["feed", normalizeKeyPart(feedUserKey), "pages"];

export const anonymousFeedQueryKey = (feedUserKey = "") => ["feed", normalizeKeyPart(feedUserKey), "anonymous"];

export const feedCommentsQueryKey = (postId) => ["comments", String(postId ?? "").trim()];

export const profilePageQueryKey = (cacheKey = "") => ["profile-page", normalizeKeyPart(cacheKey)];

export const followConnectionsQueryKey = (username = "", kind = "") => [
  "follow-connections",
  normalizeKeyPart(username),
  normalizeKeyPart(kind)
];

export const followSearchQueryKey = (query = "", kind = "") => [
  "follow-search",
  normalizeKeyPart(query),
  normalizeKeyPart(kind)
];

export const notificationsPageQueryKey = () => ["notifications-page"];

export const adminNotificationsQueryKey = () => ["admin-notifications"];
