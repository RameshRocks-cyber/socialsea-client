import api from "./axios";
import { unwrapFeedList } from "./feed";

const SAVED_IDS_STORAGE_KEY = "savedPostIds";
const SAVED_REELS_STORAGE_KEY = "savedReelIds";

const normalizeId = (value) => {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return null;
  return Math.floor(next);
};

const readIdsFromStorage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeId).filter((value) => value != null);
  } catch {
    return [];
  }
};

const dedupeIds = (ids) => {
  const seen = new Set();
  const ordered = [];
  (Array.isArray(ids) ? ids : []).forEach((value) => {
    const normalized = normalizeId(value);
    if (normalized == null) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    ordered.push(normalized);
  });
  return ordered;
};

export const readSavedPostIdsFromStorage = () => {
  const merged = [...readIdsFromStorage(SAVED_IDS_STORAGE_KEY), ...readIdsFromStorage(SAVED_REELS_STORAGE_KEY)];
  return dedupeIds(merged);
};

export const syncSavedPostCache = (items) => {
  const ids = dedupeIds((Array.isArray(items) ? items : []).map((item) => item?.id));
  return syncSavedPostCacheFromIds(ids);
};

export const syncSavedPostCacheFromIds = (ids) => {
  const normalizedIds = dedupeIds(ids);
  try {
    const payload = JSON.stringify(normalizedIds);
    localStorage.setItem(SAVED_IDS_STORAGE_KEY, payload);
    localStorage.setItem(SAVED_REELS_STORAGE_KEY, payload);
  } catch {
    // ignore storage failures
  }
  return normalizedIds;
};

export const loadSavedPosts = async () => {
  const res = await api.get("/api/saved");
  return unwrapFeedList(res?.data);
};

export const toggleSavedPost = async (postId) => {
  const safeId = normalizeId(postId);
  if (safeId == null) {
    throw new Error("Invalid post id");
  }
  const res = await api.post(`/api/saved/${safeId}`);
  return res?.data || {};
};
