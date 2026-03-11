import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { clearAuthStorage } from "../auth";
import "./Profile.css";

const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";
const HIDDEN_PROFILE_POSTS_KEY = "socialsea_hidden_profile_posts_v1";
const PROFILE_CACHE_KEY = "socialsea_profile_cache_v1";
const PROFILE_REQ_TIMEOUT_MS = 2500;
const POSTS_REQ_TIMEOUT_MS = 2500;
const FOLLOWING_REQ_TIMEOUT_MS = 1800;

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

export default function Profile() {
  const { username } = useParams();
  const myUserId = sessionStorage.getItem("userId") || localStorage.getItem("userId");
  const myEmail = sessionStorage.getItem("email") || localStorage.getItem("email");
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
  const holdTimerRef = useRef(null);
  const deleteRevealHideTimerRef = useRef(null);

  const isOwnProfile =
    username === "me" || Number(username) === Number(myUserId) || profile?.id === Number(myUserId);

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
          const typeRaw = String(post?.type || post?.mediaType || post?.mimeType || "").toLowerCase();
            const isVideo =
              post?.reel === true ||
              typeRaw.includes("video") ||
              /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(contentUrl);
            return { ...post, contentUrl, isVideo };
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
              navigate("/profile/me", { replace: true });
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
  }, [username, navigate, myUserId, myEmail]);

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
                  onClick={() => navigate(`/profile/${username}/followers`)}
                >
                  <b>{followers}</b> followers
                </button>
                <span className="profile-stat-dot">|</span>
                <button
                  type="button"
                  className="profile-stat-link"
                  onClick={() => navigate(`/profile/${username}/following`)}
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
                  <button className="profile-cta profile-cta-upload" onClick={() => navigate("/upload")}>
                    Add Post
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
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/chat")}>
                <h4>Messages</h4>
                <p>Continue conversations and find people faster.</p>
              </button>
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/live-recordings")}>
                <h4>Recorded Live (Private)</h4>
                <p>View SOS recorded live videos. These are private and not shared in feed.</p>
              </button>
            </section>
          )}

          <hr className="profile-divider" />

          <h3 className="profile-posts-title">Posts</h3>
          {postActionError && <p className="profile-posts-error">{postActionError}</p>}
          <div className="profile-posts-grid">
            {posts.length === 0 && <p>No posts yet</p>}
            {posts.map((post, index) => (
              <div
                key={`${String(post?.id ?? "post")}-${index}`}
                className={`profile-post-card ${String(deleteRevealPostId || "") === String(post?.id || "") ? "is-delete-visible" : ""}`}
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
                    playsInline
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
    </div>
  );
}








