import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../api/axios";
import { getApiBaseUrl, toApiUrl } from "../../api/baseUrl";
import { clearAuthStorage } from "../../auth";
import { profilePageQueryKey } from "../../api/queryKeys";
import {
  clearProfileCacheByKey,
  FOLLOW_SYNC_EVENT,
  invalidateFollowConnectionQueries
} from "../../services/followSync";
import { readActiveStories, readStoryIdentity, syncStoryCachesForIdentity } from "../../services/storyStorage";
import { buildProfilePath, persistProfileIdentity } from "../../utils/profileRoute";
import { isExplicitReelPost, mediaTypeForPost, readVideoSettingsObject } from "../../utils/videoFeedClassifier";

const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";
const HIDDEN_PROFILE_POSTS_KEY = "socialsea_hidden_profile_posts_v1";
const PROFILE_CACHE_KEY = "socialsea_profile_cache_v1";
const PROFILE_REQ_TIMEOUT_MS = 6000;
const POSTS_REQ_TIMEOUT_MS = 5000;
const FOLLOWING_REQ_TIMEOUT_MS = 1800;
const MAX_SHORT_VIDEO_SECONDS = 90;
const VIDEO_FEED_SURFACE_TOKENS = new Set(["video_feed", "videofeed", "long_video", "longvideo", "watch_feed", "watch"]);
const POST_FEED_SURFACE_TOKENS = new Set(["post_feed", "postfeed", "feed_post", "post_video", "postvideo", "post"]);
const LONG_VIDEO_TYPE_TOKENS = new Set(["long_video", "longvideo", "watch", "long", "video_feed", "watch_feed"]);
const POST_VIDEO_TYPE_TOKENS = new Set(["post_video", "postvideo", "post", "feed_post", "post_feed", "postfeed"]);

const asProfileFeedToken = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const readFirstProfileFeedToken = (values) => {
  for (const value of values) {
    const token = asProfileFeedToken(value);
    if (token) return token;
  }
  return "";
};

const classifyProfileFeedBucket = (post) => {
  if (mediaTypeForPost(post) !== "VIDEO") return "posts";
  if (isExplicitReelPost(post)) return "reels";

  const settings = readVideoSettingsObject(post);
  const surfaceToken = readFirstProfileFeedToken([
    settings?.distributionSurface,
    settings?.uploadSurface,
    settings?.feedSurface,
    settings?.uploadContext,
    settings?.surface,
    settings?.context,
    settings?.destination,
    settings?.creatorSettings?.distributionSurface,
    settings?.creatorSettings?.uploadSurface,
    settings?.creatorSettings?.feedSurface,
    settings?.creatorSettings?.uploadContext
  ]);
  if (VIDEO_FEED_SURFACE_TOKENS.has(surfaceToken)) return "videos";
  if (POST_FEED_SURFACE_TOKENS.has(surfaceToken)) return "posts";

  const typeToken = readFirstProfileFeedToken([
    post?.type,
    post?.sourceType,
    post?.source,
    settings?.uploadType,
    settings?.type,
    settings?.postType,
    settings?.sourceType,
    settings?.uploadContext,
    settings?.feedSurface,
    settings?.creatorSettings?.uploadType,
    settings?.creatorSettings?.type,
    settings?.creatorSettings?.postType,
    settings?.creatorSettings?.sourceType
  ]);
  if (LONG_VIDEO_TYPE_TOKENS.has(typeToken)) return "videos";
  if (POST_VIDEO_TYPE_TOKENS.has(typeToken)) return "posts";

  return "posts";
};

const durationFromPost = (post) => {
  const candidates = [
    post?.durationSeconds,
    post?.videoDurationSeconds,
    post?.duration,
    post?.videoDuration,
    post?.length,
    post?.durationMs,
    post?.videoDurationMs
  ];

  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    const text = String(raw).trim();
    if (!text) continue;
    if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(text)) {
      const parts = text.split(":").map((value) => Number(value));
      if (parts.every((value) => Number.isFinite(value) && value >= 0)) {
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
      }
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (/ms$/i.test(text) || value > 10000) return value / 1000;
    return value;
  }

  return 0;
};

const normalizeMediaVariants = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return [];
  const absolute = value.startsWith("http") ? value : toApiUrl(value);
  if (absolute && absolute !== value) return [value, absolute];
  return [value];
};

const buildStoryMediaSet = (stories) => {
  const set = new Set();
  const list = Array.isArray(stories) ? stories : [];
  list.forEach((story) => {
    const media =
      story?.mediaUrl ||
      story?.url ||
      story?.fileUrl ||
      story?.storyUrl ||
      story?.contentUrl ||
      "";
    normalizeMediaVariants(media).forEach((entry) => set.add(entry));
  });
  return set;
};

const readLocalStoryMediaSet = () => buildStoryMediaSet(readActiveStories());

const isStoryMediaMatch = (mediaUrl, storySet) => {
  if (!mediaUrl || !storySet || storySet.size === 0) return false;
  return normalizeMediaVariants(mediaUrl).some((entry) => storySet.has(entry));
};

const filterOutStoryPosts = (posts, storySet) => {
  const list = Array.isArray(posts) ? posts : [];
  if (!storySet || storySet.size === 0) return list;
  return list.filter((post) => {
    const url =
      post?.contentUrl ||
      post?.mediaUrl ||
      post?.imageUrl ||
      post?.videoUrl ||
      post?.media?.url ||
      "";
    return !isStoryMediaMatch(url, storySet);
  });
};

const readFollowingCache = () => {
  try {
    const raw = localStorage.getItem(FOLLOWING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeFollowingCache = (value) => {
  try {
    localStorage.setItem(FOLLOWING_CACHE_KEY, JSON.stringify(value || {}));
  } catch {
    // ignore storage errors
  }
};

const updateFollowCache = (identifiers, following) => {
  const keys = identifiers
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
  if (!keys.length) return;
  const cache = readFollowingCache();
  keys.forEach((key) => {
    cache[key] = Boolean(following);
  });
  writeFollowingCache(cache);
};

const getCachedFollowing = (identifiers) => {
  const cache = readFollowingCache();
  return identifiers
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean)
    .some((key) => cache[key] === true);
};

const getPathCandidates = (identifier, kind) => {
  const safeId = encodeURIComponent(String(identifier || "").trim());
  if (!safeId) return [];
  return [
    `/api/follow/${safeId}/${kind}/users`,
    `/api/profile/${safeId}/${kind}`,
    `/api/follow/${safeId}/${kind}`,
    `/api/follow/${kind}/${safeId}`
  ];
};

const pickList = (payload, kind) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload?.[kind])) return payload[kind];
  if (Array.isArray(payload?.data?.[kind])) return payload.data[kind];
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.data?.users)) return payload.data.users;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  return null;
};

const normalizeUserId = (entry) => {
  const user = entry?.user || entry?.sender || entry?.target || entry;
  return String(user?.id ?? user?.userId ?? "").trim();
};

const countUniqueUserEntries = (entries) => {
  const seen = new Set();
  const list = Array.isArray(entries) ? entries : [];
  list.forEach((entry) => {
    const id = normalizeUserId(entry);
    if (id) seen.add(id);
  });
  return seen.size;
};

const readHiddenProfilePostIds = () => {
  try {
    const raw = localStorage.getItem(HIDDEN_PROFILE_POSTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => String(id || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
};

const readProfileCacheByKey = (key) => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const entry = parsed?.[key];
    return entry && typeof entry === "object" ? entry : null;
  } catch {
    return null;
  }
};

const writeProfileCacheByKey = (key, value) => {
  if (!key) return;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = parsed && typeof parsed === "object" ? { ...parsed } : {};
    next[key] = { ...(value || {}), updatedAt: Date.now() };
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // ignore cache issues
  }
};

const getRequestStatus = (error) => Number(error?.response?.status || 0);

const isAuthRequestError = (error) => {
  const status = getRequestStatus(error);
  return status === 401 || status === 403;
};

const isNotFoundRequestError = (error) => getRequestStatus(error) === 404;

const isTransientRequestError = (error) => {
  const status = getRequestStatus(error);
  if (status >= 500 || status === 429) return true;
  if (status > 0) return false;

  const message = String(error?.message || "").trim().toLowerCase();
  const code = String(error?.code || "").trim().toLowerCase();
  return (
    code === "err_network" ||
    code === "err_request_timeout" ||
    code === "econnaborted" ||
    message.includes("network error") ||
    message.includes("network changed") ||
    message.includes("connection closed") ||
    message.includes("failed to fetch") ||
    message.includes("timeout")
  );
};

const extractFollowingFlag = (response, profileData) => {
  const booleanCandidates = [
    response?.data?.isFollowing,
    profileData?.isFollowing,
    response?.data?.followState?.isFollowing,
    profileData?.followState?.isFollowing,
    response?.data?.followInfo?.isFollowing,
    profileData?.followInfo?.isFollowing
  ];
  if (booleanCandidates.some((v) => v === true)) return true;
  if (booleanCandidates.some((v) => v === false)) return false;

  const statusCandidates = [
    response?.data?.followStatus,
    profileData?.followStatus,
    response?.data?.relationship,
    profileData?.relationship
  ]
    .map((x) => String(x || "").toLowerCase())
    .filter(Boolean);

  if (statusCandidates.some((x) => x.includes("follow"))) return true;
  if (statusCandidates.some((x) => x.includes("request"))) return false;
  return null;
};

const requestWithTimeout = (path, config = {}, timeoutMs = 4500) => {
  const requestConfig = config && typeof config === "object" ? { ...config } : {};
  const method = String(requestConfig.method || "GET").trim().toUpperCase();
  delete requestConfig.method;

  return Promise.race([
    api.request({
      url: path,
      method,
      ...requestConfig
    }),
    new Promise((_, reject) => {
      const timeoutError = new Error("timeout");
      timeoutError.code = "ERR_REQUEST_TIMEOUT";
      setTimeout(() => reject(timeoutError), timeoutMs);
    })
  ]);
};

const buildBaseCandidates = () => {
  const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
  const storedBase = String(
    localStorage.getItem("socialsea_auth_base_url") ||
    sessionStorage.getItem("socialsea_auth_base_url") ||
    ""
  ).replace(/\/+$/, "");
  const envBase = String(getApiBaseUrl() || "").replace(/\/+$/, "");
  const isLocalHost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
  const localPreferredBases = isLocalHost
    ? ["/api", "http://localhost:8080", "http://127.0.0.1:8080"]
    : [];
  return [
    ...localPreferredBases,
    defaultBase || undefined,
    storedBase || undefined,
    envBase || undefined,
    "/api"
  ].filter((value, index, arr) => value && arr.indexOf(value) === index);
};

const normalizePosts = (items) => {
  const list = Array.isArray(items) ? items : [];
  const hiddenPostIds = readHiddenProfilePostIds();
  return list
    .map((post) => {
      const contentUrl =
        post?.contentUrl ||
        post?.mediaUrl ||
        post?.imageUrl ||
        post?.videoUrl ||
        post?.media?.url ||
        "";
      const durationSeconds = durationFromPost(post);
      const isVideo = mediaTypeForPost(post) === "VIDEO";
      const profileFeedBucket = classifyProfileFeedBucket(post);
      const isShortVideo = profileFeedBucket === "reels";
      return { ...post, contentUrl, isVideo, isShortVideo, durationSeconds, profileFeedBucket };
    })
    .filter((post) => {
      const idText = String(post?.id || "").trim();
      if (idText && hiddenPostIds.has(idText)) return false;
      return String(post?.contentUrl || "").trim();
    });
};

const loadStoryMediaSet = async (preferredBase, baseCandidates) => {
  const orderedBases = [preferredBase, ...baseCandidates.filter((b) => b && b !== preferredBase)].filter(Boolean);
  for (const base of orderedBases.slice(0, 3)) {
    try {
      const res = await requestWithTimeout(
        "/api/stories/mine",
        {
          baseURL: base,
          suppressAuthRedirect: true,
          params: { _: Date.now() },
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache"
          }
        },
        5000
      );
      const set = buildStoryMediaSet(res?.data);
      if (Array.isArray(res?.data)) {
        syncStoryCachesForIdentity(readStoryIdentity(), res.data.slice(0, 120));
      }
      if (set.size) return set;
    } catch {
      // try next base
    }
  }
  return readLocalStoryMediaSet();
};

const cleanupStoryPosts = async (preferredBase, storySet, cleanupStoryPostsRef) => {
  if (cleanupStoryPostsRef.current) return 0;
  const mediaUrls = Array.from(storySet || []);
  if (!mediaUrls.length) return 0;
  cleanupStoryPostsRef.current = true;
  try {
    const res = await requestWithTimeout(
      "/api/profile/me/posts/cleanup-stories",
      {
        baseURL: preferredBase,
        method: "POST",
        data: { mediaUrls },
        suppressAuthRedirect: true
      },
      8000
    );
    const deleted = Number(res?.data?.deleted || 0);
    return Number.isFinite(deleted) ? deleted : 0;
  } catch {
    return 0;
  }
};

const fetchProfileAtBase = async (username, base) => {
  const res = await requestWithTimeout(
    `/api/profile/${username}`,
    {
      baseURL: base,
      suppressAuthRedirect: true,
      params: { _: Date.now() },
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      }
    },
    PROFILE_REQ_TIMEOUT_MS
  );
  const data = res?.data?.user || res?.data || {};
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    throw new Error("empty_profile");
  }
  return { base, res, data };
};

const loadProfileAtBases = async (username, baseCandidates) => {
  const primaryBase = baseCandidates[0];
  const fallbackBases = baseCandidates.filter((base) => base !== primaryBase);

  try {
    return await fetchProfileAtBase(username, primaryBase);
  } catch (err) {
    let lastError = err;
    if (fallbackBases.length) {
      const settled = await Promise.allSettled(fallbackBases.map((base) => fetchProfileAtBase(username, base)));
      const winner = settled.find((r) => r.status === "fulfilled");
      if (winner?.status === "fulfilled") {
        return winner.value;
      }
      const firstRejected = settled.find((r) => r.status === "rejected");
      lastError = firstRejected?.reason || err;
    }
    throw lastError;
  }
};

const loadPostsAtBases = async ({ username, profileId, preferredBase, baseCandidates, storySet }) => {
  const orderedBases = [preferredBase, ...baseCandidates.filter((b) => b !== preferredBase)].filter(Boolean);
  const endpointCandidates = [
    `/api/profile/${username}/posts`,
    profileId ? `/api/profile/${profileId}/posts` : null,
    username === "me" ? "/api/profile/me/posts" : null
  ].filter(Boolean);

  let bestPosts = [];
  const fastBases = orderedBases.slice(0, 1);
  const fallbackBases = orderedBases.slice(1, 3);

  for (const base of fastBases) {
    for (const endpoint of endpointCandidates) {
      try {
        const res = await requestWithTimeout(
          endpoint,
          {
            baseURL: base,
            suppressAuthRedirect: true,
            params: { _: Date.now() },
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache"
            }
          },
          POSTS_REQ_TIMEOUT_MS
        );
        const normalized = normalizePosts(res?.data);
        const filtered = filterOutStoryPosts(normalized, storySet);
        if (filtered.length > bestPosts.length) {
          bestPosts = filtered;
        }
      } catch {
        // continue
      }
    }
  }

  if (!bestPosts.length) {
    for (const base of fallbackBases) {
      for (const endpoint of endpointCandidates) {
        try {
          const res = await requestWithTimeout(
            endpoint,
            {
              baseURL: base,
              suppressAuthRedirect: true,
              params: { _: Date.now() },
              headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache"
              }
            },
            POSTS_REQ_TIMEOUT_MS
          );
          const normalized = normalizePosts(res?.data);
          const filtered = filterOutStoryPosts(normalized, storySet);
          if (filtered.length > bestPosts.length) {
            bestPosts = filtered;
          }
        } catch {
          // continue
        }
      }
    }
  }

  return bestPosts;
};

const readCachedSnapshot = (queryClient, cacheKey) => {
  if (!cacheKey) return null;
  return queryClient.getQueryData(profilePageQueryKey(cacheKey)) || readProfileCacheByKey(cacheKey);
};

const sanitizeSnapshotForCache = (snapshot) => {
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

export function useProfilePageQuery({ username, isOwnRouteRequest, myUserId, myEmail }) {
  const queryClient = useQueryClient();
  const cleanupStoryPostsRef = useRef(false);
  const cacheKey = String(username || "").trim().toLowerCase();
  const ownProfileRequest = Boolean(
    isOwnRouteRequest ||
      cacheKey === "me" ||
      (String(myUserId || "").trim() && cacheKey === String(myUserId || "").trim().toLowerCase()) ||
      (String(myEmail || "").trim() && cacheKey === String(myEmail || "").trim().toLowerCase())
  );

  useEffect(() => {
    cleanupStoryPostsRef.current = false;
  }, [cacheKey]);

  const profileQuery = useQuery({
    queryKey: profilePageQueryKey(cacheKey),
    enabled: Boolean(cacheKey),
    staleTime: ownProfileRequest ? 0 : 20_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnMount: ownProfileRequest ? "always" : true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    initialData: () => readCachedSnapshot(queryClient, cacheKey) || undefined,
    initialDataUpdatedAt: () => Number(readCachedSnapshot(queryClient, cacheKey)?.updatedAt || 0),
    queryFn: async () => {
      if (!cacheKey) {
        return {
          profile: null,
          posts: [],
          followers: 0,
          followingCount: 0,
          isFollowing: false,
          requested: false,
          postsLoaded: false,
          errorMessage: "User not found"
        };
      }

      const baseCandidates = buildBaseCandidates();

      try {
        const payload = await loadProfileAtBases(username, baseCandidates);
        const { base, res, data } = payload;
        const followKeys = [data?.id, data?.email, data?.username, username];
        const extracted = extractFollowingFlag(res, data);
        const followStatus = String(data?.followStatus || data?.relationship || "").toLowerCase();
        const ownProfile =
          username === "me" || Number(username) === Number(myUserId) || data?.id === Number(myUserId);
        const resolvedIsFollowing = ownProfile
          ? true
          : (extracted === null ? getCachedFollowing(followKeys) : extracted);

        if (ownProfile) {
          persistProfileIdentity(data);
        }

        let followerCount = Number(
          data?.followers ??
          data?.followersCount ??
          res?.data?.followers ??
          res?.data?.followersCount ??
          0
        ) || 0;
        let initialFollowingCount = Number(
          data?.following ??
          data?.followingCount ??
          res?.data?.following ??
          res?.data?.followingCount ??
          0
        ) || 0;

        if (extracted === null && !ownProfile && myUserId) {
          const viewerCandidates = [myUserId, myEmail].filter(Boolean);
          const targetId = String(data?.id || "").trim();
          const paths = viewerCandidates
            .flatMap((id) => getPathCandidates(id, "following"))
            .filter((path, index, arr) => arr.indexOf(path) === index);
          const responses = await Promise.allSettled(
            paths.map((path) => requestWithTimeout(path, {}, FOLLOWING_REQ_TIMEOUT_MS))
          );
          for (const result of responses) {
            if (result.status !== "fulfilled") continue;
            const list = pickList(result.value?.data, "following");
            if (!Array.isArray(list)) continue;
            const found = list.some((entry) => normalizeUserId(entry) === targetId);
            if (found) {
              followerCount = Math.max(0, followerCount);
              initialFollowingCount = Math.max(0, initialFollowingCount);
              updateFollowCache(followKeys, true);
              break;
            }
          }
        }

        if (ownProfile && initialFollowingCount <= 0) {
          const followIdentifiers = [data?.id, data?.email, data?.username, username]
            .map((value) => String(value || "").trim())
            .filter(Boolean);
          const followPaths = followIdentifiers
            .flatMap((id) => getPathCandidates(id, "following"))
            .filter((path, index, arr) => arr.indexOf(path) === index);
          const responses = await Promise.allSettled(
            followPaths.map((path) => requestWithTimeout(path, {}, FOLLOWING_REQ_TIMEOUT_MS))
          );
          for (const result of responses) {
            if (result.status !== "fulfilled") continue;
            const list = pickList(result.value?.data, "following");
            if (!Array.isArray(list)) continue;
            const uniqueCount = countUniqueUserEntries(list);
            if (uniqueCount > 0) {
              initialFollowingCount = uniqueCount;
              break;
            }
          }
        }

        updateFollowCache(followKeys, resolvedIsFollowing);

        const canViewContent = data?.canViewContent !== false;
        let loadedPosts = [];
        if (canViewContent) {
          const storySet = await loadStoryMediaSet(base, baseCandidates);
          loadedPosts = await loadPostsAtBases({
            username,
            profileId: data?.id,
            preferredBase: base,
            baseCandidates,
            storySet
          });
          if (ownProfile && storySet.size > 0) {
            const deleted = await cleanupStoryPosts(base, storySet, cleanupStoryPostsRef);
            if (deleted > 0) {
              loadedPosts = await loadPostsAtBases({
                username,
                profileId: data?.id,
                preferredBase: base,
                baseCandidates,
                storySet
              });
            }
          }
        }

        const snapshot = {
          profile: data,
          posts: loadedPosts,
          followers: Math.max(0, followerCount),
          followingCount: Math.max(0, initialFollowingCount),
          isFollowing: Boolean(resolvedIsFollowing),
          requested: !resolvedIsFollowing && followStatus.includes("request"),
          postsLoaded: true,
          errorMessage: "",
          authError: false,
          redirectTo: null,
          updatedAt: Date.now()
        };
        writeProfileCacheByKey(cacheKey, sanitizeSnapshotForCache(snapshot));
        return snapshot;
      } catch (err) {
        if (isAuthRequestError(err)) {
          clearAuthStorage();
          return {
            profile: null,
            posts: [],
            followers: 0,
            followingCount: 0,
            isFollowing: false,
            requested: false,
            postsLoaded: false,
            errorMessage: "Session expired",
            authError: true,
            redirectTo: null
          };
        }

        if (isNotFoundRequestError(err)) {
          // Cached snapshots should not survive after the backend says the user is gone.
          clearProfileCacheByKey(cacheKey, { emit: false });
          updateFollowCache([cacheKey, username], false);
          invalidateFollowConnectionQueries();

          // Cached/stale numeric profile ids can break after backend/db switch.
          // Fallback to the current logged-in profile so the app remains usable.
          if (isOwnRouteRequest && String(username || "").toLowerCase() !== "me") {
            try {
              const baseCandidates = buildBaseCandidates();
              const defaultBase = baseCandidates[0];
              const meRes = await requestWithTimeout(
                "/api/profile/me",
                {
                  baseURL: defaultBase,
                  suppressAuthRedirect: true,
                  params: { _: Date.now() },
                  headers: {
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache"
                  }
                },
                PROFILE_REQ_TIMEOUT_MS
              );
              const meData = meRes?.data?.user || meRes?.data || {};
              if (meData && typeof meData === "object" && Object.keys(meData).length > 0) {
                persistProfileIdentity(meData);
                const storySet = await loadStoryMediaSet(defaultBase, baseCandidates);
                let loadedPosts = [];
                if (meData?.canViewContent !== false) {
                  loadedPosts = await loadPostsAtBases({
                    username: "me",
                    profileId: meData?.id,
                    preferredBase: defaultBase,
                    baseCandidates,
                    storySet
                  });
                  if (storySet.size > 0) {
                    const deleted = await cleanupStoryPosts(defaultBase, storySet, cleanupStoryPostsRef);
                    if (deleted > 0) {
                      loadedPosts = await loadPostsAtBases({
                        username: "me",
                        profileId: meData?.id,
                        preferredBase: defaultBase,
                        baseCandidates,
                        storySet
                      });
                    }
                  }
                }
                const snapshot = {
                  profile: meData,
                  posts: loadedPosts,
                  followers: Number(meData?.followers || meData?.followersCount || 0) || 0,
                  followingCount: Number(meData?.following || meData?.followingCount || 0) || 0,
                  isFollowing: true,
                  requested: false,
                  postsLoaded: true,
                  errorMessage: "",
                  authError: false,
                  redirectTo: buildProfilePath(meData),
                  updatedAt: Date.now()
                };
                writeProfileCacheByKey(cacheKey, sanitizeSnapshotForCache(snapshot));
                return snapshot;
              }
            } catch {
              // continue to the not-found response below
            }
          }

          return {
            profile: null,
            posts: [],
            followers: 0,
            followingCount: 0,
            isFollowing: false,
            requested: false,
            postsLoaded: false,
            errorMessage: "User not found",
            authError: false,
            redirectTo: null
          };
        }

        return {
          profile: null,
          posts: [],
          followers: 0,
          followingCount: 0,
          isFollowing: false,
          requested: false,
          postsLoaded: false,
          errorMessage: isNotFoundRequestError(err)
            ? "User not found"
            : isTransientRequestError(err)
              ? "Could not load profile. Check your connection and retry."
              : "Could not load profile right now.",
          authError: false,
          redirectTo: null
        };
      }
    }
  });

  useEffect(() => {
    const data = profileQuery.data;
    if (!data || data.authError || data.errorMessage) return;
    const sanitized = sanitizeSnapshotForCache(data);
    if (!sanitized) return;
    writeProfileCacheByKey(cacheKey, sanitized);
  }, [cacheKey, profileQuery.data]);

  useEffect(() => {
    if (!cacheKey) return undefined;

    const syncFromCache = () => {
      const snapshot = readProfileCacheByKey(cacheKey);
      if (!snapshot) return;
      const sanitized = sanitizeSnapshotForCache(snapshot);
      if (!sanitized) return;
      queryClient.setQueryData(profilePageQueryKey(cacheKey), sanitized);
    };

    const onStorage = (event) => {
      if (event?.key && event.key !== PROFILE_CACHE_KEY && event.key !== FOLLOWING_CACHE_KEY) return;
      syncFromCache();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(FOLLOW_SYNC_EVENT, syncFromCache);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FOLLOW_SYNC_EVENT, syncFromCache);
    };
  }, [cacheKey, queryClient]);

  return profileQuery;
}
