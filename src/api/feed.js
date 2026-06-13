import api from "./axios";

export const DEFAULT_FEED_PAGE_SIZE = 20;

export const getFeed = () => {
  return api.get("/api/feed");
};

export const getAnonymousFeed = () => {
  return api.get("/api/feed/anonymous");
};

export const unwrapFeedList = (value) => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.content)) return value.content;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.posts)) return value.posts;
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.list)) return value.list;
  return [];
};

export const normalizeFeedPage = (value, fallbackPage = 0, fallbackSize = 0) => {
  const content = unwrapFeedList(value);
  const page = Number(value?.page);
  const size = Number(value?.size);
  return {
    content,
    page: Number.isFinite(page) && page >= 0 ? Math.floor(page) : Math.max(0, Math.floor(Number(fallbackPage) || 0)),
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : Math.max(1, Math.floor(Number(fallbackSize) || 1)),
    hasNext: value?.hasNext === true,
    nextPage: Number.isFinite(Number(value?.nextPage)) ? Math.max(0, Math.floor(Number(value.nextPage))) : (
      value?.hasNext === true ? Math.max(0, Math.floor(Number(fallbackPage) || 0)) + 1 : Math.max(0, Math.floor(Number(fallbackPage) || 0))
    ),
    raw: value,
  };
};

export const getFeedPage = async ({ page = 0, size = DEFAULT_FEED_PAGE_SIZE, baseURL, timeoutMs = 10000, suppressAuthRedirect = true } = {}) => {
  const res = await api.request({
    method: "GET",
    url: "/api/feed",
    baseURL: baseURL || undefined,
    timeout: timeoutMs,
    suppressAuthRedirect,
    params: { page, size },
  });
  return normalizeFeedPage(res?.data, page, size);
};

export const getFeedPosts = async (size = DEFAULT_FEED_PAGE_SIZE) => {
  const page = await getFeedPage({ page: 0, size });
  return page.content;
};

export const getAnonymousFeedPosts = async (size = DEFAULT_FEED_PAGE_SIZE) => {
  const endpoints = ["/api/feed/anonymous", "/api/anonymous/feed", "/anonymous/feed"];
  let fallback = [];
  for (const url of endpoints) {
    try {
      const res = await api.request({
        method: "GET",
        url,
        params: { size },
        suppressAuthRedirect: true,
      });
      const list = unwrapFeedList(res?.data);
      if (!fallback.length) fallback = list;
      if (list.length > 0) return list;
    } catch {
      // try next anonymous feed endpoint
    }
  }
  return fallback;
};

const normalizeLookupId = (value) => {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return "";
  return String(Math.floor(next));
};

const extractSingleItem = (payload) => {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.find(Boolean) || null;
  if (typeof payload !== "object") return null;

  const list = unwrapFeedList(payload);
  if (Array.isArray(list) && list.length) return list[0];

  if (payload.post && typeof payload.post === "object" && !Array.isArray(payload.post)) return payload.post;
  if (payload.item && typeof payload.item === "object" && !Array.isArray(payload.item)) return payload.item;
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) return payload.data;
  if (payload.content && typeof payload.content === "object" && !Array.isArray(payload.content)) return payload.content;

  if (
    payload.id != null &&
    (payload.contentUrl || payload.mediaUrl || payload.videoUrl || payload.url || payload.content)
  ) {
    return payload;
  }

  return null;
};

const fetchItemByEndpoint = async (endpointBase, id, { timeoutMs = 10000, suppressAuthRedirect = true } = {}) => {
  const safeId = normalizeLookupId(id);
  if (!safeId) return null;

  const res = await api.request({
    method: "GET",
    url: `${endpointBase}/${encodeURIComponent(safeId)}`,
    timeout: timeoutMs,
    suppressAuthRedirect,
  });
  const body = res?.data;
  if (typeof body === "string" && (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body))) {
    throw new Error("Received HTML instead of API JSON");
  }
  return extractSingleItem(body);
};

export const getFeedItemById = async (postId, options = {}) => {
  return fetchItemByEndpoint("/api/feed", postId, options);
};

export const getReelItemById = async (postId, options = {}) => {
  return fetchItemByEndpoint("/api/reels", postId, options);
};

export const getContentItemById = async (itemId, options = {}) => {
  const safeId = normalizeLookupId(itemId);
  if (!safeId) return null;

  const endpoints = ["/api/feed", "/api/reels"];
  let lastErr = null;
  for (const endpoint of endpoints) {
    try {
      const item = await fetchItemByEndpoint(endpoint, safeId, options);
      if (item) return item;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) throw lastErr;
  return null;
};

export const getContentItemsByIds = async (ids, options = {}) => {
  const uniqueIds = Array.from(
    new Set((Array.isArray(ids) ? ids : []).map(normalizeLookupId).filter(Boolean))
  );
  if (!uniqueIds.length) return [];

  const batchSize = Math.max(1, Math.min(12, Math.floor(Number(options.batchSize) || 6)));
  const byId = new Map();

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    const batch = uniqueIds.slice(index, index + batchSize);
    const settled = await Promise.allSettled(batch.map((id) => getContentItemById(id, options)));
    settled.forEach((result, offset) => {
      if (result.status !== "fulfilled" || !result.value) return;
      byId.set(batch[offset], result.value);
    });
  }

  return uniqueIds.map((id) => byId.get(id)).filter(Boolean);
};
