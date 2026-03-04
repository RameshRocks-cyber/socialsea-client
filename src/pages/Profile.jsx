import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { toApiUrl } from "../api/baseUrl";
import { clearAuthStorage } from "../auth";
import "./Profile.css";

const FOLLOWING_CACHE_KEY = "socialsea_following_cache_v1";

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

const requestWithTimeout = (path, timeoutMs = 4500) =>
  Promise.race([
    api.get(path),
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

export default function Profile() {
  const { username } = useParams();
  const myUserId = localStorage.getItem("userId");
  const myEmail = localStorage.getItem("email");
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [requested] = useState(false);
  const [followError, setFollowError] = useState("");

  const isOwnProfile =
    username === "me" || Number(username) === Number(myUserId) || profile?.id === Number(myUserId);

  useEffect(() => {
    let cancelled = false;
    setError("");
    setProfile(null);

    if (!username) {
      setError("User not found");
      return undefined;
    }

    const loadProfile = async () => {
      try {
        const res = await api.get(`/api/profile/${username}`);
        if (cancelled) return;
        const data = res.data?.user || res.data || {};
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
          res.data?.followers ??
          res.data?.followersCount ??
          0
        ) || 0;
        setFollowers(Math.max(0, followerCount));

        // Fallback: if API profile payload does not include following relationship,
        // infer it from viewer's following list.
        if (extracted === null && !isOwnProfile && myUserId) {
          const viewerCandidates = [myUserId, myEmail].filter(Boolean);
          const targetId = String(data?.id || "").trim();
          const paths = viewerCandidates
            .flatMap((id) => getPathCandidates(id, "following"))
            .filter((path, index, arr) => arr.indexOf(path) === index);
          const responses = await Promise.allSettled(paths.map((path) => requestWithTimeout(path)));
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
      } catch (err) {
        console.error(err);
        if (err?.response?.status === 401) {
          navigate("/login");
          return;
        }
        if (!cancelled) setError("User not found");
      }
    };

    const loadPosts = async () => {
      try {
        const res = await api.get(`/api/profile/${username}/posts`);
        if (!cancelled) setPosts(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setPosts([]);
      }
    };

    loadProfile();
    loadPosts();
    return () => {
      cancelled = true;
    };
  }, [username, navigate, isOwnProfile, myUserId, myEmail]);

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

  const resolveMediaUrl = (url) => {
    if (!url) return "";
    return toApiUrl(url);
  };

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
                  <b>{profile.following}</b> following
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
              <button type="button" className="profile-shortcut-card" onClick={() => navigate("/profile/live-recordings")}>
                <h4>Recorded Live (Private)</h4>
                <p>View SOS recorded live videos. These are private and not shared in feed.</p>
              </button>
            </section>
          )}

          <hr className="profile-divider" />

          <h3 className="profile-posts-title">Posts</h3>
          <div className="profile-posts-grid">
            {posts.length === 0 && <p>No posts yet</p>}
            {posts.map((post) => (
              <div key={post.id} className="profile-post-card">
                {post.type === "IMAGE" && post.contentUrl?.trim() && (
                  <img src={resolveMediaUrl(post.contentUrl)} alt="" />
                )}
                {post.type === "VIDEO" && post.contentUrl?.trim() && (
                  <video src={resolveMediaUrl(post.contentUrl)} controls />
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
