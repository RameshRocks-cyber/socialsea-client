import { profilePageQueryKey } from "../api/queryKeys";
import { queryClient } from "../queryClient";

export const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";
export const PROFILE_CACHE_KEY = "socialsea_profile_cache_v1";
export const FOLLOW_SYNC_EVENT = "socialsea-follow-sync";

const normalizeIdentity = (value) => String(value || "").trim().toLowerCase();

const uniqueIdentities = (values) =>
  Array.from(
    new Set((Array.isArray(values) ? values : []).map((value) => normalizeIdentity(value)).filter(Boolean))
  );

const readProfileCacheMap = () => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeProfileCacheMap = (nextMap) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextMap || {}));
  } catch {
    // ignore storage issues
  }
};

const buildSnapshotIdentityKeys = (cacheKey, snapshot) => {
  const profile = snapshot?.profile || {};
  return uniqueIdentities([
    cacheKey,
    profile?.id,
    profile?.userId,
    profile?.username,
    profile?.handle,
    profile?.email
  ]);
};

const followStatusForState = (state) => {
  const normalized = normalizeFollowState(state);
  if (normalized === "requested") return "REQUESTED";
  if (normalized === "following") return "FOLLOWING";
  return "NOT_FOLLOWING";
};

const patchProfilePayload = (profile, { followers, followingCount, state }) => {
  if (!profile || typeof profile !== "object") return profile || null;

  const next = { ...profile };
  if (Number.isFinite(followers)) {
    next.followers = followers;
    next.followersCount = followers;
  }
  if (Number.isFinite(followingCount)) {
    next.following = followingCount;
    next.followingCount = followingCount;
  }
  if (state) {
    const normalizedState = normalizeFollowState(state);
    const isFollowing = normalizedState === "following";
    const status = followStatusForState(normalizedState);
    next.isFollowing = isFollowing;
    next.followingUser = isFollowing;
    next.followStatus = status;
    next.relationship = status;
    next.followState = {
      ...(next.followState && typeof next.followState === "object" ? next.followState : {}),
      isFollowing,
      status
    };
    next.followInfo = {
      ...(next.followInfo && typeof next.followInfo === "object" ? next.followInfo : {}),
      isFollowing,
      status
    };
  }
  return next;
};

const emitFollowSync = (detail = {}) => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(FOLLOW_SYNC_EVENT, { detail: { ...detail, at: Date.now() } }));
  } catch {
    // ignore browser event issues
  }
};

export const normalizeFollowState = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "not_following";
  if (text.includes("unfollow") || text === "not_following" || text === "not-following") return "not_following";
  if (text.includes("request")) return "requested";
  if (text.includes("follow")) return "following";
  return text === "following" || text === "requested" ? text : "not_following";
};

export const resolveFollowStateFromResponse = (response, fallback = "following") => {
  const text = String(
    response?.data?.status ||
      response?.data?.followStatus ||
      response?.data?.relationship ||
      response?.data?.message ||
      response?.data ||
      ""
  )
    .trim()
    .toLowerCase();

  if (text.includes("request")) return "requested";
  if (text.includes("unfollow")) return "not_following";
  if (text.includes("follow")) return "following";
  return normalizeFollowState(fallback);
};

export const readFollowingCache = () => {
  try {
    const raw = localStorage.getItem(FOLLOWING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const updateFollowCache = (identifiers, following, { emit = true } = {}) => {
  const keys = uniqueIdentities(identifiers);
  if (!keys.length) return;

  const next = { ...readFollowingCache() };
  keys.forEach((key) => {
    next[key] = Boolean(following);
  });

  try {
    localStorage.setItem(FOLLOWING_CACHE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage issues
  }

  if (emit) {
    emitFollowSync({ identifiers: keys, following: Boolean(following) });
  }
};

export const getCachedFollowing = (identifiers) =>
  uniqueIdentities(identifiers).some((key) => readFollowingCache()[key] === true);

export const sanitizeProfileSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") return null;
  return {
    profile: snapshot.profile || null,
    posts: Array.isArray(snapshot.posts) ? snapshot.posts : [],
    followers: Number(snapshot.followers || 0),
    followingCount: Number(snapshot.followingCount || 0),
    isFollowing: Boolean(snapshot.isFollowing),
    requested: Boolean(snapshot.requested),
    postsLoaded: Boolean(snapshot.postsLoaded),
    updatedAt: snapshot.updatedAt || Date.now()
  };
};

export const readProfileCacheByKey = (key) => {
  const safeKey = normalizeIdentity(key);
  if (!safeKey) return null;
  const map = readProfileCacheMap();
  return map[safeKey] || null;
};

export const writeProfileCacheByKey = (key, value, { emit = true } = {}) => {
  const safeKey = normalizeIdentity(key);
  if (!safeKey) return;
  const sanitized = sanitizeProfileSnapshot(value);
  if (!sanitized) return;

  const nextMap = {
    ...readProfileCacheMap(),
    [safeKey]: { ...sanitized, updatedAt: Date.now() }
  };
  writeProfileCacheMap(nextMap);
  queryClient.setQueryData(profilePageQueryKey(safeKey), nextMap[safeKey]);

  if (emit) {
    emitFollowSync({ cacheKeys: [safeKey] });
  }
};

export const clearProfileCacheByKey = (key, { emit = true } = {}) => {
  const safeKey = normalizeIdentity(key);
  if (!safeKey) return;

  const nextMap = readProfileCacheMap();
  let changed = false;
  const keysToClear = new Set([safeKey]);

  Object.entries(nextMap).forEach(([cacheKey, snapshot]) => {
    const identityKeys = buildSnapshotIdentityKeys(cacheKey, snapshot);
    if (identityKeys.includes(safeKey)) {
      keysToClear.add(cacheKey);
    }
  });

  keysToClear.forEach((cacheKey) => {
    if (Object.prototype.hasOwnProperty.call(nextMap, cacheKey)) {
      delete nextMap[cacheKey];
      changed = true;
    }
    queryClient.removeQueries({ queryKey: profilePageQueryKey(cacheKey), exact: true });
  });

  if (changed) {
    writeProfileCacheMap(nextMap);
  }

  if (emit) {
    emitFollowSync({ cacheKeys: [safeKey], cleared: true });
  }
};

const getCurrentViewerIdentifiers = () =>
  uniqueIdentities([
    "me",
    localStorage.getItem("userId"),
    sessionStorage.getItem("userId"),
    localStorage.getItem("username"),
    sessionStorage.getItem("username"),
    localStorage.getItem("email"),
    sessionStorage.getItem("email")
  ]);

const patchStoredProfiles = (identifiers, applyPatch) => {
  const matchKeys = uniqueIdentities(identifiers);
  if (!matchKeys.length || typeof applyPatch !== "function") return [];

  const cachedMap = readProfileCacheMap();
  const candidateKeys = new Set(Object.keys(cachedMap));
  queryClient.getQueriesData({ queryKey: ["profile-page"] }).forEach(([queryKey]) => {
    const cacheKey = normalizeIdentity(Array.isArray(queryKey) ? queryKey[1] : "");
    if (cacheKey) candidateKeys.add(cacheKey);
  });

  const nextMap = { ...cachedMap };
  const touchedKeys = [];

  candidateKeys.forEach((cacheKey) => {
    const currentSnapshot = queryClient.getQueryData(profilePageQueryKey(cacheKey)) || cachedMap[cacheKey];
    if (!currentSnapshot) return;

    const identityKeys = buildSnapshotIdentityKeys(cacheKey, currentSnapshot);
    if (!identityKeys.some((key) => matchKeys.includes(key))) return;

    const patchedSnapshot = applyPatch(currentSnapshot, cacheKey);
    const sanitized = sanitizeProfileSnapshot({
      ...patchedSnapshot,
      updatedAt: Date.now()
    });
    if (!sanitized) return;

    nextMap[cacheKey] = sanitized;
    queryClient.setQueryData(profilePageQueryKey(cacheKey), sanitized);
    touchedKeys.push(cacheKey);
  });

  if (touchedKeys.length) {
    writeProfileCacheMap(nextMap);
  }

  return touchedKeys;
};

export const invalidateFollowConnectionQueries = () => {
  void queryClient.invalidateQueries({ queryKey: ["follow-connections"] });
};

export const syncCurrentViewerFollowRelation = ({
  targetIdentifiers,
  nextState,
  countDelta = 0
}) => {
  const normalizedState = normalizeFollowState(nextState);
  const targetKeys = uniqueIdentities(targetIdentifiers);
  if (!targetKeys.length) return;

  updateFollowCache(targetKeys, normalizedState === "following", { emit: false });

  const touchedTargetKeys = patchStoredProfiles(targetKeys, (snapshot) => {
    const nextFollowers = Math.max(0, Number(snapshot?.followers || 0) + Number(countDelta || 0));
    return {
      ...snapshot,
      profile: patchProfilePayload(snapshot?.profile, {
        followers: nextFollowers,
        state: normalizedState
      }),
      followers: nextFollowers,
      isFollowing: normalizedState === "following",
      requested: normalizedState === "requested"
    };
  });

  const viewerKeys = getCurrentViewerIdentifiers();
  const touchedViewerKeys =
    countDelta !== 0
      ? patchStoredProfiles(viewerKeys, (snapshot) => {
          const nextFollowingCount = Math.max(0, Number(snapshot?.followingCount || 0) + Number(countDelta || 0));
          return {
            ...snapshot,
            profile: patchProfilePayload(snapshot?.profile, {
              followingCount: nextFollowingCount
            }),
            followingCount: nextFollowingCount
          };
        })
      : [];

  invalidateFollowConnectionQueries();
  emitFollowSync({
    identifiers: targetKeys,
    nextState: normalizedState,
    countDelta,
    cacheKeys: [...touchedTargetKeys, ...touchedViewerKeys]
  });
};

export const syncAcceptedFollowRequest = ({ requesterIdentifiers }) => {
  const requesterKeys = uniqueIdentities(requesterIdentifiers);
  if (!requesterKeys.length) return;

  const viewerKeys = getCurrentViewerIdentifiers();
  const touchedViewerKeys = patchStoredProfiles(viewerKeys, (snapshot) => {
    const nextFollowers = Math.max(0, Number(snapshot?.followers || 0) + 1);
    return {
      ...snapshot,
      profile: patchProfilePayload(snapshot?.profile, {
        followers: nextFollowers
      }),
      followers: nextFollowers
    };
  });

  const touchedRequesterKeys = patchStoredProfiles(requesterKeys, (snapshot) => {
    const nextFollowingCount = Math.max(0, Number(snapshot?.followingCount || 0) + 1);
    return {
      ...snapshot,
      profile: patchProfilePayload(snapshot?.profile, {
        followingCount: nextFollowingCount
      }),
      followingCount: nextFollowingCount
    };
  });

  invalidateFollowConnectionQueries();
  emitFollowSync({
    requesterIdentifiers: requesterKeys,
    accepted: true,
    cacheKeys: [...touchedViewerKeys, ...touchedRequesterKeys]
  });
};
