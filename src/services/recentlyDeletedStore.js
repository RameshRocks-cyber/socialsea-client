import { SETTINGS_KEY } from "../pages/soundPrefs";

const RECENTLY_DELETED_KEY = "socialsea_activity_recently_deleted_v1";
const HIDDEN_PROFILE_POSTS_KEY = "socialsea_hidden_profile_posts_v1";
const MAX_RECENTLY_DELETED_ITEMS = 200;

export const DELETED_MEDIA_POLICIES = Object.freeze({
  IMMEDIATE: "immediate",
  AFTER_7_DAYS: "7d",
  AFTER_30_DAYS: "30d",
  MANUAL: "manual"
});

export const DELETED_MEDIA_POLICY_OPTIONS = [
  { id: DELETED_MEDIA_POLICIES.IMMEDIATE, label: "Delete now", days: 0 },
  { id: DELETED_MEDIA_POLICIES.AFTER_7_DAYS, label: "Delete after 7 days", days: 7 },
  { id: DELETED_MEDIA_POLICIES.AFTER_30_DAYS, label: "Delete after 30 days", days: 30 },
  { id: DELETED_MEDIA_POLICIES.MANUAL, label: "Keep until I delete", days: null }
];

const normalizeString = (value) => String(value ?? "").trim();
const normalizeLower = (value) => normalizeString(value).toLowerCase();
const nowIso = () => new Date().toISOString();

const parseJson = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const readJson = (key, fallback) => parseJson(localStorage.getItem(key), fallback);

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore local storage failures
  }
};

const emitRecentlyDeletedUpdate = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ss-recently-deleted-update"));
};

const parseIsoOrEmpty = (value) => {
  const timestamp = Date.parse(normalizeString(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
};

const parsePostIdFromEntryId = (value) => {
  const id = normalizeString(value);
  if (!id) return "";
  const candidate = normalizeString(id.split(":")[0]);
  if (!candidate || /^deleted-/i.test(candidate)) return "";
  return candidate;
};

const toEntryTimestamp = (entry) => {
  const parsed = Date.parse(entry?.deletedAt || entry?.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPolicyOption = (policy) =>
  DELETED_MEDIA_POLICY_OPTIONS.find((item) => item.id === normalizeDeletedMediaPolicy(policy));

const getPolicyDays = (policy) => {
  const option = getPolicyOption(policy);
  return typeof option?.days === "number" ? option.days : null;
};

export const normalizeDeletedMediaPolicy = (value) => {
  const raw = normalizeLower(value);
  if (raw === DELETED_MEDIA_POLICIES.IMMEDIATE || raw === "now" || raw === "delete-now") {
    return DELETED_MEDIA_POLICIES.IMMEDIATE;
  }
  if (raw === DELETED_MEDIA_POLICIES.AFTER_7_DAYS || raw === "7days" || raw === "7-days") {
    return DELETED_MEDIA_POLICIES.AFTER_7_DAYS;
  }
  if (raw === DELETED_MEDIA_POLICIES.AFTER_30_DAYS || raw === "30days" || raw === "30-days") {
    return DELETED_MEDIA_POLICIES.AFTER_30_DAYS;
  }
  if (raw === DELETED_MEDIA_POLICIES.MANUAL || raw === "keep" || raw === "never" || raw === "until-delete") {
    return DELETED_MEDIA_POLICIES.MANUAL;
  }
  return DELETED_MEDIA_POLICIES.IMMEDIATE;
};

export const getDeletedMediaPolicyLabel = (policy) => {
  const option = getPolicyOption(policy);
  return option?.label || "Delete now";
};

export const computeDeletedMediaExpiry = ({ deletedAt, policy }) => {
  const normalizedPolicy = normalizeDeletedMediaPolicy(policy);
  const days = getPolicyDays(normalizedPolicy);
  if (days == null || days <= 0) return "";
  const baseTimestamp = Date.parse(parseIsoOrEmpty(deletedAt) || nowIso());
  if (!Number.isFinite(baseTimestamp)) return "";
  return new Date(baseTimestamp + days * 24 * 60 * 60 * 1000).toISOString();
};

export const readDeletedMediaPolicyFromSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeDeletedMediaPolicy(parsed?.deletedMediaPolicy);
  } catch {
    return DELETED_MEDIA_POLICIES.IMMEDIATE;
  }
};

const normalizeRecentlyDeletedEntry = (entry, index = 0) => {
  const deletedAt = parseIsoOrEmpty(entry?.deletedAt || entry?.createdAt) || nowIso();
  const source = normalizeString(entry?.source) || "profile";
  const postId = normalizeString(entry?.postId || entry?.contentId || parsePostIdFromEntryId(entry?.id));
  const explicitMode = normalizeLower(entry?.deletionMode || entry?.deleteMode);
  const inferredMode = explicitMode === "soft" || explicitMode === "hard"
    ? explicitMode
    : entry?.restoreEligible
      ? "soft"
      : "hard";
  const retentionPolicy = normalizeDeletedMediaPolicy(
    entry?.retentionPolicy || (inferredMode === "soft" ? DELETED_MEDIA_POLICIES.MANUAL : DELETED_MEDIA_POLICIES.IMMEDIATE)
  );
  const restoreEligible = typeof entry?.restoreEligible === "boolean"
    ? entry.restoreEligible
    : inferredMode === "soft" && Boolean(postId);
  const expiresAt = parseIsoOrEmpty(entry?.expiresAt) || (restoreEligible ? computeDeletedMediaExpiry({ deletedAt, policy: retentionPolicy }) : "");
  const defaultId = `${postId || `deleted-${index}-${Date.now()}`}:${source}`;

  return {
    id: normalizeString(entry?.id) || defaultId,
    postId,
    contentId: postId || normalizeString(entry?.contentId),
    title: normalizeString(entry?.title) || "Untitled post",
    subtitle: normalizeString(entry?.subtitle) || "Removed from profile",
    description: normalizeString(entry?.description),
    createdAt: parseIsoOrEmpty(entry?.createdAt) || deletedAt,
    deletedAt,
    mediaUrl: normalizeString(entry?.mediaUrl),
    isVideo: entry?.isVideo === true,
    route: normalizeString(entry?.route),
    source,
    retentionPolicy,
    deletionMode: inferredMode,
    restoreEligible,
    expiresAt,
    pendingPermanentDelete: typeof entry?.pendingPermanentDelete === "boolean" ? entry.pendingPermanentDelete : inferredMode === "soft",
    deletedFromServer: typeof entry?.deletedFromServer === "boolean" ? entry.deletedFromServer : inferredMode === "hard"
  };
};

const readRecentlyDeletedEntriesRaw = () => {
  const parsed = readJson(RECENTLY_DELETED_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
};

export const readRecentlyDeletedEntries = () =>
  readRecentlyDeletedEntriesRaw()
    .map((entry, index) => normalizeRecentlyDeletedEntry(entry, index))
    .sort((a, b) => toEntryTimestamp(b) - toEntryTimestamp(a));

const writeRecentlyDeletedEntries = (entries) => {
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry, index) => normalizeRecentlyDeletedEntry(entry, index))
    .sort((a, b) => toEntryTimestamp(b) - toEntryTimestamp(a))
    .slice(0, MAX_RECENTLY_DELETED_ITEMS);
  writeJson(RECENTLY_DELETED_KEY, normalized);
  emitRecentlyDeletedUpdate();
  return normalized;
};

export const readRecentlyDeletedCount = () => readRecentlyDeletedEntries().length;

export const addRecentlyDeletedEntry = (entry) => {
  const nextEntry = normalizeRecentlyDeletedEntry(entry || {});
  const current = readRecentlyDeletedEntries();
  const dedupeKey = normalizeString(nextEntry?.id);
  const filtered = current.filter((item) => normalizeString(item?.id) !== dedupeKey);
  const next = writeRecentlyDeletedEntries([nextEntry, ...filtered]);
  return next.find((item) => normalizeString(item?.id) === dedupeKey) || nextEntry;
};

export const removeRecentlyDeletedEntryById = (entryId) => {
  const target = normalizeString(entryId);
  if (!target) return null;
  const current = readRecentlyDeletedEntries();
  const removed = current.find((item) => normalizeString(item?.id) === target) || null;
  if (!removed) return null;
  const next = current.filter((item) => normalizeString(item?.id) !== target);
  writeRecentlyDeletedEntries(next);
  return removed;
};

const writeHiddenProfilePostIds = (values) => {
  const unique = Array.from(new Set((Array.isArray(values) ? values : []).map((item) => normalizeString(item)).filter(Boolean)));
  writeJson(HIDDEN_PROFILE_POSTS_KEY, unique.slice(-500));
  emitRecentlyDeletedUpdate();
  return new Set(unique);
};

export const readHiddenProfilePostIdSet = () => {
  const parsed = readJson(HIDDEN_PROFILE_POSTS_KEY, []);
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.map((item) => normalizeString(item)).filter(Boolean));
};

export const hideProfilePostId = (postId) => {
  const idText = normalizeString(postId);
  if (!idText) return readHiddenProfilePostIdSet();
  const current = readHiddenProfilePostIdSet();
  current.add(idText);
  return writeHiddenProfilePostIds(Array.from(current));
};

export const restoreHiddenProfilePostId = (postId) => {
  const idText = normalizeString(postId);
  if (!idText) return readHiddenProfilePostIdSet();
  const current = readHiddenProfilePostIdSet();
  current.delete(idText);
  return writeHiddenProfilePostIds(Array.from(current));
};

export const restoreRecentlyDeletedEntry = (entryId) => {
  const target = normalizeString(entryId);
  if (!target) return { ok: false, reason: "missing_id" };
  const current = readRecentlyDeletedEntries();
  const entry = current.find((item) => normalizeString(item?.id) === target);
  if (!entry) return { ok: false, reason: "not_found" };
  if (!entry.restoreEligible || !entry.postId) return { ok: false, reason: "not_restorable", entry };
  restoreHiddenProfilePostId(entry.postId);
  writeRecentlyDeletedEntries(current.filter((item) => normalizeString(item?.id) !== target));
  return { ok: true, entry };
};

export const permanentlyDeleteRecentlyDeletedEntry = (entryId) => {
  const target = normalizeString(entryId);
  if (!target) return { ok: false, reason: "missing_id" };
  const current = readRecentlyDeletedEntries();
  const entry = current.find((item) => normalizeString(item?.id) === target);
  if (!entry) return { ok: false, reason: "not_found" };
  if (entry.postId) hideProfilePostId(entry.postId);
  writeRecentlyDeletedEntries(current.filter((item) => normalizeString(item?.id) !== target));
  return { ok: true, entry };
};

export const pruneExpiredRecentlyDeletedEntries = (referenceDate = new Date()) => {
  const nowTimestamp = referenceDate instanceof Date ? referenceDate.getTime() : Date.parse(referenceDate);
  if (!Number.isFinite(nowTimestamp)) return { removedCount: 0, removedIds: [] };
  const current = readRecentlyDeletedEntries();
  const keep = [];
  const removed = [];
  current.forEach((entry) => {
    const expiryTimestamp = Date.parse(entry?.expiresAt || "");
    const shouldExpire =
      entry?.restoreEligible === true &&
      Number.isFinite(expiryTimestamp) &&
      expiryTimestamp <= nowTimestamp;
    if (shouldExpire) {
      if (entry?.postId) hideProfilePostId(entry.postId);
      removed.push(entry);
      return;
    }
    keep.push(entry);
  });
  if (removed.length > 0) {
    writeRecentlyDeletedEntries(keep);
  }
  return {
    removedCount: removed.length,
    removedIds: removed.map((entry) => entry.id)
  };
};
