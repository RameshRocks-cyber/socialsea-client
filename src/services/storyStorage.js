export const STORY_ACTIVE_STORAGE_KEY = "socialsea_stories_v1";
export const STORY_ARCHIVE_STORAGE_KEY = "socialsea_story_archive_v1";

const STORY_ACTIVE_LIMIT = 120;
const STORY_ARCHIVE_LIMIT = 240;
const STORY_DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000;

const ensureString = (value) => String(value || "").trim();

export const readStoryIdentity = () => {
  const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId") || "";
  const email = sessionStorage.getItem("email") || localStorage.getItem("email") || "";
  const username = sessionStorage.getItem("username") || localStorage.getItem("username") || "";
  const name = sessionStorage.getItem("name") || localStorage.getItem("name") || "";

  return {
    userId: ensureString(userId),
    email: ensureString(email).toLowerCase(),
    username: ensureString(username).toLowerCase(),
    name: ensureString(name).toLowerCase()
  };
};

export const toStoryEpochMs = (value) => {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  const raw = ensureString(value);
  if (!raw) return 0;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  }

  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isStoryExpired = (story, now = Date.now()) => {
  const expiresAt = toStoryEpochMs(story?.expiresAt || story?.expires || story?.expiry || 0);
  if (expiresAt > 0) return expiresAt <= now;

  const createdAt = toStoryEpochMs(story?.createdAt || story?.created || story?.timestamp || 0);
  if (createdAt > 0) return createdAt + STORY_DEFAULT_DURATION_MS <= now;

  return false;
};

export const resolveStoryStorageKey = (story) => {
  const directId =
    story?.archiveId ||
    story?.storyId ||
    story?.id ||
    story?.postId ||
    story?.mediaId ||
    story?.reelId;
  if (directId != null && directId !== "") {
    const sourceType = ensureString(story?.sourceType || story?.kind || "story").toLowerCase();
    return `${sourceType}:${String(directId)}`;
  }

  const mediaUrl = ensureString(
    story?.mediaUrl || story?.url || story?.fileUrl || story?.storyUrl || story?.contentUrl
  );
  const createdAt = toStoryEpochMs(story?.createdAt || story?.created || story?.timestamp || 0);
  if (mediaUrl) return `media:${mediaUrl}|${createdAt || "na"}`;
  if (createdAt) return `time:${createdAt}`;
  return `fallback:${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeStoryEntry = (story) => {
  if (!story) return null;

  const createdAtMs =
    toStoryEpochMs(story?.createdAt || story?.created || story?.timestamp || story?.time || 0) ||
    Date.now();
  const expiresAtMs =
    toStoryEpochMs(story?.expiresAt || story?.expires || story?.expiry || 0) ||
    createdAtMs + STORY_DEFAULT_DURATION_MS;

  const mediaUrl = ensureString(
    story?.mediaUrl || story?.url || story?.fileUrl || story?.storyUrl || story?.contentUrl
  );
  const mediaType = ensureString(
    story?.mediaType || story?.contentType || story?.mimeType || story?.fileType || story?.type
  );
  const sourceType = ensureString(story?.sourceType || story?.kind || "story").toLowerCase() || "story";
  const stableKey = resolveStoryStorageKey({
    ...story,
    sourceType,
    createdAt: createdAtMs,
    mediaUrl
  });

  return {
    ...story,
    archiveId: stableKey,
    id: story?.id ?? story?.storyId ?? story?.postId ?? story?.mediaId ?? stableKey,
    storyId: story?.storyId ?? story?.id ?? story?.postId ?? story?.mediaId ?? stableKey,
    reelId: story?.reelId ?? story?.postId ?? story?.id ?? "",
    mediaUrl,
    caption: ensureString(story?.caption || story?.description),
    storyText: ensureString(story?.storyText),
    privacy: ensureString(story?.privacy || "public") || "public",
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    mediaType,
    type: ensureString(story?.type || mediaType || (story?.isVideo ? "VIDEO" : "IMAGE")),
    isVideo:
      typeof story?.isVideo === "boolean"
        ? story.isVideo
        : /^video\//i.test(mediaType) || /video|reel/i.test(ensureString(story?.type)),
    userId: ensureString(story?.userId || story?.ownerId || story?.authorId || story?.profileId),
    email: ensureString(story?.email || story?.userEmail || story?.ownerEmail).toLowerCase(),
    username: ensureString(
      story?.username ||
      story?.userName ||
      story?.handle ||
      story?.ownerName ||
      story?.name ||
      story?.displayName
    ).toLowerCase(),
    name: ensureString(story?.name || story?.displayName || story?.ownerName),
    sourceType,
    createdLocally: story?.createdLocally === true
  };
};

const readStoryList = (storageKey) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoryEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const writeStoryList = (storageKey, list, limit) => {
  const normalized = Array.isArray(list)
    ? list.map(normalizeStoryEntry).filter(Boolean)
    : [];
  const deduped = mergeStoryLists(normalized).slice(0, limit);
  try {
    localStorage.setItem(storageKey, JSON.stringify(deduped));
  } catch {
    // ignore storage errors
  }
  return deduped;
};

export const mergeStoryLists = (...lists) => {
  const map = new Map();
  lists.flat().forEach((item) => {
    const normalized = normalizeStoryEntry(item);
    if (!normalized) return;
    const key = normalized.archiveId || resolveStoryStorageKey(normalized);
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, ...normalized } : normalized);
  });
  return Array.from(map.values()).sort(
    (a, b) => toStoryEpochMs(b?.createdAt || 0) - toStoryEpochMs(a?.createdAt || 0)
  );
};

export const readActiveStories = () => readStoryList(STORY_ACTIVE_STORAGE_KEY);

export const readArchivedStories = () => readStoryList(STORY_ARCHIVE_STORAGE_KEY);

export const writeActiveStories = (list) => {
  const activeOnly = mergeStoryLists(list).filter((item) => !isStoryExpired(item));
  return writeStoryList(STORY_ACTIVE_STORAGE_KEY, activeOnly, STORY_ACTIVE_LIMIT);
};

export const writeArchivedStories = (list) =>
  writeStoryList(STORY_ARCHIVE_STORAGE_KEY, list, STORY_ARCHIVE_LIMIT);

export const syncStoryCaches = (incomingStories) => {
  const mergedArchive = mergeStoryLists(readArchivedStories(), incomingStories);
  writeArchivedStories(mergedArchive);

  const mergedActive = mergeStoryLists(readActiveStories(), incomingStories).filter(
    (item) => !isStoryExpired(item)
  );
  writeActiveStories(mergedActive);

  return {
    active: mergedActive,
    archive: mergedArchive
  };
};

export const syncStoryCachesForIdentity = (identity, incomingStories) => {
  if (!identity) return syncStoryCaches(incomingStories);

  const incoming = mergeStoryLists(incomingStories);
  const incomingKeySet = new Set();
  const incomingIdSet = new Set();

  incoming.forEach((story) => {
    const normalized = normalizeStoryEntry(story);
    if (!normalized) return;
    const storageKey = normalized.archiveId || resolveStoryStorageKey(normalized);
    const storyId = ensureString(normalized?.id || normalized?.storyId);
    if (storageKey) incomingKeySet.add(storageKey);
    if (storyId) incomingIdSet.add(storyId);
  });

  const shouldKeepLocal = (story) => {
    const normalized = normalizeStoryEntry(story);
    if (!normalized) return false;

    if (!isStoryOwnedByIdentity(normalized, identity)) return true;
    if (normalized?.createdLocally === true) return true;

    const sourceType = ensureString(normalized?.sourceType || normalized?.kind || "story").toLowerCase();
    if (sourceType && sourceType !== "story") return true;

    const storageKey = normalized.archiveId || resolveStoryStorageKey(normalized);
    if (storageKey && incomingKeySet.has(storageKey)) return true;

    const storyId = ensureString(normalized?.id || normalized?.storyId);
    if (storyId && incomingIdSet.has(storyId)) return true;

    return false;
  };

  const prunedArchive = mergeStoryLists(readArchivedStories().filter(shouldKeepLocal), incoming);
  writeArchivedStories(prunedArchive);

  const prunedActive = mergeStoryLists(readActiveStories().filter(shouldKeepLocal), incoming).filter(
    (item) => !isStoryExpired(item)
  );
  writeActiveStories(prunedActive);

  return {
    active: prunedActive,
    archive: prunedArchive
  };
};

export const addStoryEntry = (story, options = {}) => {
  const normalized = normalizeStoryEntry(story);
  if (!normalized) return null;

  if (options.archive !== false) {
    writeArchivedStories([...readArchivedStories(), normalized]);
  }
  if (options.active !== false) {
    writeActiveStories([...readActiveStories(), normalized]);
  }
  return normalized;
};

export const isStoryOwnedByIdentity = (story, identity) => {
  if (!story || !identity) return false;
  if (story?.createdLocally === true) return true;

  const idCandidates = [
    story?.userId,
    story?.ownerId,
    story?.authorId,
    story?.profileId,
    story?.user?.id,
    story?.owner?.id
  ]
    .map(ensureString)
    .filter(Boolean);
  if (identity.userId && idCandidates.includes(identity.userId)) return true;

  const emailCandidates = [
    story?.email,
    story?.userEmail,
    story?.ownerEmail,
    story?.user?.email,
    story?.username
  ]
    .map((value) => ensureString(value).toLowerCase())
    .filter(Boolean);
  if (identity.email && emailCandidates.includes(identity.email)) return true;

  const nameCandidates = [
    story?.username,
    story?.userName,
    story?.ownerName,
    story?.name,
    story?.displayName,
    story?.user?.name
  ]
    .map((value) => ensureString(value).toLowerCase())
    .filter(Boolean);

  if (identity.username && nameCandidates.includes(identity.username)) return true;
  if (identity.name && nameCandidates.includes(identity.name)) return true;

  return false;
};

export const readStoriesForIdentity = (identity) =>
  mergeStoryLists(readActiveStories(), readArchivedStories()).filter((story) =>
    identity ? isStoryOwnedByIdentity(story, identity) : true
  );
