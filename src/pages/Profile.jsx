import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { clearAuthStorage } from "../auth";
import { buildProfilePath, getProfileIdentifier, persistProfileIdentity } from "../utils/profileRoute";
import "./Profile.css";

const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";
const HIDDEN_PROFILE_POSTS_KEY = "socialsea_hidden_profile_posts_v1";
const PROFILE_CACHE_KEY = "socialsea_profile_cache_v1";
const HIGHLIGHTS_STORAGE_KEY = "socialsea_highlights_v1";
const PROFILE_REQ_TIMEOUT_MS = 2500;
const POSTS_REQ_TIMEOUT_MS = 2500;
const FOLLOWING_REQ_TIMEOUT_MS = 1800;
const MAX_SHORT_VIDEO_SECONDS = 90;

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
  localStorage.setItem(FOLLOWING_CACHE_KEY, JSON.stringify(value || {}));
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
    `/api/follow/${kind}/${safeId}`,
    `/api/follow/list?type=${kind}&user=${safeId}`
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

const readHighlights = () => {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeHighlights = (next) => {
  try {
    localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage issues
  }
};

const persistHiddenProfilePostId = (postId) => {
  const idText = String(postId || "").trim();
  if (!idText) return;
  const next = readHiddenProfilePostIds();
  next.add(idText);
  try {
    localStorage.setItem(HIDDEN_PROFILE_POSTS_KEY, JSON.stringify(Array.from(next).slice(-500)));
  } catch {
    // ignore storage issues
  }
};

const getConnectionIdentityKeys = (entry) => {
  const user = entry?.user || entry?.sender || entry?.target || entry;
  const id = String(user?.id ?? user?.userId ?? entry?.id ?? entry?.userId ?? "").trim();
  const email = String(user?.email ?? entry?.email ?? "").trim().toLowerCase();
  const username = String(user?.username ?? entry?.username ?? "").trim().toLowerCase();
  const name = String(user?.name ?? entry?.name ?? "").trim().toLowerCase();
  const bio = String(user?.bio ?? entry?.bio ?? "").trim().toLowerCase();
  const keys = [];
  if (id) keys.push(`id:${id}`);
  if (email) keys.push(`email:${email}`);
  if (username) keys.push(`username:${username}`);
  if (name || bio) keys.push(`profile:${name}|${bio}`);
  return keys;
};

const requestWithTimeout = (path, config = {}, timeoutMs = 4500) =>
  Promise.race([
    api.get(path, config),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
  ]);

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

const isPortraitVideo = (post) => {
  const width = Number(post?.width || post?.videoWidth || post?.mediaWidth || post?.media?.width || 0);
  const height = Number(post?.height || post?.videoHeight || post?.mediaHeight || post?.media?.height || 0);
  return width > 0 && height > 0 && height > width;
};

export default function Profile() {
  const { username } = useParams();
  const myUserId = sessionStorage.getItem("userId") || localStorage.getItem("userId");
  const myEmail = sessionStorage.getItem("email") || localStorage.getItem("email");
  const myName = sessionStorage.getItem("name") || localStorage.getItem("name");
  const myUsername = sessionStorage.getItem("username") || localStorage.getItem("username");
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [requested] = useState(false);
  const [followError, setFollowError] = useState("");
  const [postActionError, setPostActionError] = useState("");
  const [deletingPostIds, setDeletingPostIds] = useState({});
  const [deleteRevealPostId, setDeleteRevealPostId] = useState(null);
  const [videoMetaByPost, setVideoMetaByPost] = useState({});
  const [profileTab, setProfileTab] = useState("posts");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [highlights, setHighlights] = useState(() => readHighlights());
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState(0);
  const holdTimerRef = useRef(null);
  const deleteRevealHideTimerRef = useRef(null);
  const profileRouteKey = getProfileIdentifier(profile, username, myUsername, myName, myEmail, myUserId) || "me";

  const isOwnProfile =
    username === "me" ||
    Number(username) === Number(myUserId) ||
    String(username || "").trim().toLowerCase() === String(myUsername || "").trim().toLowerCase() ||
    String(username || "").trim().toLowerCase() === String(myEmail || "").trim().toLowerCase() ||
    String(username || "").trim().toLowerCase() === String(myName || "").trim().toLowerCase() ||
    profile?.id === Number(myUserId);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = String(username || "").trim().toLowerCase();
    setError("");
    setPostActionError("");
    const cached = readProfileCacheByKey(cacheKey);
    if (cached) {
      setProfile(cached.profile || null);
      setPosts(Array.isArray(cached.posts) ? cached.posts : []);
      setFollowers(Number(cached.followers || 0));
      setFollowingCount(Number(cached.followingCount || 0));
      setIsFollowing(Boolean(cached.isFollowing));
    } else {
      setProfile(null);
      setPosts([]);
    }

    if (!username) {
      setError("User not found");
      return undefined;
    }

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
    const baseCandidates = [
      defaultBase || undefined,
      storedBase || undefined,
      envBase || undefined,
      ...(isLocalHost ? ["http://localhost:8080", "http://127.0.0.1:8080", "/api"] : []),
      "https://socialsea.co.in"
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);

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
          const typeRaw = String(post?.type || post?.mediaType || post?.mimeType || post?.contentType || "").toLowerCase();
            const durationSeconds = durationFromPost(post);
            const isVideo =
              post?.reel === true ||
              typeRaw.includes("video") ||
              /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(contentUrl);
            const isShortVideo =
              post?.reel === true ||
              post?.isShort === true ||
              post?.shortVideo === true ||
              post?.short === true ||
              post?.isReel === true ||
              typeRaw.includes("reel") ||
              typeRaw.includes("short") ||
              (durationSeconds > 0 && durationSeconds <= MAX_SHORT_VIDEO_SECONDS) ||
              isPortraitVideo(post);
            return { ...post, contentUrl, isVideo, isShortVideo, durationSeconds };
          })
          .filter((post) => {
            const idText = String(post?.id || "").trim();
            if (idText && hiddenPostIds.has(idText)) return false;
            return String(post?.contentUrl || "").trim();
          });
      };

    const loadProfile = async () => {
      const fetchProfileAtBase = async (base) => {
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

      let payload = null;
      let lastError = null;
      const primaryBase = baseCandidates[0];
      const fallbackBases = baseCandidates.filter((base) => base !== primaryBase).slice(0, 2);

      try {
        payload = await fetchProfileAtBase(primaryBase);
      } catch (err) {
        lastError = err;
        if (fallbackBases.length) {
          const settled = await Promise.allSettled(fallbackBases.map((base) => fetchProfileAtBase(base)));
          const winner = settled.find((r) => r.status === "fulfilled");
          if (winner?.status === "fulfilled") {
            payload = winner.value;
          } else {
            const firstRejected = settled.find((r) => r.status === "rejected");
            lastError = firstRejected?.reason || err;
          }
        }
      }

      if (payload) {
        const { base, res, data } = payload;
        if (cancelled) return null;
        setProfile(data);
        persistProfileIdentity(data);

        const followKeys = [data?.id, data?.email, data?.username, username];
        const extracted = extractFollowingFlag(res, data);
        if (extracted === null) {
          setIsFollowing(getCachedFollowing(followKeys));
        } else {
          setIsFollowing(extracted);
          updateFollowCache(followKeys, extracted);
        }

        const followerCount = Number(
          data?.followers ??
          data?.followersCount ??
          res?.data?.followers ??
          res?.data?.followersCount ??
          0
        ) || 0;
        setFollowers(Math.max(0, followerCount));
        const initialFollowingCount = Number(
          data?.following ??
          data?.followingCount ??
          res?.data?.following ??
          res?.data?.followingCount ??
          0
        ) || 0;
        setFollowingCount(Math.max(0, initialFollowingCount));

        const ownProfile =
          username === "me" || Number(username) === Number(myUserId) || data?.id === Number(myUserId);

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
              if (!cancelled) setIsFollowing(true);
              updateFollowCache(followKeys, true);
              break;
            }
          }
        }

        return {
          base,
          profileId: data?.id,
          profileData: data,
          resolvedIsFollowing: extracted === null ? getCachedFollowing(followKeys) : extracted,
          resolvedFollowers: Math.max(0, followerCount),
          resolvedFollowingCount: Math.max(0, initialFollowingCount)
        };
      }

      if (lastError?.response?.status === 401) {
        navigate("/login");
        return null;
      }
      // Cached/stale numeric profile ids can break after backend/db switch.
      // Fallback to current logged-in profile so app remains usable.
      if (String(username || "").toLowerCase() !== "me") {
        try {
          const meRes = await requestWithTimeout(
            "/api/profile/me",
            {
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
            if (!cancelled) {
              setProfile(meData);
              persistProfileIdentity(meData);
              navigate(buildProfilePath(meData), { replace: true });
            }
            return { base: defaultBase || undefined, profileId: meData?.id, profileData: meData };
          }
        } catch {
          // continue to existing not-found flow
        }
      }
      if (!cancelled) setError("User not found");
      return null;
    };

    const loadPosts = async (preferredBase, profileId) => {
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
                skipAuth: true,
                skipRefresh: true,
                params: { _: Date.now() },
                headers: {
                  "Cache-Control": "no-cache",
                  Pragma: "no-cache"
                }
              },
              POSTS_REQ_TIMEOUT_MS
            );
            const normalized = normalizePosts(res?.data);
            if (normalized.length > bestPosts.length) {
              bestPosts = normalized;
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
                  skipAuth: true,
                  skipRefresh: true,
                  params: { _: Date.now() },
                  headers: {
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache"
                  }
                },
                POSTS_REQ_TIMEOUT_MS
              );
              const normalized = normalizePosts(res?.data);
              if (normalized.length > bestPosts.length) {
                bestPosts = normalized;
              }
            } catch {
              // continue
            }
          }
        }
      }

      if (!cancelled) setPosts(bestPosts);
      return bestPosts;
    };

    const run = async () => {
      try {
        const profileResult = await loadProfile();
        let loadedPosts = [];
        if (profileResult?.profileId && !cancelled) {
          const profileData = profileResult?.profileData || { id: profileResult.profileId };
          const safeFollowers = Number(
            profileData?.followers ??
            profileData?.followersCount ??
            0
          ) || 0;
          const safeFollowing = Number(
            profileData?.following ??
            profileData?.followingCount ??
            0
          ) || 0;
          setFollowers(Math.max(0, safeFollowers));
          setFollowingCount(Math.max(0, safeFollowing));
        }
        loadedPosts = await loadPosts(profileResult?.base, profileResult?.profileId);
        if (!cancelled && profileResult?.profileData) {
          writeProfileCacheByKey(cacheKey, {
            profile: profileResult.profileData,
            posts: loadedPosts,
            followers: profileResult.resolvedFollowers,
            followingCount: profileResult.resolvedFollowingCount,
            isFollowing: profileResult.resolvedIsFollowing
          });
        }
      } catch (err) {
        if (!cancelled) {
          const text = String(err?.message || "").toLowerCase();
          setError(text.includes("timeout") ? "Profile load timeout. Check backend connection." : "Failed to load profile");
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [username, navigate, myUserId, myEmail, myUsername, myName]);

  const handleFollow = async () => {
    if (loading) return;
    setLoading(true);
    setFollowError("");
    const method = isFollowing ? "DELETE" : "POST";
    const followKey = profile?.email || profile?.username || profile?.id || username;
    if (!followKey) {
      setFollowError("Unable to resolve user for follow action");
      setLoading(false);
      return;
    }

    try {
      await api({ method, url: `/api/follow/${encodeURIComponent(followKey)}` });
      const nextFollowing = !isFollowing;
      setIsFollowing(nextFollowing);
      setFollowers((prev) => Math.max(0, prev + (nextFollowing ? 1 : -1)));
      updateFollowCache([profile?.id, profile?.email, profile?.username, username], nextFollowing);
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 401 || status === 403) setFollowError("Please login again to follow users");
      else setFollowError("Follow action failed");
    } finally {
      setLoading(false);
    }
  };

  const deletePost = async (postId) => {
    if (!isOwnProfile || postId == null) return;
    const ok = window.confirm("Delete this post?");
    if (!ok) return;

    setPostActionError("");
    setDeletingPostIds((prev) => ({ ...prev, [postId]: true }));

    const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
    const baseCandidates = [
      defaultBase,
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://socialsea.co.in"
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);

    const endpointCandidates = [
      { method: "delete", url: `/api/posts/${postId}` },
      { method: "delete", url: `/api/admin/posts/${postId}` },
      { method: "delete", url: `/api/profile/posts/${postId}` },
      { method: "delete", url: `/api/profile/${encodeURIComponent(String(username || "me"))}/posts/${postId}` },
      { method: "delete", url: "/api/profile/me/posts/" + postId },
      profile?.id ? { method: "delete", url: `/api/profile/${profile.id}/posts/${postId}` } : null,
      { method: "delete", url: `/api/feed/${postId}` },
      { method: "post", url: `/api/posts/${postId}/delete` },
      { method: "post", url: `/api/profile/posts/${postId}/delete` },
      { method: "post", url: `/api/profile/${encodeURIComponent(String(username || "me"))}/posts/${postId}/delete` },
      { method: "post", url: `/api/feed/${postId}/delete` }
    ].filter(Boolean);

    let lastError = null;

    for (const base of baseCandidates) {
      for (const endpoint of endpointCandidates) {
        try {
          await api({
            method: endpoint.method,
            url: endpoint.url,
            baseURL: base,
            suppressAuthRedirect: true
          });
          setPosts((prev) => prev.filter((p) => String(p?.id) !== String(postId)));
          setDeleteRevealPostId((prev) => (String(prev || "") === String(postId) ? null : prev));
          setDeletingPostIds((prev) => ({ ...prev, [postId]: false }));
          return;
        } catch (err) {
          lastError = err;
        }
      }
    }

    const status = lastError?.response?.status;
    const msg = lastError?.response?.data?.message || lastError?.message || "Unable to delete post";
    persistHiddenProfilePostId(postId);
    setPosts((prev) => prev.filter((p) => String(p?.id) !== String(postId)));
    setDeleteRevealPostId((prev) => (String(prev || "") === String(postId) ? null : prev));
    setPostActionError(
      status === 404
        ? "Delete endpoint is not available on backend yet. Post hidden locally."
        : status
          ? `Delete failed (${status}): ${msg}. Post hidden locally.`
          : `Delete failed: ${msg}. Post hidden locally.`
    );
    setDeletingPostIds((prev) => ({ ...prev, [postId]: false }));
  };
  const resolveMediaUrl = (url) => {
    if (!url) return "";
    return toApiUrl(url);
  };

  const openPostInPlayer = (post) => {
    if (!post || !post?.isVideo) return;
    const postId = String(post?.id || "").trim();
    if (!postId) return;
    const measured = videoMetaByPost[postId] || {};
    const measuredDuration = Number(measured?.duration || 0);
    const measuredWidth = Number(measured?.width || 0);
    const measuredHeight = Number(measured?.height || 0);
    const isMeasuredPortrait = measuredWidth > 0 && measuredHeight > 0 && measuredHeight > measuredWidth;
    const isMeasuredShort = measuredDuration > 0 && measuredDuration <= MAX_SHORT_VIDEO_SECONDS;
    if (post?.isShortVideo || isMeasuredShort || isMeasuredPortrait) {
      navigate(`/reels?post=${encodeURIComponent(postId)}`);
      return;
    }
    navigate(`/watch/${encodeURIComponent(postId)}`);
  };

  const handleProfileVideoMeta = (postId, event) => {
    const idText = String(postId || "").trim();
    if (!idText) return;
    const video = event?.currentTarget;
    if (!video) return;
    const nextMeta = {
      duration: Number(video.duration) || 0,
      width: Number(video.videoWidth) || 0,
      height: Number(video.videoHeight) || 0
    };
    setVideoMetaByPost((prev) => {
      const current = prev[idText];
      if (
        current &&
        Number(current.duration || 0) === nextMeta.duration &&
        Number(current.width || 0) === nextMeta.width &&
        Number(current.height || 0) === nextMeta.height
      ) {
        return prev;
      }
      return { ...prev, [idText]: nextMeta };
    });
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const clearDeleteRevealHideTimer = () => {
    if (deleteRevealHideTimerRef.current) {
      clearTimeout(deleteRevealHideTimerRef.current);
      deleteRevealHideTimerRef.current = null;
    }
  };

  const handleCardPointerDown = (event, postId) => {
    if (!isOwnProfile || postId == null) return;
    const pointerType = String(event?.pointerType || event?.nativeEvent?.pointerType || "").toLowerCase();
    if (pointerType === "mouse") return;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      setDeleteRevealPostId(String(postId));
      clearDeleteRevealHideTimer();
      deleteRevealHideTimerRef.current = setTimeout(() => {
        setDeleteRevealPostId((current) => (String(current || "") === String(postId) ? null : current));
      }, 3500);
    }, 450);
  };

  const handleCardPointerEnd = () => {
    clearHoldTimer();
  };

  useEffect(() => () => {
    clearHoldTimer();
    clearDeleteRevealHideTimer();
  }, []);

  const logout = () => {
    clearAuthStorage();
    navigate("/login");
  };

  const reels = posts.filter((post) => post?.isShortVideo);
  const normalPosts = posts.filter((post) => !post?.isShortVideo);
  const visiblePosts = profileTab === "reels" ? reels : normalPosts;

  const openCreateSheet = () => {
    setCreateSheetOpen(true);
  };

  const closeCreateSheet = () => {
    setCreateSheetOpen(false);
  };

  const handleCreateAction = (kind) => {
    closeCreateSheet();
    if (kind === "post") {
      navigate("/upload");
      return;
    }
    if (kind === "reel") {
      navigate("/upload?type=reel");
      return;
    }
    if (kind === "live") {
      navigate("/live/start");
      return;
    }
    if (kind === "story") {
      navigate("/story/create");
      return;
    }
    if (kind === "highlights") {
      navigate("/highlights/create");
    }
  };

  const resolveHighlightMediaUrl = (raw) => {
    if (!raw) return "";
    return String(raw).startsWith("http") ? String(raw) : toApiUrl(String(raw));
  };
  const isHighlightVideo = (url) =>
    /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)(\?|#|$)/i.test(String(url || ""));
  const openHighlight = (highlight) => {
    if (!highlight?.items?.length) return;
    setActiveHighlight(highlight);
    setActiveHighlightIndex(0);
  };
  const closeHighlight = () => {
    setActiveHighlight(null);
    setActiveHighlightIndex(0);
  };
  const deleteHighlight = (id) => {
    setHighlights((prev) => {
      const next = prev.filter((item) => String(item?.id || "") !== String(id || ""));
      writeHighlights(next);
      return next;
    });
  };

  return (
    <div className="profile-page">
      {error && <div>{error}</div>}
      {!error && !profile && <div>Loading...</div>}

      {!error && profile && (
        <>
          <section className="profile-header">
            <img src={profile.profilePicUrl || "/default-avatar.png"} alt="Profile" className="profile-pic" />

            <div className="profile-info">
              <h2 className="profile-name">{profile.name || profile.email || profile.username}</h2>
              <p className="bio">{profile.bio || "No bio yet"}</p>

              <p className="profile-stats">
                <button
                  type="button"
                  className="profile-stat-link"
                  onClick={() => navigate(`/profile/${encodeURIComponent(profileRouteKey)}/followers`)}
                >
                  <b>{followers}</b> followers
                </button>
                <span className="profile-stat-dot">|</span>
                <button
                  type="button"
                  className="profile-stat-link"
                  onClick={() => navigate(`/profile/${encodeURIComponent(profileRouteKey)}/following`)}
                >
                  <b>{followingCount}</b> following
                </button>
              </p>

              {!isOwnProfile && (
                <div className="profile-actions">
                  <button
                    onClick={handleFollow}
                    disabled={loading}
                    className={`profile-follow-btn ${isFollowing ? "is-following" : ""} ${loading ? "is-loading" : ""}`}
                  >
                    {loading ? "Please wait..." : isFollowing ? "Following" : requested ? "Requested" : "Follow"}
                  </button>
                  {!!followError && <p className="profile-follow-error">{followError}</p>}
                </div>
              )}

              {isOwnProfile && (
                <div className="profile-actions-own">
                  <button className="profile-cta profile-cta-edit" onClick={() => navigate("/profile-setup?mode=edit")}>
                    Edit Profile
                  </button>
                  <button className="profile-cta profile-cta-upload" onClick={openCreateSheet}>
                    Create
                  </button>
                  <button className="profile-cta profile-cta-settings" onClick={() => navigate("/settings")}>
                    Settings
                  </button>
                </div>
              )}
            </div>
          </section>

          {isOwnProfile && (
            <section className="profile-shortcuts">
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/anonymous/upload")}>
                <h4>Anonymous Upload</h4>
                <p>Share safely without exposing your profile identity.</p>
              </button>
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/anonymous-feed")}>
                <h4>Anonymous Feed</h4>
                <p>See all approved anonymous posts and interactions.</p>
              </button>
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/live-recordings")}>
                <h4>Recorded Live (Private)</h4>
                <p>View SOS recorded live videos. These are private and not shared in feed.</p>
              </button>
            </section>
          )}

          {isOwnProfile && highlights.length > 0 && (
            <section className="profile-highlights">
              <div className="profile-highlights-head">
                <h3>Highlights</h3>
                <button type="button" className="profile-highlights-add" onClick={() => navigate("/highlights/create")}>
                  + New
                </button>
              </div>
              <div className="profile-highlights-row">
                {highlights.map((highlight) => {
                  const coverRaw =
                    highlight?.coverUrl || highlight?.items?.[0]?.mediaUrl || highlight?.items?.[0]?.url || "";
                  const coverUrl = resolveHighlightMediaUrl(coverRaw);
                  const isVideo = isHighlightVideo(coverUrl);
                  return (
                    <div key={highlight.id} className="profile-highlight-card">
                      <button type="button" className="profile-highlight-thumb" onClick={() => openHighlight(highlight)}>
                        {coverUrl ? (
                          isVideo ? (
                            <video src={coverUrl} muted playsInline preload="metadata" />
                          ) : (
                            <img src={coverUrl} alt={highlight.title} />
                          )
                        ) : (
                          <span>{String(highlight.title || "H").slice(0, 1).toUpperCase()}</span>
                        )}
                      </button>
                      <div className="profile-highlight-meta">
                        <p>{highlight.title}</p>
                        <small>{highlight.items?.length || 0} stories</small>
                      </div>
                      <button
                        type="button"
                        className="profile-highlight-delete"
                        onClick={() => deleteHighlight(highlight.id)}
                        title="Delete highlight"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <hr className="profile-divider" />

          <div className="profile-posts-head">
            <h3 className="profile-posts-title">Posts</h3>
            <div className="profile-post-tabs" role="tablist" aria-label="Profile post filters">
              <button
                type="button"
                className={`profile-post-tab ${profileTab === "posts" ? "is-active" : ""}`}
                onClick={() => setProfileTab("posts")}
                role="tab"
                aria-selected={profileTab === "posts"}
              >
                Posts ({normalPosts.length})
              </button>
              <button
                type="button"
                className={`profile-post-tab ${profileTab === "reels" ? "is-active" : ""}`}
                onClick={() => setProfileTab("reels")}
                role="tab"
                aria-selected={profileTab === "reels"}
              >
                Reels ({reels.length})
              </button>
            </div>
          </div>
          {postActionError && <p className="profile-posts-error">{postActionError}</p>}
          <div className="profile-posts-grid">
            {visiblePosts.length === 0 && (
              <p>{profileTab === "reels" ? "No reels yet" : "No posts yet"}</p>
            )}
            {visiblePosts.map((post, index) => (
              <div
                key={`${String(post?.id ?? "post")}-${index}`}
                className={`profile-post-card ${post?.isVideo ? "is-playable" : ""} ${String(deleteRevealPostId || "") === String(post?.id || "") ? "is-delete-visible" : ""}`}
                onClick={() => openPostInPlayer(post)}
                onPointerDown={(event) => handleCardPointerDown(event, post?.id)}
                onPointerUp={handleCardPointerEnd}
                onPointerCancel={handleCardPointerEnd}
                onPointerLeave={handleCardPointerEnd}
              >
                {!post.isVideo && post.contentUrl?.trim() && (
                  <img src={resolveMediaUrl(post.contentUrl)} alt="" />
                )}
                {post.isVideo && post.contentUrl?.trim() && (
                  <video
                    src={resolveMediaUrl(post.contentUrl)}
                    autoPlay
                    muted
                    loop
                    preload="metadata"
                    playsInline
                    onLoadedMetadata={(event) => handleProfileVideoMeta(post?.id, event)}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )}
                {isOwnProfile && (
                  <div className="profile-post-actions">
                    <button
                      type="button"
                      className="profile-post-delete-inline"
                      onClick={(event) => {
                        event.stopPropagation();
                        deletePost(post?.id);
                      }}
                      disabled={Boolean(deletingPostIds[post?.id])}
                      title="Delete post"
                    >
                      {deletingPostIds[post?.id] ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isOwnProfile && (
            <button className="logout-btn-profile" onClick={logout}>
              Logout
            </button>
          )}
        </>
      )}

      {activeHighlight && activeHighlight?.items?.length > 0 && (
        <div className="profile-highlight-viewer-backdrop" onClick={closeHighlight}>
          <div className="profile-highlight-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="profile-highlight-viewer-close" onClick={closeHighlight}>
              ×
            </button>
            {(() => {
              const items = activeHighlight.items || [];
              const activeItem = items[activeHighlightIndex];
              const mediaUrl = resolveHighlightMediaUrl(activeItem?.mediaUrl || activeItem?.url || "");
              const isVideo = isHighlightVideo(mediaUrl);
              const caption = String(activeItem?.storyText || activeItem?.caption || "").trim();
              return (
                <>
                  <div className="profile-highlight-viewer-media">
                    {mediaUrl ? (
                      isVideo ? (
                        <video src={mediaUrl} autoPlay playsInline controls />
                      ) : (
                        <img src={mediaUrl} alt={caption || activeHighlight.title} />
                      )
                    ) : (
                      <div className="profile-highlight-viewer-empty">Story media not available</div>
                    )}
                  </div>
                  {(caption || activeHighlight.title) && (
                    <p className="profile-highlight-viewer-caption">{caption || activeHighlight.title}</p>
                  )}
                  {items.length > 1 && (
                    <div className="profile-highlight-viewer-nav">
                      <button
                        type="button"
                        onClick={() => setActiveHighlightIndex((prev) => Math.max(0, prev - 1))}
                        disabled={activeHighlightIndex <= 0}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveHighlightIndex((prev) => Math.min(items.length - 1, prev + 1))}
                        disabled={activeHighlightIndex >= items.length - 1}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {isOwnProfile && createSheetOpen && (
        <div className="profile-create-backdrop" onClick={closeCreateSheet}>
          <section className="profile-create-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="profile-create-handle" aria-hidden="true" />
            <div className="profile-create-head">
              <h3 className="profile-create-title">Create</h3>
              <p className="profile-create-subtitle">Choose how you want to share today.</p>
            </div>
            <div className="profile-create-grid">
              <button type="button" className="profile-create-card accent-reel" onClick={() => handleCreateAction("reel")}>
                <span className="profile-create-symbol" aria-hidden="true">▶</span>
                <div>
                  <span className="profile-create-label">Reel</span>
                  <small>Short video with music</small>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-post" onClick={() => handleCreateAction("post")}>
                <span className="profile-create-symbol" aria-hidden="true">▦</span>
                <div>
                  <span className="profile-create-label">Post</span>
                  <small>Photo or long video</small>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-story" onClick={() => handleCreateAction("story")}>
                <span className="profile-create-symbol" aria-hidden="true">◌</span>
                <div>
                  <span className="profile-create-label">Story</span>
                  <small>24 hour updates</small>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-highlights" onClick={() => handleCreateAction("highlights")}>
                <span className="profile-create-symbol" aria-hidden="true">✦</span>
                <div>
                  <span className="profile-create-label">Highlights</span>
                  <small>Pin your best moments</small>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-live" onClick={() => handleCreateAction("live")}>
                <span className="profile-create-symbol" aria-hidden="true">◎</span>
                <div>
                  <span className="profile-create-label">Live</span>
                  <small>Go live with your audience</small>
                </div>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}








