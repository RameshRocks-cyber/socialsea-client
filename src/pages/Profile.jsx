import { useEffect, useRef, useState } from "react";
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiBookOpen, FiEdit, FiFilm, FiImage, FiLock, FiMessageSquare, FiRadio, FiStar, FiVideo } from "react-icons/fi";
import api from "../api/axios";
import { useQueryClient } from "@tanstack/react-query";
import { profilePageQueryKey } from "../api/queryKeys";
import { toApiUrl } from "../api/baseUrl";
import { clearAuthStorage } from "../auth";
import { SETTINGS_KEY } from "./soundPrefs";
import { getJobsByOwner, removeCompanyJob } from "../data/jobStore";
import { recordRecentlyDeleted } from "../services/activityStore";
import { resolveFollowStateFromResponse, syncCurrentViewerFollowRelation } from "../services/followSync";
import { useProfilePageQuery } from "./hooks/useProfilePageQuery";
import { VOLO_UPDATE_EVENT, isVoloOwnedByIdentity, readAllVolos, readVoloIdentity } from "../services/voloStorage";
import { getPublicDisplayName } from "../utils/displayName";
import { resolvePostImageUrl } from "../utils/mediaUrl";
import { getProfileIdentifier } from "../utils/profileRoute";
import anonymousFeedSymbol from "../assets/anonymous-feed-symbol.svg";
import "./Profile.css";

const HIDDEN_PROFILE_POSTS_KEY = "socialsea_hidden_profile_posts_v1";
const PROFILE_CACHE_KEY = "socialsea_profile_cache_v1";
const HIGHLIGHTS_STORAGE_KEY = "socialsea_highlights_v1";
const MAX_SHORT_VIDEO_SECONDS = 90;

const profileMediaTokenForPost = (post) => {
  const postId = String(post?.id ?? "").trim();
  if (postId) return `id:${postId}`;
  const mediaUrl = String(post?.contentUrl || "").trim();
  if (mediaUrl) return `media:${mediaUrl}`;
  return "";
};

const readJobMode = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed?.jobMode === "post" || parsed?.jobMode === "profile" || parsed?.jobMode === "off" || parsed?.jobMode === "storage") {
      return parsed.jobMode;
    }
    if (typeof parsed?.showJobsOnProfile === "boolean") {
      return parsed.showJobsOnProfile ? "profile" : "off";
    }
    return "profile";
  } catch {
    return "profile";
  }
};

const readShowMyStoriesOnProfile = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed?.showMyStoriesOnProfile === "boolean") {
      return parsed.showMyStoriesOnProfile;
    }
    return true;
  } catch {
    return true;
  }
};

const readShowAnonymousShortcutsOnProfile = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed?.showAnonymousShortcutsOnProfile === "boolean") {
      return parsed.showAnonymousShortcutsOnProfile;
    }
    return true;
  } catch {
    return true;
  }
};

const readLongVideosEnabled = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (typeof parsed?.longVideosEnabled === "boolean") {
      return parsed.longVideosEnabled;
    }
    if (typeof parsed?.longVideoEnabled === "boolean") {
      return parsed.longVideoEnabled;
    }
    return false;
  } catch {
    return false;
  }
};

const readVoloEnabled = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return Boolean(parsed?.voloEnabled);
  } catch {
    return false;
  }
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
  const myUsername = sessionStorage.getItem("username") || localStorage.getItem("username");
  const normalizedRouteUsername = String(username || "").trim().toLowerCase();
  const normalizedMyUserId = String(myUserId || "").trim().toLowerCase();
  const normalizedMyEmail = String(myEmail || "").trim().toLowerCase();
  const normalizedMyUsername = String(myUsername || "").trim().toLowerCase();
  const isOwnRouteRequest =
    normalizedRouteUsername === "me" ||
    (normalizedMyUserId && normalizedRouteUsername === normalizedMyUserId) ||
    (normalizedMyUsername && normalizedRouteUsername === normalizedMyUsername) ||
    (normalizedMyEmail && normalizedRouteUsername === normalizedMyEmail);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [error, setError] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [followError, setFollowError] = useState("");
  const [postActionError, setPostActionError] = useState("");
  const [coverImageBroken, setCoverImageBroken] = useState(false);
  const [deletingPostIds, setDeletingPostIds] = useState({});
  const [postOptionsPost, setPostOptionsPost] = useState(null);
  const [videoMetaByPost, setVideoMetaByPost] = useState({});
  const [profileTab, setProfileTab] = useState("posts");
  const [companyJobs, setCompanyJobs] = useState([]);
  const [jobMode, setJobMode] = useState(() => readJobMode());
  const [showMyStoriesOnProfile, setShowMyStoriesOnProfile] = useState(() => readShowMyStoriesOnProfile());
  const [showAnonymousShortcutsOnProfile, setShowAnonymousShortcutsOnProfile] = useState(() =>
    readShowAnonymousShortcutsOnProfile()
  );
  const [longVideosEnabled, setLongVideosEnabled] = useState(() => readLongVideosEnabled());
  const [voloEnabled, setVoloEnabled] = useState(() => readVoloEnabled());
  const [volos, setVolos] = useState([]);
  const [postSublistOpen, setPostSublistOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [highlights, setHighlights] = useState(() => readHighlights());
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState(0);
  const [profileMediaViewerOpen, setProfileMediaViewerOpen] = useState(false);
  const [activeProfileMediaToken, setActiveProfileMediaToken] = useState("");
  const holdTimerRef = useRef(null);
  const suppressClickPostIdRef = useRef(null);
  const suppressClickTimerRef = useRef(null);
  const profileRouteKey = getProfileIdentifier(profile, username) || String(username || "me");
  const profileCacheKey = String(username || "").trim().toLowerCase();
  const profileQuery = useProfilePageQuery({
    username,
    isOwnRouteRequest,
    myUserId,
    myEmail
  });

  const isOwnProfile =
    isOwnRouteRequest ||
    String(profile?.id || "").trim().toLowerCase() === normalizedMyUserId;
  const openFollowConnections = (kind) => {
    const baseIdentifier = getProfileIdentifier(profile, username) || String(username || "me");
    navigate(`/profile/${encodeURIComponent(baseIdentifier)}/${kind}`);
  };

  useEffect(() => {
    const refreshFromSettings = () => {
      setJobMode(readJobMode());
      setShowMyStoriesOnProfile(readShowMyStoriesOnProfile());
      setShowAnonymousShortcutsOnProfile(readShowAnonymousShortcutsOnProfile());
      setLongVideosEnabled(readLongVideosEnabled());
      setVoloEnabled(readVoloEnabled());
    };
    const handleStorage = (event) => {
      if (event?.key === SETTINGS_KEY) {
        refreshFromSettings();
      }
    };
    window.addEventListener("ss-settings-update", refreshFromSettings);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("ss-settings-update", refreshFromSettings);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!isOwnProfile || jobMode !== "profile") return;
    setCompanyJobs(getJobsByOwner(profileRouteKey));
  }, [isOwnProfile, profileRouteKey, jobMode]);

  useEffect(() => {
    const loadVolos = () => {
      const all = readAllVolos();
      const profileIdentity = isOwnProfile
        ? readVoloIdentity()
        : {
            userId: String(profile?.id || "").trim().toLowerCase(),
            email: String(profile?.email || "").trim().toLowerCase(),
            username: String(profile?.username || username || "").trim().toLowerCase()
          };
      setVolos(all.filter((item) => isVoloOwnedByIdentity(item, profileIdentity)));
    };
    loadVolos();
    const onUpdate = () => loadVolos();
    const onStorage = (event) => {
      if (!event || event.key === "socialsea_volos_v1") {
        loadVolos();
      }
    };
    window.addEventListener(VOLO_UPDATE_EVENT, onUpdate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(VOLO_UPDATE_EVENT, onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, [isOwnProfile, profile?.id, profile?.email, profile?.username, username]);

  useEffect(() => {
    if (profileQuery.data) return;
    setError("");
    setPostActionError("");
    setFollowError("");
    setProfile(null);
    setPosts([]);
    setPostsLoaded(false);
    setFollowers(0);
    setFollowingCount(0);
    setIsFollowing(false);
    setRequested(false);
  }, [profileCacheKey, profileQuery.data]);

  useEffect(() => {
    const data = profileQuery.data;
    if (!data) return;

    if (data.authError) {
      setProfile(null);
      setPosts([]);
      setPostsLoaded(false);
      setFollowers(0);
      setFollowingCount(0);
      setIsFollowing(false);
      setRequested(false);
      setError(data.errorMessage || "Session expired");
      navigate("/login");
      return;
    }

    setError(data.errorMessage || "");
    setPostActionError("");
    setFollowError("");
    setProfile(data.profile || null);
    setPosts(Array.isArray(data.posts) ? data.posts : []);
    setPostsLoaded(Boolean(data.postsLoaded));
    setFollowers(Number(data.followers || 0));
    setFollowingCount(Number(data.followingCount || 0));
    setIsFollowing(Boolean(data.isFollowing));
    setRequested(Boolean(data.requested));

    if (data.redirectTo) {
      navigate(data.redirectTo, { replace: true });
    }
  }, [navigate, profileQuery.data]);

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
      const res = await api({ method, url: `/api/follow/${encodeURIComponent(followKey)}` });
      const nextState = method === "DELETE" ? "not_following" : resolveFollowStateFromResponse(res, "following");
      const requestedNow = nextState === "requested";
      const nextFollowing = nextState === "following";
      const messageText = String(res?.data?.message || res?.data || "").toLowerCase();
      const countDelta =
        method === "DELETE"
          ? (isFollowing ? -1 : 0)
          : (nextFollowing && !isFollowing && !messageText.includes("already following") ? 1 : 0);
      const nextFollowers = Math.max(0, followers + countDelta);
      setIsFollowing(nextFollowing);
      setRequested(requestedNow);
      setFollowers(nextFollowers);
      syncCurrentViewerFollowRelation({
        targetIdentifiers: [profile?.id, profile?.email, profile?.username, username],
        nextState,
        countDelta
      });
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
    const deletedPost = posts.find((post) => String(post?.id) === String(postId));
    const syncProfileCache = (nextPosts) => {
      if (!profileCacheKey) return;
      const nextProfileSnapshot = {
        profile,
        posts: nextPosts,
        followers,
        followingCount,
        isFollowing,
        requested,
        postsLoaded: true,
        errorMessage: "",
        authError: false,
        redirectTo: null
      };
      writeProfileCacheByKey(profileCacheKey, nextProfileSnapshot);
      queryClient.setQueryData(profilePageQueryKey(profileCacheKey), nextProfileSnapshot);
    };

    setPostActionError("");
    setDeletingPostIds((prev) => ({ ...prev, [postId]: true }));

    const defaultBase = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
    const baseCandidates = [
      defaultBase,
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "/api"
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
          setPosts((prev) => {
            const next = prev.filter((p) => String(p?.id) !== String(postId));
            syncProfileCache(next);
            return next;
          });
          setPostOptionsPost((current) => (String(current?.id || "") === String(postId) ? null : current));
          setDeletingPostIds((prev) => ({ ...prev, [postId]: false }));
          recordRecentlyDeleted({ item: deletedPost, source: "profile" });
          return;
        } catch (err) {
          lastError = err;
        }
      }
    }

    const status = lastError?.response?.status;
    const msg = lastError?.response?.data?.message || lastError?.message || "Unable to delete post";
    persistHiddenProfilePostId(postId);
    setPosts((prev) => {
      const next = prev.filter((p) => String(p?.id) !== String(postId));
      syncProfileCache(next);
      return next;
    });
    setPostOptionsPost((current) => (String(current?.id || "") === String(postId) ? null : current));
    recordRecentlyDeleted({ item: deletedPost, source: "profile" });
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
    const raw = String(url).trim();
    if (!raw) return "";
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("blob:") ||
      raw.startsWith("data:")
    ) {
      return raw;
    }
    if (raw.startsWith("/default-avatar") || raw.startsWith("/assets/")) {
      return raw;
    }
    return toApiUrl(url);
  };

  const openProfileMediaViewer = (post) => {
    const token = profileMediaTokenForPost(post);
    if (!token) return;
    setActiveProfileMediaToken(token);
    setProfileMediaViewerOpen(true);
  };

  const closeProfileMediaViewer = () => {
    setProfileMediaViewerOpen(false);
    setActiveProfileMediaToken("");
  };

  const profileMediaCarouselPosts = posts.filter((post) => Boolean(String(post?.contentUrl || "").trim()));

  const stepProfileMediaViewer = useCallback(
    (offset) => {
      if (!profileMediaCarouselPosts.length) return;
      const currentIndex = profileMediaCarouselPosts.findIndex(
        (post) => profileMediaTokenForPost(post) === activeProfileMediaToken
      );
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = Math.min(
        profileMediaCarouselPosts.length - 1,
        Math.max(0, safeCurrentIndex + offset)
      );
      const nextToken = profileMediaTokenForPost(profileMediaCarouselPosts[nextIndex]);
      if (!nextToken) return;
      setActiveProfileMediaToken(nextToken);
    },
    [activeProfileMediaToken, profileMediaCarouselPosts]
  );

  const openPostInPlayer = (post) => {
    if (!post) return;
    if (!post?.isVideo) {
      openProfileMediaViewer(post);
      return;
    }
    const postId = String(post?.id || "").trim();
    if (!postId) return;
    const profileContext = String(
      profile?.id || profile?.username || profile?.email || profileRouteKey || username || ""
    ).trim();
    const queryParams = new URLSearchParams();
    queryParams.set("post", postId);
    if (profileContext) queryParams.set("profile", profileContext);
    const query = queryParams.toString();
    const openClips = () => navigate(query ? `/clips?${query}` : "/clips");
    const openWatch = () =>
      navigate(query ? `/watch/${encodeURIComponent(postId)}?${query}` : `/watch/${encodeURIComponent(postId)}`);
    const bucket = String(post?.profileFeedBucket || "").trim();
    if (bucket === "reels") {
      openClips();
      return;
    }
    if (bucket === "videos") {
      openWatch();
      return;
    }
    const measured = videoMetaByPost[postId] || {};
    const measuredDuration = Number(measured?.duration || 0);
    const measuredWidth = Number(measured?.width || 0);
    const measuredHeight = Number(measured?.height || 0);
    const isMeasuredPortrait = measuredWidth > 0 && measuredHeight > 0 && measuredHeight > measuredWidth;
    const isMeasuredShort = measuredDuration > 0 && measuredDuration <= MAX_SHORT_VIDEO_SECONDS;
    if (post?.isShortVideo || isMeasuredShort || isMeasuredPortrait) {
      openClips();
      return;
    }
    openWatch();
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

  const clearSuppressClickTimer = () => {
    if (suppressClickTimerRef.current) {
      clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
  };

  const openPostOptions = (post) => {
    if (!isOwnProfile || !post) return;
    setPostOptionsPost(post);
  };

  const closePostOptions = () => {
    setPostOptionsPost(null);
  };

  const handleCardPointerDown = (event, post) => {
    if (!isOwnProfile || !post) return;
    const postId = String(post?.id ?? "").trim();
    if (!postId) return;
    if (typeof event?.button === "number" && event.button !== 0) return;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      suppressClickPostIdRef.current = postId;
      clearSuppressClickTimer();
      suppressClickTimerRef.current = setTimeout(() => {
        suppressClickPostIdRef.current = null;
      }, 1200);
      openPostOptions(post);
    }, 450);
  };

  const handleCardPointerEnd = () => {
    clearHoldTimer();
  };

  const handleCardClick = (event, post) => {
    const postId = String(post?.id ?? "").trim();
    if (postId && String(suppressClickPostIdRef.current || "") === postId) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickPostIdRef.current = null;
      clearSuppressClickTimer();
      return;
    }
    openPostInPlayer(post);
  };

  const handleCardContextMenu = (event, post) => {
    if (!isOwnProfile || !post) return;
    event.preventDefault();
    event.stopPropagation();
    openPostOptions(post);
  };

  useEffect(() => () => {
    clearHoldTimer();
    clearSuppressClickTimer();
  }, []);

  const logout = () => {
    clearAuthStorage();
    navigate("/login");
  };

  const reels = posts.filter((post) => post?.profileFeedBucket === "reels");
  const longVideos = posts.filter((post) => post?.profileFeedBucket === "videos");
  const imagePosts = posts.filter((post) => post?.profileFeedBucket !== "reels" && post?.profileFeedBucket !== "videos");
  const voloPosts = Array.isArray(volos) ? volos : [];
  const showLongVideosOnProfile = !isOwnProfile || longVideosEnabled;
  const hideClipsForVoloMode = Boolean(isOwnProfile && voloEnabled);
  const activeProfileTab =
    !showLongVideosOnProfile && profileTab === "long-videos"
      ? "posts"
      : profileTab;
  const visiblePosts =
    activeProfileTab === "reels" ? reels : activeProfileTab === "long-videos" ? longVideos : activeProfileTab === "posts" ? imagePosts : [];
  const activeProfileMediaIndex = profileMediaCarouselPosts.findIndex(
    (post) => profileMediaTokenForPost(post) === activeProfileMediaToken
  );
  const resolvedActiveProfileMediaIndex = activeProfileMediaIndex >= 0 ? activeProfileMediaIndex : 0;
  const activeProfileMediaPost =
    profileMediaViewerOpen && profileMediaCarouselPosts.length > 0
      ? profileMediaCarouselPosts[resolvedActiveProfileMediaIndex]
      : null;
  const loadedPostsCount = (imagePosts?.length || 0) + (reels?.length || 0) + (longVideos?.length || 0);
  const emptyTabMessage =
    activeProfileTab === "reels"
      ? "No clips yet"
      : activeProfileTab === "long-videos"
        ? "No videos yet"
        : activeProfileTab === "volo"
          ? "No volos yet"
          : "No posts yet";
  const postsCount = postsLoaded
    ? loadedPostsCount
    : Number.isFinite(Number(profile?.postsCount)) && Number(profile?.postsCount) >= 0
      ? Number(profile?.postsCount)
      : Number.isFinite(Number(profile?.posts)) && Number(profile?.posts) >= 0
        ? Number(profile?.posts)
        : loadedPostsCount;
  const isPrivateLocked = Boolean(profile?.privateAccount) && profile?.canViewContent === false && !isOwnProfile;
  const resolvedDisplayName = getPublicDisplayName(profile);
  const displayName = resolvedDisplayName === "User" ? "Profile" : resolvedDisplayName;
  const coverRaw =
    profile?.coverUrl ||
    profile?.coverPhotoUrl ||
    profile?.profileCoverUrl ||
    "";
  const fallbackCover = profile?.profilePicUrl || "/default-avatar.png";
  const coverResolved = coverRaw ? resolveMediaUrl(coverRaw) : resolveMediaUrl(fallbackCover);
  const storedCoverBust =
    typeof window !== "undefined"
      ? sessionStorage.getItem("profile_cover_bust") || localStorage.getItem("profile_cover_bust")
      : "";
  const coverBust = String(
    profile?.coverUpdatedAt || profile?.coverUpdated || profile?.updatedAt || profile?.updated || storedCoverBust || ""
  ).trim();
  const coverUrl =
    coverRaw && coverBust
      ? `${coverResolved}${coverResolved.includes("?") ? "&" : "?"}v=${encodeURIComponent(coverBust)}`
      : coverResolved;
  useEffect(() => {
    if (!showLongVideosOnProfile && profileTab === "long-videos") {
      setProfileTab("posts");
    }
  }, [profileTab, showLongVideosOnProfile]);

  useEffect(() => {
    setCoverImageBroken(false);
  }, [coverUrl]);

  useEffect(() => {
    if (!profileMediaViewerOpen) return;
    if (!profileMediaCarouselPosts.length) {
      closeProfileMediaViewer();
      return;
    }
    if (activeProfileMediaIndex >= 0) return;
    const fallbackToken = profileMediaTokenForPost(profileMediaCarouselPosts[0]);
    if (fallbackToken) {
      setActiveProfileMediaToken(fallbackToken);
      return;
    }
    closeProfileMediaViewer();
  }, [activeProfileMediaIndex, profileMediaCarouselPosts, profileMediaViewerOpen]);

  useEffect(() => {
    if (!profileMediaViewerOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeProfileMediaViewer();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepProfileMediaViewer(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepProfileMediaViewer(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [profileMediaViewerOpen, activeProfileMediaToken, profileMediaCarouselPosts, stepProfileMediaViewer]);

  const openCreateSheet = () => {
    setCreateSheetOpen(true);
  };

  const closeCreateSheet = () => {
    setCreateSheetOpen(false);
  };

  const handleCreateAction = (kind) => {
    closeCreateSheet();
    if (kind === "post") {
      navigate("/upload?type=post");
      return;
    }
    if (kind === "reel") {
      navigate("/upload?type=clip");
      return;
    }
    if (kind === "long-video") {
      if (!longVideosEnabled) return;
      navigate("/upload?type=long-video");
      return;
    }
    if (kind === "volo") {
      navigate("/volo?compose=1");
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

  const handleRemoveJob = (jobId) => {
    removeCompanyJob(jobId);
    setCompanyJobs((prev) => prev.filter((job) => job.id !== jobId));
  };

  const visibleCompanyJobs = companyJobs.slice(0, 3);

  const showJobsOnProfile = jobMode === "profile";
  const showPostJobOnProfile = jobMode === "post";
  const showActionPanelLeft = showJobsOnProfile || showPostJobOnProfile;

  return (
    <div className="profile-page">
      {error && <div>{error}</div>}
      {!error && !profile && <div>Loading...</div>}

      {!error && profile && (
        <>
                    <div className="profile-layout">
            <div className="profile-sidebar">
                <section className="profile-hero">
                <div className="profile-cover">
                  <img
                    src={coverImageBroken ? "/default-avatar.png" : coverUrl}
                    alt="Profile cover"
                    className="profile-cover-img"
                    onError={() => setCoverImageBroken(true)}
                  />
                  {isOwnProfile && (
                    <button
                      type="button"
                      className="profile-cover-settings-btn"
                      onClick={() => navigate("/settings")}
                      title="Open Settings"
                      aria-label="Open Settings"
                    >
                      <span />
                      <span />
                      <span />
                    </button>
                  )}
                  <div className="profile-avatar-wrap">
                    <img
                      src={resolveMediaUrl(profile?.profilePicUrl || "/default-avatar.png")}
                      alt={displayName}
                      className="profile-avatar"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = "/default-avatar.png";
                      }}
                    />
                  </div>
                </div>

                <div className="profile-identity">
                  <h1 className="profile-name">{displayName}</h1>
                </div>

                <div className="profile-stats-row">
                  <button
                    type="button"
                    className="profile-stat-card"
                    onClick={() => openFollowConnections("followers")}
                    aria-label={`Open ${followers} followers`}
                    title="Open followers list"
                  >
                    <b>{followers}</b>
                    <span>Followers</span>
                  </button>
                  <button
                    type="button"
                    className="profile-stat-card"
                    onClick={() => openFollowConnections("following")}
                    aria-label={`Open ${followingCount} following`}
                    title="Open following list"
                  >
                    <b>{followingCount}</b>
                    <span>Following</span>
                  </button>
                  <div className="profile-stat-card">
                    <b>{postsCount}</b>
                    <span>Posts</span>
                  </div>
                  {isOwnProfile && (
                    <>
                      <button
                        type="button"
                        className="profile-stat-card profile-stat-card-vault"
                        onClick={() => navigate("/storage/unlock")}
                        title="Storage Vault"
                      >
                        <b className="profile-stat-icon-wrap" aria-hidden="true">
                          <FiLock />
                        </b>
                        <span>Vault</span>
                      </button>
                      <button
                        type="button"
                        className="profile-stat-card profile-stat-card-create"
                        onClick={openCreateSheet}
                        title="Create"
                      >
                        <b className="profile-stat-icon-wrap" aria-hidden="true">
                          <FiEdit />
                        </b>
                        <span>Create</span>
                      </button>
                    </>
                  )}
                </div>

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
              </section>
            {isOwnProfile && showActionPanelLeft && (
              <section className="profile-action-panel is-jobs-hidden">
                {showActionPanelLeft && (
                  <div className="profile-action-panel-left">
                    {showJobsOnProfile && (
                      <>
                        <div className="profile-job-grid">
                          <button type="button" className="profile-job-button" onClick={() => navigate("/jobs")}>
                            <span>Jobs</span>
                            <small>Company roles and open listings</small>
                          </button>
                          <button type="button" className="profile-job-button" onClick={() => navigate("/job-notifications")}>
                            <span>Job Notifications</span>
                            <small>Matches based on your skills</small>
                          </button>
                          <button
                            type="button"
                            className="profile-job-button profile-job-button-wide"
                            onClick={() => navigate("/job-profile")}
                          >
                            <span>Job Profile</span>
                            <small>Resume view of studies, skills, projects</small>
                          </button>
                        </div>

                        <div className="profile-job-list">
                          {visibleCompanyJobs.length === 0 ? (
                            <p className="profile-job-empty">No jobs posted yet.</p>
                          ) : (
                            visibleCompanyJobs.map((job) => (
                              <div key={job.id} className="profile-job-item">
                                <div>
                                  <h4>{job.title || "Job Role"}</h4>
                                  <small>
                                    {[job.location, job.salary].filter(Boolean).join(" - ") || "Details pending"}
                                  </small>
                                </div>
                                <div className="profile-job-item-actions">
                                  <button
                                    type="button"
                                    className="profile-job-link"
                                    onClick={() => navigate(`/jobs/${job.id}`)}
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    className="profile-job-remove"
                                    onClick={() => handleRemoveJob(job.id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}

                    {showPostJobOnProfile && (
                      <div className="profile-job-grid">
                        <button
                          type="button"
                          className="profile-job-button profile-job-button-wide"
                          onClick={() => navigate("/post-job?mode=job")}
                        >
                          <span>Post a Job</span>
                          <small>Create a new job opening</small>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
            {isOwnProfile && (
              <section className="profile-shortcuts">
                <div
                  className={`profile-anonymous-shortcuts${showAnonymousShortcutsOnProfile ? "" : " profile-anonymous-shortcuts-single"}`}
                >
                  {showAnonymousShortcutsOnProfile && (
                    <>
                      <button
                        type="button"
                        className="profile-shortcut-card profile-shortcut-card-compact profile-anonymous-shortcut-text profile-anonymous-feed-shortcut"
                        onClick={() => navigate("/anonymous-feed")}
                      >
                        <span className="profile-anonymous-feed-icon-wrap" aria-hidden="true">
                          <img src={anonymousFeedSymbol} alt="" className="profile-anonymous-feed-icon" />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="profile-shortcut-card profile-shortcut-card-compact profile-anonymous-shortcut-text"
                        onClick={() => navigate("/anonymous/upload")}
                      >
                        <div>
                          <h4>Anonymous Upload</h4>
                        </div>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="profile-shortcut-card profile-shortcut-card-compact profile-anonymous-shortcut-text"
                    onClick={() => navigate("/live-recordings")}
                  >
                    <div>
                      <h4>Private Live</h4>
                    </div>
                  </button>
                </div>
                <div className="profile-post-sublist-toggle-block">
                  {postSublistOpen && (
                    <div id="profile-post-sublist" className="profile-post-sublist-vertical" role="tablist" aria-label="Profile post filters">
                      <button
                        type="button"
                        className={`profile-post-subitem ${profileTab === "posts" ? "is-active" : ""}`}
                        onClick={() => setProfileTab("posts")}
                        role="tab"
                        aria-selected={profileTab === "posts"}
                      >
                        Posts ({imagePosts.length})
                      </button>
                      <button
                        type="button"
                        className={`profile-post-subitem ${profileTab === "reels" ? "is-active" : ""}`}
                        onClick={() => setProfileTab("reels")}
                        role="tab"
                        aria-selected={profileTab === "reels"}
                      >
                        Clips ({reels.length})
                      </button>
                      <button
                        type="button"
                        className={`profile-post-subitem ${profileTab === "volo" ? "is-active" : ""}`}
                        onClick={() => setProfileTab("volo")}
                        role="tab"
                        aria-selected={profileTab === "volo"}
                      >
                        Volo ({voloPosts.length})
                      </button>
                      {showLongVideosOnProfile && (
                        <button
                          type="button"
                          className={`profile-post-subitem ${profileTab === "long-videos" ? "is-active" : ""}`}
                          onClick={() => setProfileTab("long-videos")}
                          role="tab"
                          aria-selected={profileTab === "long-videos"}
                        >
                          Videos ({longVideos.length})
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`profile-post-sublist-toggle${postSublistOpen ? " is-open" : ""}`}
                    onClick={() => setPostSublistOpen((prev) => !prev)}
                    aria-expanded={postSublistOpen}
                    aria-controls="profile-post-sublist"
                    title={postSublistOpen ? "Hide post tabs" : "Show post tabs"}
                  >
                    <span className="profile-post-sublist-toggle-glyph" aria-hidden="true">
                      ○
                    </span>
                  </button>
                </div>
                {showMyStoriesOnProfile && (
                  <button type="button" className="profile-shortcut-card" onClick={() => navigate("/stories")}>
                    <div>
                      <h4>My Stories</h4>
                      <p>See all your stories saved in one place.</p>
                    </div>
                  </button>
                )}
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
                          Ãƒâ€”
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          
            </div>
            <div className="profile-main">
            {!isOwnProfile && (
              <div className="profile-posts-head">
                <div
                  className={`profile-post-tabs ${showLongVideosOnProfile ? "is-four-tabs" : "is-three-tabs"}`.trim()}
                  role="tablist"
                  aria-label="Profile post filters"
                >
                  <button
                    type="button"
                    className={`profile-post-tab ${profileTab === "posts" ? "is-active" : ""}`}
                    onClick={() => setProfileTab("posts")}
                    role="tab"
                    aria-selected={profileTab === "posts"}
                  >
                    Posts ({imagePosts.length})
                  </button>
                  <button
                    type="button"
                    className={`profile-post-tab ${profileTab === "reels" ? "is-active" : ""}`}
                    onClick={() => setProfileTab("reels")}
                    role="tab"
                    aria-selected={profileTab === "reels"}
                  >
                    Clips ({reels.length})
                  </button>
                  <button
                    type="button"
                    className={`profile-post-tab ${profileTab === "volo" ? "is-active" : ""}`}
                    onClick={() => setProfileTab("volo")}
                    role="tab"
                    aria-selected={profileTab === "volo"}
                  >
                    Volo ({voloPosts.length})
                  </button>
                  {showLongVideosOnProfile && (
                    <button
                      type="button"
                      className={`profile-post-tab ${profileTab === "long-videos" ? "is-active" : ""}`}
                      onClick={() => setProfileTab("long-videos")}
                      role="tab"
                      aria-selected={profileTab === "long-videos"}
                    >
                      Videos ({longVideos.length})
                    </button>
                  )}
                </div>
              </div>
            )}
            {postActionError && <p className="profile-posts-error">{postActionError}</p>}
            {isPrivateLocked && (
              <div className="profile-private-note">
                {showLongVideosOnProfile
                  ? hideClipsForVoloMode
                    ? "This account is private. Follow to see posts, volos, and videos."
                    : "This account is private. Follow to see posts, clips, volos, and videos."
                  : hideClipsForVoloMode
                    ? "This account is private. Follow to see posts and volos."
                    : "This account is private. Follow to see posts, clips, and volos."}
              </div>
            )}
            {activeProfileTab === "volo" ? (
              <div className="profile-volo-list">
                {voloPosts.length === 0 && <p>{emptyTabMessage}</p>}
                {voloPosts.map((volo) => (
                  <article key={volo.id} className="profile-volo-card">
                    <header className="profile-volo-card-head">
                      <b>{volo?.owner?.name || volo?.owner?.username || "User"}</b>
                      <time>{volo?.createdAt ? new Date(volo.createdAt).toLocaleString() : "Now"}</time>
                    </header>
                    {volo?.text && <p className="profile-volo-copy">{volo.text}</p>}
                    {Array.isArray(volo?.links) && volo.links.length > 0 && (
                      <div className="profile-volo-links">
                        {volo.links.map((url) => (
                          <a key={`${volo.id}-${url}`} href={url} target="_blank" rel="noreferrer">
                            {url}
                          </a>
                        ))}
                      </div>
                    )}
                    {Array.isArray(volo?.media) && volo.media.length > 0 && (
                      <div className="profile-volo-media">
                        {volo.media.map((asset, index) =>
                          asset.type === "video" ? (
                            <video
                              key={`${volo.id}-video-${index}`}
                              src={asset.url}
                              controls
                              preload="metadata"
                              playsInline
                            />
                          ) : (
                            <img key={`${volo.id}-img-${index}`} src={asset.url} alt="Volo attachment" loading="lazy" decoding="async" />
                          )
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="profile-posts-grid">
                {visiblePosts.length === 0 && (
                  <p>{emptyTabMessage}</p>
                )}
                {visiblePosts.map((post, index) => (
                  <div
                    key={`${String(post?.id ?? "post")}-${index}`}
                    className={`profile-post-card ${post?.isVideo ? "is-playable" : ""} ${isOwnProfile ? "is-actionable" : ""}`.trim()}
                    onClick={(event) => handleCardClick(event, post)}
                    onContextMenu={(event) => handleCardContextMenu(event, post)}
                    onPointerDown={(event) => handleCardPointerDown(event, post)}
                    onPointerUp={handleCardPointerEnd}
                    onPointerCancel={handleCardPointerEnd}
                    onPointerLeave={handleCardPointerEnd}
                  >
                    {!post.isVideo && post.contentUrl?.trim() && (
                      <img src={resolvePostImageUrl(post, "thumbnail") || resolveMediaUrl(post.contentUrl)} alt="" loading="lazy" decoding="async" />
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
                  </div>
                ))}
              </div>
            )}

            {isOwnProfile && (
              <button className="logout-btn-profile" onClick={logout}>
                Logout
              </button>
            )}
            </div>
          </div>
          </>
        )}


      {profileMediaViewerOpen && activeProfileMediaPost && (
        <div className="profile-media-viewer-backdrop" onClick={closeProfileMediaViewer}>
          <div className="profile-media-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="profile-media-viewer-close" onClick={closeProfileMediaViewer}>
              Close
            </button>
            <div className="profile-media-viewer-media">
              {activeProfileMediaPost?.isVideo ? (
                <video
                  src={resolveMediaUrl(activeProfileMediaPost.contentUrl)}
                  autoPlay
                  playsInline
                  controls
                  preload="metadata"
                />
              ) : (
                <img src={resolvePostImageUrl(activeProfileMediaPost, "original") || resolveMediaUrl(activeProfileMediaPost.contentUrl)} alt="" decoding="async" />
              )}
            </div>
            {profileMediaCarouselPosts.length > 1 && (
              <div className="profile-media-viewer-nav">
                <button
                  type="button"
                  onClick={() => stepProfileMediaViewer(-1)}
                  disabled={resolvedActiveProfileMediaIndex <= 0}
                >
                  Prev
                </button>
                <span className="profile-media-viewer-count">
                  {resolvedActiveProfileMediaIndex + 1} / {profileMediaCarouselPosts.length}
                </span>
                <button
                  type="button"
                  onClick={() => stepProfileMediaViewer(1)}
                  disabled={resolvedActiveProfileMediaIndex >= profileMediaCarouselPosts.length - 1}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeHighlight && activeHighlight?.items?.length > 0 && (
        <div className="profile-highlight-viewer-backdrop" onClick={closeHighlight}>
          <div className="profile-highlight-viewer" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="profile-highlight-viewer-close" onClick={closeHighlight}>
              Ãƒâ€”
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
                        <img src={mediaUrl} alt={caption || activeHighlight.title} loading="lazy" decoding="async" />
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
            </div>
            <div className="profile-create-grid">
              <button type="button" className="profile-create-card accent-reel" onClick={() => handleCreateAction("reel")}>
                <span className='profile-create-symbol' aria-hidden='true'>
                  <FiVideo />
                </span>
                <div>
                  <span className="profile-create-label">Clip</span>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-post" onClick={() => handleCreateAction("post")}>
                <span className='profile-create-symbol' aria-hidden='true'>
                  <FiImage />
                </span>
                <div>
                  <span className="profile-create-label">Post</span>
                </div>
              </button>
              {longVideosEnabled && (
                <button type="button" className="profile-create-card accent-long-video" onClick={() => handleCreateAction("long-video")}>
                  <span className='profile-create-symbol' aria-hidden='true'>
                    <FiFilm />
                  </span>
                  <div>
                    <span className="profile-create-label">Long Video</span>
                  </div>
                </button>
              )}
              <button type="button" className="profile-create-card accent-volo" onClick={() => handleCreateAction("volo")}>
                <span className='profile-create-symbol' aria-hidden='true'>
                  <FiMessageSquare />
                </span>
                <div>
                  <span className="profile-create-label">Volo</span>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-story" onClick={() => handleCreateAction("story")}>
                <span className='profile-create-symbol' aria-hidden='true'>
                  <FiBookOpen />
                </span>
                <div>
                  <span className="profile-create-label">Story</span>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-highlights" onClick={() => handleCreateAction("highlights")}>
                <span className='profile-create-symbol' aria-hidden='true'>
                  <FiStar />
                </span>
                <div>
                  <span className="profile-create-label">Highlights</span>
                </div>
              </button>
              <button type="button" className="profile-create-card accent-live" onClick={() => handleCreateAction("live")}>
                <span className='profile-create-symbol' aria-hidden='true'>
                  <FiRadio />
                </span>
                <div>
                  <span className="profile-create-label">Live</span>
                </div>
              </button>
            </div>
          </section>
        </div>
      )}

      {isOwnProfile && postOptionsPost && (
        <div className="profile-post-options-backdrop" onClick={closePostOptions}>
          <section className="profile-post-options-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="profile-create-handle" aria-hidden="true" />
            <div className="profile-post-options-head">
              <h3 className="profile-post-options-title">Options</h3>
            </div>
            <div className="profile-post-options-actions">
              <button
                type="button"
                className="profile-post-options-btn"
                onClick={() => {
                  const selected = postOptionsPost;
                  closePostOptions();
                  openPostInPlayer(selected);
                }}
              >
                View
              </button>
              <button
                type="button"
                className="profile-post-options-btn danger"
                onClick={() => {
                  const selectedId = postOptionsPost?.id;
                  closePostOptions();
                  deletePost(selectedId);
                }}
                disabled={Boolean(deletingPostIds[postOptionsPost?.id])}
              >
                {deletingPostIds[postOptionsPost?.id] ? "Deleting..." : "Delete"}
              </button>
              <button type="button" className="profile-post-options-btn ghost" onClick={closePostOptions}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
